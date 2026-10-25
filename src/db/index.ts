/**
 * Create the PostgreSQL connection pool and wrap it with Drizzle. Services import db to
 * query the database. DATABASE_URL is private server configuration; this file does not
 * create tables when imported.
 */
// bring in Drizzle configured for PostgreSQL specifically
import { drizzle } from 'drizzle-orm/node-postgres';

// bring in the connection pool from the pg driver
import { Pool } from 'pg';

// create a connection pool
/**
 * The pool reuses PostgreSQL connections between requests. It reads a private backend
 * environment setting.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// wrap the pool with Drizzle's query API and export it as db
/**
 * Wrap the pool with typed query builders. Schema definitions and applied migrations must
 * still match the real database.
 */
export const db = drizzle(pool);








/*
 * A pool is a set of reusable database connections kept open and ready. 
 * When a request comes in and needs the database, it borrows a connection from the pool, uses it, and returns it. 
 * This is far more efficient than opening and closing a fresh connection for every single request. 
 * ASP.NET's DbContext manages something similar under the hood.
 */     





/** SCENARIO */

/*
 * Imagine 30 learners all submit homework feedback at the same moment. 
 * That is 30 simultaneous requests all needing the database. 
 * Without a pool, the application would try to open 30 separate connections to PostgreSQL all at once, which is slow and resource-heavy. 
 * With a pool, those 30 requests share a set of pre-opened connections — no waiting, no waste.
 */
