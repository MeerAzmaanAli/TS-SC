import { Link } from 'react-router-dom'
import { ENTITIES } from '../lib/entities'

export default function AdminDashboard() {
  return (
    <section>
      <h2>Admin dashboard</h2>

      <h3>Manage data</h3>
      <ul>
        {ENTITIES.map((e) => (
          <li key={e.name}>
            <Link to={`/admin/data/${e.name}`}>{e.label}</Link>
          </li>
        ))}
      </ul>

      <h3>Timetable</h3>
      <ul>
        <li>Generate Timetable — Phase 4</li>
        <li>Conflict Inspector — Phase 4</li>
        <li>Publish / unpublish — Phase 4</li>
      </ul>

      <h3>Substitution</h3>
      <ul>
        <li>Penalty report — Phase 5</li>
      </ul>
    </section>
  )
}
