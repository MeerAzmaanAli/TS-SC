import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ENTITIES, getEntity } from '../../lib/entities'
import EntityTable from '../../components/EntityTable'
import EntityForm from '../../components/EntityForm'

export default function EntitiesPage() {
  const { entity } = useParams<{ entity: string }>()
  const def = entity ? getEntity(entity) : undefined
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [adding, setAdding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  if (!def) {
    return (
      <section>
        <h2>Manage data</h2>
        <ul>
          {ENTITIES.map((e) => (
            <li key={e.name}>
              <Link to={`/admin/data/${e.name}`}>{e.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  function closeForm() {
    setEditing(null)
    setAdding(false)
    setRefreshKey((k) => k + 1)
  }

  return (
    <section>
      <p>
        <Link to="/admin/data">← All entities</Link>
      </p>
      <h2>{def.label}</h2>
      {!adding && !editing && (
        <p>
          <button onClick={() => setAdding(true)}>Add {def.singular}</button>
        </p>
      )}
      {(adding || editing) && (
        <EntityForm
          def={def}
          initial={editing ?? undefined}
          onSaved={closeForm}
          onCancel={closeForm}
        />
      )}
      <EntityTable def={def} refreshKey={refreshKey} onEdit={(row) => setEditing(row)} />
    </section>
  )
}
