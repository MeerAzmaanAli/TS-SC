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

export interface SendEmailPayload {
  to_email: string
  to_name: string
  subject: string
  body_html: string
  body_text?: string
}

export async function sendEmailNotification(payload: SendEmailPayload): Promise<boolean> {
  try {
    const res = await fetch(`${SOLVER_URL}/notifications/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch (err) {
    console.warn('Failed to dispatch notification email:', err)
    return false
  }
}

/**
 * Checks whether a weekly lecture slot occurs TODAY, and whether it is upcoming or past.
 *
 * Boundary Rules:
 * 1. Substitution requests can ONLY be raised on the SAME DAY as the lecture (Day-of).
 * 2. Lectures that have already commenced or ended cannot be requested.
 */
export function getLectureTemporalStatus(dayOfWeek: number, startsAt: string): {
  isToday: boolean
  isPast: boolean
  todayLectureDate: Date
  reasonMessage?: string
} {
  const now = new Date()
  const todayDayOfWeek = now.getDay() === 0 ? 7 : now.getDay() // 1=Mon .. 7=Sun
  const isToday = dayOfWeek === todayDayOfWeek

  const [h, m] = startsAt.split(':').map(Number)
  const todayLectureDate = new Date(now)
  todayLectureDate.setHours(h || 0, m || 0, 0, 0)

  const isPast = now.getTime() >= todayLectureDate.getTime()

  let reasonMessage: string | undefined
  if (!isToday) {
    reasonMessage = 'Substitution can only be requested on the day of the lecture.'
  } else if (isPast) {
    reasonMessage = 'Lecture has already commenced or passed today.'
  }

  return { isToday, isPast, todayLectureDate, reasonMessage }
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

/** Full fan-out: validates boundaries, ranks candidates, creates request + candidate rows, and emails candidates. */
export async function createSubstitutionRequest(
  session: SessionInfo,
  requesterFacultyId: string,
  reason?: string,
): Promise<void> {
  // Boundary 1: Day-of & Not-Past Enforcement
  const { isToday, isPast, todayLectureDate } = getLectureTemporalStatus(
    session.dayOfWeek,
    session.startsAt,
  )

  if (!isToday) {
    throw new Error(
      'Invalid request: Substitution requests can only be dispatched on the same day as the lecture.',
    )
  }
  if (isPast) {
    throw new Error(
      'Invalid request: Cannot request substitution for a lecture that has already started or passed.',
    )
  }

  const version = await publishedVersion()
  const versionId = version.id

  // Boundary 2: Prevent Duplicate Active Requests for the same session
  const { data: existingActive } = await supabase
    .from('substitution_requests')
    .select('id, status')
    .eq('timetable_entry_id', session.entryId)
    .eq('status', 'open')
    .maybeSingle()

  if (existingActive) {
    throw new Error(
      'A substitution request is already active and open for this scheduled lecture.',
    )
  }

  const [sectionRows, qualRows, slotRows, facultyRows, loadRows, courseRes, requesterRes] = await Promise.all([
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId).eq('section_id', session.sectionId),
    supabase.from('faculty_qualifications').select('faculty_id').eq('course_id', session.courseId),
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId).eq('time_slot_id', session.timeSlotId),
    supabase.from('faculty').select('id, name, email'),
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId),
    supabase.from('courses').select('code, name').eq('id', session.courseId).single(),
    supabase.from('faculty').select('name, email').eq('id', requesterFacultyId).single(),
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

  const allFacultyList = (facultyRows.data ?? []) as { id: string; name: string; email: string }[]
  const facultyMap = new Map(allFacultyList.map((f) => [f.id, f]))

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
    all_faculty_ids: allFacultyList.map((f) => f.id),
    faculty_loads: loads,
  })
  if (candidates.length === 0) throw new Error('No available substitute candidates (all colleagues busy or unqualified).')

  // Deadline = lecture_start + 10 min
  const deadline = new Date(todayLectureDate.getTime() + 10 * 60 * 1000)

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

  const requestId = (req as { id: string }).id

  const { error: cErr } = await supabase.from('substitution_candidates').insert(
    candidates.map((c) => ({
      request_id: requestId,
      faculty_id: c.faculty_id,
      priority: c.priority,
    })),
  )
  if (cErr) throw new Error(`Failed to create candidates: ${cErr.message}`)

  // Dispatch Email Notification to candidate faculty members
  const courseName = courseRes.data ? `${courseRes.data.code} - ${courseRes.data.name}` : 'Course'
  const requesterName = requesterRes.data?.name ?? 'Faculty Colleague'
  const dateFormatted = todayLectureDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

  for (const cand of candidates) {
    const fac = facultyMap.get(cand.faculty_id)
    if (fac && fac.email) {
      sendEmailNotification({
        to_email: fac.email,
        to_name: fac.name,
        subject: `[TS-SC] Urgent Today: Substitution Request for ${courseName}`,
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #4f46e5;">Urgent Day-Of Substitution Request</h2>
            <p>Dear <strong>${fac.name}</strong>,</p>
            <p><strong>${requesterName}</strong> has requested a substitute for their upcoming lecture today:</p>
            <ul>
              <li><strong>Course:</strong> ${courseName}</li>
              <li><strong>Time:</strong> Today (${dateFormatted}) at ${session.startsAt}</li>
              <li><strong>Priority Level:</strong> P${cand.priority}</li>
              ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ''}
              <li><strong>Response Deadline:</strong> ${deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</li>
            </ul>
            <p>Please log in to your TS-SC portal to review and accept/decline this request.</p>
            <p style="margin-top: 24px;">
              <a href="${typeof window !== 'undefined' ? window.location.origin : ''}/faculty" style="background-color: #4f46e5; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Open Faculty Inbox
              </a>
            </p>
          </div>
        `,
      }).catch((e) => console.warn('Email dispatch error:', e))
    }
  }
}

