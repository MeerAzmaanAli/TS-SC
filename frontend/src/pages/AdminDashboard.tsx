import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ENTITIES } from '../lib/entities'
import { supabase } from '../lib/supabase'
import {
  SparklesIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  UsersIcon,
  ArrowRightIcon,
  LayersIcon,
} from '../components/Icons'

interface Stats {
  departments: number
  programs: number
  sections: number
  courses: number
  faculty: number
  rooms: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    departments: 0,
    programs: 0,
    sections: 0,
    courses: 0,
    faculty: 0,
    rooms: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    loadStats()
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

      {/* Quick Data Tables Directory */}
      <div className="card">
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
