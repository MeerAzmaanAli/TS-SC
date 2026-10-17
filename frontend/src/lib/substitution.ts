import { supabase } from './supabase'
import { SOLVER_URL } from './timetable'

export interface RankedCandidate {
  faculty_id: string
  priority: number
  weekly_load: number
}

export interface CandidateState {
  faculty_id: string
  priority: number
  response: string
  responded_at: string | null
  weekly_load: number
}

/** Next calendar occurrence of a weekly slot (day_of_week: 1=Mon..7=Sun). */
export function lectureStart(dayOfWeek: number, startsAt: string): Date {
  const [h, m] = startsAt.split(':').map(Number)
  const now = new Date()
  const jsDay = dayOfWeek % 7 // 7 (Sun) -> 0
  const d = new Date(now)
  d.setHours(h || 0, m || 0, 0, 0)
  let delta = (jsDay - now.getDay() + 7) % 7
  if (delta === 0 && d.getTime() <= now.getTime()) delta = 7
  d.setDate(d.getDate() + delta)
  return d
}

async function publishedVersion(): Promise<{ id: string; institution_id: string }> {
  const { data, error } = await supabase
    .from('timetable_versions')
    .select('id, institution_id')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) throw new Error('No published timetable.')
  return data as { id: string; institution_id: string }
}

async function rank(input: {
  requester_faculty_id: string
  section_faculty_ids: string[]
  course_faculty_ids: string[]
  busy_faculty_ids: string[]
  all_faculty_ids: string[]
  faculty_loads: Record<string, number>
}): Promise<RankedCandidate[]> {
  const res = await fetch(`${SOLVER_URL}/substitutions/rank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Ranking failed (HTTP ${res.status})`)
  return (await res.json()).candidates as RankedCandidate[]
}

