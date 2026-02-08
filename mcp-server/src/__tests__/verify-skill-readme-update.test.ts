import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SKILL_MD_PATH = path.resolve(__dirname, '../../../../.claude/skills/workflow/SKILL.md');
const README_MD_PATH = path.resolve(__dirname, '../../../../.claude/workflow-phases/README.md');

describe('SKILL.md update verification', () => {
  test('TC-1: フェーズ構成が19フェーズに更新されている', () => {
    const content = fs.readFileSync(SKILL_MD_PATH, 'utf-8');
    expect(content).toContain('フェーズ構成（19フェーズ）');
    expect(content).toContain('regression_test');
    expect(content).not.toContain('フェーズ構成（18フェーズ）');
  });

  test('TC-2: Orchestratorパターンセクションが存在する', () => {
    const content = fs.readFileSync(SKILL_MD_PATH, 'utf-8');
    expect(content).toContain('Orchestratorパターン');
    expect(content).toContain('subagent委譲の強制ルール');
  });

  test('TC-3: フェーズ別subagent設定テーブルが存在する', () => {
    const content = fs.readFileSync(SKILL_MD_PATH, 'utf-8');
    expect(content).toContain('フェーズ別subagent設定');
    expect(content).toContain('regression_test');
    expect(content).toContain('general-purpose');
  });

  test('TC-4: subagent起動テンプレートが存在する', () => {
    const content = fs.readFileSync(SKILL_MD_PATH, 'utf-8');
    expect(content).toContain('subagent起動テンプレート');
    expect(content).toContain('サマリーセクション必須化');
  });

  test('TC-5: 禁止行為に直接実行禁止が追加されている', () => {
    const content = fs.readFileSync(SKILL_MD_PATH, 'utf-8');
    expect(content).toContain('subagent委譲が必要なフェーズをメインClaudeが直接実行する');
  });
});

describe('README.md update verification', () => {
  test('TC-6: フェーズ一覧が19フェーズである', () => {
    const content = fs.readFileSync(README_MD_PATH, 'utf-8');
    expect(content).toContain('19フェーズ');
    expect(content).not.toContain('architecture_review');
    expect(content).toContain('regression_test');
  });

  test('TC-7: フェーズ順序にregression_testが含まれる', () => {
    const content = fs.readFileSync(README_MD_PATH, 'utf-8');
    const testingIdx = content.indexOf('testing');
    const regressionIdx = content.indexOf('regression_test');
    expect(regressionIdx).toBeGreaterThan(testingIdx);
  });
});
