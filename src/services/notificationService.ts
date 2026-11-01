import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { notificationReads, questions } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
import { getDashboard } from './dashboardService';
import { getLearnerWorkspace } from './learnerWorkspaceService';
import { getLessonFeedback } from './teacherLessonFeedbackService';
import { TeacherError, schoolDate } from './teacherWorkspaceService';

type Database = Pick<typeof db, 'transaction'>;
export type LearningNotification = {
  id: string; message: string; action: string; bookId: 'lessons' | 'homework';
  pageId: string; subjectId?: number; lessonId?: number; activityId?: number;
  tab?: 'upcoming' | 'completed' | 'latest' | 'previous'; context?: string; date: string;
};
const version = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
const labelDate = (date: string, today: string, tomorrow: string) => date === today ? "today's" : date === tomorrow ? "tomorrow's" : `the ${date}`;

/** Derive alerts from the same authorized records used by the books. No learner identities or answers leave this service. */
export async function learningNotifications(caller: AuthPayload, database: Database = db, now = new Date()): Promise<LearningNotification[]> {
  if (!caller.schoolId) throw new TeacherError('School access required.', 403);
  const today = schoolDate(now), tomorrow = schoolDate(new Date(now.getTime() + 86400000));
  const result: LearningNotification[] = [];
  if (caller.accountType === 'learner') {
    const workspace = await getLearnerWorkspace(caller, database, now);
    const releasedIds = workspace.subjects.flatMap(subject => subject.homework.filter(hw => hw.canReveal).map(hw => hw.id));
    // Test actual answer availability without reading or returning memo contents.
    const answered = releasedIds.length ? await database.transaction(tx => tx.selectDistinct({ homeworkId: questions.homeworkId }).from(questions).where(and(inArray(questions.homeworkId, releasedIds), sql`length(trim(coalesce(${questions.memo}, ''))) > 0`))) : [];
    for (const subject of workspace.subjects) {
      const common = { subjectId: subject.id, pageId: `subject-${subject.id}`, context: subject.subjectName };
      // The Upcoming tab displays the newest saved plan, so target that same record.
      const upcoming = subject.lessons.filter(lesson => lesson.status === 'planned').sort((a, b) => b.lessonNumber - a.lessonNumber)[0];
      if (upcoming && upcoming.date >= today) result.push({ ...common, id: `plan-${upcoming.id}-${version([upcoming.date, upcoming.concepts])}`, bookId: 'lessons', lessonId: upcoming.id, tab: 'upcoming', date: upcoming.date, message: `Your ${subject.subjectName} teacher has published ${labelDate(upcoming.date, today, tomorrow)} lesson.`, action: 'Prepare for lesson' });
      for (const lesson of subject.lessons) {
        if (lesson.date <= today && lesson.canRespond && lesson.concepts.some(concept => concept.learningOutcomes.some((_, index) => concept.answers[index] === null))) result.push({ ...common, id: `respond-${lesson.id}`, bookId: 'lessons', lessonId: lesson.id, tab: 'completed', date: lesson.date, message: `How well did you understand ${labelDate(lesson.date, today, tomorrow)} ${subject.subjectName} lesson?`, action: 'Give feedback' });
      }
      const latest = Math.max(0, ...subject.homework.map(hw => hw.activityNumber));
      for (const activity of subject.homework) {
        const base = { ...common, bookId: 'homework' as const, activityId: activity.id, tab: activity.activityNumber === latest ? 'latest' as const : 'previous' as const, date: activity.dueDate.toISOString() };
        if (activity.questions.length && activity.dueDate.getTime() >= now.getTime()) result.push({ ...base, id: `homework-${activity.id}`, message: `Your ${subject.subjectName} teacher has published homework.`, action: 'Open homework' });
        if (answered.some(row => row.homeworkId === activity.id)) result.push({ ...base, id: `answers-${activity.id}-${version(activity.releaseAt)}`, message: `Answers to your ${subject.subjectName} homework are now available.`, action: 'Review answers' });
      }
    }
  } else if (caller.accountType === 'person' && ['teacher', 'principal'].includes(caller.role ?? '')) {
    const dashboard = await getDashboard('staff', caller.accountId, caller.schoolId, database, now);
    if (dashboard.subjects.length && !dashboard.subjects.some(subject => subject.lessons.some(lesson => lesson.status === 'planned' && lesson.date === tomorrow))) {
      result.push({ id: `planning-${tomorrow}`, message: 'You have no lessons planned for tomorrow.', action: 'Plan a lesson', bookId: 'lessons', pageId: `plan-${dashboard.subjects[0]!.id}`, date: today });
    }
    for (const subject of dashboard.subjects) {
      const sets = await getLessonFeedback(caller, subject.id, database);
      for (const set of sets) {
        const goals = set.concepts.flatMap(concept => concept.learningGoals);
        if (!goals.some(goal => goal.responses > 0)) continue;
        const common = { subjectId: subject.id, pageId: `lesson-feedback-${subject.id}`, bookId: 'lessons' as const, lessonId: set.id, context: `${subject.subjectName} · ${subject.className}`, date: set.lessonDate };
        const signature = version(goals.map(goal => [goal.goalIndex, goal.goal, goal.yes, goal.no]));
        result.push({ ...common, id: `feedback-${set.id}-${signature}`, message: `Learners have submitted feedback on ${labelDate(set.lessonDate, today, tomorrow)} lesson.`, action: 'Review feedback' });
        const low = goals.filter(goal => goal.no > 0).length;
        if (low) result.push({ ...common, id: `understanding-${set.id}-${signature}`, message: `${low} learning outcome${low === 1 ? '' : 's'} received low understanding ratings.`, action: 'Review learning outcomes' });
      }
    }
  } else throw new TeacherError('Learning workspace access required.', 403);
  return result.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export async function getNotifications(caller: AuthPayload, database: Database = db, now = new Date()) {
  const notifications = await learningNotifications(caller, database, now);
  const reads = await database.transaction(tx => tx.select({ id: notificationReads.notificationId }).from(notificationReads).where(and(eq(notificationReads.schoolId, caller.schoolId!), eq(notificationReads.accountType, caller.accountType), eq(notificationReads.accountId, caller.accountId))));
  const ids = new Set(reads.map(row => row.id));
  return notifications.map(item => ({ ...item, read: ids.has(item.id) }));
}

/** Accept only IDs in this caller's current feed; never accept a recipient from the browser. */
export async function markNotificationsRead(caller: AuthPayload, ids: string[], database: Database = db, now = new Date()) {
  const visible = await learningNotifications(caller, database, now);
  const allowed = [...new Set(ids)].filter(id => visible.some(item => item.id === id));
  if (allowed.length) await database.transaction(tx => tx.insert(notificationReads).values(allowed.map(notificationId => ({ schoolId: caller.schoolId!, accountType: caller.accountType, accountId: caller.accountId, notificationId }))).onConflictDoNothing());
  return { ids: allowed };
}
