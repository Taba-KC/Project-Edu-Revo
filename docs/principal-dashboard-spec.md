# Principal Dashboard Specification

Last regenerated: 2026-10-03

This document describes what "done" means for the principal side of NEDECEN, based on the current backend data model, routes, and the frontend direction already designed.

It is intentionally decision-oriented. Some parts are already implemented, some are partly implemented, and some are open product decisions.

## 1. Principal Dashboard Purpose

The principal dashboard is the school's setup and administration console.

The principal is responsible for making sure the school structure exists before teachers and learners can use the teaching, homework, feedback, and announcement flows.

The principal dashboard should answer:

- Do all required grades exist?
- Does each grade have at least one class?
- Does each class have a stream?
- Does each stream contain subjects?
- Does each class have learners?
- Do staff records exist?
- Which staff members are actually teaching?
- Are chapters and concepts available for each subject and grade?
- Are chapters assigned to the correct class subjects?
- Are teachers assigned to those chapters?
- Are learner and staff accounts activated?
- Are announcements being managed?

## 2. Current Product Boundary

The app currently has three broad layers:

1. Platform-level curriculum
2. School-level setup
3. Teaching and learner feedback

The principal mostly owns school-level setup.

There is currently some overlap with curriculum setup because the backend allows principals to create/import chapters and concepts. That may be correct for MVP, but it is an important product decision.

Teacher and learner flows such as lesson planning, homework creation, lesson feedback, and aggregated teacher feedback are not principal-first workflows. The principal may later need oversight analytics, but the full operational workflow belongs to teachers and learners.

## 3. Core Mental Model

The current data model works like this:

```text
Platform subject catalogue
  -> subjects

School streams
  -> streams
  -> stream_subjects

School structure
  -> grades
  -> classes
  -> class_subjects

Curriculum library
  -> chapters by subjectId + gradeNumber
  -> concepts inside chapters

Class-specific teaching setup
  -> class_chapters
     links one curriculum chapter to one class_subject
     optionally assigns personId as the teacher for that chapter

Teaching activity
  -> lessons
  -> lesson_concepts
  -> homework
  -> questions
  -> learner feedback tables
```

Important clarification:

Some old schema comments describe chapters as if chapters directly belong to a class subject. The actual current schema does not do that.

Currently:

- `chapters` belong to a `subjectId` and `gradeNumber`.
- `concepts` belong to a `chapterId`.
- `class_chapters` links a curriculum chapter into a specific `class_subject`.
- `class_chapters.personId` assigns the staff member who teaches that chapter for that class subject.

That means "Physical Sciences Grade 11: Newton's Laws" can exist once in the curriculum library, then be linked into Grade 11A Physical Sciences, Grade 11B Physical Sciences, etc.

## 4. What Each Entity Means

### Subject

A subject is a platform-level item, for example:

- Mathematics
- Physical Sciences
- English First Additional Language
- Life Sciences

Subjects are not school-specific in the current data model.

Current recommended decision:

- Platform managers should own the canonical subject catalogue.
- Principals should choose from existing subjects.
- If schools need custom subjects later, add a subject-request workflow or school-specific subject override. Do not make that the default MVP path unless needed.

### Stream

A stream is a school-created group of subjects.

Examples:

- Science Stream
- Commerce Stream
- General (Maths Lit)

A stream belongs to one school.

The principal creates streams and adds subjects to them.

The stream answers:

> Which subjects does this group of learners take?

### Grade

A grade is a school-level year group.

Examples:

- Grade 8
- Grade 9
- Grade 10
- Grade 11
- Grade 12

The app should assume a normal high school has at least five grades unless the school explicitly says otherwise.

Current rule:

- A school cannot have duplicate grade numbers.

### Class

A class belongs to a grade.

Examples:

- Grade 11A
- Grade 11B
- Grade 12C

A class can have:

- a stream
- a class teacher
- a class profile image
- learners
- class subjects generated from the assigned stream

Current rule:

- A class name should start with the grade number and end with an identifier, such as `11A`, `11B`, `12C`.
- Inside one grade, class names must be unique.
- Display names should say `Grade 11A`, `Grade 11B`, etc.

