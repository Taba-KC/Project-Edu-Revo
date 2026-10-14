import express from 'express';
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

const app = express();

app.use(cors({ origin: 'http://localhost:3001', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use(requestLogger);
app.use(authRouter);
app.use(managerRouter);
app.use(dashboardsRouter);
app.use(teacherWorkspaceRouter);
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

export default app;
