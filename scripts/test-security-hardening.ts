import 'dotenv/config';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db,pool } from '../src/db';
import { circuits,schools,people,appManagers,subjects,chapters,refreshTokens } from '../src/db/schema';
import { generateAccessToken } from '../src/services/authService';
import { attemptLimit } from '../src/middleware/authRateLimit';
import app from '../src/app';
const rollback=new Error('Rollback security fixtures');let checks=0;
const check=(value:unknown)=>{assert.ok(value);checks++;};
async function run(){
 try{await db.transaction(async tx=>{
  const key='security-'+Date.now();const password='test-password-731';const hash=await bcrypt.hash(password,4);
  const [circuit]=await tx.select().from(circuits).limit(1);
  const [school]=await tx.insert(schools).values({name:key,circuitId:circuit!.id,activationCode:key+'-private'}).returning();
  const [person]=await tx.insert(people).values({title:'Ms',firstName:'Test',surname:'Principal',staffNumber:key,username:key,schoolId:school!.id,role:'principal',accountSetUp:true,passwordHash:hash}).returning();
  const [manager,inactive]=await tx.insert(appManagers).values([{username:key+'-manager',passwordHash:hash},{username:key+'-inactive',passwordHash:hash,active:false}]).returning();
  const [subject]=await tx.insert(subjects).values({name:key}).returning();
  const [chapter]=await tx.insert(chapters).values({subjectId:subject!.id,gradeNumber:11,name:key,orderIndex:1}).returning();
  // All request writes, sessions and rate counters use the rollback transaction.
  const methods=['select','insert','update','delete','execute','transaction'] as const;
  const originals=new Map(methods.map(method=>[method,(db as any)[method]]));
  for(const method of methods)(db as any)[method]=(tx as any)[method].bind(tx);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  try{
   const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
   const request=(path:string,body?:unknown,headers:Record<string,string>={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const principal={Authorization:'Bearer '+generateAccessToken(person!.id,'person',school!.id,'principal')};
   const enabled={Authorization:'Bearer '+generateAccessToken(manager!.id,'manager',null,'app_manager')};
   const disabled={Authorization:'Bearer '+generateAccessToken(inactive!.id,'manager',null,'app_manager')};
   const publicOne=await request('/schools/'+school!.id);check(publicOne.status===200);check(!('activationCode' in await publicOne.json()));
   const publicAll=await (await request('/schools')).json() as Record<string,unknown>[];check(publicAll.every(row=>!('activationCode' in row)));
   check((await request('/schools/seed',{circuitId:circuit!.id,name:key,activationCode:key+'x'})).status===401);
   check((await request('/subjects',{name:key+'-unauth'})).status===401);
   check((await request('/subjects',{name:key+'-principal'},principal)).status===403);
   check((await request('/subjects',{name:key+'-inactive'},disabled)).status===403);
   check((await request('/subjects',{name:key+'-manager'},enabled)).status===201);
   check((await request(`/subjects/${subject!.id}/grades/11/chapters`,{name:'Blocked',orderIndex:2},principal)).status===403);
   check((await request(`/chapters/${chapter!.id}/concepts`,{name:'Blocked',orderIndex:1},principal)).status===403);
   check((await request(`/chapters/${chapter!.id}/concepts`,{name:'Allowed',orderIndex:1},enabled)).status===201);
   const login=await request('/auth/people/login',{username:key,password},{Origin:'http://localhost:3001'});check(login.status===200);
   const session=await login.json() as {accessToken:string;refreshToken?:string};check(!!session.accessToken&&!session.refreshToken);
   const setCookie=login.headers.get('set-cookie')!;check(setCookie.includes('HttpOnly')&&setCookie.includes('Path=/auth')&&setCookie.includes('SameSite=Lax'));
   const cookie=setCookie.split(';')[0]!;
   const browserHeaders={Cookie:cookie,Origin:'http://localhost:3001'};
   check((await request('/auth/refresh',{},browserHeaders)).status===200);
   check((await request('/auth/refresh',{}, {Cookie:cookie,Origin:'https://untrusted.invalid'})).status===403);
   check((await request('/auth/refresh',{}, {Cookie:cookie})).status===403);
   const signout=await request('/auth/logout',{},browserHeaders);check(signout.status===200);
   check(signout.headers.get('set-cookie')!.includes('Expires='));
   check((await request('/auth/refresh',{},browserHeaders)).status===401);
   check((await tx.select().from(refreshTokens).where(eq(refreshTokens.accountId,person!.id))).length===0);
   // Two separately constructed middleware instances share the same database quota.
   let passed=0,status=200;const headers:Record<string,string>={};
   const response:any={setHeader(name:string,value:string){headers[name]=value;},status(value:number){status=value;return this;},json(){return this;}};
   const req:any={ip:key};const first=attemptLimit(key,2,900),second=attemptLimit(key,2,900);
   await first(req,response,()=>{passed++;});await second(req,response,()=>{passed++;});await first(req,response,()=>{passed++;});
   check(passed===2&&status===429&&Number(headers['Retry-After'])>0);
   let limited:Response|undefined;
   for(let n=0;n<13;n++)limited=await request('/auth/people/login',{username:key+'-missing',password:'wrong'});
   check(limited!.status===429&&Number(limited!.headers.get('Retry-After'))>0);
   // Foreign origins cannot use even the login endpoint to replace a browser session.
   check((await request('/auth/people/login',{username:key,password},{Origin:'https://untrusted.invalid'})).status===403);
   const priorMode=process.env.NODE_ENV,priorOrigins=process.env.FRONTEND_ORIGINS;
   process.env.NODE_ENV='production';process.env.FRONTEND_ORIGINS='http://localhost:3001';
   try{const secure=await request('/auth/managers/login',{username:manager!.username,password},{Origin:'http://localhost:3001'});check(secure.status===200&&secure.headers.get('set-cookie')!.includes('Secure'));}
   finally{if(priorMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=priorMode;if(priorOrigins===undefined)delete process.env.FRONTEND_ORIGINS;else process.env.FRONTEND_ORIGINS=priorOrigins;}
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const [method,original]of originals)(db as any)[method]=original;}
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 console.log(`Passed ${checks} security hardening checks; all database fixtures rolled back.`);
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
