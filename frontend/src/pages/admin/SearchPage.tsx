import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AdminHeader from '../../components/AdminHeader'
import WeeklyGrid, { GridEntry } from '../../components/WeeklyGrid'
import {
  SearchIcon,
  UsersIcon,
  BookOpenIcon,
  LayersIcon,
  CalendarIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  RefreshIcon,
  XIcon,
} from '../../components/Icons'

type EntityType = 'faculty' | 'course' | 'section'
type CategoryFilter = 'all' | EntityType

interface FacultyItem {
  id: string
  name: string
  email: string
  department_id?: string | null
  max_weekly_load: number
}

interface CourseItem {
  id: string
  code: string
  name: string
  department_id?: string | null
  semester?: number | null
  credits?: number | null
  lectures_per_week?: number | null
  tutorials_per_week?: number | null
  practicals_per_week?: number | null
  sessions_per_week?: number | null
  lab_required: boolean
  is_elective: boolean
}

interface SectionItem {
  id: string
  name: string
  program_id?: string | null
  academic_year?: number | null
  semester?: number | null
  strength: number
  batch_count: number
  shift?: number | null
}

interface DepartmentItem {
  id: string
  name: string
  code: string
}

interface SubstitutionRow {
  id: string
  status: string
  reason?: string | null
  deadline: string
  created_at: string
  requester_name: string
  requester_id: string
  course_code: string
  course_name: string
  section_name: string
  day_of_week?: number
  period?: number
  substitute_name?: string | null
  role?: 'requester' | 'covering'
}

interface PenaltyRow {
  id: string
  reason: string
  created_at: string
  course_code?: string
  faculty_name?: string
}