Important distinction:

- A class teacher manages the class.
- A class teacher does not necessarily teach every subject in that class.

### Class Subject

A class subject is a class-specific subject record.

Example:

- Grade 11A has Physical Sciences.
- Grade 11B has Physical Sciences.

Those are two separate `class_subjects`, even though both point to the same platform subject.

When a stream is assigned to a class, the backend creates `class_subjects` from that stream's subjects.

This matters because lessons, chapters, homework, and feedback attach to class-specific subjects, not directly to the stream.

### Chapter

A chapter is a curriculum unit for a subject and grade.

Example:

- Subject: Physical Sciences
- Grade: 11
- Chapter: Newton's Laws

Chapters have an order.

### Concept

A concept is the smallest teachable idea inside a chapter.

Example:

- Chapter: Newton's Laws
- Concepts:
  - Force
  - Net force
  - Newton's First Law
  - Newton's Second Law

Lesson feedback and homework questions trace back to concepts.

### Class Chapter

A class chapter links a curriculum chapter to a class subject.

Example:

- Grade 11A Physical Sciences
- linked to Chapter: Newton's Laws
- assigned teacher: Ms Mokoena

This is where a staff member becomes a real teacher in the system.

A person is not truly a teacher just because their role says `teacher`. In the product logic, they become a teacher when they are assigned to at least one `class_chapters.personId`.

## 5. Current Principal Screens

### Grades & Classes

Current implementation:

- Principal can add/delete grades.
- Principal can add/edit/delete classes.
- Principal can assign a stream to a class.
- Principal can assign a class teacher.
- Principal can upload a class profile image.
- Principal can add/import learners into a class.
- Class cards show stream, teacher, image/placeholder, and actions.
- Stream name on class card can be used as a path to subjects inside the stream.
- Desktop, tablet, and mobile layouts should support the same actions.

Done means:

- The principal can create the whole school structure without database work.
- Each class can have stream, class teacher, profile image, and learners.
- Duplicate grades/classes are prevented.
- Empty grades still show an obvious "Create New Class" action.

Still needed or worth checking:

- Edit grade number/name, if desired.
- Safer delete confirmation that clearly says deleting a grade deletes its classes and related content.
- Ensure class delete cleans up dependent rows in a predictable order.

### Streams

Current implementation:

- Principal can create/edit/delete streams.
- Principal can add/replace/remove subjects in a stream.
- Streams use the platform subject catalogue.

Done means:

- The principal can define all school subject bundles.
- The principal can assign streams to classes.
- Stream changes do not accidentally destroy historical class teaching records.

Important product decision:

- Changing a stream definition should not automatically rewrite existing `class_subjects` for already-created classes unless we explicitly build that behavior.
- `class_subjects` are the stable class-specific records used by lessons and feedback.

Open questions:

- Should a stream change update future classes only?
- Should the principal be warned when changing a stream already assigned to classes?
- Should there be a button to "sync stream subjects into existing classes"?

### Staff

Current implementation:

- Principal can add staff individually.
- Principal can import staff in bulk.
- Staff list can filter:
  - All
  - Assigned
  - Not assigned
  - Account active
  - Setup pending
- Assigned means the person has at least one chapter assignment.

Done means:

- Staff records can be created/imported.
- Staff can claim accounts through onboarding.
- Principal can see who has activated an account.
- Principal can see who is actually assigned to teaching work.

Still needed:

- Edit staff record.
- Delete staff record.
- Reassign/deactivate staff safely.
- Show which classes/subjects/chapters a staff member teaches.

### Learners

Current implementation:

- Principal can add learners individually.
- Principal can import learners in bulk.
- Learners are attached to classes.
- Learners can onboard and activate accounts.
- Principal can filter/search learners by class.

Done means:

- Learners can be added per class.
- Learners can be imported from a spreadsheet.
- Principal can see account activation status.

Still needed:

- Edit learner.
- Delete learner.
- Move learner between classes.
- Show learner's subjects/homework/feedback status.

### Announcements

