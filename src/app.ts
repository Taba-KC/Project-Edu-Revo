import express from 'express';
import { requestLogger } from './middleware/logger';
import healthRouter from './routes/health';
import schoolsRouter from './routes/schools';
import gradesRouter from './routes/grades';
import subjectsRouter from './routes/subjects';
import streamsRouter from './routes/streams';
import classesRouter from './routes/classes';

const app = express();

app.use(express.json());
app.use(requestLogger);
app.use(healthRouter);
app.use(schoolsRouter);
app.use(gradesRouter);
app.use(subjectsRouter);
app.use(streamsRouter);
app.use(classesRouter);

export default app;