import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry, IncomingRequestInfo } from '../components/WeeklyGrid'
import TimetablePrintHeader from '../components/TimetablePrintHeader'
import { FACULTY_TIMES } from '../components/TimetablePreview'
import SubstitutionInbox from '../components/SubstitutionInbox'
import {
  createSubstitutionRequest,
  getLectureTemporalStatus,
  getHeldLectureDate,
  toLocalDateString,
  isSubstitutionDayPast,
  SessionInfo,
  sweepAllExpiredRequests,
  tryFinaliseRequest,
} from '../lib/substitution'
import { useNavigate } from 'react-router-dom'
import {
  CalendarIcon,
  UsersIcon,
  InboxIcon,
  SendIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  MapPinIcon,
  XIcon,
  RefreshIcon,
  LogOutIcon,
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
  date?: string | null
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
  date?: string | null
}

interface OutgoingRequestInfo {
  id: string
  status: 'open' | 'assigned' | 'unfilled' | 'expired'
  created_at: string
  deadline: string
  reason: string | null
  course_code: string
  course_name: string
  section_name: string
  day_of_week: number
  period: number
  starts_at: string
  ends_at: string
  assigned_name: string | null
  is_past_day: boolean
  candidates: {
    faculty_id: string
    faculty_name: string
    priority: number
    response: 'pending' | 'accepted' | 'rejected'
  }[]
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function FacultyView() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }
  const [rows, setRows] = useState<Row[]>([])
  const [facultyMeta, setFacultyMeta] = useState<{ name: string; email: string; departmentName?: string } | null>(null)
  const [dispatchedSubs, setDispatchedSubs] = useState<Map<string, DispatchedSub>>(new Map())
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequestInfo[]>([])
  const [coveringSubs, setCoveringSubs] = useState<CoveringSub[]>([])
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequestInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [busyIncomingId, setBusyIncomingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedule' | 'request' | 'inbox'>('schedule')
  const [requestModalSession, setRequestModalSession] = useState<Row | null>(null)
  const [requestReason, setRequestReason] = useState('')
  const [outgoingFilter, setOutgoingFilter] = useState<'active' | 'past'>('active')

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

      // 0. Fetch faculty profile & department name for print header
      supabase
        .from('faculty')
        .select('name, email, departments(name)')
        .eq('id', fId)
        .maybeSingle()
        .then(({ data: facData }: any) => {
          if (facData) {
            setFacultyMeta({
              name: facData.name,
              email: facData.email,
              departmentName: facData.departments?.name ?? undefined,
            })
          }
        })

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

      // 2. Fetch dispatched substitution requests by this faculty (with details for outgoing requests list)
      const { data: mySubs } = await supabase
        .from('substitution_requests')
        .select(`
          id, timetable_entry_id, status, assigned_faculty_id, created_at, deadline, reason,
          assigned_faculty:faculty!substitution_requests_assigned_faculty_id_fkey(name),
          timetable_entries(
            courses(code, name), sections(name),
            time_slots(day_of_week, period, starts_at, ends_at)
          ),
          substitution_candidates(
            faculty_id, priority, response,
            faculty(name)
          )
        `)
        .eq('requester_faculty_id', fId)
        .order('created_at', { ascending: false })

      const subMap = new Map<string, DispatchedSub>()
      const outList: OutgoingRequestInfo[] = []
      for (const s of (mySubs ?? []) as any[]) {
        const te = s.timetable_entries
        const ts = te?.time_slots

        // The held lecture date is when the lecture takes place (day-of or advance tomorrow)
        const heldDate = ts?.day_of_week ? getHeldLectureDate(ts.day_of_week, s.created_at) : null
        const heldDateStr = heldDate ? toLocalDateString(heldDate) : null

        const isPastDay = ts?.day_of_week ? isSubstitutionDayPast(ts.day_of_week, s.created_at) : false

        // Only overlay active (today or upcoming) substitutions onto the weekly timetable grid
        if (s.timetable_entry_id && !isPastDay && !subMap.has(s.timetable_entry_id)) {
          subMap.set(s.timetable_entry_id, {
            id: s.id,
            timetable_entry_id: s.timetable_entry_id,
            status: s.status,
            assigned_name: s.assigned_faculty?.name ?? null,
            date: heldDateStr,
          })
        }
        const cands = (s.substitution_candidates ?? []).map((c: any) => ({
          faculty_id: c.faculty_id,
          faculty_name: c.faculty?.name ?? 'Faculty',
          priority: c.priority,
          response: c.response,
        }))

        outList.push({
          id: s.id,
          status: s.status,
          created_at: s.created_at,
          deadline: s.deadline,
          reason: s.reason,
          course_code: te?.courses?.code ?? '—',
          course_name: te?.courses?.name ?? '—',
          section_name: te?.sections?.name ?? '—',
          day_of_week: ts?.day_of_week ?? 0,
          period: ts?.period ?? 0,
          starts_at: ts?.starts_at ? ts.starts_at.slice(0, 5) : '',
          ends_at: ts?.ends_at ? ts.ends_at.slice(0, 5) : '',
          assigned_name: s.assigned_faculty?.name ?? null,
          is_past_day: isPastDay,
          candidates: cands,
        })
      }
      setDispatchedSubs(subMap)
      setOutgoingRequests(outList)

      // 3. Fetch substitutions this faculty has accepted to cover for colleagues
      const { data: coveringData } = await supabase
        .from('substitution_requests')
        .select(`
          id, status, requester_faculty_id, created_at,
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
          // Reset covering slot once the lecture's day has ended
          if (isSubstitutionDayPast(te.time_slots.day_of_week, c.created_at)) continue

          const heldDate = getHeldLectureDate(te.time_slots.day_of_week, c.created_at)
          const heldDateStr = heldDate ? toLocalDateString(heldDate) : null

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
            date: heldDateStr,
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

    // Re-validate eligibility at submit time (defence-in-depth)
    const { isEligible, isPast } = getLectureTemporalStatus(
      requestModalSession.time_slots.day_of_week,
      requestModalSession.time_slots.starts_at,
    )
    if (!isEligible) {
      setError(
        isPast
          ? 'Cannot dispatch: this lecture has already commenced or passed.'
          : 'Cannot dispatch: substitution requests can only be sent the day before or on the day of the lecture.',
      )
      setRequestModalSession(null)
      return
    }

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
    if (!found || !found.time_slots) return

    // Policy guard: only allow opening modal for eligible sessions
    const { isEligible } = getLectureTemporalStatus(found.time_slots.day_of_week, found.time_slots.starts_at)
    if (!isEligible) {
      setError(
        `Substitution requests can only be dispatched the day before or on the day of the lecture (before it commences). Monday's lecture is not eligible today.`,
      )
      return
    }

    setRequestModalSession(found)
    setRequestReason('')
  }

  // 1. Convert own teaching sessions to grid entries
  const ownGridEntries: GridEntry[] = rows.map((r) => {
    const sub = dispatchedSubs.get(r.id)
    const temporalStatus = r.time_slots
      ? getLectureTemporalStatus(r.time_slots.day_of_week, r.time_slots.starts_at)
      : null

    return {
      id: r.id,
      day_of_week: r.time_slots?.day_of_week ?? 0,
      period: r.time_slots?.period ?? 0,
      starts_at: r.time_slots?.starts_at,
      can_request: temporalStatus?.isEligible ?? false,
      is_advance: temporalStatus?.isAdvanceRequest ?? false,
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
            date: sub.date,
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
      date: c.date,
    },
  }))

  const allGridEntries = [...ownGridEntries, ...coveringGridEntries]

  return (
    <div className="faculty-cal-wrapper">
      {/* Top Navigation & Fast Actions Bar */}
      <div className="admin-cal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="admin-cal-logo" title="Timetable Scheduler">
              TS
            </div>
            <div className="portal-role-badge">
              <span className="portal-role-dot faculty"></span>
              <span>Faculty</span>
            </div>
          </div>

          <div className="admin-cal-nav">
            <button
              type="button"
              className={activeTab === 'schedule' ? 'on' : ''}
              onClick={() => setActiveTab('schedule')}
            >
              Teaching Timetable
            </button>
            <button
              type="button"
              className={activeTab === 'request' ? 'on' : ''}
              onClick={() => setActiveTab('request')}
            >
              Request Coverage
            </button>
            <button
              type="button"
              className={activeTab === 'inbox' ? 'on' : ''}
              onClick={() => setActiveTab('inbox')}
            >
              Coverage Inbox {incomingRequests.length > 0 ? `(${incomingRequests.length})` : ''}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {incomingRequests.length > 0 && activeTab !== 'inbox' && (
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className="admin-btn admin-btn-sm"
              style={{ background: '#FFB900', color: '#1C1917' }}
            >
              <InboxIcon size={14} />
              <span>{incomingRequests.length} Pending Requests</span>
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={loadData}
            title="Refresh teaching timetable"
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={() => window.print()}
            title="Print teaching timetable & course roster"
          >
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="admin-btn admin-btn-outline"
            title="Sign out of Faculty Portal"
          >
            <LogOutIcon size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          className="no-print"
          style={{
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            fontSize: 13,
            color: '#991B1B',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          className="no-print"
          style={{
            padding: 12,
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 8,
            fontSize: 13,
            color: '#065F46',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircleIcon size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* Tab 1: Interactive Teaching Timetable */}
      {activeTab === 'schedule' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Quick Overview Cards: Incoming Invitations & Outgoing Requests */}
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* Incoming Coverage Requests Card */}
            <div className="admin-panel" style={{ margin: 0 }}>
              <div className="admin-panel-hd">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <InboxIcon size={16} style={{ color: '#92400E' }} />
                  <h2>Incoming Coverage Requests</h2>
                </div>
                {incomingRequests.length > 0 && (
                  <span className="admin-tag open">
                    {incomingRequests.length} pending
                  </span>
                )}
              </div>

              {incomingRequests.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#78716C', fontSize: 13 }}>
                  No incoming coverage requests from colleagues at this time.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {incomingRequests.slice(0, 3).map((inc) => {
                    const isBusy = busyIncomingId === inc.candidate_id
                    return (
                      <div
                        key={inc.candidate_id}
                        className="admin-req-card"
                        style={{ margin: 0, padding: 12 }}
                      >
                        <div className="admin-req-badge-box open" style={{ minWidth: 100 }}>
                          <b>{inc.course_code}</b>
                          <span>Sec {inc.section_name}</span>
                          <span className="admin-m" style={{ marginTop: 6, fontSize: 11 }}>
                            {DAYS[inc.day_of_week]?.slice(0, 3)} P{inc.period}
                          </span>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <b style={{ color: '#1C1917', fontSize: 13 }}>{inc.requester_name}</b>
                              <div style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>
                                {inc.course_name} {inc.room_name ? `· ${inc.room_name}` : ''}
                              </div>
                            </div>
                            <span className="admin-cand-pill winner" title="Priority rank">
                              <em>P{inc.priority}</em>
                              <span>Match</span>
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                            <span className="admin-mu admin-m" style={{ fontSize: 11 }}>
                              Expires {new Date(inc.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                disabled={Boolean(busyIncomingId)}
                                onClick={() => handleAcceptIncoming(inc.candidate_id, inc.request_id, inc.deadline)}
                                className="admin-btn admin-btn-primary admin-btn-sm"
                                style={{ padding: '0 10px', height: 28, fontSize: 12 }}
                              >
                                <CheckCircleIcon size={13} />
                                <span>{isBusy ? '...' : 'Accept'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(busyIncomingId)}
                                onClick={() => handleRejectIncoming(inc.candidate_id, inc.request_id, inc.deadline)}
                                className="admin-btn admin-btn-outline admin-btn-sm"
                                style={{ padding: '0 8px', height: 28, fontSize: 12 }}
                              >
                                <XIcon size={13} />
                                <span>Decline</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {incomingRequests.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('inbox')}
                      className="admin-btn admin-btn-outline admin-btn-sm"
                      style={{ alignSelf: 'flex-start', marginTop: 4 }}
                    >
                      View all {incomingRequests.length} incoming requests →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Outgoing Requests Card */}
            <div className="admin-panel" style={{ margin: 0 }}>
              <div className="admin-panel-hd">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SendIcon size={16} style={{ color: '#FFB900' }} />
                    <h2>Outgoing Coverage Requests</h2>
                  </div>
                  <div style={{ display: 'inline-flex', gap: 6, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setOutgoingFilter('active')}
                      className={`admin-btn admin-btn-sm ${outgoingFilter === 'active' ? '' : 'admin-btn-outline'}`}
                      style={{ fontSize: 11, height: 24, padding: '0 8px' }}
                    >
                      Active ({outgoingRequests.filter((r) => !r.is_past_day && r.status !== 'expired' && r.status !== 'unfilled').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutgoingFilter('past')}
                      className={`admin-btn admin-btn-sm ${outgoingFilter === 'past' ? '' : 'admin-btn-outline'}`}
                      style={{ fontSize: 11, height: 24, padding: '0 8px' }}
                    >
                      Past / Expired ({outgoingRequests.filter((r) => r.is_past_day || r.status === 'expired' || r.status === 'unfilled').length})
                    </button>
                  </div>
                </div>
                {outgoingRequests.length > 0 && (
                  <span className="admin-tag">
                    {outgoingRequests.length} total
                  </span>
                )}
              </div>

              {(() => {
                const displayedOutgoing = outgoingRequests.filter((r) =>
                  outgoingFilter === 'active'
                    ? !r.is_past_day && r.status !== 'expired' && r.status !== 'unfilled'
                    : r.is_past_day || r.status === 'expired' || r.status === 'unfilled'
                )

                if (displayedOutgoing.length === 0) {
                  return (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#78716C', fontSize: 13 }}>
                      {outgoingFilter === 'active'
                        ? 'No active coverage requests for today or upcoming lectures.'
                        : 'No past or expired coverage requests in history.'}
                    </div>
                  )
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {displayedOutgoing.slice(0, 4).map((out) => {
                      const isAssigned = out.status === 'assigned'
                      const isExpired = out.status === 'expired' || out.status === 'unfilled'
                      const isOpen = out.status === 'open'

                      return (
                        <div
                          key={out.id}
                          className="admin-req-card"
                          style={{ margin: 0, padding: 12 }}
                        >
                          <div
                            className={`admin-req-badge-box ${
                              isAssigned ? 'assigned' : isOpen ? 'open' : 'unfilled'
                            }`}
                            style={{ minWidth: 100 }}
                          >
                            <b>{out.course_code}</b>
                            <span>Sec {out.section_name}</span>
                            <span className="admin-m" style={{ marginTop: 6, fontSize: 11 }}>
                              {DAYS[out.day_of_week]?.slice(0, 3)} P{out.period}
                            </span>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                              <div>
                                <b style={{ color: '#1C1917', fontSize: 13 }}>{out.course_name}</b>
                                {out.reason && (
                                  <div className="admin-mu" style={{ fontSize: 12, marginTop: 2 }}>
                                    Reason: {out.reason}
                                  </div>
                                )}
                              </div>
                              <span
                                className={`admin-tag ${
                                  isAssigned ? 'assigned' : isOpen ? 'open' : 'unfilled'
                                }`}
                              >
                                {isAssigned
                                  ? out.is_past_day
                                    ? `Completed · Covered by ${out.assigned_name ?? 'Colleague'}`
                                    : `Covered by ${out.assigned_name ?? 'Colleague'}`
                                  : isExpired
                                  ? 'Expired (No substitute assigned)'
                                  : isOpen
                                  ? 'Searching substitute'
                                  : 'Unfilled / Free'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                              <span className="admin-mu admin-m" style={{ fontSize: 11 }}>
                                {out.starts_at && out.ends_at ? `${out.starts_at}–${out.ends_at} · ` : ''}
                                {out.is_past_day
                                  ? 'Day Ended'
                                  : `Deadline ${new Date(out.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              </span>

                              {out.candidates.length > 0 && (
                                <div className="admin-cands-wrap" style={{ margin: 0 }}>
                                  {out.candidates.slice(0, 3).map((cand) => (
                                    <div
                                      key={cand.faculty_id}
                                      className={`admin-cand-pill ${
                                        out.assigned_name === cand.faculty_name
                                          ? 'winner'
                                          : cand.response === 'accepted'
                                          ? 'accepted'
                                          : cand.response === 'rejected' || (cand as any).response === 'timed_out'
                                          ? 'rejected'
                                          : ''
                                      }`}
                                      style={{ fontSize: 10, padding: '1px 6px' }}
                                    >
                                      <em>P{cand.priority}</em>
                                      <span>{cand.faculty_name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {displayedOutgoing.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('request')}
                        className="admin-btn admin-btn-outline admin-btn-sm"
                        style={{ alignSelf: 'flex-start', marginTop: 4 }}
                      >
                        View all {displayedOutgoing.length} {outgoingFilter} requests →
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Legend Guide */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.65rem 1rem',
              marginBottom: '0.85rem',
              background: '#FAFAF9',
              border: '1px solid #E7E5E4',
              borderRadius: '8px',
              fontSize: '0.825rem',
            }}
          >
            <span style={{ fontWeight: 700, color: '#44403C' }}>
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
            <div className="card-header no-print">
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

            <div className="tt-print-area">
              <TimetablePrintHeader
                mode="faculty"
                facultyName={facultyMeta?.name}
                facultyEmail={facultyMeta?.email}
                departmentName={facultyMeta?.departmentName}
              />

              <WeeklyGrid
                entries={allGridEntries}
                viewMode="faculty"
                allPeriods={[1, 2, 3, 4, 5, 6, 7, 8]}
                slotTimes={FACULTY_TIMES}
                highlightOngoing={true}
                onRequestSubstitution={handleOpenRequestModal}
                incomingRequests={incomingRequests}
                onAcceptRequest={handleAcceptIncoming}
                onRejectRequest={handleRejectIncoming}
                actionBusyId={busyIncomingId}
              />
            </div>
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

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0.65rem 0.9rem',
                backgroundColor: '#EFF6FF',
                color: '#1e40af',
                border: '1px solid #BFDBFE',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.84rem',
                marginTop: '0.5rem',
              }}
            >
              <AlertCircleIcon size={17} style={{ color: '#3B82F6', flexShrink: 0 }} />
              <span>
                <strong>Coverage Request Policy:</strong> You may request substitution{' '}
                <strong>the day before</strong> or <strong>on the same day</strong> as the lecture,
                before it commences. The deadline for candidates to respond is always 10 minutes after the lecture starts.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
            {rows.map((r) => {
              const status = r.time_slots
                ? getLectureTemporalStatus(r.time_slots.day_of_week, r.time_slots.starts_at)
                : { isEligible: false, isAdvanceRequest: false, isToday: false, isPast: true, lectureDate: new Date(), reasonMessage: 'No slot data' }

              const canRequest = status.isEligible
              const existingSub = dispatchedSubs.get(r.id)

              // Compute lecture date string for display
              const lectureDateStr = status.lectureDate
                ? status.lectureDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                : ''

              // Compute deadline string (lecture_start + 10 min on the lecture date)
              const deadlineDate = status.lectureDate ? new Date(status.lectureDate.getTime() + 10 * 60 * 1000) : null
              const deadlineStr = deadlineDate
                ? deadlineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''

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
                      ? status.isAdvanceRequest
                        ? '4px solid #292524'
                        : '4px solid #FFB900'
                      : undefined,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className={`badge ${status.isToday ? 'badge-primary' : status.isAdvanceRequest ? 'badge-neutral' : 'badge-neutral'}`}>
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
                      ) : status.isAdvanceRequest ? (
                        <span className="badge" style={{ fontSize: '0.7rem', background: '#FEF3C7', color: '#92400E', fontWeight: 700 }}>
                          📅 Advance Request
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
                          Unavailable
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                      {r.courses?.code}
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--slate-700)', marginBottom: '0.75rem' }}>
                      {r.courses?.name}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', marginBottom: canRequest ? '0.6rem' : '1.25rem' }}>
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

                    {/* Date + deadline row for eligible sessions */}
                    {canRequest && !existingSub && (
                      <div style={{ fontSize: '0.74rem', color: status.isAdvanceRequest ? '#292524' : '#92400E', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <ClockIcon size={12} />
                        <span>
                          {status.isAdvanceRequest ? '📅 ' : ''}
                          Lecture: <strong>{lectureDateStr}</strong>
                          {deadlineStr ? ` · Deadline: ${deadlineStr}` : ''}
                        </span>
                      </div>
                    )}
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
                      className={`btn ${!existingSub && canRequest ? (status.isAdvanceRequest ? 'btn-secondary' : 'btn-primary') : 'btn-secondary'} btn-sm`}
                      style={{
                        width: '100%',
                        ...(canRequest && status.isAdvanceRequest && !existingSub ? { background: '#292524', color: '#FFB900', borderColor: '#292524' } : {}),
                      }}
                    >
                      <UsersIcon size={14} />
                      <span>
                        {existingSub
                          ? `Substitution ${existingSub.status}`
                          : canRequest
                          ? status.isAdvanceRequest
                            ? 'Request Advance Substitute'
                            : 'Request Substitute'
                          : 'Not Available Yet'}
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
      {requestModalSession && (() => {
        const modalStatus = requestModalSession.time_slots
          ? getLectureTemporalStatus(requestModalSession.time_slots.day_of_week, requestModalSession.time_slots.starts_at)
          : null
        const modalIsAdvance = modalStatus?.isAdvanceRequest ?? false
        const modalLectureDateStr = modalStatus?.lectureDate
          ? modalStatus.lectureDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          : ''
        const modalDeadlineDate = modalStatus?.lectureDate
          ? new Date(modalStatus.lectureDate.getTime() + 10 * 60 * 1000)
          : null
        const modalDeadlineStr = modalDeadlineDate
          ? modalDeadlineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : ''

        return (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setRequestModalSession(null)}>
            <div className="modal-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                      Request Lecture Substitution
                    </h3>
                    {modalStatus?.isEligible ? (
                      modalIsAdvance ? (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#292524', color: '#FFB900', padding: '2px 8px', borderRadius: 99 }}>
                          📅 Advance Request (Tomorrow)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 99 }}>
                          ⚡ Same-Day Request (Today)
                        </span>
                      )
                    ) : (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: 99 }}>
                        🚫 Not Eligible
                      </span>
                    )}
                  </div>
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

              {/* Lecture details block */}
              <div style={{ padding: '0.75rem 1rem', background: modalIsAdvance ? '#FFFBEB' : 'var(--slate-50)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem', border: `1px solid ${modalIsAdvance ? '#FDE68A' : 'var(--border-light)'}` }}>
                <div style={{ fontWeight: 700, color: 'var(--slate-800)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ClockIcon size={15} style={{ color: modalIsAdvance ? '#292524' : '#92400E' }} />
                  <span>
                    {DAYS[requestModalSession.time_slots?.day_of_week ?? 0]} · Period {requestModalSession.time_slots?.period}
                    {' '}({requestModalSession.time_slots?.starts_at.slice(0, 5)})
                  </span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    📅 Lecture date: <strong style={{ color: 'var(--slate-800)' }}>{modalLectureDateStr}</strong>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    📍 Location: {requestModalSession.rooms?.name}
                  </div>
                  {modalDeadlineStr && (
                    <div style={{ fontSize: '0.78rem', color: modalIsAdvance ? '#292524' : '#854d0e', fontWeight: 600, marginTop: 2 }}>
                      ⏱ Candidates must respond by <strong>{modalDeadlineStr}</strong> on {modalIsAdvance ? 'the lecture date' : 'today'}
                    </div>
                  )}
                </div>
              </div>

              {/* Advance request info banner */}
              {modalIsAdvance && (
                <div style={{ padding: '0.6rem 0.9rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: '#92400E', marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0 }}>📅</span>
                  <span>
                    This is an <strong>advance substitution request</strong>. Colleagues will be notified immediately and can accept or decline before the lecture begins.
                  </span>
                </div>
              )}

              {/* Not eligible warning banner */}
              {modalStatus && !modalStatus.isEligible && (
                <div style={{ padding: '0.65rem 0.9rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: '#991B1B', marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertCircleIcon size={16} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Policy Restriction:</strong> {modalStatus.reasonMessage ?? 'This lecture cannot be requested right now.'} Requests are only allowed <strong>one day before</strong> or <strong>on the same day</strong> before commencement.
                  </div>
                </div>
              )}

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
                    disabled={Boolean(busy) || !modalStatus?.isEligible}
                    className="btn btn-primary"
                    style={
                      !modalStatus?.isEligible
                        ? { opacity: 0.5, cursor: 'not-allowed' }
                        : modalIsAdvance
                        ? { background: '#292524', borderColor: '#292524', color: '#FFB900' }
                        : {}
                    }
                  >
                    <UsersIcon size={16} />
                    <span>
                      {busy
                        ? 'Dispatching…'
                        : !modalStatus?.isEligible
                        ? 'Unavailable (Policy Restriction)'
                        : modalIsAdvance
                        ? 'Dispatch Advance Request'
                        : 'Dispatch Substitution Request'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
