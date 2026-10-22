import { Link } from 'react-router-dom'
import TimetablePreview from '../../components/TimetablePreview'
import { CalendarIcon, SparklesIcon, AlertTriangleIcon } from '../../components/Icons'

export default function TimetablePage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CalendarIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>Institutional Timetable Matrix</span>
          </h1>
          <p className="page-subtitle">
            Comprehensive weekly schedule preview (Rows = Weekday, Columns = Time Slot). Switch seamlessly between Student Sections and Faculty Instructors.
          </p>
        </div>

        <div className="flex gap-2">
          <Link to="/admin/generate" className="btn btn-primary btn-sm">
            <SparklesIcon size={14} />
            <span>Generate New Schedule</span>
          </Link>

          <Link to="/admin/versions" className="btn btn-secondary btn-sm">
            <AlertTriangleIcon size={14} />
            <span>Version Inspector</span>
          </Link>
        </div>
      </div>

      <TimetablePreview showVersionSelector={true} />
    </div>
  )
}
