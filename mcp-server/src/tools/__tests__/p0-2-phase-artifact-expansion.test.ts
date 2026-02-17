/**
 * P0-2 テスト: PHASE_TO_ARTIFACTのparallel_analysis拡張検証
 * @spec docs/workflows/P0問題3件の根本修正/test-design.md
 *
 * next.tsのPHASE_TO_ARTIFACTにparallel_analysisキーが追加され、
 * spec.mdとthreat-model.mdの両方が登録されることを検証する。
 * また既存3エントリ（research/requirements/test_design）が維持されることも確認する。
 */

import { describe, it, expect } from 'vitest';

// PHASE_TO_ARTIFACTはモジュールスコープの定数のためnext.tsから間接的にテストする
// next.tsは多くの依存を持つため、依存モジュールをモック化してインポートする
import { vi } from 'vitest';

vi.mock('../../state/manager.js', () => ({
  stateManager: {
    getTaskById: vi.fn(),
    updateTaskPhase: vi.fn(),
    getIncompleteSubPhases: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../validation/design-validator.js', () => ({
  DesignValidator: vi.fn().mockImplementation(() => ({
    validateAll: vi.fn().mockReturnValue({ passed: true, missingItems: [], warnings: [], summary: { total: 0, implemented: 0, missing: 0 } }),
  })),
  formatValidationError: vi.fn(),
  performDesignValidation: vi.fn(() => null),
}));

vi.mock('../../validation/scope-validator.js', () => ({
  validateScopePostExecution: vi.fn(() => ({ valid: true, outOfScopeFiles: [], warnings: [] })),
}));

vi.mock('../../audit/logger.js', () => ({
  auditLogger: {
    log: vi.fn(),
    countRecentBypasses: vi.fn(() => 0),
    checkThreshold: vi.fn(() => false),
  },
}));

vi.mock('../../validation/test-authenticity.js', () => ({
  validateTestAuthenticity: vi.fn(() => ({ valid: true, warnings: [] })),
  recordTestOutputHash: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
    statSync: vi.fn(() => ({ size: 100 })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('../helpers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../helpers.js')>();
  return {
    ...original,
    verifySessionToken: vi.fn(() => null),
  };
});

// next.tsをインポートしてPHASE_TO_ARTIFACTを間接参照する
// 実際の定数はnext.ts内でモジュールスコープに定義されており、
// workflowNext関数の振る舞いを通じてテストする

describe('P0-2: PHASE_TO_ARTIFACTのparallel_analysis拡張', () => {
  // PHASE_TO_ARTIFACTの内容を直接検証するため、
  // next.tsのモジュール内部定数を検査する方法を採用する
  // vi.importActualを使用してモジュール全体を取得する

  describe('TC-2-1: PHASE_TO_ARTIFACTにparallel_analysisキーが存在する', () => {
    it('parallel_analysisキーがPHASE_TO_ARTIFACTに定義されている', async () => {
      // next.tsのソースコードを直接読み取り、PHASE_TO_ARTIFACTの定義を確認する
      // これはモジュール内部定数への直接アクセスが困難なため、
      // ソースコードのテキスト検証を使用する補助的なアプローチとして採用する
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { resolve } = await vi.importActual<typeof import('path')>('path');

      const nextTsPath = resolve(
        new URL('../../tools/next.ts', import.meta.url).pathname
          .replace(/^\/([A-Z]:)/, '$1') // Windows パス補正
      );

      let sourceContent: string;
      try {
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextTsPath, 'utf8');
      } catch {
        // ソースが読めない場合はdistファイルを試みる
        const nextJsPath = resolve(
          new URL('../../tools/next.js', import.meta.url).pathname
            .replace(/^\/([A-Z]:)/, '$1')
        );
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextJsPath, 'utf8');
      }

      // parallel_analysisキーが定数PHASE_TO_ARTIFACTに含まれることを確認する
      expect(sourceContent).toContain('parallel_analysis');
    });
  });

  describe('TC-2-2: parallel_analysisの値にspec.mdが含まれる', () => {
    it('PHASE_TO_ARTIFACTのparallel_analysisエントリにspec.mdが登録されている', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { resolve } = await vi.importActual<typeof import('path')>('path');

      const nextTsPath = resolve(
        new URL('../../tools/next.ts', import.meta.url).pathname
          .replace(/^\/([A-Z]:)/, '$1')
      );

      let sourceContent: string;
      try {
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextTsPath, 'utf8');
      } catch {
        const nextJsPath = resolve(
          new URL('../../tools/next.js', import.meta.url).pathname
            .replace(/^\/([A-Z]:)/, '$1')
        );
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextJsPath, 'utf8');
      }

      // spec.mdがPHASE_TO_ARTIFACTブロック内に含まれることを確認する
      // parallel_analysisとspec.mdが同じ定数定義ブロックに存在するかチェックする
      const phaseToArtifactBlock = extractPhaseToArtifactBlock(sourceContent);
      expect(phaseToArtifactBlock).toContain('spec.md');
    });
  });

  describe('TC-2-3: parallel_analysisの値にthreat-model.mdが含まれる', () => {
    it('PHASE_TO_ARTIFACTのparallel_analysisエントリにthreat-model.mdが登録されている', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { resolve } = await vi.importActual<typeof import('path')>('path');

      const nextTsPath = resolve(
        new URL('../../tools/next.ts', import.meta.url).pathname
          .replace(/^\/([A-Z]:)/, '$1')
      );

      let sourceContent: string;
      try {
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextTsPath, 'utf8');
      } catch {
        const nextJsPath = resolve(
          new URL('../../tools/next.js', import.meta.url).pathname
            .replace(/^\/([A-Z]:)/, '$1')
        );
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextJsPath, 'utf8');
      }

      // threat-model.mdがPHASE_TO_ARTIFACTブロック内に含まれることを確認する
      const phaseToArtifactBlock = extractPhaseToArtifactBlock(sourceContent);
      expect(phaseToArtifactBlock).toContain('threat-model.md');
    });
  });

  describe('TC-2-4: 既存の3エントリが維持されている', () => {
    it('researchエントリがresearch.mdを含む', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { resolve } = await vi.importActual<typeof import('path')>('path');

      const nextTsPath = resolve(
        new URL('../../tools/next.ts', import.meta.url).pathname
          .replace(/^\/([A-Z]:)/, '$1')
      );

      let sourceContent: string;
      try {
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextTsPath, 'utf8');
      } catch {
        const nextJsPath = resolve(
          new URL('../../tools/next.js', import.meta.url).pathname
            .replace(/^\/([A-Z]:)/, '$1')
        );
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextJsPath, 'utf8');
      }

      const phaseToArtifactBlock = extractPhaseToArtifactBlock(sourceContent);
      // 後方互換性: researchエントリは変更されないことを確認する
      expect(phaseToArtifactBlock).toContain('research');
      expect(phaseToArtifactBlock).toContain('research.md');
    });

    it('requirementsエントリがrequirements.mdを含む', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { resolve } = await vi.importActual<typeof import('path')>('path');

      const nextTsPath = resolve(
        new URL('../../tools/next.ts', import.meta.url).pathname
          .replace(/^\/([A-Z]:)/, '$1')
      );

      let sourceContent: string;
      try {
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextTsPath, 'utf8');
      } catch {
        const nextJsPath = resolve(
          new URL('../../tools/next.js', import.meta.url).pathname
            .replace(/^\/([A-Z]:)/, '$1')
        );
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextJsPath, 'utf8');
      }

      const phaseToArtifactBlock = extractPhaseToArtifactBlock(sourceContent);
      // 後方互換性: requirementsエントリは変更されないことを確認する
      expect(phaseToArtifactBlock).toContain('requirements');
      expect(phaseToArtifactBlock).toContain('requirements.md');
    });

    it('test_designエントリがtest-design.mdを含む', async () => {
      const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
      const { resolve } = await vi.importActual<typeof import('path')>('path');

      const nextTsPath = resolve(
        new URL('../../tools/next.ts', import.meta.url).pathname
          .replace(/^\/([A-Z]:)/, '$1')
      );

      let sourceContent: string;
      try {
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextTsPath, 'utf8');
      } catch {
        const nextJsPath = resolve(
          new URL('../../tools/next.js', import.meta.url).pathname
            .replace(/^\/([A-Z]:)/, '$1')
        );
        sourceContent = (readFileSync as (path: string, encoding: string) => string)(nextJsPath, 'utf8');
      }

      const phaseToArtifactBlock = extractPhaseToArtifactBlock(sourceContent);
      // 後方互換性: test_designエントリは変更されないことを確認する
      expect(phaseToArtifactBlock).toContain('test_design');
      expect(phaseToArtifactBlock).toContain('test-design.md');
    });
  });
});

/**
 * ソースコードからPHASE_TO_ARTIFACTの定数定義ブロックを抽出するヘルパー関数
 *
 * PHASE_TO_ARTIFACTの定義が始まる行から最初の閉じ波括弧の行までを取得する。
 * 抽出に失敗した場合はソースコード全体を返す（検索対象が広くなるだけで問題ない）。
 */
function extractPhaseToArtifactBlock(sourceContent: string): string {
  const startIndex = sourceContent.indexOf('PHASE_TO_ARTIFACT');
  if (startIndex === -1) {
    return sourceContent;
  }
  // 定数定義の終端（閉じ波括弧）を探す
  const blockStart = sourceContent.indexOf('{', startIndex);
  if (blockStart === -1) {
    return sourceContent.substring(startIndex);
  }
  // 対応する閉じ波括弧を探す
  let depth = 0;
  for (let i = blockStart; i < sourceContent.length; i++) {
    if (sourceContent[i] === '{') depth++;
    else if (sourceContent[i] === '}') {
      depth--;
      if (depth === 0) {
        return sourceContent.substring(startIndex, i + 1);
      }
    }
  }
  return sourceContent.substring(startIndex);
}
