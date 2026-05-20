export interface SelectionRepo {
  hasAnswered(studentId: number, knowledgePointId: number): Promise<boolean>;
  findWrongNoteQuestions(studentId: number): Promise<any[]>;
  findApprovedByKP(knowledgePointId: number, excludeIds: number[], limit: number): Promise<any[]>;
  countApprovedByKP(knowledgePointId: number): Promise<number>;
}

export function createSelectionModule(repo: SelectionRepo) {
  return {
    async selectQuestions(knowledgePointId: number, studentId: number, count = 10) {
      const isFirstContact = !(await repo.hasAnswered(studentId, knowledgePointId));

      let questions: any[] = [];

      if (isFirstContact) {
        questions = await repo.findApprovedByKP(knowledgePointId, [], count);
      } else {
        questions = await repo.findWrongNoteQuestions(studentId);

        const remaining = count - questions.length;
        if (remaining > 0) {
          const existingIds = questions.map(q => q.id);
          const more = await repo.findApprovedByKP(knowledgePointId, existingIds, remaining);
          questions = questions.concat(more);
        }
      }

      const total = await repo.countApprovedByKP(knowledgePointId);
      const source = questions.length < count ? 'partial_generate' : 'bank';

      return { questions, source, total };
    },
  };
}

export class MySqlSelectionRepo implements SelectionRepo {
  constructor(private pool: any) {}

  async hasAnswered(studentId: number, knowledgePointId: number): Promise<boolean> {
    const [rows] = await this.pool.query(
      'SELECT id FROM answer_records WHERE student_id = ? AND knowledge_point_id = ? LIMIT 1',
      [studentId, knowledgePointId],
    );
    return (rows as any[]).length > 0;
  }

  async findWrongNoteQuestions(studentId: number): Promise<any[]> {
    const [wrongRows] = await this.pool.query(
      'SELECT question_id FROM wrong_notes WHERE student_id = ? AND consecutive_correct < 3 ORDER BY updated_at DESC',
      [studentId],
    );
    const wrongIds = (wrongRows as any[]).map((r: any) => r.question_id);
    if (wrongIds.length === 0) return [];

    const placeholders = wrongIds.map(() => '?').join(',');
    const [questions] = await this.pool.query(
      `SELECT * FROM questions WHERE id IN (${placeholders}) AND review_status = ?`,
      [...wrongIds, 'approved'],
    );
    return questions as any[];
  }

  async findApprovedByKP(knowledgePointId: number, excludeIds: number[], limit: number): Promise<any[]> {
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      const [rows] = await this.pool.query(
        `SELECT * FROM questions WHERE knowledge_point_id = ? AND review_status = ? AND id NOT IN (${placeholders}) ORDER BY FIELD(difficulty, "easy","medium","hard") LIMIT ?`,
        [knowledgePointId, 'approved', ...excludeIds, limit],
      );
      return rows as any[];
    }
    const [rows] = await this.pool.query(
      'SELECT * FROM questions WHERE knowledge_point_id = ? AND review_status = ? ORDER BY FIELD(difficulty, "easy","medium","hard") LIMIT ?',
      [knowledgePointId, 'approved', limit],
    );
    return rows as any[];
  }

  async countApprovedByKP(knowledgePointId: number): Promise<number> {
    const [rows] = await this.pool.query(
      'SELECT COUNT(*) as total FROM questions WHERE knowledge_point_id = ? AND review_status = ?',
      [knowledgePointId, 'approved'],
    );
    return (rows as any[])[0].total;
  }
}