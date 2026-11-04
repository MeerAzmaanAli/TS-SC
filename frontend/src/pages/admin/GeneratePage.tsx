import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { buildSnapshot, SOLVER_URL } from '../../lib/timetable'
import AdminHeader from '../../components/AdminHeader'
import {
  SparklesIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  RefreshIcon,
} from '../../components/Icons'
import TimetablePreview from '../../components/TimetablePreview'

interface SolverEntry {
  section_id: string
  course_id: string
  faculty_id: string
  room_id: string
  time_slot_id: string
  is_elective: boolean
  batch?: number | null
}

export default function GeneratePage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [generatedVersionId, setGeneratedVersionId] = useState<string | null>(null)
  const [infeasibleCauses, setInfeasibleCauses] = useState<string[]>([])
  const [solverOnline, setSolverOnline] = useState<boolean | null>(null)

  useEffect(() => {
    checkHealth()
  }, [])

  async function checkHealth() {
    try {
      const res = await fetch(`${SOLVER_URL}/health`, { signal: AbortSignal.timeout(3000) })
      setSolverOnline(res.ok)
    } catch {
      if (SOLVER_URL.includes('localhost')) {
        try {
          const fallback = SOLVER_URL.replace('localhost', '127.0.0.1')
          const res2 = await fetch(`${fallback}/health`, { signal: AbortSignal.timeout(3000) })
          if (res2.ok) {
            setSolverOnline(true)
            return
          }
        } catch {
          /* ignore */
        }
      }
      setSolverOnline(false)
    }
  }

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    setResult(null)
    setInfeasibleCauses([])

    try {
      const snapshot = await buildSnapshot()
      let solverEndpoint = `${SOLVER_URL}/generate`
      let res: Response
      try {
        res = await fetch(solverEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        })
      } catch (err) {
        if (SOLVER_URL.includes('localhost')) {
          solverEndpoint = `${SOLVER_URL.replace('localhost', '127.0.0.1')}/generate`
          res = await fetch(solverEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
          })
        } else {
          throw err
        }
      }
      if (!res.ok) throw new Error(`Solver returned HTTP ${res.status}`)
      const data = await res.json()

      if (data.status === 'infeasible') {
        const causes = (data.causes as string[]) ?? []
        setInfeasibleCauses(causes)
        setError(data.message ?? 'Constraint model is infeasible with current data.')
        return
      }
      if (data.status !== 'ok') throw new Error(data.message ?? 'Solver failed to produce a valid timetable.')

      const entries = data.entries as SolverEntry[]
      const { data: version, error: vErr } = await supabase
        .from('timetable_versions')
        .insert({
          status: 'draft',
          violations: data.violations ?? {},
        })
        .select('id')
        .single()

      if (vErr || !version) throw new Error(vErr?.message ?? 'Failed to create timetable version row.')

      const rows = entries.map((e) => ({
        version_id: version.id,
        section_id: e.section_id,
        course_id: e.course_id,
        faculty_id: e.faculty_id,
        room_id: e.room_id,
        time_slot_id: e.time_slot_id,
        is_elective: e.is_elective ?? false,
        batch: e.batch ?? null,
      }))

      const { error: insErr } = await supabase.from('timetable_entries').insert(rows)
      if (insErr) throw insErr

      setGeneratedVersionId(version.id)
      setResult(
        `Generated timetable with ${rows.length} entries successfully in ${(data.wall_time_seconds ?? 0).toFixed(2)}s.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown generation failure'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-cal-wrapper">
      <AdminHeader />

      <div className="admin-cal-cols" style={{ marginTop: 4 }}>
        {/* Left Column: Generator Controls */}
        <div className="admin-cal-stack">
          <section className="admin-panel">
            <div className="admin-panel-hd">
              <div>
                <h2>Timetable Generator Control</h2>
                <span className="admin-mu" style={{ fontSize: 13 }}>
                  Run Google OR-Tools CP-SAT solver microservice
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className={`admin-tag ${solverOnline === true ? 'assigned' : solverOnline === false ? 'unfilled' : ''}`}
                >
                  {solverOnline === true
                    ? '● Solver online (:8000)'
                    : solverOnline === false
                    ? '● Solver offline'
                    : 'Checking solver…'}
                </span>
                <button
                  type="button"
                  onClick={checkHealth}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  title="Recheck solver status"
                >
                  <RefreshIcon size={13} />
                </button>
              </div>
            </div>

            <p className="admin-mu" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 16px 0' }}>
              When you initiate generation, all institutional courses, sections, room configurations, faculty qualifications, and time slot grids are assembled into an exact constraint satisfaction problem.
            </p>

            <button
              onClick={handleGenerate}
              disabled={busy || solverOnline === false}
              className="admin-btn"
              style={{ width: '100%', minHeight: 46 }}
            >
              {busy ? (
                <>
                  <RefreshIcon size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Running CP-SAT Solver Microservice…</span>
                </>
              ) : (
                <>
                  <SparklesIcon size={18} />
                  <span>Generate Conflict-Free Timetable</span>
                </>
              )}
            </button>

            {solverOnline === false && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: '#FFF1F2',
                  border: '1px solid #FECDD3',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#9F1239',
                }}
              >
                <b>Solver service not reachable.</b> Ensure the FastAPI solver microservice is running:
                <div className="admin-m" style={{ marginTop: 6, background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #FECDD3' }}>
                  uvicorn app.main:app --reload --port 8000
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: '#FFF1F2',
                  border: '1px solid #FECDD3',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#9F1239',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <AlertCircleIcon size={16} />
                  <span>Generation Error</span>
                </div>
                <div style={{ marginTop: 4 }}>{error}</div>

                {infeasibleCauses.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                      Identified Infeasibility Causes:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {infeasibleCauses.map((c, i) => (
                        <span key={i} className="admin-cand-pill rejected">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {result && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  background: '#E3F3DE',
                  border: '1px solid #B8E3B0',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#0B5446',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <CheckCircleIcon size={16} />
                  <span>Draft Timetable Produced!</span>
                </div>
                <div style={{ marginTop: 4 }}>{result}</div>
                <div style={{ marginTop: 10 }}>
                  <Link to="/admin/versions" className="admin-btn admin-btn-sm" style={{ background: '#0B5446' }}>
                    <span>Open Conflict Inspector</span>
                    <ArrowRightIcon size={13} />
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Architectural Constraints */}
        <div className="admin-cal-stack">
          <section className="admin-panel">
            <div className="admin-panel-hd">
              <h2>Enforced Constraints</h2>
              <span className="admin-mu admin-m">CP-SAT formulation</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 12, background: '#F7F7F8', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#0B5446' }} />
                  <span>Zero Double-Booking (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  No faculty member, room, or student section is ever assigned to multiple simultaneous sessions.
                </div>
              </div>

              <div style={{ padding: 12, background: '#F7F7F8', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#0B5446' }} />
                  <span>Qualifications &amp; Lab Fitting (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Instructors only teach verified subjects; lab sessions are strictly scheduled in qualified laboratory facilities.
                </div>
              </div>

              <div style={{ padding: 12, background: '#F7F7F8', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#0B5446' }} />
                  <span>Elective Slot Synchronizer (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Electives are grouped into unified time blocks so students can select cross-department options without overlap.
                </div>
              </div>

              <div style={{ padding: 12, background: '#F7F7F8', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SparklesIcon size={15} style={{ color: '#4F46E5' }} />
                  <span>Gap &amp; Load Optimization (Soft)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Minimizes student idle gap periods and balances weekly teaching loads equitably across the faculty roster.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {generatedVersionId && (
        <section className="admin-panel" style={{ marginTop: 20 }}>
          <div className="admin-panel-hd">
            <h2>Generated Timetable Preview</h2>
            <span className="admin-mu admin-m">Version {generatedVersionId.slice(0, 8)}</span>
          </div>
          <TimetablePreview key={generatedVersionId} versionId={generatedVersionId} />
        </section>
      )}
    </div>
  )
}
