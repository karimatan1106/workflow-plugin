/**
 * フェーズ定義テスト (definitions.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * small/mediumサイズは廃止されたため、largeサイズのみをテスト
 */

import { describe, it, expect } from 'vitest';
import {
  PHASES,
  PHASES_LARGE,
  getNextPhase,
  getPhaseIndex,
  isValidTaskSize,
  getPhaseCount,
} from '../definitions.js';

describe('definitions.ts - フェーズ配列定義テスト', () => {
  describe('PHASES_LARGEが18フェーズである', () => {
    it('PHASES_LARGE.length === 18', () => {
      expect(PHASES_LARGE.length).toBe(18);
    });
  });

  describe('PHASES_LARGEが既存PHASESと同一である', () => {
    it('PHASES_LARGE === PHASES', () => {
      expect(PHASES_LARGE).toEqual(PHASES);
    });
  });

  describe('PHASES_LARGEの開始フェーズがresearchである', () => {
    it('PHASES_LARGE[0] === "research"', () => {
      expect(PHASES_LARGE[0]).toBe('research');
    });
  });

  describe('PHASES_LARGEの終了フェーズがcompletedである', () => {
    it('PHASES_LARGE[17] === "completed"', () => {
      expect(PHASES_LARGE[17]).toBe('completed');
    });
  });
});

describe('definitions.ts - getNextPhase関数テスト', () => {
  describe('Large タスク遷移', () => {
    it('research → requirements へ遷移', () => {
      expect(getNextPhase('research', 'large')).toBe('requirements');
    });

    it('design_review → test_design へ遷移', () => {
      expect(getNextPhase('design_review', 'large')).toBe('test_design');
    });

    it('deploy → completed へ遷移', () => {
      expect(getNextPhase('deploy', 'large')).toBe('completed');
    });

    it('completed からは null', () => {
      expect(getNextPhase('completed', 'large')).toBeNull();
    });

    it('サイズ省略時はlargeとして動作', () => {
      expect(getNextPhase('research')).toBe('requirements');
    });
  });

  describe('エラーケース', () => {
    it('存在しないフェーズはnull', () => {
      // @ts-expect-error 無効なフェーズ名
      expect(getNextPhase('invalid_phase', 'large')).toBeNull();
    });
  });
});

describe('definitions.ts - ヘルパー関数テスト', () => {
  describe('isValidTaskSize', () => {
    it('large は有効', () => {
      expect(isValidTaskSize('large')).toBe(true);
    });

    it('small は無効（廃止）', () => {
      expect(isValidTaskSize('small')).toBe(false);
    });

    it('medium は無効（廃止）', () => {
      expect(isValidTaskSize('medium')).toBe(false);
    });

    it('空文字は無効', () => {
      expect(isValidTaskSize('')).toBe(false);
    });

    it('undefined は無効', () => {
      expect(isValidTaskSize(undefined)).toBe(false);
    });

    it('任意文字列は無効', () => {
      expect(isValidTaskSize('extra-large')).toBe(false);
    });
  });

  describe('getPhaseCount', () => {
    it('large のフェーズ数は 18', () => {
      expect(getPhaseCount('large')).toBe(18);
    });
  });

  describe('getPhaseIndex', () => {
    it('research のインデックスは 0', () => {
      expect(getPhaseIndex('research', 'large')).toBe(0);
    });

    it('implementation のインデックスは 7', () => {
      expect(getPhaseIndex('implementation', 'large')).toBe(7);
    });
  });
});
