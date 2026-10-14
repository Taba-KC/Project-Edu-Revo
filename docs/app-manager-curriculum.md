# App manager curriculum flow

App managers are platform accounts, separate from school staff. They can add subjects to the shared catalog at any time, then manage a separate curriculum for each subject and Grade 8–12.

## Use

1. Sign in at http://localhost:3001/manager/login, or use the main sign-in page.
2. Choose a subject and grade; click Load curriculum. Add subject to catalog creates another shared subject when needed.
3. Upload an .xlsx or .csv workbook (up to 2 MB). Upload only previews the workbook and makes no curriculum changes.
4. Choose a worksheet and review Chapter → Topic → Concept labels and ordering. Similar chapter headings generate a warning without silently changing the source text. Combine into chapter merges unsaved preview chapters and preserves the relative order of their topics.
5. Save curriculum. Shared chapters are created under the selected subject/grade, topics under those chapters, and ordered concepts under the topics. Existing matching classes receive chapter links with their allocated subject teacher.
6. Reload later to rename, add, reorder, insert, replace or remove entries. A replacement spreadsheet is also supported, with an explicit review notice; old curriculum entries are retired only on save.

## Workbook format

Row 1: chapter labels. Row 2: topic labels, one topic per column. Rows 3 onward: concepts for that topic in teaching order. Repeat a chapter label above each of its topic columns; horizontal merged chapter headings are also supported. Blank concept cells and fully empty columns are ignored. Every populated column must have both headers. Formula cells are rejected.

Chapters follow first appearance from left to right. Topics follow column order within their chapter. Concepts follow row order. Chapter grouping ignores case and repeated whitespace. Limits: 10 worksheets, 100 topic columns, 2,000 concept rows, and 5,000 saved concepts. Labels contain 1–1,000 characters. Chapter labels must be unique; topic labels must be unique within a chapter; concept labels must be unique within a topic.

## Identity and history

Renaming and reordering keep IDs. Insert after adds a new concept at that position. Replace creates a new concept ID and retires the previous one. Removing a chapter, topic or concept retires active platform entries while preserving lesson and feedback references. Teacher custom concepts remain outside the manager editor. The chapter concept list used by existing clients remains a flat list, ordered by topic and then concept, excluding retired parents.

Migration 0017 adds the topic level. Existing chapter/concept IDs remain intact, with previous concepts grouped under a General topic until reviewed. A composite foreign key ensures that a concept's topic belongs to its chapter. Existing curriculum revisions are advanced so stale editors must reload.

## Subject names

Subjects can be added later without changing existing streams or curricula. Names are trimmed and repeated whitespace is collapsed. A database unique index rejects duplicate names regardless of capitalization or extra whitespace, including concurrent requests. The API returns HTTP 409 with That subject already exists.

## API and access

- POST /auth/managers/login
- GET /manager/subjects
- POST /manager/subjects
- POST /manager/curricula/preview (multipart file)
- GET /manager/curricula/:subjectId/:gradeNumber
- POST /manager/curricula (reviewed nested chapters/topics/concepts, selection and revision)

All manager routes require an active manager account. Saving is transactional and revision-checked; stale saves return HTTP 409. Class setup, teacher assignment and curriculum publication share a transaction lock. Reads use a consistent snapshot.

## Validation

npm run test:curriculum checks parsing, labels, chapter/topic/concept ordering and identity, insertion, replacement, retirement, lesson references, teacher inheritance, invalid parent IDs, subject uniqueness and stale saves. Principal setup and fixed-grade regressions remain under test:principal-setup and test:fixed-grades.
