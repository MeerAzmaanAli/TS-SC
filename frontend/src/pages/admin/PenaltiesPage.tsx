import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminHeader from '../../components/AdminHeader'
import {
  ClockIcon,
} from '../../components/Icons'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('substitution_penalties')
      .select(
        'id, created_at, reason, faculty!inner(name), ' +
          'substitution_requests(timetable_entries(courses(code)))'
      )
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        setLoading(false)
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
          }))
        )
      })
  }, [])

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.faculty_name] = (acc[r.faculty_name] ?? 0) + 1
    return acc
  }, {})

  const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div className="admin-cal-wrapper">
      <AdminHeader />

      {error && (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            fontSize: 13,
            color: '#991B1B',
          }}
        >
          <b>Error loading penalties:</b> {error}
        </div>
      )}

      {/* Summary Cards by Faculty */}
      <section className="admin-panel" style={{ marginTop: 4 }}>
        <div className="admin-panel-hd">
          <h2>Faculty Substitution Accountability &amp; Infractions</h2>
          <span className="admin-mu admin-m">{sortedCounts.length} flagged faculty</span>
        </div>

        {sortedCounts.length > 0 ? (
          <div className="admin-conflict-grid">
            {sortedCounts.map(([name, count]) => (
              <div
                key={name}
                className={`admin-conflict-box ${count >= 3 ? 'highlight' : ''}`}
              >
                <b>{count}</b>
                <span style={{ fontWeight: 600, color: '#1C1917', fontSize: 14 }}>{name}</span>
                <span style={{ fontSize: 12, marginTop: 4 }}>
                  {count >= 3 ? 'Flagged for departmental review' : 'Minor refusal infraction'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#57534E', fontSize: 13 }}>
            {loading ? 'Analyzing penalty records…' : 'No penalties recorded yet. High faculty responsiveness!'}
          </div>
        )}
      </section>

      {/* Detailed Penalty Audit Trail */}
      <section className="admin-panel" style={{ marginTop: 20 }}>
        <div className="admin-panel-hd">
          <h2>Recent Infraction Trail</h2>
          <span className="admin-mu admin-m">{rows.length} total logged</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E7E5E4', color: '#57534E' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Timestamp</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Faculty Member</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Course</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Infraction Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #EDEBE9' }}>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }} className="admin-m admin-mu">
                    <ClockIcon size={13} style={{ marginRight: 4, display: 'inline' }} />
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#1C1917' }}>
                    {r.faculty_name}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className="admin-cand-pill">
                      <em>{r.course_code}</em>
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className="admin-tag unfilled">{r.reason}</span>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '36px 12px', color: '#57534E' }}>
                    No individual penalty incidents logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
