# Test Implementation フェーズ (TDD Red)

## subagent実行

このフェーズは**subagentとして実行**される。

---

## 目的

テスト設計に基づいてテストコードを作成する（TDD Red フェーズ）。

**重要**: このフェーズではテストは失敗することが期待される。

## 入力

- タスクディレクトリ: `{workflowDir}`
- テスト設計: `test-cases.md`
- 仕様書: `docs/specs/domains/{domain}/{name}.md`

## 実行手順

1. **テストファイルの作成**
   - テスト対象ファイルに対応するテストファイルを作成
   - 命名規則: `*.test.ts` または `*.spec.ts`

2. **テストケースの実装**
   - test-cases.md の各テストケースを実装
   - describe/it 構造で整理

3. **モックの設定**
   - 外部依存のモック
   - スパイの設定

4. **テスト実行（失敗確認）**
   - テストが失敗することを確認
   - 「Red」状態を確認

## TDD サイクル

```
┌─────────────────┐
│   test_impl     │ ← 現在のフェーズ（Red）
│   テスト作成    │
│   （失敗）      │
└────────┬────────┘
         ↓
┌─────────────────┐
│ implementation  │ ← 次のフェーズ（Green）
│   実装          │
│   （成功）      │
└────────┬────────┘
         ↓
┌─────────────────┐
│  refactoring    │ ← その次（Refactor）
│   リファクタ    │
│   （テスト維持）│
└─────────────────┘
```

## テストコードテンプレート

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TargetClass } from '../TargetClass';

describe('TargetClass', () => {
  let instance: TargetClass;

  beforeEach(() => {
    instance = new TargetClass();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('methodName', () => {
    it('TC-001: 正常系 - [説明]', () => {
      // Arrange
      const input = { param1: 'value' };

      // Act
      const result = instance.methodName(input);

      // Assert
      expect(result).toEqual({ expected: 'value' });
    });

    it('TC-002: 異常系 - 不正入力でエラー', () => {
      // Arrange
      const invalidInput = null;

      // Act & Assert
      expect(() => instance.methodName(invalidInput)).toThrow('Expected error message');
    });

    it('TC-003: 境界値 - 最小値', () => {
      // Arrange
      const input = { value: 0 };

      // Act
      const result = instance.methodName(input);

      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

## 出力ファイル

- `tests/**/*.test.ts` - テストファイル

## log.md への記録

```markdown
### TEST_IMPL（テスト実装 - TDD Red）

- 作成したテストファイル:
  - `tests/unit/TargetClass.test.ts`
  - `tests/integration/Feature.test.ts`
- テストケース数: X件
- 状態: Red（全テスト失敗）
```

## 禁止事項

- **ソースコードの編集**（テストのみ）
- テストを通すための実装

## 完了条件

- [ ] test-cases.md の全ケースを実装した
- [ ] テストが失敗することを確認した（Red）
- [ ] モックが適切に設定されている
- [ ] log.md に記録した
