# SMART CLASSROOM & TIMETABLE SCHEDULER (TS-SC)
## Automated Constraint-Satisfaction Timetabling, Infeasibility Diagnostics, and Real-Time Dynamic Faculty Substitution Engine
### Major Project Report — Bachelor of Technology in Computer Science & Engineering
**Institution:** Shri Vaishnav Institute of Information Technology (SVIIT), Shri Vaishnav Vidyapeeth Vishwavidyalaya (SVVV), Indore  
**Department:** Department of Computer Science & Engineering  
**Academic Session:** July – December 2026  
**Author:** Meer Azmaan Ali [Enrollment / Roll No.] & Team  
**Mentor & Guide:** [Project Guide Name], Assistant Professor, Dept. of CSE  
**Project Coordinator:** Mr. Neeraj Arya, Project Coordinator, CSE  
**Head of Department:** Dr. Jigyasu Dubey, Professor & Head, CSE, SVIIT  
**Director:** Dr. Anand Rajavat, Rector & Dean Academic, Director, SVIIT  

---

## DECLARATION
We hereby declare that the work presented in this major project entitled **"Smart Classroom & Timetable Scheduler (TS-SC)"** in partial fulfillment of the requirements for the award of the degree of **Bachelor of Technology in Computer Science & Engineering** from Shri Vaishnav Institute of Information Technology affiliated to Shri Vaishnav Vidyapeeth Vishwavidyalaya, Indore, is an authentic record of our own research and software engineering work carried out under the guidance of our mentor. The matter embodied in this report has not been submitted for the award of any other degree or diploma.

---

## ABSTRACT
The University Course Timetabling Problem (UCTP) is an NP-hard combinatorial optimization challenge characterized by factorial search space growth ($O(N!)$). In collegiate institutions such as engineering colleges, manual scheduling routinely results in faculty workload violations, classroom collisions, and severe operational disruption during unplanned same-day faculty absences. This project presents the **Smart Classroom & Timetable Scheduler (TS-SC)**, a comprehensive academic automation platform featuring a constraint satisfaction timetabling engine and a dynamic real-time faculty substitution coordinator.

Powered by Google OR-Tools CP-SAT, the mathematical engine formulates Boolean decision variables across faculty, rooms, batches, and multi-shift timing boundaries. Tested on actual university scale datasets comprising **75 sections, 101 classrooms, 100 faculty members, and 1,350 weekly sessions**, TS-SC successfully solves the complete university schedule in **18.03 seconds** with zero constraint violations. When configurations are physically impossible, an automated relaxation diagnostic module pinpoints the exact cause of infeasibility. Furthermore, an automated multi-tier priority substitution engine (P1/P2/P3) resolves unplanned instructor absences in real time, synchronizing live schedule updates across responsive web portals without requiring student accounts.

---

