/**
 * Developer check for fixed grades. This file is run explicitly, not during normal app
 * requests. Inspect its fixtures and database target before running it; the assertions below
 * document the behaviour being checked.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes } from '../src/db/schema';

async function run() {
  let checks = 0;
  const rollback = new Error('Rollback fixed-grade fixtures');
  try {
    await db.transaction(async tx => {
      const [circuit] = await tx.select().from(circuits).limit(1);
      assert.ok(circuit);
      const key = 'fixed-grades-test-' + Date.now();
      const [school] = await tx.insert(schools).values({ circuitId: circuit.id, name: key, activationCode: key }).returning();
      const rows = await tx.select().from(grades).where(eq(grades.schoolId, school!.id)).orderBy(grades.number);
      assert.deepEqual(rows.map(g => g.number), [8, 9, 10, 11, 12]); checks++;
      const grade = rows.find(g => g.number === 11)!;
      const [cls] = await tx.insert(classes).values({ gradeId: grade.id, name: '11TEST' }).returning();
      for (const number of [7, 13]) {
        await assert.rejects(tx.transaction(inner => inner.insert(grades).values({ schoolId: school!.id, number }))); checks++;
      }
      await assert.rejects(tx.transaction(inner => inner.insert(grades).values({ schoolId: school!.id, number: 8 }))); checks++;
      await assert.rejects(tx.transaction(inner => inner.delete(grades).where(eq(grades.id, grade.id)))); checks++;
      await assert.rejects(tx.transaction(inner => inner.update(grades).set({ number: 10 }).where(eq(grades.id, grade.id)))); checks++;
      const [other] = await tx.insert(schools).values({ circuitId: circuit.id, name: key + '-other', activationCode: key + '-other' }).returning();
      await assert.rejects(tx.transaction(inner => inner.update(grades).set({ schoolId: other!.id }).where(eq(grades.id, grade.id)))); checks++;
      assert.equal((await tx.select().from(classes).where(eq(classes.id, cls!.id)))[0]!.gradeId, grade.id); checks++;
      assert.equal((await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11))))[0]!.id, grade.id); checks++;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(checks + ' fixed-grade checks passed; fixtures rolled back.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
