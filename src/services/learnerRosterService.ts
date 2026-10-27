import { createHash } from 'node:crypto';
import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { classes, grades, learners, learnerClassHistory, learnerStreamSelections } from '../db/schema';
import { RosterImportError, validateRosterRows, type RosterRow } from './rosterImportService';
import { syncClassSubjects } from './classSubjectService';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LearnerImportMode = 'add' | 'update' | 'progression';
const key = (value: string) => value.trim().toLowerCase();
/** Reconcile identity by school admission number; an import never deletes an account. */
export async function reviewLearnerRoster(tx: Tx, schoolId: number, classId: number, rows: RosterRow[], mode: LearnerImportMode, academicYear: number) {
  const [target] = await tx.select({ id: classes.id, name: classes.name, academicYear: classes.academicYear, schoolId: grades.schoolId }).from(classes).innerJoin(grades, eq(grades.id, classes.gradeId)).where(eq(classes.id, classId));
  if (!target || target.schoolId !== schoolId) throw new RosterImportError('Choose a class in your school.', 404);
  if (!['add', 'update', 'progression'].includes(mode) || !Number.isInteger(academicYear) || academicYear < target.academicYear || academicYear > 2100 || (mode !== 'progression' && academicYear !== target.academicYear)) throw new RosterImportError('Choose the class’s current academic year, or a later year for progression.');
  const existing = await tx.select({ learner: learners, className: classes.name, classYear: classes.academicYear }).from(learners).leftJoin(classes, eq(classes.id, learners.classId)).where(eq(learners.schoolId, schoolId));
  const numbers = existing.map(row => row.learner.admissionNumber);
  const issues = validateRosterRows(rows, mode === 'add' ? numbers : [], 'learners');
  if (issues.length) throw new RosterImportError(issues.slice(0, 5).map(issue => 'Row ' + issue.row + ': ' + issue.errors.join('; ')).join('. '));
  const matches = rows.map(row => {
    const found = existing.filter(item => key(item.learner.admissionNumber) === key(row.identifier));
    if (found.length > 1) throw new RosterImportError('Admission number ' + row.identifier + ' matches multiple existing records. Correct the school register first.');
    if (found[0]?.classYear && found[0].classYear > academicYear) throw new RosterImportError('Cannot move ' + row.identifier + ' backwards from a later academic year.');
    return { row, existing: found[0] };
  });
  const transfers = matches.filter(item => item.existing?.learner.classId && item.existing.learner.classId !== classId).map(item => ({ admissionNumber: item.row.identifier, name: item.row.firstName + ' ' + item.row.surname, fromClass: item.existing!.className }));
  const desired = new Set(rows.map(row => key(row.identifier)));
  const removed = mode === 'progression' ? existing.filter(item => item.learner.classId === classId && !desired.has(key(item.learner.admissionNumber))).map(item => ({ id: item.learner.id, admissionNumber: item.learner.admissionNumber, name: item.learner.firstName + ' ' + item.learner.surname })) : [];
  const payload = { schoolId, classId, academicYear, mode, rows: rows.map(row => ({ identifier: key(row.identifier), firstName: row.firstName.trim(), surname: row.surname.trim() })), targetYear: target.academicYear, existing: existing.map(item => [item.learner.id, item.learner.admissionNumber, item.learner.classId, item.classYear, item.learner.firstName, item.learner.surname]).sort((a, b) => Number(a[0]) - Number(b[0])) };
  return { target, academicYear, matches, removed, transfers, retained: matches.filter(item => item.existing?.learner.classId === classId).length, added: matches.filter(item => !item.existing).length, assigned: matches.filter(item => item.existing && !item.existing.learner.classId).length, reviewHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
export function rosterImpact(result: Awaited<ReturnType<typeof reviewLearnerRoster>>) {
  return { reviewHash: result.reviewHash, transfers: result.transfers, removed: result.removed.map(({ admissionNumber, name }) => ({ admissionNumber, name })), retained: result.retained, added: result.added, assigned: result.assigned, academicYear: result.academicYear };
}
export async function commitLearnerRoster(tx: Tx, schoolId: number, classId: number, rows: RosterRow[], mode: LearnerImportMode, academicYear: number, reviewHash: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
  await tx.execute(sql`select pg_advisory_xact_lock(7412,${schoolId})`);
  const result = await reviewLearnerRoster(tx, schoolId, classId, rows, mode, academicYear);
  if (result.reviewHash !== reviewHash) throw new RosterImportError('The register or reviewed rows changed. Review the impact again before saving.', 409);
  const now = new Date();
  const affected = [...result.matches.flatMap(item => item.existing ? [item.existing.learner.id] : []), ...result.removed.map(item => item.id)];
  if (affected.length) await tx.select().from(learners).where(inArray(learners.id, affected)).for('update');
  if (mode === 'progression' && academicYear !== result.target.academicYear) {
    await tx.update(classes).set({ academicYear, streamRevision: sql`${classes.streamRevision}+1` }).where(eq(classes.id, classId));
    await syncClassSubjects(tx, classId);
  }
  for (const item of result.removed) {
    await tx.update(learnerClassHistory).set({ endedAt: now }).where(and(eq(learnerClassHistory.learnerId, item.id), isNull(learnerClassHistory.endedAt)));
    await tx.update(learners).set({ classId: null }).where(eq(learners.id, item.id));
  }
  for (const { row, existing } of result.matches) {
    let learnerId = existing?.learner.id;
    if (existing) await tx.update(learners).set({ firstName: row.firstName.trim(), surname: row.surname.trim(), classId }).where(eq(learners.id, learnerId!));
    else { const [created] = await tx.insert(learners).values({ firstName: row.firstName.trim(), surname: row.surname.trim(), admissionNumber: row.identifier.trim(), schoolId, classId }).returning(); learnerId = created.id; }
    const moved = !existing || existing.learner.classId !== classId || existing.classYear !== academicYear;
    if (moved) {
      await tx.update(learnerClassHistory).set({ endedAt: now }).where(and(eq(learnerClassHistory.learnerId, learnerId!), isNull(learnerClassHistory.endedAt)));
      await tx.insert(learnerClassHistory).values({ learnerId: learnerId!, classId, academicYear });
      await tx.delete(learnerStreamSelections).where(eq(learnerStreamSelections.learnerId, learnerId!));
    }
  }
  return { saved: rows.length, ...rosterImpact(result), academicYear };
}
