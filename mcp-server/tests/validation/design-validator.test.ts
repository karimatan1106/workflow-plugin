/**
 * DesignValidator ユニットテスト
 * @spec docs/workflows/設計-実装整合性の自動検証機能/test-design.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesignValidator } from '../../src/validation/design-validator.js';
import * as fs from 'fs';

// fsモジュールをモック
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

describe('DesignValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UT-5.1: 全項目実装済み', () => {
    it('全ファイル存在時にpassedがtrueになる', () => {
      // モック設定: 全ファイルが存在
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('spec.md')) {
          return `
**ファイル**: \`src/validation/design-validator.ts\`

class DesignValidator {
  validateAll(): ValidationResult {}
}
`;
        }
        if (path.includes('state-machine.mmd')) {
          return `
stateDiagram-v2
    [*] --> Idle
    Idle --> [*]
`;
        }
        if (path.includes('flowchart.mmd')) {
          return `
flowchart TD
    A[Start] --> B[End]
`;
        }
        // 実装ファイルの内容（class検索用）
        if (path.includes('design-validator.ts')) {
          return 'class DesignValidator { validateAll() {} }';
        }
        return '';
      });

      const validator = new DesignValidator('/mock/workflow/dir');
      const result = validator.validateAll();

      expect(result.passed).toBe(true);
    });
  });

  describe('UT-5.2: 一部未実装', () => {
    it('ファイル欠損時にpassedがfalseになる', () => {
      // モック設定: workflowDir, spec.md, mmd は存在するが、実装ファイルが存在しない
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const p = String(path);
        if (p === '/mock/workflow/dir') return true; // workflowDir
        if (p.includes('spec.md')) return true;
        if (p.includes('state-machine.mmd')) return true;
        if (p.includes('flowchart.mmd')) return true;
        return false; // 実装ファイルなし
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('spec.md')) {
          return `
**ファイル**: \`src/validation/design-validator.ts\`

class DesignValidator {}
`;
        }
        if (path.includes('state-machine.mmd')) {
          return `stateDiagram-v2\n    [*] --> Idle\n    Idle --> [*]`;
        }
        if (path.includes('flowchart.mmd')) {
          return `flowchart TD\n    A[Start]`;
        }
        return '';
      });

      const validator = new DesignValidator('/mock/workflow/dir');
      const result = validator.validateAll();

      expect(result.passed).toBe(false);
      expect(result.missingItems.length).toBeGreaterThan(0);
    });
  });

  describe('UT-5.3: 設計書なし', () => {
    it('設計書が存在しない場合にpassedがfalseになる（REQ-3: 厳格モード）', () => {
      // モック設定: workflowDirは存在するが設計書ファイルが全て存在しない
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const p = String(path);
        if (p === '/mock/workflow/dir') return true; // workflowDir
        return false; // 設計書なし
      });

      const validator = new DesignValidator('/mock/workflow/dir');
      const result = validator.validateAll();

      // REQ-3: 設計書が全てない場合はブロック（passed: false）
      expect(result.passed).toBe(false);
      expect(result.missingItems.length).toBeGreaterThan(0);
    });

    it('workflowDirが存在しない場合もpassedがfalseになる（REQ-3: 厳格モード）', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const validator = new DesignValidator('/nonexistent/dir');
      const result = validator.validateAll();

      // REQ-3: workflowDirが存在しない場合もブロック（passed: false）
      expect(result.passed).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
