import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { EntityDef, refLabel } from '../lib/entities'

interface Props {
  def: EntityDef
  onEdit: (row: Record<string, unknown>) => void
  refreshKey: number
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function EntityTable({ def, onEdit, refreshKey }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase.from(def.name).select('*').order('created_at', { ascending: true })
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
    if (!window.confirm(`Delete this ${def.singular}? This cannot be undone.`)) return
    const { error } = await supabase.from(def.name).delete().eq('id', id)
    if (error) {
      alert(`Could not delete: ${error.message}`)
      return
    }
    setRows((r) => r.filter((row) => row.id !== id))
  }

  if (loading) return <p>Loading {def.label}…</p>
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          {def.fields
            .filter((f) => !f.relation)
            .map((f) => (
              <th key={f.name} style={{ borderBottom: '2px solid #333', textAlign: 'left', padding: 8 }}>
                {f.label}
              </th>
            ))}
          <th style={{ borderBottom: '2px solid #333', textAlign: 'left', padding: 8 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row.id)}>
            {def.fields
              .filter((f) => !f.relation)
              .map((f) => {
                const raw = row[f.name]
                const text =
                  f.reference && typeof raw === 'string'
                    ? (labels[f.name]?.[raw] ?? raw)
                    : cellText(raw)
                return (
                  <td key={f.name} style={{ borderBottom: '1px solid #ddd', padding: 8 }}>
                    {text}
                  </td>
                )
              })}
            <td style={{ borderBottom: '1px solid #ddd', padding: 8 }}>
              <button onClick={() => onEdit(row)}>Edit</button>{' '}
              <button onClick={() => handleDelete(String(row.id))}>Delete</button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={def.fields.length + 1} style={{ padding: 8, color: '#666' }}>
              No {def.label.toLowerCase()} yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