/**
 * Sweeps all open substitution requests whose deadline has passed,
 * resolves accepted ones or automatically expires them and assigns penalties to unresponding faculties.
 */
export async function sweepAllExpiredRequests(): Promise<number> {
  const nowIso = new Date().toISOString()
  const { data: expiredList, error } = await supabase
    .from('substitution_requests')
    .select('id')
    .eq('status', 'open')
    .lt('deadline', nowIso)

  if (error || !expiredList || expiredList.length === 0) return 0

  let count = 0
  for (const req of expiredList) {
    try {
      const resolved = await tryFinaliseRequest(req.id)
      if (resolved) count++
    } catch (err) {
      console.warn(`Failed to finalize expired request ${req.id}:`, err)
    }
  }
  return count
}

/**
 * Attempt to finalise a request: if the engine says it should resolve
 * (deadline passed, or a P1 accepted), write outcome + penalties and send confirmation emails.
 */
export async function tryFinaliseRequest(requestId: string): Promise<boolean> {
  const { data: req, error: rErr } = await supabase
    .from('substitution_requests')
    .select('id, status, deadline, institution_id, timetable_entry_id, requester_faculty_id')
    .eq('id', requestId)
    .single()
  if (rErr || !req || (req as { status: string }).status !== 'open') return false
  const typed = req as {
    deadline: string
    institution_id: string
    timetable_entry_id: string
    requester_faculty_id: string
  }

  const { data: cands, error: cErr } = await supabase
    .from('substitution_candidates')
    .select('faculty_id, priority, response, responded_at')
    .eq('request_id', requestId)
  if (cErr) throw new Error(cErr.message)

  // Weekly loads for tie-breaking: count published-version sessions per faculty.
  const { data: entry } = await supabase
    .from('timetable_entries')
    .select('version_id, course_id, time_slot_id')
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

  // Fetch faculty details for confirmation emails
  const [requesterRes, winnerRes] = await Promise.all([
    supabase.from('faculty').select('name, email').eq('id', typed.requester_faculty_id).single(),
    out.winner_faculty_id
      ? supabase.from('faculty').select('name, email').eq('id', out.winner_faculty_id).single()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (out.winner_faculty_id) {
    const { error } = await supabase
      .from('substitution_requests')
      .update({ status: 'assigned', assigned_faculty_id: out.winner_faculty_id })
      .eq('id', requestId)
    if (error) throw new Error(error.message)

    // Send assignment confirmation email to Winner
    if (winnerRes.data?.email) {
      sendEmailNotification({
        to_email: winnerRes.data.email,
        to_name: winnerRes.data.name,
        subject: '[TS-SC] Substitution Confirmed: You are assigned',
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #059669;">Substitution Confirmed</h2>
            <p>Dear <strong>${winnerRes.data.name}</strong>,</p>
            <p>You have been officially confirmed as the substitute instructor for <strong>${requesterRes.data?.name ?? 'your colleague'}</strong>.</p>
            <p>Thank you for stepping in to ensure class continuity.</p>
          </div>
        `,
      }).catch((e) => console.warn(e))
    }

    // Send notice email to Requester
    if (requesterRes.data?.email) {
      sendEmailNotification({
        to_email: requesterRes.data.email,
        to_name: requesterRes.data.name,
        subject: '[TS-SC] Substitute Assigned for Your Lecture',
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #4f46e5;">Substitute Confirmed</h2>
            <p>Dear <strong>${requesterRes.data.name}</strong>,</p>
            <p>Good news! <strong>${winnerRes.data?.name ?? 'A colleague'}</strong> has accepted your substitution request and will conduct your lecture.</p>
          </div>
        `,
      }).catch((e) => console.warn(e))
    }
  } else {
    // If deadline passed with 0 accepts, transition to expired/unfilled
    const { error } = await supabase
      .from('substitution_requests')
      .update({ status: 'unfilled' })
      .eq('id', requestId)
    if (error) throw new Error(error.message)

    // Mark all candidate rows that never responded as timed_out
    await supabase
      .from('substitution_candidates')
      .update({ response: 'timed_out' })
      .eq('request_id', requestId)
      .eq('response', 'pending')

    if (requesterRes.data?.email) {
      sendEmailNotification({
        to_email: requesterRes.data.email,
        to_name: requesterRes.data.name,
        subject: '[TS-SC] Substitution Request Expired / Unfilled',
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #dc2626;">Substitution Request Expired</h2>
            <p>Dear <strong>${requesterRes.data.name}</strong>,</p>
            <p>The response deadline for your substitution request has passed without acceptance. The session has been marked unfilled.</p>
            <p>Penalties have been recorded for faculty candidates who failed to respond before deadline.</p>
          </div>
        `,
      }).catch((e) => console.warn(e))
    }
  }

  // Record penalties for rejections and timeouts
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
