import {
  MapPinIcon,
  UsersIcon,
  BookOpenIcon,
  LayersIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from './Icons'

export interface GridEntry {
  id: string
  day_of_week: number
  period: number
  course_code: string
  course_name: string
  room_name: string
  faculty_name?: string
  faculty_email?: string
  section_name?: string
  is_elective: boolean
  batch?: number | null
  substitution?: {
    status: 'open' | 'assigned' | 'unfilled' | 'expired'
    substitute_name?: string | null
    requester_name?: string | null
    role?: 'requester' | 'covering'
  } | null
}

export interface IncomingRequestInfo {
  candidate_id: string
  request_id: string
  priority: number
  deadline: string
  course_code: string
  course_name: string
  requester_name: string
  section_name: string
  room_name: string
  day_of_week: number
  period: number
  starts_at?: string
  ends_at?: string
}

export interface SlotTimeInfo {
  starts_at?: string
  ends_at?: string
}

export interface WeeklyGridProps {
  entries: GridEntry[]
  viewMode?: 'section' | 'faculty'
  allDays?: number[]
  allPeriods?: number[]
  slotTimes?: Record<number, SlotTimeInfo>
  emptyMessage?: string
  onRequestSubstitution?: (entry: GridEntry) => void
  incomingRequests?: IncomingRequestInfo[]
  onAcceptRequest?: (candId: string, requestId: string, deadline: string) => void
  onRejectRequest?: (candId: string, requestId: string, deadline: string) => void
  actionBusyId?: string | null
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatTime(t?: string): string {
  if (!t) return ''
  const parts = t.split(':')
  if (parts.length >= 2) {
    const hour = parseInt(parts[0], 10)
    const min = parts[1]
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    return `${h12}:${min} ${ampm}`
  }
  return t
}

export default function WeeklyGrid({
  entries,
  viewMode,
  allDays,
  allPeriods,
  slotTimes,
  emptyMessage,
  onRequestSubstitution,
  incomingRequests,
  onAcceptRequest,
  onRejectRequest,
  actionBusyId,
}: WeeklyGridProps) {
  // Ensure the full standard school week (Monday to Friday, Periods 1 to 6) is shown by default
  const defaultDays = [1, 2, 3, 4, 5]
  const defaultPeriods = [1, 2, 3, 4, 5, 6]

  const days =
    allDays && allDays.length > 0
      ? allDays
      : Array.from(new Set(entries.map((e) => e.day_of_week).concat(defaultDays))).sort((a, b) => a - b)

  const periods =
    allPeriods && allPeriods.length > 0
      ? allPeriods
      : Array.from(new Set(entries.map((e) => e.period).concat(defaultPeriods))).sort((a, b) => a - b)

  const cellMap = new Map<string, GridEntry[]>()
  for (const e of entries) {
    const key = `${e.day_of_week}-${e.period}`
    const list = cellMap.get(key)
    if (list) list.push(e)
    else cellMap.set(key, [e])
  }

  const incomingMap = new Map<string, IncomingRequestInfo[]>()
  for (const inc of incomingRequests ?? []) {
    const key = `${inc.day_of_week}-${inc.period}`
    const list = incomingMap.get(key)
    if (list) list.push(inc)
    else incomingMap.set(key, [inc])
  }

  if (entries.length === 0 && (!incomingRequests || incomingRequests.length === 0) && !allDays && !allPeriods) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
        <div className="stat-icon indigo" style={{ margin: '0 auto 1rem', width: 56, height: 56 }}>
          <BookOpenIcon size={28} />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--slate-800)' }}>
          {emptyMessage ?? 'No scheduled sessions found'}
        </h3>
      </div>
    )
  }

  return (
    <div className="timetable-container">
      <table className="timetable-table">
        <thead>
          <tr>
            <th className="timetable-header-cell day-col" style={{ width: 110 }}>
              <span className="th-title">DAY / TIME</span>
              <span className="th-sub">WEEKDAY</span>
            </th>
            {periods.map((p) => {
              const time = slotTimes?.[p]
              return (
                <th key={p} className="timetable-header-cell">
                  <span className="th-title">Period {p}</span>
                  {time?.starts_at ? (
                    <span className="th-time">
                      {formatTime(time.starts_at)}
                      {time.ends_at && ` - ${formatTime(time.ends_at)}`}
                    </span>
                  ) : (
                    <span className="th-sub">Slot {p}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th className="timetable-day-header">
                <div className="day-name">{DAY_SHORT[d] || `Day ${d}`}</div>
                <div className="day-sub">{DAY_NAMES[d] || ''}</div>
              </th>
              {periods.map((p) => {
                const slotEntries = cellMap.get(`${d}-${p}`) ?? []
                const incomingForSlot = incomingMap.get(`${d}-${p}`) ?? []
                const hasContent = slotEntries.length > 0 || incomingForSlot.length > 0

                return (
                  <td key={p} className={`timetable-cell ${hasContent ? 'has-session' : ''}`}>
                    {hasContent ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', height: '100%' }}>
                        {/* 1. Regular & Substituted Timetable Entries */}
                        {slotEntries.map((e) => {
                          const isCovering = e.substitution?.role === 'covering'
                          const isSubPending = e.substitution?.status === 'open'
                          const isSubAssigned = e.substitution?.status === 'assigned'
                          const isSubExpired =
                            e.substitution?.status === 'unfilled' || e.substitution?.status === 'expired'

                          let subClass = ''
                          if (isCovering) subClass = 'sub-covering'
                          else if (isSubPending) subClass = 'sub-pending'
                          else if (isSubAssigned) subClass = 'sub-assigned'
                          else if (isSubExpired) subClass = 'sub-expired'

                          return (
                            <div
                              key={e.id}
                              className={`session-badge ${subClass} ${e.is_elective ? 'elective' : ''} ${
                                e.batch != null ? (e.batch % 2 === 1 ? 'batch-1' : 'batch-2') : ''
                              }`}
                              style={{ flex: 1 }}
                            >
                              <div className="session-code">
                                <span style={{ fontWeight: 800, color: 'var(--slate-900)', fontSize: '0.85rem' }}>
                                  {e.course_code}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  {isCovering && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.4rem',
                                        background: '#e0f2fe',
                                        color: '#0369a1',
                                        fontWeight: 800,
                                        border: '1px solid #bae6fd',
                                      }}
                                      title="You are the confirmed substitute instructor covering this class"
                                    >
                                      Subbing
                                    </span>
                                  )}
                                  {!isCovering && isSubPending && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.35rem',
                                        background: '#fef08a',
                                        color: '#854d0e',
                                        fontWeight: 700,
                                      }}
                                      title="Substitution dispatched - Pending peer confirmation"
                                    >
                                      Sub Pending
                                    </span>
                                  )}
                                  {!isCovering && isSubAssigned && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.35rem',
                                        background: '#bbf7d0',
                                        color: '#166534',
                                        fontWeight: 700,
                                      }}
                                      title="Substitute colleague confirmed"
                                    >
                                      Sub Assigned
                                    </span>
                                  )}
                                  {!isCovering && isSubExpired && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.35rem',
                                        background: '#fecaca',
                                        color: '#991b1b',
                                        fontWeight: 700,
                                      }}
                                      title="No substitute found - Lecture marked free"
                                    >
                                      Period Free
                                    </span>
                                  )}
                                  {e.batch != null && (
                                    <span
                                      className={`badge ${
                                        e.batch === 1 ? 'badge-primary' : e.batch === 2 ? 'badge-info' : 'badge-purple'
                                      }`}
                                      style={{ fontSize: '0.625rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}
                                      title={`Lab Batch ${e.batch}`}
                                    >
                                      B{e.batch}
                                    </span>
                                  )}
                                  {e.is_elective && (
                                    <span
                                      className="badge badge-purple"
                                      style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem' }}
                                    >
                                      Elective
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="session-name" title={e.course_name}>
                                {e.course_name}
                              </div>

                              <div className="session-meta">
                                {/* If viewing by Section */}
                                {viewMode === 'section' && (
                                  <>
                                    {isSubAssigned ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                        <span
                                          className="meta-chip faculty"
                                          style={{
                                            fontWeight: 700,
                                            color: '#15803d',
                                            backgroundColor: '#dcfce7',
                                            border: '1px solid #86efac',
                                          }}
                                          title={`Covering Faculty: ${e.substitution?.substitute_name}`}
                                        >
                                          <UsersIcon size={11} />
                                          <span>Sub: {e.substitution?.substitute_name}</span>
                                        </span>
                                        {e.faculty_name && (
                                          <span
                                            style={{
                                              fontSize: '0.65rem',
                                              color: '#64748b',
                                              textDecoration: 'line-through',
                                              paddingLeft: '0.2rem',
                                            }}
                                          >
                                            Orig: {e.faculty_name}
                                          </span>
                                        )}
                                      </div>
                                    ) : isSubExpired ? (
                                      <span
                                        className="meta-chip"
                                        style={{
                                          fontWeight: 700,
                                          color: '#b91c1c',
                                          backgroundColor: '#fee2e2',
                                          border: '1px solid #fca5a5',
                                        }}
                                      >
                                        <UsersIcon size={11} />
                                        <span>Self Study / Free</span>
                                      </span>
                                    ) : isSubPending ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                        <span
                                          className="meta-chip faculty"
                                          style={{
                                            fontWeight: 700,
                                            color: '#854d0e',
                                            backgroundColor: '#fef9c3',
                                            border: '1px solid #fde047',
                                          }}
                                          title={`Substitute request pending for ${e.faculty_name}`}
                                        >
                                          <UsersIcon size={11} />
                                          <span>Sub Pending…</span>
                                        </span>
                                        {e.faculty_name && (
                                          <span style={{ fontSize: '0.65rem', color: '#64748b', paddingLeft: '0.2rem' }}>
                                            Orig: {e.faculty_name}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      e.faculty_name && (
                                        <span
                                          className="meta-chip faculty"
                                          style={{
                                            fontWeight: 600,
                                            color: 'var(--primary-700)',
                                            backgroundColor: 'var(--primary-50)',
                                            border: '1px solid var(--primary-200)',
                                          }}
                                        >
                                          <UsersIcon size={11} />
                                          <span>{e.faculty_name}</span>
                                        </span>
                                      )
                                    )}
                                  </>
                                )}

                                {/* If viewing by Faculty */}
                                {viewMode === 'faculty' && (
                                  <>
                                    {isCovering ? (
                                      <span
                                        className="meta-chip faculty"
                                        style={{
                                          fontWeight: 700,
                                          color: '#0369a1',
                                          backgroundColor: '#e0f2fe',
                                          border: '1px solid #7dd3fc',
                                        }}
                                        title={`You are covering for ${e.substitution?.requester_name}`}
                                      >
                                        <UsersIcon size={11} />
                                        <span>Covering for: {e.substitution?.requester_name}</span>
                                      </span>
                                    ) : isSubAssigned ? (
                                      <span
                                        className="meta-chip faculty"
                                        style={{
                                          fontWeight: 700,
                                          color: '#15803d',
                                          backgroundColor: '#dcfce7',
                                          border: '1px solid #86efac',
                                        }}
                                        title={`Assigned substitute: ${e.substitution?.substitute_name}`}
                                      >
                                        <CheckCircleIcon size={11} />
                                        <span>Covered by: {e.substitution?.substitute_name}</span>
                                      </span>
                                    ) : isSubPending ? (
                                      <span
                                        className="meta-chip faculty"
                                        style={{
                                          fontWeight: 700,
                                          color: '#854d0e',
                                          backgroundColor: '#fef9c3',
                                          border: '1px solid #fde047',
                                        }}
                                      >
                                        <ClockIcon size={11} />
                                        <span>Seeking Substitute</span>
                                      </span>
                                    ) : isSubExpired ? (
                                      <span
                                        className="meta-chip"
                                        style={{
                                          fontWeight: 700,
                                          color: '#b91c1c',
                                          backgroundColor: '#fee2e2',
                                          border: '1px solid #fca5a5',
                                        }}
                                      >
                                        <AlertCircleIcon size={11} />
                                        <span>No Sub / Free</span>
                                      </span>
                                    ) : null}

                                    {e.section_name && (
                                      <span
                                        className="meta-chip section"
                                        style={{
                                          fontWeight: 600,
                                          color: 'var(--emerald-800)',
                                          backgroundColor: 'var(--emerald-50)',
                                          border: '1px solid var(--emerald-200)',
                                        }}
                                        title={`Student Section: ${e.section_name}`}
                                      >
                                        <LayersIcon size={11} />
                                        <span>Sec {e.section_name}</span>
                                      </span>
                                    )}
                                  </>
                                )}

                                {/* Room Location Chip */}
                                <span className="meta-chip room" title={`Room Location: ${e.room_name}`}>
                                  <MapPinIcon size={11} />
                                  <span>{e.room_name}</span>
                                </span>
                              </div>

                              {/* Direct in-timetable Action Menu for Faculty */}
                              {viewMode === 'faculty' && onRequestSubstitution && !isCovering && !e.substitution && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation()
                                    onRequestSubstitution(e)
                                  }}
                                  className="btn btn-sm btn-secondary"
                                  style={{
                                    marginTop: '0.4rem',
                                    width: '100%',
                                    fontSize: '0.72rem',
                                    padding: '0.25rem 0.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    backgroundColor: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '5px',
                                    fontWeight: 600,
                                  }}
                                  title="Dispatch peer substitution request for this session"
                                >
                                  <UsersIcon size={12} style={{ color: 'var(--primary-600)' }} />
                                  <span>Request Sub</span>
                                </button>
                              )}
                            </div>
                          )
                        })}

                        {/* 2. Incoming Substitution Requests Alert on this specific Slot */}
                        {incomingForSlot.map((inc) => (
                          <div
                            key={inc.candidate_id}
                            style={{
                              padding: '0.55rem 0.65rem',
                              borderRadius: '7px',
                              background: '#fffbeb',
                              border: '1.5px dashed #f59e0b',
                              borderLeft: '4px solid #d97706',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.12)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 800, color: '#92400e', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ClockIcon size={12} />
                                <span>Coverage Request</span>
                              </span>
                              <span className="badge badge-warning" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                                P{inc.priority}
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem' }}>
                              {inc.course_code} · {inc.section_name}
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.72rem' }}>
                              From: <strong>{inc.requester_name}</strong> · {inc.room_name}
                            </div>
                            <div style={{ display: 'flex', gap: '5px', marginTop: '3px' }}>
                              <button
                                type="button"
                                onClick={() => onAcceptRequest?.(inc.candidate_id, inc.request_id, inc.deadline)}
                                disabled={actionBusyId === inc.candidate_id}
                                className="btn btn-sm btn-primary"
                                style={{ flex: 1, padding: '3px 6px', fontSize: '0.72rem', height: '24px' }}
                              >
                                {actionBusyId === inc.candidate_id ? 'Accepting…' : 'Accept'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onRejectRequest?.(inc.candidate_id, inc.request_id, inc.deadline)}
                                disabled={actionBusyId === inc.candidate_id}
                                className="btn btn-sm btn-secondary"
                                style={{ flex: 1, padding: '3px 6px', fontSize: '0.72rem', height: '24px', color: '#b91c1c' }}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          minHeight: 85,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--slate-400)',
                          fontSize: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px dashed var(--slate-200)',
                          backgroundColor: 'rgba(248, 250, 252, 0.4)',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>—</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--slate-400)' }}>Free</span>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
