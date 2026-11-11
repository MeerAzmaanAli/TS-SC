import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import WeeklyGrid, { GridEntry, SlotTimeInfo } from './WeeklyGrid'
import {
  CalendarIcon,
  UsersIcon,
  BookOpenIcon,
  ClockIcon,
} from './Icons'

interface SectionItem {
  id: string
  name: string
  semester?: number
  shift?: number
}

interface FacultyItem {
  id: string
  name: string
  email?: string
}

interface RawEntry {
  id: string
  batch?: number | null
  is_elective: boolean
  section_id: string
  course_id: string
  faculty_id: string
  room_id: string
  time_slot_id: string
  courses: { id: string; code: string; name: string } | null
  faculty: { id: string; name: string; email: string } | null
  sections: { id: string; name: string; semester: number; shift?: number } | null
  rooms: { id: string; name: string; room_type: string } | null
  time_slots: { id: string; day_of_week: number; period: number; starts_at: string; ends_at: string } | null
}

export const SHIFT_1_TIMES: Record<number, SlotTimeInfo> = {
  1: { starts_at: '08:15:00', ends_at: '09:15:00' },
  2: { starts_at: '09:15:00', ends_at: '10:15:00' },
  3: { starts_at: '10:15:00', ends_at: '11:15:00' },
  4: { starts_at: '11:15:00', ends_at: '12:15:00' },
  5: { starts_at: '12:45:00', ends_at: '13:45:00' },
  6: { starts_at: '13:45:00', ends_at: '14:45:00' },
}

export const SHIFT_2_TIMES: Record<number, SlotTimeInfo> = {
  1: { starts_at: '10:15:00', ends_at: '11:15:00' },
  2: { starts_at: '11:15:00', ends_at: '12:15:00' },
  3: { starts_at: '12:45:00', ends_at: '13:45:00' },
  4: { starts_at: '13:45:00', ends_at: '14:45:00' },
  5: { starts_at: '14:45:00', ends_at: '15:45:00' },
  6: { starts_at: '15:45:00', ends_at: '16:45:00' },
}

export const FACULTY_TIMES: Record<number, SlotTimeInfo> = {
  1: { starts_at: '08:15:00', ends_at: '09:15:00' },
  2: { starts_at: '09:15:00', ends_at: '10:15:00' },
  3: { starts_at: '10:15:00', ends_at: '11:15:00' },
  4: { starts_at: '11:15:00', ends_at: '12:15:00' },
  5: { starts_at: '12:45:00', ends_at: '13:45:00' },
  6: { starts_at: '13:45:00', ends_at: '14:45:00' },
  7: { starts_at: '14:45:00', ends_at: '15:45:00' },
  8: { starts_at: '15:45:00', ends_at: '16:45:00' },
}

interface VersionOption {
  id: string
  status: string
  created_at: string
}

interface TimetablePreviewProps {
  versionId?: string
  showVersionSelector?: boolean
  initialViewMode?: 'section' | 'faculty'
  onVersionChange?: (versionId: string) => void
}

