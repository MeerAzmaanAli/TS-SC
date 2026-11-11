import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ENTITIES, getEntity } from '../../lib/entities'
import EntityTable from '../../components/EntityTable'
import EntityForm from '../../components/EntityForm'
import SectionModal from '../../components/SectionModal'
import AdminHeader from '../../components/AdminHeader'
import { PlusIcon } from '../../components/Icons'

export default function EntitiesPage() {
  const { entity } = useParams<{ entity: string }>()
  const def = entity ? getEntity(entity) : undefined
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [adding, setAdding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  function closeForm() {
    setEditing(null)
    setAdding(false)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="admin-cal-wrapper">
      <AdminHeader />

      <section className="admin-panel" style={{ marginTop: 4 }}>
        <div className="admin-panel-hd">
          <div>
            <h2>{def ? def.label : 'Curriculum & Institutional Master Data'}</h2>
            <p className="admin-mu" style={{ fontSize: 13, margin: '4px 0 0 0' }}>
              {def
                ? `Manage institutional ${def.label.toLowerCase()} entries, constraints, and relationships for the scheduling engine.`
                : 'Select an institutional data table below to view, add, modify, or delete master database records.'}
            </p>
          </div>

          {def && !adding && !editing && (
            <button type="button" onClick={() => setAdding(true)} className="admin-btn admin-btn-primary admin-btn-sm">
              <PlusIcon size={14} />
              <span>Add {def.singular}</span>
            </button>
          )}
        </div>

        {/* Horizontal Table Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 10,
            marginBottom: 16,
            borderBottom: '1px solid #E7E5E4',
          }}
        >
          {ENTITIES.map((e) => {
            const isActive = e.name === entity
            return (
              <Link
                key={e.name}
                to={`/admin/data/${e.name}`}
                className={`admin-btn admin-btn-sm ${isActive ? '' : 'admin-btn-outline'}`}
                style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                <span>{e.label}</span>
              </Link>
            )
          })}
        </div>

        {!def ? (
          <div className="admin-data-grid">
            {ENTITIES.map((e) => (
              <Link key={e.name} to={`/admin/data/${e.name}`} className="admin-data-link">
                <span style={{ fontWeight: 600 }}>{e.label}</span>
                <span className="admin-m admin-mu">Manage →</span>
              </Link>
            ))}
          </div>
        ) : (
          <div>
            {(adding || editing) && (
              <div style={{ marginBottom: 20 }}>
                {entity === 'sections' ? (
                  <SectionModal
                    initial={editing ?? undefined}
                    onSaved={closeForm}
                    onCancel={closeForm}
                  />
                ) : (
                  <EntityForm
                    def={def}
                    initial={editing ?? undefined}
                    onSaved={closeForm}
                    onCancel={closeForm}
                  />
                )}
              </div>
            )}

            <EntityTable
              key={`${entity}-${refreshKey}`}
              refreshKey={refreshKey}
              def={def}
              onEdit={(row) => setEditing(row)}
            />
          </div>
        )}
      </section>
    </div>
  )
}
