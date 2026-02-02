/**
 * ワークフロー統合E2Eテスト
 * @spec docs/workflows/設計-実装整合性の自動検証機能/e2e-test.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DesignValidator } from '../../src/validation/design-validator.js';

describe('E2E: ワークフロー全体の統合テスト', () => {
  let tempDir: string;

  beforeEach(() => {
    // 一時ディレクトリを作成
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-test-'));
  });

  afterEach(() => {
    // 一時ディレクトリをクリーンアップ
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('E2E-1: test_impl → implementation 遷移時の検証', () => {
    it('設計書が存在する場合に検証が成功する', () => {
      // ワークフローディレクトリを作成
      const workflowDir = path.join(tempDir, 'docs/workflows/test-feature');
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(workflowDir, { recursive: true });
      fs.mkdirSync(srcDir, { recursive: true });

      // 設計書ファイルを作成
      fs.writeFileSync(
        path.join(workflowDir, 'spec.md'),
        `# テスト機能仕様書\n\n## ファイル: src/utils/test-util.ts\n\n\`\`\`typescript\nclass TestUtil {\n  execute(): string {}\n}\n\`\`\``
      );

      fs.writeFileSync(
        path.join(workflowDir, 'state-machine.mmd'),
        `stateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing: execute()\n    Processing --> Complete\n    Complete --> [*]`
      );

      fs.writeFileSync(
        path.join(workflowDir, 'flowchart.mmd'),
        `flowchart TD\n    A[Start] --> B{Check}\n    B -->|Ok| C[Process]\n    C --> D[End]`
      );

      // 実装ファイルを作成
      fs.mkdirSync(path.join(srcDir, 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'utils/test-util.ts'),
        `class TestUtil {\n  execute(): string { return 'result'; }\n}\nexport { TestUtil };`
      );

      // 検証を実行
      const validator = new DesignValidator(workflowDir, tempDir);
      const result = validator.validateAll();

      // 検証結果を確認
      expect(result.passed).toBe(true);
      expect(result.missingItems.length).toBe(0);
    });

    it('実装ファイルが欠落した場合にエラーが返る', () => {
      // ワークフローディレクトリを作成
      const workflowDir = path.join(tempDir, 'docs/workflows/test-feature');
      fs.mkdirSync(workflowDir, { recursive: true });

      // 設計書だけを作成（実装ファイルなし）
      fs.writeFileSync(
        path.join(workflowDir, 'spec.md'),
        `# テスト機能仕様書\n\n## ファイル: src/missing/missing-file.ts\n\n\`\`\`typescript\nclass MissingClass {}\n\`\`\``
      );

      fs.writeFileSync(
        path.join(workflowDir, 'state-machine.mmd'),
        `stateDiagram-v2\n    [*] --> S\n    S --> [*]`
      );

      fs.writeFileSync(
        path.join(workflowDir, 'flowchart.mmd'),
        `flowchart TD\n    A[S] --> B[E]`
      );

      // 検証を実行
      const validator = new DesignValidator(workflowDir, tempDir);
      const result = validator.validateAll();

      // 検証結果を確認
      expect(result.passed).toBe(false);
      expect(result.missingItems.length).toBeGreaterThan(0);
    });
  });

  describe('E2E-2: refactoring → parallel_quality 遷移時の検証', () => {
    it('リファクタリング後の設計整合性が検証される', () => {
      // ワークフローディレクトリを作成
      const workflowDir = path.join(tempDir, 'docs/workflows/refactoring-task');
      const srcDir = path.join(tempDir, 'src/core');
      fs.mkdirSync(workflowDir, { recursive: true });
      fs.mkdirSync(srcDir, { recursive: true });

      // 設計書を作成
      fs.writeFileSync(
        path.join(workflowDir, 'spec.md'),
        `# リファクタリング仕様\n\n## ファイル: src/core/service.ts\n\n\`\`\`typescript\nclass Service {\n  process(data: object): object {}\n}\n\`\`\``
      );

      fs.writeFileSync(
        path.join(workflowDir, 'state-machine.mmd'),
        `stateDiagram-v2\n    [*] --> Ready\n    Ready --> Processing\n    Processing --> Done\n    Done --> [*]`
      );

      fs.writeFileSync(
        path.join(workflowDir, 'flowchart.mmd'),
        `flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]`
      );

      // 実装ファイルを作成
      fs.writeFileSync(
        path.join(srcDir, 'service.ts'),
        `class Service {\n  process(data: object): object { return data; }\n}\nexport { Service };`
      );

      // 検証を実行
      const validator = new DesignValidator(workflowDir, tempDir);
      const result = validator.validateAll();

      // 検証結果を確認
      expect(result.passed).toBe(true);
    });
  });

  describe('E2E-3: 設計書なしのワークフロー', () => {
    it('設計書がない場合はスキップされる', () => {
      // ワークフローディレクトリを作成（設計書なし）
      const workflowDir = path.join(tempDir, 'docs/workflows/legacy-task');
      fs.mkdirSync(workflowDir, { recursive: true });

      // 検証を実行
      const validator = new DesignValidator(workflowDir, tempDir);
      const result = validator.validateAll();

      // 検証結果を確認（スキップは成功扱い）
      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('E2E-4: MCPツール統合', () => {
    it('ワークフロー全フェーズを通じた検証機能', () => {
      const workflowDir = path.join(tempDir, 'docs/workflows/full-cycle');
      const srcDir = path.join(tempDir, 'src/features/auth');

      fs.mkdirSync(workflowDir, { recursive: true });
      fs.mkdirSync(srcDir, { recursive: true });

      // 設計書を作成
      fs.writeFileSync(
        path.join(workflowDir, 'spec.md'),
        `# 認証機能\n\n## ファイル: src/features/auth/authenticator.ts\n\n\`\`\`typescript\nclass Authenticator {\n  authenticate(creds: any): any {}\n}\n\`\`\``
      );

      fs.writeFileSync(
        path.join(workflowDir, 'state-machine.mmd'),
        `stateDiagram-v2\n    [*] --> Idle\n    Idle --> Auth\n    Auth --> Done\n    Done --> [*]`
      );

      fs.writeFileSync(
        path.join(workflowDir, 'flowchart.mmd'),
        `flowchart TD\n    A[S] --> B[P]\n    B --> C[E]`
      );

      // 実装を作成
      fs.writeFileSync(
        path.join(srcDir, 'authenticator.ts'),
        `class Authenticator { authenticate(creds: any) { return {}; } }\nexport { Authenticator };`
      );

      // 検証を実行
      const validator = new DesignValidator(workflowDir, tempDir);
      const result = validator.validateAll();

      expect(result.passed).toBe(true);
      expect(result.phase).toBe('validation');
      expect(result.timestamp).toBeDefined();
    });
  });
});
