import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema',    // points to a folder where we define our tables in TypeScript. 
  out: './src/db/migrations',   // when drizzle-kit generates migration files, they go here
  dialect: 'postgresql',        // tells Drizzle which database engine we are using
  dbCredentials: { url: process.env.DATABASE_URL!, },   // the connection string from our .env file
});


/** SCENARIO -- why migrations matter*/

/*
 * Imagine we define a learners table and run our app. 
 * Three weeks later we realise you need to add a phone_number column. 
 * Without migrations, we would have to manually write SQL to alter the table, remember to run it on every machine the app runs on, and hope nothing breaks. 
 * With migrations, drizzle-kit generates that SQL for us automatically by comparing our current schema to the last known state. 
 * Everyone on the team runs the same migration file and the database stays in sync everywhere.
 */ 