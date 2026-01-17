/**
 * フェーズ定義テスト (definitions.ts)
 * @spec docs/workflows/20260117_150655_ワ-クフロ-スキル未実装機能の追加/test-design.md
 *
 * テスト設計書のテストID: PD-001 〜 PD-010, GN-001 〜 GN-012, HF-001 〜 HF-012
 */

import { describe, it, expect } from 'vitest';
import {
  PHASES,
  getNextPhase,
  getPhaseIndex,
} from '../definitions.js';

// 実装済みの機能をインポート
import {
  PHASES_SMALL,
  PHASES_MEDIUM,
  PHASES_LARGE,
  PHASES_BY_SIZE,
  isValidTaskSize,
  getPhaseCount,
} from '../definitions.js';

describe('definitions.ts - フェーズ配列定義テスト', () => {
  describe('PD-001: PHASES_SMALLが6フェーズである', () => {
    it('PHASES_SMALL.length === 6', () => {
      expect(PHASES_SMALL.length).toBe(6);
    });
  });

  describe('PD-002: PHASES_SMALLの開始フェーズがresearchである', () => {
    it('PHASES_SMALL[0] === "research"', () => {
      expect(PHASES_SMALL[0]).toBe('research');
    });
  });

  describe('PD-003: PHASES_SMALLの終了フェーズがcompletedである', () => {
    it('PHASES_SMALL[5] === "completed"', () => {
      expect(PHASES_SMALL[5]).toBe('completed');
    });
  });

  describe('PD-004: PHASES_SMALLのフェーズ順序が正しい', () => {
    it('PHASES_SMALL === ["research", "requirements", "implementation", "testing", "commit", "completed"]', () => {
      expect(PHASES_SMALL).toEqual([
        'research',
        'requirements',
        'implementation',
        'testing',
        'commit',
        'completed',
      ]);
    });
  });

  describe('PD-005: PHASES_MEDIUMが12フェーズである', () => {
    it('PHASES_MEDIUM.length === 12', () => {
      expect(PHASES_MEDIUM.length).toBe(12);
    });
  });

  describe('PD-006: PHASES_MEDIUMの開始フェーズがresearchである', () => {
    it('PHASES_MEDIUM[0] === "research"', () => {
      expect(PHASES_MEDIUM[0]).toBe('research');
    });
  });

  describe('PD-007: PHASES_MEDIUMの終了フェーズがcompletedである', () => {
    it('PHASES_MEDIUM[11] === "completed"', () => {
      expect(PHASES_MEDIUM[11]).toBe('completed');
    });
  });

  describe('PD-008: PHASES_LARGEが17フェーズである', () => {
    it('PHASES_LARGE.length === 17', () => {
      expect(PHASES_LARGE.length).toBe(17);
    });
  });

  describe('PD-009: PHASES_LARGEが既存PHASESと同一である', () => {
    it('PHASES_LARGE === PHASES', () => {
      expect(PHASES_LARGE).toEqual(PHASES);
    });
  });

  describe('PD-010: PHASES_BY_SIZEが全サイズを含む', () => {
    it('Object.keys(PHASES_BY_SIZE) === ["small", "medium", "large"]', () => {
      expect(Object.keys(PHASES_BY_SIZE).sort()).toEqual(['large', 'medium', 'small']);
    });
  });
});

describe('definitions.ts - getNextPhase関数テスト (タスクサイズ対応)', () => {
  describe('Small タスク遷移', () => {
    it('GN-001: research → requirements へ遷移', () => {
      expect(getNextPhase('research', 'small')).toBe('requirements');
    });

    it('GN-002: requirements → implementation へ遷移', () => {
      expect(getNextPhase('requirements', 'small')).toBe('implementation');
    });

    it('GN-003: implementation → testing へ遷移', () => {
      expect(getNextPhase('implementation', 'small')).toBe('testing');
    });

    it('GN-004: testing → commit へ遷移', () => {
      expect(getNextPhase('testing', 'small')).toBe('commit');
    });

    it('GN-005: commit → completed へ遷移', () => {
      expect(getNextPhase('commit', 'small')).toBe('completed');
    });

    it('GN-006: completed からは null', () => {
      expect(getNextPhase('completed', 'small')).toBeNull();
    });
  });

  describe('Medium タスク遷移', () => {
    it('GN-007: research → requirements へ遷移', () => {
      expect(getNextPhase('research', 'medium')).toBe('requirements');
    });

    it('GN-008: design_review → test_design へ遷移', () => {
      expect(getNextPhase('design_review', 'medium')).toBe('test_design');
    });

    it('GN-009: commit → completed へ遷移', () => {
      expect(getNextPhase('commit', 'medium')).toBe('completed');
    });
  });

  describe('Large タスク遷移', () => {
    it('GN-010: 既存動作と同一 (research → requirements)', () => {
      expect(getNextPhase('research', 'large')).toBe('requirements');
    });

    it('GN-011: サイズ省略時はlargeとして動作', () => {
      // 現在の getNextPhase は1引数のみ対応のため、この期待値が通るよう拡張が必要
      expect(getNextPhase('research')).toBe('requirements');
    });
  });

  describe('エラーケース', () => {
    it('GN-012: 存在しないフェーズはnull', () => {
      // @ts-expect-error 無効なフェーズ名
      expect(getNextPhase('invalid_phase', 'small')).toBeNull();
    });
  });
});

describe('definitions.ts - ヘルパー関数テスト', () => {
  describe('isValidTaskSize', () => {
    it('HF-001: small は有効', () => {
      expect(isValidTaskSize('small')).toBe(true);
    });

    it('HF-002: medium は有効', () => {
      expect(isValidTaskSize('medium')).toBe(true);
    });

    it('HF-003: large は有効', () => {
      expect(isValidTaskSize('large')).toBe(true);
    });

    it('HF-004: 空文字は無効', () => {
      expect(isValidTaskSize('')).toBe(false);
    });

    it('HF-005: undefined は無効', () => {
      expect(isValidTaskSize(undefined)).toBe(false);
    });

    it('HF-006: 任意文字列は無効', () => {
      expect(isValidTaskSize('extra-large')).toBe(false);
    });

    it('HF-007: 大文字は無効', () => {
      expect(isValidTaskSize('SMALL')).toBe(false);
    });
  });

  describe('getPhaseCount', () => {
    it('HF-008: small のフェーズ数は 6', () => {
      expect(getPhaseCount('small')).toBe(6);
    });

    it('HF-009: medium のフェーズ数は 12', () => {
      expect(getPhaseCount('medium')).toBe(12);
    });

    it('HF-010: large のフェーズ数は 17', () => {
      expect(getPhaseCount('large')).toBe(17);
    });
  });

  describe('getPhaseIndex (タスクサイズ対応)', () => {
    it('HF-011: small 用 research のインデックスは 0', () => {
      expect(getPhaseIndex('research', 'small')).toBe(0);
    });

    it('HF-012: small 用 implementation のインデックスは 2', () => {
      expect(getPhaseIndex('implementation', 'small')).toBe(2);
    });
  });
});
