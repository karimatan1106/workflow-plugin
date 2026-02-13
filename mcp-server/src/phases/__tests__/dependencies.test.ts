/**
 * SUB_PHASE_DEPENDENCIES 定義のテスト
 *
 * REQ-6: 並列フェーズ依存関係
 * - SUB_PHASE_DEPENDENCIESの定義テスト
 * - 依存関係チェック関数のテスト
 *
 * @spec docs/workflows/ワ-クフロ-大規模対応改善/test-design.md
 */

import { describe, test, expect } from 'vitest';
import { SUB_PHASE_DEPENDENCIES, PARALLEL_GROUPS } from '../definitions.js';
import type { SubPhaseName } from '../../state/types.js';

describe('SUB_PHASE_DEPENDENCIES', () => {
  // 定義の存在確認
  test('should be defined', () => {
    expect(SUB_PHASE_DEPENDENCIES).toBeDefined();
  });

  // parallel_design の依存関係
  test('should have correct dependencies for parallel_design', () => {
    const deps = SUB_PHASE_DEPENDENCIES.parallel_design;

    expect(deps).toBeDefined();
    expect(deps.state_machine).toEqual([]);
    expect(deps.flowchart).toEqual(['state_machine']);
    expect(deps.ui_design).toEqual(['state_machine', 'flowchart']);
  });

  // parallel_analysis の依存関係（REQ-B3: planningはthreat_modelingに依存）
  test('should have correct dependencies for parallel_analysis', () => {
    const deps = SUB_PHASE_DEPENDENCIES.parallel_analysis;

    expect(deps).toBeDefined();
    expect(deps.threat_modeling).toEqual([]);
    expect(deps.planning).toEqual(['threat_modeling']);
  });

  // parallel_quality の依存関係（依存なし）
  test('should have no dependencies for parallel_quality', () => {
    const deps = SUB_PHASE_DEPENDENCIES.parallel_quality;

    expect(deps).toBeDefined();
    expect(deps.build_check).toEqual([]);
    expect(deps.code_review).toEqual([]);
  });

  // parallel_verification の依存関係（依存なし）
  test('should have no dependencies for parallel_verification', () => {
    const deps = SUB_PHASE_DEPENDENCIES.parallel_verification;

    expect(deps).toBeDefined();
    expect(deps.manual_test).toEqual([]);
    expect(deps.security_scan).toEqual([]);
    expect(deps.performance_test).toEqual([]);
    expect(deps.e2e_test).toEqual([]);
  });

  // 全並列フェーズがカバーされているか
  test('should cover all parallel phases', () => {
    const parallelPhases = Object.keys(PARALLEL_GROUPS);
    const dependencyPhases = Object.keys(SUB_PHASE_DEPENDENCIES);

    for (const phase of parallelPhases) {
      expect(dependencyPhases).toContain(phase);
    }
  });

  // 全サブフェーズが依存関係定義に含まれているか
  test('should have dependency definition for all subphases', () => {
    for (const [phase, subPhases] of Object.entries(PARALLEL_GROUPS)) {
      const deps = SUB_PHASE_DEPENDENCIES[phase];
      expect(deps).toBeDefined();

      for (const subPhase of subPhases) {
        expect(deps[subPhase as SubPhaseName]).toBeDefined();
      }
    }
  });
});

describe('Dependency validation helper', () => {
  /**
   * 依存関係チェックのヘルパー関数（テスト用）
   *
   * 実際の実装はcomplete-sub.tsで行われるが、
   * ここでは依存関係の妥当性をテストする
   */
  function checkDependencies(
    parallelPhase: string,
    subPhase: SubPhaseName,
    completedSubPhases: SubPhaseName[]
  ): { satisfied: boolean; missing: SubPhaseName[] } {
    const deps = SUB_PHASE_DEPENDENCIES[parallelPhase]?.[subPhase] || [];
    const missing = deps.filter(dep => !completedSubPhases.includes(dep));

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  // parallel_design: state_machine完了前にflowchartは完了不可
  test('should require state_machine before flowchart', () => {
    const result = checkDependencies('parallel_design', 'flowchart', []);

    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('state_machine');
  });

  // parallel_design: state_machine完了後はflowchart完了可
  test('should allow flowchart after state_machine', () => {
    const result = checkDependencies('parallel_design', 'flowchart', ['state_machine']);

    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  // parallel_design: ui_designは両方完了が必要
  test('should require both state_machine and flowchart before ui_design', () => {
    // state_machineのみ完了
    let result = checkDependencies('parallel_design', 'ui_design', ['state_machine']);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('flowchart');

    // flowchartのみ完了
    result = checkDependencies('parallel_design', 'ui_design', ['flowchart']);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('state_machine');

    // 両方完了
    result = checkDependencies('parallel_design', 'ui_design', ['state_machine', 'flowchart']);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  // parallel_analysis: REQ-B3 planningはthreat_modeling完了が推奨
  test('should check dependencies for parallel_analysis planning', () => {
    let result = checkDependencies('parallel_analysis', 'threat_modeling', []);
    expect(result.satisfied).toBe(true);

    // planningはthreat_modeling未完了だと依存関係未充足
    result = checkDependencies('parallel_analysis', 'planning', []);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('threat_modeling');

    // threat_modeling完了後は充足
    result = checkDependencies('parallel_analysis', 'planning', ['threat_modeling']);
    expect(result.satisfied).toBe(true);
  });

  // parallel_verification: 全て依存なしで並列完了可能
  test('should allow parallel completion in parallel_verification', () => {
    const subPhases: SubPhaseName[] = ['manual_test', 'security_scan', 'performance_test', 'e2e_test'];

    for (const subPhase of subPhases) {
      const result = checkDependencies('parallel_verification', subPhase, []);
      expect(result.satisfied).toBe(true);
    }
  });
});
