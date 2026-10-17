import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry } from '../components/WeeklyGrid'

interface Row {
  id: string
  is_elective: boolean
  courses: { code: string; name: string } | null
  rooms: { name: string } | null
  faculty: { name: string } | null
  time_slots: { day_of_week: number; period: number } | null
}

export default function StudentView() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<GridEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.section_id) return
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
            'id, is_elective, courses(code, name), rooms(name), faculty(name), time_slots(day_of_week, period)',
          )
          .eq('version_id', (ver as { id: string }).id)
          .eq('section_id', profile.section_id as string)
          .then(({ data, error: eErr }) => {
            if (eErr) {
              setError(eErr.message)
              return
            }
            setEntries(
              ((data ?? []) as unknown as Row[]).map((r) => ({
                id: r.id,
                day_of_week: r.time_slots?.day_of_week ?? 0,
                period: r.time_slots?.period ?? 0,
                course_code: r.courses?.code ?? '',
                course_name: r.courses?.name ?? '',
                room_name: r.rooms?.name ?? '',
                faculty_name: r.faculty?.name ?? '',
                is_elective: r.is_elective,
              })),
            )
          })
      })
  }, [profile])

  if (error) return <p>{error}</p>
  return (
    <section>
      <h2>My timetable</h2>
      <WeeklyGrid entries={entries} />
      <h3 style={{ marginTop: 24 }}>Notifications</h3>
      <p>Substitution alerts land in Phase 6 (push notifications).</p>
    </section>
  )
}
