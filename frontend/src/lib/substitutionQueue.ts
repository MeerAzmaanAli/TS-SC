import { toLocalDateString } from './substitution'

export interface SlotSubstitutionQueueItem {
  id: string
  entryId: string
  status: 'open' | 'assigned' | 'unfilled' | 'expired' | 'completed' | 'cancelled'
  substituteName?: string | null
  requesterName?: string | null
  role?: 'requester' | 'covering'
  targetDate: string // YYYY-MM-DD
  targetDateFormatted: string // e.g. "Monday, 24 Nov 2026"
  targetDayOfWeek: number // 1=Mon..7=Sun
  deadline: string
  createdAt: string
  reason?: string | null
  isFront: boolean
  isToday: boolean
  isCurrentWeek: boolean
  isPast: boolean
  candidates?: {
    facultyId: string
    facultyName: string
    priority: number
    response: string
  }[]
}

/**
 * Checks if today's class periods have concluded.
 * Standard institutional class periods finish by 16:45 (4:45 PM).
 * After 16:45 on any weekday, daily teaching has completed.
 */
export function isAcademicDayFinished(now: Date = new Date()): boolean {
  const h = now.getHours()
  const m = now.getMinutes()
  return h > 16 || (h === 16 && m >= 45)
}

/**
 * Derives the exact lecture calendar date from a substitution request.
 * The standard request deadline is (lecture_date at starts_at + 10 min).
 */
export function getTargetDateFromRequest(req: {
  deadline?: string | null
  date?: string | null
  created_at?: string | null
}): { dateStr: string; dateObj: Date } {
  let dateObj: Date

  if (req.deadline) {
    // Lecture is 10 minutes prior to the deadline
    dateObj = new Date(new Date(req.deadline).getTime() - 10 * 60 * 1000)
  } else if (req.date) {
    dateObj = new Date(`${String(req.date).split('T')[0]}T12:00:00`)
  } else if (req.created_at) {
    dateObj = new Date(req.created_at)
  } else {
    dateObj = new Date()
  }

  const dateStr = toLocalDateString(dateObj)
  return { dateStr, dateObj }
}

/**
 * Returns the Monday and Sunday dates (inclusive) for the current academic week.
 */
export function getCurrentWeekBounds(refDate: Date = new Date()): { mondayStr: string; sundayStr: string } {
  const now = new Date(refDate)
  const day = now.getDay() === 0 ? 7 : now.getDay() // 1=Mon..7=Sun

  const monday = new Date(now)
  monday.setDate(monday.getDate() - (day - 1))
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return {
    mondayStr: toLocalDateString(monday),
    sundayStr: toLocalDateString(sunday),
  }
}

/**
 * Builds chronological per-slot substitution queues and resolves the active front element for the timetable.
 *
 * Rules:
 * 1. All active requests for each slot are gathered into a queue and sorted by targetDate ascending.
 * 2. Item 0 is the front element (earliest active upcoming substitution).
 * 3. On the Timetable Grid (TT):
 *    - Regular weekday schedule:
 *      - For a slot occurring on today's weekday: ONLY displays if front item's targetDate is TODAY.
 *      - For a slot occurring on future weekdays of the current cycle: displays if front item is for THIS week.
 *    - Post-period / Weekend Rollover:
 *      - Once Friday's academic periods are concluded (>= 16:45), or during the weekend (Saturday/Sunday),
 *        the schedule rolls over to the next academic cycle (Monday).
 *      - Monday's front queued substitution (and upcoming week substitutions) will automatically begin
 *        showing on the timetable grid.
 */
