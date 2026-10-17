import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { EntityDef, EntityField, refLabel } from '../lib/entities'

interface Props {
  def: EntityDef
  initial?: Record<string, unknown>
  onSaved: () => void
  onCancel: () => void
}

type Values = Record<string, unknown>

function emptyFor(field: EntityField): unknown {
  switch (field.type) {
    case 'boolean':
      return false
    case 'multiselect':
    case 'tags':
      return []
    default:
      return ''
  }
}

export default function EntityForm({ def, initial, onSaved, onCancel }: Props) {
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {}
    for (const f of def.fields) {
      if (f.relation) {
        v[f.name] = []
      } else if (initial && initial[f.name] !== undefined && initial[f.name] !== null) {
        v[f.name] = initial[f.name]
      } else {
        v[f.name] = emptyFor(f)
      }
    }
    return v
  })
  const [options, setOptions] = useState<Record<string, { value: string; label: string }[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load dropdown options for reference fields, and existing join-table values.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const next: Record<string, { value: string; label: string }[]> = {}
      for (const f of def.fields) {
        if ((f.type === 'select' || f.type === 'multiselect') && f.reference) {
          const { data, error } = await supabase.from(f.reference).select('id, name, code')
          if (!cancelled && !error && data) {
            next[f.name] = (data as Record<string, unknown>[]).map((r) => ({
              value: String(r.id),
              label: refLabel(r),
            }))
          }
        }
      }
      if (!cancelled) setOptions(next)

      // Existing relation values when editing (currently only faculty qualifications).
      if (!cancelled && initial?.id) {
        for (const f of def.fields) {
          if (f.relation) {
            const { data } = await supabase
              .from(f.relation.joinTable)
              .select(f.relation.targetKey)
              .eq(f.relation.sourceKey, initial.id as string)
            if (data) {
              const rows = data as unknown as Record<string, unknown>[]
              setValues((v) => ({
                ...v,
                [f.name]: rows.map((r) => String(r[f.relation!.targetKey])),
              }))
            }
          }
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [def, initial])

  function set(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      const relations: { field: EntityField; ids: string[] }[] = []
      for (const f of def.fields) {
        const raw = values[f.name]
        if (f.relation) {
          relations.push({ field: f, ids: (raw as string[]) ?? [] })
          continue
        }
        if (f.type === 'number') {
          payload[f.name] = raw === '' ? null : Number(raw)
        } else if (f.type === 'tags') {
          payload[f.name] =
            typeof raw === 'string'
              ? raw.split(',').map((t) => t.trim()).filter(Boolean)
              : (raw as string[])
        } else if (f.type === 'json') {
          payload[f.name] = JSON.parse(String(raw))
        } else if (f.type === 'boolean') {
          payload[f.name] = Boolean(raw)
        } else if (f.type === 'select' && raw === '') {
          payload[f.name] = null
        } else {
          payload[f.name] = raw
        }
      }

      let rowId = initial?.id as string | undefined
      if (rowId) {
        const { error } = await supabase.from(def.name).update(payload).eq('id', rowId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from(def.name).insert(payload).select('id').single()
        if (error) throw error
        rowId = data.id as string
      }

      for (const { field, ids } of relations) {
        const rel = field.relation!
        const { error: delError } = await supabase
          .from(rel.joinTable)
          .delete()
          .eq(rel.sourceKey, rowId)
        if (delError) throw delError
        if (ids.length > 0) {
          const { error: insError } = await supabase
            .from(rel.joinTable)
            .insert(ids.map((id) => ({ [rel.sourceKey]: rowId, [rel.targetKey]: id })))
          if (insError) throw insError
        }
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <h3>{initial ? `Edit ${def.singular}` : `Add ${def.singular}`}</h3>
      {def.fields.map((f) => (
        <label key={f.name} style={{ display: 'grid', gap: 4 }}>
          <span>
            {f.label}
            {f.required ? ' *' : ''}
          </span>
          <FieldInput
            field={f}
            value={values[f.name]}
            options={options[f.name] ?? []}
            onChange={(v) => set(f.name, v)}
          />
        </label>
      ))}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function FieldInput({
  field,
  value,
  options,
  onChange,
}: {
  field: EntityField
  value: unknown
  options: { value: string; label: string }[]
  onChange: (v: unknown) => void
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      )
    case 'number':
      return (
        <input
          type="number"
          value={String(value ?? '')}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'time':
      return (
        <input
          type="time"
          value={String(value ?? '')}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'json':
      return (
        <textarea
          rows={3}
          value={String(value ?? '')}
          required={field.required}
          placeholder='{"value": 10}'
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'tags':
      return (
        <input
          type="text"
          value={Array.isArray(value) ? (value as string[]).join(', ') : String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
      return (
        <select
          value={String(value ?? '')}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {(field.options ?? options).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const selected = new Set((value as string[]) ?? [])
      return (
        <div style={{ display: 'grid', gap: 4, border: '1px solid #ccc', padding: 8 }}>
          {options.map((o) => (
            <label key={o.value} style={{ display: 'flex', gap: 8 }}>
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={(e) => {
                  const next = new Set(selected)
                  if (e.target.checked) next.add(o.value)
                  else next.delete(o.value)
                  onChange([...next])
                }}
              />
              {o.label}
            </label>
          ))}
          {options.length === 0 && <span style={{ color: '#666' }}>No options available.</span>}
        </div>
      )
    }
    default:
      return (
        <input
          type="text"
          value={String(value ?? '')}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
