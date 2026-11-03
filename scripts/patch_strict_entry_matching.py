import os

filepath = 'frontend/src/pages/StudentView.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

target = """      // Map today's substitutions by exact entry_id, with fallback to (day_of_week, period)
      const subByEntryId = new Map<string, TodaySubstitution>()
      const subBySlot = new Map<string, TodaySubstitution>()
      for (const sub of todaySubs) {
        if (sub.entry_id) subByEntryId.set(sub.entry_id, sub)
        if (sub.day_of_week && sub.period) {
          subBySlot.set(`${sub.day_of_week}-${sub.period}`, sub)
        }
      }

      const gridEntries: GridEntry[] = (data.entries || []).map((e: RawEntry) => {
        // Match substitution by exact entry ID first; fallback to exact (day_of_week, period)
        const sub =
          subByEntryId.get(e.id) ||
          subBySlot.get(`${e.day_of_week}-${e.period}`) ||
          null"""

replacement = """      // Map today's substitutions strictly by exact timetable_entry_id
      // to ensure a substitution ONLY highlights its specific scheduled lecture slot
      const subByEntryId = new Map<string, TodaySubstitution>()
      for (const sub of todaySubs) {
        if (sub.entry_id) subByEntryId.set(sub.entry_id, sub)
      }

      const gridEntries: GridEntry[] = (data.entries || []).map((e: RawEntry) => {
        // Strictly match by exact entry ID
        const sub = subByEntryId.get(e.id) || null"""

content_norm = content.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in content_norm:
    new_content = content_norm.replace(target_norm, replacement_norm)
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_content)
    print("SUCCESSFULLY PATCHED STRICT MATCHING")
else:
    print("TARGET NOT FOUND")

