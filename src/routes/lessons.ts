/**
 * HTTP routing for this feature. Older lesson endpoints using lessonService. Current teacher
 * planning/confirmation uses teacherWorkspace. req.params contains URL IDs, req.body
 * contains submitted JSON, and res.json sends the response. Read each handler's guards
 * before assuming access is allowed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTeacher } from '../middleware/auth';
import { db } from '../db';
import { TeacherError, teacherScope, lessonScope, savePlan, confirmPlan } from '../services/teacherWorkspaceService';
import { getLessonsByClassSubject, getLessonConcepts } from '../services/lessonService';
import { getDashboard } from '../services/dashboardService';
const router=Router();
const id=z.coerce.number().int().positive();
const plan=z.object({chapterId:id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),conceptIds:z.array(id).min(1).max(100)});
// Legacy URLs retain their shape but now use the same assignment checks and atomic writes.
/**
 * POST /class-subjects/:classSubjectId/lessons: Create data or run the submitted operation.
 */
router.post('/class-subjects/:classSubjectId/lessons',requireAuth,requireTeacher,async(req,res)=>{
 const input=plan.safeParse(req.body);if(!input.success)return res.status(400).json({error:'Choose a chapter, date and concepts.'});
 try{return res.status(201).json(await savePlan(req.caller!,id.parse(req.params.classSubjectId),input.data));}catch(error){if(error instanceof TeacherError)return res.status(error.status).json({error:error.message});throw error;}
});
/**
 * PATCH /lessons/:lessonId/confirm: Apply an edit to an existing record.
 */
router.patch('/lessons/:lessonId/confirm',requireAuth,requireTeacher,async(req,res)=>{
 const input=z.object({conceptIds:z.array(id).max(120)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'Choose the concepts actually taught.'});
 try{return res.json(await confirmPlan(req.caller!,id.parse(req.params.lessonId),input.data.conceptIds));}catch(error){if(error instanceof TeacherError)return res.status(error.status).json({error:error.message});throw error;}
});
/**
 * GET /class-subjects/:classSubjectId/lessons: Read/return data.
 */
router.get('/class-subjects/:classSubjectId/lessons',requireAuth,requireTeacher,async(req,res)=>{
 try{const classSubjectId=id.parse(req.params.classSubjectId);const scope=await db.transaction(tx=>teacherScope(tx,req.caller!,classSubjectId));return res.json((await getLessonsByClassSubject(classSubjectId)).filter(lesson=>scope.chapters.some(chapter=>chapter.id===lesson.chapterId)));}catch(error){if(error instanceof TeacherError)return res.status(error.status).json({error:error.message});throw error;}
});
/**
 * GET /lessons/:lessonId/concepts: Read/return data.
 */
router.get('/lessons/:lessonId/concepts',requireAuth,async(req,res)=>{
 const lessonId=id.parse(req.params.lessonId);
 try{
  if(req.caller!.accountType==='learner'){const dashboard=await getDashboard('learner',req.caller!.accountId,req.caller!.schoolId??-1);if(!dashboard.subjects.some(subject=>subject.lessons.some(lesson=>lesson.id===lessonId)))return res.status(403).json({error:'This lesson is not in your class.'});}
  else await db.transaction(tx=>lessonScope(tx,req.caller!,lessonId));
  return res.json(await getLessonConcepts(lessonId));
 }catch(error){if(error instanceof TeacherError)return res.status(error.status).json({error:error.message});throw error;}
});
export default router;
