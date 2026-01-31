#!/usr/bin/env node

/**
 * 危険なコマンドをブロックするフック
 * Claude Code自体や重要なプロセスを終了させるコマンドを禁止
 */

const fs = require('fs');

// 標準入力からツール入力を読み取る
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const toolInput = JSON.parse(input);
    const command = toolInput.command || '';
    
    // 禁止パターン
    const dangerousPatterns = [
      // プロセス終了系（Windows）
      /taskkill\s+\/f\s+\/im\s+\*/i,           // taskkill /f /im * (全プロセス)
      /taskkill.*\/f.*node/i,                   // nodeプロセスを強制終了
      /taskkill.*\/f.*claude/i,                 // claudeプロセスを強制終了
      /taskkill.*\/f.*code/i,                   // codeプロセスを強制終了
      /taskkill.*\/f.*cmd/i,                    // cmdプロセスを強制終了
      /taskkill.*\/f.*powershell/i,             // powershellプロセスを強制終了
      
      // プロセス終了系（Unix/Linux/Mac）
      /kill\s+-9\s+-1/,                         // kill -9 -1 (全プロセス)
      /killall\s+-9/,                           // killall -9
      /pkill\s+-9/,                             // pkill -9
      /pkill.*node/i,                           // nodeプロセスを終了
      /pkill.*claude/i,                         // claudeプロセスを終了
      /killall.*node/i,                         // nodeプロセスを終了
      /killall.*claude/i,                       // claudeプロセスを終了
      
      // システム終了系
      /shutdown/i,                              // システムシャットダウン
      /reboot/i,                                // システム再起動
      /init\s+0/,                               // システム停止
      /init\s+6/,                               // システム再起動
      /halt/i,                                  // システム停止
      /poweroff/i,                              // 電源オフ
      
      // 自己破壊系
      /rm\s+-rf\s+\/(?!\s)/,                    // rm -rf / (ルート削除)
      /del\s+\/s\s+\/q\s+c:\/i,                // Windowsシステム削除
      /format\s+c:/i,                           // Cドライブフォーマット
      
      // フォークボム
      /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,         // Bash fork bomb
    ];
    
    // コマンドチェック
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        console.error(JSON.stringify({
          error: `🚫 危険なコマンドがブロックされました: このコマンドはシステムやClaude Codeを破壊する可能性があります。`,
          blocked_pattern: pattern.toString(),
          command_preview: command.substring(0, 100)
        }));
        process.exit(1);
      }
    }
    
    // 安全なコマンド
    process.exit(0);
    
  } catch (e) {
    // パースエラーは無視（Bashツール以外の呼び出し）
    process.exit(0);
  }
});
