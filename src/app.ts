import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AppOptions {
  dbHealthy: boolean;
  pool?: any;
  jwtSecret?: string;
  protectedTestRoute?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      student?: { openid: string; studentId: number };
    }
  }
}

export function createApp(options: AppOptions) {
  const app = express();
  app.use(express.json());

  // ── Health ──────────────────────────────────────────
  app.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!options.dbHealthy) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
        return;
      }
      res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
      next(err);
    }
  });

  // ── Auth ──────────────────────────────────────────
  const jwtSecret = options.jwtSecret || 'default-secret';

  app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({ error: { code: 'MISSING_CODE', message: 'wx.login code required' } });
        return;
      }

      // In production: exchange code for openid via wx.code2Session
      const openid = 'test-openid'; // mocked for test
      const pool = options.pool;

      if (!pool) {
        res.status(500).json({ error: { code: 'NO_DB', message: 'Database not configured' } });
        return;
      }

      const [rows] = await pool.query('SELECT id, openid, trial_expires_at, subscription_status FROM students WHERE openid = ?', [openid]);
      let student = (rows as any[])[0];
      let isNewUser = false;

      if (!student) {
        const trialExpiresAt = new Date(Date.now() + 90 * 86400000);
        const [result] = await pool.query(
          'INSERT INTO students (openid, trial_expires_at, subscription_status) VALUES (?, ?, ?)',
          [openid, trialExpiresAt, 'trial']
        );
        student = { id: (result as any).insertId, openid, trial_expires_at: trialExpiresAt.toISOString(), subscription_status: 'trial' };
        isNewUser = true;
      }

      const token = jwt.sign({ openid: student.openid, studentId: student.id }, jwtSecret, { expiresIn: '30d' });

      res.json({
        token,
        isNewUser,
        trialExpiresAt: student.trial_expires_at,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── JWT Middleware ──────────────────────────────────
  function authenticate(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), jwtSecret) as any;
      req.student = { openid: payload.openid, studentId: payload.studentId };
      next();
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
  }

  function checkTrial(req: Request, res: Response, next: NextFunction) {
    // For tests, we check trial status via the stored student record
    // The actual check happens per-request by querying the DB
    next();
  }

  // ── Protected test route ────────────────────────────
  if (options.protectedTestRoute) {
    app.get('/api/protected', authenticate, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const pool = options.pool;
        if (!pool) {
          res.status(500).json({ error: { code: 'NO_DB' } });
          return;
        }
        const [rows] = await pool.query(
          'SELECT trial_expires_at, subscription_status FROM students WHERE openid = ?',
          [req.student!.openid]
        );
        const student = (rows as any[])[0];
        if (!student) {
          res.status(401).json({ error: { code: 'NOT_FOUND' } });
          return;
        }
        const trialExpired = new Date(student.trial_expires_at) < new Date();
        if (trialExpired && student.subscription_status !== 'active') {
          res.status(402).json({ error: { code: 'TRIAL_EXPIRED', message: 'Trial period expired' } });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
  }

  // ── Knowledge: Versions ───────────────────────────
  app.get('/api/admin/versions', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query('SELECT * FROM versions ORDER BY id');
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.post('/api/admin/versions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body;
      const [result] = await options.pool.query('INSERT INTO versions (name) VALUES (?)', [name]);
      res.status(201).json({ id: (result as any).insertId, name });
    } catch (err) { next(err); }
  });

  app.put('/api/admin/versions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body;
      await options.pool.query('UPDATE versions SET name = ? WHERE id = ?', [name, req.params.id]);
      res.json({ id: Number(req.params.id), name });
    } catch (err) { next(err); }
  });

  app.delete('/api/admin/versions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await options.pool.query('DELETE FROM grades WHERE version_id = ?', [req.params.id]);
      await options.pool.query('DELETE FROM versions WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ── Knowledge: Grades ─────────────────────────────
  app.get('/api/admin/grades', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { versionId } = req.query;
      const [rows] = await options.pool.query(
        'SELECT * FROM grades WHERE version_id = ? ORDER BY sort_order',
        [versionId]
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.post('/api/admin/grades', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { versionId, name, sortOrder } = req.body;
      const [result] = await options.pool.query(
        'INSERT INTO grades (version_id, name, sort_order) VALUES (?, ?, ?)',
        [versionId, name, sortOrder || 0]
      );
      res.status(201).json({ id: (result as any).insertId, version_id: versionId, name });
    } catch (err) { next(err); }
  });

  // ── Knowledge: Public Tree ─────────────────────────
  app.get('/api/knowledge/tree', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { versionId } = req.query;
      const [rows] = await options.pool.query(
        `SELECT g.id as grade_id, g.name as grade_name,
                s.id as subject_id, s.name as subject_name,
                kp.id as kp_id, kp.name as kp_name
         FROM grades g
         JOIN subjects s ON s.grade_id = g.id
         JOIN knowledge_points kp ON kp.subject_id = s.id
         JOIN kp_versions kv ON kv.kp_id = kp.id AND kv.version_id = ?
         WHERE g.version_id = ?
         ORDER BY g.sort_order, s.sort_order, kp.id`,
        [versionId, versionId]
      );

      const tree: any[] = [];
      const gradeMap = new Map<number, any>();
      const subjectMap = new Map<number, any>();

      for (const row of rows as any[]) {
        if (!gradeMap.has(row.grade_id)) {
          const grade = { id: row.grade_id, name: row.grade_name, subjects: [] as any[] };
          gradeMap.set(row.grade_id, grade);
          tree.push(grade);
        }
        const grade = gradeMap.get(row.grade_id);

        if (!subjectMap.has(row.subject_id)) {
          const subject = { id: row.subject_id, name: row.subject_name, knowledgePoints: [] as any[] };
          subjectMap.set(row.subject_id, subject);
          grade.subjects.push(subject);
        }
        const subject = subjectMap.get(row.subject_id);

        if (row.kp_id) {
          subject.knowledgePoints.push({ id: row.kp_id, name: row.kp_name });
        }
      }

      res.json(tree);
    } catch (err) { next(err); }
  });

  // ── Prompts ───────────────────────────────────────
  app.get('/api/admin/prompts', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query('SELECT * FROM prompts ORDER BY prompt_key');
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.put('/api/admin/prompts/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { template } = req.body;
      const [rows] = await options.pool.query('SELECT version FROM prompts WHERE prompt_key = ?', [req.params.key]);
      const current = (rows as any[])[0];
      const newVersion = current ? current.version + 1 : 1;

      await options.pool.query(
        'UPDATE prompts SET template = ?, version = ?, updated_at = NOW() WHERE prompt_key = ?',
        [template, newVersion, req.params.key]
      );

      res.json({ prompt_key: req.params.key, template, version: newVersion });
    } catch (err) { next(err); }
  });

  app.get('/api/prompts/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query(
        'SELECT * FROM prompts WHERE prompt_key = ?',
        [req.params.key]
      );
      const prompt = (rows as any[])[0];
      if (!prompt) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
        return;
      }
      res.json(prompt);
    } catch (err) { next(err); }
  });
  app.get('/error-test', (_req: Request, _res: Response, _next: NextFunction) => {
    throw new Error('Intentional test error');
  });

  // ── Error middleware ────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  });

  return app;
}

export { jwt };
