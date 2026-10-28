import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { classes, grades, streams, streamSubjects, subjects, classStreams, learners, learnerStreamSelections, classSubjects, lessons } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class StreamChoiceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type SplitConfiguration = { primarySubjectId: number; locations: { subjectId: number; building: string; classroom: string }[] };
/** The intersection is shared by everyone; a selected stream supplies its remaining subjects. */
export async function streamOptions(tx: Tx, classId: number) {
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new StreamChoiceError('Class not found.', 404);
  const links = await tx.select().from(classStreams).where(eq(classStreams.classId, classId));
  const ids = links.map(link => link.streamId);
  // Compatibility with a newly created legacy single-stream class inside its transaction.
  if (!ids.length && cls.streamId) ids.push(cls.streamId);
  const rows = ids.length ? await tx.select({ streamId: streams.id, streamName: streams.name, subjectId: subjects.id, subjectName: subjects.name }).from(streams).leftJoin(streamSubjects, eq(streamSubjects.streamId, streams.id)).leftJoin(subjects, eq(subjects.id, streamSubjects.subjectId)).where(inArray(streams.id, ids)).orderBy(streams.id, subjects.name) : [];
  const options = ids.map(id => ({ id, name: rows.find(row => row.streamId === id)?.streamName ?? 'Stream', subjects: rows.filter(row => row.streamId === id && row.subjectId !== null).map(row => ({ id: row.subjectId!, name: row.subjectName! })) }));
  const union = [...new Map(options.flatMap(option => option.subjects).map(subject => [subject.id, subject])).values()];
  const common = union.filter(subject => options.every(option => option.subjects.some(row => row.id === subject.id)));
  const different = union.filter(subject => !common.some(row => row.id === subject.id));
  return { cls, options, common, different, split: options.length > 1 && different.length > 0 };
}
export async function saveClassStreams(tx: Tx, classId: number, schoolId: number, streamIds: number[], configuration: SplitConfiguration | null) {
  await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
  const [cls] = await tx.select({ id: classes.id, schoolId: grades.schoolId }).from(classes).innerJoin(grades, eq(grades.id, classes.gradeId)).where(eq(classes.id, classId)).for('update');
  if (!cls || cls.schoolId !== schoolId) throw new StreamChoiceError('Class not found.', 404);
  if (!streamIds.length || new Set(streamIds).size !== streamIds.length || streamIds.length > 10) throw new StreamChoiceError('Choose 1–10 different school streams.');
  const allowed = await tx.select().from(streams).where(and(inArray(streams.id, streamIds), eq(streams.schoolId, schoolId)));
  if (allowed.length !== streamIds.length) throw new StreamChoiceError('Choose streams from this school.');
  const old = await streamOptions(tx, classId);
  await tx.delete(classStreams).where(eq(classStreams.classId, classId));
  await tx.insert(classStreams).values(streamIds.map(streamId => ({ classId, streamId })));
  await tx.update(classes).set({ streamId: streamIds[0] }).where(eq(classes.id, classId));
  const next = await streamOptions(tx, classId);
  if (next.split) {
    if (!configuration || !next.different.some(subject => subject.id === configuration.primarySubjectId)) throw new StreamChoiceError('Select the primary split subject taught in this master class.');
    const secondary = next.different.filter(subject => subject.id !== configuration.primarySubjectId);
    if (configuration.locations.length !== secondary.length || new Set(configuration.locations.map(row => row.subjectId)).size !== secondary.length || secondary.some(subject => !configuration.locations.some(row => row.subjectId === subject.id && row.building.trim() && row.classroom.trim()))) throw new StreamChoiceError('Specify a building and classroom for every secondary split subject.');
  }
  const changed = JSON.stringify(old.options.map(o => [o.id, o.subjects.map(s => s.id).sort()]).sort()) !== JSON.stringify(next.options.map(o => [o.id, o.subjects.map(s => s.id).sort()]).sort());
  await tx.update(classes).set({ streamConfiguration: next.split ? configuration : null, ...(changed ? { streamRevision: sql`${classes.streamRevision}+1` } : {}) }).where(eq(classes.id, classId));
  return next;
}
export async function learnerLearningSetup(tx: Tx, caller: AuthPayload) {
  const [learner] = await tx.select().from(learners).where(and(eq(learners.id, caller.accountId), eq(learners.schoolId, caller.schoolId ?? -1), eq(learners.accountSetUp, true)));
  if (caller.accountType !== 'learner' || !learner) throw new StreamChoiceError('Learner not found.', 404);
  if (!learner.classId) return { status: 'awaiting-class' as const, learner: { firstName: learner.firstName }, classId: null, options: [], common: [], different: [], configuration: null, academicYear: null, revision: 0 };
  const info = await streamOptions(tx, learner.classId);
  const [grade] = await tx.select().from(grades).where(eq(grades.id, info.cls.gradeId));
  if (grade.schoolId !== learner.schoolId) throw new StreamChoiceError('Class does not belong to your school.', 403);
  const [selection] = await tx.select().from(learnerStreamSelections).where(and(eq(learnerStreamSelections.learnerId, learner.id), eq(learnerStreamSelections.classId, learner.classId), eq(learnerStreamSelections.academicYear, info.cls.academicYear), eq(learnerStreamSelections.revision, info.cls.streamRevision)));
  const confirmed = !!selection && info.options.some(option => option.id === selection.streamId);
  const config = info.cls.streamConfiguration;
  const configured = !info.split || !!config && info.different.some(subject => subject.id === config.primarySubjectId) && info.different.filter(subject => subject.id !== config.primarySubjectId).every(subject => config.locations.some(location => location.subjectId === subject.id && location.building.trim() && location.classroom.trim()));
  return { status: !configured ? 'awaiting-class-setup' as const : info.split && !confirmed ? 'choose-subjects' as const : 'ready' as const, learner: { firstName: learner.firstName }, classId: learner.classId, className: info.cls.name, academicYear: info.cls.academicYear, revision: info.cls.streamRevision, options: info.options, common: info.common, different: info.different, configuration: config, selectedStreamId: confirmed ? selection.streamId : null };
}
export async function learnerSubjectIds(tx: Tx, caller: AuthPayload) {
  const setup = await learnerLearningSetup(tx, caller);
  if (setup.status !== 'ready') throw new StreamChoiceError(setup.status === 'awaiting-class' ? 'Your school must assign your current class.' : setup.status === 'awaiting-class-setup' ? 'Your school must complete the class subject and classroom setup.' : 'Confirm your split subjects before continuing.', 409);
  if (!setup.options.length) { const allocated = await tx.select({ id: classSubjects.subjectId }).from(classSubjects).where(and(eq(classSubjects.classId, setup.classId!), eq(classSubjects.active, true), eq(classSubjects.academicYear, setup.academicYear!))); return allocated.map(row => row.id); }
  return [...new Set((setup.selectedStreamId ? setup.options.filter(option => option.id === setup.selectedStreamId) : setup.options).flatMap(option => option.subjects.map(subject => subject.id)))];
}
/** The teacher's subject roster excludes learners taking the other optional subject. */
export async function subjectRoster(tx: Tx, classSubjectId: number) {
  const [allocation] = await tx.select().from(classSubjects).where(eq(classSubjects.id, classSubjectId));
  if (!allocation) return [];
  const info = await streamOptions(tx, allocation.classId);
  if (!allocation.active || allocation.academicYear !== info.cls.academicYear) return [];
  const roster = await tx.select({ id: learners.id }).from(learners).where(eq(learners.classId, allocation.classId));
  if (!info.split || info.common.some(subject => subject.id === allocation.subjectId)) return roster;
  const choices = await tx.select().from(learnerStreamSelections).where(and(eq(learnerStreamSelections.classId, allocation.classId), eq(learnerStreamSelections.academicYear, allocation.academicYear), eq(learnerStreamSelections.revision, info.cls.streamRevision)));
  return roster.filter(learner => choices.some(choice => choice.learnerId === learner.id && info.options.some(option => option.id === choice.streamId && option.subjects.some(subject => subject.id === allocation.subjectId))));
}

/** A taught lesson keeps its original audience when learners transfer or streams change.
 * Null is reserved for legacy/imported records lacking a confirmation snapshot. */
export async function lessonRoster(tx: Tx, lessonId: number) {
  const [lesson] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson) return [];
  if (lesson.learnerIdsSnapshot !== null) return lesson.learnerIdsSnapshot.map(id => ({ id }));
  return subjectRoster(tx, lesson.classSubjectId);
}
