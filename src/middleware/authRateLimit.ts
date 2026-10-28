import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
/** PostgreSQL-backed fixed windows are shared by all application workers. No credentials
 * or raw addresses are stored. The caller supplies a bounded key, never SQL identifiers. */
export function attemptLimit(scope: string, limit: number, seconds: number, identity?: (req:Request)=>string) {
 return async(req:Request,res:Response,next:NextFunction)=>{
  const key=createHash('sha256').update(scope+':'+(identity?identity(req):(req.ip??req.socket.remoteAddress??'unknown'))).digest('hex');
  try {
   const result=await db.execute(sql`INSERT INTO auth_attempt_windows (key, attempts, expires_at) VALUES (${key},1,now()+make_interval(secs => ${seconds}))
    ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN auth_attempt_windows.expires_at<=now() THEN 1 ELSE auth_attempt_windows.attempts+1 END,
    expires_at=CASE WHEN auth_attempt_windows.expires_at<=now() THEN now()+make_interval(secs => ${seconds}) ELSE auth_attempt_windows.expires_at END
    RETURNING attempts, greatest(1,ceil(extract(epoch from (expires_at-now()))))::integer AS retry_after`);
   const row=result.rows[0] as {attempts:number;retry_after:number};
   if(row.attempts>limit){res.setHeader('Retry-After',String(row.retry_after));return void res.status(429).json({error:'Too many attempts. Please wait before trying again.'});}
   next();
  }catch(error){next(error);}
 };
}
