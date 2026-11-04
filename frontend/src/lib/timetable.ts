import { supabase } from './supabase'

/** Shape expected by the solver's POST /generate (see solver/app/schemas.py). */
export interface GenerateRequest {
  institution_id: string
  sections: { id: string; strength: number; batch_count?: number }[]
  courses: { id: string; sessions_per_week: number; lab_required: boolean; is_elective: boolean }[]
  section_courses: { section_id: string; course_id: string; sessions_per_week: number | null }[]
  faculty: { id: string; max_weekly_load: number }[]
  rooms: { id: string; room_type: string; capacity: number }[]
  time_slots: { id: string; day_of_week: number; period: number }[]
  qualifications: { faculty_id: string; course_id: string }[]
  elective_blocks: string[]
  weights: { gap: number; spread: number; load: number }
  time_limit_seconds: number
}

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(`Failed to load ${what}: ${error.message}`)
  return (data ?? []) as T
}

async function fetchSections(): Promise<{ id: string; program_id?: string; strength: number; batch_count?: number }[]> {
  const res = await supabase.from('sections').select('id, program_id, strength, batch_count')
  if (res.error) {
    const fb = await supabase.from('sections').select('id, program_id, strength')
    if (fb.error) throw new Error(`Failed to load sections: ${fb.error.message}`)
    return (fb.data ?? []).map((s) => ({ ...s, batch_count: 1 }))
  }
  return (res.data ?? []).map((s) => ({ ...s, batch_count: s.batch_count ?? 1 }))
}

async function fetchCurriculumMappings(
  sections: { id: string; program_id?: string }[],
): Promise<{ section_id: string; course_id: string; sessions_per_week: number | null }[]> {
  // 1. Try reading program_courses first (new curriculum model)
  const { data: progCourses, error: pErr } = await supabase
    .from('program_courses')
    .select('program_id, course_id, sessions_per_week')

  if (!pErr && progCourses && progCourses.length > 0) {
    const progMap = new Map<string, { course_id: string; sessions_per_week: number | null }[]>()
    for (const pc of progCourses) {
      if (!progMap.has(pc.program_id)) progMap.set(pc.program_id, [])
      progMap.get(pc.program_id)!.push({
        course_id: pc.course_id,
        sessions_per_week: pc.sessions_per_week,
      })
    }

    const mapped: { section_id: string; course_id: string; sessions_per_week: number | null }[] = []
    for (const sec of sections) {
      if (sec.program_id && progMap.has(sec.program_id)) {
        for (const c of progMap.get(sec.program_id)!) {
          mapped.push({
            section_id: sec.id,
            course_id: c.course_id,
            sessions_per_week: c.sessions_per_week,
          })
        }
      }
    }

    if (mapped.length > 0) return mapped
  }

  // 2. Fall back to section_courses if program_courses is empty
  const { data: secCourses, error: sErr } = await supabase
    .from('section_courses')
    .select('section_id, course_id, sessions_per_week')

  if (sErr) throw new Error(`Failed to load course curriculum mapping: ${sErr.message}`)
  return (secCourses ?? []) as { section_id: string; course_id: string; sessions_per_week: number | null }[]
}

/** Assemble the solver snapshot from current Supabase data (admin only). */
export async function buildSnapshot(): Promise<GenerateRequest> {
  const institutions = await must<{ id: string }[]>(
    supabase.from('institutions').select('id').limit(1),
    'institutions',
  )
  if (institutions.length === 0) throw new Error('No institution configured.')
  const institution_id = institutions[0].id

  const rawSections = await fetchSections()
  const [courses, section_courses, faculty, rooms, time_slots, qualifications, blocks, constraints] =
    await Promise.all([
      must<{ id: string; sessions_per_week: number; lab_required: boolean; is_elective: boolean }[]>(
        supabase.from('courses').select('id, sessions_per_week, lab_required, is_elective'),
        'courses',
      ),
      fetchCurriculumMappings(rawSections),
      must<{ id: string; max_weekly_load: number }[]>(
        supabase.from('faculty').select('id, max_weekly_load'),
        'faculty',
      ),
      must<{ id: string; room_type: string; capacity: number }[]>(
        supabase.from('rooms').select('id, room_type, capacity'),
        'rooms',
      ),
      must<{ id: string; day_of_week: number; period: number }[]>(
        supabase.from('time_slots').select('id, day_of_week, period').order('day_of_week').order('period'),
        'time_slots',
      ),
      must<{ faculty_id: string; course_id: string }[]>(
        supabase.from('faculty_qualifications').select('faculty_id, course_id'),
        'qualifications',
      ),
      must<{ time_slot_id: string }[]>(
        supabase.from('elective_slot_blocks').select('time_slot_id'),
        'elective blocks',
      ),
      must<{ key: string; value: { value?: number } }[]>(
        supabase.from('constraints').select('key, value'),
        'constraints',
      ),
    ])

  const weights = { gap: 10, spread: 5, load: 5 }
  for (const c of constraints) {
    const v = Number(c.value?.value)
    if (Number.isFinite(v)) {
      if (c.key === 'gap_weight') weights.gap = v
      else if (c.key === 'day_spread_weight') weights.spread = v
      else if (c.key === 'load_balance_weight') weights.load = v
    }
  }

  return {
    institution_id,
    sections: rawSections.map((s) => ({ id: s.id, strength: s.strength, batch_count: s.batch_count })),
    courses,
    section_courses,
    faculty,
    rooms,
    time_slots,
    qualifications,
    elective_blocks: blocks.map((b) => b.time_slot_id),
    weights,
    time_limit_seconds: !import.meta.env.VITE_SOLVER_URL || import.meta.env.VITE_SOLVER_URL === '/api' ? 10 : 60,
  }
}

export const SOLVER_URL =
  (import.meta.env.VITE_SOLVER_URL as string | undefined) ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000')
