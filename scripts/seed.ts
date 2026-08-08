import 'dotenv/config';
import { db } from '../src/db';
import { provinces, districts, circuits, schools } from '../src/db/schema';

async function seed() {
  console.log('Seeding provinces...');
  const [limpopo] = await db.insert(provinces).values([
    { name: 'Limpopo' },
  ]).returning();

  console.log('Seeding districts...');
  const [waterberg] = await db.insert(districts).values([
    { provinceId: limpopo.id, name: 'Waterberg' },
  ]).returning();

  console.log('Seeding circuits...');
  const [mokCircuit] = await db.insert(circuits).values([
    { districtId: waterberg.id, name: 'Mokgalakwena Circuit' },
  ]).returning();

  console.log('Seeding schools...');
  await db.insert(schools).values([
    {
      circuitId: mokCircuit.id,
      name: 'Mokgethwa High School',
      activationCode: 'ACT-MOK-2026',
    },
  ]);

  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});





/** NOTES */

/*
 * tsx scripts/seed.ts runs the seed file directly using tsx — the same tool that runs the server in development. 
 * It connects to the database, inserts the reference data, and exits. 
 * It is a one-time script, not a running server.

    Why seed data lives in a script and not in a migration:

 * Migrations are for structure — creating and altering tables. 
 * Seed data is content — actual rows. 
 * Keeping them separate means you can re-run migrations on a fresh database without worrying about duplicate data, and you can update seed data independently of the schema.
*/