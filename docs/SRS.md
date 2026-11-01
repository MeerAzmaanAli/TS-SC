# Software Requirements Specification (SRS)
## Project: Smart Classroom & Timetable Scheduler (TS-SC)

**Document Version:** 2.0 (High-Level Architecture & Implementation Baseline)  
**Standard Compliance:** IEEE Std 830-1998 / ISO/IEC/IEEE 29148 / SEPM Guidelines  
**Status:** Approved Baseline  
**Date:** November 2026  

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) document details the high-level functional, non-functional, interface, and behavioral requirements for the **Smart Classroom & Timetable Scheduler (TS-SC)** platform. It reflects the production architecture following iterative development cycles, documenting both initial design requirements and the subsequent architectural shifts (pivots) implemented to enhance privacy, performance, deployment consolidation, and security.

### 1.2 Scope
TS-SC is an automated institutional timetable generation, resource allocation, and dynamic faculty substitution engine designed for higher education institutions (specifically modeled on university departments such as SVVV Indore). The system:
- Automates the computation of mathematically optimal, conflict-free academic schedules using constraint programming (Google OR-Tools CP-SAT).
- Provides instant explainability and constraint-relaxation diagnostics when an academic schedule is mathematically infeasible.
- Orchestrates same-day dynamic faculty substitutions via a three-tier algorithmic priority-ranking engine ($P_1 > P_2 > P_3$).
- Offers zero-account, passkey-secured, privacy-preserving section timetable access for students with real-time visual substitution status tracking.
- Delivers an administrative and faculty resource management interface with hardened authentication boundaries.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term / Acronym | Definition |
|---|---|
| **CP-SAT** | Constraint Programming - Boolean Satisfiability Solver (Google OR-Tools). |
| **RLS** | Row-Level Security in PostgreSQL, enforcing authorization policies at the database engine level. |
| **RPC** | Remote Procedure Call (`SECURITY DEFINER` stored functions executing with elevated database privileges). |
| **BaaS** | Backend-as-a-Service (Supabase: PostgreSQL, Auth, Edge Functions, Realtime). |
| **SEPM** | Software Engineering and Project Management. |
| **SRS** | Software Requirements Specification. |
| **UML** | Unified Modeling Language (Standard Object Management Group specification). |
| **Passkey** | Cryptographically distinct, human-readable section credential (e.g., `H-7216`) distributed offline. |
| **Priority Tiers** | Ranking for faculty substitution: $P_1$ (Same section & free), $P_2$ (Same course qualification & free), $P_3$ (Free faculty in department). |
| **Temporal Rule** | Constraint permitting substitution requests exclusively on the day of the lecture, prior to the lecture start time. |

### 1.4 References
- IEEE Std 830-1998: *Recommended Practice for Software Requirements Specifications*.
- Google OR-Tools CP-SAT Solver Documentation (v9.x).
- Vercel Multi-Service Architecture & Service Bindings Specification (2024+).
- Supabase PostgreSQL Row-Level Security & Remote Procedure Calls Guide.

---

## 2. Overall Description

### 2.1 Product Perspective & Architectural Evolution (Pivot Log)