Current implementation:

- Principal can create announcements.
- Principal can target:
  - all
  - grade
  - class
  - stream
- Principal can edit/delete announcements.
- Learner endpoint can fetch relevant announcements.

Done means:

- Principal can publish messages to the right audience.
- Learners only see announcements relevant to their class/grade/stream/all.

Still needed if MVP requires it:

- Hide announcement.
- Pin announcement.
- Categories/system tags.
- Announcement permissions.
- Retention/archive rules.

## 6. Biggest Missing Principal Feature: Curriculum Setup

This is the main thing still missing if the principal dashboard is supposed to complete the school's setup.

The principal still needs a UI for:

1. Selecting a grade.
2. Selecting a subject.
3. Viewing chapters for that subject and grade.
4. Creating/importing chapters.
5. Viewing concepts inside each chapter.
6. Creating/importing concepts.
7. Seeing which class subjects use those chapters.
8. Assigning chapters to class subjects.
9. Assigning staff members to chapters.

Suggested name for this feature:

- Curriculum Setup
- Subject Setup
- Chapters and Teachers

Best recommendation:

Use `Curriculum Setup`.

It explains the job better than `Subjects`, because the principal is not only looking at subjects. They are setting up chapters, concepts, and teaching assignments.

## 7. How Curriculum Setup Should Work

### Step 1: Choose Grade

The principal chooses:

- Grade 8
- Grade 9
- Grade 10
- Grade 11
- Grade 12

### Step 2: Choose Subject

The app should show subjects available in that grade based on `class_subjects`.

Example:

- Grade 11 has Physical Sciences because Grade 11A and Grade 11B have Physical Sciences through their stream/class subjects.

### Step 3: Manage Chapters and Concepts

The principal sees:

- Chapters for Physical Sciences Grade 11
- Concepts inside each chapter

Actions:

- Add chapter
- Edit chapter
- Delete chapter if unused
- Import chapters/concepts spreadsheet
- Add concept
- Edit concept
- Delete concept if unused

Current backend supports:

- create chapter
- list chapters by subject and grade
- import chapters/concepts
- create concept
- list concepts by chapter

Backend still needed:

- update chapter
- delete chapter safely
- update concept
- delete concept safely

### Step 4: Link Curriculum to Class Subjects

For each class studying the subject, the principal should see:

- Grade 11A Physical Sciences
- Grade 11B Physical Sciences
- Grade 11C Physical Sciences

Each class subject should show:

- chapters linked
- chapters missing
- assigned teacher per chapter

Current backend supports:

- assign chapter to class subject
- list class chapters
- assign person to class chapter

Backend still needed:

- list class subjects by class with subject names
- list class subjects by grade/subject
- remove chapter from class subject
- bulk assign chapters to all matching class subjects
- bulk assign teacher to many chapters

### Step 5: Assign Teachers

The principal can assign a staff member to:

- one chapter in one class subject
- many chapters in one class subject
- all chapters in one subject for one class
- all matching chapters across multiple classes

This allows real school situations:

- One teacher handles Grade 11A Physical Sciences Mechanics.
- Another teacher handles Grade 11A Physical Sciences Chemistry.
- One teacher handles all Grade 11B Physical Sciences chapters.

This supports split-subject teaching, especially for subjects like Physical Sciences.

## 8. School Setup Health

The Home tab was removed for now, but the underlying idea is still useful.

The principal should eventually have a setup health dashboard.

The app should detect:

- fewer than expected grades
- grade has no classes
- class has no stream
- class has no learners
- class has no class teacher
- stream has no subjects
- class subject has no chapters
- chapter has no concepts
- class chapter has no assigned teacher
- staff account setup pending
- learner account setup pending
- announcement settings incomplete

Each issue should offer a quick action.

Example:

- "Grade 9 has no classes" -> Open Grade 9 in Grades & Classes.
- "Grade 11A Physical Sciences has no chapters" -> Open Curriculum Setup filtered to Grade 11 + Physical Sciences.
- "5 learners have not activated accounts" -> Open Learners filtered to setup pending.

