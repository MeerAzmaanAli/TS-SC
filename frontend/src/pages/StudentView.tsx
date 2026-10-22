import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import WeeklyGrid, { GridEntry } from '../components/WeeklyGrid'
import {
  CalendarIcon,
  BellIcon,
  BookOpenIcon,
  LayersIcon,
  AlertCircleIcon,
} from '../components/Icons'

interface Row {
  id: string
  is_elective: boolean
  batch?: number | null
  courses: { code: string; name: string } | null
  rooms: { name: string } | null
  faculty: { name: string } | null
  time_slots: { day_of_week: number; period: number } | null
}

export default function StudentView() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<GridEntry[]>([])
  const [sectionName, setSectionName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.section_id) {
      setLoading(false)
      return
    }

    // Load section name
    supabase
      .from('sections')
      .select('name, semester')
      .eq('id', profile.section_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSectionName(
            `Section ${data.name}${data.semester ? ` (Sem ${data.semester})` : ''}`,
          )
        }
      })

    // Load published timetable
    supabase
      .from('timetable_versions')
      .select('id')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .single()
      .then(async ({ data: ver, error: vErr }) => {
        setLoading(false)
        if (vErr || !ver) {
          setError('No published timetable currently available for your section.')
          return
        }
        const vId = (ver as { id: string }).id
        let rawData: unknown[] = []
        const res = await supabase
          .from('timetable_entries')
          .select(
            'id, batch, is_elective, courses(code, name), rooms(name), faculty(name), time_slots(day_of_week, period)',
          )
          .eq('version_id', vId)
          .eq('section_id', profile.section_id as string)

        if (res.error && res.error.message?.includes('batch')) {
          const fallback = await supabase
            .from('timetable_entries')
            .select(
              'id, is_elective, courses(code, name), rooms(name), faculty(name), time_slots(day_of_week, period)',
            )
            .eq('version_id', vId)
            .eq('section_id', profile.section_id as string)
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

        setEntries(
          (rawData as Row[]).map((r) => ({
            id: r.id,
            day_of_week: r.time_slots?.day_of_week ?? 0,
            period: r.time_slots?.period ?? 0,
            course_code: r.courses?.code ?? '',
            course_name: r.courses?.name ?? '',
            room_name: r.rooms?.name ?? '',
            faculty_name: r.faculty?.name ?? '',
            is_elective: r.is_elective,
            batch: r.batch ?? null,
          })),
        )
      })
  }, [profile])

  const electiveCount = entries.filter((e) => e.is_elective).length

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
        <p className="text-muted">Loading your section's class schedule…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: '0.35rem' }}>
            <span className="badge badge-success">Official Campus Schedule</span>
            {sectionName && <span className="badge badge-primary">{sectionName}</span>}
          </div>
          <h1 className="page-title">
            <CalendarIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>Class Timetable &amp; Schedule</span>
          </h1>
          <p className="page-subtitle">
            View your weekly class schedule, assigned classroom locations, faculty instructors, and live lecture updates.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm"
            title="Print or save PDF of schedule"
          >
            <span>Print Timetable</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-warning">
          <AlertCircleIcon size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Quick Summary Pill Bar */}
      {entries.length > 0 && (
        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card" style={{ padding: '0.85rem 1.25rem' }}>
            <div className="stat-icon indigo" style={{ width: 38, height: 38 }}>
              <BookOpenIcon size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: '1.25rem' }}>{entries.length}</div>
              <div className="stat-label">Weekly Lectures</div>
            </div>
          </div>

          <div className="stat-card" style={{ padding: '0.85rem 1.25rem' }}>
            <div className="stat-icon purple" style={{ width: 38, height: 38 }}>
              <LayersIcon size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: '1.25rem' }}>{electiveCount}</div>
              <div className="stat-label">Elective Sessions</div>
            </div>
          </div>

          <div className="stat-card" style={{ padding: '0.85rem 1.25rem' }}>
            <div className="stat-icon emerald" style={{ width: 38, height: 38 }}>
              <CalendarIcon size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: '1.25rem' }}>5 Days</div>
              <div className="stat-label">Monday – Friday</div>
            </div>
          </div>
        </div>
      )}

      {/* Timetable Grid */}
      <div style={{ marginBottom: '2rem' }}>
        <WeeklyGrid entries={entries} viewMode="section" />
      </div>

      {/* Realtime Substitution Live Broadcast Notice */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div className="stat-icon indigo" style={{ width: 44, height: 44, flexShrink: 0 }}>
            <BellIcon size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--slate-900)' }}>
              Live Substitution Notifications
            </h3>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem', lineHeight: 1.5 }}>
              Whenever a faculty member requests substitution and a replacement instructor is confirmed by the automated engine, room changes and substitute faculty notices will be highlighted directly on your schedule in real-time.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
