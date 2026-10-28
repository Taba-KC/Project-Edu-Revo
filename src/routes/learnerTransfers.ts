import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { requireSchoolAdministration } from '../middleware/schoolAdministration';
import { reviewLearnerTransfer, commitLearnerTransfer } from '../services/learnerTransferService';
import { RosterImportError } from '../services/rosterImportService';
const router=Router();
const id=z.coerce.number().int().positive();
const input=z.object({targetClassId:z.number().int().positive(),learnerIds:z.array(z.number().int().positive()).min(1).max(500)});
for(const operation of ['review','commit'] as const) {
 router.post(`/schools/:schoolId/classes/:classId/learner-transfers/${operation}`,requireAuth,requireSchoolAdministration(['grades','learners']),async(req,res)=>{
  const school=id.safeParse(req.params.schoolId), source=id.safeParse(req.params.classId), parsed=(operation==='commit'?input.extend({reviewHash:z.string().regex(/^[a-f0-9]{64}$/)}):input).safeParse(req.body);
  if(!school.success||!source.success||!parsed.success)return void res.status(400).json({error:'Choose a destination class, learners and a reviewed move.'});
  try {
   if(operation==='review') {
    const review=await db.transaction(tx=>reviewLearnerTransfer(tx,school.data,source.data,parsed.data.targetClassId,parsed.data.learnerIds),{isolationLevel:'repeatable read',accessMode:'read only'});
    return void res.json({reviewHash:review.reviewHash,source:review.source,target:review.target,count:review.count,remaining:review.remaining,learners:review.learners});
   }
   const result=await db.transaction(tx=>commitLearnerTransfer(tx,school.data,source.data,parsed.data.targetClassId,parsed.data.learnerIds,String(req.body.reviewHash)));
   return void res.json(result);
  }catch(error){if(error instanceof RosterImportError)return void res.status(error.status).json({error:error.message});throw error;}
 });
}
export default router;
