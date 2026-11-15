import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpenIcon, CheckCircleIcon, ClockIcon } from './Icons'

export interface GenericElectiveConfigData {
  enabled: boolean
  semesters: number[]
  days: number[] // 1=Mon..5=Fri
  shift1Periods: number[]
  shift2Periods: number[]
}

interface GenericElectiveConfigProps {
  value: GenericElectiveConfigData
  onChange: (val: GenericElectiveConfigData) => void
  disabled?: boolean
}

const ALL_SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]
const DAYS_CONFIG = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
]

export default function GenericElectiveConfig({
  value,
  onChange,
  disabled = false,
}: GenericElectiveConfigProps) {
  const [detectedSemesters, setDetectedSemesters] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  // Auto-detect which semesters have Generic Electives in the database syllabus/courses scheme
  useEffect(() => {
    async function detectSyllabusElectives() {
      try {
        const { data, error } = await supabase
          .from('courses')
          .select('id, semester, is_elective, code, name')
          .or('is_elective.eq.true,code.ilike.%GU%,name.ilike.%ELECTIVE%')

        if (!error && data && data.length > 0) {
          const sems = Array.from(
            new Set(
              data
                .map((c: any) => Number(c.semester))
                .filter((s: number) => !isNaN(s) && s >= 1 && s <= 8)
            )
          ).sort((a, b) => a - b)

          if (sems.length > 0) {
            setDetectedSemesters(sems)
            // If semesters in value are empty, prefill with detected
            if (value.semesters.length === 0) {
              onChange({ ...value, semesters: sems })
            }
          }
        }
      } catch (err) {
        console.warn('Could not auto-detect elective semesters from syllabus:', err)
      } finally {
        setLoading(false)
      }
    }

    detectSyllabusElectives()
  }, [])

  function toggleSemester(sem: number) {
    if (disabled) return
    const next = value.semesters.includes(sem)
      ? value.semesters.filter((s) => s !== sem)
      : [...value.semesters, sem].sort((a, b) => a - b)
    onChange({ ...value, semesters: next })
  }

  function toggleDay(day: number) {
    if (disabled) return
    if (value.days.includes(day) && value.days.length === 1) return // Keep at least one
    const next = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day].sort((a, b) => a - b)
    onChange({ ...value, days: next })
  }

  function togglePeriod(shift: 1 | 2, p: number) {
    if (disabled) return
    if (shift === 1) {
      if (value.shift1Periods.includes(p) && value.shift1Periods.length === 1) return
      const next = value.shift1Periods.includes(p)
        ? value.shift1Periods.filter((x) => x !== p)
        : [...value.shift1Periods, p].sort((a, b) => a - b)
      onChange({ ...value, shift1Periods: next })
    } else {
      if (value.shift2Periods.includes(p) && value.shift2Periods.length === 1) return
      const next = value.shift2Periods.includes(p)
        ? value.shift2Periods.filter((x) => x !== p)
        : [...value.shift2Periods, p].sort((a, b) => a - b)
      onChange({ ...value, shift2Periods: next })
    }
  }

  const totalSlotsPerWeek = value.days.length * value.shift1Periods.length

  return (
    <section className="admin-panel" style={{ marginTop: '1rem', border: '1.5px solid var(--border-strong)' }}>
      <div className="admin-panel-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpenIcon size={18} />
            <h2 style={{ fontSize: '1rem', margin: 0 }}>Generic Elective (GE) Scheduling Policy</h2>
          </div>
          <p className="admin-mu" style={{ fontSize: '0.8rem', marginTop: 4, marginBottom: 0 }}>
            Configure which semesters take Generic Electives and reserve their dedicated slot window.
          </p>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: '6px',
            border: value.enabled ? '2px solid #FFB900' : '1px solid var(--border-light)',
            backgroundColor: value.enabled ? '#FFFBEB' : 'var(--bg-surface)',
            color: value.enabled ? '#1C1917' : 'var(--text-secondary)',
            boxShadow: value.enabled ? '0 0 0 1px #FFB900, 0 1px 3px rgba(255, 185, 0, 0.2)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            disabled={disabled}
            style={{ width: 16, height: 16, accentColor: '#FFB900', cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <span>{value.enabled ? 'GE Reservation Active' : 'Enable GE Reservation'}</span>
        </label>
      </div>

      {value.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.85rem' }}>
          {/* Policy Explanation Note */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--bg-app)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong>Decoupled Architecture Policy:</strong> The solver enforces a <strong>hard blackout constraint</strong> on these reserved slots so regular theory &amp; lab lectures will never clash. Once generated, Generic Elective sessions are added separately with <strong>no departmental faculty or classroom assigned</strong>, preserving individual faculty workloads.
          </div>

          {/* 1. Semesters with GE */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                1. Semesters with Generic Electives:
              </span>
              <span className="admin-mu" style={{ fontSize: '0.75rem' }}>
                {loading
                  ? 'Checking syllabus scheme…'
                  : detectedSemesters.length > 0
                  ? `Syllabus detected: Sem ${detectedSemesters.join(', ')}`
                  : 'Select active semesters'}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {ALL_SEMESTERS.map((sem) => {
                const isSelected = value.semesters.includes(sem)
                const isSyllabus = detectedSemesters.includes(sem)

                return (
                  <button
                    key={sem}
                    type="button"
                    onClick={() => toggleSemester(sem)}
                    disabled={disabled}
                    style={{
                      padding: '6px 13px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      border: isSelected ? '2px solid #FFB900' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? '#FFFBEB' : 'var(--bg-surface)',
                      color: isSelected ? '#1C1917' : 'var(--text-secondary)',
                      boxShadow: isSelected ? '0 0 0 1px #FFB900, 0 1px 3px rgba(255, 185, 0, 0.25)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected && (
                      <span style={{ color: '#D97706', fontWeight: 800, fontSize: '0.75rem' }}>✓</span>
                    )}
                    <span>Sem {sem}</span>
                    {isSyllabus && (
                      <span
                        title="Detected in Syllabus Scheme"
                        style={{
                          fontSize: '0.65rem',
                          background: isSelected ? '#FEF3C7' : 'var(--bg-subtle)',
                          color: isSelected ? '#92400E' : 'var(--text-muted)',
                          border: isSelected ? '1px solid #FDE68A' : '1px solid var(--border-light)',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontWeight: 700,
                        }}
                      >
                        SYLLABUS
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Days Reserved for GE */}
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>
              2. Reserved Weekdays for Electives:
            </span>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              {DAYS_CONFIG.map(({ day, label }) => {
                const isSelected = value.days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    disabled={disabled}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      border: isSelected ? '2px solid #FFB900' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? '#FFFBEB' : 'var(--bg-surface)',
                      color: isSelected ? '#1C1917' : 'var(--text-secondary)',
                      boxShadow: isSelected ? '0 0 0 1px #FFB900, 0 1px 3px rgba(255, 185, 0, 0.25)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected && (
                      <span style={{ color: '#D97706', fontWeight: 800, fontSize: '0.75rem' }}>✓</span>
                    )}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Shift Periods Configuration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Shift 1 Periods (Year 1 & 4) */}
            <div style={{ padding: '10px 12px', background: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.4rem' }}>
                <ClockIcon size={14} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Shift 1 Periods (Yr 1 &amp; 4):
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5, 6].map((p) => {
                  const isSelected = value.shift1Periods.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePeriod(1, p)}
                      disabled={disabled}
                      style={{
                        padding: '5px 10px',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 700 : 500,
                        borderRadius: '5px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        border: isSelected ? '2px solid #FFB900' : '1px solid var(--border-light)',
                        backgroundColor: isSelected ? '#FFFBEB' : 'var(--bg-surface)',
                        color: isSelected ? '#1C1917' : 'var(--text-secondary)',
                        boxShadow: isSelected ? '0 0 0 1px #FFB900, 0 1px 2px rgba(255, 185, 0, 0.2)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      P{p}
                    </button>
                  )
                })}
              </div>
              <span className="admin-mu" style={{ fontSize: '0.7rem', display: 'block', marginTop: '0.35rem' }}>
                Default: P5 &amp; P6 (afternoon)
              </span>
            </div>

            {/* Shift 2 Periods (Year 2 & 3) */}
            <div style={{ padding: '10px 12px', background: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.4rem' }}>
                <ClockIcon size={14} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Shift 2 Periods (Yr 2 &amp; 3):
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {[3, 4, 5, 6, 7, 8].map((p) => {
                  const isSelected = value.shift2Periods.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePeriod(2, p)}
                      disabled={disabled}
                      style={{
                        padding: '5px 10px',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 700 : 500,
                        borderRadius: '5px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        border: isSelected ? '2px solid #FFB900' : '1px solid var(--border-light)',
                        backgroundColor: isSelected ? '#FFFBEB' : 'var(--bg-surface)',
                        color: isSelected ? '#1C1917' : 'var(--text-secondary)',
                        boxShadow: isSelected ? '0 0 0 1px #FFB900, 0 1px 2px rgba(255, 185, 0, 0.2)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      P{p}
                    </button>
                  )
                })}
              </div>
              <span className="admin-mu" style={{ fontSize: '0.7rem', display: 'block', marginTop: '0.35rem' }}>
                Default: P7 &amp; P8 (afternoon)
              </span>
            </div>
          </div>

          {/* Reservation Summary */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--primary-50)',
              border: '1.5px solid #FFB900',
              borderRadius: '8px',
              fontSize: '0.82rem',
              color: '#92400E',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 1px 3px rgba(255, 185, 0, 0.15)',
            }}
          >
            <CheckCircleIcon size={15} />
            <span>
              <strong>{totalSlotsPerWeek} periods/week</strong> reserved for Generic Electives across{' '}
              <strong>{value.semesters.length} semesters</strong> (Sem {value.semesters.join(', ')}).
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
