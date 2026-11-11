import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { KeyIcon, CheckCircleIcon, RefreshIcon, UsersIcon } from './Icons'

export interface SectionAccess {
  id: string
  name: string
  code: string | null
  semester: number
  strength: number
  batch_count: number
  passkey: string | null
  program?: { name: string } | null
}

export default function SectionPasskeyManager() {
  const [sections, setSections] = useState<SectionAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function loadSections() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sections')
      .select('id, name, code, semester, strength, batch_count, passkey, programs(name)')
      .order('name', { ascending: true })

    if (!error && data) {
      setSections(
        data.map((d: any) => ({
          ...d,
          program: d.programs,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadSections()
  }, [])

  async function handleCopy(section: SectionAccess) {
    const textToCopy = `Section: ${section.name} | Code: ${section.code || 'N/A'} | Passkey: ${section.passkey || 'N/A'}`
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopiedId(section.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // fallback
    }
  }

  async function handleRegenerate(section: SectionAccess) {
    const secLetter = section.name.slice(-1).toUpperCase()
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    const newPasskey = `${secLetter}-${randomNum}`
    const defaultCode = section.code || `BTCS27${secLetter}`

    setRegeneratingId(section.id)
    const { error } = await supabase
      .from('sections')
      .update({ passkey: newPasskey, code: defaultCode })
      .eq('id', section.id)

    setRegeneratingId(null)
    if (!error) {
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, passkey: newPasskey, code: defaultCode } : s))
      )
    }
  }

  const filtered = sections.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <KeyIcon size={22} style={{ color: 'var(--primary, #3b82f6)' }} />
            Section Access &amp; Passkey Manager
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Hand these <strong>Section Code + Passkey</strong> credentials offline to Class Coordinators.
            Students use them to view timetables without personal accounts.
          </p>
        </div>

        <div className="section-manager-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search section or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: '220px', minWidth: '160px', padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
          />
          <button
            onClick={loadSections}
            className="btn btn-secondary btn-sm"
            disabled={loading}
            title="Refresh list"
          >
            <RefreshIcon size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }} className="text-muted">
          Loading section passkeys…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center' }} className="text-muted">
          No sections found.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.6rem 0.75rem' }}>Section</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Student Section Code</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Passkey</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Program &amp; Sem</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Batches</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sec) => (
                <tr
                  key={sec.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle' }}
                >
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <UsersIcon size={14} className="text-muted" />
                      {sec.name}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <code
                      style={{
                        background: 'var(--primary-50)',
                        color: 'var(--primary-700)',
                        padding: '0.2rem 0.45rem',
                        borderRadius: '4px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {sec.code || `BTCS27${sec.name.slice(-1).toUpperCase()}`}
                    </code>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <code
                      style={{
                        background: '#FAFAF9',
                        color: '#1C1917',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-strong)',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {sec.passkey || 'NOT SET'}
                    </code>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }} className="text-muted">
                    {sec.program?.name || 'B.Tech CSE'} (Sem {sec.semester})
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span className="badge" style={{ background: '#F5F5F0', color: '#57534E' }}>
                      {sec.batch_count} {sec.batch_count > 1 ? 'Batches' : 'Batch'}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => handleCopy(sec)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        title="Copy Section Details"
                      >
                        {copiedId === sec.id ? (
                          <>
                            <CheckCircleIcon size={13} style={{ color: '#16a34a' }} />
                            <span>Copied</span>
                          </>
                        ) : (
                          <span>Copy Info</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleRegenerate(sec)}
                        disabled={regeneratingId === sec.id}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        title="Regenerate Passkey"
                      >
                        <RefreshIcon
                          size={12}
                          className={regeneratingId === sec.id ? 'spin' : ''}
                        />
                        <span>Reset</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

