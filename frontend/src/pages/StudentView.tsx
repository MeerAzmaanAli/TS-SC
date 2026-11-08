import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import WeeklyGrid, { GridEntry } from '../components/WeeklyGrid'
import { SHIFT_1_TIMES, SHIFT_2_TIMES } from '../components/TimetablePreview'
import { getHeldLectureDate, toLocalDateString } from '../lib/substitution'
import {
  AlertCircleIcon,
  RefreshIcon,
  UsersIcon,
  ClockIcon,
  CheckCircleIcon,
} from '../components/Icons'

interface SectionInfo {
  id: string
  name: string
  code: string
  semester: number
  strength: number
  batch_count: number
  program_name: string
  shift?: number
}

interface RawEntry {
  id: string
  batch: number | null
  is_elective: boolean
  course_code: string
  course_name: string
  room_name: string
  room_type: string
  faculty_name: string
  faculty_id: string
  day_of_week: number
  period: number
  start_time: string
  end_time: string
}

interface TodaySubstitution {
  id: string
  entry_id?: string
  date: string
  status: 'open' | 'assigned' | 'unfilled' | 'expired'
  period: number
  day_of_week: number
  start_time: string
  end_time: string
  course_name: string
  course_code: string
  requester_name: string
  substitute_name: string | null
  deadline: string
}

const STORAGE_KEY = 'ts_sc_student_access'

