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

export interface OrderRule {
  column: string
  ascending?: boolean
}

export interface EntityDef {
  /** table name */
  name: string
  label: string
  singular: string
  fields: EntityField[]
  orderBy?: OrderRule[]
}

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
]

export const UNIVERSITY_INSTITUTES: { group: string; institutes: string[] }[] = [
  {
    group: 'Engineering & Technology',
    institutes: [
      'Shri Vaishnav Institute of Technology and Science',
      'Shri Vaishnav Institute of Information Technology',
      'Shri Vaishnav Institute of Textile Technology',
      'Shri Vaishnav Institute of Computer Applications',
    ],
  },
  {
    group: 'Arts',
    institutes: ['Shri Vaishnav Institute of Fine Arts'],
  },
  {
    group: 'Law, Management & Commerce',
    institutes: [
      'Shri Vaishnav Institute of Law',
      'Shri Vaishnav School of Management',
      'Shri Vaishnav Institute of Commerce',
    ],
  },
  {
    group: 'Social Sciences & Humanities',
    institutes: ['Shri Vaishnav Institute of Social Science, Humanities and Arts'],
  },
  {
    group: 'Media & Communication',
    institutes: ['Shri Vaishnav Institute of Journalism & Mass Communication'],
  },
  {
    group: 'Science & Applied Fields',
    institutes: [
      'Shri Vaishnav Institute of Science',
      'Shri Vaishnav Institute of Forensic Science',
      'Shri Vaishnav Institute of Agriculture',
    ],
  },
  {
    group: 'Architecture & Planning',
    institutes: [
      'Shri Vaishnav Institute of Architecture',
      'Shri Vaishnav Institute of Planning',
    ],
  },
  {
    group: 'Health Sciences',
    institutes: [
      'Shri Vaishnav Institute of Paramedical Sciences',
      'Shri Vaishnav Institute of Pharmacy',
      'Shri Vaishnav Institute of Home Science',
    ],
  },
  {
    group: 'Education & Research',
    institutes: [
      'Shri Vaishnav Institute of Education',
      'Faculty of Doctoral Studies & Research',
    ],
  },
]

export const INSTITUTE_OPTIONS: { value: string; label: string }[] = UNIVERSITY_INSTITUTES.flatMap((g) =>
  g.institutes.map((inst) => ({
    value: inst,
    label: `${inst} (${g.group})`,
  }))
)

export const ENTITIES: EntityDef[] = [
  {
    name: 'departments',
    label: 'Departments',
    singular: 'Department',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      {
        name: 'institute',
        label: 'Institute',
        type: 'select',
        required: true,
        options: INSTITUTE_OPTIONS,
      },
    ],
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
      { name: 'code', label: 'Section Code (e.g. BTCS27H)', type: 'text', required: false },
      { name: 'passkey', label: 'Passkey', type: 'text', required: false },
      { name: 'program_id', label: 'Program', type: 'select', reference: 'programs', required: true },
      { name: 'semester', label: 'Semester', type: 'number', required: true },
      { name: 'strength', label: 'Strength', type: 'number', required: true },
      { name: 'batch_count', label: 'Lab Batches', type: 'number', required: false },
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
      {
        name: 'semester',
        label: 'Default Semester (1-8)',
        type: 'select',
        options: [
          { value: '1', label: 'Semester 1' },
          { value: '2', label: 'Semester 2' },
          { value: '3', label: 'Semester 3' },
          { value: '4', label: 'Semester 4' },
          { value: '5', label: 'Semester 5' },
          { value: '6', label: 'Semester 6' },
          { value: '7', label: 'Semester 7' },
          { value: '8', label: 'Semester 8' },
        ],
      },
      { name: 'lectures_per_week', label: 'Lectures / week (L)', type: 'number' },
      { name: 'tutorials_per_week', label: 'Tutorials / week (T)', type: 'number' },
      { name: 'practicals_per_week', label: 'Practicals / week (P)', type: 'number' },
      { name: 'credits', label: 'Credits (C)', type: 'number' },
      { name: 'sessions_per_week', label: 'Sessions / week (Auto/Manual)', type: 'number', required: true },
      { name: 'lab_required', label: 'Lab required', type: 'boolean' },
      { name: 'is_elective', label: 'Elective (scheduled in reserved blocks)', type: 'boolean' },
    ],
  },
  {
    name: 'program_courses',
    label: 'Syllabus Scheme (Program Courses)',
    singular: 'Curriculum Course',
    fields: [
      { name: 'program_id', label: 'Program', type: 'select', reference: 'programs', required: true },
      {
        name: 'semester',
        label: 'Semester (1-8)',
        type: 'select',
        required: true,
        options: [
          { value: '1', label: 'Semester 1' },
          { value: '2', label: 'Semester 2' },
          { value: '3', label: 'Semester 3' },
          { value: '4', label: 'Semester 4' },
          { value: '5', label: 'Semester 5' },
          { value: '6', label: 'Semester 6' },
          { value: '7', label: 'Semester 7' },
          { value: '8', label: 'Semester 8' },
        ],
      },
      { name: 'course_id', label: 'Course', type: 'select', reference: 'courses', required: true },
      { name: 'sessions_per_week', label: 'Sessions / week (blank = course default)', type: 'number' },
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
    orderBy: [
      { column: 'day_of_week', ascending: true },
      { column: 'period', ascending: true },
    ],
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
    orderBy: [{ column: 'key', ascending: true }],
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
