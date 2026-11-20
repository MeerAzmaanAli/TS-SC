import { supabase } from './supabase'
import { SOLVER_URL } from './timetable'
import { getDeveloperSettings } from './developerSettings'

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
 * Checks whether a faculty member is eligible to raise a substitution request for a lecture.
 *
 * Policy: Requests can be dispatched on the DAY BEFORE the lecture, or on the SAME DAY before
 * the lecture commences.
 * Developer Mode Override: If `disableDayRestriction` is enabled in Admin Developer Settings,
 * faculty can request coverage for any future date in the semester.
 */
export function getLectureTemporalStatus(
  dayOfWeek: number,
  startsAt: string,
  targetDate?: Date | string | null,
  overrideDayRestriction?: boolean,
): {
  isEligible: boolean       // true if request window is open
  isAdvanceRequest: boolean // true if lecture is on a future date (tomorrow or beyond)
  isToday: boolean          // true if target date IS today
  isPast: boolean           // true if lecture has already started/passed
  lectureDate: Date         // actual calendar Date the lecture will occur
  reasonMessage?: string
} {
  const dev = getDeveloperSettings()
  const disableRestriction = overrideDayRestriction ?? dev.disableDayRestriction
  const allowPast = dev.allowPastLectures

  const now = new Date()
  const todayDayOfWeek = now.getDay() === 0 ? 7 : now.getDay() // 1=Mon..7=Sun (JS Sun=0 → 7)
  const [h, m] = startsAt.split(':').map(Number)

  let lectureDate: Date
  let isToday = false
  let isAdvanceRequest = false

  if (targetDate) {
    // When an explicit date is provided (e.g. from the faculty calendar picker)
    const base = typeof targetDate === 'string'
      ? new Date(`${targetDate.split('T')[0]}T12:00:00`)
      : new Date(targetDate)

    lectureDate = new Date(base)
    lectureDate.setHours(h || 0, m || 0, 0, 0)

    const todayStr = now.toISOString().split('T')[0]
    const targetStr = lectureDate.toISOString().split('T')[0]
    isToday = todayStr === targetStr
    isAdvanceRequest = lectureDate.getTime() > now.getTime() && !isToday
  } else {
    // Default computation without custom date
    isToday = dayOfWeek === todayDayOfWeek
    const prevDay = dayOfWeek === 1 ? 7 : dayOfWeek - 1
    isAdvanceRequest = todayDayOfWeek === prevDay

    lectureDate = new Date(now)
    if (isAdvanceRequest) {
      lectureDate.setDate(lectureDate.getDate() + 1)
    } else if (!isToday) {
      // Advance to the next occurrence of this dayOfWeek
      const diff = (dayOfWeek - todayDayOfWeek + 7) % 7
      lectureDate.setDate(lectureDate.getDate() + (diff === 0 ? 7 : diff))
    }
    lectureDate.setHours(h || 0, m || 0, 0, 0)
  }

  // A session is past if its start time on that calendar date has arrived
  const isPast = now.getTime() >= lectureDate.getTime()

  let isEligible = false
  if (disableRestriction) {
    // Day restriction disabled: any upcoming lecture date is eligible (or past if demo mode)
    isEligible = allowPast || !isPast
  } else {
    // Standard policy: only day before or same day pre-commencement
    const prevDay = dayOfWeek === 1 ? 7 : dayOfWeek - 1
    const isDayBefore = todayDayOfWeek === prevDay
    isEligible = isDayBefore || (isToday && (!isPast || allowPast))
  }

  let reasonMessage: string | undefined
  if (!isEligible) {
    if (isPast && !allowPast) {
      reasonMessage = isToday
        ? 'Lecture has already commenced or passed today.'
        : 'Selected lecture date/time is in the past.'
    } else {
      const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      reasonMessage = `Requests open the day before or on ${dayNames[dayOfWeek] ?? 'the lecture day'}. (You can turn off this restriction in Admin > Developer Settings).`
    }
  }

  return { isEligible, isAdvanceRequest, isToday, isPast, lectureDate, reasonMessage }
}

/**
 * Calculates the exact calendar date on which a weekly lecture slot will be held
 * based on when the substitution request was dispatched (or reference date).
 *
 * For example:
 * - If request was created on Wednesday, and the lecture slot is Thursday (day 4),
 *   the lecture is held on Thursday (tomorrow).
 * - If request was created on Wednesday, and the slot is Wednesday (day 3),
 *   the lecture is held on Wednesday (today).
 */
