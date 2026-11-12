interface TimetablePrintHeaderProps {
  mode: 'section' | 'faculty'
  departmentName?: string | null
  programName?: string | null
  semester?: number | null
  sectionName?: string | null
  sectionCode?: string | null
  shift?: number | null
  facultyName?: string | null
  facultyEmail?: string | null
  batchLabel?: string | null
}

function getAcademicYearLabel(semester?: number | null): string {
  if (!semester || semester < 1) return '—'
  const year = Math.ceil(semester / 2)
  const suffix = year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'
  return `${year}${suffix} Year (Semester ${semester})`
}

export default function TimetablePrintHeader({
  mode,
  departmentName,
  programName,
  semester,
  sectionName,
  sectionCode,
  shift,
  facultyName,
  facultyEmail,
  batchLabel,
}: TimetablePrintHeaderProps) {
  const effectiveShift =
    shift ?? (semester && [3, 4, 5, 6].includes(semester) ? 2 : 1)
  const shiftLabel =
    effectiveShift === 2
      ? 'Shift 2 · 10:15 AM – 04:45 PM (Lunch 12:15 – 12:45 PM)'
      : 'Shift 1 · 08:15 AM – 02:45 PM (Lunch 12:15 – 12:45 PM)'

  return (
    <div className="tt-print-header">
      <div className="tt-print-header-top">
        <div>
          <div className="tt-print-eyebrow">
            TS-SC · Institutional Academic Timetable
          </div>
          <h2 className="tt-print-title">
            {mode === 'section'
              ? `Section ${sectionName ?? '—'}${sectionCode ? ` (${sectionCode})` : ''} — Weekly Timetable & Course Roster`
              : `${facultyName ?? 'Faculty'} — Weekly Teaching Timetable & Course Roster`}
          </h2>
        </div>
        <div className="tt-print-date">
          Printed {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {mode === 'section' ? (
        <div className="tt-print-meta-grid">
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Department</span>
            <span className="tt-print-meta-val">{departmentName || '—'}</span>
          </div>
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Program</span>
            <span className="tt-print-meta-val">{programName || '—'}</span>
          </div>
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Year &amp; Semester</span>
            <span className="tt-print-meta-val">{getAcademicYearLabel(semester)}</span>
          </div>
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Section</span>
            <span className="tt-print-meta-val">
              {sectionName || '—'}
              {sectionCode ? ` (${sectionCode})` : ''}
              {batchLabel ? ` · ${batchLabel}` : ''}
            </span>
          </div>
          <div className="tt-print-meta-item tt-print-meta-wide">
            <span className="tt-print-meta-label">Shift &amp; Timing</span>
            <span className="tt-print-meta-val">{shiftLabel}</span>
          </div>
        </div>
      ) : (
        <div className="tt-print-meta-grid">
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Faculty Name</span>
            <span className="tt-print-meta-val">{facultyName || '—'}</span>
          </div>
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Department</span>
            <span className="tt-print-meta-val">{departmentName || '—'}</span>
          </div>
          <div className="tt-print-meta-item">
            <span className="tt-print-meta-label">Email</span>
            <span className="tt-print-meta-val">{facultyEmail || '—'}</span>
          </div>
          <div className="tt-print-meta-item tt-print-meta-wide">
            <span className="tt-print-meta-label">Schedule Window</span>
            <span className="tt-print-meta-val">
              Combined Shifts 1 &amp; 2 · 08:15 AM – 04:45 PM (Common Lunch 12:15 – 12:45 PM)
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

