import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { EntityDef, refLabel } from '../lib/entities'
import { EditIcon, TrashIcon, SearchIcon, BookOpenIcon } from './Icons'

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

export default function EntityTable({ def, onEdit, refreshKey }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let query = supabase.from(def.name).select('*')
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
          const { data: refRows } = await supabase.from(f.reference).select('id, name, code')
          if (cancelled) return
          maps[f.name] = Object.fromEntries(
            ((refRows ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), refLabel(r)]),
          )
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

        <div className="flex items-center gap-2">
          <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
            {filteredRows.length} of {rows.length} {def.label}
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
            {filteredRows.map((row) => (
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