During system development and deployment testing, critical operational, infrastructural, and privacy constraints prompted key architectural revisions away from the legacy specification:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               ARCHITECTURAL PIVOT LOG                                 │
├───────────────────────┬───────────────────────────────┬────────────────────────────────┤
│ Feature / Subsystem   │ Legacy SRS Design (v1.0)      │ Revised Production Architecture│
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ Student Account Model │ Individual Supabase Auth      │ Zero-Account Passkey Access:   │
│                       │ accounts (email/password),    │ Students store no PII. Access  │
│                       │ profiles table, student auth. │ via Section Code + Passkey RPC.│
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ Administrative Login  │ Prominent Admin tab on        │ Security by Obscurity:         │
│ Discovery             │ public login landing page.    │ Public login shows Student &   │
│                       │                               │ Faculty. Admin gated in muted  │
│                       │                               │ footer trigger to block probes.│
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ Microservice Hosting  │ External PaaS (Render / Fly)  │ Vercel Multi-Service:          │
│ & Solver Gateway      │ subject to cold starts (1-2m) │ Vite + FastAPI Gateway +       │
│                       │ and distributed domains.      │ internal CP-SAT Solver via     │
│                       │                               │ private IPC service bindings.  │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ Timetable Color Model │ Binary scheduled/free state.  │ Real-Time Trinary Color States:│
│ for Substitutions     │                               │ 🟡 Yellow: Sub pending/open    │
│                       │                               │ 🟢 Green: Sub assigned         │
│                       │                               │ 🔴 Red: Sub unfilled / expired │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ Substitution Timing   │ Arbitrary advance scheduling. │ Strict Day-Of Temporal Guard:  │
│ Constraints           │                               │ Requests valid only on lecture │
│                       │                               │ day before lecture starts.     │
└───────────────────────┴───────────────────────────────┴────────────────────────────────┘
```

### 2.2 User Classes and Personas

1. **System Administrator (Academic Registrar / Timetable Coordinator):**
   - Configures academic resources: rooms (type, capacity), programs, departments, courses, faculty qualifications, and time grids.
   - Triggers the automated CP-SAT generation engine and reviews the Conflict Inspector for soft-constraint optimization.
   - Manages and rotates section passkeys, generating exportable distribution rosters for class coordinators.
   - Publishes official timetable versions and monitors institutional faculty penalty metrics.

2. **Faculty Member:**
   - Authenticated user linked directly to institutional department profiles.
   - Views personal weekly schedules, teaching loads, and room assignments.
   - Initiates day-of substitution requests when unavailable.
   - Reviews, accepts, or declines incoming substitution requests dispatched via algorithmic ranking.

3. **Student / Class Coordinator:**
   - Unauthenticated, zero-PII stakeholder.
   - Accesses real-time section schedules via Section Code (e.g., `BTCS27H`) and Coordinator Passkey (e.g., `H-7216`).
   - Toggles laboratory batch filtering (`All Batches`, `Batch 1`, `Batch 2`).
   - Observes live color-coded slot updates for ongoing faculty substitutions without login barriers.

4. **Internal Microservices (Solver & API Gateway):**
   - Headless automated actors executing constraint optimization, candidate scoring, and internal request routing.

---

## 3. System Features & Functional Requirements

### 3.1 Feature Module 1: Institutional Resource & Configuration Management
- **F-REQ-1.1:** The system shall allow administrators to manage rooms with physical capacities and room types (`classroom`, `lab`, `seminar_hall`).
- **F-REQ-1.2:** The system shall maintain course catalogs specifying credits, weekly session frequency, continuous session duration, and laboratory prerequisites.
- **F-REQ-1.3:** The system shall enforce faculty-course qualification mappings, preventing faculty from being scheduled for unqualified subjects.
- **F-REQ-1.4:** The system shall support section partitioning into multiple lab batches (e.g., Batch 1 and Batch 2) for concurrent laboratory scheduling.
- **F-REQ-1.5:** The system shall allow definition of exclusive elective slot-blocks where core courses cannot be scheduled.

### 3.2 Feature Module 2: Automated Conflict-Free Timetable Generation
- **F-REQ-2.1 (Hard Constraint - Resource Singularity):** No room, faculty member, or student section shall be assigned to more than one session in any given time slot.
- **F-REQ-2.2 (Hard Constraint - Capacity & Type Match):** Laboratory courses must be assigned to laboratory rooms; theory courses must be assigned strictly to classrooms; room capacity must be $\ge$ section strength (or batch strength for practicals).
- **F-REQ-2.2b (Hard Constraint - Section Theory Room Consistency):** All theory sessions of any student section shall be held in the exact same assigned classroom (home classroom). Practical lab sessions move to specialized laboratories. Where available classrooms $\ge$ sections, each section is allocated a distinct dedicated classroom.
- **F-REQ-2.3 (Hard Constraint - Workload Limit):** Weekly scheduled hours for each faculty member shall not exceed their configured maximum weekly load.
- **F-REQ-2.4 (Soft Constraint - Gap Minimization):** The optimization model shall penalize single-period idle gaps in student daily schedules.
- **F-REQ-2.5 (Soft Constraint - Daily Spread):** Sessions of the same multi-credit course shall be evenly distributed across distinct days of the academic week.
- **F-REQ-2.6 (Infeasibility Diagnostics):** When constraints are mathematically irreconcilable, the solver shall execute iterative constraint relaxation (loads, rooms, qualifications, electives) and output the exact structural cause of failure.

### 3.3 Feature Module 3: Dynamic Same-Day Faculty Substitution Engine
- **F-REQ-3.1 (Temporal Enforcement):** Faculty can request substitutions only on the same calendar day as the scheduled lecture and prior to the slot's start time.
- **F-REQ-3.2 (Algorithmic Ranking):** When a request is created, the system shall compute eligible substitute faculty filtered by zero slot conflicts and rank them by:
  - **Priority 1 ($P_1$):** Faculty currently assigned to teach the same section in another course.
  - **Priority 2 ($P_2$):** Faculty qualified to teach the specific course.
  - **Priority 3 ($P_3$):** Any free faculty member belonging to the same academic department.
  - *Tie-Breaker:* Lowest cumulative weekly teaching load, followed by earliest response timestamp.
- **F-REQ-3.3 (State Transitions):**
  - **Open / Pending:** Broadcasted to eligible candidates.
  - **Assigned:** First valid candidate accepted or resolved by deadline.
  - **Unfilled / Expired:** If the request remains unassigned 10 minutes post-commencement, the slot is marked as a Free Lecture.
- **F-REQ-3.4 (Penalty Tracking):** Declining or failing to respond to a substitution request shall log a penalty record against the faculty profile for administrative audit.

### 3.4 Feature Module 4: Zero-Account Student Passkey Access
- **F-REQ-4.1 (Privacy Preservation):** The system shall strictly prohibit storing student identities, names, or email accounts in the database.
- **F-REQ-4.2 (Cryptographic RPC Verification):** Timetable data for students shall only be accessible through the PostgreSQL `SECURITY DEFINER` function `get_section_timetable(p_code, p_passkey)`.
- **F-REQ-4.3 (Live Slot Highlighting):** The student timetable grid shall visually indicate substitutions:
  - 🟡 **Yellow (`sub-pending`):** Dispatched substitution pending confirmation.
  - 🟢 **Green (`sub-assigned`):** Substitute faculty assigned and confirmed.
  - 🔴 **Red (`sub-expired`):** Request expired without assignment (Free period).
- **F-REQ-4.4 (Batch Filtering):** Students shall be able to filter practical lab sessions by Batch 1, Batch 2, or All Batches directly in the user interface.

### 3.5 Feature Module 5: Secure Authentication & Discovery Boundary
- **F-REQ-5.1:** Default authentication route (`/login`) shall display only Student Passkey Access and Faculty Sign-In.
- **F-REQ-5.2:** Administrative login credentials and input forms shall remain hidden behind a discrete, unstyled trigger to minimize exposure to automated vulnerability crawlers.

---

## 4. External Interface & Architectural Requirements

### 4.1 Vercel Multi-Service Topography

The system deploys as a consolidated Vercel Project containing three distinct services interacting via internal service bindings:

```
                          Internet (HTTPS)
                                 │
           ┌─────────────────────┴─────────────────────┐
           │                                           │
    Rewrite: /api/(.*)                          Rewrite: /(.*)
           ▼                                           ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│     Service: "api"        │               │   Service: "frontend"     │
