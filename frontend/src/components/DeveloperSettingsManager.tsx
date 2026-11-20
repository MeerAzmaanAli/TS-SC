import { useState } from 'react'
import { useDeveloperSettings } from '../lib/developerSettings'
import { SOLVER_URL } from '../lib/timetable'
import { purgeUnfilledSubstitutions } from '../lib/substitution'
import {
  SparklesIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from './Icons'

export default function DeveloperSettingsManager() {
  const { settings, updateSettings, resetDefaults } = useDeveloperSettings()
  const [notice, setNotice] = useState<string | null>(null)

  // Diagnostics state
  const [probingSolver, setProbingSolver] = useState(false)
  const [purgingSubs, setPurgingSubs] = useState(false)
  const [solverProbeResult, setSolverProbeResult] = useState<{
    ok: boolean
    status: number
    latencyMs: number
    data?: any
    error?: string
  } | null>(null)

  function showSavedNotice(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3500)
  }

  function handleToggleDayRestriction() {
    const nextVal = !settings.disableDayRestriction
    updateSettings({ disableDayRestriction: nextVal })
    showSavedNotice(
      nextVal
        ? '🔓 Day restriction disabled: Faculty can now request substitutions for any future date!'
        : '🔒 Day restriction active: Faculty can only request substitutions for today or 1 day prior.'
    )
  }

  function handleToggleCalendarDatePicker() {
    const nextVal = !settings.allowCalendarDatePicker
    updateSettings({ allowCalendarDatePicker: nextVal })
    showSavedNotice(
      nextVal
        ? '📅 Calendar date selector enabled in faculty request dialog.'
        : '📅 Calendar date selector hidden in faculty request dialog.'
    )
  }

  function handleToggleAllowPast() {
    const nextVal = !settings.allowPastLectures
    updateSettings({ allowPastLectures: nextVal })
    showSavedNotice(
      nextVal
        ? '🧪 Past lecture testing enabled: You can dispatch test requests for past slots.'
        : '✓ Past lecture testing disabled.'
    )
  }

  async function handleProbeSolver() {
    setProbingSolver(true)
    setSolverProbeResult(null)
    const t0 = performance.now()
    try {
      const endpoint = `${SOLVER_URL}/health`
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(6000) })
      const latencyMs = Math.round(performance.now() - t0)
      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = await res.text()
      }
      setSolverProbeResult({
        ok: res.ok,
        status: res.status,
        latencyMs,
        data,
      })
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - t0)
      setSolverProbeResult({
        ok: false,
        status: 0,
        latencyMs,
        error: err.message || 'Connection failed',
      })
    } finally {
      setProbingSolver(false)
    }
  }

  async function handlePurgeUnfilled() {
    if (!confirm('Purge all unfilled/cancelled substitution requests to restore regular sessions?')) return
    setPurgingSubs(true)
    try {
      const res = await purgeUnfilledSubstitutions()
      if (res.success) {
        showSavedNotice(res.purgedCount !== undefined ? `Purged ${res.purgedCount} unfilled requests.` : 'Purged unfilled requests.')
      } else {
        alert(res.error || 'Failed to purge unfilled requests.')
      }
    } catch (err: any) {
      alert(err.message || 'Purge failed.')
    } finally {
      setPurgingSubs(false)
    }
  }

  function handleReset() {
    if (confirm('Reset all developer and simulation overrides to production defaults?')) {
      resetDefaults()
      showSavedNotice('All developer options restored to default policy.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast Notice */}
      {notice && (
        <div
          style={{
            padding: '10px 16px',
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            borderRadius: 8,
            color: '#92400E',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          }}
        >
          <CheckCircleIcon size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* Main Developer Controls Card */}
      <div className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚙️ Developer & Simulation Controls</span>
              {settings.disableDayRestriction && (
                <span className="admin-tag unfilled" style={{ fontSize: 11, padding: '2px 8px' }}>
                  Day Restriction OFF
                </span>
              )}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Configure runtime policy overrides, test controls, and substitution advance windows. Changes apply instantly across all sessions.
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="admin-btn admin-btn-outline admin-btn-sm"
            title="Restore default policy"
          >
            Reset Defaults
          </button>
        </div>

        {/* Setting 1: Turn off Day Restriction */}
        <div
          style={{
            padding: 16,
            background: settings.disableDayRestriction ? 'rgba(254, 243, 199, 0.35)' : 'var(--bg-app)',
            border: `1px solid ${settings.disableDayRestriction ? '#F59E0B' : 'var(--border-light)'}`,
            borderRadius: 8,
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Turn Off Day Restriction for Substitutions
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: settings.disableDayRestriction ? '#D97706' : '#E7E5E4',
                  color: settings.disableDayRestriction ? '#FFF' : '#57534E',
                }}
              >
                {settings.disableDayRestriction ? 'RESTRICTION OFF (ANY DATE ALLOWED)' : 'RESTRICTED (STRICT POLICY)'}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Currently, institutional policy only allows raising a substitution request <strong>1 day before</strong> or <strong>on the same day</strong> of the scheduled lecture.
              Turning this OFF allows faculty to request coverage for <strong>any future date</strong> in the semester.
            </p>
          </div>

          <label
            style={{
              position: 'relative',
              display: 'inline-block',
              width: 48,
              height: 26,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={settings.disableDayRestriction}
              onChange={handleToggleDayRestriction}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: 'absolute',
                cursor: 'pointer',
                inset: 0,
                backgroundColor: settings.disableDayRestriction ? '#D97706' : '#D6D3D1',
                borderRadius: 26,
                transition: '0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  content: '""',
                  height: 20,
                  width: 20,
                  left: settings.disableDayRestriction ? 25 : 3,
                  bottom: 3,
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  transition: '0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </span>
          </label>
        </div>

        {/* Setting 2: Interactive Calendar Date Selector */}
        <div
          style={{
            padding: 16,
            background: 'var(--bg-app)',
            border: '1px solid var(--border-light)',
            borderRadius: 8,
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Faculty Interactive Calendar Date Selector
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: settings.allowCalendarDatePicker ? '#10B981' : '#E7E5E4',
                  color: settings.allowCalendarDatePicker ? '#FFF' : '#57534E',
                }}
              >
                {settings.allowCalendarDatePicker ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Embeds a date picker calendar directly inside the faculty substitution modal, allowing faculty members to explicitly choose the exact calendar date of their absence.
            </p>
          </div>

          <label
            style={{
              position: 'relative',
              display: 'inline-block',
              width: 48,
              height: 26,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={settings.allowCalendarDatePicker}
              onChange={handleToggleCalendarDatePicker}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: 'absolute',
                cursor: 'pointer',
                inset: 0,
                backgroundColor: settings.allowCalendarDatePicker ? '#10B981' : '#D6D3D1',
                borderRadius: 26,
                transition: '0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  content: '""',
                  height: 20,
                  width: 20,
                  left: settings.allowCalendarDatePicker ? 25 : 3,
                  bottom: 3,
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  transition: '0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </span>
          </label>
        </div>

        {/* Setting 3: Allow Past Lectures (Demo Mode) */}
        <div
          style={{
            padding: 16,
            background: settings.allowPastLectures ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-app)',
            border: `1px solid ${settings.allowPastLectures ? '#EF4444' : 'var(--border-light)'}`,
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Allow Past Lecture Testing (Demo / Evaluation Mode)
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: settings.allowPastLectures ? '#DC2626' : '#E7E5E4',
                  color: settings.allowPastLectures ? '#FFF' : '#57534E',
                }}
              >
                {settings.allowPastLectures ? 'DEMO TEST MODE' : 'STANDARD'}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Permits dispatching substitution requests for lectures that have already started or passed today. Useful for project evaluation, grading demos, and testing substitution timeouts without waiting for real class times.
            </p>
          </div>

          <label
            style={{
              position: 'relative',
              display: 'inline-block',
              width: 48,
              height: 26,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={settings.allowPastLectures}
              onChange={handleToggleAllowPast}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: 'absolute',
                cursor: 'pointer',
                inset: 0,
                backgroundColor: settings.allowPastLectures ? '#DC2626' : '#D6D3D1',
                borderRadius: 26,
                transition: '0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  content: '""',
                  height: 20,
                  width: 20,
                  left: settings.allowPastLectures ? 25 : 3,
                  bottom: 3,
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  transition: '0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </span>
          </label>
        </div>
      </div>

      {/* Solver Diagnostics Card */}
      <div className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📡 Solver Microservice Diagnostic Probe</span>
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Target Endpoint: <code style={{ background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 4 }}>{SOLVER_URL}</code>
            </p>
          </div>

          <button
            type="button"
            onClick={handleProbeSolver}
            disabled={probingSolver}
            className="admin-btn admin-btn-primary admin-btn-sm"
          >
            {probingSolver ? (
              <>
                <RefreshIcon size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Pinging Solver…</span>
              </>
            ) : (
              <>
                <SparklesIcon size={14} />
                <span>Probe /health Endpoint</span>
              </>
            )}
          </button>
        </div>

        {solverProbeResult && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: solverProbeResult.ok ? '#ECFDF5' : '#FEF2F2',
              border: `1px solid ${solverProbeResult.ok ? '#10B981' : '#EF4444'}`,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6, color: solverProbeResult.ok ? '#065F46' : '#991B1B' }}>
              {solverProbeResult.ok ? <CheckCircleIcon size={16} /> : <AlertCircleIcon size={16} />}
              <span>
                {solverProbeResult.ok
                  ? `Probe Succeeded (${solverProbeResult.status} OK) in ${solverProbeResult.latencyMs}ms`
                  : `Probe Failed: ${solverProbeResult.error || `HTTP ${solverProbeResult.status}`}`}
              </span>
            </div>
            {solverProbeResult.data && (
              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  background: 'rgba(0,0,0,0.04)',
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                }}
              >
                {typeof solverProbeResult.data === 'object'
                  ? JSON.stringify(solverProbeResult.data, null, 2)
                  : String(solverProbeResult.data)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Database Transaction & Recovery Card */}
      <div className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🛠️ Database Integrity &amp; Session Recovery</span>
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Purges any erroneously marked unfilled/cancelled substitution requests and restores regular teaching sessions.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePurgeUnfilled}
            disabled={purgingSubs}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ color: '#DC2626', borderColor: '#FECACA' }}
          >
            {purgingSubs ? (
              <>
                <RefreshIcon size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Purging…</span>
              </>
            ) : (
              <span>Purge Unfilled &amp; Restore Sessions</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
