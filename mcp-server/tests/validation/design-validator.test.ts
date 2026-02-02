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

\`\`\`typescript
class DesignValidator {
  validateAll(): ValidationResult {}
}
\`\`\`
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
        return '';
      });

      const validator = new DesignValidator('/mock/workflow/dir');
      const result = validator.validateAll();

      expect(result.passed).toBe(true);
    });
  });

  describe('UT-5.2: 一部未実装', () => {
    it('ファイル欠損時にpassedがfalseになる', () => {
      // モック設定: spec.mdは存在するが、実装ファイルが存在しない
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('spec.md')) return true;
        if (path.includes('state-machine.mmd')) return true;
        if (path.includes('flowchart.mmd')) return true;
        if (path.includes('design-validator.ts')) return false; // 実装ファイルなし
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('spec.md')) {
          return `
**ファイル**: \`src/validation/design-validator.ts\`

\`\`\`typescript
class DesignValidator {}
\`\`\`
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
    it('設計書が存在しない場合にwarningsが設定される', () => {
      // モック設定: 全ファイルが存在しない
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const validator = new DesignValidator('/mock/workflow/dir');
      const result = validator.validateAll();

      expect(result.passed).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
