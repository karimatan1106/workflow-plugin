/**
 * subagentTemplate 検証テスト (definitions.ts)
 *
 * FR-6（testingフェーズ）、FR-7（test_implフェーズ）、FR-8（docs_updateフェーズ）の
 * subagentTemplate に追記された内容が正しく含まれているかを検証する。
 *
 * TDD Redフェーズで作成するため、implementationフェーズでの追記完了前は失敗する。
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePhaseGuide,
  PHASE_GUIDES,
} from '../definitions.js';

// ============================================================================
// FR-6: testingフェーズのsubagentTemplate検証
// ============================================================================

describe('FR-6: testingフェーズのsubagentTemplate検証', () => {
  const phaseGuide = resolvePhaseGuide('testing', 'docs/workflows/test');
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-6-1: testingフェーズのsubagentTemplateにworkflow_capture_baselineが含まれること', () => {
    expect(template).toContain('workflow_capture_baseline');
  });

  it('TC-6-2: testingフェーズのsubagentTemplateにtotalTestsパラメータが含まれること', () => {
    expect(template).toContain('totalTests');
  });

  it('TC-6-3: testingフェーズのsubagentTemplateにpassedTestsパラメータが含まれること', () => {
    expect(template).toContain('passedTests');
  });

  it('TC-6-4: testingフェーズのsubagentTemplateにfailedTestsパラメータが含まれること', () => {
    expect(template).toContain('failedTests');
  });

  it('TC-6-5: testingフェーズのsubagentTemplateにregression_testが含まれること', () => {
    expect(template).toContain('regression_test');
  });

  it('TC-6-6: testingフェーズのsubagentTemplateに既存のworkflow_record_test_resultが保持されていること（リグレッション防止）', () => {
    expect(template).toContain('workflow_record_test_result');
  });

  it('TC-R-1: testingフェーズのphaseNameが"testing"のままであること（リグレッション防止）', () => {
    expect(phaseGuide?.phaseName).toBe('testing');
  });
});

// ============================================================================
// FR-7: test_implフェーズのsubagentTemplate検証
// ============================================================================

describe('FR-7: test_implフェーズのsubagentTemplate検証', () => {
  const phaseGuide = resolvePhaseGuide('test_impl', 'docs/workflows/test');
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-7-1: test_implフェーズのsubagentTemplateに__tests__ディレクトリの記述が含まれること', () => {
    expect(template).toContain('__tests__');
  });

  it('TC-7-2: test_implフェーズのsubagentTemplateにworkflow_record_testの呼び出し手順が含まれること', () => {
    expect(template).toContain('workflow_record_test');
  });

  it('TC-7-3: test_implフェーズのsubagentTemplateにtestFileパラメータの説明が含まれること', () => {
    expect(template).toContain('testFile');
  });

  it('TC-7-4: test_implフェーズのsubagentTemplateに既存のTDD Red指示が保持されていること（リグレッション防止）', () => {
    expect(template).toContain('TDD Red');
  });

  it('TC-7-5: test_implフェーズのsubagentTemplateにsrc/phases/__tests__の具体例が含まれること', () => {
    expect(template).toContain('src/phases/__tests__');
  });

  it('TC-R-2: test_implフェーズのphaseNameが"test_impl"のままであること（リグレッション防止）', () => {
    expect(phaseGuide?.phaseName).toBe('test_impl');
  });
});

// ============================================================================
// FR-8: docs_updateフェーズのsubagentTemplate検証
// ============================================================================

describe('FR-8: docs_updateフェーズのsubagentTemplate検証', () => {
  const phaseGuide = resolvePhaseGuide('docs_update', 'docs/workflows/test');
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-8-1: docs_updateフェーズのsubagentTemplateにMEMORY.mdの禁止記述が含まれること', () => {
    expect(template).toContain('MEMORY.md');
  });

  it('TC-8-2: docs_updateフェーズのsubagentTemplateに.claude/state/の禁止記述が含まれること', () => {
    expect(template).toContain('.claude/state/');
  });

  it('TC-8-3: docs_updateフェーズのsubagentTemplateにdocs/spec/の更新許可記述が含まれること', () => {
    expect(template).toContain('docs/spec/');
  });

  it('TC-8-4: docs_updateフェーズのsubagentTemplateにdocs/workflows/の禁止記述が含まれること', () => {
    expect(template).toContain('docs/workflows/');
  });

  it('TC-8-5: docs_updateフェーズのsubagentTemplateに既存のドキュメント更新指示が保持されていること（リグレッション防止）', () => {
    expect(template).toContain('ドキュメントを更新してください');
  });

  it('TC-8-6: docs_updateフェーズのsubagentTemplateに永続ドキュメントに関する記述が含まれること', () => {
    expect(template).toContain('永続');
  });

  it('TC-R-3: docs_updateフェーズのphaseNameが"docs_update"のままであること（リグレッション防止）', () => {
    expect(phaseGuide?.phaseName).toBe('docs_update');
  });
});

// ============================================================================
// FR-9: performance_testフェーズのsubagentTemplateに総合評価セクションのガイダンスを追加
// ============================================================================

describe('FR-9: performance_testフェーズのsubagentTemplateに総合評価セクションのガイダンスを追加', () => {
  const parentPhaseGuide = resolvePhaseGuide('parallel_verification', 'docs/workflows/test');
  const phaseGuide = parentPhaseGuide?.subPhases?.performance_test;
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-9-1: performance_testフェーズのsubagentTemplateに総合評価への言及が含まれる', () => {
    expect(template).toContain('総合評価');
  });

  it('TC-9-2: performance_testフェーズのsubagentTemplateに5行以上の実質行要件への言及が含まれる', () => {
    expect(template).toContain('5行以上');
  });

  it('TC-9-3: performance_testフェーズのsubagentTemplateに総合評価の観点説明が含まれる', () => {
    expect(template).toContain('全体的なパフォーマンス達成状況');
  });
});

// ============================================================================
// FR-10: performance_testフェーズのsubagentTemplateにテスト実行証拠セクションのガイダンスを追加
// ============================================================================

describe('FR-10: performance_testフェーズのsubagentTemplateにテスト実行証拠セクションのガイダンスを追加', () => {
  const parentPhaseGuide = resolvePhaseGuide('parallel_verification', 'docs/workflows/test');
  const phaseGuide = parentPhaseGuide?.subPhases?.performance_test;
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-10-1: performance_testフェーズのsubagentTemplateにテスト実行証拠への言及が含まれる', () => {
    expect(template).toContain('テスト実行証拠');
  });

  it('TC-10-2: performance_testフェーズのsubagentTemplateにテスト実行証拠が任意セクションであることが明記されている', () => {
    expect(template).toContain('任意');
  });
});

// ============================================================================
// FR-11: manual_testフェーズのsubagentTemplateに総合評価セクションのガイダンスを追加
// ============================================================================

describe('FR-11: manual_testフェーズのsubagentTemplateに総合評価セクションのガイダンスを追加', () => {
  const parentPhaseGuide = resolvePhaseGuide('parallel_verification', 'docs/workflows/test');
  const phaseGuide = parentPhaseGuide?.subPhases?.manual_test;
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-11-1: manual_testのsubagentTemplateに総合評価への言及が含まれる', () => {
    expect(template).toContain('総合評価');
  });

  it('TC-11-2: manual_testのsubagentTemplateに全テストシナリオへの言及が含まれる', () => {
    expect(template).toContain('全テストシナリオ');
  });
});

// ============================================================================
// FR-12: security_scanフェーズのsubagentTemplateに行数確保ガイダンスを追加
// ============================================================================

describe('FR-12: security_scanフェーズのsubagentTemplateに行数確保ガイダンスを追加', () => {
  const parentPhaseGuide = resolvePhaseGuide('parallel_verification', 'docs/workflows/test');
  const phaseGuide = parentPhaseGuide?.subPhases?.security_scan;
  const template = phaseGuide?.subagentTemplate ?? '';

  it('TC-12-1: security_scanのsubagentTemplateにminLines数値への言及が含まれる', () => {
    expect(template).toContain('20行');
  });
});
