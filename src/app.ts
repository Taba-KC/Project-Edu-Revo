import { frontendOrigins } from './securityConfig';
import { attemptLimit } from './middleware/authRateLimit';
/**
 * Build the Express application: shared middleware runs first, then mounted routers match
 * HTTP methods and paths. Router files define full endpoint paths in this project; there is
 * no automatic /api prefix. server.ts starts listening separately.
 */
import express from 'express';
import { StreamChoiceError } from './services/classStreamService';
import cors from 'cors';
import path from 'path';
import { requestLogger } from './middleware/logger';
import healthRouter from './routes/health';
import schoolsRouter from './routes/schools';
import gradesRouter from './routes/grades';
import subjectsRouter from './routes/subjects';
import streamsRouter from './routes/streams';
import classesRouter from './routes/classes';
import peopleRouter from './routes/people';
import learnersRouter from './routes/learners';
import chaptersRouter from './routes/chapters';
import conceptsRouter from './routes/concepts';
import lessonsRouter from './routes/lessons';
import homeworkRouter from './routes/homework';
import learnerFeedbackRouter from './routes/learnerFeedback';
import authRouter from './routes/auth';
import rosterImportRouter from './routes/rosterImport';
import chapterImportRouter from './routes/chapterImport';
import announcementsRouter from './routes/announcements';

import classSubjectsRouter from './routes/classSubjects';

import managerRouter from './routes/manager';
import dashboardsRouter from './routes/dashboards';
import teacherWorkspaceRouter from './routes/teacherWorkspace';

import learnerWorkspaceRouter from './routes/learnerWorkspace';

import classStreamsRouter from './routes/classStreams';
import staffAccessRouter from './routes/staffAccess';
import learnerTransfersRouter from './routes/learnerTransfers';
const app = express();

/**
 * Allow requests from the development frontend origin. CORS controls browser access; it is
 * not account authorization.
 */
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
const allowedOrigins=frontendOrigins();
app.use(cors({origin:allowedOrigins,credentials:true}));
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');next();});
/**
 * Parse JSON request bodies before route handlers read req.body, with a size limit.
 */
app.use(express.json({ limit: '1mb' }));
/**
 * Serve this uploads directory publicly at /uploads. Private files would need a separate
 * authorization-aware download route.
 */
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use(requestLogger);
/**
 * Mount routers after shared middleware. Creating a routes file alone does not make its
 * endpoints reachable.
 */
// Rate limits count unsuccessful and successful requests, including malformed credentials.
app.use(['/auth/people/login','/auth/learners/login','/auth/managers/login'],attemptLimit('login-ip',300,900));
app.use('/auth/refresh',attemptLimit('refresh-ip',600,900));
app.use(['/people/onboarding','/learners/onboarding','/schools/activate'],attemptLimit('claim-ip',300,900));
app.use(authRouter);
app.use(managerRouter);
app.use(staffAccessRouter);
app.use(learnerTransfersRouter);
app.use(classStreamsRouter);
app.use(dashboardsRouter);
app.use(teacherWorkspaceRouter);
app.use(learnerWorkspaceRouter);
app.use(healthRouter);
app.use(schoolsRouter);
app.use(gradesRouter);
app.use(subjectsRouter);
app.use(streamsRouter);
app.use(classesRouter);
app.use(rosterImportRouter);
app.use(peopleRouter);
app.use(learnersRouter);
app.use(classSubjectsRouter);
app.use(chaptersRouter);
app.use(conceptsRouter);
app.use(lessonsRouter);
app.use(homeworkRouter);
app.use(learnerFeedbackRouter);

app.use(chapterImportRouter);
app.use(announcementsRouter);

app.use((error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{if(error instanceof StreamChoiceError)return void res.status(error.status).json({error:error.message});next(error);});
export default app;
