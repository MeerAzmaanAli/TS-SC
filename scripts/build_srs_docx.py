import os
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    """Set the background color of a table cell."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Set cell padding."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def add_callout_box(doc, text, title="NOTE"):
    """Adds a GitHub-style alert callout box."""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.rows[0].cells[0]
    cell.width = Inches(6.5)
    set_cell_background(cell, "F0F9FF")
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    # Left border styling in XML
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:top w:val="none"/>'
        f'<w:left w:val="single" w:sz="24" w:space="0" w:color="0284C7"/>'
        f'<w:bottom w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'</w:tcBorders>'
    )
    cell._tc.get_or_add_tcPr().append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run_title = p.add_run(f"[{title}] ")
    run_title.bold = True
    run_title.font.color.rgb = RGBColor(2, 132, 199)
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(10)
    
    run_text = p.add_run(text)
    run_text.font.name = "Calibri"
    run_text.font.size = Pt(10)
    run_text.font.color.rgb = RGBColor(30, 41, 59)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def format_table_headers_and_borders(table, col_widths=None):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    # Header row
    for i, cell in enumerate(table.rows[0].cells):
        set_cell_background(cell, "1E3A8A")
        set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.bold = True
                r.font.name = "Calibri"
                r.font.size = Pt(10)
                r.font.color.rgb = RGBColor(255, 255, 255)
    
    # Data rows
    for r_idx, row in enumerate(table.rows[1:], start=1):
        bg = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for cell in row.cells:
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=90, bottom=90, left=140, right=140)
            for p in cell.paragraphs:
                for r in p.runs:
                    r.font.name = "Calibri"
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = RGBColor(31, 41, 55)

    # Borders
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        f'<w:left w:val="none"/>'
        f'<w:bottom w:val="single" w:sz="12" w:space="0" w:color="1E3A8A"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

    if col_widths:
        for row in table.rows:
            for j, w in enumerate(col_widths):
                if j < len(row.cells):
                    row.cells[j].width = Inches(w)

def build_docx():
    doc = Document()
    
    # Page Setup: Standard 1 inch margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
        # Header & Footer setup
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("TS-SC — Software Requirements Specification (SRS v2.0)")
        hrun.font.name = "Calibri"
        hrun.font.size = Pt(8.5)
        hrun.font.color.rgb = RGBColor(148, 163, 184)
        
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        frun = fp.add_run("Approved Architecture Baseline • Confidential")
        frun.font.name = "Calibri"
        frun.font.size = Pt(8.5)
        frun.font.color.rgb = RGBColor(148, 163, 184)

    # ------------------ COVER PAGE ------------------
    cover_space = doc.add_paragraph()
    cover_space.paragraph_format.space_before = Pt(72)
    
    p_tag = doc.add_paragraph()
    r_tag = p_tag.add_run("INSTITUTIONAL ENGINEERING & ACADEMIC SCHEDULING")
    r_tag.font.name = "Calibri"
    r_tag.font.size = Pt(11)
    r_tag.bold = True
    r_tag.font.color.rgb = RGBColor(2, 132, 199)
    p_tag.paragraph_format.space_after = Pt(12)
    
    p_title = doc.add_paragraph()
    r_title = p_title.add_run("Software Requirements Specification (SRS)")
    r_title.font.name = "Arial"
    r_title.font.size = Pt(26)
    r_title.bold = True
    r_title.font.color.rgb = RGBColor(30, 58, 138) # Deep Blue
    p_title.paragraph_format.space_after = Pt(8)
    
    p_sub = doc.add_paragraph()
    r_sub = p_sub.add_run("Smart Classroom & Timetable Scheduler (TS-SC)")
    r_sub.font.name = "Arial"
    r_sub.font.size = Pt(18)
    r_sub.font.color.rgb = RGBColor(71, 85, 105) # Slate
    p_sub.paragraph_format.space_after = Pt(28)
    
    # Metadata card table
    meta_table = doc.add_table(rows=5, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Document Version:", "Version 2.0 (High-Level Architecture & Implementation Baseline)"),
        ("Compliance Standard:", "IEEE Std 830-1998 / ISO/IEC/IEEE 29148 / SEPM Standards"),
        ("Target System:", "Higher Education Institutional Timetabling & Dynamic Substitution"),
        ("Lifecycle Status:", "Approved Baseline — Implemented & Production Tested"),
        ("Publication Date:", "November 2026"),
    ]
    for idx, (label, val) in enumerate(meta_data):
        row = meta_table.rows[idx]
        set_cell_margins(row.cells[0], top=60, bottom=60, left=100, right=100)
        set_cell_margins(row.cells[1], top=60, bottom=60, left=100, right=100)
        set_cell_background(row.cells[0], "F1F5F9")
        set_cell_background(row.cells[1], "F8FAFC")
        
        p0 = row.cells[0].paragraphs[0]
        r0 = p0.add_run(label)
        r0.bold = True
        r0.font.name = "Calibri"
        r0.font.size = Pt(10)
        r0.font.color.rgb = RGBColor(30, 58, 138)
        
        p1 = row.cells[1].paragraphs[0]
        r1 = p1.add_run(val)
        r1.font.name = "Calibri"
        r1.font.size = Pt(10)
        r1.font.color.rgb = RGBColor(31, 41, 55)
        
        row.cells[0].width = Inches(2.2)
        row.cells[1].width = Inches(4.3)
    
    meta_table._tbl.tblPr.append(parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        f'<w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        f'<w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        f'<w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'</w:tblBorders>'
    ))

    doc.add_page_break()

    # ------------------ HELPER FUNCTIONS ------------------
    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(20)
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(16)
        r.bold = True
        r.font.color.rgb = RGBColor(30, 58, 138)
        return p

    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(13)
        r.bold = True
        r.font.color.rgb = RGBColor(2, 132, 199)
        return p

    def add_h3(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(11)
        r.bold = True
        r.font.color.rgb = RGBColor(51, 65, 85)
        return p

    def add_p(text, bold_prefix=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            rb = p.add_run(bold_prefix)
            rb.bold = True
            rb.font.name = "Calibri"
            rb.font.size = Pt(10.5)
            rb.font.color.rgb = RGBColor(31, 41, 55)
        r = p.add_run(text)
        r.font.name = "Calibri"
        r.font.size = Pt(10.5)
        r.font.color.rgb = RGBColor(31, 41, 55)
        return p

    def add_bullet(text, bold_prefix=None):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            rb = p.add_run(bold_prefix)
            rb.bold = True
            rb.font.name = "Calibri"
            rb.font.size = Pt(10)
            rb.font.color.rgb = RGBColor(31, 41, 55)
        r = p.add_run(text)
        r.font.name = "Calibri"
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(31, 41, 55)
        return p

    def add_diagram_image(image_path, title, figure_num, max_width=6.2):
        if os.path.exists(image_path):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.keep_with_next = True
            run = p.add_run()
            run.add_picture(image_path, width=Inches(max_width))
            
            p_cap = doc.add_paragraph()
            p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_cap.paragraph_format.space_after = Pt(12)
            rcap_bold = p_cap.add_run(f"Figure {figure_num}: ")
            rcap_bold.bold = True
            rcap_bold.font.name = "Calibri"
            rcap_bold.font.size = Pt(9.5)
            rcap_bold.font.color.rgb = RGBColor(71, 85, 105)
            rcap_text = p_cap.add_run(title)
            rcap_text.italic = True
            rcap_text.font.name = "Calibri"
            rcap_text.font.size = Pt(9.5)
            rcap_text.font.color.rgb = RGBColor(71, 85, 105)

    # ------------------ SECTION 1 ------------------
    add_h1("1. Introduction")
    
    add_h2("1.1 Purpose")
    add_p("This Software Requirements Specification (SRS) document details the high-level functional, non-functional, interface, and behavioral requirements for the Smart Classroom & Timetable Scheduler (TS-SC) platform. It reflects the production architecture following iterative development cycles, documenting both initial design requirements and the subsequent architectural shifts (pivots) implemented to enhance privacy, performance, deployment consolidation, and security.")
    
    add_h2("1.2 Scope")
    add_p("TS-SC is an automated institutional timetable generation, resource allocation, and dynamic faculty substitution engine designed for higher education institutions (specifically modeled on university departments such as SVVV Indore). The system:")
    add_bullet(" Constraint programming (Google OR-Tools CP-SAT) formulates decision variables to generate complete, conflict-free academic schedules across faculty, sections, and physical rooms.", "Automated Timetable Generation:")
    add_bullet(" When an academic configuration cannot be scheduled due to physical or load limitations, iterative constraint relaxation pinpoints the exact structural cause of failure instead of failing silently.", "Infeasibility Explainability:")
    add_bullet(" Same-day substitution requests trigger candidate identification, multi-attribute compatibility scoring (P1 > P2 > P3), load balancing, and timeout handling.", "Dynamic Faculty Substitution:")
    add_bullet(" Students access schedules using Section Codes and Coordinator Passkeys via an encapsulated PostgreSQL RPC, ensuring zero personally identifiable data is stored.", "Zero-Account Student Privacy:")
    add_bullet(" Faculty sign-in and administrative tools are secured with strict Row-Level Security policies and discrete, obscured login discovery.", "Role-Hardened Security:")

    add_h2("1.3 Definitions, Acronyms, and Abbreviations")
    def_table = doc.add_table(rows=1, cols=2)
    def_table.rows[0].cells[0].paragraphs[0].text = "Term / Acronym"
    def_table.rows[0].cells[1].paragraphs[0].text = "Definition"
    definitions = [
        ("CP-SAT", "Constraint Programming - Boolean Satisfiability Solver (Google OR-Tools)."),
        ("RLS", "Row-Level Security in PostgreSQL, enforcing authorization policies at the database engine level."),
        ("RPC", "Remote Procedure Call (SECURITY DEFINER stored functions executing with elevated database privileges)."),
        ("BaaS", "Backend-as-a-Service (Supabase: PostgreSQL, Auth, Storage, Realtime)."),
        ("SEPM", "Software Engineering and Project Management."),
        ("Passkey", "Cryptographically distinct, human-readable section credential (e.g., H-7216) distributed offline."),
        ("Priority Tiers", "Ranking for faculty substitution: P1 (Same section & free), P2 (Same course qualification & free), P3 (Free faculty in department)."),
        ("Temporal Rule", "Constraint permitting substitution requests exclusively on the day of the lecture, prior to the lecture start time."),
    ]
    for term, definition in definitions:
        row = def_table.add_row()
        row.cells[0].paragraphs[0].text = term
        row.cells[1].paragraphs[0].text = definition
    format_table_headers_and_borders(def_table, col_widths=[1.8, 4.7])

    # ------------------ SECTION 2 ------------------
    add_h1("2. Overall Description & Architectural Evolution")
    
    add_h2("2.1 Architectural Pivot Log")
    add_p("During system development and deployment testing, critical operational, infrastructural, and privacy constraints prompted key architectural revisions away from the legacy specification:")
    
    pivot_table = doc.add_table(rows=1, cols=3)
    pivot_table.rows[0].cells[0].paragraphs[0].text = "Feature / Subsystem"
    pivot_table.rows[0].cells[1].paragraphs[0].text = "Legacy SRS Design (v1.0)"
    pivot_table.rows[0].cells[2].paragraphs[0].text = "Revised Production Architecture (v2.0)"
    
    pivots = [
        ("Student Account Model", "Individual Supabase Auth accounts (email/password), profiles table with student role.", "Zero-Account Passkey Access: Students store no PII. Access via Section Code + Passkey RPC."),
        ("Administrative Login Discovery", "Prominent Admin tab on public login landing page.", "Security by Obscurity: Public login shows Student & Faculty. Admin gated in muted footer trigger to block probes."),
        ("Microservice Hosting & Solver Gateway", "External PaaS (Render / Fly.io) subject to cold starts (1-2m) and distributed domains.", "Vercel Multi-Service: Vite + FastAPI Gateway + internal CP-SAT Solver via private IPC service bindings."),
        ("Timetable Color Model for Substitutions", "Binary scheduled/free lecture state.", "Real-Time Trinary Color States: Yellow (pending), Green (assigned), Red (expired/unfilled)."),
        ("Substitution Timing Constraints", "Arbitrary advance scheduling permitted.", "Strict Day-Of Temporal Guard: Requests valid only on lecture day before lecture starts."),
    ]
    for feat, legacy, revised in pivots:
        row = pivot_table.add_row()
        row.cells[0].paragraphs[0].text = feat
        row.cells[1].paragraphs[0].text = legacy
        row.cells[2].paragraphs[0].text = revised
    format_table_headers_and_borders(pivot_table, col_widths=[1.5, 2.5, 2.5])

    add_h2("2.2 User Classes & Personas")
    add_bullet(" Academic Registrar / Timetable Coordinator. Configures academic resources (rooms, programs, courses, faculty), executes the CP-SAT solver, reviews soft-constraint conflicts, manages section passkeys, and publishes official versions.", "System Administrator:")
    add_bullet(" Authenticated faculty profile. Views weekly timetable, initiates same-day substitution requests, accepts/declines incoming substitution requests, and monitors personal workload.", "Faculty Member:")
    add_bullet(" Unauthenticated student or coordinator. Views live published section schedules via Section Code and Passkey, toggles laboratory batch filters (Batch 1 / Batch 2), and tracks real-time substitution highlights.", "Student / Class Coordinator:")
    add_bullet(" Automated worker services executing mathematical optimization, candidate scoring, and proxy routing.", "Internal Microservices (Solver & API Gateway):")

    # ------------------ SECTION 3 ------------------
    add_h1("3. System Features & Functional Requirements")
    
    add_h2("3.1 Module 1: Institutional Resource Management")
    add_bullet("The system shall allow administrators to manage rooms with physical capacities and room types (classroom, lab, seminar_hall).", "F-REQ-1.1 (Room Management): ")
    add_bullet("The system shall maintain course catalogs specifying credits, weekly session frequency, continuous session duration, and laboratory prerequisites.", "F-REQ-1.2 (Course Catalogs): ")
    add_bullet("The system shall enforce faculty-course qualification mappings, preventing faculty from being scheduled for unqualified subjects.", "F-REQ-1.3 (Faculty Qualifications): ")
    add_bullet("The system shall support section partitioning into multiple lab batches (Batch 1 and Batch 2) for concurrent laboratory scheduling.", "F-REQ-1.4 (Section & Batch Partitioning): ")
    add_bullet("The system shall allow definition of exclusive elective slot-blocks where core courses cannot be scheduled.", "F-REQ-1.5 (Elective Slot Blocks): ")

    add_h2("3.2 Module 2: Automated Timetable Generation & CP-SAT Engine")
    add_bullet("No room, faculty member, or student section shall be assigned to more than one session in any given time slot.", "F-REQ-2.1 (Hard Constraint - Resource Singularity): ")
    add_bullet("Laboratory courses must be assigned to laboratory rooms; room capacity must be >= section strength (or batch strength for practicals).", "F-REQ-2.2 (Hard Constraint - Capacity & Type Match): ")
    add_bullet("Weekly scheduled hours for each faculty member shall not exceed their configured maximum weekly load.", "F-REQ-2.3 (Hard Constraint - Workload Limit): ")
    add_bullet("The optimization model shall penalize single-period idle gaps in student daily schedules.", "F-REQ-2.4 (Soft Constraint - Gap Minimization): ")
    add_bullet("Sessions of the same multi-credit course shall be evenly distributed across distinct days of the academic week.", "F-REQ-2.5 (Soft Constraint - Daily Spread): ")
    add_bullet("When constraints are mathematically irreconcilable, the solver shall execute iterative constraint relaxation (loads, rooms, qualifications, electives) and output the exact structural cause of failure.", "F-REQ-2.6 (Infeasibility Diagnostics): ")

    add_h2("3.3 Module 3: Dynamic Same-Day Faculty Substitution Engine")
    add_bullet("Faculty can request substitutions only on the same calendar day as the scheduled lecture and prior to the slot's start time.", "F-REQ-3.1 (Temporal Enforcement): ")
    add_bullet("When a request is created, candidate faculty are ranked by Priority 1 (teaching same section), Priority 2 (qualified for course), and Priority 3 (department free faculty), tie-broken by lowest weekly load and earliest response.", "F-REQ-3.2 (Algorithmic Priority Ranking): ")
    add_bullet("The request transitions across Open, Assigned, or Expired (if unfulfilled 10 minutes post lecture start, marking lecture free).", "F-REQ-3.3 (State Transitions & Timeout): ")
    add_bullet("Declining or failing to respond to a substitution request shall log an administrative penalty record.", "F-REQ-3.4 (Penalty Tracking): ")

    add_h2("3.4 Module 4: Zero-Account Student Passkey Access")
    add_bullet("The system shall strictly prohibit storing student identities, names, or email accounts in the database.", "F-REQ-4.1 (Privacy Preservation): ")
    add_bullet("Timetable data for students shall only be accessible through the PostgreSQL SECURITY DEFINER function get_section_timetable(p_code, p_passkey).", "F-REQ-4.2 (Cryptographic RPC Verification): ")
    add_bullet("The student timetable grid shall visually indicate substitutions: Yellow for pending, Green for assigned substitute, and Red for expired/free period.", "F-REQ-4.3 (Live Slot Highlighting): ")
    add_bullet("Students shall be able to filter practical lab sessions by Batch 1, Batch 2, or All Batches directly in the user interface.", "F-REQ-4.4 (Batch Filtering): ")

    add_h2("3.5 Module 5: Secure Authentication & Discovery Boundary")
    add_bullet("Default authentication route (/login) shall display only Student Passkey Access and Faculty Sign-In.", "F-REQ-5.1 (Public Login Boundary): ")
    add_bullet("Administrative login credentials and input forms shall remain hidden behind a discrete, unstyled trigger to minimize exposure to automated vulnerability crawlers.", "F-REQ-5.2 (Obfuscated Admin Entry): ")

    # ------------------ SECTION 4 ------------------
    add_h1("4. External Interface & Architectural Requirements")
    add_p("The TS-SC platform is deployed as a consolidated Vercel Project containing three distinct services interacting via internal service bindings:")
    add_bullet("Single-Page Application deployed on Vercel's Edge CDN, routing all public UI traffic from /(.*). Communicates directly with Supabase via Supabase JS SDK.", "Service 'frontend' (Vite + React + TypeScript): ")
    add_bullet("FastAPI public reverse proxy exposed at /api/(.*), forwarding requests securely to the solver.", "Service 'api' (FastAPI Public Gateway): ")
    add_bullet("FastAPI microservice executing Google OR-Tools CP-SAT algorithms, kept completely internal without direct public internet exposure. Receives requests via Vercel service binding SOLVER_URL.", "Service 'solver' (Internal Optimization Worker): ")
    add_bullet("PostgreSQL 15 database hosted on Supabase Cloud, utilizing Row-Level Security (RLS) for faculty data isolation and stored procedure RPCs for student access.", "Database & BaaS Tier (Supabase Cloud): ")

    add_callout_box(
        doc,
        "Vercel service bindings resolve dynamically in serverless functions at runtime without exposing the internal solver service to the public internet.",
        "ARCHITECTURE NOTE"
    )

    # ------------------ SECTION 5 ------------------
    doc.add_page_break()
    add_h1("5. Conceptual Models & UML Diagrams (SEPM Standards)")
    add_p("This section contains standard UML 2.5 conceptual models representing the system boundary, domain entity relationships, dynamic interactions, behavioral state machines, and deployment layout.")

    add_h2("5.1 UML Use Case Diagram")
    add_p("Defines the interactions between human/automated actors and core system use cases within the institutional scheduling boundary.")
    add_diagram_image("docs/diagrams/diagram_1.png", "UML Use Case Diagram — Actors, Use Cases, «include» & «extend» Dependencies", 1, max_width=6.0)

    add_h2("5.2 UML Class Diagram")
    add_p("Models domain entities, structural properties, visibility, data types, operations, and multiplicity associations.")
    add_diagram_image("docs/diagrams/diagram_2.png", "UML Class Diagram — Institutional Entities, Scheduling Relations, and Cardinality", 2, max_width=6.2)

    doc.add_page_break()
    add_h2("5.3 UML Sequence Diagram: Timetable Generation & Infeasibility Analysis")
    add_p("Details the dynamic message interchange during mathematical optimization, including conflict relaxation diagnostics.")
    add_diagram_image("docs/diagrams/diagram_3.png", "UML Sequence Diagram — Automated Generation & Constraint Relaxation Diagnostics", 3, max_width=6.2)

    add_h2("5.4 UML Sequence Diagram: Priority-Based Faculty Substitution Lifecycle")
    add_p("Captures the same-day request submission, temporal validation, candidate ranking, and state resolution sequence.")
    add_diagram_image("docs/diagrams/diagram_4.png", "UML Sequence Diagram — Substitution Ranking Engine & State Confirmation", 4, max_width=6.2)

    doc.add_page_break()
    add_h2("5.5 UML Activity Diagram: Substitution Request Evaluation Workflow")
    add_p("Illustrates control flow, decision branches, timeout guards, and UI color transformations.")
    add_diagram_image("docs/diagrams/diagram_5.png", "UML Activity Diagram — Decision Logic, Deadlines, and Visual Slot Updates", 5, max_width=6.0)

    add_h2("5.6 UML State Machine Diagram: Substitution Entity Lifecycle")
    add_p("Specifies entity states and trigger transitions for SubstitutionRequest entities from creation through terminal resolution.")
    add_diagram_image("docs/diagrams/diagram_6.png", "UML State Machine Diagram — Substitution Request Lifecycle & Trinary UI Colors", 6, max_width=5.8)

    doc.add_page_break()
    add_h2("5.7 UML Deployment Diagram: Consolidated Vercel Multi-Service Architecture")
    add_p("Maps physical and virtual execution containers, internal service bindings, and external BaaS infrastructure.")
    add_diagram_image("docs/diagrams/diagram_7.png", "UML Deployment Diagram — Multi-Service Topography & Supabase Cloud", 7, max_width=6.2)

    # ------------------ SECTION 6 ------------------
    add_h1("6. Non-Functional Requirements (NFR)")
    add_bullet("The CP-SAT engine shall solve standard department workloads (<= 60 sections, <= 500 weekly course sessions) within 120 seconds.", "NFR-P1 (Timetable Solving Latency): ")
    add_bullet("Student section timetable queries via the get_section_timetable RPC shall return within 300 milliseconds under standard network conditions.", "NFR-P2 (RPC Query Latency): ")
    add_bullet("Incremental production build duration for the frontend on Vercel shall not exceed 15 seconds.", "NFR-P3 (Vite Cold Build Time): ")
    add_bullet("No personal identifiable information (PII) such as student enrollment IDs, names, or contact data shall be stored in any database table.", "NFR-S1 (Zero-Trust Student Privacy): ")
    add_bullet("Student schedule retrieval must execute under a SECURITY DEFINER stored function that isolates access solely to verified section codes and matching passkeys.", "NFR-S2 (RPC Encapsulation): ")
    add_bullet("The administrative authentication mechanism must remain unindexed and hidden behind an opaque trigger to eliminate automated dictionary attack vectors.", "NFR-S3 (Admin Route Obfuscation): ")
    add_bullet("Deployment on Vercel services with multi-service binding shall eliminate the 1-2 minute inactive spin-up latency characteristic of legacy free-tier PaaS providers.", "NFR-R1 (Zero Cold Starts): ")
    add_bullet("The timetable solver shall never fail silently; when an infeasible state occurs, a diagnostic relaxation breakdown shall identify the violating constraint group.", "NFR-R2 (Explainable Infeasibility): ")

    # ------------------ SECTION 7 ------------------
    add_h1("7. Requirements Traceability Matrix (RTM)")
    add_p("The Requirements Traceability Matrix correlates functional requirements, components, UML models, verification methods, and implementation status:")
    
    rtm_table = doc.add_table(rows=1, cols=5)
    rtm_headers = ["Requirement ID", "Module / Component", "UML Artifact Reference", "Verification Method", "Status"]
    for j, h in enumerate(rtm_headers):
        rtm_table.rows[0].cells[j].paragraphs[0].text = h
        
    rtm_rows = [
        ("F-REQ-1.1 – 1.5", "Resource Management", "Figure 2 (Class Diagram)", "Integration Test", "Implemented"),
        ("F-REQ-2.1 – 2.3", "CP-SAT Hard Constraints", "Figure 2 & 3 (Sequence Diagram)", "Solver Unit Test", "Implemented"),
        ("F-REQ-2.4 – 2.5", "Soft Optimization (Gaps/Spread)", "Figure 3 (Sequence Diagram)", "Benchmarking Suite", "Implemented"),
        ("F-REQ-2.6", "Infeasibility Diagnostics", "Figure 3 (Sequence Diagram)", "Diagnostic Test", "Implemented"),
        ("F-REQ-3.1", "Day-Of Temporal Guard", "Figure 4 & 5 (Activity Diagram)", "Unit Test (getLectureTemporalStatus)", "Implemented"),
        ("F-REQ-3.2", "Algorithmic P1/P2/P3 Ranking", "Figure 2 & 5 (Activity Diagram)", "Ranking Test Suite", "Implemented"),
        ("F-REQ-3.3", "Real-Time Substitution States", "Figure 5 & 6 (State Machine)", "UI Integration Test", "Implemented"),
        ("F-REQ-4.1 – 4.2", "Zero-Account Passkey Access", "Figure 1 (Use Case) & Figure 7", "Security Penetration Audit", "Implemented"),
        ("F-REQ-4.3", "Color-Coded Timetable Grid", "Figure 6 (State Machine)", "UI Snapshot Test", "Implemented"),
        ("F-REQ-5.1 – 5.2", "Obfuscated Administrative Login", "Figure 1 (Use Case) & Figure 7", "Vulnerability Scan", "Implemented"),
        ("NFR-R1", "Vercel Multi-Service Binding", "Figure 7 (Deployment Diagram)", "End-to-End Latency Probe", "Implemented"),
    ]
    for r in rtm_rows:
        row = rtm_table.add_row()
        for j, val in enumerate(r):
            row.cells[j].paragraphs[0].text = val
    format_table_headers_and_borders(rtm_table, col_widths=[1.2, 1.4, 1.6, 1.3, 1.0])

    # Save Document
    out_path = "docs/TS-SC_SRS_v2.0.docx"
    doc.save(out_path)
    print(f"SUCCESS: Document created at {out_path} (Size: {os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    build_docx()

