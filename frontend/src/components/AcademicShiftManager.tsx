import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface YearShiftConfig {
  academic_year: number
  shift: number
  timing_label?: string
}

const DEFAULT_SHIFTS: YearShiftConfig[] = [
  { academic_year: 1, shift: 1, timing_label: 'First Shift (08:15 - 14:45)' },
  { academic_year: 2, shift: 2, timing_label: 'Second Shift (10:15 - 16:45)' },
  { academic_year: 3, shift: 2, timing_label: 'Second Shift (10:15 - 16:45)' },
  { academic_year: 4, shift: 1, timing_label: 'First Shift (08:15 - 14:45)' },
]

export default function AcademicShiftManager() {
  const [shifts, setShifts] = useState<YearShiftConfig[]>(DEFAULT_SHIFTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadShifts()
  }, [])

  async function loadShifts() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('academic_year_shifts')
        .select('academic_year, shift, timing_label')
        .order('academic_year')

      if (!error && data && data.length > 0) {
        const loaded: YearShiftConfig[] = [1, 2, 3, 4].map((yr) => {
          const match = data.find((d: any) => d.academic_year === yr)
          return match
            ? { academic_year: yr, shift: match.shift, timing_label: match.timing_label }
            : DEFAULT_SHIFTS.find((d) => d.academic_year === yr)!
        })
        setShifts(loaded)
      } else {
        setShifts(DEFAULT_SHIFTS)
      }
    } catch {
      setShifts(DEFAULT_SHIFTS)
    } finally {
      setLoading(false)
    }
  }

  function handleShiftChange(year: number, newShift: number) {
    setShifts((prev) =>
      prev.map((s) => (s.academic_year === year ? { ...s, shift: newShift } : s))
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const { data: instData } = await supabase.from('institutions').select('id').limit(1)
      const instId = instData?.[0]?.id

      for (const s of shifts) {
        const label = s.shift === 1 ? 'First Shift (08:15 - 14:45)' : 'Second Shift (10:15 - 16:45)'
        const sTime = s.shift === 1 ? '08:15:00' : '10:15:00'
        const eTime = s.shift === 1 ? '14:45:00' : '16:45:00'

        // 1. Upsert into academic_year_shifts if table exists
        if (instId) {
          await supabase.from('academic_year_shifts').upsert({
            institution_id: instId,
            academic_year: s.academic_year,
            shift: s.shift,
            timing_label: label,
            starts_at: sTime,
            ends_at: eTime,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'institution_id,academic_year' })
        }

        // 2. Update sections matching academic_year or semester
        const sem1 = (s.academic_year - 1) * 2 + 1
        const sem2 = s.academic_year * 2

        await supabase
          .from('sections')
          .update({ shift: s.shift })
          .or(`academic_year.eq.${s.academic_year},semester.in.(${sem1},${sem2}),name.ilike.%Y${s.academic_year}%,name.ilike.%Year ${s.academic_year}%`)
      }

      setNotice('Academic shift assignments saved successfully! Scheduling engine will enforce these shifts.')
      setTimeout(() => setNotice(null), 5000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save shift configuration'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const yearNames = ['1st Year (Freshman)', '2nd Year (Sophomore)', '3rd Year (Junior)', '4th Year (Senior)']

  return (
    <div className="admin-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🕒 Academic Year Shift Timings</span>
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
            Configure class timing shifts by student year. Scheduling engine will strictly allocate slots inside each year's active shift window.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="admin-btn admin-btn-sm"
          style={{ background: '#2563EB', color: '#fff', border: 'none', fontWeight: 600 }}
        >
          {saving ? 'Saving...' : 'Save Shift Assignments'}
        </button>
      </div>

      {notice && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 6, color: '#065F46', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span>
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #EF4444', borderRadius: 6, color: '#991B1B', fontSize: 13 }}>
          <span>{error}</span>
        </div>
      )}

      {/* Timing Reference Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 14 }}>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>First Shift (Shift 1)</span>
            <span style={{ fontSize: 11, background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>08:15 – 14:45</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
            Periods 1 to 6 • Lunch 12:15 to 12:45 • Default: 1st & 4th Years
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>Second Shift (Shift 2)</span>
            <span style={{ fontSize: 11, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>10:15 – 16:45</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
            Periods 3 to 8 • Lunch 12:15 to 12:45 • Default: 2nd & 3rd Years
          </div>
        </div>
      </div>

      {/* Year Shift Selector Table */}
      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F1F5F9', textAlign: 'left', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Academic Year</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Assigned Shift</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Operational Timing</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Common Lunch</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s, idx) => {
              const isShift1 = s.shift === 1
              return (
                <tr key={s.academic_year} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B' }}>
                    {yearNames[idx]}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={s.shift}
                      onChange={(e) => handleShiftChange(s.academic_year, Number(e.target.value))}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: 13,
                        fontWeight: 500,
                        background: '#fff',
                        cursor: 'pointer',
                        color: isShift1 ? '#1E40AF' : '#92400E',
                      }}
                    >
                      <option value={1}>First Shift (08:15 – 14:45)</option>
                      <option value={2}>Second Shift (10:15 – 16:45)</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    {isShift1 ? '08:15 to 14:45 (Periods 1 to 6)' : '10:15 to 16:45 (Periods 3 to 8)'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>
                    12:15 to 12:45
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