export default function TimetablePreview({
  versionId,
  showVersionSelector = false,
  initialViewMode = 'section',
  onVersionChange,
}: TimetablePreviewProps) {
  const [activeVersionId, setActiveVersionId] = useState<string | null>(versionId ?? null)
  const [versions, setVersions] = useState<VersionOption[]>([])
  const [entries, setEntries] = useState<RawEntry[]>([])
  const [sections, setSections] = useState<SectionItem[]>([])
  const [facultyList, setFacultyList] = useState<FacultyItem[]>([])
  const [slotTimes, setSlotTimes] = useState<Record<number, SlotTimeInfo>>({})

  const [viewMode, setViewMode] = useState<'section' | 'faculty'>(initialViewMode)
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sync if versionId prop changes
  useEffect(() => {
    if (versionId && versionId !== activeVersionId) {
      setActiveVersionId(versionId)
    }
  }, [versionId])

  // Load versions if version selector is enabled or no versionId provided
  useEffect(() => {
    if (showVersionSelector || !versionId) {
      supabase
        .from('timetable_versions')
        .select('id, status, created_at')
        .order('created_at', { ascending: false })
        .then(({ data, error: vErr }) => {
          if (!vErr && data && data.length > 0) {
            const list = data as VersionOption[]
            setVersions(list)
            if (!activeVersionId) {
              const pub = list.find((v) => v.status === 'published')
              setActiveVersionId(pub?.id ?? list[0].id)
            }
          }
        })
    }
  }, [showVersionSelector, versionId])

  // Fetch entries whenever activeVersionId changes
  useEffect(() => {
    if (!activeVersionId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    async function loadEntries() {
      try {
        // Multi-pass pagination to overcome Supabase PostgREST max_rows (1000) server cap
        const CHUNK_SIZE = 1000
        let rawData: unknown[] = []
        let from = 0
        let hasMore = true
        let usedFallback = false

        const selectQuery = `
          id,
          batch,
          is_elective,
          section_id,
          course_id,
          faculty_id,
          room_id,
          time_slot_id,
          courses(id, code, name),
          faculty(id, name, email),
          sections(id, name, semester, shift),
          rooms(id, name, room_type),
          time_slots(id, day_of_week, period, starts_at, ends_at)
        `

        const fallbackQuery = `
          id,
          is_elective,
          section_id,
          course_id,
          faculty_id,
          room_id,
          time_slot_id,
          courses(id, code, name),
          faculty(id, name, email),
          sections(id, name, semester, shift),
          rooms(id, name, room_type),
          time_slots(id, day_of_week, period, starts_at, ends_at)
        `

        while (hasMore) {
          const to = from + CHUNK_SIZE - 1
          const queryToRun = usedFallback ? fallbackQuery : selectQuery

          let res = await supabase
            .from('timetable_entries')
            .select(queryToRun as any)
            .eq('version_id', activeVersionId)
            .range(from, to)

          // Resilient fallback if batch column is pending migration on Supabase
          if (!usedFallback && res.error && res.error.message?.includes('batch')) {
            usedFallback = true
            res = await supabase
              .from('timetable_entries')
              .select(fallbackQuery as any)
              .eq('version_id', activeVersionId)
              .range(from, to)
          }

          if (res.error) throw res.error

          const chunk = res.data ?? []
          rawData = rawData.concat(chunk)

          // When fewer than chunk size rows are returned, all rows have been fetched
          if (chunk.length < CHUNK_SIZE) {
            hasMore = false
          } else {
            from += CHUNK_SIZE
          }
        }

        const items = (rawData ?? []) as unknown as RawEntry[]
        setEntries(items)

        // Extract unique sections
        const secMap = new Map<string, SectionItem>()
        // Extract unique faculty
        const facMap = new Map<string, FacultyItem>()
        // Extract period slot times
        const times: Record<number, SlotTimeInfo> = {}

        for (const it of items) {
          if (it.sections?.id && it.sections.name) {
            secMap.set(it.sections.id, {
              id: it.sections.id,
              name: it.sections.name,
              semester: it.sections.semester,
              shift: it.sections.shift,
            })
          }
          if (it.faculty?.id && it.faculty.name) {
            facMap.set(it.faculty.id, {
              id: it.faculty.id,
              name: it.faculty.name,
              email: it.faculty.email,
            })
          }
          if (it.time_slots?.period) {
            times[it.time_slots.period] = {
              starts_at: it.time_slots.starts_at,
              ends_at: it.time_slots.ends_at,
            }
          }
        }

        // Also fetch any sections or faculty from database in case some don't have entries yet
        const [secAll, facAll, slotsAll] = await Promise.all([
          supabase.from('sections').select('id, name, semester, shift').order('name').limit(50000),
          supabase.from('faculty').select('id, name, email').order('name').limit(50000),
          supabase.from('time_slots').select('period, starts_at, ends_at').order('period').limit(50000),
        ])

        if (!secAll.error && secAll.data) {
          for (const s of secAll.data) {
            secMap.set(s.id, { id: s.id, name: s.name, semester: s.semester, shift: s.shift })
          }
        }
        if (!facAll.error && facAll.data) {
          for (const f of facAll.data) {
            facMap.set(f.id, { id: f.id, name: f.name, email: f.email })
          }
        }
        if (!slotsAll.error && slotsAll.data) {
          for (const sl of slotsAll.data) {
            times[sl.period] = { starts_at: sl.starts_at, ends_at: sl.ends_at }
          }
        }

        const secList = Array.from(secMap.values()).sort((a, b) => a.name.localeCompare(b.name))
        const fList = Array.from(facMap.values()).sort((a, b) => a.name.localeCompare(b.name))

        setSections(secList)
        setFacultyList(fList)
        setSlotTimes(times)

        // Set default selection
        setSelectedSectionId((prev) => (prev && secMap.has(prev) ? prev : secList[0]?.id ?? ''))
        setSelectedFacultyId((prev) => (prev && facMap.has(prev) ? prev : fList[0]?.id ?? ''))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    loadEntries()
  }, [activeVersionId])

  const selectedSection = sections.find((s) => s.id === selectedSectionId)
  const selectedFaculty = facultyList.find((f) => f.id === selectedFacultyId)

  // Determine section shift (Shift 1 = Year 1 & 4, Shift 2 = Year 2 & 3)
  const isShift2 =
    selectedSection?.shift === 2 ||
    (selectedSection?.semester ? [3, 4, 5, 6].includes(selectedSection.semester) : false)
  const currentShift = isShift2 ? 2 : 1

  // Filter entries based on viewMode and selected entity
  const filteredRaw = entries.filter((e) => {
    if (viewMode === 'section') {
      return e.section_id === selectedSectionId
    }
    return e.faculty_id === selectedFacultyId
  })

  // Convert to GridEntry format for WeeklyGrid
  // For Shift 2 sections, global periods 3..8 map to relative periods 1..6
  const gridEntries: GridEntry[] = filteredRaw.map((r) => {
    let period = r.time_slots?.period ?? 0
    if (viewMode === 'section' && isShift2 && period >= 3 && period <= 8) {
      period = period - 2
    }

    return {
      id: r.id,
      day_of_week: r.time_slots?.day_of_week ?? 0,
      period,
      course_code: r.courses?.code ?? (r.is_elective ? 'GE' : '—'),
      course_name: r.courses?.name ?? (r.is_elective ? 'Generic Elective (Institute Basket)' : '—'),
      room_name: r.rooms?.name ?? (r.is_elective ? 'Elective Allocation' : '—'),
      faculty_name: r.faculty?.name ?? (r.is_elective ? 'Elective Faculty' : '—'),
      faculty_email: r.faculty?.email ?? '',
      section_name: r.sections?.name ? `${r.sections.name}${r.batch ? ` (B${r.batch})` : ''}` : '',
      is_elective: r.is_elective,
      batch: r.batch,
    }
  })

  // Calculate statistics for the active view
  const theoryCount = filteredRaw.filter((e) => !e.batch).length
  const labCount = filteredRaw.filter((e) => !!e.batch).length

  return (
    <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--border-light)' }}>
      {/* Header & Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid var(--border-light)',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--primary-50)',
                  color: 'var(--primary-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CalendarIcon size={18} />
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Timetable Schedule Matrix
              </h2>
              <span className="badge badge-primary">
                {entries.length} Sessions Total
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>
              Table view: Rows represent weekdays (Mon–Fri), Columns represent time slot periods.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Version Selector (if enabled) */}
            {showVersionSelector && versions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--slate-600)' }}>Version:</span>
                <select
                  value={activeVersionId ?? ''}
                  onChange={(e) => {
                    setActiveVersionId(e.target.value)
                    onVersionChange?.(e.target.value)
                  }}
                  className="form-control"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8125rem' }}
                >
                  {versions.map((ver) => (
                    <option key={ver.id} value={ver.id}>
                      {ver.status.toUpperCase()} ({new Date(ver.created_at).toLocaleDateString()}{' '}
                      {new Date(ver.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Print Button */}
            <button
              onClick={() => window.print()}
              className="btn btn-secondary btn-sm"
              title="Print schedule matrix"
            >
              <span>Print Schedule</span>
            </button>
          </div>
        </div>

        {/* View Mode Switcher & Entity Selectors */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            background: 'var(--slate-50)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
          }}
        >
          {/* Left: View Mode Toggle Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-600)', textTransform: 'uppercase' }}>
              View By:
            </span>
            <div style={{ display: 'inline-flex', padding: 2, backgroundColor: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              <button
                type="button"
                onClick={() => setViewMode('section')}
                className={`btn btn-sm ${viewMode === 'section' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  border: 'none',
                  boxShadow: viewMode === 'section' ? 'var(--shadow-xs)' : 'none',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <BookOpenIcon size={14} />
                <span>Student Sections ({sections.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('faculty')}
                className={`btn btn-sm ${viewMode === 'faculty' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  border: 'none',
                  boxShadow: viewMode === 'faculty' ? 'var(--shadow-xs)' : 'none',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <UsersIcon size={14} />
                <span>Faculty Members ({facultyList.length})</span>
              </button>
            </div>
          </div>

          {/* Right: Entity Selection Dropdown & Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {viewMode === 'section' ? (
              <>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--slate-700)' }}>
                  Select Section:
                </span>
                <select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="form-control"
                  style={{
                    width: 'auto',
                    minWidth: 160,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    padding: '0.4rem 0.75rem',
                  }}
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      Section {sec.name} {sec.semester ? `(Semester ${sec.semester})` : ''}
                    </option>
                  ))}
                </select>

                {/* Quick 1-click pills for sections */}
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {sections.slice(0, 5).map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={`badge ${selectedSectionId === sec.id ? 'badge-primary' : 'badge-neutral'}`}
                      style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                    >
                      {sec.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--slate-700)' }}>
                  Select Faculty:
                </span>
                <select
                  value={selectedFacultyId}
                  onChange={(e) => setSelectedFacultyId(e.target.value)}
                  className="form-control"
                  style={{
                    width: 'auto',
                    minWidth: 180,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    padding: '0.4rem 0.75rem',
                  }}
                >
                  {facultyList.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      {fac.name} {fac.email ? `(${fac.email})` : ''}
                    </option>
                  ))}
                </select>

                {/* Quick 1-click pills for faculty */}
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {facultyList.slice(0, 4).map((fac) => (
                    <button
                      key={fac.id}
                      type="button"
                      onClick={() => setSelectedFacultyId(fac.id)}
                      className={`badge ${selectedFacultyId === fac.id ? 'badge-primary' : 'badge-neutral'}`}
                      style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                    >
                      {fac.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selected Entity Summary Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'rgba(238, 242, 255, 0.45)',
            border: '1px solid var(--primary-100)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 800, color: 'var(--primary-800)', fontSize: '0.9rem' }}>
              {viewMode === 'section'
                ? `Section: ${selectedSection?.name ?? '—'}`
                : `Instructor: ${selectedFaculty?.name ?? '—'}`}
            </span>
            {viewMode === 'section' && selectedSection?.semester && (
              <span className="badge badge-primary">Semester {selectedSection.semester}</span>
            )}
            {viewMode === 'faculty' && selectedFaculty?.email && (
              <span className="badge badge-neutral font-mono">{selectedFaculty.email}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <span className="badge badge-success" style={{ fontWeight: 700 }}>
              {filteredRaw.length} Periods Scheduled
            </span>
            <span className="badge badge-neutral">
              {theoryCount} Theory
            </span>
            <span className="badge badge-info">
              {labCount} Lab Batch Slots
            </span>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <div className="stat-icon indigo" style={{ margin: '0 auto 1rem', width: 48, height: 48 }}>
            <ClockIcon size={24} style={{ animation: 'spin 1.5s linear infinite' }} />
          </div>
          <p className="text-muted" style={{ fontWeight: 600 }}>Loading timetable matrix…</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger">
          <strong>Failed to load timetable:</strong> {error}
        </div>
      ) : (
        <>
          {/* Shift Banner above the Timetable Matrix */}
          {viewMode === 'section' ? (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '0.9rem 1.25rem',
                borderRadius: '8px',
                background:
                  currentShift === 1
                    ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)'
                    : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: currentShift === 1 ? '1.5px solid #FDE68A' : '1.5px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    backgroundColor: currentShift === 1 ? '#FFB900' : '#16a34a',
                    color: currentShift === 1 ? '#1C1917' : '#ffffff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                >
                  {currentShift === 1 ? 'SHIFT 1 (MORNING)' : 'SHIFT 2 (AFTERNOON)'}
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1C1917' }}>
                  {currentShift === 1 ? '08:15 AM – 02:45 PM' : '10:15 AM – 04:45 PM'}
                </span>
                <span style={{ fontSize: '0.825rem', color: '#57534E', fontWeight: 500 }}>
                  • 6 Periods (1 Hour each) • Lunch: 12:15 PM – 12:45 PM
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: currentShift === 1 ? '#92400E' : '#15803d',
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '6px',
                  border: currentShift === 1 ? '1px solid #FDE68A' : '1px solid #bbf7d0',
                }}
              >
                {currentShift === 1
                  ? 'Applicable: 1st & 4th Year (Semesters 1, 2, 7, 8)'
                  : 'Applicable: 2nd & 3rd Year (Semesters 3, 4, 5, 6)'}
              </span>
            </div>
          ) : (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '0.8rem 1.25rem',
                borderRadius: '8px',
                background: '#FAFAF9',
                border: '1.5px solid #E7E5E4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="badge badge-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                  FACULTY COMBINED SCHEDULE
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1C1917' }}>
                  08:15 AM – 04:45 PM
                </span>
                <span style={{ fontSize: '0.825rem', color: '#57534E' }}>
                  • Spanning Shifts 1 & 2 • Common Lunch: 12:15 PM – 12:45 PM
                </span>
              </div>
            </div>
          )}

          <WeeklyGrid
            entries={gridEntries}
            viewMode={viewMode}
            allPeriods={viewMode === 'section' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7, 8]}
            slotTimes={
              viewMode === 'section'
                ? currentShift === 1
                  ? SHIFT_1_TIMES
                  : SHIFT_2_TIMES
                : Object.keys(slotTimes).length > 0
                ? slotTimes
                : FACULTY_TIMES
            }
            emptyMessage={
              viewMode === 'section'
                ? `No sessions scheduled for Section ${selectedSection?.name ?? ''}`
                : `No teaching periods assigned to ${selectedFaculty?.name ?? ''}`
            }
          />
        </>
      )}
    </div>
  )
}