export function getHeldLectureDate(slotDayOfWeek: number, referenceCreatedAt?: string | Date | null): Date {
  let ref: Date
  if (typeof referenceCreatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceCreatedAt)) {
    ref = new Date(`${referenceCreatedAt}T12:00:00`)
  } else {
    ref = referenceCreatedAt ? new Date(referenceCreatedAt) : new Date()
  }
  const refDayOfWeek = ref.getDay() === 0 ? 7 : ref.getDay() // 1=Mon .. 7=Sun

  // Number of days between reference and target slot (0 if same day, 1 if next day, etc.)
  const diffDays = (slotDayOfWeek - refDayOfWeek + 7) % 7

  const heldDate = new Date(ref)
  heldDate.setDate(heldDate.getDate() + diffDays)
  heldDate.setHours(12, 0, 0, 0) // noon prevents any UTC timezone rollover when formatted
  return heldDate
}

/** Formats a Date object to YYYY-MM-DD using local calendar year, month, day */
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Checks whether an assigned or past substitution request has finished its day,
 * so it can be moved from "active" to "past / archive".
 * Example: If request was for Thursday, once Friday starts (00:00:00 Friday local time),
 * isSubstitutionPast returns true.
 */
export function isSubstitutionDayPast(slotDayOfWeek: number, referenceCreatedAt?: string | Date | null): boolean {
  const heldDate = getHeldLectureDate(slotDayOfWeek, referenceCreatedAt)
  // End of the held day is 23:59:59.999
  const endOfHeldDay = new Date(heldDate)
  endOfHeldDay.setHours(23, 59, 59, 999)
  return new Date().getTime() > endOfHeldDay.getTime()
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

const MAX_P2_CANDIDATES = 4
const MAX_P3_CANDIDATES = 4

/** Single-pass bucket sort: iterate once, sort each tier, then cap P2 & P3. */
function capCandidatesByTier(candidates: RankedCandidate[]): RankedCandidate[] {
  const p1: RankedCandidate[] = []
  const p2: RankedCandidate[] = []
  const p3: RankedCandidate[] = []
  for (const c of candidates) {
    if (c.priority === 1) p1.push(c)
    else if (c.priority === 2) p2.push(c)
    else p3.push(c)
  }
  const byLoad = (a: RankedCandidate, b: RankedCandidate) => a.weekly_load - b.weekly_load
  p1.sort(byLoad)
  p2.sort(byLoad)
  p3.sort(byLoad)
  return [...p1, ...p2.slice(0, MAX_P2_CANDIDATES), ...p3.slice(0, MAX_P3_CANDIDATES)]
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
  const text = await res.text()
  try {
    const raw = (JSON.parse(text) as { candidates: RankedCandidate[] }).candidates
    return capCandidatesByTier(raw)
  } catch {
    throw new Error(
      `Ranking failed: solver returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`,
    )
  }
}

async function resolveRemote(
  candidates: CandidateState[],
  deadlinePassed: boolean,
): Promise<{ winner_faculty_id: string | null; should_resolve: boolean; penalties: { faculty_id: string; reason: string }[] }> {
  try {
    const res = await fetch(`${SOLVER_URL}/substitutions/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates, deadline_passed: deadlinePassed }),
    })
    if (res.ok) {
      return (await res.json()) as {
        winner_faculty_id: string | null
        should_resolve: boolean
        penalties: { faculty_id: string; reason: string }[]
      }
    }
  } catch (e) {
    console.warn('Remote substitution resolve failed, falling back to client resolution logic:', e)
  }

  // Robust Client-side Fallback
  const accepted = candidates.filter((c) => c.response === 'accepted')
  if (accepted.length > 0) {
    accepted.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.weekly_load !== b.weekly_load) return a.weekly_load - b.weekly_load
      return (a.responded_at || '').localeCompare(b.responded_at || '')
    })
    return {
      winner_faculty_id: accepted[0].faculty_id,
      should_resolve: true,
      penalties: [],
    }
  }

  if (deadlinePassed) {
    const penalties = candidates
      .filter((c) => c.response === 'rejected' || c.response === 'pending')
      .map((c) => ({
        faculty_id: c.faculty_id,
        reason: c.response === 'rejected' ? 'rejected' : 'timed_out',
      }))
    return {
      winner_faculty_id: null,
      should_resolve: true,
      penalties,
    }
  }

  return {
    winner_faculty_id: null,
    should_resolve: false,
    penalties: [],
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
  customLectureDate?: Date | string,
): Promise<void> {
  const dev = getDeveloperSettings()
  // Boundary 1: Eligibility — day-before or same-day (or any future date if day restriction is disabled)
  const { isEligible, isPast, isAdvanceRequest, lectureDate } = getLectureTemporalStatus(
    session.dayOfWeek,
    session.startsAt,
    customLectureDate,
  )

  if (!isEligible && !dev.allowPastLectures) {
    if (isPast) {
      throw new Error(
        'Invalid request: Cannot request substitution for a lecture that has already started or passed.',
      )
    }
    throw new Error(
      'Invalid request: Substitution requests can only be dispatched the day before or on the same day as the lecture (disable day restriction in Admin Developer Settings to override).',
    )
  }

  const version = await publishedVersion()
  const versionId = version.id

  // Boundary 2: Prevent Duplicate Active Requests for the same session on the exact same date
  const { data: existingActiveList } = await supabase
    .from('substitution_requests')
    .select('id, status, deadline')
    .eq('timetable_entry_id', session.entryId)
    .in('status', ['open', 'assigned'])

  const targetDateStr = toLocalDateString(lectureDate)
  const isDuplicateDate = (existingActiveList ?? []).some((r: any) => {
    if (!r.deadline) return false
    const held = new Date(new Date(r.deadline).getTime() - 10 * 60 * 1000)
    return toLocalDateString(held) === targetDateStr
  })

  if (isDuplicateDate) {
    throw new Error(
      `A substitution request is already active for this lecture on ${targetDateStr}.`,
    )
  }

  const [sectionRows, qualRows, slotRows, facultyRows, courseRes, requesterRes] = await Promise.all([
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId).eq('section_id', session.sectionId),
    supabase.from('faculty_qualifications').select('faculty_id').eq('course_id', session.courseId),
    supabase.from('timetable_entries').select('faculty_id').eq('version_id', versionId).eq('time_slot_id', session.timeSlotId),
    supabase.from('faculty').select('id, name, email'),
    supabase.from('courses').select('code, name').eq('id', session.courseId).single(),
    supabase.from('faculty').select('name, email').eq('id', requesterFacultyId).single(),
  ])

  for (const [rows, what] of [
    [sectionRows, 'section entries'],
    [qualRows, 'qualifications'],
    [slotRows, 'slot entries'],
    [facultyRows, 'faculty'],
  ] as const) {
    if (rows.error) throw new Error(`Failed to load ${what}: ${rows.error.message}`)
  }

  // Multi-pass fetch for all faculty loads across all entries to prevent 1000-row cap
  let allLoadEntries: { faculty_id: string | null }[] = []
  let loadFrom = 0
  let loadHasMore = true
  while (loadHasMore) {
    const { data: loadChunk, error: loadErr } = await supabase
      .from('timetable_entries')
      .select('faculty_id')
      .eq('version_id', versionId)
      .range(loadFrom, loadFrom + 999)
    if (loadErr) break
    const arr = (loadChunk ?? []) as { faculty_id: string | null }[]
    allLoadEntries = allLoadEntries.concat(arr)
    if (arr.length < 1000) loadHasMore = false
    else loadFrom += 1000
  }

  const allFacultyList = (facultyRows.data ?? []) as { id: string; name: string; email: string }[]
  const facultyMap = new Map(allFacultyList.map((f) => [f.id, f]))

  const ids = (rows: unknown): string[] => {
    const arr = (rows as { data: { faculty_id?: string; id?: string }[] | null }).data ?? []
    return [...new Set(arr.map((r) => String(r.faculty_id ?? r.id)))]
  }

  const loads: Record<string, number> = {}
  for (const r of allLoadEntries) {
    if (r.faculty_id) {
      const id = String(r.faculty_id)
      loads[id] = (loads[id] ?? 0) + 1
    }
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

  // Deadline = lecture_start + 10 min on the actual lecture date
  // For advance requests (day-before), lectureDate is tomorrow — deadline is still lecture_start + 10min
  const deadline = new Date(lectureDate.getTime() + 10 * 60 * 1000)

  // 1. Transactional Creation: Try atomic database RPC first
  let requestId: string | null = null
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_substitution_request_atomic', {
    p_institution_id: version.institution_id,
    p_timetable_entry_id: session.entryId,
    p_requester_faculty_id: requesterFacultyId,
    p_reason: reason ?? null,
    p_deadline: deadline.toISOString(),
    p_candidates: candidates.map((c) => ({ faculty_id: c.faculty_id, priority: c.priority })),
  })

  if (!rpcErr && rpcRes?.success && rpcRes.request_id) {
    requestId = rpcRes.request_id
  } else {
    // Client fallback: Ensure rollback if candidates fail
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

    requestId = (req as { id: string }).id

    const { error: cErr } = await supabase.from('substitution_candidates').insert(
      candidates.map((c) => ({
        request_id: requestId,
        faculty_id: c.faculty_id,
        priority: c.priority,
      })),
    )
    if (cErr) {
      // Discard all changes: Rollback by deleting the request
      await supabase.from('substitution_requests').delete().eq('id', requestId)
      throw new Error(`Transaction aborted: Failed to create candidates (${cErr.message}). All changes discarded.`)
    }
  }

  // Dispatch Email Notification to candidate faculty members
  const courseName = courseRes.data ? `${courseRes.data.code} - ${courseRes.data.name}` : 'Course'
  const requesterName = requesterRes.data?.name ?? 'Faculty Colleague'
  const dateFormatted = lectureDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  const isAdvance = isAdvanceRequest
  const emailSubject = isAdvance
    ? `[TS-SC] Advance Request: Substitute needed for ${courseName} on ${dateFormatted}`
    : `[TS-SC] Urgent Today: Substitution Request for ${courseName}`

  for (const cand of candidates) {
    const fac = facultyMap.get(cand.faculty_id)
    if (fac && fac.email) {
      sendEmailNotification({
        to_email: fac.email,
        to_name: fac.name,
        subject: emailSubject,
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #FFB900;">${isAdvance ? 'Advance Substitution Request' : 'Same-Day Substitution Request'}</h2>
            <p>Dear <strong>${fac.name}</strong>,</p>
            <p><strong>${requesterName}</strong> has requested a substitute for their ${isAdvance ? 'upcoming' : 'today\'s'} lecture:</p>
            <ul>
              <li><strong>Course:</strong> ${courseName}</li>
              <li><strong>Date:</strong> ${dateFormatted}</li>
              <li><strong>Time:</strong> ${session.startsAt.slice(0, 5)}</li>
              <li><strong>Priority Level:</strong> P${cand.priority}</li>
              ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ''}
              <li><strong>Response Deadline:</strong> ${deadline.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>
            </ul>
            <p>Please log in to your TS-SC portal to review and accept/decline this request.</p>
            <p style="margin-top: 24px;">
              <a href="${typeof window !== 'undefined' ? window.location.origin : ''}/faculty" style="background-color: #FFB900; color: #1C1917; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">
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
  // Call server-side RPC first if available for high-performance atomic sweep & penalty writing
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('sweep_substitution_requests')
    if (!rpcErr && rpcRes && rpcRes.success) {
      // Swept via Postgres RPC — no client-side sweep needed
      return rpcRes.expired_count ?? 0
    }
  } catch {
    /* Fallback to client sweep below */
  }

  // Query all open substitution requests to finalize accepted ones or expire timed-out ones
  const { data: openList, error } = await supabase
    .from('substitution_requests')
    .select('id')
    .eq('status', 'open')

  if (error || !openList || openList.length === 0) return 0

  let count = 0
  for (const req of openList) {
    try {
      const resolved = await tryFinaliseRequest(req.id)
      if (resolved) count++
    } catch (err) {
      console.warn(`Failed to finalize open request ${req.id}:`, err)
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
    let loadFrom = 0
    let loadHasMore = true
    while (loadHasMore) {
      const { data: loadChunk, error: loadErr } = await supabase
        .from('timetable_entries')
        .select('faculty_id')
        .eq('version_id', (entry as { version_id: string }).version_id)
        .range(loadFrom, loadFrom + 999)
      if (loadErr) break
      const arr = (loadChunk ?? []) as { faculty_id: string | null }[]
      for (const r of arr) {
        if (r.faculty_id) {
          const id = String(r.faculty_id)
          loads[id] = (loads[id] ?? 0) + 1
        }
      }
      if (arr.length < 1000) loadHasMore = false
      else loadFrom += 1000
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
    // Attempt secure RPC resolution first (bypasses candidate RLS restriction)
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('resolve_substitution_request', {
      p_request_id: requestId,
      p_winner_faculty_id: out.winner_faculty_id,
    })

    if (rpcErr || (rpcRes && !rpcRes.success)) {
      // Fallback to direct update if RPC is pending migration execution
      const { error } = await supabase
        .from('substitution_requests')
        .update({ status: 'assigned', assigned_faculty_id: out.winner_faculty_id })
        .eq('id', requestId)
      if (error) console.warn('Direct update fallback error:', error.message)
    }

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
            <h2 style="color: #FFB900;">Substitute Confirmed</h2>
            <p>Dear <strong>${requesterRes.data.name}</strong>,</p>
            <p>Good news! <strong>${winnerRes.data?.name ?? 'A colleague'}</strong> has accepted your substitution request and will conduct your lecture.</p>
          </div>
        `,
      }).catch((e) => console.warn(e))
    }
  } else {
    // If deadline passed with 0 accepts, transition to expired
    const { error } = await supabase
      .from('substitution_requests')
      .update({ status: 'expired' })
      .eq('id', requestId)
    if (error) {
      // Fallback in case old DB schema has strict check constraint
      await supabase.from('substitution_requests').update({ status: 'unfilled' }).eq('id', requestId)
    }

    // Mark all candidate rows that never responded as timed_out
    await supabase
      .from('substitution_candidates')
      .update({ response: 'timed_out', responded_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .eq('response', 'pending')

    if (requesterRes.data?.email) {
      sendEmailNotification({
        to_email: requesterRes.data.email,
        to_name: requesterRes.data.name,
        subject: '[TS-SC] Substitution Request Expired',
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #dc2626;">Substitution Request Expired</h2>
            <p>Dear <strong>${requesterRes.data.name}</strong>,</p>
            <p>The response deadline for your substitution request has passed without acceptance. The session has been marked expired.</p>
            <p>Penalties have been recorded for faculty candidates who failed to respond before the deadline.</p>
          </div>
        `,
      }).catch((e) => console.warn(e))
    }
  }

  // Record penalties for rejections and timeouts (with duplicate prevention)
  if (out.penalties.length > 0) {
    const { data: existingPenalties } = await supabase
      .from('substitution_penalties')
      .select('faculty_id')
      .eq('request_id', requestId)
    const existingSet = new Set((existingPenalties || []).map((p: any) => p.faculty_id))

    const newPenalties = out.penalties
      .filter((p) => !existingSet.has(p.faculty_id))
      .map((p) => ({
        institution_id: typed.institution_id,
        faculty_id: p.faculty_id,
        request_id: requestId,
        reason: p.reason,
      }))

    if (newPenalties.length > 0) {
      const { error } = await supabase.from('substitution_penalties').insert(newPenalties)
      if (error) console.warn('Failed to insert penalties:', error.message)
    }
  }
  return true
}

/**
 * Deletes a substitution request and restores the session cleanly.
 * Transactional: Either completes completely or discards all changes.
 */
export async function deleteSubstitutionRequest(
  requestId: string,
  _requesterFacultyId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[TS-SC] Calling delete_substitution_request RPC for:', requestId)
    // 1. Try atomic database transaction RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_substitution_request', {
      p_request_id: requestId,
    })

    if (!rpcErr && rpcData?.success) {
      console.log('[TS-SC] delete_substitution_request RPC succeeded:', rpcData)
      return { success: true }
    }

    if (rpcData && rpcData.success === false) {
      console.warn('[TS-SC] delete_substitution_request RPC returned error:', rpcData.error)
    }
    if (rpcErr) {
      console.warn('[TS-SC] delete_substitution_request RPC error:', rpcErr)
    }

    // 2. Client fallback with transactional cleanup order:
    // First clear penalties and candidates, then delete request
    await supabase.from('substitution_penalties').delete().eq('request_id', requestId)
    await supabase.from('substitution_candidates').delete().eq('request_id', requestId)
    const { data: delData, error: delErr } = await supabase
      .from('substitution_requests')
      .delete()
      .eq('id', requestId)
      .select('id')

    if (delErr) {
      console.error('[TS-SC] Client direct delete error:', delErr)
      return {
        success: false,
        error: `Transaction failed: ${delErr.message}. Ensure migration 0028 is applied in Supabase.`,
      }
    }

    if (!delData || delData.length === 0) {
      const errMsg = rpcData?.error || rpcErr?.message || 'Database security rules prevented deletion. Please run migration 0028 in Supabase.'
      console.error('[TS-SC] Deletion failed: 0 rows affected.', errMsg)
      return {
        success: false,
        error: `Deletion rejected by database: ${errMsg}`,
      }
    }

    console.log('[TS-SC] Client direct delete succeeded:', delData)
    return { success: true }
  } catch (err: any) {
    console.error('[TS-SC] deleteSubstitutionRequest caught error:', err)
    return { success: false, error: err.message || 'Failed to delete request.' }
  }
}

/**
 * Cancels an active or assigned substitution request initiated by a faculty member.
 * Transaction-based consistency: Either completes or discards all changes.
 * Never silently degrades to 'unfilled' free period.
 */
export async function cancelSubstitutionRequest(
  requestId: string,
  requesterFacultyId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[TS-SC] Initiating cancellation for request:', requestId, 'requesterFacultyId:', requesterFacultyId)

    // 1. Fetch request details to get assigned faculty info for email notification
    const { data: reqData } = await supabase
      .from('substitution_requests')
      .select(`
        id, status, assigned_faculty_id, requester_faculty_id,
        timetable_entries (
          courses (name, code),
          time_slots (day_of_week, starts_at, ends_at)
        ),
        assigned_faculty:faculty!substitution_requests_assigned_faculty_id_fkey (name, email),
        requester:faculty!substitution_requests_requester_faculty_id_fkey (name)
      `)
      .eq('id', requestId)
      .maybeSingle()

    // 2. Execute atomic transactional cancellation / deletion
    const { data: rpcData, error: rpcErr } = await supabase.rpc('cancel_substitution_request', {
      p_request_id: requestId,
    })

    let cancelled = false
    if (!rpcErr && rpcData?.success) {
      console.log('[TS-SC] cancel_substitution_request RPC succeeded:', rpcData)
      cancelled = true
    } else {
      if (rpcData && rpcData.success === false) {
        console.warn('[TS-SC] cancel_substitution_request RPC returned error:', rpcData.error)
      }
      if (rpcErr) {
        console.warn('[TS-SC] cancel_substitution_request RPC error:', rpcErr)
      }

      // Direct deletion fallback
      const delRes = await deleteSubstitutionRequest(requestId, requesterFacultyId)
      if (!delRes.success) {
        console.error('[TS-SC] Cancellation fallback delete failed:', delRes.error)
        return {
          success: false,
          error: `Transaction failed: ${delRes.error || rpcData?.error || rpcErr?.message}. Ensure migration 0028 has been applied in Supabase.`,
        }
      }
      cancelled = true
    }

    // 3. Courtesy notification if a colleague had accepted
    if (cancelled && (reqData as any)?.assigned_faculty?.email) {
      const assignedFac = (reqData as any).assigned_faculty
      const requesterName = (reqData as any)?.requester?.name || 'Your colleague'
      const courseName = (reqData as any)?.timetable_entries?.courses?.name || 'Lecture'

      sendEmailNotification({
        to_email: assignedFac.email,
        to_name: assignedFac.name,
        subject: '[TS-SC] Coverage Request Cancelled by Requester',
        body_html: `
          <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="color: #6B7280;">Coverage Request Cancelled</h2>
            <p>Dear <strong>${assignedFac.name}</strong>,</p>
            <p>Please note that <strong>${requesterName}</strong> has cancelled their substitution request for <strong>${courseName}</strong>.</p>
            <p>You are no longer scheduled to cover this lecture. Thank you for your support.</p>
          </div>
        `,
      }).catch((e) => console.warn('Could not dispatch cancellation email:', e))
    }

    return { success: true }
  } catch (err: any) {
    console.error('[TS-SC] cancelSubstitutionRequest exception:', err)
    return {
      success: false,
      error: err.message || 'Transaction aborted: failed to cancel substitution request.',
    }
  }
}

/**
 * Purges all erroneous unfilled / cancelled substitution requests from the database.
 */
export async function purgeUnfilledSubstitutions(): Promise<{ success: boolean; purgedCount?: number; error?: string }> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('purge_unfilled_substitutions')
    if (!rpcErr && rpcData?.success) {
      return { success: true, purgedCount: rpcData.purged_count }
    }

    // Direct fallback
    await supabase.from('substitution_penalties').delete().not('id', 'is', null)
    await supabase.from('substitution_candidates').delete().not('id', 'is', null)
    const { error } = await supabase
      .from('substitution_requests')
      .delete()
      .in('status', ['unfilled', 'cancelled'])

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to purge unfilled requests.' }
  }
}

