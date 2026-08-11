import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { bulkImportChapters } from '../services/chapterImportService';
import { requireAuth, requirePerson } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/subjects/:subjectId/grades/:gradeNumber/chapters/import',
  requireAuth,
  requirePerson,
  upload.single('file'),
  async (req, res) => {
    const subjectId   = parseInt(req.params.subjectId as string);
    const gradeNumber = parseInt(req.params.gradeNumber as string);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json<{ chapterName: string; conceptName: string }>(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Spreadsheet is empty or has no data rows' });
    }

    const result = await bulkImportChapters(rows, subjectId, gradeNumber);
    return res.status(200).json(result);
  },
);

export default router;