│   FastAPI Public Gateway  │               │   Vite + React + TS SPA   │
│   (Port 8001 / Serverless)│               │   (Static CDN Edge)       │
└─────────────┬─────────────┘               └─────────────┬─────────────┘
              │                                           │
  Internal IPC Service Binding:                           │ Supabase JS SDK
  format="url", env="SOLVER_URL"                          │ (HTTPS / WSS)
              ▼                                           │
┌───────────────────────────┐                             │
│    Service: "solver"      │                             │
│   Internal CP-SAT Engine  │                             │
│   (Port 8000 / Internal)  │                             │
└───────────────────────────┘                             ▼
                                            ┌───────────────────────────┐
                                            │      Supabase Cloud       │
                                            │  Postgres 15 + RLS + RPC  │
                                            └───────────────────────────┘
```

---

## 5. Conceptual Models & UML Diagrams (SEPM Standards)

### 5.1 UML Use Case Diagram

The Use Case Diagram defines the interactions between the system actors and core use cases, showing `<<include>>` and `<<extend>>` dependencies.

```mermaid
flowchart LR
    %% Actors
    Admin["«actor»\nInstitutional Admin"]
    Faculty["«actor»\nFaculty Member"]
    Student["«actor»\nStudent / Coordinator"]
    Solver["«actor»\nOR-Tools Solver Engine"]

    %% System Boundary
    subgraph TS_SC["System Boundary: TS-SC Platform"]
        UC1(["UC-1: Manage Academic Entities\n(Rooms, Courses, Faculty)"])
        UC2(["UC-2: Trigger Timetable Generation"])
        UC3(["UC-3: Inspect Conflicts & Diagnostics"])
        UC4(["UC-4: Publish Official Timetable"])
        UC5(["UC-5: Manage Section Passkeys"])
        UC6(["UC-6: Solve Mathematical Constraints"])
        UC7(["UC-7: Request Lecture Substitution"])
        UC8(["UC-8: Verify Day-of Temporal Guard"])
        UC9(["UC-9: Respond to Substitution Request"])
        UC10(["UC-10: Rank Substitute Candidates"])
        UC11(["UC-11: View Section Timetable via Passkey"])
        UC12(["UC-12: Filter Practical Batches"])
        UC13(["UC-13: Track Substitution Status Colors"])
    end

    %% Admin Associations
    Admin --> UC1
    Admin --> UC2
    Admin --> UC3
    Admin --> UC4
    Admin --> UC5

    %% Solver Associations & Includes
    UC2 -. "«include»" .-> UC6
    UC6 --- Solver
    UC6 -. "«extend»\n[on Infeasible]" .-> UC3

    %% Faculty Associations
    Faculty --> UC7
    Faculty --> UC9
    UC7 -. "«include»" .-> UC8
    UC7 -. "«include»" .-> UC10
    UC10 --- Solver

    %% Student Associations
    Student --> UC11
    Student --> UC12
    Student --> UC13
    UC11 -. "«include»" .-> UC13
