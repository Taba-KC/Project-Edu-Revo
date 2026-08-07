// bring in the express library itself
import express from 'express'

// bringing in the router just created in health.ts
import healthRouter from './routes/health'

const app = express();

app.use(express.json());
app.use(healthRouter);

export default app;