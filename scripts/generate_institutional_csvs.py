import os
import csv
import hashlib

DATA_DIR = os.path.join("data", "institutional")
os.makedirs(DATA_DIR, exist_ok=True)

# -------------------------------------------------------------
# 1. Departments CSV
# -------------------------------------------------------------
departments = [
    {"code": "CSE", "name": "Computer Science & Engineering"},
    {"code": "AIDS", "name": "Artificial Intelligence & Data Science"},
    {"code": "IT", "name": "Information Technology"},
    {"code": "IND", "name": "Industry Integrated Programs (TCS/IBM/Apple)"},
]

with open(os.path.join(DATA_DIR, "departments.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["code", "name"])
    writer.writeheader()
    writer.writerows(departments)

# -------------------------------------------------------------
# 2. Academic Year Shifts CSV
# -------------------------------------------------------------
year_shifts = [
    {"academic_year": 1, "shift": 1, "timing_label": "First Shift (08:15 - 14:45)", "starts_at": "08:15:00", "ends_at": "14:45:00"},
    {"academic_year": 2, "shift": 2, "timing_label": "Second Shift (10:15 - 16:45)", "starts_at": "10:15:00", "ends_at": "16:45:00"},
    {"academic_year": 3, "shift": 2, "timing_label": "Second Shift (10:15 - 16:45)", "starts_at": "10:15:00", "ends_at": "16:45:00"},
    {"academic_year": 4, "shift": 1, "timing_label": "First Shift (08:15 - 14:45)", "starts_at": "08:15:00", "ends_at": "14:45:00"},
]

with open(os.path.join(DATA_DIR, "year_shifts.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["academic_year", "shift", "timing_label", "starts_at", "ends_at"])
    writer.writeheader()
    writer.writerows(year_shifts)

# -------------------------------------------------------------
# 3. Time Slots CSV (40 slots: 5 days x 8 universal periods)
# -------------------------------------------------------------
# Universal Periods:
# 1: 08:15 - 09:15 (Shift 1 Period 1)
# 2: 09:15 - 10:15 (Shift 1 Period 2)
# 3: 10:15 - 11:15 (Shift 1 Period 3 / Shift 2 Period 1)
# 4: 11:15 - 12:15 (Shift 1 Period 4 / Shift 2 Period 2)
# [Lunch: 12:15 - 12:45]
# 5: 12:45 - 13:45 (Shift 1 Period 5 / Shift 2 Period 3)
# 6: 13:45 - 14:45 (Shift 1 Period 6 / Shift 2 Period 4)
# 7: 14:45 - 15:45 (Shift 2 Period 5)
# 8: 15:45 - 16:45 (Shift 2 Period 6)

period_times = [
    (1, "08:15:00", "09:15:00", "shift_1_only"),
    (2, "09:15:00", "10:15:00", "shift_1_only"),
    (3, "10:15:00", "11:15:00", "both_shifts"),
    (4, "11:15:00", "12:15:00", "both_shifts"),
    (5, "12:45:00", "13:45:00", "both_shifts"),
    (6, "13:45:00", "14:45:00", "both_shifts"),
    (7, "14:45:00", "15:45:00", "shift_2_only"),
    (8, "15:45:00", "16:45:00", "shift_2_only"),
]

time_slots = []
for d in range(1, 6):
    for p, s_time, e_time, affinity in period_times:
        time_slots.append({
            "slot_code": f"D{d}P{p}",
            "day_of_week": d,
            "period": p,
            "starts_at": s_time,
            "ends_at": e_time,
            "shift_affinity": affinity,
        })

with open(os.path.join(DATA_DIR, "time_slots.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["slot_code", "day_of_week", "period", "starts_at", "ends_at", "shift_affinity"])
    writer.writeheader()
    writer.writerows(time_slots)

# -------------------------------------------------------------
# 4. Rooms CSV (81 Classrooms + 20 Labs = 101 Rooms)
# -------------------------------------------------------------
rooms = []

# Main Block: 52 classrooms across 3 floors
for floor in (1, 2, 3):
    count = 18 if floor in (1, 2) else 16
    for r in range(1, count + 1):
        r_num = floor * 100 + r
        rooms.append({
            "code": f"MB-{r_num}",
            "name": f"Main Block Room {r_num}",
            "building": "Main Academic Block",
            "room_type": "classroom",
            "capacity": 70,
        })

# ME Block: 8 classrooms (ME-101 to ME-108)
for r in range(1, 9):
    rooms.append({
        "code": f"ME-{100+r}",
        "name": f"Mechanical Block {100+r}",
        "building": "Mechanical Engineering Block",
        "room_type": "classroom",
        "capacity": 70,
    })

# CE Block: 8 classrooms (CE-101 to CE-108)
for r in range(1, 9):
    rooms.append({
        "code": f"CE-{100+r}",
        "name": f"Civil Block {100+r}",
        "building": "Civil Engineering Block",
        "room_type": "classroom",
        "capacity": 70,
    })

# TE Block: 4 classrooms (TE-101 to TE-104)
for r in range(1, 5):
    rooms.append({
        "code": f"TE-{100+r}",
        "name": f"Telecom Block {100+r}",
        "building": "Telecommunication Block",
        "room_type": "classroom",
        "capacity": 70,
    })

# EE Block: 1 classroom (EE-101)
rooms.append({
    "code": "EE-101",
    "name": "Electrical Block 101",
    "building": "Electrical Engineering Block",
    "room_type": "classroom",
    "capacity": 70,
})

# Laboratories: 28 Labs (LAB-01 to LAB-28)
for r in range(1, 29):
    rooms.append({
        "code": f"LAB-{r:02d}",
        "name": f"High-Performance Computing Lab {r:02d}",
        "building": "Central Computing Complex",
        "room_type": "lab",
        "capacity": 35,
    })

with open(os.path.join(DATA_DIR, "rooms.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["code", "name", "building", "room_type", "capacity"])
    writer.writeheader()
    writer.writerows(rooms)

# -------------------------------------------------------------
# 5. Sections CSV (75 Sections)
# -------------------------------------------------------------
# Shifts: Year 1 & 4 -> Shift 1, Year 2 & 3 -> Shift 2
year_to_shift = {1: 1, 2: 2, 3: 2, 4: 1}
year_to_sem = {1: 1, 2: 3, 3: 5, 4: 7}

sections = []

# CSE: Y1: A-H (8), Y2: A-H (8), Y3: A-I (9), Y4: A-J (10) = 35
cse_specs = {
    1: [chr(65+i) for i in range(8)],   # A-H
    2: [chr(65+i) for i in range(8)],   # A-H
    3: [chr(65+i) for i in range(9)],   # A-I
    4: [chr(65+i) for i in range(10)],  # A-J
}
for yr, sec_letters in cse_specs.items():
    for ltr in sec_letters:
        code = f"CSE-Y{yr}-{ltr}"
        h = hashlib.md5(code.encode()).hexdigest()[:6].upper()
        sections.append({
            "code": code,
            "name": f"B.Tech CSE Year {yr} - Sec {ltr}",
            "department_code": "CSE",
            "academic_year": yr,
            "semester": year_to_sem[yr],
            "shift": year_to_shift[yr],
            "strength": 60,
            "batch_count": 2,
            "passkey": f"{ltr}-{h[:4]}",
        })

# AI-DS: 2 sections per year (A, B) = 8
for yr in range(1, 5):
    for ltr in ["A", "B"]:
        code = f"AIDS-Y{yr}-{ltr}"
        h = hashlib.md5(code.encode()).hexdigest()[:6].upper()
        sections.append({
            "code": code,
            "name": f"B.Tech AI-DS Year {yr} - Sec {ltr}",
            "department_code": "AIDS",
            "academic_year": yr,
            "semester": year_to_sem[yr],
            "shift": year_to_shift[yr],
            "strength": 60,
            "batch_count": 2,
            "passkey": f"{ltr}-{h[:4]}",
        })

# IT: 4 sections per year (A, B, C, D) = 16
for yr in range(1, 5):
    for ltr in ["A", "B", "C", "D"]:
        code = f"IT-Y{yr}-{ltr}"
        h = hashlib.md5(code.encode()).hexdigest()[:6].upper()
        sections.append({
            "code": code,
            "name": f"B.Tech IT Year {yr} - Sec {ltr}",
            "department_code": "IT",
            "academic_year": yr,
            "semester": year_to_sem[yr],
            "shift": year_to_shift[yr],
            "strength": 60,
            "batch_count": 2,
            "passkey": f"{ltr}-{h[:4]}",
        })

# Industry Partnerships (TCS: 1/yr, IBM: 2/yr, Apple: 1/yr) = 16
for yr in range(1, 5):
    # TCS: 1 per year
    code = f"TCS-Y{yr}-A"
    h = hashlib.md5(code.encode()).hexdigest()[:6].upper()
    sections.append({
        "code": code,
        "name": f"TCS Enterprise Computing Year {yr}",
        "department_code": "IND",
        "academic_year": yr,
        "semester": year_to_sem[yr],
        "shift": year_to_shift[yr],
        "strength": 60,
        "batch_count": 2,
        "passkey": f"T-{h[:4]}",
    })
    # IBM: 2 per year
    for ltr in ["A", "B"]:
        code = f"IBM-Y{yr}-{ltr}"
        h = hashlib.md5(code.encode()).hexdigest()[:6].upper()
        sections.append({
            "code": code,
            "name": f"IBM Cloud & AI Year {yr} - Sec {ltr}",
            "department_code": "IND",
            "academic_year": yr,
            "semester": year_to_sem[yr],
            "shift": year_to_shift[yr],
            "strength": 60,
            "batch_count": 2,
            "passkey": f"I-{h[:4]}",
        })
    # Apple: 1 per year
    code = f"APPLE-Y{yr}-A"
    h = hashlib.md5(code.encode()).hexdigest()[:6].upper()
    sections.append({
        "code": code,
        "name": f"Apple Systems & Swift Year {yr}",
        "department_code": "IND",
        "academic_year": yr,
        "semester": year_to_sem[yr],
        "shift": year_to_shift[yr],
        "strength": 60,
        "batch_count": 2,
        "passkey": f"A-{h[:4]}",
    })

with open(os.path.join(DATA_DIR, "sections.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "code", "name", "department_code", "academic_year", "semester", "shift", "strength", "batch_count", "passkey"
    ])
    writer.writeheader()
    writer.writerows(sections)

print(f"Generated {len(sections)} sections in sections.csv")

# -------------------------------------------------------------
# 6. Courses CSV (Parsed from actual university degree: docs/Semester course-.txt)
# -------------------------------------------------------------
import re

semesters = {}
cur_sem = None
with open("docs/Semester course-.txt", encoding="utf-8") as f:
    for line in f:
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
                
                # Rule: Course with max credit has at most 4 sessions, min credit has 1 session
                sessions = min(4, max(1, credit))
                
                # Unique code per semester for generic electives
                is_elective = False
                if "gux" in code.lower():
                    code = f"GU-SEM{cur_sem}"
                    name = f"GENERIC ELECTIVE (SEM {cur_sem})"
                    is_elective = True

                # Determine department
                dept = "CSE"
                if code.startswith("BTDSE"):
                    dept = "AIDS"
                elif code.startswith("BTIT"):
                    dept = "IT"

                # Academic year mapping from semester: 1,2 -> 1 | 3,4 -> 2 | 5,6 -> 3 | 7 -> 4
                acad_yr = (cur_sem + 1) // 2

                semesters[cur_sem].append({
                    "code": code,
                    "name": name,
                    "department_code": dept,
                    "academic_year": acad_yr,
                    "semester": cur_sem,
                    "credits": credit,
                    "sessions_per_week": sessions,
                    "lab_required": is_lab,
                    "is_elective": is_elective,
                })

courses = []
for s in sorted(semesters.keys()):
    courses.extend(semesters[s])

with open(os.path.join(DATA_DIR, "courses.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "code", "name", "department_code", "academic_year", "semester", "credits", "sessions_per_week", "lab_required", "is_elective"
    ])
    writer.writeheader()
    writer.writerows(courses)

print(f"Generated {len(courses)} real degree courses in courses.csv")

# -------------------------------------------------------------
# 7. Faculty CSV (120 Faculty Members Proportional to Teaching Load)
# -------------------------------------------------------------
# CSE: 56 faculty | AIDS: 14 faculty | IT: 25 faculty | IND: 25 faculty
faculty = []
first_names = [
    "Aarav", "Aditi", "Amit", "Ananya", "Arjun", "Bhavna", "Chetan", "Dev", "Divya", "Eshan",
    "Fatima", "Gaurav", "Harshit", "Ishita", "Jatin", "Kavita", "Lalit", "Meenakshi", "Nitin", "Omkar",
    "Pooja", "Pranav", "Priya", "Rahul", "Rakesh", "Riya", "Rohan", "Sakshi", "Sameer", "Sanjay",
    "Shreya", "Siddharth", "Sneha", "Tanvi", "Utkarsh", "Varun", "Vikram", "Yash", "Zoya", "Alok",
    "Ashish", "Deepak", "Karan", "Manish", "Mayank", "Naveen", "Nikhil", "Pankaj", "Rajesh", "Sachin",
]
last_names = [
    "Sharma", "Verma", "Gupta", "Malhotra", "Mehta", "Joshi", "Patel", "Shah", "Mishra", "Reddy",
    "Nair", "Iyer", "Chopra", "Bhatia", "Saxena", "Deshmukh", "Kulkarni", "Agrawal", "Trivedi", "Pandey"
]

dept_distribution = ["CSE"] * 56 + ["AIDS"] * 14 + ["IT"] * 25 + ["IND"] * 25
for i in range(1, 121):
    fn = first_names[(i - 1) % len(first_names)]
    ln = last_names[((i - 1) // len(first_names)) % len(last_names)]
    name = f"Dr. {fn} {ln}" if i % 3 == 0 else f"Prof. {fn} {ln}"
    email = f"{fn.lower()}.{ln.lower()}{i}@institute.edu"
    dept = dept_distribution[i - 1]
    faculty.append({
        "faculty_id": f"FAC-{i:03d}",
        "name": name,
        "email": email,
        "department_code": dept,
        "max_weekly_load": 18,
    })

faculty.append({
    "faculty_id": "FAC-ELECTIVE",
    "name": "Cross-Department / Elective Faculty",
    "email": "elective.faculty@institute.edu",
    "department_code": "CSE",
    "max_weekly_load": 999,
})

with open(os.path.join(DATA_DIR, "faculty.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["faculty_id", "name", "email", "department_code", "max_weekly_load"])
    writer.writeheader()
    writer.writerows(faculty)

print(f"Generated {len(faculty)} faculty in faculty.csv")

# -------------------------------------------------------------
# 8. Faculty Qualifications CSV
# -------------------------------------------------------------
# Ensure every core course has 15-20 qualified faculty across primary and allied domains
# Generic electives are taught by cross-department faculty
qualifications = []
for c in courses:
    c_code = c["code"]
    c_dept = c["department_code"]
    same_dept_facs = [f for f in faculty if f["department_code"] == c_dept and f["faculty_id"] != "FAC-ELECTIVE"]
    other_facs = [f for f in faculty if f["department_code"] != c_dept and f["faculty_id"] != "FAC-ELECTIVE"]
    
    chosen = []
    if c["is_elective"]:
        # Generic electives are taught by visiting/cross-department faculty
        chosen = ["FAC-ELECTIVE"]
    else:
        seed = int(hashlib.md5(c_code.encode()).hexdigest(), 16)
        # Pick up to 12 from primary department
        for k in range(min(12, len(same_dept_facs))):
            f_cand = same_dept_facs[(seed + k) % len(same_dept_facs)]
            if f_cand["faculty_id"] not in chosen:
                chosen.append(f_cand["faculty_id"])
        # Pick up to 8 from cross-department pool
        for k in range(min(8, len(other_facs))):
            f_cand = other_facs[(seed + k) % len(other_facs)]
            if f_cand["faculty_id"] not in chosen:
                chosen.append(f_cand["faculty_id"])
    
    for fid in chosen:
        qualifications.append({
            "faculty_id": fid,
            "course_code": c_code,
        })

with open(os.path.join(DATA_DIR, "faculty_qualifications.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["faculty_id", "course_code"])
    writer.writeheader()
    writer.writerows(qualifications)

print(f"Generated {len(qualifications)} qualifications in faculty_qualifications.csv")

# -------------------------------------------------------------
# 9. Section Courses CSV (Curriculum Mapping for Active Semester)
# -------------------------------------------------------------
# Active Session: Odd Semesters (Year 1 -> Sem 1, Year 2 -> Sem 3, Year 3 -> Sem 5, Year 4 -> Sem 7)
year_to_sem = {1: 1, 2: 3, 3: 5, 4: 7}
section_courses = []
for s in sections:
    sec_code = s["code"]
    sec_yr = s["academic_year"]
    active_sem = year_to_sem[sec_yr]
    matching_courses = [c["code"] for c in semesters[active_sem]]
    for c_code in matching_courses:
        section_courses.append({
            "section_code": sec_code,
            "course_code": c_code,
        })

with open(os.path.join(DATA_DIR, "section_courses.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["section_code", "course_code"])
    writer.writeheader()
    writer.writerows(section_courses)

print(f"Generated {len(section_courses)} section-course curriculum mappings in section_courses.csv")
print("All CSV generation complete in data/institutional/")
