import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { EntityDef, EntityField, refLabel } from '../lib/entities'
import { CheckIcon, XIcon, AlertCircleIcon } from './Icons'

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

      // If editing, load relation data.
      if (initial?.id) {
        for (const f of def.fields) {
          if (f.relation) {
            const { data, error } = await supabase
              .from(f.relation.joinTable)
              .select(f.relation.targetKey)
              .eq(f.relation.sourceKey, initial.id as string)
            if (!cancelled && !error && data) {
              const ids = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r[f.relation!.targetKey]))
              setValues((v) => ({ ...v, [f.name]: ids }))
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

  function setValue(name: string, val: unknown) {
    setValues((prev) => ({ ...prev, [name]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      // 1. Separate direct fields from relation fields.
      const rowPayload: Record<string, unknown> = {}
      const relationPayloads: { field: EntityField; values: string[] }[] = []

      for (const f of def.fields) {
        if (f.relation) {
          relationPayloads.push({
            field: f,
            values: (values[f.name] as string[]) ?? [],
          })
        } else {
          let val = values[f.name]
          if (f.type === 'number' && val !== '') val = Number(val)
          if (f.type === 'json' && typeof val === 'string') {
            try {
              val = JSON.parse(val)
            } catch {
              throw new Error(`Field "${f.label}" contains invalid JSON.`)
            }
          }
          rowPayload[f.name] = val === '' ? null : val
        }
      }

      // Attach institution_id if table requires it.
      const TABLES_WITH_INSTITUTION = ['departments', 'rooms', 'faculty', 'time_slots', 'constraints']
      if (!initial?.id && TABLES_WITH_INSTITUTION.includes(def.name)) {
        const { data: inst } = await supabase.from('institutions').select('id').limit(1).single()
        if (inst?.id) {
          rowPayload.institution_id = inst.id
        }
      }

      // 2. Insert or update the main record.
      let recordId = initial?.id as string | undefined
      if (initial?.id) {
        const { error: uErr } = await supabase.from(def.name).update(rowPayload).eq('id', initial.id)
        if (uErr) throw uErr
      } else {
        const { data: inserted, error: iErr } = await supabase
          .from(def.name)
          .insert(rowPayload)
          .select('id')
          .single()
        if (iErr) throw iErr
        recordId = (inserted as { id: string }).id
      }

      // 3. Sync relations (join-table rows).
      for (const rel of relationPayloads) {
        const r = rel.field.relation!
        await supabase.from(r.joinTable).delete().eq(r.sourceKey, recordId!)
        if (rel.values.length > 0) {
          const rows = rel.values.map((v) => ({
            [r.sourceKey]: recordId,
            [r.targetKey]: v,
          }))
          const { error: jErr } = await supabase.from(r.joinTable).insert(rows)
          if (jErr) throw jErr
        }
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const isEditing = Boolean(initial?.id)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              {isEditing ? `Edit ${def.singular}` : `New ${def.singular}`}
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>
              Configure master attributes for this {def.singular.toLowerCase()} entry.
            </p>
          </div>
          <button onClick={onCancel} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }}>
            <XIcon size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircleIcon size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {def.fields.map((f) => {
              const currentVal = values[f.name]

              if (f.type === 'boolean') {
                return (
                  <div key={f.name} className="form-group" style={{ gridColumn: '1 / -1', marginTop: '0.25rem' }}>
                    <label className="form-checkbox-label">
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={Boolean(currentVal)}
                        onChange={(e) => setValue(f.name, e.target.checked)}
                      />
                      <span>{f.label}</span>
                    </label>
                  </div>
                )
              }

              if (f.type === 'select') {
                const opts = f.options ?? options[f.name] ?? []
                return (
                  <div key={f.name} className="form-group">
                    <label className="form-label" htmlFor={f.name}>
                      <span>{f.label}</span>
                      {f.required && <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>}
                    </label>
                    <select
                      id={f.name}
                      className="select"
                      required={f.required}
                      value={String(currentVal ?? '')}
                      onChange={(e) => setValue(f.name, e.target.value)}
                    >
                      <option value="">— Select {f.label.toLowerCase()} —</option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }

              if (f.type === 'multiselect') {
                const opts = options[f.name] ?? []
                const selected = (currentVal as string[]) ?? []
                return (
                  <div key={f.name} className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">
                      <span>{f.label}</span>
                      <span className="badge badge-neutral">{selected.length} selected</span>
                    </label>
                    <div
                      style={{
                        maxHeight: 180,
                        overflowY: 'auto',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.6rem 0.75rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: '0.5rem',
                        background: 'var(--slate-50)',
                      }}
                    >
                      {opts.map((o) => {
                        const checked = selected.includes(o.value)
                        return (
                          <label key={o.value} className="form-checkbox-label" style={{ fontSize: '0.8125rem' }}>
                            <input
                              type="checkbox"
                              className="form-checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selected, o.value]
                                  : selected.filter((id) => id !== o.value)
                                setValue(f.name, next)
                              }}
                            />
                            <span>{o.label}</span>
                          </label>
                        )
                      })}
                      {opts.length === 0 && <span className="text-muted text-sm">No options available.</span>}
                    </div>
                  </div>
                )
              }

              if (f.type === 'tags') {
                const arr = Array.isArray(currentVal) ? (currentVal as string[]) : []
                return (
                  <div key={f.name} className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor={f.name}>
                      <span>{f.label}</span>
                    </label>
                    <input
                      id={f.name}
                      type="text"
                      className="input"
                      placeholder="e.g. projector, ac, smartboard"
                      value={arr.join(', ')}
                      onChange={(e) =>
                        setValue(
                          f.name,
                          e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </div>
                )
              }

              if (f.type === 'json') {
                return (
                  <div key={f.name} className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor={f.name}>
                      <span>{f.label}</span>
                    </label>
                    <textarea
                      id={f.name}
                      rows={4}
                      className="textarea font-mono"
                      value={
                        typeof currentVal === 'object'
                          ? JSON.stringify(currentVal, null, 2)
                          : String(currentVal ?? '')
                      }
                      onChange={(e) => setValue(f.name, e.target.value)}
                    />
                  </div>
                )
              }

              return (
                <div key={f.name} className="form-group">
                  <label className="form-label" htmlFor={f.name}>
                    <span>{f.label}</span>
                    {f.required && <span style={{ color: 'var(--rose-500)', fontSize: '0.75rem' }}>*</span>}
                  </label>
                  <input
                    id={f.name}
                    type={f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text'}
                    className="input"
                    required={f.required}
                    value={String(currentVal ?? '')}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              <CheckIcon size={16} />
              <span>{saving ? 'Saving…' : isEditing ? 'Save Changes' : `Create ${def.singular}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
