import { MapPinIcon, UsersIcon, BookOpenIcon, LayersIcon } from './Icons'

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
  } | null
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

  if (entries.length === 0 && !allDays && !allPeriods) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
        <div className="stat-icon indigo" style={{ margin: '0 auto 1rem', width: 56, height: 56 }}>
          <BookOpenIcon size={28} />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--slate-800)' }}>
          {emptyMessage ?? 'No scheduled sessions found'}
        </h3>
        <p className="text-muted" style={{ maxWidth: 440, margin: '0.5rem auto 0' }}>
          This schedule has no active sessions mapped in this timetable version. Select another section or faculty member, or generate a fresh schedule version.
        </p>
      </div>
    )
  }

  return (
    <div className="timetable-grid-container">
      <table className="timetable-grid">
        <thead>
          <tr>
            <th className="grid-corner-cell">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--slate-700)' }}>DAY / TIME</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>WEEKDAY</span>
              </div>
            </th>
            {periods.map((p) => {
              const timeInfo = slotTimes?.[p]
              const timeRange =
                timeInfo?.starts_at && timeInfo?.ends_at
                  ? `${formatTime(timeInfo.starts_at)} - ${formatTime(timeInfo.ends_at)}`
                  : null

              return (
                <th key={p} className="grid-period-header">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                    <span style={{ fontWeight: 800, color: 'var(--slate-900)' }}>Period {p}</span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: timeRange ? 'var(--primary-700)' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: timeRange ? 600 : 400,
                      }}
                    >
                      {timeRange ?? `Slot ${p}`}
                    </span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th className="grid-day-header">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                  <span style={{ fontWeight: 800, color: 'var(--slate-900)', fontSize: '0.9rem' }}>
                    {DAY_SHORT[d] ?? `Day ${d}`}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{DAY_NAMES[d]}</span>
                </div>
              </th>
              {periods.map((p) => {
                const slotEntries = cellMap.get(`${d}-${p}`) ?? []
                return (
                  <td key={p} className={`timetable-cell ${slotEntries.length > 0 ? 'has-session' : ''}`}>
                    {slotEntries.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', height: '100%' }}>
                        {slotEntries.map((e) => {
                          const isSubPending = e.substitution?.status === 'open'
                          const isSubAssigned = e.substitution?.status === 'assigned'
                          const isSubExpired =
                            e.substitution?.status === 'unfilled' || e.substitution?.status === 'expired'

                          let subClass = ''
                          if (isSubPending) subClass = 'sub-pending'
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
                                  {isSubPending && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.35rem',
                                        background: '#fef08a',
                                        color: '#854d0e',
                                        fontWeight: 700,
                                      }}
                                      title="Substitution dispatched - Pending confirmation"
                                    >
                                      Sub Pending
                                    </span>
                                  )}
                                  {isSubAssigned && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.35rem',
                                        background: '#bbf7d0',
                                        color: '#166534',
                                        fontWeight: 700,
                                      }}
                                      title="Substitute faculty confirmed"
                                    >
                                      Sub Assigned
                                    </span>
                                  )}
                                  {isSubExpired && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.625rem',
                                        padding: '0.1rem 0.35rem',
                                        background: '#fecaca',
                                        color: '#991b1b',
                                        fontWeight: 700,
                                      }}
                                      title="No substitute faculty found - Lecture is free"
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
                                      Batch B{e.batch}
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
                                {/* If viewing by Section: highlight Assigned Faculty or Substitute */}
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
                                        title="No faculty available - period is free"
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
                                          title={`Assigned Faculty: ${e.faculty_name}`}
                                        >
                                          <UsersIcon size={11} />
                                          <span>{e.faculty_name}</span>
                                        </span>
                                      )
                                    )}
                                  </>
                                )}

                                {/* If viewing by Faculty: highlight Student Section */}
                                {viewMode === 'faculty' && e.section_name && (
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
                                    <span>{e.section_name}</span>
                                  </span>
                                )}

                                {/* If no specific viewMode: show both if available */}
                                {!viewMode && e.faculty_name && (
                                  <span className="meta-chip" title="Faculty Instructor">
                                    <UsersIcon size={11} />
                                    <span>{e.faculty_name}</span>
                                  </span>
                                )}
                                {!viewMode && e.section_name && (
                                  <span className="meta-chip" title="Student Section">
                                    <LayersIcon size={11} />
                                    <span>Sec {e.section_name}</span>
                                  </span>
                                )}

                                {/* Room Location Chip */}
                                <span className="meta-chip room" title={`Room Location: ${e.room_name}`}>
                                  <MapPinIcon size={11} />
                                  <span>{e.room_name}</span>
                                </span>
                              </div>
                            </div>
                          )
                        })}
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