```

---

### 5.2 UML Class Diagram

The Class Diagram documents the domain data model, attributes, types, visibility, methods, and associations (composition, aggregation, multiplicity).

```mermaid
classDiagram
    direction TB

    class Institution {
        +UUID id
        +String name
        +String code
        +create()
    }

    class Department {
        +UUID id
        +UUID institution_id
        +String name
    }

    class Program {
        +UUID id
        +UUID department_id
        +String name
    }

    class Section {
        +UUID id
        +UUID program_id
        +String name
        +String code
        +String passkey
        +Int semester
        +Int strength
        +Int batch_count
        +rotatePasskey() String
    }

    class Room {
        +UUID id
        +String name
        +String room_type
        +Int capacity
        +String[] equipment_tags
    }

    class Course {
        +UUID id
        +String code
        +String name
        +Int credits
        +Int sessions_per_week
        +Int duration_slots
        +Boolean is_lab_required
    }

    class Faculty {
        +UUID id
        +UUID user_id
        +UUID department_id
        +String full_name
        +String email
        +Int max_weekly_load
    }

    class TimeSlot {
        +UUID id
        +Int day_of_week
        +Int period_index
        +Time starts_at
        +Time ends_at
    }

    class TimetableVersion {
        +UUID id
        +UUID institution_id
        +Int version_number
        +String status
        +DateTime published_at
        +publish()
    }

    class TimetableEntry {
        +UUID id
        +UUID version_id
        +UUID section_id
        +UUID course_id
        +UUID faculty_id
        +UUID room_id
        +UUID time_slot_id
        +Int batch_number
    }

    class SubstitutionRequest {
        +UUID id
        +UUID timetable_entry_id
        +UUID requester_faculty_id
        +Date lecture_date
        +DateTime deadline
        +String status
        +createDayOfRequest()
        +evaluateResolution()
    }

    class SubstitutionCandidate {
        +UUID id
        +UUID request_id
        +UUID faculty_id
        +Int priority
        +Int weekly_load
        +String response
        +DateTime responded_at
        +accept()
        +reject()
    }

    class SubstitutionPenalty {
        +UUID id
        +UUID faculty_id
        +UUID request_id
        +String reason
        +DateTime created_at
    }

    %% Relationships & Multiplicities
    Institution "1" *-- "0..*" Department : contains
    Department "1" *-- "0..*" Program : offers
    Program "1" *-- "0..*" Section : organizes
    Institution "1" *-- "0..*" Room : owns
    Department "1" *-- "0..*" Faculty : employs
    Program "1" o-- "0..*" Course : includes
    Faculty "0..*" --> "0..*" Course : qualified_for

    TimetableVersion "1" *-- "0..*" TimetableEntry : contains
    Section "1" <-- "0..*" TimetableEntry : scheduled_for
    Course "1" <-- "0..*" TimetableEntry : teaches
    Faculty "1" <-- "0..*" TimetableEntry : assigned_to
    Room "1" <-- "0..*" TimetableEntry : booked_in
    TimeSlot "1" <-- "0..*" TimetableEntry : occupies

    TimetableEntry "1" <-- "0..*" SubstitutionRequest : generates
    Faculty "1" <-- "0..*" SubstitutionRequest : requested_by
    SubstitutionRequest "1" *-- "0..*" SubstitutionCandidate : evaluates
    Faculty "1" <-- "0..*" SubstitutionCandidate : nominated_faculty
    SubstitutionRequest "1" <-- "0..*" SubstitutionPenalty : triggers
    Faculty "1" <-- "0..*" SubstitutionPenalty : incurs
