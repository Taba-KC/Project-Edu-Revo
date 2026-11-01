import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { and, eq, inArray, sql, desc } from 'drizzle-orm';
import { db } from '../db';
import { learners, learnerAccountClaims as claims, schools, classes, grades, people, classSubjects, lessons, homework, refreshTokens } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Pick<typeof db, 'transaction'>;
export class AccountReviewError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type ClaimInput = { schoolCode: string; admissionNumber: string; initials: string; username: string; password: string };
const publicClaim = (claim: typeof claims.$inferSelect) => ({ id: claim.id, reference: claim.reference, kind: claim.kind, status: claim.status, createdAt: claim.createdAt, reviewedAt: claim.reviewedAt });

async function identity(tx: Tx, input: Pick<ClaimInput, 'schoolCode' | 'admissionNumber' | 'initials'>) {
  const [school] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.code, input.schoolCode.trim()));
  const [learner] = school ? await tx.select().from(learners).where(and(eq(learners.schoolId, school.id), eq(learners.admissionNumber, input.admissionNumber.trim()))).for('update') : [];
  if (!learner || (learner.firstName[0] + learner.surname[0]).toUpperCase() !== input.initials.trim().toUpperCase()) throw new AccountReviewError('No matching learner record found.', 404);
  return learner;
}

/** All attempts are serialized by the learner row, including revocations and confirmations. */
export async function submitAccountClaim(input: ClaimInput, kind: 'claim' | 'password', database: Database = db, now = new Date()) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return database.transaction(async tx => {
    const learner = await identity(tx, input);
    if (kind === 'claim' && learner.accountSetUp) throw new AccountReviewError('This account is already confirmed. Use Forgot password or contact your class manager.', 409);
    if (kind === 'password' && !learner.accountSetUp) throw new AccountReviewError('This account has not been confirmed yet. Claim it or speak to your class manager.', 409);
    if (learner.accountSuspended) throw new AccountReviewError('This account is temporarily deactivated. Contact your class manager.', 403);
    // Two credential proposals per learner per South African calendar day, including revoked ones.
    const [daily] = await tx.select({ count: sql<number>`count(*)::integer` }).from(claims).where(and(eq(claims.learnerId, learner.id), sql`(${claims.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Johannesburg')::date = (${now.toISOString()}::timestamptz AT TIME ZONE 'Africa/Johannesburg')::date`));
    if (daily.count >= 2) throw new AccountReviewError('This account has reached its limit of two claims or password requests today. Try again tomorrow or contact your class manager.', 429);
    const username = input.username.trim();
    await tx.execute(sql`select pg_advisory_xact_lock(7420, hashtext(${username}))`);
    const [owner] = await tx.select({ id: learners.id }).from(learners).where(eq(learners.username, username));
    const candidates = await tx.select().from(claims).where(and(eq(claims.username, username), inArray(claims.status, ['pending', 'confirmed'])));
    if ((owner && owner.id !== learner.id) || candidates.some(item => item.learnerId !== learner.id)) throw new AccountReviewError('Choose a different username for this request. That username is already in use.', 409);
    for (const candidate of candidates) if (candidate.passwordHash && await bcrypt.compare(input.password, candidate.passwordHash)) throw new AccountReviewError('These credentials already have a reference. Sign in to view it, or choose a different password.', 409);
    if (kind === 'password' && learner.passwordHash && await bcrypt.compare(input.password, learner.passwordHash)) throw new AccountReviewError('Choose a password different from your confirmed password.', 409);
    const allocations = learner.classId ? await tx.select({ id: classSubjects.id }).from(classSubjects).where(and(eq(classSubjects.classId, learner.classId), eq(classSubjects.active, true))) : [];
    const visibleContent = [];
    if (kind === 'password') for (const allocation of allocations) {
      const plans = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.classSubjectId, allocation.id), inArray(lessons.status, ['planned', 'confirmed']))).orderBy(desc(lessons.lessonNumber)).limit(1);
      const activities = await tx.select({ id: homework.id }).from(homework).innerJoin(lessons, eq(lessons.id, homework.lessonId)).where(and(eq(lessons.classSubjectId, allocation.id), eq(lessons.status, 'confirmed'))).orderBy(desc(homework.createdAt), desc(homework.id)).limit(1);
      visibleContent.push({ classSubjectId: allocation.id, lessonId: plans[0]?.id ?? null, homeworkId: activities[0]?.id ?? null });
    }
    const [claim] = await tx.insert(claims).values({ learnerId: learner.id, kind, username, passwordHash, reference: randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'), visibleContent, createdAt: now }).returning();
    return { ...publicClaim(claim), message: 'Show this reference to your class manager. Keep it private until your request is confirmed.' };
  });
}

