import { Router } from 'express';
import { z } from 'zod';
import { getSchoolById } from '../services/schoolService';
import {
  addPerson,
  getPeopleBySchool,
  findPersonForOnboarding,
  completePeopleOnboarding,
} from '../services/peopleService';
import bcrypt from 'bcrypt';
import { requireAuth, requirePrincipal } from '../middleware/auth';

const router = Router();

const addPersonSchema = z.object({
  title:       z.string().min(1),
  firstName:   z.string().min(1),
  surname:     z.string().min(1),
  staffNumber: z.string().min(1),
});

const onboardingSchema = z.object({
  schoolCode:  z.string().min(1),
  staffNumber: z.string().min(1),
  initials:    z.string().min(1),
  username:    z.string().min(3),
  password:    z.string().min(6),
});

// Add a person to a school
router.post('/schools/:schoolId/people', requireAuth, requirePrincipal, async (req, res) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const school = await getSchoolById(schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });

  const result = addPersonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const person = await addPerson({ ...result.data, schoolId });
  return res.status(201).json(person);
});

// List all people in a school
router.get('/schools/:schoolId/people', requireAuth, requirePrincipal, async (req, res) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const school = await getSchoolById(schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });

  const persons = await getPeopleBySchool(schoolId);
  return res.json(persons);
});

// Person onboarding — look up account before claiming
router.post('/people/onboarding/lookup', async (req, res) => {
  const lookupSchema = z.object({
    schoolCode:  z.string().min(1),
    staffNumber: z.string().min(1),
    initials:    z.string().min(1),
  });

  const result = lookupSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const { schoolCode, staffNumber, initials } = result.data;
  const person = await findPersonForOnboarding(schoolCode, staffNumber, initials);
  if (!person) return res.status(404).json({ error: 'No matching record found' });
  if (person.accountSetUp) return res.status(400).json({ error: 'Account already set up' });

  return res.json({ title: person.title, firstName: person.firstName, surname: person.surname });
});

// Person onboarding — claim account and set username + password
router.post('/people/onboarding', async (req, res) => {
  const result = onboardingSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const { schoolCode, staffNumber, initials, username, password } = result.data;

  const person = await findPersonForOnboarding(schoolCode, staffNumber, initials);
  if (!person) return res.status(400).json({ error: 'No matching record found' });

  if (person.accountSetUp) return res.status(400).json({ error: 'Account already set up' });

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await completePeopleOnboarding(person.id, username, passwordHash);
  return res.status(200).json({ message: 'Account set up successfully', id: updated.id });
});

export default router;