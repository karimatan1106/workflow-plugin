/**
 * ワークフロー制御 MCP Server エントリーポイント
 */

import { runServer } from './server.js';

// サーバー起動
runServer().catch((error) => {
  console.error('サーバー起動エラー:', error);
  process.exit(1);
});