## 9. Principal Definition of Done

The principal module is done when a principal can perform these jobs without backend/manual intervention.

### Grades & Classes

- Create grades.
- Prevent duplicate grade numbers.
- Delete grades and dependent setup safely.
- Create classes.
- Prevent duplicate class names inside a grade.
- Assign streams to classes.
- Assign class teachers.
- Upload class profile images.
- Add/import learners into classes.

### Streams

- Create streams.
- Add platform subjects to streams.
- Edit/delete streams.
- Understand the impact of stream changes.

### Staff

- Add/import staff.
- Edit/delete staff safely.
- See account activation status.
- See teaching assignment status.
- Assign staff to teaching chapters.

### Learners

- Add/import learners.
- Edit/delete/move learners safely.
- See account activation status.

### Curriculum

- See subjects available to the school through streams/classes.
- Manage chapters by subject and grade.
- Manage concepts by chapter.
- Import chapters/concepts.
- Link chapters to class subjects.
- Assign staff to class chapters.

### Announcements

- Create/edit/delete announcements.
- Target announcements.
- Let learners see only relevant announcements.

### Responsive UX

- Desktop, tablet, and mobile can perform the same principal actions.
- Small screens may use sheets, stacked layouts, and compact controls, but should not remove core workflows.

## 10. Things That Are Not Principal MVP

These are more teacher/learner app responsibilities:

- Teacher planning lessons.
- Teacher confirming lessons taught.
- Teacher creating homework.
- Learner previewing concepts before lesson.
- Learner giving post-lesson feedback.
- Learner giving lesson feedback.
- Teacher viewing detailed lesson feedback.

The principal may later need summary analytics, but not the full operational teacher workflow.

## 11. Open Product Decisions

These are the decisions that most affect "what done looks like":

1. Should principals manage chapters/concepts, or should platform managers own the curriculum library?
2. If platform owns chapters/concepts, can schools customize them?
3. Should a class stream update automatically change existing class subjects?
4. Should chapters auto-link to every matching class subject when imported?
5. Should a teacher assignment be per chapter, per subject, or both?
6. Should class teacher and subject/chapter teacher remain separate concepts?
7. Should the app require all five high-school grades, or allow schools to choose which grades they offer?
8. Should announcement hide/pin/categories exist in MVP?
9. Should staff and learner deletion be hard delete, soft delete, or deactivate/archive?
10. What is the smallest setup workflow a school must complete before learners can start using the app?

Recommended current answers:

- Platform owns subjects.
- Principal owns streams.
- Chapters/concepts can be principal-managed for MVP, but this should be revisited.
- Class teacher and chapter teacher must remain separate.
- Teacher status should be derived from chapter assignments.
- The setup dashboard should guide the principal, not block every action.

## 12. Suggested Next Build Order

1. Create `Curriculum Setup`.
2. Add backend endpoints for listing class subjects with subject/class/grade names.
3. Add chapter/concept edit/delete endpoints.
4. Add teacher assignment UI for class chapters.
5. Add setup health checks.
6. Add edit/delete/move for staff and learners.
7. Decide whether announcement pin/hide/categories are MVP.

## 13. Simplest MVP Done Statement

Principal MVP is done when this sentence is true:

> The principal can set up the school's grades, classes, streams, staff, learners, curriculum chapters/concepts, and teacher assignments so that teachers can plan lessons and learners can receive class-specific work and announcements without any manual database work.



## School setup implementation update ? 2026-10-07

Principal setup now supports assigning a staff member directly to each subject-in-a-class, before curriculum chapters exist. The class card's Subjects & Teachers action opens the allocation controls. The class manager remains a separate pastoral/administrative assignment.

