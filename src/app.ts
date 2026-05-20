import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface AppOptions {
  dbHealthy: boolean;
  pool?: any;
  jwtSecret?: string;
  protectedTestRoute?: boolean;
  llmClient?: {
    chatOnce: (messages: any[], model?: string) => Promise<string>;
    analyzeImage: (imageBase64: string, prompt: string) => Promise<string>;
    streamChat: (messages: any[], model?: string) => any;
  };
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

  // ── Generation Tasks ──────────────────────────────
  app.post('/api/admin/generation-tasks', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { knowledgePointId, questionTypes, difficulty, count } = req.body;
      const [result] = await options.pool.query(
        'INSERT INTO generation_tasks (knowledge_point_id, question_types, difficulty, count, status, progress) VALUES (?, ?, ?, ?, ?, ?)',
        [knowledgePointId, JSON.stringify(questionTypes), difficulty, count, 'pending', 0]
      );
      res.status(201).json({ id: (result as any).insertId, status: 'pending' });
    } catch (err) { next(err); }
  });

  app.get('/api/admin/generation-tasks', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query('SELECT * FROM generation_tasks ORDER BY id DESC');
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.get('/api/admin/generation-tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query('SELECT * FROM generation_tasks WHERE id = ?', [req.params.id]);
      const task = (rows as any[])[0];
      if (!task) { res.status(404).json({ error: { code: 'NOT_FOUND' } }); return; }
      res.json(task);
    } catch (err) { next(err); }
  });
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
  // ── Knowledge: Subjects ──────────────────────────
  app.get('/api/admin/subjects', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gradeId } = req.query;
      const [rows] = await options.pool.query(
        'SELECT * FROM subjects WHERE grade_id = ? ORDER BY sort_order',
        [gradeId]
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.post('/api/admin/subjects', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gradeId, name, sortOrder } = req.body;
      const [result] = await options.pool.query(
        'INSERT INTO subjects (grade_id, name, sort_order) VALUES (?, ?, ?)',
        [gradeId, name, sortOrder || 0]
      );
      res.status(201).json({ id: (result as any).insertId, grade_id: gradeId, name });
    } catch (err) { next(err); }
  });

  app.delete('/api/admin/subjects/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await options.pool.query('DELETE FROM knowledge_points WHERE subject_id = ?', [req.params.id]);
      await options.pool.query('DELETE FROM subjects WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ── Knowledge: KnowledgePoints ────────────────────
  app.get('/api/admin/knowledge-points', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subjectId } = req.query;
      const [rows] = await options.pool.query(
        'SELECT * FROM knowledge_points WHERE subject_id = ? ORDER BY id',
        [subjectId]
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.post('/api/admin/knowledge-points', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subjectId, name, description } = req.body;
      const [result] = await options.pool.query(
        'INSERT INTO knowledge_points (subject_id, name, description) VALUES (?, ?, ?)',
        [subjectId, name, description || '']
      );
      res.status(201).json({ id: (result as any).insertId, subject_id: subjectId, name });
    } catch (err) { next(err); }
  });

  app.put('/api/admin/knowledge-points/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { versionIds } = req.body;
      await options.pool.query('DELETE FROM kp_versions WHERE kp_id = ?', [req.params.id]);
      for (const versionId of versionIds) {
        await options.pool.query('INSERT INTO kp_versions (kp_id, version_id) VALUES (?, ?)', [req.params.id, versionId]);
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ── Questions Admin CRUD ──────────────────────────
  app.get('/api/admin/questions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { kpId, type, difficulty, status, page = '1' } = req.query;
      const limit = 20;
      const offset = (Number(page) - 1) * limit;
      const conditions: string[] = [];
      const params: any[] = [];

      if (kpId) { conditions.push('knowledge_point_id = ?'); params.push(kpId); }
      if (type) { conditions.push('type = ?'); params.push(type); }
      if (difficulty) { conditions.push('difficulty = ?'); params.push(difficulty); }
      if (status) { conditions.push('review_status = ?'); params.push(status); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows] = await options.pool.query(
        `SELECT * FROM questions ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [countRows] = await options.pool.query(
        `SELECT COUNT(*) as total FROM questions ${where}`,
        params
      );

      res.json({ questions: rows, total: (countRows as any[])[0].total });
    } catch (err) { next(err); }
  });

  app.post('/api/admin/questions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { knowledgePointId, type, difficulty, stem, answer, explanation, solutionSteps, commonMistakes, conceptTags } = req.body;
      const questionOptions = req.body.options;
      const [result] = await options.pool.query(
        `INSERT INTO questions (knowledge_point_id, type, difficulty, stem, options, answer, explanation, solution_steps, common_mistakes, concept_tags, review_status, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1)`,
        [knowledgePointId, type, difficulty, stem, JSON.stringify(questionOptions || []), answer, explanation || '',
         JSON.stringify(solutionSteps || []), JSON.stringify(commonMistakes || []), JSON.stringify(conceptTags || [])]
      );
      res.status(201).json({ id: (result as any).insertId });
    } catch (err) { next(err); }
  });

  app.put('/api/admin/questions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fields = ['stem', 'type', 'difficulty', 'options', 'answer', 'explanation', 'solution_steps', 'common_mistakes', 'concept_tags'];
      const sets: string[] = [];
      const params: any[] = [];
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          sets.push(`${f} = ?`);
          params.push(['options', 'solution_steps', 'common_mistakes', 'concept_tags'].includes(f)
            ? JSON.stringify(req.body[f]) : req.body[f]);
        }
      }
      if (sets.length) {
        await options.pool.query(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`, [...params, req.params.id]);
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  app.delete('/api/admin/questions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await options.pool.query('DELETE FROM questions WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ── Question Selection ────────────────────────────
  app.post('/api/questions/select', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { knowledgePointId, freeDescription, count = 10 } = req.body;
      const studentId = req.student!.studentId;

      const [records] = await options.pool.query(
        'SELECT id FROM answer_records WHERE student_id = ? AND knowledge_point_id = ? LIMIT 1',
        [studentId, knowledgePointId]
      );
      const isFirstContact = (records as any[]).length === 0;

      let questions: any[] = [];

      if (isFirstContact) {
        const [rows] = await options.pool.query(
          'SELECT * FROM questions WHERE knowledge_point_id = ? AND review_status = ? ORDER BY FIELD(difficulty, "easy","medium","hard") LIMIT ?',
          [knowledgePointId, 'approved', count]
        );
        questions = rows as any[];
      } else {
        const [wrongRows] = await options.pool.query(
          'SELECT question_id FROM wrong_notes WHERE student_id = ? AND consecutive_correct < 3 ORDER BY updated_at DESC',
          [studentId]
        );
        const wrongIds = (wrongRows as any[]).map(r => r.question_id);

        if (wrongIds.length > 0) {
          const placeholders = wrongIds.map(() => '?').join(',');
          const [wrongQs] = await options.pool.query(
            `SELECT * FROM questions WHERE id IN (${placeholders}) AND review_status = ?`,
            [...wrongIds, 'approved']
          );
          questions = wrongQs as any[];
        }

        const remaining = count - questions.length;
        if (remaining > 0) {
          const existingIds = questions.map(q => q.id);
          if (existingIds.length > 0) {
            const placeholders = existingIds.map(() => '?').join(',');
            const [more] = await options.pool.query(
              `SELECT * FROM questions WHERE knowledge_point_id = ? AND review_status = ? AND id NOT IN (${placeholders}) ORDER BY FIELD(difficulty, "easy","medium","hard") LIMIT ?`,
              [knowledgePointId, 'approved', ...existingIds, remaining]
            );
            questions = questions.concat(more as any[]);
          } else {
            const [more] = await options.pool.query(
              'SELECT * FROM questions WHERE knowledge_point_id = ? AND review_status = ? ORDER BY FIELD(difficulty, "easy","medium","hard") LIMIT ?',
              [knowledgePointId, 'approved', remaining]
            );
            questions = questions.concat(more as any[]);
          }
        }
      }

      const [totalRows] = await options.pool.query(
        'SELECT COUNT(*) as total FROM questions WHERE knowledge_point_id = ? AND review_status = ?',
        [knowledgePointId, 'approved']
      );
      const total = (totalRows as any[])[0].total;
      const source = questions.length < count ? 'partial_generate' : 'bank';

      res.json({ questions, source, total });
    } catch (err) { next(err); }
  });

  // ── Grading ──────────────────────────────────────
  app.post('/api/grade', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { questionId, studentAnswer, studentImage } = req.body;
      if (!questionId || (!studentAnswer && !studentImage)) {
        res.status(400).json({ error: { code: 'MISSING_PARAMS', message: 'questionId and studentAnswer or studentImage required' } });
        return;
      }

      const [rows] = await options.pool.query('SELECT * FROM questions WHERE id = ?', [questionId]);
      const question = (rows as any[])[0];
      if (!question) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found' } });
        return;
      }

      let answerText = studentAnswer;
      let ocrText: string | undefined;

      // OCR if image provided
      if (studentImage && options.llmClient) {
        ocrText = await options.llmClient.analyzeImage(studentImage, 'Extract the student\'s answer from this image. Only return the answer text, no explanation.');
        answerText = ocrText;
      }

      // Grade via LLM
      if (options.llmClient) {
        const prompt = `Grade this student answer.

Question: ${question.stem}
Question Type: ${question.type}
Correct Answer: ${question.answer}
Student Answer: ${answerText}

Return JSON: {"isCorrect": true|false, "explanation": "brief explanation in Chinese"}`;

        const result = await options.llmClient.chatOnce([{ role: 'user', content: prompt }]);
        const parsed = JSON.parse(result);

        // Record answer
        const [kpRows] = await options.pool.query('SELECT knowledge_point_id FROM questions WHERE id = ?', [questionId]);
        const kpId = (kpRows as any[])[0]?.knowledge_point_id;

        await options.pool.query(
          'INSERT INTO answer_records (student_id, question_id, knowledge_point_id, is_correct, answered_at) VALUES (?, ?, ?, ?, NOW())',
          [req.student!.studentId, questionId, kpId, parsed.isCorrect]
        );

        // Update wrong_notes
        if (parsed.isCorrect) {
          const [wnRows] = await options.pool.query(
            'SELECT id, consecutive_correct, last_correct_at FROM wrong_notes WHERE student_id = ? AND question_id = ?',
            [req.student!.studentId, questionId]
          );
          const wn = (wnRows as any[])[0];
          if (wn) {
            const newCount = wn.consecutive_correct + 1;
            const now = new Date();
            const lastDate = wn.last_correct_at ? new Date(wn.last_correct_at) : null;
            const dayDiff = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / 86400000) : 0;
            const mastered = newCount >= 3 && dayDiff >= 1;
            await options.pool.query(
              'UPDATE wrong_notes SET consecutive_correct = ?, last_correct_at = NOW() WHERE id = ?',
              [newCount, wn.id]
            );
          }
        } else {
          const [existing] = await options.pool.query(
            'SELECT id FROM wrong_notes WHERE student_id = ? AND question_id = ?',
            [req.student!.studentId, questionId]
          );
          if ((existing as any[]).length === 0) {
            await options.pool.query(
              'INSERT INTO wrong_notes (student_id, question_id, knowledge_point_id, consecutive_correct) VALUES (?, ?, ?, 0)',
              [req.student!.studentId, questionId, kpId]
            );
          }
        }

        // Auto-supplement check: if coverage >= 70%, trigger generation task
        const [correctRows] = await options.pool.query(
          'SELECT COUNT(*) as cnt FROM answer_records WHERE student_id = ? AND knowledge_point_id = ? AND is_correct = 1',
          [req.student!.studentId, kpId]
        );
        const [totalQ] = await options.pool.query(
          'SELECT COUNT(*) as cnt FROM questions WHERE knowledge_point_id = ? AND review_status = ?',
          [kpId, 'approved']
        );
        const coverage = (totalQ as any[])[0].cnt > 0 ? (correctRows as any[])[0].cnt / (totalQ as any[])[0].cnt : 0;
        if (coverage >= 0.7) {
          const [pendingTasks] = await options.pool.query(
            'SELECT id FROM generation_tasks WHERE knowledge_point_id = ? AND status = ?',
            [kpId, 'pending']
          );
          if ((pendingTasks as any[]).length === 0) {
            await options.pool.query(
              'INSERT INTO generation_tasks (knowledge_point_id, question_types, difficulty, count, status, progress) VALUES (?, ?, ?, ?, ?, ?)',
              [kpId, JSON.stringify(['choice', 'fill', 'essay']), 'easy', 10, 'pending', 0]
            );
          }
        }

        res.json({ ...parsed, studentOcrText: ocrText });
      } else {
        res.json({ isCorrect: false, explanation: 'LLM not configured' });
      }
    } catch (err) { next(err); }
  });

  // ── Payment (stub) ──────────────────────────────
  app.post('/api/pay/subscribe', authenticate, async (req: Request, res: Response) => {
    res.json({ prepayId: 'stub-prepay-id', message: 'Payment stub — implement WeChat Pay SDK' });
  });

  app.post('/api/pay/callback', async (req: Request, res: Response) => {
    res.json({ code: 'SUCCESS' });
  });

  // ── Wrong Notes API ─────────────────────────────
  app.get('/api/wrong-notes', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query(
        `SELECT wn.*, q.stem, q.type, q.difficulty, q.answer, kp.name as kp_name
         FROM wrong_notes wn
         JOIN questions q ON q.id = wn.question_id
         JOIN knowledge_points kp ON kp.id = wn.knowledge_point_id
         WHERE wn.student_id = ? AND wn.consecutive_correct < 3
         ORDER BY wn.updated_at DESC`,
        [req.student!.studentId]
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.get('/api/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query('SELECT trial_expires_at, subscription_status FROM students WHERE id = ?', [req.student!.studentId]);
      const s = (rows as any[])[0];
      const [statsRows] = await options.pool.query(
        'SELECT COUNT(*) as today_questions, SUM(is_correct) as today_correct FROM answer_records WHERE student_id = ? AND DATE(answered_at) = CURDATE()',
        [req.student!.studentId]
      );
      res.json({ ...s, ...(statsRows as any[])[0] });
    } catch (err) { next(err); }
  });

  app.get('/api/leaderboard', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query(
        `SELECT s.openid, COUNT(ar.id) as total, SUM(ar.is_correct) as correct
         FROM answer_records ar JOIN students s ON s.id = ar.student_id
         GROUP BY s.id ORDER BY correct DESC LIMIT 50`
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── Admin Stats ────────────────────────────────
  app.get('/api/admin/stats', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [[students], [questions], [answers]] = await Promise.all([
        options.pool.query('SELECT COUNT(*) as cnt FROM students'),
        options.pool.query('SELECT COUNT(*) as cnt FROM questions'),
        options.pool.query('SELECT COUNT(*) as cnt FROM answer_records'),
        options.pool.query('SELECT COUNT(DISTINCT student_id) as cnt FROM answer_records WHERE DATE(answered_at) = CURDATE()'),
      ]);
      res.json({
        totalStudents: (students as any[])[0].cnt,
        totalQuestions: (questions as any[])[0].cnt,
        totalAnswers: (answers as any[])[0].cnt,
        activeToday: 0,
      });
    } catch (err) { next(err); }
  });

  app.get('/api/admin/users', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [rows] = await options.pool.query('SELECT * FROM students ORDER BY id DESC LIMIT 50');
      res.json(rows);
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

  const connections = new Map<number, WebSocket>();

  function attachWs(server: Server) {
    const wss = new WebSocketServer({ server, path: '/ws/tutor' });

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }

      let studentId: number;
      try {
        const payload = jwt.verify(token, jwtSecret) as any;
        studentId = payload.studentId;
      } catch {
        ws.close(4001, 'Invalid token');
        return;
      }

      // Kick old connection
      const existing = connections.get(studentId);
      if (existing) { existing.close(); }
      connections.set(studentId, ws);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          switch (msg.type) {
            case 'start_session':
              ws.send(JSON.stringify({ type: 'session_started', kpId: msg.kpId }));
              break;
            case 'student_message':
              ws.send(JSON.stringify({ type: 'tutor_hint', text: 'Placeholder hint' }));
              break;
            case 'end_session':
              ws.send(JSON.stringify({ type: 'session_end', summary: 'Session ended' }));
              break;
            default:
              ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_TYPE' }));
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON' }));
        }
      });

      ws.on('close', () => {
        connections.delete(studentId);
      });
    });
  }

  (app as any).attachWs = attachWs;
  return app;
}

export { jwt };
