import React, { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { EntityDef, refLabel } from '../lib/entities'
import { EditIcon, TrashIcon, SearchIcon, BookOpenIcon, LayersIcon } from './Icons'

interface Props {
  def: EntityDef
  onEdit: (row: Record<string, unknown>) => void
  refreshKey: number
}

function renderCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>
  if (typeof value === 'boolean') {
    return value ? (
      <span className="badge badge-success">Yes</span>
    ) : (
      <span className="badge badge-neutral">No</span>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">—</span>
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {value.map((v, i) => (
          <span key={i} className="badge badge-primary">
            {String(v)}
          </span>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    return <code className="font-mono text-sm">{JSON.stringify(value)}</code>
  }
  return String(value)
}

function getGroupKey(
  row: Record<string, unknown>,
  defName: string,
  labels: Record<string, Record<string, string>>,
  progDeptMap: Record<string, string>,
): { key: string; label: string; icon: string } {
  if (defName === 'programs') {
    const dept = labels['department_id']?.[String(row.department_id)] || 'General / Unassigned'
    return { key: dept, label: `Department: ${dept}`, icon: '🏛️' }
  }

  if (defName === 'sections') {
    const sem = Number(row.semester) || 1
    const year = Math.ceil(sem / 2)
    const progId = String(row.program_id ?? '')
    const progName = labels['program_id']?.[progId] || 'General'
    const deptName = progDeptMap[progId] || ''
    const deptPart = deptName ? ` — ${deptName}` : ''
    const key = `Y${year}-${deptName}-${progName}`
    return {
      key,
      label: `Year ${year} (Semesters ${year * 2 - 1} & ${year * 2})${deptPart} [${progName}]`,
      icon: '🎓',
    }
  }

  if (defName === 'rooms') {
    const name = String(row.name ?? '').trim()
    const prefix = name.includes('-') ? name.split('-')[0].trim().toUpperCase() : ''
    let bldgName = ''
    if (prefix === 'MB') bldgName = 'Main Building (MB)'
    else if (prefix === 'ME') bldgName = 'Mechanical Engineering Block (ME)'
    else if (prefix === 'CE') bldgName = 'Civil Engineering Block (CE)'
    else if (prefix === 'EE') bldgName = 'Electrical Engineering Block (EE)'
    else if (prefix === 'CS' || prefix === 'CSE') bldgName = 'Computer Science Block (CSE)'
    else if (prefix === 'LAB' || row.room_type === 'lab') bldgName = 'Laboratory Complex (LAB)'
    else if (prefix) bldgName = `${prefix} Complex / Wing`
    else bldgName = row.room_type === 'lab' ? 'Laboratory Facilities' : 'General Campus Classrooms'

    return { key: bldgName, label: bldgName, icon: '🏢' }
  }

  if (defName === 'courses') {
    const dept = labels['department_id']?.[String(row.department_id)] || 'General Curriculum'
    return { key: dept, label: `Department: ${dept}`, icon: '📚' }
  }

  if (defName === 'faculty') {
    const dept = labels['department_id']?.[String(row.department_id)] || 'General Faculty'
    return { key: dept, label: `Department: ${dept}`, icon: '👨‍🏫' }
  }

  if (defName === 'program_courses') {
    const prog = labels['program_id']?.[String(row.program_id)] || 'General Program'
    return { key: prog, label: `Program: ${prog}`, icon: '📋' }
  }

  if (defName === 'time_slots') {
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const day = Number(row.day_of_week) || 0
    return { key: `Day-${day}`, label: dayNames[day] || `Day ${day}`, icon: '📅' }
  }

  return { key: 'all', label: 'All Records', icon: '📁' }
}

export default function EntityTable({ def, onEdit, refreshKey }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({})
  const [progDeptMap, setProgDeptMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isGrouped, setIsGrouped] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let query = supabase.from(def.name).select('*').limit(50000)
      if (def.orderBy && def.orderBy.length > 0) {
        for (const ord of def.orderBy) {
          query = query.order(ord.column, { ascending: ord.ascending ?? true })
        }
      } else if (def.name === 'time_slots') {
        query = query.order('day_of_week', { ascending: true }).order('period', { ascending: true })
      } else if (def.name === 'constraints') {
        query = query.order('key', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: true })
      }

      const { data, error } = await query
      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        setRows((data ?? []) as Record<string, unknown>[])
      }

      // Resolve reference columns to human labels.
      const maps: Record<string, Record<string, string>> = {}
      for (const f of def.fields) {
        if (f.reference) {
          const selectCols = f.reference === 'courses' ? 'id, name, code' : 'id, name'
          const { data: refRows } = await supabase.from(f.reference).select(selectCols as any).limit(50000)
          if (cancelled) return
          maps[f.name] = Object.fromEntries(
            ((refRows ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r.id), refLabel(r)]),
          )
        }
      }

      // If sections table, fetch program -> department mappings for richer grouping
      if (def.name === 'sections') {
        const { data: progRows } = await supabase
          .from('programs')
          .select('id, name, department_id, departments(name)')
          .limit(50000)
        if (!cancelled && progRows) {
          const pDept: Record<string, string> = {}
          for (const p of progRows as any[]) {
            pDept[p.id] = p.departments?.name ?? ''
          }
          setProgDeptMap(pDept)
        }
      }

      if (!cancelled) {
        setLabels(maps)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [def, refreshKey])

  async function handleDelete(id: string) {
    if (!window.confirm(`Are you sure you want to delete this ${def.singular}? This cannot be undone.`)) return
    const { error } = await supabase.from(def.name).delete().eq('id', id)
    if (error) {
      alert(`Could not delete: ${error.message}`)
      return
    }
    setRows((r) => r.filter((row) => row.id !== id))
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => {
      return Object.values(r).some((val) => {
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(q)
      })
    })
  }, [rows, search])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; icon: string; rows: Record<string, unknown>[] }>()
    for (const r of filteredRows) {
      const info = getGroupKey(r, def.name, labels, progDeptMap)
      let g = map.get(info.key)
      if (!g) {
        g = { ...info, rows: [] }
        map.set(info.key, g)
      }
      g.rows.push(r)
    }
    return Array.from(map.values())
  }, [filteredRows, def.name, labels, progDeptMap])

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllGroups() {
    if (collapsedGroups.size > 0) {
      setCollapsedGroups(new Set())
    } else {
      setCollapsedGroups(new Set(groups.map((g) => g.key)))
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p className="text-muted">Loading {def.label.toLowerCase()}…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <strong>Error:</strong> {error}
      </div>
    )
  }

  const displayFields = def.fields.filter((f) => !f.relation)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--slate-50)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 380 }}>
          <SearchIcon
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--slate-400)',
            }}
          />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: 36, fontSize: '0.8125rem' }}
            placeholder={`Filter ${def.label.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setIsGrouped((v) => !v)}
            className={`btn btn-sm ${isGrouped ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Toggle between grouped categories and standard flat table"
          >
            <LayersIcon size={14} />
            <span>{isGrouped ? 'Grouped View' : 'Flat View'}</span>
          </button>

          {isGrouped && groups.length > 1 && (
            <button
              type="button"
              onClick={toggleAllGroups}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem' }}
            >
              {collapsedGroups.size > 0 ? 'Expand All' : 'Collapse All'}
            </button>
          )}

          <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
            {filteredRows.length} of {rows.length} {def.label}
            {isGrouped && ` (${groups.length} groups)`}
          </span>
        </div>
      </div>

      <div className="table-responsive" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <table className="data-table">
          <thead>
            <tr>
              {displayFields.map((f) => (
                <th key={f.name}>{f.label}</th>
              ))}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isGrouped ? (
              groups.map((grp) => {
                const isCollapsed = collapsedGroups.has(grp.key)
                return (
                  <Fragment key={grp.key}>
                    <tr
                      onClick={() => toggleGroup(grp.key)}
                      style={{
                        backgroundColor: '#f1f5f9',
                        cursor: 'pointer',
                        borderTop: '2px solid #cbd5e1',
                        borderBottom: '1px solid #e2e8f0',
                        userSelect: 'none',
                      }}
                    >
                      <td
                        colSpan={displayFields.length + 1}
                        style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#1e293b' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'inline-block', width: 14 }}>
                              {isCollapsed ? '▶' : '▼'}
                            </span>
                            <span style={{ fontSize: '1rem' }}>{grp.icon}</span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0f172a' }}>
                              {grp.label}
                            </span>
                          </div>
                          <span
                            className="badge badge-neutral"
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.6rem',
                              backgroundColor: '#ffffff',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            {grp.rows.length} {grp.rows.length === 1 ? def.singular : def.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      grp.rows.map((row) => (
                        <tr key={String(row.id)}>
                          {displayFields.map((f) => {
                            const raw = row[f.name]
                            const resolved =
                              f.reference && typeof raw === 'string'
                                ? labels[f.name]?.[raw] ?? raw
                                : raw
                            return <td key={f.name}>{renderCellValue(resolved)}</td>
                          })}
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => onEdit(row)}
                                className="btn btn-secondary btn-sm"
                                title={`Edit ${def.singular}`}
                              >
                                <EditIcon size={14} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDelete(String(row.id))}
                                className="btn btn-danger btn-sm"
                                title={`Delete ${def.singular}`}
                              >
                                <TrashIcon size={14} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })
            ) : (
              filteredRows.map((row) => (
                <tr key={String(row.id)}>
                  {displayFields.map((f) => {
                    const raw = row[f.name]
                    const resolved =
                      f.reference && typeof raw === 'string'
                        ? labels[f.name]?.[raw] ?? raw
                        : raw
                    return <td key={f.name}>{renderCellValue(resolved)}</td>
                  })}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => onEdit(row)}
                        className="btn btn-secondary btn-sm"
                        title={`Edit ${def.singular}`}
                      >
                        <EditIcon size={14} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(String(row.id))}
                        className="btn btn-danger btn-sm"
                        title={`Delete ${def.singular}`}
                      >
                        <TrashIcon size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={displayFields.length + 1} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                  <div className="stat-icon indigo" style={{ margin: '0 auto 0.75rem', width: 44, height: 44 }}>
                    <BookOpenIcon size={20} />
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--slate-800)', fontSize: '0.95rem' }}>
                    No {def.label.toLowerCase()} found
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                    {search ? 'Try clearing your filter search.' : `Click "+ Add ${def.singular}" above to create the first record.`}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
