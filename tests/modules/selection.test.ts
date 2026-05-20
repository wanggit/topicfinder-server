import { describe, it, expect, vi } from 'vitest';
import { createSelectionModule, SelectionRepo } from '../../src/modules/selection';

function makeQuestion(id: number, difficulty: string, kpId = 1) {
  return {
    id, knowledge_point_id: kpId, type: 'choice', difficulty,
    stem: `题目${id}`, options: '["A","B","C","D"]', answer: 'A',
    explanation: '', solution_steps: '[]', common_mistakes: '[]',
    concept_tags: '[]', review_status: 'approved', version: 1,
    usage_count: 0, correct_count: 0,
  };
}

function fakeRepo(overrides: Partial<SelectionRepo> = {}): SelectionRepo {
  return {
    hasAnswered: vi.fn().mockResolvedValue(false),
    findWrongNoteQuestions: vi.fn().mockResolvedValue([]),
    findApprovedByKP: vi.fn().mockResolvedValue([]),
    countApprovedByKP: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('createSelectionModule', () => {
  describe('first contact', () => {
    it('returns difficulty-asc questions when student has no history', async () => {
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(false),
        findApprovedByKP: vi.fn().mockResolvedValue([
          makeQuestion(1, 'easy'),
          makeQuestion(2, 'medium'),
          makeQuestion(3, 'hard'),
        ]),
        countApprovedByKP: vi.fn().mockResolvedValue(10),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 3);

      expect(result.questions).toHaveLength(3);
      expect(result.questions[0].difficulty).toBe('easy');
      expect(result.questions[2].difficulty).toBe('hard');
      expect(result.source).toBe('bank');
      expect(result.total).toBe(10);
      expect(repo.hasAnswered).toHaveBeenCalledWith(100, 1);
      expect(repo.findApprovedByKP).toHaveBeenCalledWith(1, [], 3);
    });
  });

  describe('revisit with wrong notes', () => {
    it('prioritizes wrong-note questions before filling from bank', async () => {
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(true),
        findWrongNoteQuestions: vi.fn().mockResolvedValue([
          makeQuestion(5, 'hard'),
        ]),
        findApprovedByKP: vi.fn().mockResolvedValue([
          makeQuestion(1, 'easy'),
          makeQuestion(2, 'medium'),
        ]),
        countApprovedByKP: vi.fn().mockResolvedValue(5),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 10);

      expect(result.questions).toHaveLength(3);
      expect(result.questions[0].id).toBe(5);
      expect(repo.findWrongNoteQuestions).toHaveBeenCalledWith(100);
      expect(repo.findApprovedByKP).toHaveBeenCalledWith(1, [5], 9);
    });

    it('returns only wrong notes when count is met', async () => {
      const wrongQuestions = Array.from({ length: 10 }, (_, i) => makeQuestion(i + 1, 'medium'));
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(true),
        findWrongNoteQuestions: vi.fn().mockResolvedValue(wrongQuestions),
        countApprovedByKP: vi.fn().mockResolvedValue(20),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 10);

      expect(result.questions).toHaveLength(10);
      expect(result.source).toBe('bank');
      expect(repo.findApprovedByKP).not.toHaveBeenCalled();
    });
  });

  describe('revisit without wrong notes', () => {
    it('fills entirely from bank when no wrong notes exist', async () => {
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(true),
        findWrongNoteQuestions: vi.fn().mockResolvedValue([]),
        findApprovedByKP: vi.fn().mockResolvedValue([
          makeQuestion(1, 'easy'),
          makeQuestion(2, 'medium'),
        ]),
        countApprovedByKP: vi.fn().mockResolvedValue(2),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 10);

      expect(result.questions).toHaveLength(2);
      expect(repo.findApprovedByKP).toHaveBeenCalledWith(1, [], 10);
    });
  });

  describe('source field', () => {
    it('returns "partial_generate" when bank has fewer than requested', async () => {
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(false),
        findApprovedByKP: vi.fn().mockResolvedValue([makeQuestion(1, 'easy')]),
        countApprovedByKP: vi.fn().mockResolvedValue(1),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 10);

      expect(result.source).toBe('partial_generate');
      expect(result.total).toBe(1);
    });

    it('returns "bank" when bank meets requested count', async () => {
      const questions = Array.from({ length: 10 }, (_, i) => makeQuestion(i + 1, 'easy'));
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(false),
        findApprovedByKP: vi.fn().mockResolvedValue(questions),
        countApprovedByKP: vi.fn().mockResolvedValue(10),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 10);

      expect(result.source).toBe('bank');
    });
  });

  describe('custom count', () => {
    it('respects custom count parameter', async () => {
      const repo = fakeRepo({
        hasAnswered: vi.fn().mockResolvedValue(false),
        findApprovedByKP: vi.fn().mockResolvedValue([
          makeQuestion(1, 'easy'),
          makeQuestion(2, 'medium'),
          makeQuestion(3, 'hard'),
        ]),
        countApprovedByKP: vi.fn().mockResolvedValue(3),
      });
      const module = createSelectionModule(repo);

      const result = await module.selectQuestions(1, 100, 3);

      expect(repo.findApprovedByKP).toHaveBeenCalledWith(1, [], 3);
      expect(result.source).toBe('bank');
    });
  });
});