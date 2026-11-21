import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { buildSnapshot, SOLVER_URL } from '../../lib/timetable'
import AdminHeader from '../../components/AdminHeader'
import GenericElectiveConfig, { GenericElectiveConfigData } from '../../components/GenericElectiveConfig'
import {
  SparklesIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  RefreshIcon,
  ClockIcon,
} from '../../components/Icons'
import TimetablePreview from '../../components/TimetablePreview'
import AcademicShiftManager from '../../components/AcademicShiftManager'
import { useDeveloperSettings } from '../../lib/developerSettings'

interface SolverEntry {
  section_id: string
  course_id: string
  faculty_id?: string | null
  room_id?: string | null
  time_slot_id: string
  is_elective: boolean
  batch?: number | null
}

export default function GeneratePage() {
  const { settings: devSettings } = useDeveloperSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [generatedVersionId, setGeneratedVersionId] = useState<string | null>(null)
  const [infeasibleCauses, setInfeasibleCauses] = useState<string[]>([])
  const [solverOnline, setSolverOnline] = useState<boolean | null>(null)

  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('')

  const [geConfig, setGeConfig] = useState<GenericElectiveConfigData>({
    enabled: true,
    semesters: [3, 4, 5, 6, 7],
    days: [4, 5],
    shift1Periods: [5, 6],
    shift2Periods: [7, 8],
  })

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
    const timeLimit = devSettings.solverTimeLimitSeconds || 120

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000

      let p = 5
      let stageText = 'Extracting curriculum data and validating academic shifts…'

      const t1 = Math.max(3, timeLimit * 0.05)
      const t2 = Math.max(8, timeLimit * 0.20)
      const t3 = Math.max(20, timeLimit * 0.60)
      const t4 = Math.max(35, timeLimit * 0.85)

      if (elapsed < t1) {
        p = 5 + (elapsed / t1) * 20
        stageText = 'Assembling institutional entities & shift constraints…'
      } else if (elapsed < t2) {
        p = 25 + ((elapsed - t1) / (t2 - t1)) * 23
        stageText = 'Stage 1: Allocating faculty workloads (Max 24 hrs/week balance)…'
      } else if (elapsed < t3) {
        p = 48 + ((elapsed - t2) / (t3 - t2)) * 28
        stageText = 'Stage 2: CP-SAT solving core section periods & parallel lab batches…'
      } else if (elapsed < t4) {
        p = 76 + ((elapsed - t3) / (t4 - t3)) * 14
        stageText = 'Stage 3: Physical room matching and elective block verification…'
      } else {
        p = 90 + Math.min(5, (elapsed - t4) * 0.1)
        stageText = 'Optimizing student schedule continuity & finalizing entries…'
      }

      setProgress(Math.min(95, Math.round(p)))
      setProgressStage(stageText)
    }, 250)

    return () => clearInterval(interval)
  }, [busy, result, devSettings.solverTimeLimitSeconds])

  async function checkHealth() {
    try {
      const res = await fetch(`${SOLVER_URL}/health`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) {
        setSolverOnline(false)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data && typeof data === 'object' && 'internal_solver' in data) {
        setSolverOnline(data.internal_solver === 'connected')
      } else {
        setSolverOnline(true)
      }
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
      const { snapshot, rawSections, electiveCourses, allSlots, geConfig: activeGeConfig } =
        await buildSnapshot(geConfig)
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
      if (!res.ok) {
        const errText = await res.text()
        try {
          const errJson = JSON.parse(errText)
          throw new Error(errJson.message || `Solver returned HTTP ${res.status}`)
        } catch (e: any) {
          if (e.message && !e.message.startsWith('Unexpected token')) throw e
          throw new Error(`Solver returned HTTP ${res.status}: ${errText.slice(0, 150)}`)
        }
      }
      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        throw new Error(`Solver returned invalid response (${res.status}): ${rawText.slice(0, 150)}`)
      }

      if (data.status === 'infeasible') {
        const causes = (data.causes as string[]) ?? []
        setInfeasibleCauses(causes)
        setError(data.message ?? 'Constraint model is infeasible with current data.')
        return
      }
      if (data.status !== 'ok') throw new Error(data.message ?? 'Solver failed to produce a valid timetable.')

      const solverEntries = (data.entries as SolverEntry[]) ?? []
      const allEntries: SolverEntry[] = [...solverEntries]

      // Post-process Generic Electives:
      // Inject Generic Elective sessions for all sections in the selected semesters
      // into the configured slots without assigning any faculty or classroom.
      if (activeGeConfig.enabled && activeGeConfig.semesters.length > 0) {
        for (const sec of rawSections) {
          const sem = Number(sec.semester)
          if (!activeGeConfig.semesters.includes(sem)) continue

          // Find the matching elective course
          const secCourseLink = snapshot.section_courses.find(
            (sc) => sc.section_id === sec.id && electiveCourses.some((ec) => ec.id === sc.course_id)
          )
          let electiveCourse = secCourseLink
            ? electiveCourses.find((ec) => ec.id === secCourseLink.course_id)
            : undefined

          if (!electiveCourse) {
            electiveCourse = electiveCourses.find((ec) => Number(ec.semester) === sem)
          }
          if (!electiveCourse && electiveCourses.length > 0) {
            electiveCourse = electiveCourses[0]
          }
          if (!electiveCourse) continue

          // Determine target periods based on section academic shift
          const shift = sec.shift ?? 1
          const targetPeriods = shift === 2 ? activeGeConfig.shift2Periods : activeGeConfig.shift1Periods

          // Find matching time slots
          const targetSlots = allSlots.filter(
            (sl) => activeGeConfig.days.includes(sl.day_of_week) && targetPeriods.includes(sl.period)
          )

          for (const slot of targetSlots) {
            allEntries.push({
              section_id: sec.id,
              course_id: electiveCourse.id,
              faculty_id: null,
              room_id: null,
              time_slot_id: slot.id,
              is_elective: true,
              batch: null,
            })
          }
        }
      }

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

      const rows = allEntries.map((e) => ({
        version_id: version.id,
        section_id: e.section_id,
        course_id: e.course_id,
        faculty_id: e.faculty_id || null,
        room_id: e.room_id || null,
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
          <GenericElectiveConfig value={geConfig} onChange={setGeConfig} disabled={busy} />

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
                    ? '● Solver online'
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

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                padding: '9px 12px',
                background: 'var(--bg-app)',
                borderRadius: 6,
                border: '1px solid var(--border-light)',
                fontSize: 12.5,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#44403C' }}>
                <ClockIcon size={14} style={{ color: '#D97706' }} />
                <span>CP-SAT Solver Search Budget:</span>
                <strong style={{ color: '#1C1917' }}>
                  {devSettings.solverTimeLimitSeconds || 120}s (
                  {Math.round(((devSettings.solverTimeLimitSeconds || 120) / 60) * 10) / 10}m)
                </strong>
              </span>
              <Link
                to="/admin?tab=developer"
                style={{
                  color: '#D97706',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                Configure in Settings →
              </Link>
            </div>

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
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#44403C' }}>
                    {progressStage}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary-800)', fontFamily: 'monospace' }}>
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 10,
                    backgroundColor: 'var(--border-light)',
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
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
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
                <div className="admin-m" style={{ marginTop: 6, background: 'var(--bg-surface)', padding: '6px 10px', borderRadius: 6, border: '1px solid #FECACA' }}>
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
              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#059669' }} />
                  <span>Zero Double-Booking (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  No faculty member, room, or student section is ever assigned to multiple simultaneous sessions.
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#059669' }} />
                  <span>Qualifications &amp; Lab Fitting (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Instructors only teach verified subjects; lab sessions are strictly scheduled in qualified laboratory facilities.
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleIcon size={15} style={{ color: '#059669' }} />
                  <span>Elective Slot Synchronizer (Hard)</span>
                </div>
                <div className="admin-mu" style={{ fontSize: 12, marginTop: 4 }}>
                  Electives are grouped into unified time blocks so students can select cross-department options without overlap.
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
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