```

---

### 5.3 UML Sequence Diagram: Timetable Generation & Infeasibility Analysis

This sequence details the interaction among the Administrator, the Vite Frontend, Supabase Database, the Public API Gateway, and the internal OR-Tools CP-SAT Solver.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Academic Admin
    participant UI as Vite Frontend SPA
    participant DB as Supabase PostgreSQL
    participant Gateway as FastAPI Gateway (/api)
    participant Solver as OR-Tools Solver (:8000)

    Admin->>UI: Click "Generate Timetable"
    activate UI
    UI->>DB: Fetch Snapshot (Rooms, Courses, Sections, Faculty, Slots, Constraints)
    activate DB
    DB-->>UI: Return JSON Entity Snapshot
    deactivate DB

    UI->>Gateway: POST /api/generate (Snapshot Payload)
    activate Gateway
    Note over Gateway,Solver: Internal Service Binding (SOLVER_URL)
    Gateway->>Solver: Forward POST /generate
    activate Solver

    Solver->>Solver: Formulate CP-SAT Variables (slot, room, faculty)
    Solver->>Solver: Apply Hard Constraints (no-overlap, room-fit, qualifications)
    Solver->>Solver: Apply Weighted Objective (minimize gaps, daily spread)

    alt Constraints Satisfiable
        Solver->>Solver: Compute Optimal Assignment
        Solver-->>Gateway: HTTP 200 { status: "success", entries: [...] }
        Gateway-->>UI: HTTP 200 { status: "success", entries: [...] }
        UI->>DB: INSERT INTO timetable_versions (status='draft') & timetable_entries
        UI-->>Admin: Display Draft in Conflict Inspector
    else Constraints Infeasible (Structural Conflict)
        Solver->>Solver: Execute diagnose() - Relax Constraint Groups Iteratively
        Solver->>Solver: Identify Culprit (e.g., Room Capacity or Faculty Load)
        Solver-->>Gateway: HTTP 200 { status: "infeasible", causes: [...] }
        Gateway-->>UI: HTTP 200 { status: "infeasible", causes: [...] }
        UI-->>Admin: Display Exact Root Cause in Diagnosis Modal
    end
    deactivate Solver
    deactivate Gateway
    deactivate UI
```