- GET /schools/:schoolId/classes/:classId/subjects lists the active class subjects and their default teacher allocations.
- PATCH /schools/:schoolId/classes/:classId/subjects/:classSubjectId/teacher accepts personId or null. Assignments are limited to teaching staff from the same school.
- Staff assignment filters recognise active subject-class allocations as well as active chapter allocations.
- Creating/changing a class stream and adding/replacing/removing stream subjects synchronise class subjects in the same transaction.
- Removed subjects are marked inactive rather than deleted, preserving lessons, chapter overrides, and feedback. A subject returning to the same class reuses its existing record and allocation.
- New curriculum chapters inherit the subject-class teacher. Changing that teacher updates chapters using the previous default while keeping different chapter-specific teachers.
- Migration 0014 adds the allocation and active state, repairs stale stream subjects, and infers existing whole-subject allocations where chapter teachers agree.

Curriculum content preparation and a later UI for chapter-specific teacher overrides remain separate work. Principal setup tests use rolled-back database fixtures: npm run test:principal-setup.


## Fixed school grades — MVP update, 2026-10-08

Every school automatically receives Grades 8, 9, 10, 11 and 12. Principals create and manage classes within those grades; they cannot add, delete, rename or move grades. This supersedes earlier grade creation/deletion instructions.

Desktop sidebar and mobile grade cards offer selection only. Grade creation forms, add buttons and deletion controls are removed. Empty grades remain available for later class setup.

Migration 0016 fills missing supported grades for existing schools while preserving their existing grade IDs and class references. A database trigger provisions all five grades for newly created schools, including seeded schools. Range and uniqueness constraints reject unsupported or duplicate grades, and a trigger blocks grade deletion, renumbering and transfer between schools. The old grade creation/deletion API routes return HTTP 405; school grade reads enforce principal school ownership.

Stream subjects remain shared subject identities. A class's fixed grade number selects the matching subject/grade curriculum. Curriculum availability is independent of grade provisioning.

Validation: test:fixed-grades covers provisioning, unsupported/duplicate inserts, deletion, renumbering, school transfer and preservation of class/grade references. Principal setup and curriculum regression tests continue to pass with automatically provisioned grades.


## Curriculum hierarchy update — 2026-10-08

The app-manager curriculum is now Subject + Grade → Chapter → Topic → Concept. Spreadsheet row 1 contains chapter labels, row 2 topic labels, and rows 3 onward concepts. Repeated chapter headings group topic columns under that chapter. Review supports labels and ordering at all levels, plus combining unsaved chapter groups before saving. Existing curricula receive a General topic without changing concept IDs or lesson references.

Managers can add subjects later. Catalog names are unique ignoring capitalization, surrounding whitespace and repeated whitespace, enforced by a database index. This supersedes earlier descriptions of concepts directly beneath chapters and one-header-row imports.


### Class curriculum browsing (2026-10-09)

Principals can open a class’s Subjects & Teachers panel and choose View curriculum beside any active subject. The read-only browser shows chapters, topics and concepts in curriculum order. The API derives the subject and grade from the class allocation and restricts access to the principal’s school. It shows a clear empty state when that grade and subject have no curriculum; it never substitutes another grade’s content. Curriculum editing remains in the app manager interface.


### Bulk roster review (2026-10-10)

Staff and learner bulk additions use Upload → editable Preview → Save. The review modal widens for the table and supports corrections and row removal; learner previews show their destination class. Missing fields and duplicate staff/admission numbers (within the batch or school) block saving. Previewing never writes records. Saving validates the edited rows again and commits the entire batch atomically. Spreadsheet uploads accept .xlsx/.xls/.csv, first worksheet only, up to 500 rows and 2 MB. Numeric identifiers retain their spreadsheet display format. The same flow is used from class-card learner uploads. New accounts remain unclaimed until the staff member/learner completes onboarding.

### Activated staff and learner landing pages (2026-10-10)

Staff now land at /dashboard/staff with Home and Classes. Unassigned staff see an awaiting-assignment state and school announcements. Assigned staff see active subject-class allocations, chapter-specific allocations, current curriculum chapter and confirmed concept coverage. Only their teaching chapters and lessons are exposed. Learners land at /dashboard/learner with Home and Subjects, inheriting the active subjects of their own class and the matching grade curriculum. Both use the charcoal, faint-border, diagonal-haze UI with mobile layouts, account details, announcements and sign-out.

