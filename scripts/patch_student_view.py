with open(r'd:\Meer Games\Major Project\TS-SC\frontend\src\pages\StudentView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update View A container & card
code = code.replace(
'''  if (!section) {
    return (
      <div style={{ maxWidth: 440, margin: '3.5rem auto 2rem', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2.5rem 2rem', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)' }}>''',
'''  if (!section) {
    return (
      <div className="student-cal-wrapper" style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <div className="admin-panel" style={{ width: '100%', maxWidth: 440, padding: '32px 28px' }}>'''
)

# 2. Update View A logo & button
code = code.replace(
'''            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                boxShadow: '0 8px 16px rgba(59, 130, 246, 0.25)',
              }}
            >
              <KeyIcon size={28} />
            </div>''',
'''            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '10px',
                background: '#1B1D22',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              TS
            </div>'''
)

code = code.replace(
'''            <button
              type="submit"
              disabled={authLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '1rem',
                fontWeight: 600,
                marginTop: '0.5rem',
                justifyContent: 'center',
              }}
            >''',
'''            <button
              type="submit"
              disabled={authLoading}
              className="admin-btn"
              style={{
                width: '100%',
                minHeight: 44,
                fontSize: 14,
                marginTop: '0.5rem',
              }}
            >'''
)

# 3. Update View B authenticated view wrapper
old_view_b = '''  return (
    <div>
      {/* Top Header */}
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: '0.4rem' }}>
            <span className="badge badge-success">Official Campus Schedule</span>
            <span className="badge badge-primary">{section.code}</span>
            <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
              {section.program_name} (Sem {section.semester})
            </span>
          </div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CalendarIcon size={26} style={{ color: 'var(--primary-600, #2563eb)' }} />
            <span>Section {section.name} Timetable</span>
          </h1>
          <p className="page-subtitle">
            Live schedule for Section <strong>{section.name}</strong> ({section.code}). Real-time substitutions and classroom assignments update automatically.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            onClick={() => fetchSchedule(section.code, passkey, false)}
            className="btn btn-secondary btn-sm"
            disabled={loadingSchedule}
            title="Refresh schedule"
          >
            <RefreshIcon size={14} className={loadingSchedule ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm"
            title="Print or save PDF of schedule"
          >
            <span>Print Timetable</span>
          </button>
          <button
            onClick={handleSwitchSection}
            className="btn btn-secondary btn-sm"
            style={{ color: '#dc2626' }}
            title="Switch Section"
          >
            <span>Switch Section</span>
          </button>
        </div>
      </div>'''

new_view_b = '''  return (
    <div className="student-cal-wrapper">
      {/* Top Navigation & Fast Actions Bar */}
      <div className="admin-cal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="admin-cal-logo" title="Timetable Scheduler">
              TS
            </div>
            <div className="portal-role-badge">
              <span className="portal-role-dot student"></span>
              <span>Student · {section.code}</span>
            </div>
          </div>

          <div className="admin-cal-nav">
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1B1D22', padding: '6px 12px', background: '#ffffff', borderRadius: 8, boxShadow: '0 0 0 1px #E3E4E8' }}>
              Section {section.name} · {section.program_name} (Sem {section.semester})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={() => fetchSchedule(section.code, passkey, false)}
            disabled={loadingSchedule}
            title="Refresh timetable"
          >
            <RefreshIcon size={15} className={loadingSchedule ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={() => window.print()}
            title="Print or save schedule PDF"
          >
            <span>Print</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-danger admin-btn-sm"
            onClick={handleSwitchSection}
            title="Switch Section"
          >
            <span>Switch Section</span>
          </button>
        </div>
      </div>'''

code_norm = code.replace('\r\n', '\n')
old_b_norm = old_view_b.replace('\r\n', '\n')
new_b_norm = new_view_b.replace('\r\n', '\n')

if old_b_norm in code_norm:
    code_norm = code_norm.replace(old_b_norm, new_b_norm)
    print("Replaced View B!")
else:
    print("View B not found")

with open(r'd:\Meer Games\Major Project\TS-SC\frontend\src\pages\StudentView.tsx', 'w', encoding='utf-8') as f:
    f.write(code_norm)

print("Updated StudentView.tsx successfully")