export default function StudentView() {
  const [sectionCode, setSectionCode] = useState('')
  const [passkey, setPasskey] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [section, setSection] = useState<SectionInfo | null>(null)
  const [entries, setEntries] = useState<GridEntry[]>([])
  const [todaySubstitutions, setTodaySubstitutions] = useState<TodaySubstitution[]>([])
  const [hasPublishedTimetable, setHasPublishedTimetable] = useState(true)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<number | 'all'>('all')

  // Check saved credentials on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const { code, key } = JSON.parse(saved)
        if (code && key) {
          setSectionCode(code)
          setPasskey(key)
          fetchSchedule(code, key, true)
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Auto-refresh schedule periodically (every 15s) when a section is active
  useEffect(() => {
    if (!sectionCode || !passkey) return
    const interval = setInterval(() => {
      fetchSchedule(sectionCode, passkey, true)
    }, 15000)
    return () => clearInterval(interval)
  }, [sectionCode, passkey])

  async function fetchSchedule(code: string, key: string, isSilent = false) {
    if (!isSilent) setAuthLoading(true)
    setLoadingSchedule(true)
    setAuthError(null)

    try {
      const { data, error } = await supabase.rpc('get_section_timetable', {
        p_code: code.trim(),
        p_passkey: key.trim(),
      })

      if (error) {
        setAuthError(error.message)
        if (!isSilent) {
          localStorage.removeItem(STORAGE_KEY)
          setSection(null)
        }
        return
      }

      if (!data || !data.success) {
        setAuthError(data?.error || 'Failed to authenticate section credentials.')
        if (!isSilent) {
          localStorage.removeItem(STORAGE_KEY)
          setSection(null)
        }
        return
      }

      // Success
      setSection(data.section)
      setHasPublishedTimetable(data.has_published_timetable)
      const todaySubs: TodaySubstitution[] = data.today_substitutions || []
      setTodaySubstitutions(todaySubs)

      // Map today's substitutions strictly by exact timetable_entry_id
      // to ensure a substitution ONLY highlights its specific scheduled lecture slot
      const subByEntryId = new Map<string, TodaySubstitution>()
      for (const sub of todaySubs) {
        if (sub.entry_id) subByEntryId.set(sub.entry_id, sub)
      }

      const isShift2 =
        data.section?.shift === 2 ||
        (data.section?.semester ? [3, 4, 5, 6].includes(data.section.semester) : false)

      const gridEntries: GridEntry[] = (data.entries || []).map((e: RawEntry) => {
        // Strictly match by exact entry ID
        const sub = subByEntryId.get(e.id) || null
        const heldDate = sub ? getHeldLectureDate(e.day_of_week, sub.date) : null
        const heldDateStr = heldDate ? toLocalDateString(heldDate) : sub?.date ?? null

        let period = e.period
        if (isShift2 && period >= 3 && period <= 8) {
          period = period - 2
        }

        return {
          id: e.id,
          day_of_week: e.day_of_week,
          period,
          course_code: e.course_code || (e.is_elective ? 'GE' : '—'),
          course_name: e.course_name || (e.is_elective ? 'Generic Elective (Institute Basket)' : '—'),
          room_name: e.room_name || (e.is_elective ? 'Elective Allocation' : '—'),
          faculty_name: e.faculty_name || (e.is_elective ? 'Elective Faculty' : '—'),
          is_elective: e.is_elective,
          batch: e.batch,
          substitution: sub
            ? {
                status: sub.status,
                substitute_name: sub.substitute_name,
                requester_name: sub.requester_name,
                date: heldDateStr,
              }
            : null,
        }
      })
      setEntries(gridEntries)

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: code.trim().toUpperCase(), key: key.trim() }))
    } catch (err: any) {
      setAuthError(err.message || 'Network error fetching section timetable.')
    } finally {
      setAuthLoading(false)
      setLoadingSchedule(false)
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!sectionCode.trim() || !passkey.trim()) {
      setAuthError('Please enter both Section Code and Passkey.')
      return
    }
    fetchSchedule(sectionCode, passkey)
  }

  function handleSwitchSection() {
    localStorage.removeItem(STORAGE_KEY)
    setSection(null)
    setEntries([])
    setTodaySubstitutions([])
    setPasskey('')
    setAuthError(null)
  }

  // Filter entries by batch if selected
  const displayedEntries =
    selectedBatch === 'all'
      ? entries
      : entries.filter((e) => e.batch === null || e.batch === selectedBatch)


  // ==========================================
  // VIEW A: Passkey Access Gate
  // ==========================================
  if (!section) {
    return (
      <div style={{ maxWidth: '480px', margin: '4rem auto 2rem', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2.5rem 2rem', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '10px',
                background: '#1B1D22',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              TS
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#0f172a' }}>
              Student Section View
            </h1>
            <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
              Enter your class <strong>Section Code</strong> and <strong>Passkey</strong> provided by your Class Coordinator to access your timetable.
            </p>
          </div>

          {authError && (
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertCircleIcon size={18} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.875rem' }}>{authError}</div>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>
                Section Code
              </label>
              <input
                type="text"
                placeholder="e.g. BTCS27H, BTCS27A"
                value={sectionCode}
                onChange={(e) => setSectionCode(e.target.value.toUpperCase())}
                className="input"
                style={{ width: '100%', padding: '0.65rem 0.85rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}
                autoFocus
                required
              />
              <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.3rem' }}>
                Format: [Course][Batch][Section] (e.g. BTCS27H)
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>
                Section Passkey
              </label>
              <input
                type="text"
                placeholder="e.g. H-9382"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                className="input"
                style={{ width: '100%', padding: '0.65rem 0.85rem', fontSize: '1rem', letterSpacing: '0.06em', fontWeight: 600 }}
                required
              />
              <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.3rem' }}>
                Offline security key shared by your Class Coordinator
              </span>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="admin-btn"
              style={{
                width: '100%',
                minHeight: 44,
                fontSize: 14,
                marginTop: '0.5rem',
              }}
            >
              {authLoading ? (
                <>
                  <RefreshIcon size={16} className="spin" />
                  <span>Verifying Passkey…</span>
                </>
              ) : (
                <span>Access Timetable</span>
              )}
            </button>
          </form>

          <div
            style={{
              marginTop: '2rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              textAlign: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-muted, #64748b)',
            }}
          >
            🔒 View-only section portal. No student accounts or email registrations required.
          </div>
        </div>
      </div>
    )
  }

  // ==========================================
  // VIEW B: Authenticated Section Timetable View
  // ==========================================
  return (
    <div className="student-cal-wrapper">
      {/* Top Navigation & Fast Actions Bar */}
      <div className="admin-cal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="admin-cal-logo" title="Timetable Scheduler">
              TS
            </div>
            <div className="portal-role-badge">
              <span className="portal-role-dot student"></span>
              <span>Student · {section.code}</span>
            </div>
          </div>

          <div className="admin-cal-nav">
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1B1D22', padding: '6px 12px', background: '#ffffff', borderRadius: 8, boxShadow: '0 0 0 1px #E3E4E8' }}>
              Section {section.name} · {section.program_name} (Sem {section.semester})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={() => fetchSchedule(section.code, passkey, false)}
            disabled={loadingSchedule}
            title="Refresh timetable"
          >
            <RefreshIcon size={15} className={loadingSchedule ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={() => window.print()}
            title="Print or save schedule PDF"
          >
            <span>Print</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-danger admin-btn-sm"
            onClick={handleSwitchSection}
            title="Switch Section"
          >
            <span>Switch Section</span>
          </button>
        </div>
      </div>

      {/* Batch Selector Bar */}
      {section.batch_count > 1 && (
        <div
          className="card"
          style={{
            padding: '0.75rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UsersIcon size={16} className="text-muted" />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Filter Practical Batches:</span>
          </div>
          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
            <button
              onClick={() => setSelectedBatch('all')}
              className={`btn btn-sm ${selectedBatch === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.825rem', padding: '0.25rem 0.75rem' }}
            >
              All Batches
            </button>
            {Array.from({ length: section.batch_count }, (_, i) => i + 1).map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBatch(b)}
                className={`btn btn-sm ${selectedBatch === b ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.825rem', padding: '0.25rem 0.75rem' }}
              >
                Batch {b} (B{b})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Realtime Substitution Live Broadcast Banner */}
      {todaySubstitutions.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: '1.5rem',
            borderLeft: '4px solid #3b82f6',
            background: '#eff6ff',
          }}
        >
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '0 0 0.75rem',
            }}
          >
            <ClockIcon size={18} />
            <span>Today's Substitution &amp; Lecture Status Updates</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {todaySubstitutions.map((sub) => {
              const isAssigned = sub.status === 'assigned' && sub.substitute_name
              const isUnfilled = sub.status === 'unfilled' || sub.status === 'expired'
              const isPending = sub.status === 'open'

              return (
                <div
                  key={sub.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #bfdbfe',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a', marginRight: '0.5rem' }}>
                      Period {sub.period} ({sub.start_time?.slice(0, 5)} - {sub.end_time?.slice(0, 5)})
                    </span>
                    <span style={{ color: '#475569' }}>
                      {sub.course_name} ({sub.course_code})
                    </span>
                  </div>

                  <div>
                    {isAssigned && (
                      <span
                        className="badge"
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <CheckCircleIcon size={13} />
                        Substitute: {sub.substitute_name} (Original: {sub.requester_name})
                      </span>
                    )}
                    {isUnfilled && (
                      <span
                        className="badge"
                        style={{
                          background: '#fee2e2',
                          color: '#b91c1c',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <AlertCircleIcon size={13} />
                        Period Free / Self Study (Faculty Unavailable)
                      </span>
                    )}
                    {isPending && (
                      <span
                        className="badge"
                        style={{
                          background: '#fef3c7',
                          color: '#92400e',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <ClockIcon size={13} />
                        Substitute Confirmation In Progress
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!hasPublishedTimetable ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
          <AlertCircleIcon size={36} style={{ color: '#f59e0b', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            No Published Timetable
          </h3>
          <p className="text-muted" style={{ maxWidth: '450px', margin: '0 auto' }}>
            The timetable for Section {section.name} is currently being scheduled or reviewed by the administration. Please check back later.
          </p>
        </div>
      ) : (
        /* Timetable Grid with Live Substitution Color Legend */
        <div style={{ marginBottom: '2rem' }}>
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
              Today's Substitution Color Guide:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  color: '#854d0e',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '4px',
                    background: '#fef08a',
                    border: '1.5px solid #eab308',
                    display: 'inline-block',
                  }}
                />
                <span>Yellow: Request Dispatched (Pending)</span>
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  color: '#166534',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '4px',
                    background: '#bbf7d0',
                    border: '1.5px solid #22c55e',
                    display: 'inline-block',
                  }}
                />
                <span>Green: Faculty Assigned</span>
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  color: '#991b1b',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '4px',
                    background: '#fecaca',
                    border: '1.5px solid #ef4444',
                    display: 'inline-block',
                  }}
                />
                <span>Red: Expired / No Assignment (Free Period)</span>
              </span>
            </div>
          </div>

          {/* Shift Banner */}
          {section && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.85rem 1.25rem',
                borderRadius: '8px',
                background:
                  section.shift === 2 || [3, 4, 5, 6].includes(section.semester)
                    ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
                    : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border:
                  section.shift === 2 || [3, 4, 5, 6].includes(section.semester)
                    ? '1.5px solid #bbf7d0'
                    : '1.5px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    backgroundColor:
                      section.shift === 2 || [3, 4, 5, 6].includes(section.semester) ? '#16a34a' : '#2563eb',
                    color: '#ffffff',
                  }}
                >
                  {section.shift === 2 || [3, 4, 5, 6].includes(section.semester)
                    ? 'SHIFT 2 (AFTERNOON)'
                    : 'SHIFT 1 (MORNING)'}
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                  {section.shift === 2 || [3, 4, 5, 6].includes(section.semester)
                    ? '10:15 AM – 04:45 PM'
                    : '08:15 AM – 02:45 PM'}
                </span>
                <span style={{ fontSize: '0.825rem', color: '#475569' }}>
                  • 6 Periods (1 Hour each) • Lunch: 12:15 PM – 12:45 PM
                </span>
              </div>
            </div>
          )}

          <WeeklyGrid
            entries={displayedEntries}
            viewMode="section"
            allPeriods={[1, 2, 3, 4, 5, 6]}
            slotTimes={
              section?.shift === 2 || (section?.semester ? [3, 4, 5, 6].includes(section.semester) : false)
                ? SHIFT_2_TIMES
                : SHIFT_1_TIMES
            }
          />
        </div>
      )}
    </div>
  )
}
