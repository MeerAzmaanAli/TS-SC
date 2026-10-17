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
        <li>
          <Link to="/admin/generate">Generate timetable</Link>
        </li>
        <li>
          <Link to="/admin/versions">Conflict Inspector &amp; publish</Link>
        </li>
      </ul>

      <h3>Substitution</h3>
      <ul>
        <li>
          <Link to="/admin/penalties">Penalty report</Link>
        </li>
      </ul>
    </section>
  )
}
