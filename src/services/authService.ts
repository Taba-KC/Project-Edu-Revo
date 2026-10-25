/**
 * Server-side password checks and session-token lifecycle. Passwords are checked against
 * bcrypt hashes; access tokens identify callers and stored refresh-token hashes support
 * renewal. The browser never needs the signing secret.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { people, learners, refreshTokens, appManagers } from '../db/schema';

/**
 * Keep the signing secret on the server. Browser decoding of claims is not equivalent to
 * verifying this signature.
 */
const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_EXPIRY  = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Sign short-lived account claims with the server secret. Clients can read claims but cannot
 * safely create or verify this signature themselves.
 */
export function generateAccessToken(accountId: number, accountType: string, schoolId: number | null, role?: string) {
  return jwt.sign({ accountId, accountType, schoolId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Hash the random credential supplied by the login function and store that hash with its
 * expiry/account details, rather than storing the usable token.
 */
async function storeRefreshToken(rawToken: string, accountId: number, accountType: string, schoolId: number | null) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  await db.insert(refreshTokens).values({ tokenHash, accountId, accountType, schoolId, expiresAt });
  return rawToken;
}

/**
 * Find a claimed staff account, check its password hash and issue tokens containing staff
 * role/school claims.
 */
export async function loginPerson(username: string, password: string) {
  const [person] = await db.select().from(people).where(eq(people.username, username));
  if (!person || !person.passwordHash) throw new Error('Invalid credentials');
  const valid = await bcrypt.compare(password, person.passwordHash);
  if (!valid) throw new Error('Invalid credentials');
  const accessToken = generateAccessToken(person.id, 'person', person.schoolId, person.role);
  const rawRefresh = crypto.randomBytes(64).toString('hex');
  await storeRefreshToken(rawRefresh, person.id, 'person', person.schoolId);
  return { accessToken, refreshToken: rawRefresh };
}

/**
 * Check a claimed learner account and issue the learner session tokens.
 */
export async function loginLearner(username: string, password: string) {
  const [learner] = await db.select().from(learners).where(eq(learners.username, username));
  if (!learner || !learner.passwordHash) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, learner.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const accessToken = generateAccessToken(learner.id, 'learner', learner.schoolId);
  const rawRefresh  = crypto.randomBytes(64).toString('hex');
  await storeRefreshToken(rawRefresh, learner.id, 'learner', learner.schoolId);

  return { accessToken, refreshToken: rawRefresh };
}

/**
 * Match an unexpired stored refresh-token hash, then issue a new short-lived access token
 * for its account.
 */
export async function refreshAccessToken(rawToken: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));

  if (!stored) throw new Error('Invalid refresh token');
  if (stored.expiresAt < new Date()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    throw new Error('Refresh token expired');
  }

  if (stored.accountType === 'manager') {
    const [manager] = await db.select().from(appManagers).where(eq(appManagers.id, stored.accountId));
    if (!manager?.active) throw new Error('Account not found');
    return generateAccessToken(manager.id, 'manager', null, 'app_manager');
  }
  if (stored.accountType === 'person') {
    const [person] = await db.select().from(people).where(eq(people.id, stored.accountId));
    if (!person) throw new Error('Account not found');
    return generateAccessToken(stored.accountId, stored.accountType, stored.schoolId, person.role);
  }

  return generateAccessToken(stored.accountId, stored.accountType, stored.schoolId);
}

/**
 * Revoke the supplied refresh token in server storage. Browser token cleanup is handled
 * separately by the frontend.
 */
export async function logout(rawToken: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

/**
 * Authenticate an enabled app manager and issue manager-type session tokens.
 */
export async function loginManager(username: string, password: string) {
  const [manager] = await db.select().from(appManagers).where(eq(appManagers.username, username));
  if (!manager?.active || !(await bcrypt.compare(password, manager.passwordHash))) throw new Error('Invalid credentials');
  const refreshToken = crypto.randomBytes(64).toString('hex');
  await storeRefreshToken(refreshToken, manager.id, 'manager', null);
  return { accessToken: generateAccessToken(manager.id, 'manager', null, 'app_manager'), refreshToken };
}