async function resolveRemote(
  candidates: CandidateState[],
  deadlinePassed: boolean,
): Promise<{ winner_faculty_id: string | null; should_resolve: boolean; penalties: { faculty_id: string; reason: string }[] }> {
  const res = await fetch(`${SOLVER_URL}/substitutions/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates, deadline_passed: deadlinePassed }),
  })
  if (!res.ok) throw new Error(`Resolve failed (HTTP ${res.status})`)
  return (await res.json()) as {
    winner_faculty_id: string | null
    should_resolve: boolean
    penalties: { faculty_id: string; reason: string }[]
  }
}

export interface SessionInfo {
  entryId: string
  sectionId: string
  courseId: string
  timeSlotId: string
  dayOfWeek: number
  startsAt: string
}

/** Full fan-out: rank candidates, create the request + candidate rows. */
export async function createSubstitutionRequest(
  session: SessionInfo,
  requesterFacultyId: string,
  reason?: string,
): Promise<void> {
  const version = await publishedVersion()
  const versionId = version.id

  const [sectionRows, qualRows, slotRows, facultyRows, loadRows] = await Promise.all([
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId).eq('section_id', session.sectionId),
    supabase.from('faculty_qualifications').select('faculty_id').eq('course_id', session.courseId),
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId).eq('time_slot_id', session.timeSlotId),
    supabase.from('faculty').select('id'),
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId),
  ])
  for (const [rows, what] of [
    [sectionRows, 'section entries'],
    [qualRows, 'qualifications'],
    [slotRows, 'slot entries'],
    [facultyRows, 'faculty'],
    [loadRows, 'loads'],
  ] as const) {
    if (rows.error) throw new Error(`Failed to load ${what}: ${rows.error.message}`)
  }

  const ids = (rows: unknown): string[] => {
    const arr = (rows as { data: { faculty_id?: string; id?: string }[] | null }).data ?? []
    return [...new Set(arr.map((r) => String(r.faculty_id ?? r.id)))]
  }
  const loads: Record<string, number> = {}
  for (const r of ((loadRows.data ?? []) as { faculty_id: string }[])) {
    const id = String(r.faculty_id)
    loads[id] = (loads[id] ?? 0) + 1
  }

  const candidates = await rank({
    requester_faculty_id: requesterFacultyId,
    section_faculty_ids: ids(sectionRows),
    course_faculty_ids: ids(qualRows),
    busy_faculty_ids: ids(slotRows),
    all_faculty_ids: ids(facultyRows),
    faculty_loads: loads,
  })
  if (candidates.length === 0) throw new Error('No available substitute candidates.')

  const deadline = new Date(lectureStart(session.dayOfWeek, session.startsAt).getTime() + 10 * 60 * 1000)

  const { data: req, error: rErr } = await supabase
    .from('substitution_requests')
    .insert({
      institution_id: version.institution_id,
      requester_faculty_id: requesterFacultyId,
      timetable_entry_id: session.entryId,
      reason: reason ?? null,
      deadline: deadline.toISOString(),
      status: 'open',
    })
    .select('id')
    .single()
  if (rErr || !req) throw new Error(`Failed to create request: ${rErr?.message}`)

  const { error: cErr } = await supabase.from('substitution_candidates').insert(
    candidates.map((c) => ({
      request_id: (req as { id: string }).id,
      faculty_id: c.faculty_id,
      priority: c.priority,
    })),
  )
  if (cErr) throw new Error(`Failed to create candidates: ${cErr.message}`)
}

/**
 * Attempt to finalise a request: if the engine says it should resolve
 * (deadline passed, or a P1 accepted), write the outcome + penalties.
 * Returns true when the request was finalised.
 */
export async function tryFinaliseRequest(requestId: string): Promise<boolean> {
  const { data: req, error: rErr } = await supabase
    .from('substitution_requests')
    .select('id, status, deadline, institution_id, timetable_entry_id')
    .eq('id', requestId)
    .single()
  if (rErr || !req || (req as { status: string }).status !== 'open') return false
  const typed = req as {
    deadline: string
    institution_id: string
    timetable_entry_id: string
  }

  const { data: cands, error: cErr } = await supabase
    .from('substitution_candidates')
    .select('faculty_id, priority, response, responded_at')
    .eq('request_id', requestId)
  if (cErr) throw new Error(cErr.message)

  // Weekly loads for tie-breaking: count published-version sessions per faculty.
  const { data: entry } = await supabase
    .from('timetable_entries')
    .select('version_id')
    .eq('id', typed.timetable_entry_id)
    .single()
  const loads: Record<string, number> = {}
  if (entry) {
    const { data: loadRows } = await supabase
      .from('timetable_entries')
      .select('faculty_id')
      .eq('version_id', (entry as { version_id: string }).version_id)
    for (const r of ((loadRows ?? []) as { faculty_id: string }[])) {
      const id = String(r.faculty_id)
      loads[id] = (loads[id] ?? 0) + 1
    }
  }

  const states: CandidateState[] = ((cands ?? []) as {
    faculty_id: string; priority: number; response: string; responded_at: string | null
  }[]).map((c) => ({
    faculty_id: String(c.faculty_id),
    priority: c.priority,
    response: c.response,
    responded_at: c.responded_at,
    weekly_load: loads[String(c.faculty_id)] ?? 0,
  }))

  const deadlinePassed = new Date() > new Date(typed.deadline)
  const out = await resolveRemote(states, deadlinePassed)
  if (!out.should_resolve) return false

  if (out.winner_faculty_id) {
    const { error } = await supabase
      .from('substitution_requests')
      .update({ status: 'assigned', assigned_faculty_id: out.winner_faculty_id })
      .eq('id', requestId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('substitution_requests')
      .update({ status: 'unfilled' })
      .eq('id', requestId)
    if (error) throw new Error(error.message)
  }

  if (out.penalties.length > 0) {
    const { error } = await supabase.from('substitution_penalties').insert(
      out.penalties.map((p) => ({
        institution_id: typed.institution_id,
        faculty_id: p.faculty_id,
        request_id: requestId,
        reason: p.reason,
      })),
    )
    if (error) throw new Error(error.message)
  }
  return true
}