---

### 5.4 UML Sequence Diagram: Priority-Based Faculty Substitution Lifecycle

This sequence illustrates the same-day substitution workflow, algorithmic candidate scoring, and state resolution.

```mermaid
sequenceDiagram
    autonumber
    actor Requester as Absent Faculty
    participant UI as Vite Web Client
    participant DB as Supabase PostgreSQL
    participant Solver as Internal Solver Engine
    actor Candidate as Candidate Faculty

    Requester->>UI: Click "Request Substitute" on Today's Lecture Slot
    activate UI
    UI->>UI: Validate Temporal Guard (Day-of & starts_at > now)
    alt Temporal Validation Fails
        UI-->>Requester: Reject with Error ("Only valid on day of lecture prior to start")
    else Temporal Validation Passes
        UI->>DB: Query Section Faculty, Qualified Faculty, Busy Faculty, Loads
        activate DB
        DB-->>UI: Return Candidate Pools
        deactivate DB

        UI->>Solver: POST /api/substitutions/rank (Faculty Pools & Loads)
        activate Solver
        Solver->>Solver: Filter out Busy Faculty
        Solver->>Solver: Partition into P1 (Section), P2 (Course), P3 (Dept)
        Solver->>Solver: Sort Tiers by Lowest Weekly Load
        Solver-->>UI: Ranked Candidates Array [ { faculty_id, priority, load } ]
        deactivate Solver

        UI->>DB: INSERT INTO substitution_requests (status='open')
        UI->>DB: INSERT INTO substitution_candidates
        UI-->>Requester: Request Dispatched (Slot turns Yellow)

        Note over UI,Candidate: Notification dispatched to candidate inboxes
        Candidate->>UI: Open Substitution Inbox
        Candidate->>UI: Click "Accept Request"
        UI->>DB: UPDATE substitution_candidates (response='accepted')
        UI->>DB: UPDATE substitution_requests (status='assigned')
        UI->>DB: Log penalties for unassigned candidates who rejected
        UI-->>Candidate: Assignment Confirmed
        Note over UI: Student & Faculty grids instantly reflect Green (Assigned)
    end
    deactivate UI
```

---

### 5.5 UML Activity Diagram: Substitution Request Evaluation Workflow

This activity diagram captures the branching decisions, deadlines, penalty assignments, and UI visual state switches.

```mermaid
flowchart TD
    Start([Start: Faculty initiates request]) --> CheckDay{Is lecture scheduled today?}
    
    CheckDay -- No --> RejectDay[Abort: Request only allowed on lecture date] --> EndFail([End: Request Blocked])
    CheckDay -- Yes --> CheckTime{Current time < Lecture starts_at?}
    
    CheckTime -- No --> RejectTime[Abort: Lecture has commenced or elapsed] --> EndFail
    CheckTime -- Yes --> ComputePool[Retrieve Qualified & Section Faculty]
    
    ComputePool --> FilterBusy[Exclude Faculty with conflicting time slots]
    FilterBusy --> RankTiers[Rank into P1 Section, P2 Course, P3 Dept]
    RankTiers --> DispatchReq[Create Substitution Request: Status = OPEN]
    
    DispatchReq --> SlotYellow[Set Student/Faculty Slot to YELLOW: sub-pending]
    SlotYellow --> AwaitResponse{Response received before deadline?}
    
    AwaitResponse -- Candidate Accepts --> ResolvePriority{Highest Priority Candidate?}
    ResolvePriority -- Winner Identified --> AssignSub[Update Status = ASSIGNED\nBind Substitute to Lecture]
    AssignSub --> RecordPenalties[Record Penalties for Rejecters]
    RecordPenalties --> SlotGreen[Set Timetable Slot to GREEN: sub-assigned] --> EndSuccess([End: Substitution Active])
    
    AwaitResponse -- Deadline Passed\n(Lecture Start + 10 min) --> MarkUnfilled[Update Status = EXPIRED / UNFILLED]
    MarkUnfilled --> SlotRed[Set Timetable Slot to RED: sub-expired\nDisplay 'Free Period'] --> EndFree([End: Free Period])
```