Home derives Needs you (staff), Waiting for you (learners), and unbadged Coming up (learners) from existing lessons, homework and the current learner's responses. Subjects open read-only curriculum and lesson/homework details. This delivery implements landing and browsing; planning, confirmation, homework authoring, learner response submission and memo reveal controls are subsequent flow work. There is no timetable model yet, so scheduled-period planning reminders are not fabricated.

Authenticated /staff/me/dashboard and /learners/me/dashboard derive school/account scope from the token. Archived allocations, other schools/classes, password hashes, identifiable feedback and memo answer content are excluded. Tests: test:dashboards (16 rolled-back fixture checks) and test:dashboards-http (role/authentication checks without writes).

### Teacher workspace layout update (2026-10-10)

The Classes tab uses a charcoal sidebar grouping the teacher's subject allocations by class. Desktop shows Lessons, Homework and Curriculum Coverage cards for the selected allocation (the first allocation is selected by default). On screens below 1024px, teachers first choose a class subject and can return to that list. Each feature opens a native modal with focus containment, Escape/close/backdrop dismissal, a dark blurred backdrop and independently scrolling content. Lesson and homework browsing remain read-only; coverage retains Chapter → Topic → Concept exploration. Account details and announcements appear on Home only.

The root body now grows with document content rather than being fixed to the viewport height. This fixes background overflow at the bottom across sign-in, onboarding, principal, staff, learner and manager pages; intentional principal desktop scrolling containers are preserved.

### Teacher planning, homework and History (2026-10-10)

This supersedes the read-only teacher workspace described above. Staff navigation is Home, Classes and History. Classes and History share a flat principal-style charcoal sidebar; allocation labels read Subject · Grade 11B, without class group headings, a header icon or a second grade line. Desktop selects the first allocation; smaller screens start with allocation selection. Account details and announcements remain on Home only.

Classes offers Plan A Lesson and Create Homework action tiles, alongside Curriculum Coverage. History offers Lessons and Homework browsing for the selected allocation. It includes saved plans and confirmed lessons, supports confirming past plans, and displays sent questions and optional memos. Teachers can add or correct a memo later. Native dialogs retain keyboard focus and use a dark blurred backdrop.

Planning loads the first incomplete teaching chapter, remaining concepts in curriculum order, collapsed previously taught concepts for re-teaching, and anonymous difficulty flags where at least 30% of the current class reported difficulty. Teachers can add class-specific custom concepts. Plans use the existing lessons table with planned status; saving a plan does not change coverage. Confirmation records only checked concepts, allows an empty confirmation, and leaves omitted curriculum/custom concepts available for later plans. Custom concepts are scoped to the class subject and do not modify the shared curriculum. Dates remain editable; no timetable is inferred.

Homework requires a confirmed lesson with concepts. Teachers can write questions manually or generate editable question/memo pairs using OpenAI, choose per-concept counts, combine manual and generated questions, remove questions, and regenerate an incorrect memo with an explicit Keep/Try again review. Due dates and immediate, due-date or custom memo release are supported. Sending saves the complete question set atomically; missing memos do not block sending. One homework set is allowed per lesson. Legacy partial homework creation endpoints now return 410.

New authenticated teacher endpoints:
- GET /staff/class-subjects/:id/planning
- POST /staff/class-subjects/:id/plans
- PATCH /staff/lessons/:id/confirm
- GET /staff/lessons/:id/homework-context
- POST /staff/lessons/:id/homework
- POST /staff/lessons/:id/generate-homework
- POST /staff/lessons/:id/regenerate-memo
- PATCH /staff/questions/:id/memo

All operations verify the current school, active subject-class allocation and chapter ownership. Learner dashboard responses exclude memo answers. Migration 0018 adds class_subject_id to custom concepts and scopes unambiguous legacy custom concepts without deleting data.

AI uses the backend-only OPENAI_API_KEY and OPENAI_MODEL (default gpt-4.1-mini), with the Responses API, strict structured output, store:false, a timeout, bounded question counts and a per-teacher process-local rate limit. Only curriculum labels/question text and teacher correction notes are sent, without learner identities. The local ignored environment file contains the key; the frontend and repository do not. Distributed rate limiting remains future deployment work.