export default function SearchPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<{ type: EntityType; id: string } | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<string>('matrix')

  // Master Directories
  const [facultyList, setFacultyList] = useState<FacultyItem[]>([])
  const [coursesList, setCoursesList] = useState<CourseItem[]>([])
  const [sectionsList, setSectionsList] = useState<SectionItem[]>([])
  const [departmentsMap, setDepartmentsMap] = useState<Map<string, DepartmentItem>>(new Map())
  const [latestVersionId, setLatestVersionId] = useState<string | null>(null)
  const [loadingMaster, setLoadingMaster] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected Entity Detailed State
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [timetableEntries, setTimetableEntries] = useState<any[]>([])
  const [gridEntries, setGridEntries] = useState<GridEntry[]>([])
  const [substitutions, setSubstitutions] = useState<SubstitutionRow[]>([])
  const [penalties, setPenalties] = useState<PenaltyRow[]>([])
  const [qualifications, setQualifications] = useState<any[]>([])
  const [sectionCourses, setSectionCourses] = useState<any[]>([])
  const [passkeyInfo, setPasskeyInfo] = useState<{ passkey_plain?: string; is_active?: boolean } | null>(null)

  // 1. Initial Load: Fetch Master Entities & Latest Version
  const loadMasterData = useCallback(async () => {
    setLoadingMaster(true)
    setError(null)
    try {
      const [facRes, crsRes, secRes, deptRes, verRes] = await Promise.all([
        supabase.from('faculty').select('id, name, email, department_id, max_weekly_load').order('name').limit(5000),
        supabase
          .from('courses')
          .select('id, code, name, department_id, semester, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective')
          .order('code')
          .limit(5000),
        supabase
          .from('sections')
          .select('id, name, program_id, academic_year, semester, strength, batch_count, shift')
          .order('name')
          .limit(5000),
        supabase.from('departments').select('id, name, code').limit(500),
        supabase.from('timetable_versions').select('id, status, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      if (facRes.error) throw facRes.error
      if (crsRes.error) throw crsRes.error
      if (secRes.error) throw secRes.error

      setFacultyList(facRes.data || [])
      setCoursesList(crsRes.data || [])
      setSectionsList(secRes.data || [])

      const dMap = new Map<string, DepartmentItem>()
      if (deptRes.data) {
        for (const d of deptRes.data) dMap.set(d.id, d)
      }
      setDepartmentsMap(dMap)

      if (verRes.data && verRes.data.length > 0) {
        const pub = verRes.data.find((v) => v.status === 'published')
        setLatestVersionId(pub ? pub.id : verRes.data[0].id)
      }
    } catch (err: any) {
      console.error('Failed to load institutional master data:', err)
      setError(err.message || 'Failed to load master directory.')
    } finally {
      setLoadingMaster(false)
    }
  }, [])

  useEffect(() => {
    loadMasterData()
  }, [loadMasterData])

  // Helper to extract first item if array or return object
  const getFirst = (val: any) => (Array.isArray(val) ? val[0] : val)

  // 2. Fetch Deep Dossier when an entity is selected
  useEffect(() => {
    if (!selectedEntity || !latestVersionId) return

    let cancelled = false
    async function loadEntityDossier() {
      setLoadingDetails(true)
      setActiveSubTab('matrix')
      const { type, id } = selectedEntity!

      try {
        if (type === 'faculty') {
          // A. Fetch Faculty Timetable Entries
          const { data: ttData, error: ttErr } = await supabase
            .from('timetable_entries')
            .select(`
              id, batch, is_elective, faculty_id, room_id, time_slot_id, section_id, course_id,
              courses(id, code, name, semester, credits, lab_required),
              sections(id, name, academic_year, semester, strength, shift),
              rooms(id, name, capacity, room_type),
              time_slots(id, day_of_week, period)
            `)
            .eq('version_id', latestVersionId)
            .eq('faculty_id', id)

          if (ttErr) console.warn('TT query error:', ttErr)

          // B. Fetch Faculty Qualifications
          const { data: qualData } = await supabase
            .from('faculty_qualifications')
            .select('course_id, courses(id, code, name, semester, credits)')
            .eq('faculty_id', id)

          // C. Fetch Substitution Requests & Covering Records
          const { data: subReqData } = await supabase
            .from('substitution_requests')
            .select(`
              id, status, reason, deadline, created_at,
              requester_faculty_id,
              timetable_entries(
                id, batch, is_elective,
                courses(code, name),
                sections(name),
                time_slots(day_of_week, period)
              ),
              substitution_candidates(
                faculty_id, response,
                faculty(name)
              )
            `)
            .or(`requester_faculty_id.eq.${id}`)
            .order('created_at', { ascending: false })
            .limit(100)

          // Covering requests (where this faculty accepted candidate role)
          const { data: coveringData } = await supabase
            .from('substitution_candidates')
            .select(`
              id, response,
              substitution_requests(
                id, status, reason, deadline, created_at,
                requester:faculty!requester_faculty_id(name),
                timetable_entries(
                  courses(code, name),
                  sections(name),
                  time_slots(day_of_week, period)
                )
              )
            `)
            .eq('faculty_id', id)
            .eq('response', 'accepted')
            .order('responded_at', { ascending: false })
            .limit(100)

          // D. Fetch Penalties
          const { data: penData } = await supabase
            .from('substitution_penalties')
            .select('id, reason, created_at, substitution_requests(timetable_entries(courses(code)))')
            .eq('faculty_id', id)
            .order('created_at', { ascending: false })

          if (cancelled) return

          setTimetableEntries(ttData || [])
          setQualifications(qualData || [])

          // Parse Grid Entries for Matrix
          const grids: GridEntry[] = (ttData || []).map((e: any) => ({
            id: e.id,
            day_of_week: e.time_slots?.day_of_week ?? 1,
            period: e.time_slots?.period ?? 1,
            course_code: e.courses?.code ?? (e.is_elective ? 'GE' : '—'),
            course_name: e.courses?.name ?? (e.is_elective ? 'Generic Elective' : '—'),
            room_name: e.rooms?.name ?? '—',
            section_name: e.sections?.name ? `${e.sections.name}${e.batch ? ` (B${e.batch})` : ''}` : '',
            is_elective: Boolean(e.is_elective),
            batch: e.batch,
          }))
          setGridEntries(grids)

          // Format Substitutions
          const subs: SubstitutionRow[] = []
          for (const s of (subReqData || []) as any[]) {
            const accepted = (s.substitution_candidates || []).find((c: any) => c.response === 'accepted')
            const te = getFirst(s.timetable_entries)
            const crs = getFirst(te?.courses)
            const sec = getFirst(te?.sections)
            const ts = getFirst(te?.time_slots)
            const acceptedFac = getFirst(accepted?.faculty)
            subs.push({
              id: s.id,
              status: s.status,
              reason: s.reason,
              deadline: s.deadline,
              created_at: s.created_at,
              requester_id: s.requester_faculty_id,
              requester_name: 'You (Requester)',
              course_code: crs?.code ?? '—',
              course_name: crs?.name ?? '—',
              section_name: sec?.name ?? '—',
              day_of_week: ts?.day_of_week,
              period: ts?.period,
              substitute_name: acceptedFac?.name ?? null,
              role: 'requester',
            })
          }
          for (const c of (coveringData || []) as any[]) {
            const sr = getFirst(c.substitution_requests)
            if (sr) {
              const te = getFirst(sr.timetable_entries)
              const crs = getFirst(te?.courses)
              const sec = getFirst(te?.sections)
              const ts = getFirst(te?.time_slots)
              const req = getFirst(sr.requester)
              subs.push({
                id: sr.id,
                status: sr.status,
                reason: sr.reason,
                deadline: sr.deadline,
                created_at: sr.created_at,
                requester_id: '',
                requester_name: req?.name ?? 'Colleague',
                course_code: crs?.code ?? '—',
                course_name: crs?.name ?? '—',
                section_name: sec?.name ?? '—',
                day_of_week: ts?.day_of_week,
                period: ts?.period,
                substitute_name: 'You (Covering)',
                role: 'covering',
              })
            }
          }
          setSubstitutions(subs)

          // Format Penalties
          const pens: PenaltyRow[] = (penData || []).map((p: any) => ({
            id: p.id,
            reason: p.reason,
            created_at: p.created_at,
            course_code: p.substitution_requests?.timetable_entries?.courses?.code ?? '—',
          }))
          setPenalties(pens)
        } else if (type === 'course') {
          // A. Fetch Course Timetable Entries across all sections
          const { data: ttData, error: ttErr } = await supabase
            .from('timetable_entries')
            .select(`
              id, batch, is_elective, faculty_id, room_id, time_slot_id, section_id, course_id,
              faculty(id, name, email),
              sections(id, name, academic_year, semester, strength, shift),
              rooms(id, name, capacity, room_type),
              time_slots(id, day_of_week, period)
            `)
            .eq('version_id', latestVersionId)
            .eq('course_id', id)

          if (ttErr) console.warn('TT query error:', ttErr)

          // B. Sections mapped via section_courses
          const { data: scData } = await supabase
            .from('section_courses')
            .select('section_id, sections(id, name, semester, academic_year, strength, batch_count, shift)')
            .eq('course_id', id)

          // C. Faculty qualified to teach
          const { data: qualData } = await supabase
            .from('faculty_qualifications')
            .select('faculty_id, faculty(id, name, email, department_id, max_weekly_load)')
            .eq('course_id', id)

          // D. Substitutions involving this course
          const { data: subData } = await supabase
            .from('substitution_requests')
            .select(`
              id, status, reason, deadline, created_at,
              requester:faculty!requester_faculty_id(name),
              timetable_entries!inner(
                course_id,
                sections(name),
                time_slots(day_of_week, period)
              ),
              substitution_candidates(
                response,
                faculty(name)
              )
            `)
            .eq('timetable_entries.course_id', id)
            .order('created_at', { ascending: false })
            .limit(100)

          if (cancelled) return

          setTimetableEntries(ttData || [])
          setSectionCourses(scData || [])
          setQualifications(qualData || [])

          // Parse Grid Entries
          const grids: GridEntry[] = (ttData || []).map((e: any) => ({
            id: e.id,
            day_of_week: e.time_slots?.day_of_week ?? 1,
            period: e.time_slots?.period ?? 1,
            course_code: e.sections?.name ?? 'Section',
            course_name: e.faculty?.name ? `Prof. ${e.faculty.name}` : (e.is_elective ? 'Open Basket' : '—'),
            room_name: e.rooms?.name ?? '—',
            section_name: e.sections?.name ? `${e.sections.name}${e.batch ? ` (B${e.batch})` : ''}` : '',
            faculty_name: e.faculty?.name ?? '',
            is_elective: Boolean(e.is_elective),
            batch: e.batch,
          }))
          setGridEntries(grids)

          const subs: SubstitutionRow[] = ((subData || []) as any[]).map((s: any) => {
            const accepted = (s.substitution_candidates || []).find((c: any) => c.response === 'accepted')
            const te = getFirst(s.timetable_entries)
            const sec = getFirst(te?.sections)
            const ts = getFirst(te?.time_slots)
            const req = getFirst(s.requester)
            const acceptedFac = getFirst(accepted?.faculty)
            return {
              id: s.id,
              status: s.status,
              reason: s.reason,
              deadline: s.deadline,
              created_at: s.created_at,
              requester_id: '',
              requester_name: req?.name ?? 'Requester',
              course_code: '',
              course_name: '',
              section_name: sec?.name ?? '—',
              day_of_week: ts?.day_of_week,
              period: ts?.period,
              substitute_name: acceptedFac?.name ?? null,
            }
          })
          setSubstitutions(subs)
        } else if (type === 'section') {
          // A. Fetch Section Timetable Entries
          const { data: ttData, error: ttErr } = await supabase
            .from('timetable_entries')
            .select(`
              id, batch, is_elective, faculty_id, room_id, time_slot_id, section_id, course_id,
              courses(id, code, name, semester, credits, lab_required),
              faculty(id, name, email),
              rooms(id, name, capacity, room_type),
              time_slots(id, day_of_week, period)
            `)
            .eq('version_id', latestVersionId)
            .eq('section_id', id)

          if (ttErr) console.warn('TT query error:', ttErr)

          // B. Section Curriculum Courses
          const { data: scData } = await supabase
            .from('section_courses')
            .select('course_id, courses(id, code, name, semester, credits, lectures_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)')
            .eq('section_id', id)

          // C. Passkey status
          const { data: pkData } = await supabase
            .from('section_passkeys')
            .select('passkey_plain, is_active')
            .eq('section_id', id)
            .maybeSingle()

          // D. Substitutions for this section
          const { data: subData } = await supabase
            .from('substitution_requests')
            .select(`
              id, status, reason, deadline, created_at,
              requester:faculty!requester_faculty_id(name),
              timetable_entries!inner(
                section_id,
                courses(code, name),
                time_slots(day_of_week, period)
              ),
              substitution_candidates(
                response,
                faculty(name)
              )
            `)
            .eq('timetable_entries.section_id', id)
            .order('created_at', { ascending: false })
            .limit(100)

          if (cancelled) return

          setTimetableEntries(ttData || [])
          setSectionCourses(scData || [])
          setPasskeyInfo(pkData || null)

          // Parse Grid Entries
          const grids: GridEntry[] = (ttData || []).map((e: any) => ({
            id: e.id,
            day_of_week: e.time_slots?.day_of_week ?? 1,
            period: e.time_slots?.period ?? 1,
            course_code: e.courses?.code ?? (e.is_elective ? 'GE' : '—'),
            course_name: e.courses?.name ?? (e.is_elective ? 'Generic Elective' : '—'),
            room_name: e.rooms?.name ?? '—',
            faculty_name: e.is_elective ? '' : (e.faculty?.name ?? '—'),
            faculty_email: e.faculty?.email ?? '',
            section_name: '',
            is_elective: Boolean(e.is_elective),
            batch: e.batch,
          }))
          setGridEntries(grids)

          const subs: SubstitutionRow[] = ((subData || []) as any[]).map((s: any) => {
            const accepted = (s.substitution_candidates || []).find((c: any) => c.response === 'accepted')
            const te = getFirst(s.timetable_entries)
            const crs = getFirst(te?.courses)
            const ts = getFirst(te?.time_slots)
            const req = getFirst(s.requester)
            const acceptedFac = getFirst(accepted?.faculty)
            return {
              id: s.id,
              status: s.status,
              reason: s.reason,
              deadline: s.deadline,
              created_at: s.created_at,
              requester_id: '',
              requester_name: req?.name ?? 'Instructor',
              course_code: crs?.code ?? '—',
              course_name: crs?.name ?? '—',
              section_name: '',
              day_of_week: ts?.day_of_week,
              period: ts?.period,
              substitute_name: acceptedFac?.name ?? null,
            }
          })
          setSubstitutions(subs)
        }
      } catch (err: any) {
        console.error('Failed to load dossier:', err)
        setError(err.message || 'Error loading detailed entity dossier.')
      } finally {
        if (!cancelled) setLoadingDetails(false)
      }
    }

    loadEntityDossier()

    return () => {
      cancelled = true
    }
  }, [selectedEntity, latestVersionId])

  // 3. Filtered Results for Search View
  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    let matchedFaculty: FacultyItem[] = []
    let matchedCourses: CourseItem[] = []
    let matchedSections: SectionItem[] = []

    if (activeCategory === 'all' || activeCategory === 'faculty') {
      matchedFaculty = facultyList.filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q) ||
          (f.department_id && departmentsMap.get(f.department_id)?.name.toLowerCase().includes(q))
      )
    }

    if (activeCategory === 'all' || activeCategory === 'course') {
      matchedCourses = coursesList.filter(
        (c) =>
          !q ||
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          (c.department_id && departmentsMap.get(c.department_id)?.name.toLowerCase().includes(q))
      )
    }

    if (activeCategory === 'all' || activeCategory === 'section') {
      matchedSections = sectionsList.filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          `year ${s.academic_year ?? ''}`.includes(q) ||
          `sem ${s.semester ?? ''}`.includes(q)
      )
    }

    return {
      faculty: matchedFaculty,
      courses: matchedCourses,
      sections: matchedSections,
      totalCount: matchedFaculty.length + matchedCourses.length + matchedSections.length,
    }
  }, [searchQuery, activeCategory, facultyList, coursesList, sectionsList, departmentsMap])

  // Current entity metadata when selected
  const activeFaculty = useMemo(
    () => (selectedEntity?.type === 'faculty' ? facultyList.find((f) => f.id === selectedEntity.id) : null),
    [selectedEntity, facultyList]
  )
  const activeCourse = useMemo(
    () => (selectedEntity?.type === 'course' ? coursesList.find((c) => c.id === selectedEntity.id) : null),
    [selectedEntity, coursesList]
  )
  const activeSection = useMemo(
    () => (selectedEntity?.type === 'section' ? sectionsList.find((s) => s.id === selectedEntity.id) : null),
    [selectedEntity, sectionsList]
  )

  // Derived Metrics for Dossier
  const facultyMetrics = useMemo(() => {
    if (!activeFaculty) return null
    const weeklyHours = timetableEntries.length
    const uniqueCourseIds = new Set(timetableEntries.map((e) => e.course_id).filter(Boolean))
    const uniqueSectionIds = new Set(timetableEntries.map((e) => e.section_id).filter(Boolean))
    const loadPercent = Math.min(100, Math.round((weeklyHours / (activeFaculty.max_weekly_load || 24)) * 100))
    return {
      weeklyHours,
      maxLoad: activeFaculty.max_weekly_load || 24,
      loadPercent,
      coursesCount: uniqueCourseIds.size,
      sectionsCount: uniqueSectionIds.size,
      subsCount: substitutions.length,
      penaltiesCount: penalties.length,
    }
  }, [activeFaculty, timetableEntries, substitutions, penalties])

  const courseMetrics = useMemo(() => {
    if (!activeCourse) return null
    const totalSlots = timetableEntries.length
    const uniqueFacultyIds = new Set(timetableEntries.map((e) => e.faculty_id).filter(Boolean))
    const uniqueSectionIds = new Set(timetableEntries.map((e) => e.section_id).filter(Boolean))
    let totalStudents = 0
    uniqueSectionIds.forEach((sId) => {
      const sec = sectionsList.find((s) => s.id === sId)
      if (sec) totalStudents += sec.strength || 0
    })
    return {
      totalSlots,
      facultyCount: uniqueFacultyIds.size,
      sectionsCount: uniqueSectionIds.size,
      totalStudents,
      subsCount: substitutions.length,
    }
  }, [activeCourse, timetableEntries, sectionsList, substitutions])

  const sectionMetrics = useMemo(() => {
    if (!activeSection) return null
    const totalPeriods = timetableEntries.length
    const uniqueCourseIds = new Set(timetableEntries.map((e) => e.course_id).filter(Boolean))
    const uniqueFacultyIds = new Set(timetableEntries.map((e) => e.faculty_id).filter(Boolean))
    return {
      totalPeriods,
      coursesCount: uniqueCourseIds.size,
      facultyCount: uniqueFacultyIds.size,
      strength: activeSection.strength,
      shift: activeSection.shift ?? (activeSection.academic_year === 2 || activeSection.academic_year === 3 ? 2 : 1),
      subsCount: substitutions.length,
    }
  }, [activeSection, timetableEntries, substitutions])

  return (
    <div className="admin-cal-wrapper">
      <AdminHeader />

      {/* Main Container */}
      <div style={{ maxWidth: 1280, margin: '16px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Page Top Heading */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: 'var(--primary-100)',
                  color: 'var(--primary-800)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SearchIcon size={18} />
              </div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Institutional 360° Search &amp; Intelligence
              </h1>
            </div>
            <p className="admin-mu" style={{ fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Search across faculty, courses, and student sections to inspect schedules, teaching assignments, contact details, and audit records.
            </p>
          </div>

          {selectedEntity && (
            <button
              type="button"
              onClick={() => setSelectedEntity(null)}
              className="admin-btn admin-btn-outline admin-btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <XIcon size={14} />
              <span>Back to Search Directory</span>
            </button>
          )}
        </div>

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              color: '#991B1B',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Universal Search & Category Filter Bar */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 12,
            padding: 16,
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Search Input Row */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'absolute', left: 14, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <SearchIcon size={18} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search faculty name/email, course code/name (e.g. CS201), or section (e.g. CSE-Y2-A)..."
              style={{
                width: '100%',
                padding: '12px 42px 12px 42px',
                borderRadius: 8,
                border: '1.5px solid var(--border-strong)',
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                background: 'var(--bg-app)',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#FFB900')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-strong)')}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                }}
                title="Clear search"
              >
                <XIcon size={16} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  { key: 'all', label: 'All Entities', count: facultyList.length + coursesList.length + sectionsList.length, icon: LayersIcon },
                  { key: 'faculty', label: 'Faculty', count: facultyList.length, icon: UsersIcon },
                  { key: 'course', label: 'Courses', count: coursesList.length, icon: BookOpenIcon },
                  { key: 'section', label: 'Class Sections', count: sectionsList.length, icon: CalendarIcon },
                ] as const
              ).map(({ key, label, count, icon: IconComp }) => {
                const isSelected = activeCategory === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveCategory(key)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      border: isSelected ? '2px solid #FFB900' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? '#FFFBEB' : 'var(--bg-surface)',
                      color: isSelected ? '#1C1917' : 'var(--text-secondary)',
                      boxShadow: isSelected ? '0 0 0 1px #FFB900, 0 1px 3px rgba(255, 185, 0, 0.25)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <IconComp size={14} />
                    <span>{label}</span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        background: isSelected ? '#FEF3C7' : 'var(--bg-subtle)',
                        color: isSelected ? '#92400E' : 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: 10,
                        fontWeight: 600,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <span className="admin-mu" style={{ fontSize: '0.75rem' }}>
              Showing {filteredResults.totalCount} matches across master directory
            </span>
          </div>
        </div>

        {/* SECTION A: DETAILED DOSSIER VIEW (When an entity is selected) */}
        {selectedEntity && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Header Profile Card */}
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1.5px solid #FFB900',
                borderRadius: 12,
                padding: '20px 24px',
                boxShadow: '0 2px 8px rgba(255, 185, 0, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              {/* Left Identity Block */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 12,
                    backgroundColor: '#FEF3C7',
                    border: '2px solid #FFB900',
                    color: '#92400E',
                    fontSize: '1.3rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selectedEntity.type === 'faculty' ? (
                    activeFaculty?.name.charAt(0).toUpperCase() || 'F'
                  ) : selectedEntity.type === 'course' ? (
                    <BookOpenIcon size={24} />
                  ) : (
                    <CalendarIcon size={24} />
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                      {selectedEntity.type === 'faculty' && activeFaculty?.name}
                      {selectedEntity.type === 'course' && `${activeCourse?.code} — ${activeCourse?.name}`}
                      {selectedEntity.type === 'section' && activeSection?.name}
                    </h2>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        textTransform: 'uppercase',
                        backgroundColor: '#FFB900',
                        color: '#1C1917',
                      }}
                    >
                      {selectedEntity.type}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {selectedEntity.type === 'faculty' && (
                      <>
                        <span>✉ {activeFaculty?.email}</span>
                        <span>•</span>
                        <span>
                          🏛 {activeFaculty?.department_id ? departmentsMap.get(activeFaculty.department_id)?.name || 'Department' : 'General Faculty'}
                        </span>
                        <span>•</span>
                        <span>Cap: {activeFaculty?.max_weekly_load || 24} hrs/week</span>
                      </>
                    )}
                    {selectedEntity.type === 'course' && (
                      <>
                        <span>Credits: {activeCourse?.credits ?? '—'}</span>
                        <span>•</span>
                        <span>Semester: {activeCourse?.semester ?? '—'}</span>
                        <span>•</span>
                        <span>{activeCourse?.is_elective ? 'Generic Elective (Basket)' : 'Core Theory'}</span>
                        <span>•</span>
                        <span>{activeCourse?.lab_required ? 'Lab Required' : 'Theory Only'}</span>
                      </>
                    )}
                    {selectedEntity.type === 'section' && (
                      <>
                        <span>Year {activeSection?.academic_year} • Semester {activeSection?.semester}</span>
                        <span>•</span>
                        <span>Strength: {activeSection?.strength} Students</span>
                        <span>•</span>
                        <span>{activeSection?.batch_count} Lab Batches</span>
                        <span>•</span>
                        <span>
                          {sectionMetrics?.shift === 2
                            ? 'Shift 2 (10:15 – 16:45)'
                            : 'Shift 1 (08:15 – 14:45)'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Action Button */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link
                  to="/admin/timetable"
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <CalendarIcon size={14} />
                  <span>Open in Timetable Matrix</span>
                </Link>
              </div>
            </div>

            {/* 2. Key Metrics Row */}
            {selectedEntity.type === 'faculty' && facultyMetrics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Weekly Teaching Load</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {facultyMetrics.weeklyHours}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {facultyMetrics.maxLoad} hrs</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${facultyMetrics.loadPercent}%`,
                        backgroundColor: facultyMetrics.weeklyHours > facultyMetrics.maxLoad ? '#EF4444' : '#FFB900',
                      }}
                    />
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Assigned Courses</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {facultyMetrics.coursesCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Active subjects taught</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Sections Taught</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {facultyMetrics.sectionsCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Student class groups</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Substitution Records</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {facultyMetrics.subsCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Requests initiated/covered</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Penalty Incurred</span>
                  <span
                    style={{
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      color: facultyMetrics.penaltiesCount > 0 ? '#DC2626' : 'var(--emerald-600)',
                      display: 'block',
                      marginTop: 4,
                    }}
                  >
                    {facultyMetrics.penaltiesCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Audit non-responses</span>
                </div>
              </div>
            )}

            {selectedEntity.type === 'course' && courseMetrics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Scheduled Sessions</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {courseMetrics.totalSlots}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Total weekly periods</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Assigned Faculty</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {courseMetrics.facultyCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Teachers scheduled</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Enrolled Sections</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {courseMetrics.sectionsCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Classes studying subject</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Total Students</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {courseMetrics.totalStudents}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Enrolled pupil count</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Substitutions Raised</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {courseMetrics.subsCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Requests on record</span>
                </div>
              </div>
            )}

            {selectedEntity.type === 'section' && sectionMetrics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Weekly Class Periods</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {sectionMetrics.totalPeriods}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Class hours/week</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Curriculum Subjects</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {sectionMetrics.coursesCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Active courses</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Assigned Instructors</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {sectionMetrics.facultyCount}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Faculty teaching class</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Class Strength</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: 4 }}>
                    {sectionMetrics.strength}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Enrolled students</span>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 8, padding: 14 }}>
                  <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block' }}>Student Passkey Status</span>
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 800,
                      color: passkeyInfo?.is_active ? 'var(--emerald-600)' : 'var(--text-muted)',
                      display: 'block',
                      marginTop: 6,
                    }}
                  >
                    {passkeyInfo?.is_active ? `Active (${passkeyInfo.passkey_plain})` : 'Not Provisioned'}
                  </span>
                  <span className="admin-mu" style={{ fontSize: '0.75rem' }}>Student view login</span>
                </div>
              </div>
            )}

            {/* 3. Sub-Tabs Header */}
            <div style={{ borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 8, marginTop: 8 }}>
              {[
                { id: 'matrix', label: 'Weekly Timetable Matrix', icon: CalendarIcon },
                {
                  id: 'courses',
                  label:
                    selectedEntity.type === 'faculty'
                      ? 'Courses & Qualifications'
                      : selectedEntity.type === 'course'
                      ? 'Assigned Faculty'
                      : 'Curriculum Subjects',
                  icon: BookOpenIcon,
                },
                {
                  id: 'sections',
                  label:
                    selectedEntity.type === 'faculty'
                      ? 'Classes & Sections'
                      : selectedEntity.type === 'course'
                      ? 'Enrolled Sections'
                      : 'Faculty Roster',
                  icon: UsersIcon,
                },
                {
                  id: 'substitutions',
                  label:
                    selectedEntity.type === 'faculty'
                      ? `Substitutions & Penalties (${substitutions.length + penalties.length})`
                      : `Substitutions Log (${substitutions.length})`,
                  icon: AlertTriangleIcon,
                },
              ].map(({ id, label, icon: SubIcon }) => {
                const isActive = activeSubTab === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSubTab(id)}
                    style={{
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '3px solid #FFB900' : '3px solid transparent',
                      color: isActive ? '#1C1917' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <SubIcon size={15} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>

            {/* 4. Sub-Tab Content Panels */}
            {loadingDetails ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 8 }}>
                <RefreshIcon size={24} style={{ animation: 'spin 1s linear infinite', color: '#FFB900' }} />
                <p className="admin-mu" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                  Loading comprehensive dossier records…
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* SUBTAB 1: TIMETABLE MATRIX */}
                {activeSubTab === 'matrix' && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {selectedEntity.type === 'faculty' && 'Full Weekly Schedule Matrix'}
                        {selectedEntity.type === 'course' && 'Course Schedule Allocations Across All Sections'}
                        {selectedEntity.type === 'section' && 'Section Weekly Class Schedule'}
                      </span>
                      <span className="admin-mu" style={{ fontSize: '0.75rem' }}>
                        Version: {latestVersionId?.slice(0, 8)} • Active Schedule Grid
                      </span>
                    </div>

                    <WeeklyGrid
                      entries={gridEntries}
                      viewMode={selectedEntity.type === 'section' ? 'section' : 'faculty'}
                      emptyMessage="No scheduled timetable entries found for this entity in the active version."
                    />
                  </div>
                )}

                {/* SUBTAB 2: COURSES & QUALIFICATIONS */}
                {activeSubTab === 'courses' && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 20 }}>
                    {selectedEntity.type === 'faculty' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                            Currently Assigned Teaching Courses
                          </h3>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                                  <th style={{ padding: '8px 12px' }}>Code</th>
                                  <th style={{ padding: '8px 12px' }}>Course Title</th>
                                  <th style={{ padding: '8px 12px' }}>Semester</th>
                                  <th style={{ padding: '8px 12px' }}>Type</th>
                                  <th style={{ padding: '8px 12px' }}>Weekly Sessions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from(new Set(timetableEntries.map((e) => e.course_id))).map((cId) => {
                                  const crs = coursesList.find((c) => c.id === cId)
                                  const count = timetableEntries.filter((e) => e.course_id === cId).length
                                  if (!crs) return null
                                  return (
                                    <tr key={cId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                      <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{crs.code}</td>
                                      <td style={{ padding: '10px 12px' }}>{crs.name}</td>
                                      <td style={{ padding: '10px 12px' }}>Sem {crs.semester ?? '—'}</td>
                                      <td style={{ padding: '10px 12px' }}>
                                        {crs.is_elective ? 'Generic Elective' : crs.lab_required ? 'Core Lab' : 'Core Theory'}
                                      </td>
                                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>{count} hrs/week</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                            Certified / Qualified Courses
                          </h3>
                          {qualifications.length === 0 ? (
                            <p className="admin-mu" style={{ fontSize: '0.85rem' }}>No specific course qualification restrictions on record.</p>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {qualifications.map((q: any) => (
                                <div
                                  key={q.course_id}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-light)',
                                    background: 'var(--bg-app)',
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  <strong>{q.courses?.code}</strong> — {q.courses?.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedEntity.type === 'course' && (
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                          Faculty Instructors Assigned to this Course
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '8px 12px' }}>Instructor</th>
                                <th style={{ padding: '8px 12px' }}>Email</th>
                                <th style={{ padding: '8px 12px' }}>Department</th>
                                <th style={{ padding: '8px 12px' }}>Sections Handled</th>
                                <th style={{ padding: '8px 12px' }}>Weekly Periods</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from(new Set(timetableEntries.map((e) => e.faculty_id).filter(Boolean))).map((fId) => {
                                const fac = facultyList.find((f) => f.id === fId)
                                const entries = timetableEntries.filter((e) => e.faculty_id === fId)
                                const secNames = Array.from(new Set(entries.map((e) => e.sections?.name).filter(Boolean)))
                                if (!fac) return null
                                return (
                                  <tr key={fId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{fac.name}</td>
                                    <td style={{ padding: '10px 12px' }}>{fac.email}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                      {fac.department_id ? departmentsMap.get(fac.department_id)?.name || 'Dept' : '—'}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>{secNames.join(', ')}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{entries.length} hrs</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {selectedEntity.type === 'section' && (
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                          Curriculum Courses Enrolled for this Section
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '8px 12px' }}>Code</th>
                                <th style={{ padding: '8px 12px' }}>Course Title</th>
                                <th style={{ padding: '8px 12px' }}>Semester</th>
                                <th style={{ padding: '8px 12px' }}>Credits</th>
                                <th style={{ padding: '8px 12px' }}>Assigned Instructor</th>
                                <th style={{ padding: '8px 12px' }}>Weekly Periods</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sectionCourses.map((sc: any) => {
                                const crs = sc.courses
                                const entries = timetableEntries.filter((e) => e.course_id === crs?.id)
                                const facNames = Array.from(new Set(entries.map((e) => e.faculty?.name).filter(Boolean)))
                                if (!crs) return null
                                return (
                                  <tr key={crs.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{crs.code}</td>
                                    <td style={{ padding: '10px 12px' }}>{crs.name}</td>
                                    <td style={{ padding: '10px 12px' }}>Sem {crs.semester ?? '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>{crs.credits ?? '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                      {crs.is_elective ? 'Generic Elective (Open Choice)' : facNames.join(', ') || 'Pending'}
                                    </td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{entries.length} hrs</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB 3: CLASSES & SECTIONS / ROSTER */}
                {activeSubTab === 'sections' && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 20 }}>
                    {selectedEntity.type === 'faculty' && (
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                          Class Sections Taught by this Faculty
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '8px 12px' }}>Section</th>
                                <th style={{ padding: '8px 12px' }}>Year / Sem</th>
                                <th style={{ padding: '8px 12px' }}>Course Taught</th>
                                <th style={{ padding: '8px 12px' }}>Class Strength</th>
                                <th style={{ padding: '8px 12px' }}>Weekly Hours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from(new Set(timetableEntries.map((e) => e.section_id).filter(Boolean))).map((sId) => {
                                const sec = sectionsList.find((s) => s.id === sId)
                                const entries = timetableEntries.filter((e) => e.section_id === sId)
                                const courseTitles = Array.from(new Set(entries.map((e) => e.courses?.name).filter(Boolean)))
                                if (!sec) return null
                                return (
                                  <tr key={sId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{sec.name}</td>
                                    <td style={{ padding: '10px 12px' }}>Y{sec.academic_year} / Sem {sec.semester}</td>
                                    <td style={{ padding: '10px 12px' }}>{courseTitles.join(', ')}</td>
                                    <td style={{ padding: '10px 12px' }}>{sec.strength} students</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{entries.length} hrs</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {selectedEntity.type === 'course' && (
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                          Detailed Section &amp; Slot Schedule Allocations
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '8px 12px' }}>Day &amp; Period</th>
                                <th style={{ padding: '8px 12px' }}>Section</th>
                                <th style={{ padding: '8px 12px' }}>Batch</th>
                                <th style={{ padding: '8px 12px' }}>Instructor</th>
                                <th style={{ padding: '8px 12px' }}>Classroom / Lab</th>
                              </tr>
                            </thead>
                            <tbody>
                              {timetableEntries.map((e: any) => {
                                const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
                                return (
                                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                      {dayNames[e.time_slots?.day_of_week] || 'Day'} — Period {e.time_slots?.period}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{e.sections?.name}</td>
                                    <td style={{ padding: '8px 12px' }}>{e.batch ? `Batch ${e.batch}` : 'Entire Class'}</td>
                                    <td style={{ padding: '8px 12px' }}>{e.faculty?.name || (e.is_elective ? 'Generic Elective' : '—')}</td>
                                    <td style={{ padding: '8px 12px' }}>{e.rooms?.name || '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {selectedEntity.type === 'section' && (
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
                          Faculty Instructor Roster for this Class
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '8px 12px' }}>Teacher Name</th>
                                <th style={{ padding: '8px 12px' }}>Email Address</th>
                                <th style={{ padding: '8px 12px' }}>Department</th>
                                <th style={{ padding: '8px 12px' }}>Courses Taught</th>
                                <th style={{ padding: '8px 12px' }}>Weekly Periods</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from(new Set(timetableEntries.map((e) => e.faculty_id).filter(Boolean))).map((fId) => {
                                const fac = facultyList.find((f) => f.id === fId)
                                const entries = timetableEntries.filter((e) => e.faculty_id === fId)
                                const crsTitles = Array.from(new Set(entries.map((e) => e.courses?.name).filter(Boolean)))
                                if (!fac) return null
                                return (
                                  <tr key={fId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{fac.name}</td>
                                    <td style={{ padding: '10px 12px' }}>{fac.email}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                      {fac.department_id ? departmentsMap.get(fac.department_id)?.name || 'Dept' : '—'}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>{crsTitles.join(', ')}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{entries.length} hrs</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB 4: SUBSTITUTIONS & PENALTIES AUDIT */}
                {activeSubTab === 'substitutions' && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 20 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                      Substitution Requests History
                    </h3>
                    {substitutions.length === 0 ? (
                      <p className="admin-mu" style={{ fontSize: '0.85rem' }}>No substitution records found for this entity.</p>
                    ) : (
                      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                              <th style={{ padding: '8px 12px' }}>Date</th>
                              <th style={{ padding: '8px 12px' }}>Role</th>
                              <th style={{ padding: '8px 12px' }}>Course &amp; Class</th>
                              <th style={{ padding: '8px 12px' }}>Day/Period</th>
                              <th style={{ padding: '8px 12px' }}>Status</th>
                              <th style={{ padding: '8px 12px' }}>Substitute Assigned</th>
                              <th style={{ padding: '8px 12px' }}>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {substitutions.map((s) => (
                              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '10px 12px' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                  {s.role === 'covering' ? (
                                    <span style={{ color: 'var(--emerald-600)' }}>Covering</span>
                                  ) : (
                                    <span>Requester</span>
                                  )}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  <strong>{s.course_code}</strong> ({s.section_name})
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  {s.day_of_week ? `Day ${s.day_of_week} • P${s.period}` : '—'}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span
                                    className={`admin-tag ${
                                      s.status === 'assigned'
                                        ? 'assigned'
                                        : s.status === 'open'
                                        ? 'conflict'
                                        : 'unfilled'
                                    }`}
                                    style={{ fontSize: '0.75rem' }}
                                  >
                                    {s.status}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px' }}>{s.substitute_name || '—'}</td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{s.reason || 'Leave'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Faculty Incurred Penalties Section */}
                    {selectedEntity.type === 'faculty' && (
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, color: '#DC2626' }}>
                          Incurred Penalty Records ({penalties.length})
                        </h3>
                        {penalties.length === 0 ? (
                          <div
                            style={{
                              padding: '12px 14px',
                              backgroundColor: 'var(--emerald-50)',
                              border: '1px solid var(--emerald-100)',
                              borderRadius: 8,
                              color: 'var(--emerald-700)',
                              fontSize: '0.85rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <CheckCircleIcon size={16} />
                            <span>Clean Audit Record: Zero penalties recorded for this faculty member.</span>
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ background: '#FEF2F2', textAlign: 'left', borderBottom: '1px solid #FECACA' }}>
                                  <th style={{ padding: '8px 12px' }}>Timestamp</th>
                                  <th style={{ padding: '8px 12px' }}>Violation Reason</th>
                                  <th style={{ padding: '8px 12px' }}>Course Context</th>
                                  <th style={{ padding: '8px 12px' }}>Penalty Severity</th>
                                </tr>
                              </thead>
                              <tbody>
                                {penalties.map((p) => (
                                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '10px 12px' }}>{new Date(p.created_at).toLocaleString()}</td>
                                    <td style={{ padding: '10px 12px', textTransform: 'capitalize', fontWeight: 600 }}>
                                      {p.reason === 'timed_out' ? 'Unresponsive (Timed Out)' : 'Declined Substitution (Rejected)'}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>{p.course_code || '—'}</td>
                                    <td style={{ padding: '10px 12px', color: '#DC2626', fontWeight: 700 }}>1 Violation Point</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECTION B: SEARCH RESULTS DIRECTORY (When no entity is selected or searching) */}
        {!selectedEntity && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {loadingMaster ? (
              <div style={{ padding: '4rem 1rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 12 }}>
                <RefreshIcon size={28} style={{ animation: 'spin 1s linear infinite', color: '#FFB900' }} />
                <p className="admin-mu" style={{ fontSize: '0.9rem', marginTop: 12 }}>
                  Indexing institutional database…
                </p>
              </div>
            ) : (
              <>
                {/* 1. FACULTY RESULTS */}
                {(activeCategory === 'all' || activeCategory === 'faculty') && filteredResults.faculty.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <UsersIcon size={18} />
                      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Faculty Directory ({filteredResults.faculty.length})
                      </h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                      {filteredResults.faculty.slice(0, 30).map((f) => (
                        <div
                          key={f.id}
                          onClick={() => setSelectedEntity({ type: 'faculty', id: f.id })}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 10,
                            padding: '14px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#FFB900'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 185, 0, 0.18)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-light)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                              {f.name}
                            </span>
                            <span className="admin-mu" style={{ fontSize: '0.8rem', display: 'block', marginTop: 2 }}>
                              {f.email}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>
                              🏛 {f.department_id ? departmentsMap.get(f.department_id)?.name || 'Dept' : 'General Faculty'} • Cap: {f.max_weekly_load} hrs
                            </span>
                          </div>

                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <ArrowRightIcon size={14} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. COURSES RESULTS */}
                {(activeCategory === 'all' || activeCategory === 'course') && filteredResults.courses.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <BookOpenIcon size={18} />
                      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Course Catalog ({filteredResults.courses.length})
                      </h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                      {filteredResults.courses.slice(0, 30).map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setSelectedEntity({ type: 'course', id: c.id })}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 10,
                            padding: '14px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#FFB900'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 185, 0, 0.18)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-light)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: '#92400E' }}>
                                {c.code}
                              </span>
                              {c.is_elective && (
                                <span style={{ fontSize: '0.65rem', background: '#FEF3C7', color: '#92400E', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>
                                  ELECTIVE
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: 2 }}>
                              {c.name}
                            </span>
                            <span className="admin-mu" style={{ fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                              Sem {c.semester ?? '—'} • {c.credits ?? 0} Credits • {c.lab_required ? 'Lab Required' : 'Theory Only'}
                            </span>
                          </div>

                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <ArrowRightIcon size={14} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. SECTION RESULTS */}
                {(activeCategory === 'all' || activeCategory === 'section') && filteredResults.sections.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <CalendarIcon size={18} />
                      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Class Sections ({filteredResults.sections.length})
                      </h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                      {filteredResults.sections.slice(0, 30).map((s) => (
                        <div
                          key={s.id}
                          onClick={() => setSelectedEntity({ type: 'section', id: s.id })}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 10,
                            padding: '14px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#FFB900'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 185, 0, 0.18)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-light)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                              {s.name}
                            </span>
                            <span className="admin-mu" style={{ fontSize: '0.8rem', display: 'block', marginTop: 2 }}>
                              Year {s.academic_year} • Semester {s.semester}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>
                              👥 {s.strength} Students • {s.batch_count} Batches • Shift {s.shift ?? (s.academic_year === 2 || s.academic_year === 3 ? 2 : 1)}
                            </span>
                          </div>

                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <ArrowRightIcon size={14} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {filteredResults.totalCount === 0 && (
                  <div style={{ padding: '4rem 1rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 12 }}>
                    <SearchIcon size={32} style={{ color: 'var(--text-muted)' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginTop: 12, color: 'var(--text-primary)' }}>
                      No matching records found
                    </h3>
                    <p className="admin-mu" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                      Try adjusting your keywords or clearing the category filter.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