---

### 5.6 UML State Machine Diagram: Substitution Request Entity States

Models the complete state lifecycle of a `SubstitutionRequest` entity.

```mermaid
stateDiagram-v2
    [*] --> Draft : Faculty selects slot

    Draft --> Open : Submit [Valid day-of & before start]
    Draft --> [*] : Cancelled by requester

    state Open {
        [*] --> Dispatched
        Dispatched --> CandidateReview : Push/Inbox notification received
        CandidateReview --> PartialAccepted : First candidate accepts
    }

    note right of Open
        Visual State: YELLOW (sub-pending)
        Countdown active until starts_at + 10 min
    end note

    Open --> Assigned : Candidate Accepted [Highest P1/P2/P3 Priority resolved]
    
    note right of Assigned
        Visual State: GREEN (sub-assigned)
        Substitute faculty name shown in schedule
    end note

    Open --> Expired : Timeout [Deadline elapsed without acceptance]
    Open --> Unfilled : All eligible candidates explicitly rejected

    note right of Expired
        Visual State: RED (sub-expired)
        Designated as Free Lecture in student view
    end note

    Assigned --> [*]
    Expired --> [*]
    Unfilled --> [*]
```

---

### 5.7 UML Deployment Diagram: Consolidated Vercel Multi-Service Architecture

The deployment diagram illustrates the physical and virtual execution nodes, artifact packaging, execution environments, and network protocols.

```mermaid
flowchart TB
    subgraph ClientDevice ["Client Tier (Browser / Mobile)"]
        Browser["Modern Web Browser (Chrome, Firefox, Safari)\n• HTML5 / CSS3 / ES2022\n• LocalStorage (Session Passkeys)"]
    end

    subgraph VercelEdge ["Vercel Multi-Service Project (Production Edge)"]
        direction TB
        
        subgraph FrontendContainer ["Service: 'frontend' (Vite + React)"]
            SPA["React 18 TypeScript Single-Page App\n• Public Route: /(.*)\n• Tailwind CSS UI System\n• Real-Time Weekly Grid Engine"]
        end

        subgraph GatewayContainer ["Service: 'api' (FastAPI Public Gateway)"]
            Gateway["FastAPI Gateway Instance\n• Public Route: /api/(.*)\n• CORS Middleware\n• Reverse Proxy & Health Aggregator"]
        end

        subgraph SolverContainer ["Service: 'solver' (Internal Optimization Worker)"]
            CPSAT["FastAPI + Google OR-Tools CP-SAT\n• Private Internal Service (No Public Route)\n• SAT Solver Algorithm\n• Infeasibility Relaxation Engine"]
        end
    end

    subgraph SupabaseCloud ["Database & BaaS Tier (Supabase Cloud)"]
        direction TB
        PostgreSQL[("PostgreSQL 15 Database\n• Tables: rooms, courses, sections, etc.\n• Row-Level Security (RLS) Active\n• Stored Procedure: get_section_timetable()")]
        AuthService["Supabase GoTrue Auth Service\n• JWT Token Issuance (Faculty & Admin)"]
    end

    %% Network & Binding Connections
    Browser -- "HTTPS / WSS (REST & Realtime)" --> SPA
    SPA -- "HTTPS REST (Direct RLS & RPC)" --> PostgreSQL
    SPA -- "HTTPS REST (Auth Claims)" --> AuthService
    SPA -- "HTTPS /api/* (Solver Requests)" --> Gateway

    Gateway -- "IPC Service Binding (SOLVER_URL)" --> CPSAT
    CPSAT -. "Direct Optimization Response" .-> Gateway
```