Validation: 28 rolled-back teacher workflow checks, 11 authenticated HTTP checks without writes or AI calls, dashboard and class curriculum regressions, frontend TypeScript/lint and backend compilation. A separate live AI check successfully generated a question and worked memo without writing database records. Browser visual verification was unavailable in this session.

### Teacher books and lesson feedback (updated 2026-10-24)

Prerequisites and learning outcomes are shared curriculum fields on concepts (migration 0024), with zero to five non-empty items of each kind. Lesson planning reads these fields directly, without AI generation or per-class overrides. The app manager can edit or clear them alongside concept names after saving, with stable IDs and curriculum revision checks. New imports support one concept per row: Chapter, Topic, Concept, Prerequisite 1-5, Learning outcome 1-5; the original topic-column format remains supported. The reviewed local enrichment script populated the 23 existing shared concepts across Mathematics Grade 10 and Physical Sciences Grade 11. Planned lessons reflect the current shared guidance; confirming teaching freezes a historical copy in lesson_concepts.teaching_brief. Earlier confirmed lessons keep their history. The former lesson-brief AI generation endpoint and automatic generation queue have been removed. Homework AI generation is unchanged.

Lessons have permanent numbers within each class subject, in creation order: Lesson 1, Lesson 2, and so on. Migration 0022 backfills existing records by creation timestamp/id. A database insert trigger increments an allocation counter, so every creation path receives a unique number and date changes or deleted lessons do not renumber existing lessons. The homework composer shows “You are creating homework for: Lesson N - date” with a Pick another lesson action. Questions appear as compact summaries with one truncated line each for concept, question and memo; View opens the complete editing and memo-correction tools in a dialog. Changes in the dialog require Save.

The teacher bookshelf contains exactly Lessons, Homework, Curriculum and Announcements. Lessons and Homework start with numerically sorted class pages, then alphabetically sorted subject pages. Every Lessons subject has three children: Plan the next lesson, Confirm taught lesson and See lesson feedback. Every Homework subject has only Create homework. Page headings, contents, list rows, counts, actions and native dialogs use the principal workspace styles. Announcements has one Still under development page.

Create homework lists confirmed lessons with concepts and no existing homework. Homework questions test taught concepts; there are no homework understanding reactions or teacher homework-feedback pages. See lesson feedback has a title-row selector for the last ten confirmed lessons in lesson-number order, including lessons without homework. Only the selected lesson's concepts appear, already expanded and sorted from least to most understood; concepts without responses appear last. Learners choose only “I get it” or “I don’t get it” per taught concept. The modal shows these two counts and no-response counts. Sorting uses the proportion of responding learners who get it; ties follow curriculum order. No learner names or identities are returned. Historical “not sure” records remain stored but are excluded from binary counts.

GET /staff/class-subjects/:id/lesson-feedback returns these aggregates. POST /staff/lessons/:id/review-concepts accepts conceptId and adds a taught concept from a confirmed lesson to the earliest owned planned lesson on or after today. With no such plan, it persists a teacher/allocation draft in lesson_review_concepts (migration 0021). The planning response combines the first 10 untaught concepts across all owned chapters with queued review concepts, in curriculum order. Review concepts start checked and can be unchecked. Saving respects the explicit selection and consumes the suggestions shown in that form, including declined ones, without changing original confirmed lesson records or taught coverage. Suggestions queued in another tab after the form loaded remain pending for the following plan. A single lesson may span chapters, with its primary chapter derived from its first selected concept. Duplicate clicks do not duplicate concepts. Planning, learner response submissions and adding review concepts share an allocation transaction lock; adding to an existing plan also locks its lesson row. Reads of lesson concepts follow chapter, topic and concept order, including review concepts from earlier chapters. Teacher endpoints enforce school, active allocation and chapter ownership. Learner GET /learners/me/lessons/:id/feedback and POST /lesson-feedback enforce school, class, active subject and confirmed-lesson access. Feedback closes once the next lesson has been planned. The old homework-feedback and question-reaction endpoints are removed.
