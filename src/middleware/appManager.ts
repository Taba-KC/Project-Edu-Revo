import type { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { appManagers } from '../db/schema';
/** Shared catalogue writes belong to enabled platform managers, never school principals. */
export async function requireAppManager(req: Request, res: Response, next: NextFunction) {
 if(req.caller?.accountType!=='manager') return void res.status(403).json({error:'App manager access required.'});
 try {
  const [manager]=await db.select({id:appManagers.id}).from(appManagers).where(and(eq(appManagers.id,req.caller.accountId),eq(appManagers.active,true)));
  if(!manager)return void res.status(403).json({error:'App manager account is inactive.'});
  next();
 }catch(error){next(error);}
}