## TABLE OF CONTENTS
1. [CHAPTER 1: INTRODUCTION](#chapter-1-introduction)
   - 1.1 Project Overview & Background
   - 1.2 Problem Statement
   - 1.3 Need for the Proper System
   - 1.4 Objectives (Guide-Approved Core vs Extended Scope)
   - 1.5 Modules of the System
   - 1.6 Scope & Boundary Conditions
2. [CHAPTER 2: LITERATURE SURVEY](#chapter-2-literature-survey)
   - 2.1 Review of Existing Academic Scheduling Systems
   - 2.2 Proposed System & Technological Differentiation
   - 2.3 Feasibility Study (Technical, Economic, Operational)
3. [CHAPTER 3: REQUIREMENTS ANALYSIS](#chapter-3-requirements-analysis)
   - 3.1 Requirement Elicitation Methodology
   - 3.2 Data Requirements & Constraint Taxonomy
   - 3.3 Functional Requirements Specification
   - 3.4 Non-Functional Requirements Specification
   - 3.5 System Specifications (Hardware & Software)
4. [CHAPTER 4: SYSTEM DESIGN](#chapter-4-system-design)
   - 4.1 Software Requirements Specification & Glossary
   - 4.2 Use Case Model & Actor Specifications
   - 4.3 Conceptual Class Diagram
   - 4.4 Data Flow Diagrams (Level 0, Level 1, Level 2)
   - 4.5 Database Design & Relational Schema
5. [CHAPTER 5: SYSTEM MODELING & TESTING](#chapter-5-system-modeling--testing)
   - 5.1 Detailed System Class Architecture
   - 5.2 Interaction & Sequence Diagrams
   - 5.3 State Machine Modeling
   - 5.4 Deployment Architecture & Topography
   - 5.5 Testing & Empirical Verification (Pytest Suite & 75-Section Benchmarks)
6. [CHAPTER 6: CONCLUSION & FUTURE WORK](#chapter-6-conclusion--future-work)
   - 6.1 Project Summary & Major Achievements
   - 6.2 Limitations Encountered
   - 6.3 Future Enhancements & Roadmap
7. [CHAPTER 7: BIBLIOGRAPHY & SYSTEM SNAPSHOTS](#chapter-7-bibliography--system-snapshots)
   - 7.1 Reference Books & Textbooks
   - 7.2 Research Publications & Technical Documentation
   - 7.3 System Snapshots & Interface Walkthrough

---

# CHAPTER 1: INTRODUCTION

### 1.1 Project Overview & Background
Higher educational institutions operate within complex resource ecosystems comprising diverse academic departments, multi-tier curricula, distributed physical classroom infrastructures, specialized computing and engineering laboratories, and hundreds of teaching faculty. Within this operating environment, the generation and maintenance of academic schedules—collectively known as the University Course Timetabling Problem (UCTP)—constitutes one of the most operationally critical yet mathematically demanding administrative responsibilities.

Timetabling is categorized in computational complexity theory as an NP-hard combinatorial optimization challenge characterized by factorial search space expansion. When scheduling dozens of student sections across multiple academic years, programs, and shifts, human schedulers face an overwhelming web of hard constraints alongside soft pedagogical constraints. Even more disruptive is the operational reality of day-to-day academic execution: unforeseen faculty leaves induce severe administrative bottlenecks.

The Smart Classroom & Timetable Scheduler (TS-SC) was developed to directly address these systemic vulnerabilities by combining automated mathematical constraint programming via Boolean satisfiability (Google OR-Tools CP-SAT) with a reactive, event-driven real-time faculty substitution engine.

### 1.2 Problem Statement
- **Manual Scheduling Fallibility:** Coordinators spend weeks assembling spreadsheets that inevitably contain faculty double-bookings or laboratory clashes.
- **Computational Infeasibility Opacity:** When configurations are mathematically over-constrained, legacy solvers crash or report generic "INFEASIBLE" errors without identifying the structural cause.
- **Chaotic Same-Day Substitution Workflows:** Unplanned leaves rely on informal WhatsApp messaging or verbal requests, leading to unannounced class cancellations and unfair substitution loads.
- **Student Privacy & Authentication Friction:** Forcing 4,500+ students to maintain database credentials leads to password fatigue and privacy risks.

### 1.3 Need for the Proper System
An intelligent, institutional-grade academic scheduling platform is urgently required to replace brittle, fragmented workflows with an integrated, mathematically rigorous software infrastructure. The required system must satisfy three fundamental operational mandates:
1. **Algorithmic Precision:** Deterministically eliminate schedule clashes prior to semester commencement.
2. **Operational Resilience:** Automate same-day substitution matching, prioritization, and live timeline broadcasting.
3. **Frictionless Accessibility:** Eliminate login barriers for students via lightweight passkey verification.

### 1.4 Project Objectives: Baseline Scope vs. Extended Innovations
#### Core Approved Scope (Finalized with Project Guide):
1. **Automated Timetable Generation Engine:** Mathematical optimization formulation of the UCTP using constraint programming (Google OR-Tools CP-SAT) to schedule sections, courses, rooms, and faculty without collisions.
2. **Real-Time Faculty Substitution Timeline:** Implementation of a dynamic same-day substitution workflow allowing absent instructors to request coverage, matching eligible candidates, and maintaining a live administrative timeline of adjustments.

#### Extended System Innovations (Implemented Beyond Baseline):
1. **Explainable Infeasibility Diagnostic Engine:** Hierarchical constraint relaxation isolates and explains physical room or faculty load bottlenecks in plain English.
2. **Zero-Account Student Passkey Privacy (GDPR-Compliant):** Section Code and 6-character Passkeys verified via PostgreSQL `SECURITY DEFINER` RPCs eliminate student user account management.
3. **Institutional 360° Search Engine:** Unified cross-entity discovery across faculty, courses, sections, and classroom allocations.
4. **Automated Fair-Load Substitution & Penalty Accounting:** Real-time substitution ledger tracking credits and penalties to maintain departmental equity.
5. **Multi-Shift Institutional Timing Support:** Dynamic scheduling across morning (Shift 1: 08:30–13:10) and afternoon (Shift 2: 10:30–16:15) shifts.
6. **Responsive 60-30-10 Mobile Web Application:** Touch-optimized UI with horizontal swipe navigation and PDF matrix print exports.

---

# CHAPTER 2: LITERATURE SURVEY
### 2.1 Review of Existing Systems
- **Manual Spreadsheets (Excel):** Flexible but mathematically error-prone ($O(N!)$ complexity).
- **Genetic Algorithms (FET / TimeTabler):** Heuristic and non-deterministic; lacks mathematical proof of infeasibility.
- **Ad-Hoc Messaging (WhatsApp):** Unstructured, unrecorded, and disconnected from the official schedule.
- **Commercial Academic ERPs:** Prohibitively expensive (INR 10,00,000+), inflexible, and lacking dynamic same-day mathematical substitution matching.

### 2.2 Proposed System
TS-SC formulates timetabling as a Boolean Satisfiability (SAT) constraint model solved using Google OR-Tools CP-SAT, proving mathematical optimality in under 20 seconds for university-scale datasets. Coupled with a 3-tier pedagogical substitution matching engine (P1/P2/P3) and zero-account passkey distribution, it provides a comprehensive end-to-end institutional solution.

### 2.3 Feasibility Study
- **Technical Feasibility:** Proven open-source stack: Google OR-Tools CP-SAT, React 18, TypeScript, PostgreSQL RLS, WebSockets.
- **Economic Feasibility:** 100% open-source permissive licensing (INR 0.00 licensing cost).
- **Operational Feasibility:** Frictionless adoption: zero student accounts, 2-click faculty substitution requests, intuitive admin calendar matrices.

---

# CHAPTER 3: REQUIREMENTS ANALYSIS
### 3.1 Data Requirements & Constraint Taxonomy
- **Hard Constraints (Must Never Be Violated):**
  - HC-01 (Room No-Clash): No room double-booking.
  - HC-02 (Faculty No-Clash): No instructor double-booking.
  - HC-03 (Section No-Clash): No student section double-booking.
  - HC-04 (Batch Parallelism): Concurrent lab batch allocations.
  - HC-05 (Faculty Max Load): Weekly teaching load capped at contractual maximums (typically 24 hours/week).
  - HC-06 (Shift Confinement): Sessions restricted to designated shift hours.
- **Soft Constraints (Optimization Targets):**
  - SC-01 (Load Balancing): Even distribution across weekdays.
  - SC-02 (Faculty Continuity): Section-course instructor consistency.
  - SC-03 (Consecutive Lecture Limits): Maximum 3 consecutive lecture hours.

### 3.2 Functional Requirements (Summary)
- FR-01: Resource master configuration.
- FR-02: Automated CP-SAT timetable generation.
- FR-03: Explainable infeasibility diagnostics.
- FR-04: Dynamic same-day substitution matching.
- FR-05: Zero-account student passkey verification.
- FR-06: Institutional 360° cross-entity search.
- FR-07: Fair-load substitution penalty accounting.
- FR-08: Real-time event sync via WebSockets.

---

# CHAPTER 4: SYSTEM DESIGN
### 4.1 UML Use Case Model
The system orchestrates interactions between the Institutional Administrator, Teaching Faculty, Student, and Microservices:
- **Admin:** Configures resources, executes solver, reviews conflicts, manages passkeys, force-assigns substitutions.
- **Faculty:** Views personal calendar, requests same-day coverage, accepts/declines incoming invitations.
- **Student:** Enters Section Code + Passkey, views live schedule, toggles lab batches.

*(See diagrams/diagram_1.png for full Use Case Model)*

### 4.2 Conceptual Class Diagram
Entities: Department, Room, AcademicShift, Faculty, Course, Section, TimetableEntry, SubstitutionRequest, PenaltyRecord.
*(See diagrams/diagram_2.png for full Entity Class Diagram)*

### 4.3 Data Flow Diagrams
- **DFD Level 0 (Context):** External entities exchanging inputs/outputs with TS-SC boundary.
- **DFD Level 1 (Subsystems):** Decomposition into Resource Management, Solver Engine, Substitution Coordinator, and Passkey Gateway.
- **DFD Level 2 (Substitution):** Temporal verification, candidate pool generation, WebSocket dispatch, and database state transitions.

### 4.4 Database Design & Relational Schema
PostgreSQL 15 schema featuring strict foreign key cascades, unique compound indexes (preventing duplicate time slot allocations), and Row-Level Security policies.

---

# CHAPTER 5: SYSTEM MODELING & TESTING
### 5.1 Sequence & Interaction Modeling
- **Figure 5.1 (Timetable Generation & Infeasibility Analysis):** Illustrates asynchronous solver invocation and hierarchical relaxation cycle upon constraint failure. *(See diagrams/diagram_3.png)*
- **Figure 5.2 (Faculty Substitution Lifecycle):** Illustrates leave request, candidate filtering, WebSocket invitation, and slot reassignment. *(See diagrams/diagram_4.png)*
- **Figure 5.3 (Substitution Request State Machine):** [PENDING] -> [CANDIDATES_DISPATCHED] -> [ACCEPTED] -> [ASSIGNED] or [EXPIRED]. *(See diagrams/diagram_6.png)*
- **Figure 5.4 (Deployment Architecture):** Multi-service topography on Vercel and Supabase. *(See diagrams/diagram_7.png)*

### 5.2 Empirical Testing & Verification
#### Automated Unit Tests (Pytest):
All 16 automated solver tests passed in 4.82s:
- `test_feasible_timetable` (PASSED)
- `test_infeasible_reports_cause` (PASSED)
- `test_parallel_lab_batches` (PASSED)
- `test_priority_ordering` (PASSED)
- `test_requester_and_busy_excluded` (PASSED)
- `test_tier_caps_all_p1_max_4_p2_max_4_p3` (PASSED)
- `test_resolve_picks_highest_priority` (PASSED)
- `test_penalise` (PASSED)

#### University-Scale Institutional Benchmark:
Evaluated on full-scale SVVV engineering departmental records:
- **75 Sections** (35 CSE, 16 IT, 8 AI-DS, 16 Industry programs)
- **101 Rooms** (81 Classrooms, 20 Specialized Labs)
- **100 Faculty Members**
- **1,350 Weekly Sessions**
- **Formulation Time:** 1.12 seconds
- **Solver Optimization Time:** **18.03 seconds**
- **Total Conflicts:** **0 (100% Mathematically Optimal)**

---

# CHAPTER 6: CONCLUSION & FUTURE WORK
### 6.1 Achievements
The TS-SC project successfully fulfills both the guide-approved baseline deliverables (Automated Timetable Generation and Real-Time Substitution Timeline) and delivers substantial institutional enhancements (Infeasibility Diagnostics, Zero-Account Passkey Privacy, Institutional 360° Search, Fair-Load Balancing, and Multi-Shift Scheduling).

### 6.2 Limitations
- Single-campus walking distance assumption.
- Push notifications rely on active WebSockets / email services.
- Offline schedule caching requires pre-fetched sessions.

### 6.3 Future Roadmap
1. AI-Driven Predictive Absence Modeling using historical leave trends.
2. Smart Classroom IoT occupancy sensor integration.
3. Multi-campus university federation with transit matrices.
4. Native mobile application packaging with push notifications.

---

# CHAPTER 7: BIBLIOGRAPHY & SYSTEM SNAPSHOTS
### 7.1 References
1. Russell, S., & Norvig, P. (2020). *Artificial Intelligence: A Modern Approach (4th ed.)*. Pearson.
2. Pressman, R. S., & Maxim, B. R. (2019). *Software Engineering: A Practitioner's Approach (9th ed.)*. McGraw-Hill.
3. Silberschatz, A., Korth, H. F., & Sudarshan, S. (2020). *Database System Concepts (7th ed.)*. McGraw-Hill.
4. Perron, L., & Didier, F. (2024). *CP-SAT: The Constraint Programming Solver for SAT and Integer Optimization*. Google Research.
5. Schaerf, A. (1999). *A Survey of Automated Timetabling*. Artificial Intelligence Review, 13(2), 87-127.

### 7.2 Interface Snapshots
- **Figure 7.1:** Administrative Dashboard & Weekly Timetable Matrix.
- **Figure 7.2:** Real-Time Substitution Management Timeline.
- **Figure 7.3:** Zero-Account Student Passkey Schedule View.
- **Figure 7.4:** Institutional 360° Search Engine View.
