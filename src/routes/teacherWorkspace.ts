import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireTeacher } from '../middleware/auth';
import { TeacherError, getPlanning, savePlan, confirmPlan, getHomeworkContext, sendHomework, updateQuestionMemo } from '../services/teacherWorkspaceService';
import { generateHomeworkDraft, regenerateMemo } from '../services/homeworkAiService';
const router = Router();
router.use('/staff', requireAuth, requireTeacher);
const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value+'T12:00:00Z'); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value; }, 'Choose a valid date.');
const plan = z.object({ chapterId: id, date, conceptIds: z.array(id).max(100), customConcepts: z.array(z.object({ name: z.string().trim().min(1).max(500), topicId: id })).max(20).optional() });
const homework = z.object({ dueDate: z.iso.datetime({ offset: true }), memoReleaseType: z.enum(['immediately','at_due_date','custom']), memoReleaseAt: z.iso.datetime({ offset: true }).optional(), questions: z.array(z.object({ conceptId: id, body: z.string().trim().min(1).max(12000), memo: z.string().max(24000).optional() })).min(1).max(50) });
function endpoint(handler: (req: Request, res: Response) => Promise<unknown>) { return async (req: Request, res: Response, next: NextFunction) => { try { await handler(req,res); } catch(error) { if(error instanceof TeacherError) { res.status(error.status).json({error:error.message}); return; } if(error instanceof z.ZodError) { res.status(400).json({error:error.issues.map(issue=>issue.message).join(' ')}); return; } next(error); } }; }
router.get('/staff/class-subjects/:id/planning', endpoint(async(req,res)=>res.json(await getPlanning(req.caller!,id.parse(req.params.id)))));
router.post('/staff/class-subjects/:id/plans', endpoint(async(req,res)=>res.status(201).json(await savePlan(req.caller!,id.parse(req.params.id),plan.parse(req.body)))));
router.patch('/staff/lessons/:id/confirm', endpoint(async(req,res)=>res.json(await confirmPlan(req.caller!,id.parse(req.params.id),z.object({conceptIds:z.array(id).max(120)}).parse(req.body).conceptIds))));
router.get('/staff/lessons/:id/homework-context', endpoint(async(req,res)=>res.json(await getHomeworkContext(req.caller!,id.parse(req.params.id)))));
router.post('/staff/lessons/:id/homework', endpoint(async(req,res)=>res.status(201).json(await sendHomework(req.caller!,id.parse(req.params.id),homework.parse(req.body)))));
// Bound AI usage per account in the pilot process; only draft generation calls use this limiter.
const usage = new Map<number,{hour:number;count:number;busy:boolean}>();
function aiLimit(req:Request,res:Response,next:NextFunction) {
  const accountId=req.caller!.accountId, hour=Math.floor(Date.now()/3600000);let entry=usage.get(accountId);
  if(!entry || entry.hour!==hour) {entry={hour,count:0,busy:false};usage.set(accountId,entry);}
  if(entry.busy || entry.count>=40) return res.status(429).json({error:'An AI request is already running, or your hourly generation limit was reached.'});
  entry.busy=true;entry.count++;res.once('finish',()=>{entry!.busy=false;});res.once('close',()=>{entry!.busy=false;});return next();
}
router.post('/staff/lessons/:id/generate-homework', aiLimit, endpoint(async(req,res)=>{
  const data=z.object({counts:z.array(z.object({conceptId:id,count:z.number().int().min(0).max(10)})).min(1).max(100)}).parse(req.body);
  const context=await getHomeworkContext(req.caller!,id.parse(req.params.id));
  if(context.existingHomeworkId) throw new TeacherError('This lesson already has homework.',409);
  res.json(await generateHomeworkDraft(context.gradeNumber,context.chapterName,context.concepts,data.counts));
}));
router.post('/staff/lessons/:id/regenerate-memo', aiLimit, endpoint(async(req,res)=>{
  const data=z.object({conceptId:id,body:z.string().trim().min(1).max(12000),memo:z.string().max(24000),note:z.string().trim().min(1).max(2000)}).parse(req.body);
  const context=await getHomeworkContext(req.caller!,id.parse(req.params.id));const concept=context.concepts.find(item=>item.id===data.conceptId);
  if(!concept) throw new TeacherError('The question must test a concept from this lesson.');
  res.json(await regenerateMemo(context.gradeNumber,concept.name,data.body,data.memo,data.note));
}));
router.patch('/staff/questions/:id/memo',endpoint(async(req,res)=>res.json(await updateQuestionMemo(req.caller!,id.parse(req.params.id),z.object({memo:z.string().max(24000)}).parse(req.body).memo))));
export default router;
