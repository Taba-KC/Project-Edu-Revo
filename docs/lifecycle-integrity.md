# School lifecycle integrity

Implemented 28 October 2026. This describes the current rules, their enforcement, and limits. It is not a promise that every possible school policy has been anticipated.

## Learner transfers and roster changes

- A learner is identified by admission number within their school. Normalised (trimmed, case-insensitive) duplicates are rejected by a database unique index as well as import validation.
- Update imports add/correct/transfer listed learners and leave unlisted learners in the destination class.
- Progression imports reconcile the destination roster for the explicitly selected year: listed learners remain/arrive; unlisted learners lose their current class, not their account.
- Existing IDs, credentials, lesson feedback, homework and teaching records are retained. Transfers close the previous open membership and create a new one. The database permits only one open membership per learner.
- Previous stream choices are retained for their original class/year (one stored choice per class/year). Returning to that same class/year invalidates its old confirmation, so split subjects must be reconfirmed. They cannot grant access to a new class or year because selection resolution also checks current class, year and configuration revision.
- Current-class subject access is re-evaluated by the server. An old browser URL cannot grant access to the previous class's lessons, questions or feedback submission endpoints.
- A learner awaiting assignment cannot use the learning workspace. They must be assigned by school administration.
- Imports reject moves to a year earlier than the learner's existing or recorded historical membership year.

## Fixed lesson audiences and feedback

- Confirming a lesson stores a fixed array of eligible learner IDs from the subject roster at confirmation time. Optional subjects include only learners with the corresponding valid stream choice.
- The audience is the eligible subject cohort, not an attendance register. Absence is not inferred or recorded.
- Teacher feedback summaries, no-response totals and correction-goal suggestions use that lesson's fixed audience. Transferring a learner afterwards does not erase their responses or change the denominator. New learners do not inflate an earlier lesson's denominator.
- Newly arrived learners may read the current class's completed learning material, but cannot submit feedback for a confirmed lesson whose fixed audience does not include them.
- Server feedback submission additionally checks current class, subject eligibility, active allocation and response window. A previous-class learner cannot change old responses after transferring out.
- Confirmed concept names, prerequisites and goals remain frozen in lesson-concept briefs. Curriculum edits and re-teaching do not rewrite that confirmed brief.

### Historical limitation

Before migration 0027 the app did not save lesson audiences. For already confirmed lessons, the migration reconstructs an audience once from existing responders plus learners currently registered in that active class/year. This preserves known responses, but exact historic enrolment/attendance cannot be recovered where it was never recorded. Treat old denominators as reconstructed, especially for previously split classes. New confirmations use the exact eligible cohort at confirmation. Legacy/imported records with a null audience use the live subject roster as a compatibility fallback; normal app confirmation always writes a snapshot.

## Teacher reassignment

- Current staff identity, school, account activation and live role are checked. A signed token containing an old principal role does not preserve that role.
- Current allocation/chapter ownership is rechecked for planning, confirmation, homework and memo changes.
- Replacing a subject's default teacher updates chapters using that default. Deliberate chapter-specific overrides remain assigned to their own teacher.
- Pending correction concepts for chapters now owned by the replacement are merged into the replacement's queue, without duplicate concepts or duplicate focus goals. This also handles reassignment after an unassigned interval.
- Existing lesson plans, confirmed teaching, questions and feedback remain attached to the same class-subject allocation.
- A mixed-chapter lesson cannot be modified by a teacher who owns only some of its included chapters. Administration must align the chapter assignments first. This fails closed rather than allowing one teacher to alter another's lesson content.
- School-local legacy chapter routes also validate the school, grade, subject and assigned staff member.

## Academic-year progression

