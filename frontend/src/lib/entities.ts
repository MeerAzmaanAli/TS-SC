/**
 * Entity definitions driving the generic Admin CRUD UI (Phase 2).
 * Each definition maps 1:1 to a Supabase table from the initial schema.
 */

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'time'
  | 'json'
  | 'tags'
  | 'select'
  | 'multiselect'

export interface RelationSync {
  joinTable: string
  sourceKey: string
  targetKey: string
}

export interface EntityField {
  name: string
  label: string
  type: FieldType
  required?: boolean
  /** static options for `select` */
  options?: { value: string; label: string }[]
  /** entity name whose rows populate a select/multiselect, label taken from its `name`/`code` column */
  reference?: string
  /** when set, values are synced to a join table instead of the row itself */
  relation?: RelationSync
}

export interface EntityDef {
  /** table name */
  name: string
  label: string
  singular: string
  fields: EntityField[]
}

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
]

export const ENTITIES: EntityDef[] = [
  {
    name: 'departments',
    label: 'Departments',
    singular: 'Department',
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true }],
  },
  {
    name: 'programs',
    label: 'Programs',
    singular: 'Program',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'department_id', label: 'Department', type: 'select', reference: 'departments', required: true },
    ],
  },
  {
    name: 'sections',
    label: 'Sections',
    singular: 'Section',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'program_id', label: 'Program', type: 'select', reference: 'programs', required: true },
      { name: 'semester', label: 'Semester', type: 'number', required: true },
      { name: 'strength', label: 'Strength', type: 'number', required: true },
    ],
  },
  {
    name: 'rooms',
    label: 'Rooms',
    singular: 'Room',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      {
        name: 'room_type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'classroom', label: 'Classroom' },
          { value: 'lab', label: 'Lab' },
          { value: 'seminar', label: 'Seminar' },
        ],
      },
      { name: 'capacity', label: 'Capacity', type: 'number', required: true },
      { name: 'equipment_tags', label: 'Equipment tags (comma separated)', type: 'tags' },
    ],
  },
  {
    name: 'courses',
    label: 'Courses',
    singular: 'Course',
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'department_id', label: 'Department', type: 'select', reference: 'departments', required: true },
      { name: 'credits', label: 'Credits', type: 'number' },
      { name: 'sessions_per_week', label: 'Sessions / week', type: 'number', required: true },
      { name: 'lab_required', label: 'Lab required', type: 'boolean' },
    ],
  },
  {
    name: 'faculty',
    label: 'Faculty',
    singular: 'Faculty member',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'text', required: true },
      { name: 'department_id', label: 'Department', type: 'select', reference: 'departments' },
      { name: 'max_weekly_load', label: 'Max weekly load', type: 'number', required: true },
      {
        name: 'qualification_ids',
        label: 'Qualified courses',
        type: 'multiselect',
        reference: 'courses',
        relation: {
          joinTable: 'faculty_qualifications',
          sourceKey: 'faculty_id',
          targetKey: 'course_id',
        },
      },
    ],
  },
  {
    name: 'time_slots',
    label: 'Time slots',
    singular: 'Time slot',
    fields: [
      { name: 'day_of_week', label: 'Day', type: 'select', options: DAYS, required: true },
      { name: 'period', label: 'Period', type: 'number', required: true },
      { name: 'starts_at', label: 'Starts at', type: 'time', required: true },
      { name: 'ends_at', label: 'Ends at', type: 'time', required: true },
    ],
  },
  {
    name: 'constraints',
    label: 'Constraints',
    singular: 'Constraint',
    fields: [
      { name: 'key', label: 'Key', type: 'text', required: true },
      {
        name: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: [
          { value: 'hard', label: 'Hard' },
          { value: 'soft', label: 'Soft' },
        ],
      },
      { name: 'value', label: 'Value (JSON)', type: 'json', required: true },
    ],
  },
]

export function getEntity(name: string): EntityDef | undefined {
  return ENTITIES.find((e) => e.name === name)
}

/** Human label for a referenced row (prefers code, then name). */
export function refLabel(row: Record<string, unknown>): string {
  if (typeof row.code === 'string' && row.code) return `${row.code} — ${String(row.name ?? '')}`
  return String(row.name ?? row.id ?? '')
}
