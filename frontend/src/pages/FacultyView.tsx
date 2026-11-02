import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry } from '../components/WeeklyGrid'
import SubstitutionInbox from '../components/SubstitutionInbox'
import {
  createSubstitutionRequest,
  getLectureTemporalStatus,
  SessionInfo,
  sweepAllExpiredRequests,
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
  time_slots: { day_of_week: number; period: number; starts_at: string } | null
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function FacultyView() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedule' | 'request' | 'inbox'>('schedule')
  const [requestModalSession, setRequestModalSession] = useState<Row | null>(null)
  const [requestReason, setRequestReason] = useState('')

  useEffect(() => {
    // Automatically sweep and finalize any expired requests across the campus
    sweepAllExpiredRequests().catch((err) => console.warn('Automatic sweep error:', err))
  }, [])

  useEffect(() => {
    if (!profile?.faculty_id) return
    supabase
      .from('timetable_versions')
      .select('id')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .single()
      .then(async ({ data: ver, error: vErr }) => {
        if (vErr || !ver) {
          setError('No published timetable currently active.')
          return
        }
        const vId = (ver as { id: string }).id
        let rawData: unknown[] = []
        const res = await supabase
          .from('timetable_entries')
          .select(
            'id, batch, is_elective, section_id, course_id, time_slot_id, ' +
              'courses(code, name), rooms(name), sections(name), ' +
              'time_slots(day_of_week, period, starts_at)',
          )
          .eq('version_id', vId)
          .eq('faculty_id', profile.faculty_id as string)

        if (res.error && res.error.message?.includes('batch')) {
          const fallback = await supabase
            .from('timetable_entries')
            .select(
              'id, is_elective, section_id, course_id, time_slot_id, ' +
                'courses(code, name), rooms(name), sections(name), ' +
                'time_slots(day_of_week, period, starts_at)',
            )
            .eq('version_id', vId)
            .eq('faculty_id', profile.faculty_id as string)
          if (fallback.error) {
            setError(fallback.error.message)
            return
          }
          rawData = fallback.data ?? []
        } else if (res.error) {
          setError(res.error.message)
          return
        } else {
          rawData = res.data ?? []
        }

        setRows(rawData as Row[])
      })
  }, [profile])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('Dispatch failed:', err)
    } finally {
      setBusy(null)
    }
  }

  const gridEntries: GridEntry[] = rows.map((r) => ({
    id: r.id,
    day_of_week: r.time_slots?.day_of_week ?? 0,
    period: r.time_slots?.period ?? 0,
    course_code: r.courses?.code ?? '',
    course_name: r.courses?.name ?? '',
    room_name: r.rooms?.name ?? '',
    section_name: r.sections?.name ? `${r.sections.name}${r.batch ? ` (B${r.batch})` : ''}` : '',
    is_elective: r.is_elective,
    batch: r.batch,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CalendarIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>Faculty Academic Portal</span>
          </h1>
          <p className="page-subtitle">
            View your weekly teaching schedule, initiate automated peer substitution requests, and accept incoming coverage.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('request')}
            className="btn btn-secondary btn-sm"
          >
            <UsersIcon size={14} />
            <span>Request Coverage</span>
          </button>
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
          <span>Coverage Inbox</span>
        </button>
      </div>

      {/* Tab 1: Schedule */}
      {activeTab === 'schedule' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 className="card-title">
                <CalendarIcon size={18} style={{ color: 'var(--primary-600)' }} />
                <span>Weekly Lecture Distribution</span>
              </h2>
              <span className="badge badge-primary">{rows.length} Total Sessions</span>
            </div>
            <WeeklyGrid entries={gridEntries} />
          </div>
        </div>
      )}

      {/* Tab 2: Request Substitution */}
      {activeTab === 'request' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--slate-900)' }}>
              Select a Scheduled Lecture for Substitution
            </h2>
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
                <strong>only be dispatched on the exact day of the lecture</strong> before it commences. Lectures
                occurring on subsequent days or past periods cannot be requested.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
            {rows.map((r) => {
              const status = r.time_slots
                ? getLectureTemporalStatus(r.time_slots.day_of_week, r.time_slots.starts_at)
                : { isToday: false, isPast: true, reasonMessage: 'No slot data' }

              const canRequest = status.isToday && !status.isPast

              return (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    opacity: canRequest ? 1 : 0.72,
                    borderColor: canRequest ? 'var(--primary-300)' : undefined,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className={`badge ${status.isToday ? 'badge-primary' : 'badge-neutral'}`}>
                        {DAYS[r.time_slots?.day_of_week ?? 0]} · Period {r.time_slots?.period}
                      </span>
                      {status.isToday && !status.isPast && (
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          Today's Lecture
                        </span>
                      )}
                      {status.isPast && status.isToday && (
                        <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                          Already Passed
                        </span>
                      )}
                      {!status.isToday && (
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
                    {!canRequest && status.reasonMessage && (
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
                      disabled={!canRequest}
                      className={`btn ${canRequest ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{ width: '100%' }}
                    >
                      <UsersIcon size={14} />
                      <span>{canRequest ? 'Request Substitute' : 'Unavailable (Day-Of Only)'}</span>
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
                  Today ({DAYS[requestModalSession.time_slots?.day_of_week ?? 0]}) · Period {requestModalSession.time_slots?.period} ({requestModalSession.time_slots?.starts_at.slice(0, 5)})
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
