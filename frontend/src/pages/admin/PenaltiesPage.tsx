import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Penalty {
  id: string
  created_at: string
  reason: string
  faculty_name: string
  course_code: string
}

export default function PenaltiesPage() {
  const [rows, setRows] = useState<Penalty[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('substitution_penalties')
      .select(
        'id, created_at, reason, faculty!inner(name), ' +
          'substitution_requests(timetable_entries(courses(code)))',
      )
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
          return
        }
        setRows(
          ((data ?? []) as unknown as {
            id: string
            created_at: string
            reason: string
            faculty: { name: string }
            substitution_requests: {
              timetable_entries: { courses: { code: string } | null }
            } | null
          }[]).map((p) => ({
            id: p.id,
            created_at: p.created_at,
            reason: p.reason,
            faculty_name: p.faculty.name,
            course_code: p.substitution_requests?.timetable_entries?.courses?.code ?? '—',
          })),
        )
      })
  }, [])

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.faculty_name] = (acc[r.faculty_name] ?? 0) + 1
    return acc
  }, {})

  return (
    <section>
      <h2>Substitution penalties</h2>
      <p>Repeated rejections / timeouts per faculty — for department review.</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <h3>Totals</h3>
      <ul>
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([name, n]) => (
            <li key={name}>
              {name}: {n}
            </li>
          ))}
      </ul>
      <h3>Recent</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #333', textAlign: 'left', padding: 8 }}>When</th>
            <th style={{ borderBottom: '2px solid #333', textAlign: 'left', padding: 8 }}>Faculty</th>
            <th style={{ borderBottom: '2px solid #333', textAlign: 'left', padding: 8 }}>Course</th>
            <th style={{ borderBottom: '2px solid #333', textAlign: 'left', padding: 8 }}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ borderBottom: '1px solid #ddd', padding: 8 }}>
                {new Date(r.created_at).toLocaleString()}
              </td>
              <td style={{ borderBottom: '1px solid #ddd', padding: 8 }}>{r.faculty_name}</td>
              <td style={{ borderBottom: '1px solid #ddd', padding: 8 }}>{r.course_code}</td>
              <td style={{ borderBottom: '1px solid #ddd', padding: 8 }}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
