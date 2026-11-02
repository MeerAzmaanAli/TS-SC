import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry, IncomingRequestInfo } from '../components/WeeklyGrid'
import SubstitutionInbox from '../components/SubstitutionInbox'
import {
  BYPASS_DAY_OF_POLICY,
  createSubstitutionRequest,
  getLectureTemporalStatus,
  SessionInfo,
  sweepAllExpiredRequests,
  tryFinaliseRequest,
} from '../lib/substitution'
import {
  CalendarIcon,
  UsersIcon,
  InboxIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  MapPinIcon,
  XIcon,
} from '../components/Icons'

interface Row {
  id: string
  is_elective: boolean
  batch?: number | null
  section_id: string
  course_id: string
  time_slot_id: string
  courses: { code: string; name: string } | null
  rooms: { name: string } | null
  sections: { name: string } | null
  time_slots: { day_of_week: number; period: number; starts_at: string; ends_at?: string } | null
}

interface DispatchedSub {
  id: string
  timetable_entry_id: string
  status: 'open' | 'assigned' | 'unfilled' | 'expired'
  assigned_name?: string | null
}

interface CoveringSub {
  id: string
  day_of_week: number
  period: number
  course_code: string
  course_name: string
  room_name: string
  section_name: string
  is_elective: boolean
  batch?: number | null
  requester_name: string
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function FacultyView() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [dispatchedSubs, setDispatchedSubs] = useState<Map<string, DispatchedSub>>(new Map())
  const [coveringSubs, setCoveringSubs] = useState<CoveringSub[]>([])
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequestInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [busyIncomingId, setBusyIncomingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedule' | 'request' | 'inbox'>('schedule')
  const [requestModalSession, setRequestModalSession] = useState<Row | null>(null)
  const [requestReason, setRequestReason] = useState('')

  const loadData = useCallback(async () => {
    if (!profile?.faculty_id) return
    const fId = profile.faculty_id

    // Sweep open requests
    sweepAllExpiredRequests().catch((err) => console.warn('Automatic sweep error:', err))

    try {
      const { data: ver, error: vErr } = await supabase
        .from('timetable_versions')
        .select('id')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(1)
        .single()

      if (vErr || !ver) {
        setError('No published timetable currently active.')
        return
      }
      const vId = ver.id

      // 1. Fetch own teaching sessions
      const res = await supabase
        .from('timetable_entries')
        .select(
          'id, batch, is_elective, section_id, course_id, time_slot_id, ' +
            'courses(code, name), rooms(name), sections(name), ' +
            'time_slots(day_of_week, period, starts_at, ends_at)',
        )
        .eq('version_id', vId)
        .eq('faculty_id', fId)

      const rawData = (res.data ?? []) as any[]
      // Sort rows chronologically (Monday Period 1 -> Friday Period 6)
      rawData.sort((a, b) => {
        const dayDiff = (a.time_slots?.day_of_week ?? 0) - (b.time_slots?.day_of_week ?? 0)
        if (dayDiff !== 0) return dayDiff
        return (a.time_slots?.period ?? 0) - (b.time_slots?.period ?? 0)
      })
      setRows(rawData as Row[])

      // 2. Fetch dispatched substitution requests by this faculty
      const { data: mySubs } = await supabase
        .from('substitution_requests')
        .select(`
          id, timetable_entry_id, status, assigned_faculty_id,
          faculty!substitution_requests_assigned_faculty_id_fkey(name)
        `)
        .eq('requester_faculty_id', fId)

      const subMap = new Map<string, DispatchedSub>()
      for (const s of (mySubs ?? []) as any[]) {
        if (s.timetable_entry_id) {
          subMap.set(s.timetable_entry_id, {
            id: s.id,
            timetable_entry_id: s.timetable_entry_id,
            status: s.status,
            assigned_name: s.faculty?.name ?? null,
          })
        }
      }
      setDispatchedSubs(subMap)

      // 3. Fetch substitutions this faculty has accepted to cover for colleagues
      const { data: coveringData } = await supabase
        .from('substitution_requests')
        .select(`
          id, status, requester_faculty_id,
          requester:faculty!substitution_requests_requester_faculty_id_fkey(name),
          timetable_entries!inner(
            id, batch, is_elective, section_id, course_id, time_slot_id,
            courses(code, name), rooms(name), sections(name),
            time_slots!inner(day_of_week, period, starts_at, ends_at)
          )
        `)
        .eq('assigned_faculty_id', fId)
        .eq('status', 'assigned')

      const covList: CoveringSub[] = []
      for (const c of (coveringData ?? []) as any[]) {
        const te = c.timetable_entries
        if (te && te.time_slots) {
          covList.push({
            id: c.id,
            day_of_week: te.time_slots.day_of_week,
            period: te.time_slots.period,
            course_code: te.courses?.code ?? '',
            course_name: te.courses?.name ?? '',
            room_name: te.rooms?.name ?? '',
            section_name: te.sections?.name ?? '',
            is_elective: te.is_elective ?? false,
            batch: te.batch ?? null,
            requester_name: c.requester?.name ?? 'Colleague',
          })
        }
      }
      setCoveringSubs(covList)

      // 4. Fetch incoming coverage requests (open candidate invitations)
      const { data: candData } = await supabase
        .from('substitution_candidates')
        .select(`
          id, request_id, priority,
          substitution_requests!inner(
            id, status, deadline, requester_faculty_id,
            faculty!substitution_requests_requester_faculty_id_fkey(name),
            timetable_entries!inner(
              courses(code, name), rooms(name), sections(name),
              time_slots!inner(day_of_week, period, starts_at, ends_at)
            )
          )
        `)
        .eq('faculty_id', fId)
        .eq('response', 'pending')
        .eq('substitution_requests.status', 'open')

      const incList: IncomingRequestInfo[] = []
      for (const cand of (candData ?? []) as any[]) {
        const sr = cand.substitution_requests
        const te = sr?.timetable_entries
        const ts = te?.time_slots
        if (ts) {
          // If deadline hasn't passed
          if (new Date(sr.deadline) > new Date()) {
            incList.push({
              candidate_id: cand.id,
              request_id: cand.request_id,
              priority: cand.priority,
              deadline: sr.deadline,
              course_code: te.courses?.code ?? '',
              course_name: te.courses?.name ?? '',
              requester_name: sr.faculty?.name ?? 'Colleague',
              section_name: te.sections?.name ?? '',
              room_name: te.rooms?.name ?? '',
              day_of_week: ts.day_of_week,
              period: ts.period,
              starts_at: ts.starts_at,
              ends_at: ts.ends_at,
            })
          }
        }
      }
      setIncomingRequests(incList)
    } catch (err) {
      console.error('Failed to load faculty schedule:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [profile])

  useEffect(() => {
    loadData()
    // Polling every 15 seconds to keep substitutions live
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData])

  async function handleConfirmRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.faculty_id || !requestModalSession || !requestModalSession.time_slots) return

    setBusy(requestModalSession.id)
    setError(null)
    setNotice(null)
    try {
      const session: SessionInfo = {
        entryId: requestModalSession.id,
        sectionId: requestModalSession.section_id,
        courseId: requestModalSession.course_id,
        timeSlotId: requestModalSession.time_slot_id,
        dayOfWeek: requestModalSession.time_slots.day_of_week,
        startsAt: requestModalSession.time_slots.starts_at,
      }
      await createSubstitutionRequest(session, profile.faculty_id, requestReason.trim() || undefined)
      setNotice(
        `Coverage request for ${requestModalSession.courses?.code} dispatched to qualified, free faculty colleagues.`,
      )
      setRequestModalSession(null)
      setRequestReason('')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('Dispatch failed:', err)
    } finally {
      setBusy(null)
    }
  }

  async function handleAcceptIncoming(candId: string, requestId: string, deadline: string) {
    if (!profile?.faculty_id) return
    if (new Date() > new Date(deadline)) {
      setError('This substitution request has already passed its deadline and is expired.')
      await tryFinaliseRequest(requestId)
      await loadData()
      return
    }

    setBusyIncomingId(candId)
    setError(null)
    try {
      // 1. Update candidate response
      const { error: cErr } = await supabase
        .from('substitution_candidates')
        .update({ response: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', candId)
      if (cErr) throw cErr

      // 2. Direct atomic RPC resolution
      await supabase.rpc('resolve_substitution_request', {
        p_request_id: requestId,
        p_winner_faculty_id: profile.faculty_id,
      })

      await tryFinaliseRequest(requestId)
      setNotice('Substitution accepted! The session is now officially added to your teaching schedule.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyIncomingId(null)
    }
  }

  async function handleRejectIncoming(candId: string, requestId: string, _deadline: string) {
    setBusyIncomingId(candId)
    setError(null)
    try {
      const { error: cErr } = await supabase
        .from('substitution_candidates')
        .update({ response: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', candId)
      if (cErr) throw cErr

      await tryFinaliseRequest(requestId)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyIncomingId(null)
    }
  }

  function handleOpenRequestModal(entry: GridEntry) {
    const found = rows.find((r) => r.id === entry.id)
    if (found) {
      setRequestModalSession(found)
      setRequestReason('')
    }
  }

  // 1. Convert own teaching sessions to grid entries
  const ownGridEntries: GridEntry[] = rows.map((r) => {
    const sub = dispatchedSubs.get(r.id)
    return {
      id: r.id,
      day_of_week: r.time_slots?.day_of_week ?? 0,
      period: r.time_slots?.period ?? 0,
      course_code: r.courses?.code ?? '',
      course_name: r.courses?.name ?? '',
      room_name: r.rooms?.name ?? '',
      section_name: r.sections?.name ? `${r.sections.name}${r.batch ? ` (B${r.batch})` : ''}` : '',
      is_elective: r.is_elective,
      batch: r.batch,
      substitution: sub
        ? {
            status: sub.status,
            substitute_name: sub.assigned_name,
            role: 'requester',
          }
        : null,
    }
  })

  // 2. Convert covering sessions to grid entries
  const coveringGridEntries: GridEntry[] = coveringSubs.map((c) => ({
    id: `cov-${c.id}`,
    day_of_week: c.day_of_week,
    period: c.period,
    course_code: c.course_code,
    course_name: c.course_name,
    room_name: c.room_name,
    section_name: c.section_name,
    is_elective: c.is_elective,
    batch: c.batch,
    substitution: {
      status: 'assigned',
      requester_name: c.requester_name,
      role: 'covering',
    },
  }))

  const allGridEntries = [...ownGridEntries, ...coveringGridEntries]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CalendarIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>Faculty Academic Portal</span>
          </h1>
          <p className="page-subtitle">
            View your weekly teaching schedule, manage peer substitution coverage, and respond to incoming requests directly on your timetable.
          </p>
        </div>

        <div className="page-header-actions">
          {incomingRequests.length > 0 && (
            <button
              onClick={() => setActiveTab('inbox')}
              className="btn btn-primary btn-sm"
              style={{ position: 'relative' }}
            >
              <InboxIcon size={14} />
              <span>{incomingRequests.length} Pending Coverage Requests</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <CheckCircleIcon size={18} />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <CalendarIcon size={16} />
          <span>My Teaching Timetable</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          <UsersIcon size={16} />
          <span>Request Substitution</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          <InboxIcon size={16} />
          <span>Coverage Inbox {incomingRequests.length > 0 && `(${incomingRequests.length})`}</span>
        </button>
      </div>

      {/* Tab 1: Interactive Teaching Timetable */}
      {activeTab === 'schedule' && (
        <div>
          {/* Legend Guide */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.65rem 1rem',
              marginBottom: '0.85rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.825rem',
            }}
          >
            <span style={{ fontWeight: 700, color: '#334155' }}>
              Timetable Substitution Color Legend:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#854d0e' }}>
                <span style={{ width: 14, height: 14, borderRadius: '4px', background: '#fef08a', border: '1.5px solid #eab308' }} />
                <span>Yellow: Sub Dispatched (Pending)</span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#166534' }}>
                <span style={{ width: 14, height: 14, borderRadius: '4px', background: '#bbf7d0', border: '1.5px solid #22c55e' }} />
                <span>Green: Class Covered by Colleague</span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#0369a1' }}>
                <span style={{ width: 14, height: 14, borderRadius: '4px', background: '#e0f2fe', border: '1.5px solid #38bdf8' }} />
                <span>Cyan: You are Subbing this Class</span>
              </span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#991b1b' }}>
                <span style={{ width: 14, height: 14, borderRadius: '4px', background: '#fecaca', border: '1.5px solid #ef4444' }} />
                <span>Red: Unfilled / Free Period</span>
              </span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 className="card-title">
                <CalendarIcon size={18} style={{ color: 'var(--primary-600)' }} />
                <span>Weekly Teaching Schedule</span>
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge badge-primary">{rows.length} Assigned Lectures</span>
                {coveringSubs.length > 0 && (
                  <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                    +{coveringSubs.length} Covering
                  </span>
                )}
              </div>
            </div>

            <WeeklyGrid
              entries={allGridEntries}
              viewMode="faculty"
              onRequestSubstitution={handleOpenRequestModal}
              incomingRequests={incomingRequests}
              onAcceptRequest={handleAcceptIncoming}
              onRejectRequest={handleRejectIncoming}
              actionBusyId={busyIncomingId}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Chronological Substitution Request List */}
      {activeTab === 'request' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--slate-900)' }}>
                  Chronological Teaching Lectures (Monday – Friday)
                </h2>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  💡 Tip: You can also dispatch coverage requests directly by clicking "Request Sub" on any tile in your Teaching Timetable.
                </p>
              </div>
            </div>

            {BYPASS_DAY_OF_POLICY ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.65rem 0.9rem',
                  backgroundColor: '#FEF3C7',
                  color: '#92400E',
                  border: '1px solid #F59E0B',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.84rem',
                  marginTop: '0.5rem',
                }}
              >
                <AlertCircleIcon size={17} style={{ color: '#D97706', flexShrink: 0 }} />
                <span>
                  <strong>🧪 Testing Mode Active:</strong> Day-of policy is currently{' '}
                  <strong>TURNED OFF</strong>. You can request coverage for <strong>any lecture session</strong> across the entire week regardless of scheduled day or time.
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.65rem 0.9rem',
                  backgroundColor: 'var(--sky-50)',
                  color: 'var(--sky-900)',
                  border: '1px solid var(--sky-200)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.84rem',
                  marginTop: '0.5rem',
                }}
              >
                <AlertCircleIcon size={17} style={{ color: 'var(--sky-600)', flexShrink: 0 }} />
                <span>
                  <strong>Day-of Policy:</strong> Per institutional regulations, substitution requests can{' '}
                  <strong>only be dispatched on the exact day of the lecture</strong> before it commences.
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
            {rows.map((r) => {
              const status = r.time_slots
                ? getLectureTemporalStatus(r.time_slots.day_of_week, r.time_slots.starts_at)
                : { isToday: false, isPast: true, reasonMessage: 'No slot data' }

              const canRequest = status.isToday && !status.isPast
              const existingSub = dispatchedSubs.get(r.id)

              return (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    opacity: canRequest && !existingSub ? 1 : 0.85,
                    borderLeft: existingSub
                      ? existingSub.status === 'assigned'
                        ? '4px solid #16a34a'
                        : existingSub.status === 'open'
                        ? '4px solid #eab308'
                        : '4px solid #dc2626'
                      : canRequest
                      ? '4px solid var(--primary-500)'
                      : undefined,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className={`badge ${status.isToday ? 'badge-primary' : 'badge-neutral'}`}>
                        {DAYS[r.time_slots?.day_of_week ?? 0]} · Period {r.time_slots?.period}
                      </span>
                      {existingSub ? (
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            backgroundColor:
                              existingSub.status === 'assigned'
                                ? '#dcfce7'
                                : existingSub.status === 'open'
                                ? '#fef08a'
                                : '#fee2e2',
                            color:
                              existingSub.status === 'assigned'
                                ? '#15803d'
                                : existingSub.status === 'open'
                                ? '#854d0e'
                                : '#b91c1c',
                          }}
                        >
                          {existingSub.status === 'assigned'
                            ? `Covered by ${existingSub.assigned_name ?? 'Colleague'}`
                            : existingSub.status === 'open'
                            ? 'Request Pending'
                            : 'Unfilled'}
                        </span>
                      ) : BYPASS_DAY_OF_POLICY ? (
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          Ready to Request
                        </span>
                      ) : status.isToday && !status.isPast ? (
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          Today's Lecture
                        </span>
                      ) : status.isPast && status.isToday ? (
                        <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                          Already Passed
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                          Future / Other Day
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                      {r.courses?.code}
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--slate-700)', marginBottom: '0.75rem' }}>
                      {r.courses?.name}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', marginBottom: '1.25rem' }}>
                      <span className="meta-chip room">
                        <MapPinIcon size={12} />
                        <span>{r.rooms?.name}</span>
                      </span>
                      <span className="meta-chip">
                        <span>Section {r.sections?.name}</span>
                      </span>
                      <span className="meta-chip">
                        <ClockIcon size={12} />
                        <span>{r.time_slots?.starts_at ? r.time_slots.starts_at.slice(0, 5) : ''}</span>
                      </span>
                    </div>
                  </div>

                  <div>
                    {!existingSub && !canRequest && status.reasonMessage && (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          marginBottom: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ClockIcon size={12} />
                        <span>{status.reasonMessage}</span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setRequestModalSession(r)
                        setRequestReason('')
                      }}
                      disabled={Boolean(existingSub) || !canRequest}
                      className={`btn ${!existingSub && canRequest ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{ width: '100%' }}
                    >
                      <UsersIcon size={14} />
                      <span>
                        {existingSub
                          ? `Substitution ${existingSub.status}`
                          : canRequest
                          ? 'Request Substitute'
                          : 'Unavailable (Day-Of Only)'}
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}

            {rows.length === 0 && (
              <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem' }}>
                <p className="text-muted">No sessions assigned in active schedule.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Incoming Inbox */}
      {activeTab === 'inbox' && (
        <div>
          {profile?.faculty_id && <SubstitutionInbox facultyId={profile.faculty_id} />}
        </div>
      )}

      {/* Substitution Request Modal Dialog */}
      {requestModalSession && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setRequestModalSession(null)}>
          <div className="modal-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  Request Lecture Substitution
                </h3>
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {requestModalSession.courses?.code} — Section {requestModalSession.sections?.name}
                </p>
              </div>
              <button
                onClick={() => setRequestModalSession(null)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.35rem' }}
              >
                <XIcon size={16} />
              </button>
            </div>

            <div style={{ padding: '0.75rem 1rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600, color: 'var(--slate-800)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ClockIcon size={15} style={{ color: 'var(--primary-600)' }} />
                <span>
                  {DAYS[requestModalSession.time_slots?.day_of_week ?? 0]} · Period {requestModalSession.time_slots?.period} ({requestModalSession.time_slots?.starts_at.slice(0, 5)})
                </span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                Location: {requestModalSession.rooms?.name}
              </div>
            </div>

            <form onSubmit={handleConfirmRequest}>
              <div className="form-group">
                <label className="form-label" htmlFor="reason">
                  Reason for absence / coverage request (optional)
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  className="textarea"
                  placeholder="e.g. Attending departmental seminar, medical leave, academic duty..."
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setRequestModalSession(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(busy)}
                  className="btn btn-primary"
                >
                  <UsersIcon size={16} />
                  <span>{busy ? 'Dispatching…' : 'Dispatch Substitution Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
