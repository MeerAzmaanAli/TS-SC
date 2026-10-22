import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ENTITIES, getEntity } from '../../lib/entities'
import EntityTable from '../../components/EntityTable'
import EntityForm from '../../components/EntityForm'
import { PlusIcon, BookOpenIcon, ArrowLeftIcon, ArrowRightIcon } from '../../components/Icons'

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
    <div>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: '0.35rem' }}>
            <Link to="/admin" className="text-muted" style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <ArrowLeftIcon size={14} />
              <span>Admin Dashboard</span>
            </Link>
            {def && (
              <>
                <span className="text-muted">/</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--slate-700)' }}>
                  {def.label}
                </span>
              </>
            )}
          </div>
          <h1 className="page-title">
            <BookOpenIcon size={26} style={{ color: 'var(--primary-600)' }} />
            <span>{def ? def.label : 'Curriculum & Institutional Data'}</span>
          </h1>
          <p className="page-subtitle">
            {def
              ? `Manage institutional ${def.label.toLowerCase()} entries, constraints, and relationships for the scheduling engine.`
              : 'Select a data table below to view, add, modify, or delete institutional master records.'}
          </p>
        </div>

        {def && !adding && !editing && (
          <button onClick={() => setAdding(true)} className="btn btn-primary">
            <PlusIcon size={16} />
            <span>Add {def.singular}</span>
          </button>
        )}
      </div>

      {/* Horizontal Entity Quick-Switch Tabs */}
      <div className="tabs-nav">
        {ENTITIES.map((e) => {
          const isActive = e.name === entity
          return (
            <Link
              key={e.name}
              to={`/admin/data/${e.name}`}
              className={`tab-btn ${isActive ? 'active' : ''}`}
            >
              <span>{e.label}</span>
            </Link>
          )
        })}
      </div>

      {!def ? (
        <div className="grid-3">
          {ENTITIES.map((e) => (
            <Link key={e.name} to={`/admin/data/${e.name}`} className="action-card">
              <div>
                <h3 className="action-card-title">{e.label}</h3>
                <p className="action-card-desc">
                  Maintain {e.singular.toLowerCase()} records, fields, and constraints.
                </p>
              </div>
              <div className="action-card-arrow">
                <span>View {e.label}</span>
                <ArrowRightIcon size={14} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <>
          {(adding || editing) && (
            <EntityForm
              def={def}
              initial={editing ?? undefined}
              onSaved={closeForm}
              onCancel={closeForm}
            />
          )}

          <EntityTable def={def} refreshKey={refreshKey} onEdit={(row) => setEditing(row)} />
        </>
      )}
    </div>
  )
}
