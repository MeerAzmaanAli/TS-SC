import re

with open("docs/Semester course-.txt", encoding="utf-8") as f:
    text = f.read()

semesters = {}
cur_sem = None
for line in text.splitlines():
    line = line.strip()
    if not line:
        continue
    m_sem = re.search(r"Semester\s+(\d+)", line, re.IGNORECASE)
    if m_sem:
        cur_sem = int(m_sem.group(1))
        semesters[cur_sem] = []
        continue
    if cur_sem is not None:
        if line.lower().startswith("course code"):
            continue
        parts = re.split(r"\t+|\s{2,}", line)
        if len(parts) >= 3:
            code = parts[0].strip()
            name = parts[1].strip()
            credit_str = parts[2].strip()
            try:
                credit = int(credit_str)
            except ValueError:
                credit = 1
            is_lab = "(p)" in code.lower() or "lab" in name.lower() or "practical" in name.lower()
            semesters[cur_sem].append({
                "code": code,
                "name": name,
                "credits": credit,
                "sessions": credit, # lecture sessions decided by credits
                "is_lab": is_lab,
            })

total_courses = 0
for s in sorted(semesters.keys()):
    crs = semesters[s]
    total_courses += len(crs)
    th = [c for c in crs if not c["is_lab"]]
    lb = [c for c in crs if c["is_lab"]]
    print(f"=== Semester {s} ({len(crs)} courses) ===")
    print(f"  Theory: {len(th)} courses, {sum(c['sessions'] for c in th)} sessions/week")
    print(f"  Labs:   {len(lb)} courses, {sum(c['sessions'] for c in lb)} sessions/week (per batch)")
    print(f"  Total distinct class periods needed per week: {sum(c['sessions'] for c in th) + sum(c['sessions'] for c in lb)} periods")
    for c in crs:
        kind = "LAB" if c["is_lab"] else "TH "
        print(f"    [{kind}] {c['code']:<14} {c['name']:<55} Cr:{c['credits']} Sess:{c['sessions']}")

print(f"\nTotal unique courses across all semesters: {total_courses}")

