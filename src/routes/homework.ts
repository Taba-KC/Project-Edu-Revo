import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homework } from '../db/schema';
import { requireAuth, requireTeacher } from '../middleware/auth';
import { getHomeworkByLesson, getQuestionsByHomework } from '../services/homeworkService';
import { TeacherError, lessonScope } from '../services/teacherWorkspaceService';
const router=Router();
// Sending an empty set before its questions would expose an unfinished draft to learners.
router.post('/lessons/:lessonId/homework',requireAuth,requireTeacher,(_req,res)=>res.status(410).json({error:'Use the staff homework review flow to send a complete set.'}));
router.post('/homework/:homeworkId/questions',requireAuth,requireTeacher,(_req,res)=>res.status(410).json({error:'Add questions in the staff homework review flow before sending.'}));
router.get('/lessons/:lessonId/homework',requireAuth,requireTeacher,async(req,res)=>{
 try{const lessonId=Number(req.params.lessonId);await db.transaction(tx=>lessonScope(tx,req.caller!,lessonId));const set=await getHomeworkByLesson(lessonId);return set?res.json(set):res.status(404).json({error:'No homework found for this lesson'});}catch(error){if(error instanceof TeacherError)return res.status(error.status).json({error:error.message});throw error;}
});
router.get('/homework/:homeworkId/questions',requireAuth,requireTeacher,async(req,res)=>{
 try{const homeworkId=Number(req.params.homeworkId);const [set]=await db.select().from(homework).where(eq(homework.id,homeworkId));if(!set)return res.status(404).json({error:'Homework not found'});await db.transaction(tx=>lessonScope(tx,req.caller!,set.lessonId));return res.json(await getQuestionsByHomework(homeworkId));}catch(error){if(error instanceof TeacherError)return res.status(error.status).json({error:error.message});throw error;}
});
export default router;
