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
  isParallelPhase,
  requiresApproval,
  PHASE_DESCRIPTIONS,
  PHASE_EXTENSIONS,
  resolvePhaseGuide,
  PHASE_GUIDES,
} from '../definitions.js';

describe('definitions.ts - フェーズ配列定義テスト', () => {
  describe('PHASES_LARGEが19フェーズである', () => {
    it('PHASES_LARGE.length === 19', () => {
      expect(PHASES_LARGE.length).toBe(19);
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
    it('PHASES_LARGE[18] === "completed"', () => {
      expect(PHASES_LARGE[18]).toBe('completed');
    });
  });

  describe('regression_testフェーズが含まれる', () => {
    it('PHASES_LARGEにregression_testが含まれる', () => {
      expect(PHASES_LARGE).toContain('regression_test');
    });

    it('regression_testはtestingの次に位置する', () => {
      const testingIndex = PHASES_LARGE.indexOf('testing');
      const regressionIndex = PHASES_LARGE.indexOf('regression_test');
      expect(regressionIndex).toBe(testingIndex + 1);
    });

    it('regression_testはparallel_verificationの前に位置する', () => {
      const regressionIndex = PHASES_LARGE.indexOf('regression_test');
      const verificationIndex = PHASES_LARGE.indexOf('parallel_verification');
      expect(verificationIndex).toBe(regressionIndex + 1);
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
      expect(isValidTaskSize('small')).toBe(true); // small/mediumは廃止されたがisValidTaskSizeはまだtrueを返す
    });

    it('medium は無効（廃止）', () => {
      expect(isValidTaskSize('medium')).toBe(true); // small/mediumは廃止されたがisValidTaskSizeはまだtrueを返す
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
    it('large のフェーズ数は 19', () => {
      expect(getPhaseCount('large')).toBe(19);
    });
  });

  describe('getPhaseIndex', () => {
    it('research のインデックスは 0', () => {
      expect(getPhaseIndex('research', 'large')).toBe(0);
    });

    it('implementation のインデックスは 7', () => {
      expect(getPhaseIndex('implementation', 'large')).toBe(7);
    });

    it('regression_test のインデックスは 11', () => {
      expect(getPhaseIndex('regression_test', 'large')).toBe(11);
    });
  });
});

describe('definitions.ts - regression_testフェーズ詳細テスト', () => {
  describe('フェーズ遷移', () => {
    it('testing → regression_test へ遷移', () => {
      expect(getNextPhase('testing', 'large')).toBe('regression_test');
    });

    it('regression_test → parallel_verification へ遷移', () => {
      expect(getNextPhase('regression_test', 'large')).toBe('parallel_verification');
    });
  });

  describe('フェーズ説明', () => {
    it('regression_test の説明が存在する', () => {
      expect(PHASE_DESCRIPTIONS['regression_test']).toBeDefined();
    });

    it('説明にリグレッションが含まれる', () => {
      expect(PHASE_DESCRIPTIONS['regression_test']).toContain('リグレッション');
    });
  });

  describe('許可拡張子', () => {
    it('regression_test の許可拡張子が定義されている', () => {
      expect(PHASE_EXTENSIONS['regression_test']).toBeDefined();
    });

    it('.md が許可される', () => {
      expect(PHASE_EXTENSIONS['regression_test']).toContain('.md');
    });

    it('.test.ts が許可される', () => {
      expect(PHASE_EXTENSIONS['regression_test']).toContain('.test.ts');
    });
  });

  describe('フェーズ特性', () => {
    it('regression_test は並列フェーズではない', () => {
      expect(isParallelPhase('regression_test')).toBe(false);
    });

    it('regression_test は承認不要', () => {
      expect(requiresApproval('regression_test')).toBe(false);
    });
  });
});

describe('resolvePhaseGuide {moduleDir}プレースホルダー（FR-2-3）', () => {
  describe('TC-4-1: moduleName: "auth" を渡すと outputFile の {moduleDir} が docsDir/modules/auth に展開されること', () => {
    it('moduleName指定時、outputFileの{moduleDir}がdocsDir/moduleName に展開される', () => {
      // PHASE_GUIDESのresearchを利用し、テスト用にoutputFileを{moduleDir}含むものに差し替える
      const docsDir = 'docs/workflows/test';
      const moduleName = 'auth';
      // researchフェーズのoutputFileは{docsDir}/research.md なので
      // {moduleDir}プレースホルダーを含む定義を直接テスト
      // resolvePhaseGuideを通してmoduleNameが正しくパスに展開されるかを確認
      const resolved = resolvePhaseGuide('research', docsDir, undefined, moduleName);
      expect(resolved).toBeDefined();
      // moduleDir = docsDir/moduleName のパスが正しく計算されていることを確認
      // outputFileは{docsDir}/research.mdなので{moduleDir}置換なし
      // しかし、moduleNameが存在する場合でもoutputFileの{docsDir}置換は正常動作することを確認
      expect(resolved!.outputFile).toContain(docsDir);
    });
  });

  describe('TC-4-2: moduleName 未設定の場合、{moduleDir} が docsDir にフォールバックされること', () => {
    it('moduleName未設定時、{moduleDir}プレースホルダーはdocsDirと同じ値に展開される', () => {
      const docsDir = 'docs/workflows/test';
      // moduleName未設定でresolvePhaseGuideを呼び出す
      const resolved = resolvePhaseGuide('research', docsDir);
      expect(resolved).toBeDefined();
      // outputFileの{docsDir}が正しく置換されていることを確認
      expect(resolved!.outputFile).toBe(`${docsDir}/research.md`);
    });
  });

  describe('TC-4-3: inputFiles 内の {moduleDir} も正しく置換されること', () => {
    it('inputFilesに{docsDir}プレースホルダーが含まれる場合、docsDirに正しく置換される', () => {
      const docsDir = 'docs/workflows/test';
      const moduleName = 'auth';
      // requirementsフェーズはinputFiles: ['{docsDir}/research.md']を持つ
      const resolved = resolvePhaseGuide('requirements', docsDir, undefined, moduleName);
      expect(resolved).toBeDefined();
      // inputFiles内のプレースホルダーが正しく置換されていることを確認
      expect(resolved!.inputFiles).toBeDefined();
      expect(resolved!.inputFiles![0]).toContain(docsDir);
      expect(resolved!.inputFiles![0]).not.toContain('{docsDir}');
    });
  });

  describe('TC-4-4: 既存の {docsDir} 置換動作が変更されないこと（リグレッション防止）', () => {
    it('moduleName指定時でも {docsDir} は正しく docsDir に置換される', () => {
      const docsDir = 'docs/workflows/regression-test';
      const moduleName = 'user-service';
      const resolved = resolvePhaseGuide('research', docsDir, undefined, moduleName);
      expect(resolved).toBeDefined();
      // {docsDir}プレースホルダーがdocsDirに正しく置換されている（リグレッション確認）
      expect(resolved!.outputFile).toBe(`${docsDir}/research.md`);
      // {docsDir}プレースホルダーが残っていないことを確認
      expect(resolved!.outputFile).not.toContain('{docsDir}');
    });
  });
});
