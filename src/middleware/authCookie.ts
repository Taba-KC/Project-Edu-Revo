import type { Request, Response, NextFunction, CookieOptions } from 'express';
import { frontendOrigins } from '../securityConfig';
export const refreshCookieName='nedecen_refresh';
function options(): CookieOptions {
 const sameSite=process.env.AUTH_COOKIE_SAME_SITE==='none'?'none':'lax';
 const secure=process.env.NODE_ENV==='production'||sameSite==='none';
 return {httpOnly:true,secure,sameSite,path:'/auth',maxAge:7*24*60*60*1000};
}
export function readRefreshCookie(req: Request) {
 const pair=req.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(refreshCookieName+'='));
 if(!pair)return null;
 try{return decodeURIComponent(pair.slice(refreshCookieName.length+1));}catch{return null;}
}
export function writeRefreshCookie(res: Response, token: string) {res.cookie(refreshCookieName,token,options());}
export function clearRefreshCookie(res: Response) {const {maxAge:_,...cookie}=options();res.clearCookie(refreshCookieName,cookie);}
/** Cookies are ambient credentials: explicitly reject foreign browser origins on auth writes. */
export function trustedAuthOrigin(req: Request,res: Response,next:NextFunction) {
 const origin=req.get('Origin');
 if ((origin&&!frontendOrigins().includes(origin)) || (!origin&&readRefreshCookie(req))) return void res.status(403).json({error:'Authentication request origin is not allowed.'});
 next();
}