- Academic years change through reviewed progression; the calendar changing alone does not move learners or roll over classes.
- A new class year gets separate class-subject allocation IDs. Old allocations become inactive and retain all linked history.
- Confirmed coverage, homework, lesson sequence and pending corrections are allocation-specific. The new year starts with untaught coverage rather than inheriting the old year’s taught flags.
- Default teachers and genuine chapter overrides are carried to the new allocation where applicable; their current access still requires a valid staff account.
- Planning dates must be valid calendar dates in the allocation's academic year. Suggested planning dates are clamped to that year.
- Historical allocations are not writable through current-work endpoints. These changes preserve old records in the database; they do not add a new archive-browsing interface.

## Stream changes

- Shared subjects belong to everyone in a master class; optional subjects depend on the learner's confirmed stream choice.
- Stream membership changes increment the class configuration revision. Previous confirmations no longer satisfy the new setup.
- If changed optional subjects require missing room information, learners receive an awaiting-class-setup state. If configuration is complete, they must reconfirm their subjects before continuing.
- Removed subjects are deactivated, not deleted with their lessons. Restoring the subject in the same year reuses its allocation/history.
- Existing lesson audience snapshots remain unchanged by stream changes.

## Administrative permissions

- Each administrative request checks live school-scoped grants. Removing a grant affects subsequent requests without requiring sign-in again.
- Principal checks use the current database role, not the JWT's historical role label. A missing, moved or deactivated staff account cannot use its old token.
- A request already authorised before revocation may finish; this is not cancellation of in-flight requests. The following request must pass the live checks again.
- Permissions shown in the browser refresh when the app regains focus. Server checks remain authoritative even while an old page is open.

## Atomic operations and race prevention

- Reviewed imports run inside one database transaction. Account changes, membership closures/creation, class-year changes and subject reconciliation succeed together or roll back together.
- A review hash is checked again while saving. Stale previews and edited rows must be reviewed again.
- Short lifecycle writes use the same advisory lock before allocation/lesson locks. Transfers, rollover, teacher handovers and lesson/feedback writes cannot interleave halfway through those transitions.
- A separate per-allocation lock preserves planning sequences and feedback windows. Row locks prevent duplicate confirmation and duplicate homework sends.
- Database constraints additionally reject cross-school learner/class and teacher/class links, active allocations in the wrong class year, duplicate normalised admission numbers and multiple open memberships.
- The lifecycle advisory lock currently serialises these operations across the app. It favours consistency for the pilot; a larger deployment can narrow its scope with a deliberate lock-order design.

## Deletion protection

A class with current learners, recorded membership history or lessons cannot be deleted through class cleanup. The API returns 409 with an explanation. This prevents class deletion from silently destroying learner accounts, transferred learners' feedback or past teaching. Empty unused classes can still be deleted. Retain historical classes; an archive-management feature is separate work.

## Validation

`npm run test:lifecycle-integrity` creates isolated fixtures and rolls them back. It covers transfers, original feedback totals, newcomer feedback denial, teacher replacement/correction handover, year-specific allocations and lesson dates, membership closure, rollback after a late import failure, cross-school constraints, protected deletion and stale-role tokens. Existing school-workflow, teacher, learner, feedback, roster, curriculum and HTTP suites provide additional regression coverage.


## Direct class moves

In Grades & Classes, open the source class's Learners tab and choose **Move learners**. All learners are selected initially; the administrator can select a subset. Choose another class in the same grade and academic year, review the numbers and destination, then confirm. Existing destination learners are retained. The source register refreshes after success. Class streams are not swapped or changed by this action.

`learnerTransferService.ts` resolves the selected learner IDs on the server, builds roster rows from existing records, and reuses the atomic update-import reconciliation. `/learner-transfers/review` is read-only; `/learner-transfers/commit` rechecks a server-generated review hash under the lifecycle locks. Cross-school requests, same-class destinations, cross-grade/year direct moves, duplicate IDs, missing learners and stale reviews are rejected. Direct moves require Grades & Classes or Learners administrative work (or principal access). Changing grade/year remains an explicit progression import.
