import { Router } from 'express';
import { z } from 'zod';
import { getSchoolById } from '../services/schoolService';
import {
  addLearner,
  getLearnersByClass,
  findLearnerForOnboarding,
  completeLearnerOnboarding,
} from '../services/learnerService';
import bcrypt from 'bcrypt';
import { requireAuth, requirePrincipal } from '../middleware/auth';

const router = Router();

const addLearnerSchema = z.object({
  title:           z.string().min(1),
  firstName:       z.string().min(1),
  surname:         z.string().min(1),
  admissionNumber: z.string().min(1),
  classId:         z.number().int().positive(),
});

const onboardingSchema = z.object({
  schoolCode:      z.string().min(1),
  admissionNumber: z.string().min(1),
  initials:        z.string().min(1),
  username:        z.string().min(3),
  password:        z.string().min(6),
});

// Add a learner to a class
router.post('/schools/:schoolId/learners', requireAuth, requirePrincipal, async (req, res) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const school = await getSchoolById(schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });

  const result = addLearnerSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const learner = await addLearner({ ...result.data, schoolId });
  return res.status(201).json(learner);
});

// List all learners in a class
router.get('/schools/:schoolId/classes/:classId/learners', requireAuth, requirePrincipal, async (req, res) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const classId = parseInt(req.params.classId as string);

  const school = await getSchoolById(schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });

  const learnerList = await getLearnersByClass(classId);
  return res.json(learnerList);
});

// Learner onboarding — look up account before claiming
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

  return res.json({ title: learner.title, firstName: learner.firstName, surname: learner.surname });
});

// Learner onboarding — claim account and set username + password
router.post('/learners/onboarding', async (req, res) => {
  const result = onboardingSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const { schoolCode, admissionNumber, initials, username, password } = result.data;

  const learner = await findLearnerForOnboarding(schoolCode, admissionNumber, initials);
  if (!learner) return res.status(400).json({ error: 'No matching record found' });

  if (learner.accountSetUp) return res.status(400).json({ error: 'Account already set up' });

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await completeLearnerOnboarding(learner.id, username, passwordHash);
  return res.status(200).json({ message: 'Account set up successfully', id: updated.id });
});

export default router;