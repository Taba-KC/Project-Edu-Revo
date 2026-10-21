import * as XLSX from 'xlsx';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { people, learners, classes, grades, schools } from '../db/schema';
export type RosterKind = 'staff' | 'learners';
export interface RosterRow { title?: string; firstName: string; surname: string; identifier: string }
export class RosterImportError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const rosterRowsSchema = z.object({ rows: z.array(z.object({ title: z.string().max(200).optional(), firstName: z.string().max(200), surname: z.string().max(200), identifier: z.string().max(200) })).min(1).max(500) });
const normalise = (value: string) => value.trim().toLowerCase();
export function validateRosterRows(rows: RosterRow[], existingIdentifiers: string[], kind: RosterKind = 'staff') {
  const existing = new Set(existingIdentifiers.map(normalise));
  const counts = new Map<string, number>();
  for (const row of rows) { const id = normalise(row.identifier); if (id) counts.set(id, (counts.get(id) ?? 0) + 1); }
  return rows.map((row, index) => {
    const errors: string[] = [];
    for (const [field, label] of [['title', 'Title'], ['firstName', 'First name'], ['surname', 'Surname'], ['identifier', 'Number']] as const) {
      if (field === 'title' && kind === 'learners') continue;
      const value = row[field] ?? '';
      if (!value.trim()) errors.push(label + ' is required');
      else if (value.length > 200) errors.push(label + ' must be at most 200 characters');
    }
    const id = normalise(row.identifier);
    if (id && existing.has(id)) errors.push('Number already exists in this school');
    if (id && (counts.get(id) ?? 0) > 1) errors.push('Number is repeated in this preview');
    return { row: index + 1, errors };
  }).filter(issue => issue.errors.length);
}
export function parseRosterWorkbook(buffer: Buffer, kind: RosterKind): RosterRow[] {
  let book: XLSX.WorkBook;
  try { book = XLSX.read(buffer, { type: 'buffer', sheetRows: 502 }); }
  catch { throw new RosterImportError('This spreadsheet could not be read.'); }
  const sheet = book.Sheets[book.SheetNames[0]!];
  if (!sheet) throw new RosterImportError('The spreadsheet has no worksheets.');
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if (range.e.r > 500 || range.e.c > 30) throw new RosterImportError('Use at most 500 rows and 31 columns.');
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
  const headers = (matrix.shift() ?? []).map(value => String(value).trim());
  const number = kind === 'staff' ? 'staffNumber' : 'admissionNumber';
  const required = [...(kind === 'staff' ? ['title'] : []), 'firstName', 'surname', number];
  if (required.some(header => headers.filter(value => value === header).length !== 1)) throw new RosterImportError('Use these column headings exactly once: ' + required.join(', ') + '.');
  for (const address of Object.keys(sheet)) if (!address.startsWith('!') && sheet[address]?.f) throw new RosterImportError('Use plain values rather than spreadsheet formulas.');
  const rows = matrix.map(row => Object.fromEntries(required.map(header => [header === number ? 'identifier' : header, String(row[headers.indexOf(header)] ?? '').trim()])) as unknown as RosterRow)
    .filter(row => Object.values(row).some(value => value));
  if (!rows.length) throw new RosterImportError('The spreadsheet has no data rows.');
  if (rows.length > 500) throw new RosterImportError('Use at most 500 rows.');
  return rows;
}
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function checkTarget(tx: Transaction, schoolId: number, kind: RosterKind, classId?: number) {
  const [school] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId));
  if (!school) throw new RosterImportError('School not found', 404);
  if (kind === 'learners') {
    const [cls] = await tx.select({ id: classes.id }).from(classes).innerJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(eq(classes.id, classId ?? 0), eq(grades.schoolId, schoolId)));
    if (!cls) throw new RosterImportError('Choose a class belonging to your school.', 404);
  }
}
async function existingNumbers(tx: Transaction, schoolId: number, kind: RosterKind) {
  const rows = kind === 'staff' ? await tx.select({ identifier: people.staffNumber }).from(people).where(eq(people.schoolId, schoolId))
    : await tx.select({ identifier: learners.admissionNumber }).from(learners).where(eq(learners.schoolId, schoolId));
  return rows.map(row => row.identifier);
}
export async function previewRoster(schoolId: number, kind: RosterKind, buffer: Buffer, classId?: number, database: Pick<typeof db, 'transaction'> = db) {
  return database.transaction(async tx => {
    await checkTarget(tx, schoolId, kind, classId);
    const rows = parseRosterWorkbook(buffer, kind);
    const existingIdentifiers = await existingNumbers(tx, schoolId, kind);
    return { rows, existingIdentifiers, issues: validateRosterRows(rows, existingIdentifiers, kind) };
  });
}
export async function saveRoster(schoolId: number, kind: RosterKind, rows: RosterRow[], classId?: number, database: Pick<typeof db, 'transaction'> = db) {
  const result = rosterRowsSchema.safeParse({ rows });
  if (!result.success) throw new RosterImportError('Use 1–500 rows, with text fields up to 200 characters.');
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7412, ${schoolId})`);
    await checkTarget(tx, schoolId, kind, classId);
    const clean = result.data.rows.map(row => ({ ...(kind === 'staff' ? { title: (row.title ?? '').trim() } : {}), firstName: row.firstName.trim(), surname: row.surname.trim(), identifier: row.identifier.trim() }));
    const issues = validateRosterRows(clean, await existingNumbers(tx, schoolId, kind), kind);
    if (issues.length) throw new RosterImportError('Nothing saved. ' + issues.slice(0, 5).map(issue => 'Row ' + issue.row + ': ' + issue.errors.join('; ')).join('. '));
    if (kind === 'staff') await tx.insert(people).values(clean.map(({ identifier, ...row }) => ({ ...row, title: row.title!, schoolId, staffNumber: identifier })));
    else await tx.insert(learners).values(clean.map(({ identifier, ...row }) => ({ ...row, schoolId, classId: classId!, admissionNumber: identifier })));
    return { saved: clean.length };
  });
}
