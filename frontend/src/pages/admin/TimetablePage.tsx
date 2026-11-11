import AdminHeader from '../../components/AdminHeader'
import TimetablePreview from '../../components/TimetablePreview'

export default function TimetablePage() {
  return (
    <div className="admin-cal-wrapper">
      <AdminHeader />

      <div className="admin-panel" style={{ marginTop: 4 }}>
        <div className="admin-panel-hd" style={{ marginBottom: 12 }}>
          <div>
            <h2>Institutional Timetable Matrix</h2>
            <p className="admin-mu" style={{ fontSize: 13, margin: '4px 0 0 0' }}>
              Full weekly campus schedule matrix. Filter by Student Sections or Faculty Instructors and inspect live assignments.
            </p>
          </div>
        </div>

        <TimetablePreview showVersionSelector={true} />
      </div>
    </div>
  )
}
