with open(r'd:\Meer Games\Major Project\TS-SC\frontend\src\pages\FacultyView.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
code = code.replace(
'''import {
  CalendarIcon,
  UsersIcon,
  InboxIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  MapPinIcon,
  XIcon,
} from '../components/Icons' '''.strip(),
'''import { useNavigate } from 'react-router-dom'
import {
  CalendarIcon,
  UsersIcon,
  InboxIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  MapPinIcon,
  XIcon,
  RefreshIcon,
  LogOutIcon,
} from '../components/Icons' '''.strip()
)

# 2. Add signOut inside FacultyView
code = code.replace(
'''export default function FacultyView() {
  const { profile } = useAuth()''',
'''export default function FacultyView() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }'''
)

# 3. Target the return wrapper through tab closing tag
target_str = '''  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CalendarIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>Faculty Academic Portal</span>
          </h1>
          <p className="page-subtitle">
            View your weekly teaching schedule, manage peer substitution coverage, and respond to incoming requests directly on your timetable.
          </p>
        </div>

        <div className="page-header-actions">
          {incomingRequests.length > 0 && (
            <button
              onClick={() => setActiveTab('inbox')}
              className="btn btn-primary btn-sm"
              style={{ position: 'relative' }}
            >
              <InboxIcon size={14} />
              <span>{incomingRequests.length} Pending Coverage Requests</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <CheckCircleIcon size={18} />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <CalendarIcon size={16} />
          <span>My Teaching Timetable</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          <UsersIcon size={16} />
          <span>Request Substitution</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          <InboxIcon size={16} />
          <span>Coverage Inbox {incomingRequests.length > 0 && `(${incomingRequests.length})`}</span>
        </button>
      </div>'''

replacement_str = '''  return (
    <div className="faculty-cal-wrapper">
      {/* Top Navigation & Fast Actions Bar */}
      <div className="admin-cal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="admin-cal-logo" title="Timetable Scheduler">
              TS
            </div>
            <div className="portal-role-badge">
              <span className="portal-role-dot faculty"></span>
              <span>Faculty</span>
            </div>
          </div>

          <div className="admin-cal-nav">
            <button
              type="button"
              className={activeTab === 'schedule' ? 'on' : ''}
              onClick={() => setActiveTab('schedule')}
            >
              Teaching Timetable
            </button>
            <button
              type="button"
              className={activeTab === 'request' ? 'on' : ''}
              onClick={() => setActiveTab('request')}
            >
              Request Coverage
            </button>
            <button
              type="button"
              className={activeTab === 'inbox' ? 'on' : ''}
              onClick={() => setActiveTab('inbox')}
            >
              Coverage Inbox {incomingRequests.length > 0 ? `(${incomingRequests.length})` : ''}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {incomingRequests.length > 0 && activeTab !== 'inbox' && (
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className="admin-btn admin-btn-sm"
              style={{ background: '#4F46E5' }}
            >
              <InboxIcon size={14} />
              <span>{incomingRequests.length} Pending Requests</span>
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={loadData}
            title="Refresh teaching timetable"
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="admin-btn admin-btn-outline"
            title="Sign out of Faculty Portal"
          >
            <LogOutIcon size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: '#FFF1F2',
            border: '1px solid #FECDD3',
            borderRadius: 8,
            fontSize: 13,
            color: '#9F1239',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          style={{
            padding: 12,
            background: '#E3F3DE',
            border: '1px solid #B8E3B0',
            borderRadius: 8,
            fontSize: 13,
            color: '#0B5446',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircleIcon size={16} />
          <span>{notice}</span>
        </div>
      )}'''

code_norm = code.replace('\r\n', '\n')
target_norm = target_str.replace('\r\n', '\n')
rep_norm = replacement_str.replace('\r\n', '\n')

if target_norm in code_norm:
    code_norm = code_norm.replace(target_norm, rep_norm)
    with open(r'd:\Meer Games\Major Project\TS-SC\frontend\src\pages\FacultyView.tsx', 'w', encoding='utf-8') as f:
        f.write(code_norm)
    print("SUCCESS")
else:
    print("NOT FOUND")