/** Class manager ownership is checked live, including school membership and role. */
async function managedClasses(tx: Tx, caller: AuthPayload) {
  if (caller.accountType !== 'person') throw new AccountReviewError('Class manager access required.', 403);
  const [person] = await tx.select().from(people).where(and(eq(people.id, caller.accountId), eq(people.schoolId, caller.schoolId ?? -1), eq(people.accountSetUp, true)));
  if (!person || !['teacher', 'principal'].includes(person.role)) throw new AccountReviewError('Class manager access required.', 403);
  return tx.select({ id: classes.id, name: classes.name, gradeNumber: grades.number }).from(classes).innerJoin(grades, eq(grades.id, classes.gradeId)).where(and(eq(classes.classTeacherId, person.id), eq(grades.schoolId, person.schoolId!))).orderBy(grades.number, classes.name);
}

export async function managedAccounts(caller: AuthPayload, database: Database = db) {
  return database.transaction(async tx => {
    const managed = await managedClasses(tx, caller);
    const roster = managed.length ? await tx.select({ id: learners.id, firstName: learners.firstName, surname: learners.surname, admissionNumber: learners.admissionNumber, classId: learners.classId, confirmed: learners.accountSetUp, suspended: learners.accountSuspended }).from(learners).where(and(eq(learners.schoolId, caller.schoolId!), inArray(learners.classId, managed.map(item => item.id)))).orderBy(learners.surname, learners.firstName) : [];
    const proposals = roster.length ? await tx.select().from(claims).where(and(inArray(claims.learnerId, roster.map(item => item.id)), inArray(claims.status, ['pending', 'confirmed']))).orderBy(claims.createdAt) : [];
    const accounts = roster.map(learner => ({ ...learner, className: managed.find(item => item.id === learner.classId)?.name, claims: proposals.filter(item => item.learnerId === learner.id).map(publicClaim) })).filter(item => item.confirmed || item.claims.some(claim => claim.status === 'pending'));
    return { classes: managed, accounts, pendingCount: accounts.filter(item => item.claims.some(claim => claim.status === 'pending')).length };
  });
}

