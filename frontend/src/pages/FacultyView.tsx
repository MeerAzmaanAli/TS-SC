import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry } from '../components/WeeklyGrid'
import SubstitutionInbox from '../components/SubstitutionInbox'
import {
  createSubstitutionRequest,
  getLectureTemporalStatus,
  SessionInfo,
  sweepAllExpiredRequests,
} from '../lib/substitution'
import {
  CalendarIcon,
  UsersIcon,
  InboxIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  MapPinIcon,
  XIcon,
} from '../components/Icons'

interface Row {
  id: string
  is_elective: boolean
  batch?: number | null
  section_id: string
  course_id: string
  time_slot_id: string
  courses: { code: string; name: string } | null
  rooms: { name: string } | null
  sections: { name: string } | null
  time_slots: { day_of_week: number; period: number; starts_at: string } | null
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function FacultyView() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedule' | 'request' | 'inbox'>('schedule')
  const [requestModalSession, setRequestModalSession] = useState<Row | null>(null)
  const [requestReason, setRequestReason] = useState('')

  useEffect(() => {
    // Automatically sweep and finalize any expired requests across the campus
    sweepAllExpiredRequests().catch((err) => console.warn('Automatic sweep error:', err))
  }, [])

  useEffect(() => {
    if (!profile?.faculty_id) return
    supabase
      .from('timetable_versions')
      .select('id')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .single()
      .then(async ({ data: ver, error: vErr }) => {
        if (vErr || !ver) {
          setError('No published timetable currently active.')
          return
        }
        const vId = (ver as { id: string }).id
        let rawData: unknown[] = []
        const res = await supabase
          .from('timetable_entries')
          .select(
            'id, batch, is_elective, section_id, course_id, time_slot_id, ' +
              'courses(code, name), rooms(name), sections(name), ' +
              'time_slots(day_of_week, period, starts_at)',
          )
          .eq('version_id', vId)
          .eq('faculty_id', profile.faculty_id as string)

        if (res.error && res.error.message?.includes('batch')) {
          const fallback = await supabase
            .from('timetable_entries')
            .select(
              'id, is_elective, section_id, course_id, time_slot_id, ' +
              'courses(code, name), rooms(name), sections(name), ' +
              'time_slots(day_of_week, period, starts_at)',
            )
            .eq('version_id', vId)
            .eq('faculty_id', profile.faculty_id as string)
          if (fallback.error) {
            setError(fallback.error.message)
            return
          }
          rawData = fallback.data ?? []
        } else if (res.error) {
          setError(res.error.message)
          return
        } else {
          rawData = res.data ?? []
        }

        setRows(rawData as Row[])
      })
  }, [profile])

  async function handleConfirmRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.faculty_id || !requestModalSession || !requestModalSession.time_slots) return

    setBusy(requestModalSession.id)
    setError(null)
    setNotice(null)
    try {
      const session: SessionInfo = {
        entryId: requestModalSession.id,
        sectionId: requestModalSession.section_id,
        courseId: requestModalSession.course_id,
        timeSlotId: requestModalSession.time_slot_id,
        dayOfWeek: requestModalSession.time_slots.day_of_week,
        startsAt: requestModalSession.time_slots.starts_at,
      }
      await createSubstitutionRequest(session, profile.faculty_id, requestReason.trim() || undefined)
      setNotice(
        `Coverage request for ${requestModalSession.courses?.code} dispatched to qualified, free faculty colleagues.`,
      )
      setRequestModalSession(null)
      setRequestReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('Dispatch failed:', err)
    } finally {
      setBusy(null)
    }
  }
