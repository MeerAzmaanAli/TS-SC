import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ENTITIES } from '../lib/entities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import SectionPasskeyManager from '../components/SectionPasskeyManager'
import AcademicShiftManager from '../components/AcademicShiftManager'
import {
  SparklesIcon,
  RefreshIcon,
  InboxIcon,
  TrashIcon,
  LogOutIcon,
  UsersIcon,
  CheckCircleIcon,
  XIcon,
} from '../components/Icons'

interface Stats {
  departments: number
  programs: number
  sections: number
  courses: number
  faculty: number
  rooms: number
}

interface FacultyOption {
  id: string
  name: string
  email: string
}

interface DispatchedRequest {
  id: string
  created_at: string
  status: 'open' | 'assigned' | 'unfilled' | 'expired'
  reason: string | null
  deadline: string
  requester_faculty_id?: string
  requester_name: string
  requester_email: string
  assigned_name: string | null
  course_code: string
  course_name: string
  section_name: string
  day_of_week: number
  period: number
  starts_at: string
  ends_at: string
  candidates: {
    faculty_id: string
    faculty_name: string
    priority: number
    response: string
    responded_at: string | null
  }[]
}

interface VersionSummary {
  id: string
  status: 'draft' | 'published' | 'archived'
  created_at: string
  published_at: string | null
  violations: any
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AdminDashboard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'overview' | 'shifts' | 'access'>('overview')
  const [stats, setStats] = useState<Stats>({
    departments: 0,
    programs: 0,
    sections: 0,
    courses: 0,
    faculty: 0,
    rooms: 0,
  })
  const [substitutions, setSubstitutions] = useState<DispatchedRequest[]>([])
  const [allFaculty, setAllFaculty] = useState<FacultyOption[]>([])
  const [assignModalReq, setAssignModalReq] = useState<DispatchedRequest | null>(null)
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('')
  const [assigningBusy, setAssigningBusy] = useState(false)
  const [assignSuccessNotice, setAssignSuccessNotice] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [activeVersion, setActiveVersion] = useState<VersionSummary | null>(null)
  const [latestDraft, setLatestDraft] = useState<VersionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [subsLoading, setSubsLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  async function loadStats() {
    try {
      const [dept, prog, sec, crs, fac, rms] = await Promise.all([
        supabase.from('departments').select('*', { count: 'exact', head: true }),
        supabase.from('programs').select('*', { count: 'exact', head: true }),
        supabase.from('sections').select('*', { count: 'exact', head: true }),
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('faculty').select('*', { count: 'exact', head: true }),
        supabase.from('rooms').select('*', { count: 'exact', head: true }),
      ])
      setStats({
        departments: dept.count ?? 0,
        programs: prog.count ?? 0,
        sections: sec.count ?? 0,
        courses: crs.count ?? 0,
        faculty: fac.count ?? 0,
        rooms: rms.count ?? 0,
      })
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }

  async function loadVersions() {
    try {
      const { data, error } = await supabase
        .from('timetable_versions')
        .select('id, status, created_at, published_at, violations')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && data) {
        const published = (data.find((v: any) => v.status === 'published') as any) ?? null
        const draft = (data.find((v: any) => v.status === 'draft') as any) ?? null
        setActiveVersion(published)
        setLatestDraft(draft)
      }
    } catch (err) {
      console.warn('Failed to load timetable versions:', err)
    }
  }

  async function loadSubstitutions() {
    setSubsLoading(true)
    try {
      const { data, error } = await supabase
        .from('substitution_requests')
        .select(`
          id,
          created_at,
          status,
          reason,
          deadline,
          requester_faculty_id,
          assigned_faculty_id,
          faculty!substitution_requests_requester_faculty_id_fkey(name, email),
          assigned_faculty:faculty!substitution_requests_assigned_faculty_id_fkey(name),
          timetable_entries(
            section_id,
            course_id,
            time_slot_id,
            courses(code, name),
            sections(name),
            time_slots(day_of_week, period, starts_at, ends_at)
          ),
          substitution_candidates(
            faculty_id,
            priority,
            response,
            responded_at,
            faculty(name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Failed to load substitutions:', error)
        return
      }

      const formatted: DispatchedRequest[] = ((data ?? []) as any[]).map((r) => {
        const entry = r.timetable_entries
        const cands = (r.substitution_candidates ?? []).map((c: any) => ({
          faculty_id: c.faculty_id,
          faculty_name: c.faculty?.name ?? 'Faculty',
          priority: c.priority,
          response: c.response,
          responded_at: c.responded_at,
        }))
        cands.sort((a: any, b: any) => a.priority - b.priority)

        return {
          id: r.id,
          created_at: r.created_at,
          status: r.status,
          reason: r.reason,
          deadline: r.deadline,
          requester_faculty_id: r.requester_faculty_id,
          requester_name: r.faculty?.name ?? 'Unknown Requester',
          requester_email: r.faculty?.email ?? '',
          assigned_name: r.assigned_faculty?.name ?? null,
          course_code: entry?.courses?.code ?? '—',
          course_name: entry?.courses?.name ?? '—',
          section_name: entry?.sections?.name ?? '—',
          day_of_week: entry?.time_slots?.day_of_week ?? 0,
          period: entry?.time_slots?.period ?? 0,
          starts_at: entry?.time_slots?.starts_at ? entry.time_slots.starts_at.slice(0, 5) : '—',
          ends_at: entry?.time_slots?.ends_at ? entry.time_slots.ends_at.slice(0, 5) : '—',
          candidates: cands,
        }
      })

      setSubstitutions(formatted)
    } catch (err) {
      console.warn('Substitutions loading exception:', err)
    } finally {
      setSubsLoading(false)
    }
  }

  async function loadFacultyList() {
    try {
      const { data } = await supabase.from('faculty').select('id, name, email').order('name')
      if (data) setAllFaculty(data as FacultyOption[])
    } catch (e) {
      console.warn('Failed to load faculty list:', e)
    }
  }

  async function handleForceAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignModalReq || !selectedFacultyId) return

    setAssigningBusy(true)
    setAssignError(null)
    setAssignSuccessNotice(null)

    try {
      // 1. Try atomic custom function if exists
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_force_assign_substitution', {
        p_request_id: assignModalReq.id,
        p_faculty_id: selectedFacultyId,
        p_admin_notes: 'Force assigned by Administrator',
      })

      if (rpcErr) {
        // Direct table update fallback (covered by admin_all RLS)
        const { error: updErr } = await supabase
          .from('substitution_requests')
          .update({
            status: 'assigned',
            assigned_faculty_id: selectedFacultyId,
          })
          .eq('id', assignModalReq.id)

        if (updErr) throw updErr

        // Update or insert candidate row
        await supabase
          .from('substitution_candidates')
          .upsert({
            request_id: assignModalReq.id,
            faculty_id: selectedFacultyId,
            priority: 1,
            response: 'accepted',
            responded_at: new Date().toISOString(),
          }, { onConflict: 'request_id,faculty_id' })
      } else if (rpcRes && rpcRes.success === false) {
        throw new Error(rpcRes.error || 'Failed to assign faculty')
      }

      const assignedFac = allFaculty.find((f) => f.id === selectedFacultyId)
      setAssignSuccessNotice(`Successfully assigned ${assignedFac?.name ?? 'teacher'} to cover ${assignModalReq.course_code}.`)
      setAssignModalReq(null)
      setSelectedFacultyId('')
      await loadSubstitutions()
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : String(err))
    } finally {
      setAssigningBusy(false)
    }
  }

  async function handleClearAllSubstitutions() {
    if (!window.confirm('Are you sure you want to delete all substitution requests, candidate logs, and penalties?')) return
    setClearing(true)
    try {
      const { error: rpcErr } = await supabase.rpc('clear_all_substitution_data')
      if (rpcErr) {
        await supabase.from('substitution_penalties').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('substitution_candidates').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        await supabase.from('substitution_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      }
      await loadSubstitutions()
    } catch (err) {
      console.error('Failed to clear substitutions:', err)
    } finally {
      setClearing(false)
    }
  }

  async function handlePublishDraft(draftId: string) {
    if (!window.confirm('Publish this draft as the official active timetable for all students & faculty?')) return
    try {
      await supabase.from('timetable_versions').update({ status: 'archived' }).eq('status', 'published')
      await supabase.from('timetable_versions').update({
        status: 'published',
        published_at: new Date().toISOString(),
      }).eq('id', draftId)

      await loadVersions()
    } catch (err) {
      console.error('Failed to publish draft:', err)
    }
  }

  useEffect(() => {
    loadStats()
    loadVersions()
    loadSubstitutions()
    loadFacultyList()
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const targetViolations = (activeVersion?.violations || latestDraft?.violations || {}) as any
  const facultyClashes = Array.isArray(targetViolations?.faculty_clashes) ? targetViolations.faculty_clashes.length : 0
  const roomClashes = Array.isArray(targetViolations?.room_clashes) ? targetViolations.room_clashes.length : 0
  const sectionClashes = Array.isArray(targetViolations?.section_clashes) ? targetViolations.section_clashes.length : 0
  const gaps = typeof targetViolations?.total_gap_hours === 'number' ? targetViolations.total_gap_hours : 0
  const daySpreadIssues = Array.isArray(targetViolations?.day_spread_violations) ? targetViolations.day_spread_violations.length : 0
  const facultyLoadImbalance = typeof targetViolations?.load_variance === 'number' ? targetViolations.load_variance : 0

  return (
    <div className="admin-cal-wrapper">
      {/* Top Navigation & Fast Actions Bar */}
      <div className="admin-cal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="admin-cal-brand">
            <div className="admin-cal-logo" title="Timetable Scheduler & Smart Classroom">
              TS
            </div>
            <div className="admin-role-badge">
              <span className="admin-role-dot"></span>
              <span>Admin</span>
            </div>
          </div>

          <div className="admin-cal-nav">
            <button
              type="button"
              className={activeTab === 'overview' ? 'on' : ''}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={activeTab === 'shifts' ? 'on' : ''}
              onClick={() => setActiveTab('shifts')}
            >
              Shifts &amp; Timings
            </button>
            <Link to="/admin/timetable">Timetables</Link>
            <Link to="/admin/generate">Generator</Link>
            <Link to="/admin/versions">Conflicts</Link>
            <Link to="/admin/penalties">Substitutions</Link>
            <Link to="/admin/data">Data</Link>
            <button
              type="button"
              className={activeTab === 'access' ? 'on' : ''}
              onClick={() => setActiveTab('access')}
            >
              Access &amp; Passkeys
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={() => {
              loadStats()
              loadVersions()
              loadSubstitutions()
            }}
            title="Refresh dashboard data"
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          <Link to="/admin/generate" className="admin-btn">
            <SparklesIcon size={16} />
            <span>Generate timetable</span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="admin-btn admin-btn-outline"
            title="Sign out of Admin Dashboard"
          >
            <LogOutIcon size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {assignSuccessNotice && (
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
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleIcon size={16} />
            <span>{assignSuccessNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setAssignSuccessNotice(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0B5446' }}
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {activeTab === 'access' ? (
        <div style={{ marginTop: 8 }}>
          <SectionPasskeyManager />
        </div>
      ) : activeTab === 'shifts' ? (
        <div style={{ marginTop: 8 }}>
          <AcademicShiftManager />
        </div>
      ) : (
        /* Two-Column Responsive Layout */
        <div className="admin-cal-cols">
          {/* Main Column */}
          <div className="admin-cal-stack">
            {/* Active Substitution Requests */}
            <section className="admin-panel">
              <div className="admin-panel-hd">
                <h2>Active substitution requests</h2>
                <span className="admin-mu admin-m">
                  {subsLoading ? 'loading...' : `${substitutions.length} request${substitutions.length === 1 ? '' : 's'}`}
                </span>
              </div>

              {subsLoading ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#555B66' }}>
                  Loading live substitution requests...
                </div>
              ) : substitutions.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#555B66' }}>
                  <InboxIcon size={28} style={{ opacity: 0.35, margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 500 }}>No active substitution requests at this time.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    When faculty report absences, target lecture slots and ranked candidate responses will appear here.
                  </div>
                </div>
              ) : (
                <div>
                  {substitutions.slice(0, 3).map((sub) => {
                    const isAssigned = sub.status === 'assigned'
                    const isUnfilled = sub.status === 'unfilled'
                    const isOpen = sub.status === 'open'

                    return (
                      <div key={sub.id} className="admin-req-card">
                        <div
                          className={`admin-req-badge-box ${
                            isAssigned ? 'assigned' : isOpen ? 'open' : isUnfilled ? 'unfilled' : ''
                          }`}
                        >
                          <b>{sub.course_code}</b>
                          <span>{sub.section_name} · {sub.course_name}</span>
                          <span className="admin-m" style={{ marginTop: 8 }}>
                            {DAY_NAMES[sub.day_of_week] || `Day ${sub.day_of_week}`} · P{sub.period} · {sub.starts_at}–{sub.ends_at}
                          </span>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <b style={{ color: '#1B1D22', fontSize: 14 }}>{sub.requester_name}</b>{' '}
                              {sub.reason && <span className="admin-mu">· {sub.reason}</span>}
                            </div>
                            <span
                              className={`admin-tag ${
                                isAssigned ? 'assigned' : isOpen ? 'open' : isUnfilled ? 'unfilled' : ''
                              }`}
                            >
                              {isAssigned
                                ? `Assigned · ${new Date(sub.created_at).toLocaleDateString(undefined, {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : isOpen
                                ? 'Awaiting acceptance'
                                : sub.status}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                            <div className="admin-mu admin-m">
                              Deadline {new Date(sub.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setAssignModalReq(sub)
                                setSelectedFacultyId(sub.candidates[0]?.faculty_id ?? '')
                                setAssignError(null)
                              }}
                              className="admin-btn admin-btn-sm"
                              style={{
                                background: isAssigned ? '#ffffff' : '#4F46E5',
                                color: isAssigned ? '#1B1D22' : '#ffffff',
                                border: isAssigned ? '1px solid #D0D3D9' : 'none',
                                fontSize: 12,
                                height: 28,
                                padding: '0 10px',
                                gap: 6,
                              }}
                              title="Force assign a teacher to substitute this lecture"
                            >
                              <UsersIcon size={13} />
                              <span>{isAssigned ? 'Reassign Teacher' : 'Force Assign Teacher'}</span>
                            </button>
                          </div>

                          {sub.candidates.length > 0 && (
                            <div className="admin-cands-wrap">
                              {sub.candidates.map((cand) => {
                                const isWinner = sub.assigned_name === cand.faculty_name
                                const isAccepted = cand.response === 'accepted'
                                const isRejected = cand.response === 'rejected'

                                return (
                                  <div
                                    key={cand.faculty_id}
                                    className={`admin-cand-pill ${
                                      isWinner ? 'winner' : isAccepted ? 'accepted' : isRejected ? 'rejected' : ''
                                    }`}
                                    title={`Priority ${cand.priority} · ${cand.response}`}
                                  >
                                    <em>P{cand.priority}</em>
                                    <span>
                                      {cand.faculty_name}
                                      {isWinner ? ', accepted' : isAccepted ? ' (accepted)' : isRejected ? ' (declined)' : ''}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link to="/admin/timetable" className="admin-btn admin-btn-outline admin-btn-sm">
                      Open slot in timetable
                    </Link>
                    <button
                      type="button"
                      onClick={handleClearAllSubstitutions}
                      disabled={clearing}
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      title="Clear all substitution requests and candidate logs"
                    >
                      <TrashIcon size={13} />
                      <span>{clearing ? 'Clearing...' : 'Clear requests'}</span>
                    </button>
                    {substitutions.length > 3 && (
                      <Link to="/admin/penalties" className="admin-btn admin-btn-outline admin-btn-sm" style={{ marginLeft: 'auto' }}>
                        View all {substitutions.length} requests →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Conflicts Overview */}
            <section className="admin-panel">
              <div className="admin-panel-hd">
                <h2>Conflicts</h2>
                <Link to="/admin/versions" className="admin-mu" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                  Open inspector →
                </Link>
              </div>

              <div className="admin-conflict-grid">
                <div className={`admin-conflict-box ${facultyClashes > 0 ? 'highlight' : 'success'}`}>
                  <b>{facultyClashes}</b>
                  <span>Faculty clashes</span>
                </div>
                <div className={`admin-conflict-box ${roomClashes > 0 ? 'highlight' : 'success'}`}>
                  <b>{roomClashes}</b>
                  <span>Room clashes</span>
                </div>
                <div className={`admin-conflict-box ${sectionClashes > 0 ? 'highlight' : 'success'}`}>
                  <b>{sectionClashes}</b>
                  <span>Section clashes</span>
                </div>
                <div className="admin-conflict-box">
                  <b>{gaps}</b>
                  <span>Total gap periods</span>
                </div>
                <div className={`admin-conflict-box ${daySpreadIssues > 0 ? 'highlight' : ''}`}>
                  <b>{daySpreadIssues}</b>
                  <span>Day spread issues</span>
                </div>
                <div className="admin-conflict-box">
                  <b>{typeof facultyLoadImbalance === 'number' ? facultyLoadImbalance.toFixed(1) : facultyLoadImbalance}</b>
                  <span>Faculty load variance</span>
                </div>
              </div>
            </section>
          </div>

          {/* Right Sidebar Column */}
          <div className="admin-cal-stack">
            {/* Timetable Generation & Active Version Status */}
            <section className="admin-panel">
              <div className="admin-panel-hd">
                <h2>Timetable generation</h2>
              </div>

              {activeVersion ? (
                <div className="admin-version-card">
                  <div className="admin-mu">Active timetable</div>
                  <b>Version {activeVersion.id.slice(0, 8)}</b>
                  <div className="admin-mu admin-m" style={{ marginTop: 4 }}>
                    Published {activeVersion.published_at ? new Date(activeVersion.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
                  </div>
                </div>
              ) : (
                <div className="admin-version-card" style={{ background: '#F2F2F4' }}>
                  <div className="admin-mu">Active timetable</div>
                  <b>No published version</b>
                  <div className="admin-mu admin-m" style={{ marginTop: 4 }}>
                    Generate and publish a draft schedule.
                  </div>
                </div>
              )}

              {latestDraft && (
                <div className="admin-version-card draft">
                  <div className="admin-mu">Latest draft</div>
                  <b>Version {latestDraft.id.slice(0, 8)}</b>
                  <div className="admin-mu admin-m" style={{ marginTop: 4 }}>
                    {facultyClashes + roomClashes + sectionClashes === 0
                      ? '0 hard conflicts · ready to publish'
                      : `${facultyClashes + roomClashes + sectionClashes} hard conflicts detected`}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <Link to="/admin/generate" className="admin-btn" style={{ flex: 1 }}>
                  Generate
                </Link>
                {latestDraft && (
                  <button
                    type="button"
                    onClick={() => handlePublishDraft(latestDraft.id)}
                    className="admin-btn admin-btn-outline"
                    style={{ flex: 1 }}
                  >
                    Publish draft
                  </button>
                )}
              </div>
            </section>

            {/* Institutional Master Data Navigation */}
            <section className="admin-panel">
              <div className="admin-panel-hd">
                <h2>Data</h2>
                <span className="admin-mu admin-m">{ENTITIES.length} tables</span>
              </div>

              <div className="admin-data-grid">
                <Link to="/admin/data/departments" className="admin-data-link">
                  <span>Departments</span>
                  <span className="admin-m">{loading ? '…' : stats.departments}</span>
                </Link>
                <Link to="/admin/data/programs" className="admin-data-link">
                  <span>Programs</span>
                  <span className="admin-m">{loading ? '…' : stats.programs}</span>
                </Link>
                <Link to="/admin/data/sections" className="admin-data-link">
                  <span>Sections</span>
                  <span className="admin-m">{loading ? '…' : stats.sections}</span>
                </Link>
                <Link to="/admin/data/rooms" className="admin-data-link">
                  <span>Rooms</span>
                  <span className="admin-m">{loading ? '…' : stats.rooms}</span>
                </Link>
                <Link to="/admin/data/courses" className="admin-data-link">
                  <span>Courses</span>
                  <span className="admin-m">{loading ? '…' : stats.courses}</span>
                </Link>
                <Link to="/admin/data/program_courses" className="admin-data-link">
                  <span>Program courses</span>
                  <span className="admin-m"></span>
                </Link>
                <Link to="/admin/data/faculty" className="admin-data-link">
                  <span>Faculty</span>
                  <span className="admin-m">{loading ? '…' : stats.faculty}</span>
                </Link>
                <Link to="/admin/data/time_slots" className="admin-data-link">
                  <span>Time slots</span>
                  <span className="admin-m"></span>
                </Link>
                <Link to="/admin/data/faculty_qualifications" className="admin-data-link">
                  <span>Qualifications</span>
                  <span className="admin-m"></span>
                </Link>
                <Link to="/admin/data/faculty_unavailability" className="admin-data-link">
                  <span>Constraints</span>
                  <span className="admin-m"></span>
                </Link>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('access')}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginTop: 14,
                  color: '#1B1D22',
                  fontWeight: 500,
                  fontSize: 13,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Section codes and passkeys →
              </button>
            </section>
          </div>
        </div>
      )}
      {/* Force Assign Substitution Modal */}
      {assignModalReq && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !assigningBusy) setAssignModalReq(null)
          }}
        >
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                borderBottom: '1px solid #E3E4E8',
                paddingBottom: 10,
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B1D22', margin: 0 }}>
                  Admin Force Assign Teacher
                </h3>
                <div style={{ fontSize: 12, color: '#555B66', marginTop: 2 }}>
                  {assignModalReq.course_code} · {assignModalReq.section_name} ({DAY_NAMES[assignModalReq.day_of_week]} Period {assignModalReq.period})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalReq(null)}
                disabled={assigningBusy}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px' }}
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* Session Summary Card */}
            <div
              style={{
                padding: '12px 14px',
                background: '#F7F7F8',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                border: '1px solid #E3E4E8',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#555B66' }}>Requested by:</span>
                <strong style={{ color: '#1B1D22' }}>{assignModalReq.requester_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#555B66' }}>Time slot:</span>
                <span>
                  {assignModalReq.starts_at}–{assignModalReq.ends_at}
                </span>
              </div>
              {assignModalReq.assigned_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#555B66' }}>Current substitute:</span>
                  <span className="admin-tag assigned">{assignModalReq.assigned_name}</span>
                </div>
              )}
            </div>

            {assignError && (
              <div
                style={{
                  padding: 10,
                  background: '#FFF1F2',
                  border: '1px solid #FECDD3',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#9F1239',
                  marginBottom: 14,
                }}
              >
                {assignError}
              </div>
            )}

            <form onSubmit={handleForceAssign}>
              {/* Option A: Quick-pick from candidates already contacted */}
              {assignModalReq.candidates.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    Select from contacted substitute candidates:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {assignModalReq.candidates.map((c) => {
                      const isSelected = selectedFacultyId === c.faculty_id
                      return (
                        <div
                          key={c.faculty_id}
                          onClick={() => setSelectedFacultyId(c.faculty_id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            border: isSelected ? '2px solid #4F46E5' : '1px solid #E3E4E8',
                            background: isSelected ? '#EEF2FF' : '#ffffff',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="radio"
                              name="faculty-candidate"
                              checked={isSelected}
                              onChange={() => setSelectedFacultyId(c.faculty_id)}
                            />
                            <span style={{ fontWeight: isSelected ? 600 : 500, fontSize: 13, color: '#1B1D22' }}>
                              {c.faculty_name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="admin-cand-pill">
                              <em>P{c.priority}</em>
                            </span>
                            <span className={`admin-tag ${c.response === 'accepted' ? 'assigned' : c.response === 'rejected' ? 'unfilled' : 'open'}`}>
                              {c.response}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Option B: Choose any faculty from the institution */}
              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="all-faculty-select" style={{ fontWeight: 600, fontSize: 13 }}>
                  Or select any other faculty member:
                </label>
                <select
                  id="all-faculty-select"
                  className="input"
                  value={selectedFacultyId}
                  onChange={(e) => setSelectedFacultyId(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="">-- Choose a teacher from roster --</option>
                  {allFaculty
                    .filter((f) => f.name !== assignModalReq.requester_name && f.id !== assignModalReq.requester_faculty_id)
                    .map((f) => {
                      const isCandidate = assignModalReq.candidates.some((c) => c.faculty_id === f.id)
                      return (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.email ? `(${f.email})` : ''} {isCandidate ? '★ Contacted candidate' : ''}
                        </option>
                      )
                    })}
                </select>
                <div style={{ fontSize: 11, color: '#68707D', marginTop: 4 }}>
                  Admin override allows assigning any qualified or available faculty member directly.
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  borderTop: '1px solid #E3E4E8',
                  paddingTop: 14,
                }}
              >
                <button
                  type="button"
                  disabled={assigningBusy}
                  onClick={() => setAssignModalReq(null)}
                  className="admin-btn admin-btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningBusy || !selectedFacultyId}
                  className="admin-btn admin-btn-primary"
                  style={{ background: '#4F46E5', color: '#ffffff' }}
                >
                  <UsersIcon size={14} />
                  <span>{assigningBusy ? 'Assigning…' : 'Confirm Assignment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
