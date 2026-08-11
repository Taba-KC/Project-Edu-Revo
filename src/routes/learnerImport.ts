import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { bulkAddLearners } from '../services/learnerService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/schools/:schoolId/classes/:classId/learners/import',
  requireAuth,
  requirePrincipal,
  upload.single('file'),
  async (req, res) => {
    const schoolId = parseInt(req.params.schoolId as string);
    const classId  = parseInt(req.params.classId as string);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json<{
      title:           string;
      firstName:       string;
      surname:         string;
      admissionNumber: string;
    }>(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Spreadsheet is empty or has no data rows' });
    }

    const result = await bulkAddLearners(rows, schoolId, classId);
    return res.status(200).json(result);
  },
);

export default router;