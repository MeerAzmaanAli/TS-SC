import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ENTITIES } from '../lib/entities'
import { supabase } from '../lib/supabase'
import SectionPasskeyManager from '../components/SectionPasskeyManager'
import {
  SparklesIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  UsersIcon,
  ArrowRightIcon,
  LayersIcon,
  ClockIcon,
  CheckCircleIcon,
  XIcon,
  RefreshIcon,
  InboxIcon,
} from '../components/Icons'

interface Stats {
  departments: number
  programs: number
  sections: number
  courses: number
  faculty: number
  rooms: number
}

interface DispatchedRequest {
  id: string
  created_at: string
  status: 'open' | 'assigned' | 'unfilled' | 'expired'
  reason: string | null
  deadline: string
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

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    departments: 0,
    programs: 0,
    sections: 0,
    courses: 0,
    faculty: 0,
    rooms: 0,
  })
  const [substitutions, setSubstitutions] = useState<DispatchedRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [subsLoading, setSubsLoading] = useState(true)

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

        // Sort candidates by priority (P1 first, then P2, P3)
        cands.sort((a: any, b: any) => a.priority - b.priority)

        return {
          id: r.id,
          created_at: r.created_at,
          status: r.status,
          reason: r.reason,
          deadline: r.deadline,
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

  useEffect(() => {
    loadStats()
    loadSubstitutions()
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <LayersIcon size={28} style={{ color: 'var(--primary-600)' }} />
            <span>Administrator Control Center</span>
          </h1>
          <p className="page-subtitle">
            Configure institutional entities, trigger conflict-free CP-SAT timetable generation, and oversee real-time faculty substitutions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              loadStats()
              loadSubstitutions()
            }}
            className="btn btn-secondary"
            title="Refresh Dashboard"
          >
            <RefreshIcon size={16} />
            <span>Refresh</span>
          </button>
          <Link to="/admin/generate" className="btn btn-primary">
            <SparklesIcon size={16} />
            <span>Generate Timetable</span>
          </Link>
        </div>
      </div>

      {/* Institutional Overview Metrics */}
      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-icon indigo">
            <BookOpenIcon size={24} />
          </div>
          <div>
            <div className="stat-value">{loading ? '…' : stats.courses}</div>
            <div className="stat-label">Active Courses</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon emerald">
            <UsersIcon size={24} />
          </div>
          <div>
            <div className="stat-value">{loading ? '…' : stats.faculty}</div>
            <div className="stat-label">Faculty Members</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber">
            <LayersIcon size={24} />
          </div>
          <div>
            <div className="stat-value">{loading ? '…' : stats.sections}</div>
            <div className="stat-label">Student Sections</div>
          </div>
        </div>
      </div>

      {/* Real-Time Dispatched Substitutions Monitor */}
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <div className="card-header">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'var(--primary-50)',
                color: 'var(--primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <InboxIcon size={18} />
            </div>
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>
                Dispatched Faculty Substitution Monitor
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Real-time audit of leaves, target lecture slots, and recipient faculty candidate dispatches.
              </p>
            </div>
          </div>
          <span className="badge badge-neutral">
            {substitutions.length} Recorded Requests
          </span>
        </div>

        {subsLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading live substitution dispatches...
          </div>
        ) : substitutions.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <InboxIcon size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <div style={{ fontWeight: 600 }}>No faculty substitution requests dispatched yet.</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
              When faculty raise substitution requests, their assigned sessions and candidate pools will appear here.
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requester</th>
                  <th>Course &amp; Section</th>
                  <th>Scheduled Slot</th>
                  <th>Candidate Pool &amp; Responses</th>
                </tr>
              </thead>
              <tbody>
                {substitutions.map((sub) => {
                  const isAssigned = sub.status === 'assigned'
                  const isUnfilled = sub.status === 'unfilled'
                  const isOpen = sub.status === 'open'

                  return (
                    <tr key={sub.id}>
                      {/* Status */}
                      <td style={{ verticalAlign: 'top', minWidth: 120 }}>
                        <span
                          className={`badge ${
                            isAssigned
                              ? 'badge-success'
                              : isUnfilled
                              ? 'badge-danger'
                              : isOpen
                              ? 'badge-primary'
                              : 'badge-neutral'
                          }`}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {isOpen && (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                backgroundColor: 'currentColor',
                                marginRight: 5,
                                display: 'inline-block',
                              }}
                            />
                          )}
                          {sub.status}
                        </span>

                        {isAssigned && sub.assigned_name && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: '0.78rem',
                              color: 'var(--emerald-700)',
                              fontWeight: 600,
                            }}
                          >
                            ✓ Taken by: {sub.assigned_name}
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: '0.72rem',
                            color: 'var(--text-subtle)',
                          }}
                        >
                          {new Date(sub.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Requester */}
                      <td style={{ verticalAlign: 'top', minWidth: 160 }}>
                        <div style={{ fontWeight: 700, color: 'var(--slate-900)' }}>
                          {sub.requester_name}
                        </div>
                        {sub.requester_email && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {sub.requester_email}
                          </div>
                        )}
                        {sub.reason && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: '0.78rem',
                              color: 'var(--slate-600)',
                              fontStyle: 'italic',
                              background: 'var(--slate-50)',
                              padding: '3px 7px',
                              borderRadius: '4px',
                              borderLeft: '2px solid var(--primary-400)',
                            }}
                          >
                            "{sub.reason}"
                          </div>
                        )}
                      </td>

                      {/* Course & Section */}
                      <td style={{ verticalAlign: 'top', minWidth: 180 }}>
                        <div style={{ fontWeight: 700, color: 'var(--primary-700)' }}>
                          {sub.course_code}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--slate-700)' }}>
                          {sub.course_name}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                            {sub.section_name}
                          </span>
                        </div>
                      </td>

                      {/* Day & Slot */}
                      <td style={{ verticalAlign: 'top', minWidth: 140 }}>
                        <div style={{ fontWeight: 700, color: 'var(--slate-800)' }}>
                          {DAY_NAMES[sub.day_of_week] || `Day ${sub.day_of_week}`} • Period {sub.period}
                        </div>
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            marginTop: 2,
                          }}
                        >
                          <ClockIcon size={13} />
                          <span>
                            {sub.starts_at} - {sub.ends_at}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>
                          Deadline: {new Date(sub.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Candidate Pool & Responses */}
                      <td style={{ verticalAlign: 'top' }}>
                        {sub.candidates.length === 0 ? (
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            No candidates found
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {sub.candidates.map((cand) => {
                              const isWinner = sub.assigned_name === cand.faculty_name
                              const isAccepted = cand.response === 'accepted'
                              const isRejected = cand.response === 'rejected'

                              let pillBg = 'var(--slate-100)'
                              let pillColor = 'var(--slate-700)'
                              let pillBorder = '1px solid var(--slate-200)'

                              if (isWinner) {
                                pillBg = 'var(--emerald-50)'
                                pillColor = 'var(--emerald-800)'
                                pillBorder = '1px solid var(--emerald-300)'
                              } else if (isAccepted) {
                                pillBg = 'var(--sky-50)'
                                pillColor = 'var(--sky-800)'
                                pillBorder = '1px solid var(--sky-200)'
                              } else if (isRejected) {
                                pillBg = 'var(--rose-50)'
                                pillColor = 'var(--rose-700)'
                                pillBorder = '1px solid var(--rose-200)'
                              }

                              return (
                                <div
                                  key={cand.faculty_id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontSize: '0.78rem',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: pillBg,
                                    color: pillColor,
                                    border: pillBorder,
                                  }}
                                  title={`Priority ${cand.priority} | Status: ${cand.response}${
                                    cand.responded_at
                                      ? ` at ${new Date(cand.responded_at).toLocaleTimeString()}`
                                      : ''
                                  }`}
                                >
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 800,
                                      padding: '1px 4px',
                                      borderRadius: '4px',
                                      backgroundColor: 'rgba(0,0,0,0.06)',
                                    }}
                                  >
                                    P{cand.priority}
                                  </span>
                                  <span style={{ fontWeight: isWinner ? 700 : 500 }}>
                                    {cand.faculty_name}
                                  </span>
                                  {isWinner && <CheckCircleIcon size={14} style={{ color: 'var(--emerald-600)' }} />}
                                  {isAccepted && !isWinner && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--sky-600)', fontWeight: 600 }}>
                                      (accepted)
                                    </span>
                                  )}
                                  {isRejected && <XIcon size={12} style={{ color: 'var(--rose-500)' }} />}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Workflow Action Cards */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '1rem' }}>
          Core Operations
        </h2>
        <div className="grid-2">
          <Link to="/admin/generate" className="action-card">
            <div>
              <div className="action-card-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
                <SparklesIcon size={22} />
              </div>
              <h3 className="action-card-title">
                Timetable Generator
              </h3>
              <p className="action-card-desc">
                Execute the Google OR-Tools CP-SAT solver microservice. Formulates hard constraints (zero faculty/room/section clashes) and soft optimizations (load balancing, gap minimization).
              </p>
            </div>
            <div className="action-card-arrow">
              <span>Launch Solver Microservice</span>
              <ArrowRightIcon size={16} />
            </div>
          </Link>

          <Link to="/admin/versions" className="action-card">
            <div>
              <div className="action-card-icon" style={{ background: 'var(--amber-50)', color: 'var(--amber-600)' }}>
                <AlertTriangleIcon size={22} />
              </div>
              <h3 className="action-card-title">
                Conflict Inspector &amp; Publishing
              </h3>
              <p className="action-card-desc">
                Audit generated timetable drafts before release. Inspect total gaps, course day spread, faculty load balance, and publish the active campus schedule with one click.
              </p>
            </div>
            <div className="action-card-arrow">
              <span>Inspect &amp; Manage Versions</span>
              <ArrowRightIcon size={16} />
            </div>
          </Link>

          <Link to="/admin/data" className="action-card">
            <div>
              <div className="action-card-icon" style={{ background: 'var(--sky-50)', color: 'var(--sky-600)' }}>
                <BookOpenIcon size={22} />
              </div>
              <h3 className="action-card-title">
                Curriculum &amp; Resource Manager
              </h3>
              <p className="action-card-desc">
                Full CRUD control over departments, programs, rooms, time slots, courses, section mappings, and faculty qualification matrices.
              </p>
            </div>
            <div className="action-card-arrow">
              <span>Manage Institutional Data</span>
              <ArrowRightIcon size={16} />
            </div>
          </Link>

          <Link to="/admin/penalties" className="action-card">
            <div>
              <div className="action-card-icon" style={{ background: 'var(--rose-50)', color: 'var(--rose-600)' }}>
                <UsersIcon size={22} />
              </div>
              <h3 className="action-card-title">
                Substitution &amp; Penalty Audits
              </h3>
              <p className="action-card-desc">
                Track faculty substitution requests, automated candidate ranking logs, timeouts, and repeated refusal penalties for departmental administration.
              </p>
            </div>
            <div className="action-card-arrow">
              <span>View Substitution Analytics</span>
              <ArrowRightIcon size={16} />
            </div>
          </Link>
        </div>
      </div>

      {/* Section Passkey Distribution Manager */}
      <SectionPasskeyManager />

      {/* Quick Data Tables Directory */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-header">
          <h2 className="card-title">
            <BookOpenIcon size={20} style={{ color: 'var(--primary-600)' }} />
            <span>Institutional Data Tables</span>
          </h2>
          <span className="badge badge-primary">{ENTITIES.length} Master Tables</span>
        </div>
        <div className="grid-4">
          {ENTITIES.map((e) => (
            <Link
              key={e.name}
              to={`/admin/data/${e.name}`}
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', padding: '0.75rem 1rem' }}
            >
              <span style={{ fontWeight: 600 }}>{e.label}</span>
              <ArrowRightIcon size={14} style={{ color: 'var(--text-muted)' }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