---

## 6. Non-Functional Requirements (NFR)

### 6.1 Performance and Response Times
- **NFR-P1 (Timetable Solving Latency):** The CP-SAT engine shall solve standard department workloads ($\le 60$ sections, $\le 500$ weekly course sessions) within **120 seconds**.
- **NFR-P2 (RPC Query Latency):** Student section timetable queries via the `get_section_timetable` RPC shall return within **300 milliseconds** under standard network conditions.
- **NFR-P3 (Vite Cold Build Time):** Incremental production build duration for the frontend shall not exceed **15 seconds**.

### 6.2 Security and Integrity
- **NFR-S1 (Zero-Trust Student Privacy):** No personal identifiable information (PII) such as student enrollment IDs, names, or contact data shall be stored in any database table.
- **NFR-S2 (RPC Encapsulation):** Student schedule retrieval must execute under a `SECURITY DEFINER` stored function that isolates access solely to verified section codes and matching passkeys.
- **NFR-S3 (Admin Route Obfuscation):** The administrative authentication mechanism must remain unindexed and hidden behind an opaque trigger to eliminate automated dictionary attack vectors.
- **NFR-S4 (Row-Level Security):** All database tables must have PostgreSQL RLS enabled; faculty roles must be cryptographically restricted to their own substitution records and institutional department context.

### 6.3 Reliability & Availability
- **NFR-R1 (Zero Cold Starts):** Deployment on Vercel services with multi-service binding shall eliminate the 1-2 minute inactive spin-up latency characteristic of legacy free-tier PaaS providers.
- **NFR-R2 (Explainable Infeasibility):** The timetable solver shall never fail silently; when an infeasible state occurs, a diagnostic relaxation breakdown shall identify the violating constraint group.

---

## 7. Requirements Traceability Matrix (RTM)

| Requirement ID | Module / Component | UML Artifact Reference | Verification Method | Status |
|---|---|---|---|---|
| **F-REQ-1.1 – 1.5** | Resource Management | Class Diagram (`Room`, `Course`, `Section`) | Integration Test | Implemented |
| **F-REQ-2.1 – 2.3** | CP-SAT Hard Constraints (Singularity, Fixed Home Classroom, Workload) | Sequence Diagram (5.3), Class Diagram | Solver Unit Test | Implemented |
| **F-REQ-2.4 – 2.5** | Soft Optimization (Gaps/Spread) | Sequence Diagram (5.3) | Benchmarking Suite | Implemented |
| **F-REQ-2.6** | Infeasibility Diagnostics | Sequence Diagram (5.3, alt branch) | Diagnostic Test | Implemented |
| **F-REQ-3.1** | Day-Of Temporal Guard | Sequence Diagram (5.4), Activity Diagram | Unit Test (`getLectureTemporalStatus`) | Implemented |
| **F-REQ-3.2** | Algorithmic P1/P2/P3 Ranking | Class Diagram, Activity Diagram (5.5) | Ranking Test Suite | Implemented |
| **F-REQ-3.3** | Real-Time Substitution States | State Machine Diagram (5.6), Activity | UI Integration Test | Implemented |
| **F-REQ-4.1 – 4.2** | Zero-Account Passkey Access | Use Case (UC-11), Deployment Diagram | Security Penetration Audit | Implemented |
| **F-REQ-4.3** | Color-Coded Timetable Grid | State Machine Diagram (5.6) | UI Snapshot Test | Implemented |
| **F-REQ-5.1 – 5.2** | Obfuscated Administrative Login | Use Case (UC-1), Deployment Diagram | Vulnerability Scan | Implemented |
| **NFR-R1** | Vercel Multi-Service Binding | Deployment Diagram (5.7) | End-to-End Latency Probe | Implemented |

---
*End of Software Requirements Specification (SRS) Document.*

