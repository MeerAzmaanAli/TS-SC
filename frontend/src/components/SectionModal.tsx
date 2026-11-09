import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { XIcon, AlertCircleIcon, PlusIcon, LayersIcon } from './Icons'

interface ProgramOption {
  id: string
  name: string
  department_id?: string
  departments?: { name: string; institute?: string }
}

interface Props {
  initial?: Record<string, unknown>
  onSaved: () => void
  onCancel: () => void
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function generatePasskey(secLetter: string): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${secLetter.toUpperCase()}-${code}`
}

function deriveProgramCode(progName: string): string {
  // e.g. "B.Tech CSE Year 1" -> "CSE"
  // "B.Tech AI-DS Year 2" -> "AIDS"
  // "Industry Programs Year 1" -> "IND"
  const upper = progName.toUpperCase()
  if (upper.includes('AI-DS') || upper.includes('DATA SCIENCE') || upper.includes('ARTIFICIAL')) return 'AIDS'
  if (upper.includes('CSE') || upper.includes('COMPUTER SCIENCE')) return 'CSE'
  if (upper.includes('IT') || upper.includes('INFORMATION TECH')) return 'IT'
  if (upper.includes('INDUSTRY') || upper.includes('TCS') || upper.includes('IBM')) return 'IND'
  if (upper.includes('CIVIL')) return 'CE'
  if (upper.includes('MECH')) return 'ME'
  if (upper.includes('ELEC')) return 'EE'
  // fallback: take capital letters / first token
  const words = progName.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0)
  const nonGeneric = words.filter(w => !['BTECH', 'B', 'TECH', 'YEAR', 'Y', 'PROGRAM', 'PROGRAMS'].includes(w.toUpperCase()))
  if (nonGeneric.length > 0) {
    return nonGeneric[0].toUpperCase().slice(0, 5)
  }
  return 'SEC'
}

export default function SectionModal({ initial, onSaved, onCancel }: Props) {
  const isEditing = Boolean(initial?.id)
  const [mode, setMode] = useState<'single' | 'bulk'>(isEditing ? 'single' : 'single')

  // Common selections
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [programId, setProgramId] = useState<string>(String(initial?.program_id ?? ''))
  const [academicYear, setAcademicYear] = useState<number>(Number(initial?.academic_year) || 1)
  const [semester, setSemester] = useState<number>(Number(initial?.semester) || 1)
  const [shift, setShift] = useState<number>(Number(initial?.shift) || (academicYear === 2 || academicYear === 3 ? 2 : 1))

  // Existing sections for collision & auto-naming
  const [existingSections, setExistingSections] = useState<Record<string, unknown>[]>([])
  const [loadingExisting, setLoadingExisting] = useState(false)

  // Single mode state
  const [name, setName] = useState<string>(String(initial?.name ?? ''))
  const [code, setCode] = useState<string>(String(initial?.code ?? ''))
  const [passkey, setPasskey] = useState<string>(String(initial?.passkey ?? ''))
  const [strength, setStrength] = useState<number>(Number(initial?.strength) || 60)
  const [batchCount, setBatchCount] = useState<number>(Number(initial?.batch_count) || 2)

  // Bulk mode state
  const [studentCount, setStudentCount] = useState<number>(180)
  const [bulkBatchCount, setBulkBatchCount] = useState<number>(2)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1. Fetch available programs
  useEffect(() => {
    async function loadPrograms() {
      const { data } = await supabase
        .from('programs')
        .select('id, name, department_id, departments(name, institute)')
        .order('name', { ascending: true })
      if (data) {
        setPrograms(data as unknown as ProgramOption[])
        if (!programId && data.length > 0 && !initial?.id) {
          setProgramId(data[0].id)
        }
      }
    }
    loadPrograms()
  }, [])

  // 2. Fetch existing sections for selected program & semester
  useEffect(() => {
    if (!programId) return
    let active = true
    async function loadSecs() {
      setLoadingExisting(true)
      const { data } = await supabase
        .from('sections')
        .select('*')
        .eq('program_id', programId)
        .eq('semester', semester)
      if (active) {
        setExistingSections(data ?? [])
        setLoadingExisting(false)
      }
    }
    loadSecs()
    return () => {
      active = false
    }
  }, [programId, semester])

  // Update default semester & shift when academicYear changes (if user didn't manually pick)
  function handleYearChange(newYear: number) {
    setAcademicYear(newYear)
    // Default odd semester for this year: Year 1 -> 1, Year 2 -> 3, Year 3 -> 5, Year 4 -> 7
    const defSem = newYear * 2 - 1
    setSemester(defSem)
    // Shift: Year 1 & 4 -> Shift 1, Year 2 & 3 -> Shift 2
    const defShift = (newYear === 2 || newYear === 3) ? 2 : 1
    setShift(defShift)
  }

  // 3. Auto-generate Name, Code, Passkey in Single Mode (when not editing)
  useEffect(() => {
    if (isEditing) return
    if (!programId || loadingExisting) return

    const prog = programs.find((p) => p.id === programId)
    const progCode = prog ? deriveProgramCode(prog.name) : 'SEC'

    // Determine next letter
    const usedLetters = new Set<string>()
    for (const sec of existingSections) {
      const secName = String(sec.name || '').trim().toUpperCase()
      const match = secName.match(/(?:SEC|SECTION|\b)([A-Z])$/i) || secName.match(/[-_]([A-Z])$/i)
      if (match) {
        usedLetters.add(match[1].toUpperCase())
      } else if (secName.length === 1 && /[A-Z]/.test(secName)) {
        usedLetters.add(secName)
      }
    }

    let nextLetter = 'A'
    for (const l of LETTERS) {
      if (!usedLetters.has(l)) {
        nextLetter = l
        break
      }
    }

    const autoName = `${progCode}-Y${academicYear}-${nextLetter}`
    const autoCode = `${progCode}-Y${academicYear}-${nextLetter}`
    const autoPasskey = generatePasskey(nextLetter)

    setName(autoName)
    setCode(autoCode)
    setPasskey(autoPasskey)
  }, [programId, academicYear, semester, existingSections, isEditing, loadingExisting, programs])

  // Bulk calculation preview
  const bulkPreview = React.useMemo(() => {
    if (studentCount <= 0) return []
    const BASE_CAP = 60
    const THRESHOLD = 45 // remainder < 45 gets merged across sections

    const numBase = Math.floor(studentCount / BASE_CAP)
    const remainder = studentCount % BASE_CAP

    let sectionCount = 0
    if (numBase === 0) {
      sectionCount = 1
    } else if (remainder === 0) {
      sectionCount = numBase
    } else if (remainder < THRESHOLD) {
      // Evenly distribute remainder among numBase sections
      sectionCount = numBase
    } else {
      // Remainder is 45-59 -> make a separate section
      sectionCount = numBase + 1
    }

    // Distribute studentCount as evenly as possible across sectionCount
    const baseShare = Math.floor(studentCount / sectionCount)
    const extra = studentCount % sectionCount

    const prog = programs.find((p) => p.id === programId)
    const progCode = prog ? deriveProgramCode(prog.name) : 'SEC'

    // Find used letters
    const usedLetters = new Set<string>()
    for (const sec of existingSections) {
      const secName = String(sec.name || '').trim().toUpperCase()
      const match = secName.match(/(?:SEC|SECTION|\b)([A-Z])$/i) || secName.match(/[-_]([A-Z])$/i)
      if (match) usedLetters.add(match[1].toUpperCase())
      else if (secName.length === 1 && /[A-Z]/.test(secName)) usedLetters.add(secName)
    }

    const availableLetters = LETTERS.filter((l) => !usedLetters.has(l))

    const list: { name: string; code: string; passkey: string; strength: number; batchCount: number }[] = []
    for (let i = 0; i < sectionCount; i++) {
      const letter = availableLetters[i] || `X${i + 1}`
      const secStrength = baseShare + (i < extra ? 1 : 0)
      list.push({
        name: `${progCode}-Y${academicYear}-${letter}`,
        code: `${progCode}-Y${academicYear}-${letter}`,
        passkey: generatePasskey(letter),
        strength: secStrength,
        batchCount: bulkBatchCount,
      })
    }
    return list
  }, [studentCount, programId, academicYear, semester, existingSections, programs, bulkBatchCount])

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (!programId) throw new Error('Please select a program.')
      if (!name) throw new Error('Section name cannot be empty.')
      if (!code) throw new Error('Section code cannot be empty.')

      const payload = {
        program_id: programId,
        name: name.trim(),
        code: code.trim(),
        passkey: passkey.trim(),
        academic_year: academicYear,
        semester,
        shift,
        strength,
        batch_count: batchCount,
      }

      if (isEditing) {
        const { error: uErr } = await supabase.from('sections').update(payload).eq('id', initial!.id)
        if (uErr) throw uErr
      } else {
        const { error: iErr } = await supabase.from('sections').insert(payload)
        if (iErr) throw iErr
      }

      onSaved()
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (!programId) throw new Error('Please select a program.')
      if (bulkPreview.length === 0) throw new Error('No sections generated. Check student count.')

      const rows = bulkPreview.map((item) => ({
        program_id: programId,
        name: item.name,
        code: item.code,
        passkey: item.passkey,
        academic_year: academicYear,
        semester,
        shift,
        strength: item.strength,
        batch_count: item.batchCount,
      }))

      const { error: iErr } = await supabase.from('sections').insert(rows)
      if (iErr) throw iErr

      onSaved()
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content" style={{ maxWidth: 640 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            borderBottom: '1px solid var(--border-light)',
            paddingBottom: '0.875rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)', margin: 0 }}>
              {isEditing ? 'Edit Section' : 'Add Section(s)'}
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8125rem', margin: '4px 0 0 0' }}>
              {isEditing
                ? 'Update curriculum year, semester, shift, and capacity for this section.'
                : 'Configure program, academic year, and let the system auto-generate sections & credentials.'}
            </p>
          </div>
          <button onClick={onCancel} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }}>
            <XIcon size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
            <AlertCircleIcon size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{error}</div>
          </div>
        )}

        {/* Mode Toggle (Single vs Multi) */}
        {!isEditing && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              backgroundColor: '#f1f5f9',
              padding: 4,
              borderRadius: 8,
              marginBottom: '1.25rem',
            }}
          >
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, border: 'none', justifyContent: 'center' }}
            >
              <PlusIcon size={14} />
              <span>Single Section (Auto-Name)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`btn btn-sm ${mode === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, border: 'none', justifyContent: 'center' }}
            >
              <LayersIcon size={14} />
              <span>Multi-Section by Student Enrollment</span>
            </button>
          </div>
        )}

        {/* Common Program / Year / Semester Dropdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {/* Program Dropdown */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="section-program">
              <span>Program</span>
              <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
            </label>
            <select
              id="section-program"
              className="select"
              required
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">— Select Academic Program —</option>
              {programs.map((p) => {
                const dept = p.departments?.name ? ` [${p.departments.name}]` : ''
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}{dept}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Academic Year Dropdown */}
          <div className="form-group">
            <label className="form-label" htmlFor="section-year">
              <span>Academic Year</span>
              <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
            </label>
            <select
              id="section-year"
              className="select"
              required
              value={academicYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
            >
              <option value={1}>Year 1 (Freshman)</option>
              <option value={2}>Year 2 (Sophomore)</option>
              <option value={3}>Year 3 (Junior)</option>
              <option value={4}>Year 4 (Senior)</option>
            </select>
          </div>

          {/* Semester Dropdown */}
          <div className="form-group">
            <label className="form-label" htmlFor="section-semester">
              <span>Semester</span>
              <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
            </label>
            <select
              id="section-semester"
              className="select"
              required
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value))}
            >
              <option value={academicYear * 2 - 1}>Semester {academicYear * 2 - 1} (Odd / Autumn)</option>
              <option value={academicYear * 2}>Semester {academicYear * 2} (Even / Spring)</option>
            </select>
          </div>

          {/* Shift Dropdown */}
          <div className="form-group">
            <label className="form-label" htmlFor="section-shift">
              <span>Shift Timing</span>
              <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
            </label>
            <select
              id="section-shift"
              className="select"
              required
              value={shift}
              onChange={(e) => setShift(Number(e.target.value))}
            >
              <option value={1}>Shift 1: Morning (08:15 – 14:45)</option>
              <option value={2}>Shift 2: Afternoon (10:15 – 16:45)</option>
            </select>
          </div>
        </div>

        {/* Existing Sections Notification */}
        {existingSections.length > 0 && (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#475569',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '6px 12px',
              borderRadius: 6,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>ℹ️</span>
            <span>
              Already <strong>{existingSections.length}</strong> section(s) in this Program & Semester: (
              {existingSections.map((s: any) => s.code || s.name).join(', ')})
            </span>
          </div>
        )}

        {/* SINGLE MODE */}
        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* Name */}
              <div className="form-group">
                <label className="form-label" htmlFor="section-name">
                  <span>Section Name</span>
                  <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
                </label>
                <input
                  id="section-name"
                  type="text"
                  className="input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CSE-Y1-A"
                />
              </div>

              {/* Code */}
              <div className="form-group">
                <label className="form-label" htmlFor="section-code">
                  <span>Section Code</span>
                  <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
                </label>
                <input
                  id="section-code"
                  type="text"
                  className="input font-mono"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. CSE-Y1-A"
                />
              </div>

              {/* Passkey */}
              <div className="form-group">
                <label className="form-label" htmlFor="section-passkey">
                  <span>Student Passkey</span>
                  <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    id="section-passkey"
                    type="text"
                    className="input font-mono"
                    required
                    value={passkey}
                    onChange={(e) => setPasskey(e.target.value)}
                    placeholder="e.g. A-7566"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const letter = name.slice(-1) || 'A'
                      setPasskey(generatePasskey(letter))
                    }}
                    className="btn btn-secondary btn-sm"
                    title="Generate new passkey"
                  >
                    🎲
                  </button>
                </div>
              </div>

              {/* Strength */}
              <div className="form-group">
                <label className="form-label" htmlFor="section-strength">
                  <span>Class Strength (Default: 60)</span>
                  <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
                </label>
                <input
                  id="section-strength"
                  type="number"
                  min={1}
                  className="input"
                  required
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                />
              </div>

              {/* Lab Batches */}
              <div className="form-group">
                <label className="form-label" htmlFor="section-batches">
                  <span>Lab Batches (Default: 2)</span>
                  <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
                </label>
                <input
                  id="section-batches"
                  type="number"
                  min={1}
                  max={4}
                  className="input"
                  required
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '1.5rem',
                borderTop: '1px solid var(--border-light)',
                paddingTop: '1rem',
              }}
            >
              <button type="button" onClick={onCancel} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Saving Section…' : isEditing ? 'Save Changes' : 'Create Section'}
              </button>
            </div>
          </form>
        ) : (
          /* BULK MULTI-SECTION MODE */
          <form onSubmit={handleBulkSubmit}>
            <div
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.875rem', marginBottom: 4 }}>
                Auto-Distribution Logic
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#1e3a8a', lineHeight: 1.4 }}>
                Sections have standard capacity of <strong>60 students</strong>. If leftover students are in the range{' '}
                <strong>1–45</strong>, they are automatically balanced across all generated sections rather than creating an
                under-strength section.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="student-count">
                  <span>Total Admitted Students</span>
                  <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>
                </label>
                <input
                  id="student-count"
                  type="number"
                  min={1}
                  className="input"
                  required
                  value={studentCount}
                  onChange={(e) => setStudentCount(Number(e.target.value))}
                  placeholder="e.g. 180"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="bulk-batches">
                  <span>Lab Batches per Section</span>
                </label>
                <input
                  id="bulk-batches"
                  type="number"
                  min={1}
                  max={4}
                  className="input"
                  value={bulkBatchCount}
                  onChange={(e) => setBulkBatchCount(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Generated Plan Preview Table */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}>
                  Generated Sections Plan ({bulkPreview.length} sections)
                </span>
                <span className="badge badge-primary">
                  {studentCount} Students Total
                </span>
              </div>

              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  overflow: 'hidden',
                  maxHeight: 180,
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <tr>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Section Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Code</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Passkey</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>Strength</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>Batches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{item.code}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#4338ca' }}>{item.passkey}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <span className="badge badge-neutral">{item.strength} students</span>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>{item.batchCount}</td>
                      </tr>
                    ))}
                    {bulkPreview.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                          Enter student count above to calculate sections.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                borderTop: '1px solid var(--border-light)',
                paddingTop: '1rem',
              }}
            >
              <button type="button" onClick={onCancel} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || bulkPreview.length === 0}
                className="btn btn-primary"
              >
                {saving ? 'Creating Sections…' : `Create All ${bulkPreview.length} Sections`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

