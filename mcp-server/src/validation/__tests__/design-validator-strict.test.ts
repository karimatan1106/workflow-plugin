import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DesignValidator } from '../design-validator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DesignValidator - 設計書未作成時のブロック', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-validator-strict-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('TC-3-1: workflowDir 不存在 → passed: false', () => {
    // Arrange
    const nonExistentPath = '/nonexistent/path/to/workflow';
    const validator = new DesignValidator(nonExistentPath, tempDir);

    // Act
    const result = validator.validateAll();

    // Assert
    expect(result.passed).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.objectContaining({
        type: 'file',
        source: 'workflow',
        name: 'workflowDir',
      })
    );
    expect(result.summary.total).toBe(1);
    expect(result.summary.missing).toBe(1);
  });

  test('TC-3-2: 3つの設計書が全欠落 → passed: false', () => {
    // Arrange
    // tempDir は存在するが、設計書ファイルは作成しない
    const validator = new DesignValidator(tempDir, tempDir);

    // Act
    const result = validator.validateAll();

    // Assert
    expect(result.passed).toBe(false);
    expect(result.missingItems.length).toBe(3);

    // 3つの設計書が全て欠落として検出される
    const missingNames = result.missingItems.map(item => item.name);
    expect(missingNames).toContain('spec.md');
    expect(missingNames).toContain('state-machine.mmd');
    expect(missingNames).toContain('flowchart.mmd');

    expect(result.summary.total).toBe(3);
    expect(result.summary.missing).toBe(3);
  });

  test('TC-3-3: spec.md のみ存在 → 部分検証実行（warningsが2件）', () => {
    // Arrange
    const specPath = path.join(tempDir, 'spec.md');
    fs.writeFileSync(specPath, `# 仕様書

## クラス
- UserService

## ファイルパス
- src/services/user-service.ts
`);

    const validator = new DesignValidator(tempDir, tempDir);

    // Act
    const result = validator.validateAll();

    // Assert
    // 設計書が部分的に存在するので検証は実行される
    expect(result.warnings).toContain('state-machine.mmd が見つかりません');
    expect(result.warnings).toContain('flowchart.mmd が見つかりません');

    // 「設計書がありません - 検証をスキップ」の警告は含まれない
    const hasSkipWarning = result.warnings.some(w =>
      w.includes('設計書がありません') || w.includes('検証をスキップ')
    );
    expect(hasSkipWarning).toBe(false);
  });

  test('TC-3-4: 既存テスト互換性確認（全設計書存在 → 通常検証実行）', () => {
    // Arrange
    const specPath = path.join(tempDir, 'spec.md');
    const stateMachinePath = path.join(tempDir, 'state-machine.mmd');
    const flowchartPath = path.join(tempDir, 'flowchart.mmd');

    fs.writeFileSync(specPath, `# 仕様書

## クラス
- UserService

## ファイルパス
- src/services/user-service.ts
`);

    fs.writeFileSync(stateMachinePath, `stateDiagram-v2
[*] --> Idle
Idle --> Active
Active --> Idle
Active --> [*]
`);

    fs.writeFileSync(flowchartPath, `flowchart TD
A[Start] --> B[Process]
B --> C[End]
`);

    const validator = new DesignValidator(tempDir, tempDir);

    // Act
    const result = validator.validateAll();

    // Assert
    // 結果が返される（passed の値は実装状況による）
    expect(result).toBeDefined();
    expect(result.phase).toBe('validation');
    expect(result.timestamp).toBeDefined();

    // 「設計書がありません」の警告は含まれない
    const hasSkipWarning = result.warnings.some(w =>
      w.includes('設計書がありません') || w.includes('検証をスキップ')
    );
    expect(hasSkipWarning).toBe(false);
  });

  test('TC-3-5: 2つ欠落（flowchart.mmdのみ存在）→ spec.md, state-machine.mmd の警告が出ること', () => {
    // Arrange
    const flowchartPath = path.join(tempDir, 'flowchart.mmd');
    fs.writeFileSync(flowchartPath, `flowchart TD
A[Start] --> B[Process]
B --> C[End]
`);

    const validator = new DesignValidator(tempDir, tempDir);

    // Act
    const result = validator.validateAll();

    // Assert
    expect(result.warnings).toContain('spec.md が見つかりません');
    expect(result.warnings).toContain('state-machine.mmd が見つかりません');

    // flowchart.mmd は存在するので警告に含まれない
    const hasFlowchartWarning = result.warnings.some(w =>
      w.includes('flowchart.mmd が見つかりません')
    );
    expect(hasFlowchartWarning).toBe(false);
  });
});
