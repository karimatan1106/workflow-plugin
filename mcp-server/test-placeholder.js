// Test placeholder detection
const content1 = '## セクション\nこれは未定です。';
const content2 = '## セクション\n[ここにコードを追加]';
const content3 = '## セクション\nサンプルコードです。';
const content4 = '## セクション\n[関連ドキュメント](link)は正常';
const content5 = '## セクション\n要検討事項があります。';
const content6 = '## セクション\nダミーデータを使用。';

const patterns = ['未定', '未確定', '要検討', '検討中', '対応予定', 'サンプル', 'ダミー', '仮置き'];
const bracketPattern = /\[(?!関連|参考|注|例|出典)[^\]]{1,50}\]/g;

console.log('Test 1 (未定 - should detect):', patterns.some(p => content1.includes(p)));
console.log('Test 2 (bracket placeholder - should detect):', bracketPattern.test(content2));
console.log('Test 3 (サンプル - should detect):', patterns.some(p => content3.includes(p)));
console.log('Test 4 (関連 - should NOT detect):', bracketPattern.test(content4));
console.log('Test 5 (要検討 - should detect):', patterns.some(p => content5.includes(p)));
console.log('Test 6 (ダミー - should detect):', patterns.some(p => content6.includes(p)));

// Test bracket matches
const matches = content2.match(bracketPattern);
console.log('\nBracket matches in content2:', matches);