export function buildSlotQueues(
  requests: any[],
  options?: { currentRefDate?: Date }
): {
  slotQueuesMap: Map<string, SlotSubstitutionQueueItem[]>
  activeOverlayMap: Map<string, SlotSubstitutionQueueItem>
} {
  const ref = options?.currentRefDate ? new Date(options.currentRefDate) : new Date()
  const todayStr = toLocalDateString(ref)
  const todayDayOfWeek = ref.getDay() === 0 ? 7 : ref.getDay()
  const { mondayStr, sundayStr } = getCurrentWeekBounds(ref)

  // Start of today (00:00:00) for past day checks
  const startOfToday = new Date(ref)
  startOfToday.setHours(0, 0, 0, 0)

  // Rollover check: If Friday evening after classes end, or on the weekend (Saturday/Sunday),
  // the upcoming working week (starting Monday) becomes the active focus on the timetable.
  const isFridayEvening = todayDayOfWeek === 5 && isAcademicDayFinished(ref)
  const isWeekend = todayDayOfWeek === 6 || todayDayOfWeek === 7
  const isRollOverToNextWeek = isFridayEvening || isWeekend

  // Calculate upcoming Monday's date
  const daysToNextMonday = (8 - todayDayOfWeek) % 7 || 7
  const nextMondayDate = new Date(ref)
  nextMondayDate.setDate(ref.getDate() + daysToNextMonday)
  nextMondayDate.setHours(0, 0, 0, 0)

  // Group by timetable_entry_id
  const grouped = new Map<string, any[]>()
  for (const r of requests) {
    const entryId = r.timetable_entry_id || r.entry_id
    if (!entryId) continue
    if (!grouped.has(entryId)) grouped.set(entryId, [])
    grouped.get(entryId)!.push(r)
  }

  const slotQueuesMap = new Map<string, SlotSubstitutionQueueItem[]>()
  const activeOverlayMap = new Map<string, SlotSubstitutionQueueItem>()

  for (const [entryId, reqList] of grouped.entries()) {
    const items: SlotSubstitutionQueueItem[] = []

    for (const r of reqList) {
      // Ignore cancelled requests completely from active queues
      if (r.status === 'cancelled') {
        continue
      }

      const { dateStr, dateObj } = getTargetDateFromRequest(r)

      // End of target day (23:59:59)
      const endOfTargetDay = new Date(dateObj)
      endOfTargetDay.setHours(23, 59, 59, 999)
      const isPast = ref.getTime() > endOfTargetDay.getTime()

      // Skip past-day expired or unfilled records
      if (isPast && (r.status === 'expired' || r.status === 'unfilled')) {
        continue
      }

      const targetDayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay()
      const isToday = dateStr === todayStr
      const isCurrentWeek = dateStr >= mondayStr && dateStr <= sundayStr

      const candidates = (r.substitution_candidates || []).map((c: any) => ({
        facultyId: c.faculty_id,
        facultyName: c.faculty?.name ?? c.faculty_name ?? 'Faculty',
        priority: c.priority,
        response: c.response,
      }))

      items.push({
        id: r.id,
        entryId,
        status: r.status,
        substituteName: r.assigned_faculty?.name ?? r.substitute_name ?? null,
        requesterName: r.requester?.name ?? r.faculty?.name ?? r.requester_name ?? null,
        role: r.role ?? 'requester',
        targetDate: dateStr,
        targetDateFormatted: dateObj.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        targetDayOfWeek,
        deadline: r.deadline ?? '',
        createdAt: r.created_at ?? '',
        reason: r.reason ?? null,
        isFront: false, // set after sorting
        isToday,
        isCurrentWeek,
        isPast,
        candidates,
      })
    }

    if (items.length === 0) continue

    // Sort queue chronologically ascending: earliest target date first
    items.sort((a, b) => {
      if (a.targetDate !== b.targetDate) {
        return a.targetDate.localeCompare(b.targetDate)
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    // Mark front element
    items[0].isFront = true
    slotQueuesMap.set(entryId, items)

    // Determine if the front element qualifies to be shown directly on the Weekly Timetable Grid
    const front = items[0]
    const slotDay = front.targetDayOfWeek

    let shouldShowOnGrid = false

    if (isRollOverToNextWeek) {
      // Academic week has rolled over to the upcoming week (Friday evening / weekend)
      // Check if this slot's date matches the corresponding day in the upcoming week:
      const targetDayOffset = slotDay - 1 // 0 for Monday, 1 for Tuesday, ... 4 for Friday
      const slotDateInNextWeek = new Date(nextMondayDate)
      slotDateInNextWeek.setDate(nextMondayDate.getDate() + targetDayOffset)
      const slotDateInNextWeekStr = toLocalDateString(slotDateInNextWeek)

      // Show if front item is queued for this target date in the upcoming week
      shouldShowOnGrid = front.targetDate === slotDateInNextWeekStr
    } else {
      // Standard in-week evaluation
      if (slotDay === todayDayOfWeek) {
        // If today is Monday, Monday's slot strictly requires targetDate to be TODAY
        shouldShowOnGrid = front.isToday
      } else if (slotDay > todayDayOfWeek) {
        // If slot is upcoming in the current week (e.g. Wednesday when today is Monday)
        shouldShowOnGrid = front.isCurrentWeek
      } else {
        // Slot was earlier in the week (e.g. Monday when today is Wednesday)
        // Only keep on grid if it was held earlier this week and still assigned/active
        shouldShowOnGrid = front.isCurrentWeek && !front.isPast
      }
    }

    if (shouldShowOnGrid) {
      activeOverlayMap.set(entryId, front)
    }
  }

  return { slotQueuesMap, activeOverlayMap }
}
