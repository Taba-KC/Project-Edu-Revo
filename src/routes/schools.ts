import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  seedSchool,
  getAllSchools,
  getSchoolById,
  activateSchool,
} from '../services/schoolService';

const router = Router();

const seedSchoolSchema = z.object({
  circuitId:      z.number().int().positive(),
  name:           z.string().min(1),
  activationCode: z.string().min(6),
});

const activateSchoolSchema = z.object({
  schoolId:       z.number().int().positive(),
  code:           z.string().min(2).max(10).toUpperCase(),
  activationCode: z.string().min(1),
});

router.post('/schools/seed', async (req: Request, res: Response) => {
  const result = seedSchoolSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const school = await seedSchool(result.data);
  res.status(201).json(school);
});

router.post('/schools/activate', async (req: Request, res: Response) => {
  const result = activateSchoolSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const school = await activateSchool(result.data);
  if (!school) {
    res.status(400).json({ error: 'Invalid activation code' });
    return;
  }

  res.json(school);
});

router.get('/schools', async (_req: Request, res: Response) => {
  const schools = await getAllSchools();
  res.json(schools);
});

router.get('/schools/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid school ID' });
    return;
  }

  const school = await getSchoolById(id);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  res.json(school);
});

export default router;




/** NOTES */

/*
 * createSchoolSchema — the Zod schema that validates incoming data for creating a school. 
    - name must be a non-empty string. 
    - code must be between 2 and 10 characters and is automatically converted to uppercase — so whether the admin types "mok" or "MOK", it is stored as "MOK".
 * safeParse — validates the request body against the schema. 
    - Unlike parse, it does not throw on failure — it returns an object with success: true and the validated data, or success: false and the errors. 
      - This lets you handle validation failures gracefully.
 * res.status(400) — HTTP 400 means "Bad Request" — the client sent invalid data. 
      - This is the correct status code when validation fails.
 * res.status(201) — HTTP 201 means "Created" — a new resource was successfully created. 
      - More precise than 200 for POST requests that create something.
 * req.params.id — URL parameters are always strings, even if they look like numbers. 
      - parseInt converts the string "5" to the number 5. isNaN catches cases where the URL contains something that is not a number at all — like /schools/abc.
 * res.status(404) — HTTP 404 means "Not Found." 
      - Returned when a valid ID is given but no school with that ID exists.
 */




/** ADDITIONAL NOTES */

/*
 * POST /schools is replaced with POST /schools/seed — seeding a school is a platform-level operation. The name makes the intent explicit. Later, this route will be protected so only platform administrators can call it.
 * POST /schools/activate is new — this is what a school administrator calls when they claim their school. They submit the schoolId, their chosen code (like "MOK"), and the activationCode we sent them. If the activation code matches, the school is activated and the code is set.
 * The two GET routes remain unchanged.
    
     Why activate returns a 400 and not a 404 on a wrong code:

 * A 404 would tell the caller "this school does not exist." 
 * A 400 tells them "your request was invalid." 
 * Returning 404 on a wrong activation code would leak information — it confirms the school exists but the code is wrong. 
 * A generic 400 with "Invalid activation code" gives nothing away.
 */