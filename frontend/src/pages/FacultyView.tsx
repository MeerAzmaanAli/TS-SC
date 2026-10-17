import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry } from '../components/WeeklyGrid'
import SubstitutionInbox from '../components/SubstitutionInbox'
import { createSubstitutionRequest, SessionInfo } from '../lib/substitution'

interface Row {
  id: string
  is_elective: boolean
  section_id: string
  course_id: string
  time_slot_id: string
  courses: { code: string; name: string } | null
  rooms: { name: string } | null
  sections: { name: string } | null
  time_slots: { day_of_week: number; period: number; starts_at: string } | null
}

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function FacultyView() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.faculty_id) return
    supabase
      .from('timetable_versions')
      .select('id')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data: ver, error: vErr }) => {
        if (vErr || !ver) {
          setError('No published timetable yet.')
          return
        }
        return supabase
          .from('timetable_entries')
          .select(
            'id, is_elective, section_id, course_id, time_slot_id, ' +
              'courses(code, name), rooms(name), sections(name), ' +
              'time_slots(day_of_week, period, starts_at)',
          )
          .eq('version_id', (ver as { id: string }).id)
          .eq('faculty_id', profile.faculty_id as string)
          .then(({ data, error: eErr }) => {
            if (eErr) {
              setError(eErr.message)
              return
            }
            setRows((data ?? []) as unknown as Row[])
          })
      })
  }, [profile])

  async function handleRequest(row: Row) {
    if (!profile?.faculty_id || !row.time_slots) return
    const reason = window.prompt('Reason for substitution request (optional):') ?? undefined
    setBusy(row.id)
    setError(null)
    setNotice(null)
    try {
      const session: SessionInfo = {
        entryId: row.id,
        sectionId: row.section_id,
        courseId: row.course_id,
        timeSlotId: row.time_slot_id,
        dayOfWeek: row.time_slots.day_of_week,
        startsAt: row.time_slots.starts_at,
      }
      await createSubstitutionRequest(session, profile.faculty_id, reason || undefined)
      setNotice('Substitution request sent to available faculty.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const gridEntries: GridEntry[] = rows.map((r) => ({
    id: r.id,
    day_of_week: r.time_slots?.day_of_week ?? 0,
    period: r.time_slots?.period ?? 0,
    course_code: r.courses?.code ?? '',
    course_name: r.courses?.name ?? '',
    room_name: r.rooms?.name ?? '',
    section_name: r.sections?.name ?? '',
    is_elective: r.is_elective,
  }))

  if (error && rows.length === 0) return <p>{error}</p>
  return (
    <section>
      <h2>My timetable</h2>
      <WeeklyGrid entries={gridEntries} />

      <h3 style={{ marginTop: 24 }}>Request a substitute</h3>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {notice && <p style={{ color: 'green' }}>{notice}</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.id} style={{ marginBottom: 8 }}>
            {r.courses?.code} — {r.sections?.name} ({DAYS[r.time_slots?.day_of_week ?? 0]} P
            {r.time_slots?.period}){' '}
            <button disabled={busy === r.id} onClick={() => handleRequest(r)}>
              {busy === r.id ? 'Sending…' : 'Request substitute'}
            </button>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: 24 }}>Incoming substitution requests</h3>
      {profile?.faculty_id && <SubstitutionInbox facultyId={profile.faculty_id} />}
    </section>
  )
}
