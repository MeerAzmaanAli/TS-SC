import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { buildSnapshot, SOLVER_URL } from '../../lib/timetable'
import {
  SparklesIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  ShieldIcon,
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
          institution_id: snapshot.institution_id,
          status: 'draft',
          violations: data.violations ?? {},
        })
        .select('id')
        .single()
      if (vErr) throw vErr

      const rows = entries.map((e) => ({ ...e, version_id: version.id as string }))
      let { error: eErr } = await supabase.from('timetable_entries').insert(rows)
      if (eErr && eErr.message?.includes('batch')) {
        const rowsWithoutBatch = rows.map(({ batch, ...rest }) => rest)
        const fallbackRes = await supabase.from('timetable_entries').insert(rowsWithoutBatch)
        eErr = fallbackRes.error
      }
      if (eErr) throw eErr

      setGeneratedVersionId(version.id as string)
      setResult(
        `Optimized draft generated successfully with ${entries.length} clash-free session assignments.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <SparklesIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>Automated Timetable Generator</span>
          </h1>
          <p className="page-subtitle">
            Snapshots active institutional entities and triggers the Google OR-Tools CP-SAT constraint programming microservice.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`badge ${
              solverOnline === true
                ? 'badge-success'
                : solverOnline === false
                ? 'badge-danger'
                : 'badge-neutral'
            }`}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor:
                  solverOnline === true
                    ? 'var(--emerald-500)'
                    : solverOnline === false
                    ? 'var(--rose-500)'
                    : 'var(--slate-400)',
              }}
            />
            <span>
              {solverOnline === true
                ? 'Solver Online (:8000)'
                : solverOnline === false
                ? 'Solver Offline'
                : 'Checking Solver…'}
            </span>
          </div>
          <button onClick={checkHealth} className="btn btn-secondary btn-sm" title="Recheck solver status">
            <RefreshIcon size={14} />
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start', marginBottom: '2rem' }}>
        {/* Left: Execution Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <SparklesIcon size={18} style={{ color: 'var(--primary-600)' }} />
              <span>Generation Control</span>
            </h2>
            <span className="badge badge-primary">CP-SAT Engine</span>
          </div>

          <p className="text-muted" style={{ fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            When you run generation, the solver assembles all active courses, student sections, room capacities, faculty qualification matrices, and time slot grids into a unified constraint satisfaction problem.
          </p>

          <button
            onClick={handleGenerate}
            disabled={busy || solverOnline === false}
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
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
            <div className="alert alert-warning" style={{ marginTop: '1rem', marginBottom: 0 }}>
              <AlertTriangleIcon size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Solver service not reachable</strong>
                <div style={{ marginTop: 2, fontSize: '0.8125rem' }}>
                  Make sure the FastAPI solver is running on port 8000:
                  <br />
                  <code className="font-mono">uvicorn app.main:app --reload --port 8000</code>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-danger" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
              <AlertCircleIcon size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Generation Error</strong>
                <div style={{ marginTop: 2 }}>{error}</div>

                {infeasibleCauses.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.35rem' }}>
                      Identified Root Causes:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {infeasibleCauses.map((c, i) => (
                        <span key={i} className="badge badge-danger">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="alert alert-success" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
              <CheckCircleIcon size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Success!</strong>
                <div style={{ marginTop: 2 }}>{result}</div>
                <div style={{ marginTop: '0.75rem' }}>
                  <Link to="/admin/versions" className="btn btn-success btn-sm">
                    <span>Open Conflict Inspector</span>
                    <ArrowRightIcon size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Constraint Architecture Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <ShieldIcon size={18} style={{ color: 'var(--emerald-600)' }} />
              <span>Enforced Constraints</span>
            </h2>
            <span className="badge badge-neutral">Architecture</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircleIcon size={15} style={{ color: 'var(--emerald-600)' }} />
                <span>Zero Double-Booking (Hard)</span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                No faculty member, room, or student section is ever assigned to multiple simultaneous sessions.
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircleIcon size={15} style={{ color: 'var(--emerald-600)' }} />
                <span>Qualifications &amp; Lab Fitting (Hard)</span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Instructors only teach verified subjects; lab courses are strictly scheduled into designated laboratory facilities with capacity.
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircleIcon size={15} style={{ color: 'var(--emerald-600)' }} />
                <span>Elective Slot Synchronizer (Hard)</span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Electives are grouped into unified time blocks so students can select cross-department options without conflicts.
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <SparklesIcon size={15} style={{ color: 'var(--primary-600)' }} />
                <span>Gap &amp; Load Optimization (Soft)</span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Minimizes idle student gaps between classes and balances weekly teaching loads equitably across the faculty.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generated Timetable Preview Matrix */}
      {generatedVersionId && (
        <div style={{ marginTop: '2rem' }}>
          <TimetablePreview key={generatedVersionId} versionId={generatedVersionId} />
        </div>
      )}
    </div>
  )
}