/** References select a particular credential proposal. Other credential material is erased atomically. */
export async function reviewAccount(caller: AuthPayload, learnerId: number, action: 'confirm' | 'revoke' | 'suspend' | 'resume', reference?: string, database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    const [learner] = await tx.select().from(learners).where(and(eq(learners.id, learnerId), eq(learners.schoolId, caller.schoolId ?? -1))).for('update');
    if (learner?.classId) await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, learner.classId)).for('share');
    const managed = await managedClasses(tx, caller);
    if (!learner || !managed.some(cls => cls.id === learner.classId)) throw new AccountReviewError('Learner not found in your managed classes.', 404);
    const proposals = await tx.select().from(claims).where(and(eq(claims.learnerId, learnerId), inArray(claims.status, ['pending', 'confirmed'])));
    if (action === 'confirm') {
      const chosen = proposals.find(item => item.reference === reference && item.status === 'pending');
      if (!chosen?.username || !chosen.passwordHash) throw new AccountReviewError('Select the pending reference shown by this learner.', 409);
      if (learner.accountSuspended) throw new AccountReviewError('Resume this account before confirming a password request.', 409);
      await tx.update(learners).set({ username: chosen.username, passwordHash: chosen.passwordHash, accountSetUp: true, authVersion: learner.authVersion + 1 }).where(eq(learners.id, learnerId));
      await tx.update(claims).set({ status: 'revoked', username: null, passwordHash: null, sessionVersion: sql`${claims.sessionVersion}+1`, reviewedAt: now, reviewedBy: caller.accountId }).where(and(eq(claims.learnerId, learnerId), sql`${claims.id} <> ${chosen.id}`, inArray(claims.status, ['pending', 'confirmed'])));
      await tx.update(claims).set({ status: 'confirmed', reviewedAt: now, reviewedBy: caller.accountId }).where(eq(claims.id, chosen.id));
      await tx.delete(refreshTokens).where(and(eq(refreshTokens.accountId, learnerId), eq(refreshTokens.accountType, 'learner'), sql`(${refreshTokens.claimId} is null or ${refreshTokens.claimId} <> ${chosen.id})`));
    } else if (action === 'revoke') {
      await tx.update(claims).set({ status: 'revoked', username: null, passwordHash: null, sessionVersion: sql`${claims.sessionVersion}+1`, reviewedAt: now, reviewedBy: caller.accountId }).where(and(eq(claims.learnerId, learnerId), inArray(claims.status, ['pending', 'confirmed'])));
      await tx.update(learners).set({ username: null, passwordHash: null, accountSetUp: false, accountSuspended: false, authVersion: learner.authVersion + 1 }).where(eq(learners.id, learnerId));
      await tx.delete(refreshTokens).where(and(eq(refreshTokens.accountId, learnerId), eq(refreshTokens.accountType, 'learner')));
    } else {
      if (!learner.accountSetUp) throw new AccountReviewError('Only a confirmed account can be suspended or resumed.', 409);
      if (action === 'resume' && learner.accountSuspended === false) throw new AccountReviewError('Choose a matching password reference to resume restricted credentials.', 409);
      await tx.update(learners).set({ accountSuspended: action === 'suspend', authVersion: learner.authVersion + 1 }).where(eq(learners.id, learnerId));
      await tx.update(claims).set({ sessionVersion: sql`${claims.sessionVersion}+1` }).where(eq(claims.learnerId, learnerId));
      await tx.delete(refreshTokens).where(and(eq(refreshTokens.accountId, learnerId), eq(refreshTokens.accountType, 'learner')));
    }
    return { saved: true };
  });
}

/** Used on every protected request, rather than trusting stale access-token permissions. */
export async function learnerSession(caller: AuthPayload, database: Database = db) {
  return database.transaction(async tx => {
    const [learner] = await tx.select().from(learners).where(and(eq(learners.id, caller.accountId), eq(learners.schoolId, caller.schoolId ?? -1)));
    if (!learner) throw new AccountReviewError('Learner account not found.', 401);
    if (learner.accountSuspended) throw new AccountReviewError('Your account is temporarily deactivated. Contact your class manager.', 403);
    const [claim] = caller.claimId ? await tx.select().from(claims).where(and(eq(claims.id, caller.claimId), eq(claims.learnerId, learner.id))) : [];
    if (caller.claimId && (!claim || claim.status === 'revoked' || !claim.passwordHash || claim.sessionVersion !== (caller.sessionVersion ?? 0))) throw new AccountReviewError('This claim or session is no longer valid. Sign in again.', 401);
    if (!caller.claimId && (!learner.accountSetUp || learner.authVersion !== (caller.sessionVersion ?? 0))) throw new AccountReviewError('This session is no longer valid. Sign in again.', 401);
    const access = claim?.status === 'pending' ? claim.kind === 'claim' ? 'pending' : 'restricted' : 'active';
    if (access !== 'pending' && !learner.accountSetUp) throw new AccountReviewError('This account is no longer confirmed.', 401);
    return { access, reference: claim?.reference ?? null, firstName: learner.firstName, username: claim?.username ?? learner.username };
  });
}
