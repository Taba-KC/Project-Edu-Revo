/**
 * HTTP routing for this feature. Learner roster/account-claim endpoints. Read each handler's
 * actual guards; a URL parameter alone is not permission to access a school. req.params
 * contains URL IDs, req.body contains submitted JSON, and res.json sends the response. Read
 * each handler's guards before assuming access is allowed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getSchoolById } from '../services/schoolService';
import {
  addLearner,
  getLearnersByClass,
  findLearnerForOnboarding,
} from '../services/learnerService';
import { db } from '../db';
import { classes, grades } from '../db/schema';
import { and,eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';

import { requireSchoolAdministration } from "../middleware/schoolAdministration";
const requireSchoolAdmin = requireSchoolAdministration(["learners", "grades"],["learners", "grades"]);
const router = Router();

const addLearnerSchema = z.object({
  firstName:       z.string().min(1),
  surname:         z.string().min(1),
  admissionNumber: z.string().min(1),
  classId:         z.number().int().positive(),
});

// Add a learner to a class
/**
 * POST /schools/:schoolId/learners: Create data or run the submitted operation.
 */
router.post('/schools/:schoolId/learners', requireAuth, requireSchoolAdmin, async (req, res) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const school = await getSchoolById(schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });

  const result = addLearnerSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });
  const [target]=await db.select({id:classes.id}).from(classes).innerJoin(grades,eq(grades.id,classes.gradeId)).where(and(eq(classes.id,result.data.classId),eq(grades.schoolId,schoolId)));
  if(!target)return res.status(404).json({error:'Class not found in this school.'});

  try {
    const learner = await addLearner({ ...result.data, schoolId });
    return res.status(201).json(learner);
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (failure.code === '23505' || failure.cause?.code === '23505') return res.status(409).json({ error: 'This admission number already exists in your school. Use a reviewed class register update to transfer the learner.' });
    throw error;
  }
});

// List all learners in a class
/**
 * GET /schools/:schoolId/classes/:classId/learners: Read/return data.
 */
router.get('/schools/:schoolId/classes/:classId/learners', requireAuth, requireSchoolAdmin, async (req, res) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const classId = parseInt(req.params.classId as string);
  const [target]=await db.select({id:classes.id}).from(classes).innerJoin(grades,eq(grades.id,classes.gradeId)).where(and(eq(classes.id,classId),eq(grades.schoolId,schoolId)));
  if(!target)return res.status(404).json({error:'Class not found in this school.'});

  const school = await getSchoolById(schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });

  const learnerList = await getLearnersByClass(classId);
  return res.json(learnerList);
});

// Learner onboarding — look up account before claiming
/**
 * POST /learners/onboarding/lookup: Create data or run the submitted operation.
 */
router.post('/learners/onboarding/lookup', async (req, res) => {
  const lookupSchema = z.object({
    schoolCode:      z.string().min(1),
    admissionNumber: z.string().min(1),
    initials:        z.string().min(1),
  });

  const result = lookupSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const { schoolCode, admissionNumber, initials } = result.data;
  const learner = await findLearnerForOnboarding(schoolCode, admissionNumber, initials);
  if (!learner) return res.status(404).json({ error: 'No matching record found' });
  if (learner.accountSetUp) return res.status(400).json({ error: 'Account already set up' });

  return res.json({ firstName: learner.firstName, surname: learner.surname });
});

// Credential proposals are handled by accountReviewsRouter; activation requires manager review.
export default router;
