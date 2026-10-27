/**
 * HTTP routing for this feature. Learner preview and confirmed-lesson response endpoints.
 * The services distinguish these feedback stages. req.params contains URL IDs, req.body
 * contains submitted JSON, and res.json sends the response. Read each handler's guards
 * before assuming access is allowed.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getLessonPreview,
  upsertPreviewFeedback,
} from '../services/learnerFeedbackService';
import { requireAuth, requireLearner } from '../middleware/auth';

import { getLearnerLessonFeedback, submitLessonFeedback } from '../services/lessonResponseService';
import { TeacherError } from '../services/teacherWorkspaceService';
import { db } from '../db';
import { lessons,classSubjects,learners,lessonConcepts } from '../db/schema';
import { and,eq,inArray } from 'drizzle-orm';
import { learnerSubjectIds,StreamChoiceError } from '../services/classStreamService';
import type { AuthPayload } from '../middleware/auth';
async function assertPreviewAccess(caller:AuthPayload,lessonId:number,conceptId?:number){
 await db.transaction(async tx=>{
  const allowed=await learnerSubjectIds(tx,caller);
  const [learner]=await tx.select().from(learners).where(eq(learners.id,caller.accountId));
  const [lesson]=await tx.select({id:lessons.id}).from(lessons).innerJoin(classSubjects,eq(classSubjects.id,lessons.classSubjectId)).where(and(eq(lessons.id,lessonId),eq(classSubjects.classId,learner.classId??-1),eq(classSubjects.active,true),inArray(classSubjects.subjectId,allowed.length?allowed:[-1])));
  if(!lesson)throw new StreamChoiceError('Lesson not found.',404);
  if(conceptId){const [concept]=await tx.select().from(lessonConcepts).where(and(eq(lessonConcepts.lessonId,lessonId),eq(lessonConcepts.conceptId,conceptId)));if(!concept)throw new StreamChoiceError('Concept does not belong to this lesson.',404);}
 });
}
const router = Router();
/**
 * Keep known feedback failures in a consistent HTTP/JSON shape while forwarding unexpected
 * exceptions.
 */
function endpoint(handler: (req: Request, res: Response) => Promise<unknown>) { return async (req: Request, res: Response, next: NextFunction) => { try { await handler(req, res); } catch (error) { if (error instanceof TeacherError) return res.status(error.status).json({ error: error.message }); if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(' ') }); next(error); } }; }

const previewFeedbackSchema = z.object({
  conceptId:   z.number().int().positive(),
  reaction:    z.enum(['new_to_me', 'getting_it', 'will_see_it']),
  isAnonymous: z.boolean().default(true),
});

const lessonFeedbackSchema = z.object({
  lessonConceptId: z.number().int().positive(),
  reaction:        z.enum(['understood', 'didnt_understand']),
  isAnonymous:     z.boolean().default(true),
});


// Flow 5 — get lesson preview (planned concepts)
/**
 * GET /lessons/:lessonId/preview: Read/return data.
 */
router.get('/lessons/:lessonId/preview', requireAuth, requireLearner, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  await assertPreviewAccess(req.caller!,lessonId);
  const concepts = await getLessonPreview(lessonId);
  return res.json(concepts);
});

// Flow 5 — learner submits or updates preview reaction
/**
 * POST /lessons/:lessonId/preview-feedback: Create data or run the submitted operation.
 */
router.post('/lessons/:lessonId/preview-feedback', requireAuth, requireLearner, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const learnerId = req.caller!.accountId;

  const result = previewFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });
  await assertPreviewAccess(req.caller!,lessonId,result.data.conceptId);

  const feedback = await upsertPreviewFeedback({ ...result.data, lessonId, learnerId });
  return res.status(200).json(feedback);
});

// Lesson feedback belongs to taught concepts, never homework questions.
/**
 * GET /learners/me/lessons/:lessonId/feedback: Read/return data.
 */
router.get('/learners/me/lessons/:lessonId/feedback', requireAuth, requireLearner, endpoint(async (req, res) => {
  res.json(await getLearnerLessonFeedback(req.caller!, z.coerce.number().int().positive().parse(req.params.lessonId)));
}));
/**
 * POST /lesson-feedback: Create data or run the submitted operation.
 */
router.post('/lesson-feedback', requireAuth, requireLearner, endpoint(async (req, res) => {
  res.json(await submitLessonFeedback(req.caller!, lessonFeedbackSchema.strict().parse(req.body)));
}));
export default router;
