/**
 * Backend process entry point. Load environment configuration, import the configured Express
 * app, then listen on PORT (3000 by default). Importing a service alone does not start a
 * server.
 */
import 'dotenv/config';
import app from './app';
import { db } from './db';
import { sql } from 'drizzle-orm';
if(process.env.NODE_ENV==='production'&&(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32))throw new Error('Production requires a strong JWT_SECRET of at least 32 characters.');
// Expired throttle windows contain hashes only and can be safely pruned by any worker.
const pruning=setInterval(()=>{void db.execute(sql`DELETE FROM auth_attempt_windows WHERE expires_at < now()`).catch(()=>console.error('Could not prune expired authentication attempt windows.'));},60*60*1000);
pruning.unref();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});