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
import AcademicShiftManager from '../../components/AcademicShiftManager'

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

  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('')

  useEffect(() => {
    checkHealth()
  }, [])

  // Fast-start / slow-end animated progress simulation while generation runs
  useEffect(() => {
    if (!busy) {
      if (result) {
        setProgress(100)
        setProgressStage('Timetable generation complete!')
      }
      return
    }

    setProgress(5)
    setProgressStage('Extracting curriculum data and validating academic shifts…')
    const startTime = Date.now()

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000

      // Fast-Start: 0s to 3s -> 5% to 25%
      // Stage 1: 3s to 8s -> 25% to 48%
      // Stage 2: 8s to 22s -> 48% to 75%
      // Slow-End: 22s+ -> 75% slowly asymptotes towards 94%
      let p = 5
      let stageText = 'Extracting curriculum data and validating academic shifts…'

      if (elapsed < 3) {
        p = 5 + (elapsed / 3) * 20
        stageText = 'Assembling institutional entities & shift constraints…'
      } else if (elapsed < 8) {
        p = 25 + ((elapsed - 3) / 5) * 23
        stageText = 'Stage 1: Allocating faculty workloads (Max 24 hrs/week balance)…'
      } else if (elapsed < 24) {
        p = 48 + ((elapsed - 8) / 16) * 28
        stageText = 'Stage 2: CP-SAT solving core section periods & parallel lab batches…'
      } else if (elapsed < 40) {
        p = 76 + ((elapsed - 24) / 16) * 14
        stageText = 'Stage 3: Physical room matching and elective block verification…'
      } else {
        p = 90 + Math.min(4, (elapsed - 40) * 0.1)
        stageText = 'Optimizing student schedule continuity & finalizing entries…'
      }

      setProgress(Math.min(95, Math.round(p)))
      setProgressStage(stageText)
    }, 250)

    return () => clearInterval(interval)
  }, [busy, result])

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
          institution_id: snapshot.institution_id,
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

      // Batch insert rows in chunks of 500 to prevent payload timeouts or limits
      const CHUNK_SIZE = 500
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE)
        const { error: insErr } = await supabase.from('timetable_entries').insert(chunk)
        if (insErr) throw insErr
      }

      setGeneratedVersionId(version.id)
      setProgress(100)
      setProgressStage('Timetable generation complete!')
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
          <AcademicShiftManager />

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
              className="admin-btn admin-btn-primary"
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

            {/* Fast-Start / Slow-End Generation Progress Bar */}
            {busy && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: '#FAFAF9',
                  border: '1px solid #E7E5E4',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#44403C' }}>
                    {progressStage}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#92400E', fontFamily: 'monospace' }}>
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 10,
                    backgroundColor: '#E7E5E4',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${progress}%`,
                      backgroundColor: progress >= 100 ? '#10b981' : '#FFB900',
                      borderRadius: 999,
                      transition: 'width 0.25s ease-out',
                    }}
                  />
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#78716C', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fast-Start / Asymptotic Solver Monitor</span>
                  <span>Stages: Allocation → CP-SAT Slots → Room Ingestion</span>
                </div>
              </div>
            )}

            {solverOnline === false && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#991B1B',
                }}
              >
                <b>Solver service not reachable.</b> Ensure the FastAPI solver microservice is running:
                <div className="admin-m" style={{ marginTop: 6, background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #FECACA' }}>
                  uvicorn app.main:app --reload --port 8000
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#991B1B',
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
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#065F46',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <CheckCircleIcon size={16} />
                  <span>Draft Timetable Produced!</span>
                </div>
                <div style={{ marginTop: 4 }}>{result}</div>
                <div style={{ marginTop: 10 }}>
                  <Link to="/admin/versions" className="admin-btn admin-btn-primary admin-btn-sm">
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
              <div style={{ padding: 12, background: '#F5F5F0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#059669' }} />
                  <span>Zero Double-Booking (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  No faculty member, room, or student section is ever assigned to multiple simultaneous sessions.
                </div>
              </div>

              <div style={{ padding: 12, background: '#F5F5F0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#059669' }} />
                  <span>Qualifications &amp; Lab Fitting (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Instructors only teach verified subjects; lab sessions are strictly scheduled in qualified laboratory facilities.
                </div>
              </div>

              <div style={{ padding: 12, background: '#F5F5F0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#059669' }} />
                  <span>Elective Slot Synchronizer (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Electives are grouped into unified time blocks so students can select cross-department options without overlap.
                </div>
              </div>

              <div style={{ padding: 12, background: '#F5F5F0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SparklesIcon size={15} style={{ color: '#FFB900' }} />
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
            <span className="admin-mu admin-m">Newly Generated Draft Timetable</span>
          </div>
          <TimetablePreview key={generatedVersionId} versionId={generatedVersionId} />
        </section>
      )}
    </div>
  )
}
