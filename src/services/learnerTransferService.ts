import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { classes, grades, learners } from '../db/schema';
import { reviewLearnerRoster, commitLearnerRoster } from './learnerRosterService';
import { RosterImportError } from './rosterImportService';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Direct class moves reuse reviewed roster reconciliation, including membership history.
 * Year/grade progression remains a separate, explicitly reviewed import operation. */
export async function reviewLearnerTransfer(tx: Tx, schoolId: number, sourceId: number, targetId: number, learnerIds: number[]) {
  if (sourceId === targetId) throw new RosterImportError('Choose a different destination class.');
  if (!learnerIds.length || learnerIds.length > 500 || new Set(learnerIds).size !== learnerIds.length) throw new RosterImportError('Select 1–500 different learners to move.');
  const available = await tx.select({ id: classes.id, name: classes.name, gradeId: classes.gradeId, academicYear: classes.academicYear, revision: classes.streamRevision }).from(classes).innerJoin(grades,eq(grades.id,classes.gradeId)).where(and(inArray(classes.id,[sourceId,targetId]),eq(grades.schoolId,schoolId)));
  const source=available.find(row=>row.id===sourceId), target=available.find(row=>row.id===targetId);
  if (!source || !target) throw new RosterImportError('Choose source and destination classes in your school.',404);
  if (source.gradeId!==target.gradeId || source.academicYear!==target.academicYear) throw new RosterImportError('Direct moves require classes in the same grade and academic year. Use grade progression for a change of grade or year.');
  const roster=await tx.select().from(learners).where(and(eq(learners.schoolId,schoolId),eq(learners.classId,sourceId))).orderBy(learners.id);
  const selected=roster.filter(row=>learnerIds.includes(row.id));
  if (selected.length!==learnerIds.length) throw new RosterImportError('Some selected learners are no longer in this class. Refresh the register and review again.',409);
  const rows=selected.map(row=>({firstName:row.firstName,surname:row.surname,identifier:row.admissionNumber}));
  const impact=await reviewLearnerRoster(tx,schoolId,targetId,rows,'update',target.academicYear);
  const reviewHash=createHash('sha256').update(JSON.stringify({source,target,learnerIds:[...learnerIds].sort((a,b)=>a-b),roster:roster.map(row=>row.id),rosterHash:impact.reviewHash})).digest('hex');
  return { reviewHash, rosterHash:impact.reviewHash, rows, source, target, count:selected.length, remaining:roster.length-selected.length, learners:selected.map(row=>({id:row.id,firstName:row.firstName,surname:row.surname,admissionNumber:row.admissionNumber})) };
}
export async function commitLearnerTransfer(tx: Tx, schoolId: number, sourceId: number, targetId: number, learnerIds: number[], reviewHash: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
  await tx.execute(sql`select pg_advisory_xact_lock(7412,${schoolId})`);
  const review=await reviewLearnerTransfer(tx,schoolId,sourceId,targetId,learnerIds);
  if (review.reviewHash!==reviewHash) throw new RosterImportError('The register or class subjects changed. Review the move again before confirming.',409);
  await commitLearnerRoster(tx,schoolId,targetId,review.rows,'update',review.target.academicYear,review.rosterHash);
  return { moved:review.count,sourceClassId:sourceId,targetClassId:targetId,remaining:review.remaining };
}
