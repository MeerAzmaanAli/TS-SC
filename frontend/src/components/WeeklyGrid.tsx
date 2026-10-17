export interface GridEntry {
  id: string
  day_of_week: number
  period: number
  course_code: string
  course_name: string
  room_name: string
  faculty_name?: string
  section_name?: string
  is_elective: boolean
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeeklyGrid({ entries }: { entries: GridEntry[] }) {
  const days = [...new Set(entries.map((e) => e.day_of_week))].sort((a, b) => a - b)
  const periods = [...new Set(entries.map((e) => e.period))].sort((a, b) => a - b)
  const cell = new Map(entries.map((e) => [`${e.day_of_week}-${e.period}`, e]))

  if (entries.length === 0) return <p>No scheduled sessions.</p>

  return (
    <table style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ padding: 8 }}></th>
          {periods.map((p) => (
            <th key={p} style={{ borderBottom: '2px solid #333', padding: 8 }}>
              P{p}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d}>
            <th style={{ borderRight: '2px solid #333', padding: 8 }}>{DAY_NAMES[d] ?? `Day ${d}`}</th>
            {periods.map((p) => {
              const e = cell.get(`${d}-${p}`)
              return (
                <td
                  key={p}
                  style={{ border: '1px solid #ddd', padding: 8, minWidth: 140, verticalAlign: 'top' }}
                >
                  {e ? (
                    <>
                      <strong>{e.course_code}</strong>
                      <br />
                      <span style={{ fontSize: 12 }}>{e.course_name}</span>
                      <br />
                      <span style={{ fontSize: 12, color: '#555' }}>
                        {e.room_name}
                        {e.faculty_name ? ` · ${e.faculty_name}` : ''}
                        {e.section_name ? ` · ${e.section_name}` : ''}
                        {e.is_elective ? ' · elective' : ''}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#ccc' }}>—</span>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
