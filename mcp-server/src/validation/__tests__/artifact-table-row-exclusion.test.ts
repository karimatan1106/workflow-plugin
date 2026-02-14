/**
 * Artifact Validator - Table Row Exclusion Tests
 * @spec C:\ツール\Workflow\docs\workflows\artifact-validatorテ-ブル行除外\test-design.md
 * @spec C:\ツール\Workflow\docs\workflows\artifact-validatorテ-ブル行除外\spec.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isStructuralLine, validateArtifactQuality } from '../artifact-validator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('isStructuralLine() - Table Row Exclusion', () => {
  describe('Table Separators', () => {
    it('should detect 2-column table separator', () => {
      expect(isStructuralLine('|---|---|')).toBe(true);
    });

    it('should detect 3-column table separator', () => {
      expect(isStructuralLine('|---|---|---|')).toBe(true);
    });

    it('should detect 4-column table separator', () => {
      expect(isStructuralLine('|---|---|---|---|')).toBe(true);
    });

    it('should detect 5-column table separator', () => {
      expect(isStructuralLine('|---|---|---|---|---|')).toBe(true);
    });

    it('should detect table separator with alignment (left)', () => {
      expect(isStructuralLine('|:---|:---|:---|')).toBe(true);
    });

    it('should detect table separator with alignment (right)', () => {
      expect(isStructuralLine('|---:|---:|---:|')).toBe(true);
    });

    it('should detect table separator with alignment (center)', () => {
      expect(isStructuralLine('|:---:|:---:|:---:|')).toBe(true);
    });

    it('should detect table separator with mixed alignment', () => {
      expect(isStructuralLine('|:---|---:|:---:|')).toBe(true);
    });

    it('should detect table separator with leading spaces', () => {
      expect(isStructuralLine('  |---|---|---|')).toBe(true);
    });

    it('should detect table separator with trailing spaces', () => {
      expect(isStructuralLine('|---|---|---|  ')).toBe(true);
    });

    it('should detect table separator with spaces in cells', () => {
      expect(isStructuralLine('| --- | --- | --- |')).toBe(true);
    });

    it('should detect table separator with longer dashes', () => {
      expect(isStructuralLine('|-----|-----|-----|')).toBe(true);
    });
  });

  describe('Table Data Rows', () => {
    it('should detect table header row (2 columns)', () => {
      expect(isStructuralLine('| Header1 | Header2 |')).toBe(true);
    });

    it('should detect table header row (3 columns)', () => {
      expect(isStructuralLine('| Name | Type | Description |')).toBe(true);
    });

    it('should detect table data row', () => {
      expect(isStructuralLine('| value1 | value2 | value3 |')).toBe(true);
    });

    it('should detect table row with empty cell', () => {
      expect(isStructuralLine('| data | | more data |')).toBe(true);
    });

    it('should detect table row with numbers', () => {
      expect(isStructuralLine('| 1 | 2 | 3 |')).toBe(true);
    });

    it('should detect table row with special characters', () => {
      expect(isStructuralLine('| `code` | **bold** | *italic* |')).toBe(true);
    });

    it('should detect table row with Japanese text', () => {
      expect(isStructuralLine('| 名前 | 型 | 説明 |')).toBe(true);
    });

    it('should detect table row with leading spaces', () => {
      expect(isStructuralLine('  | col1 | col2 | col3 |')).toBe(true);
    });

    it('should detect table row with trailing spaces', () => {
      expect(isStructuralLine('| col1 | col2 | col3 |  ')).toBe(true);
    });

    it('should detect table row with complex content', () => {
      expect(isStructuralLine('| [Link](url) | `code snippet` | 日本語 123 |')).toBe(true);
    });
  });

  describe('Non-matching Cases', () => {
    it('should detect single column table separator as structural', () => {
      // |---| matches the separator regex (opening pipe + hyphens + closing pipe)
      // This is consistent with both old and new regex behavior
      expect(isStructuralLine('|---|')).toBe(true);
    });

    it('should NOT detect single column table (data)', () => {
      expect(isStructuralLine('| data |')).toBe(false);
    });

    it('should NOT detect line without pipes', () => {
      expect(isStructuralLine('This is plain text')).toBe(false);
    });

    it('should NOT detect line not starting with pipe', () => {
      expect(isStructuralLine('text | pipe | text')).toBe(false);
    });

    it('should NOT detect line with only one pipe', () => {
      expect(isStructuralLine('| single pipe')).toBe(false);
    });

    it('should NOT detect empty line', () => {
      expect(isStructuralLine('')).toBe(false);
    });

    it('should NOT detect whitespace-only line', () => {
      expect(isStructuralLine('   ')).toBe(false);
    });
  });

  describe('Backward Compatibility', () => {
    it('should detect headers (unchanged)', () => {
      expect(isStructuralLine('# Header 1')).toBe(true);
      expect(isStructuralLine('## Header 2')).toBe(true);
      expect(isStructuralLine('### Header 3')).toBe(true);
    });

    it('should detect horizontal rules (unchanged)', () => {
      expect(isStructuralLine('---')).toBe(true);
      expect(isStructuralLine('***')).toBe(true);
      expect(isStructuralLine('___')).toBe(true);
    });

    it('should detect code fence markers (unchanged)', () => {
      expect(isStructuralLine('```')).toBe(true);
      expect(isStructuralLine('```javascript')).toBe(true);
      expect(isStructuralLine('```typescript')).toBe(true);
    });

    it('should detect bold labels (unchanged)', () => {
      expect(isStructuralLine('**Label:**')).toBe(true);
      expect(isStructuralLine('**Title**')).toBe(true);
      expect(isStructuralLine('- **Item:**')).toBe(true);
    });
  });
});

describe('validateArtifactQuality() - Integration Tests', () => {
  let tmpDir: string;
  const defaultReqs = { minLines: 5, requiredSections: [] };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-validator-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Table Separator Repetition (No Duplicate Detection)', () => {
    it('should NOT detect duplicate for repeated 3-column table separators', () => {
      const content = [
        '# Test Document',
        '## Section 1',
        'First section has a table with three columns for data display.',
        '| Column1 | Column2 | Column3 |',
        '|---------|---------|---------|',
        '| Data1   | Data2   | Data3   |',
        '## Section 2',
        'Second section also contains a similar structured table.',
        '| Column1 | Column2 | Column3 |',
        '|---------|---------|---------|',
        '| Data4   | Data5   | Data6   |',
        '## Section 3',
        'Third section completes the series with another table.',
        '| Column1 | Column2 | Column3 |',
        '|---------|---------|---------|',
        '| Data7   | Data8   | Data9   |',
      ].join('\n');
      const filePath = path.join(tmpDir, 'table-separator-repeat.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      // After implementation, table separators and data rows should not cause duplicate errors
      expect(result.passed).toBe(true);
    });

    it('should NOT detect duplicate for multiple tables with same structure', () => {
      const content = [
        '# API Documentation',
        '## Endpoint 1',
        'The first endpoint handles user name retrieval.',
        '| Parameter | Type | Description |',
        '|-----------|------|-------------|',
        '| name      | string | User name |',
        '## Endpoint 2',
        'The second endpoint handles user email management.',
        '| Parameter | Type | Description |',
        '|-----------|------|-------------|',
        '| email     | string | Email address |',
        '## Endpoint 3',
        'The third endpoint handles user age information.',
        '| Parameter | Type | Description |',
        '|-----------|------|-------------|',
        '| age       | number | User age |',
      ].join('\n');
      const filePath = path.join(tmpDir, 'multiple-tables.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      expect(result.passed).toBe(true);
    });
  });

  describe('Table Header Repetition (No Duplicate Detection)', () => {
    it('should NOT detect duplicate for repeated table headers', () => {
      const content = [
        '# Configuration',
        '## Section 1',
        'Configuration options for the first module.',
        '| Name | Value |',
        '|------|-------|',
        '| opt1 | val1  |',
        '## Section 2',
        'Configuration options for the second module.',
        '| Name | Value |',
        '|------|-------|',
        '| opt2 | val2  |',
        '## Section 3',
        'Configuration options for the third module.',
        '| Name | Value |',
        '|------|-------|',
        '| opt3 | val3  |',
      ].join('\n');
      const filePath = path.join(tmpDir, 'table-header-repeat.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      expect(result.passed).toBe(true);
    });
  });

  describe('Duplicate Detection Preservation (Outside Tables)', () => {
    it('should detect duplicate non-table lines', () => {
      const content = [
        '# Test',
        '## Section',
        'This is a duplicate line.',
        'Some other text here.',
        'This is a duplicate line.',
        'More content here.',
        'This is a duplicate line.',
        'Final text for the section.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'duplicate-text.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('重複') || e.includes('ダミー'))).toBe(true);
    });

    it('should NOT detect duplicates when all repetition is in tables', () => {
      const content = [
        '# Clean Document',
        '## Table Section A',
        'This section demonstrates table usage with unique text A.',
        '| Name | Type |',
        '|------|------|',
        '| A    | 1    |',
        '## Table Section B',
        'This section demonstrates table usage with unique text B.',
        '| Name | Type |',
        '|------|------|',
        '| B    | 2    |',
        '## Table Section C',
        'This section demonstrates table usage with unique text C.',
        '| Name | Type |',
        '|------|------|',
        '| C    | 3    |',
      ].join('\n');
      const filePath = path.join(tmpDir, 'clean-with-tables.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      expect(result.passed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle 2-column table with repeated separators', () => {
      const content = [
        '# Document',
        '## Table',
        'A document with two-column table repeated separators.',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '| 3 | 4 |',
        '| 5 | 6 |',
        'End of the table section.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'single-pipe-sep.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      expect(result.passed).toBe(true);
    });

    it('should handle mixed tables and duplicate text (detect only text duplicates)', () => {
      const content = [
        '# Mixed Content',
        '## Section A',
        'Unique opening paragraph for the first section.',
        '| Table | Header |',
        '|-------|--------|',
        '| Data  | Value  |',
        '## Section B',
        'Repeated sentence appears here.',
        '| Table | Header |',
        '|-------|--------|',
        '| More  | Data   |',
        '## Section C',
        'Repeated sentence appears here.',
        '| Table | Header |',
        '|-------|--------|',
        '| Last  | Row    |',
        '## Section D',
        'Repeated sentence appears here.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'mixed-content.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validateArtifactQuality(filePath, defaultReqs);
      // "Repeated sentence appears here." appears 3 times -> duplicate detection
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('重複') || e.includes('ダミー'))).toBe(true);
    });
  });
});
