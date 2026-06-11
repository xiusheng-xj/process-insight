'use strict';
/**
 * kill-port.js  — ポート占有プロセスを強制終了する CLI
 * Usage: node scripts/kill-port.js <port> [--node-only]
 *
 * --node-only  node.exe / vite 以外のプロセスは kill せずエラー終了する
 *              (dev:safe からの呼び出し時に使用し、システムプロセスを守る)
 *
 * exit 0: ポートが空きあり、または kill 成功
 * exit 1: kill 失敗 または --node-only かつ node/vite 以外
 */
const { checkPort, killPort } = require('./port-utils');

const args      = process.argv.slice(2);
const portArg   = args.find(a => /^\d+$/.test(a));
const nodeOnly  = args.includes('--node-only');

if (!portArg) {
    console.error('Usage: node scripts/kill-port.js <port> [--node-only]');
    process.exit(2);
}

const port = parseInt(portArg, 10);
const { free, pid, processName } = checkPort(port);

if (free) {
    console.log(`[OK] Port ${port} : 空きあり（kill 不要）`);
    process.exit(0);
}

console.log(`[INFO] Port ${port} : ${processName} (PID: ${pid}) が使用中`);

// --node-only: node / vite 以外のプロセスは自動 kill しない
if (nodeOnly) {
    const name = (processName || '').toLowerCase();
    const isNodeLike = name.includes('node') || name.includes('vite');
    if (!isNodeLike) {
        console.error(`[ERROR] ${processName} は node/vite ではないため自動終了しません。`);
        console.error(`        手動で停止してから再起動してください。`);
        process.exit(1);
    }
}

console.log(`[INFO] 強制終了します...`);
const result = killPort(port);

if (result.killed) {
    console.log(`[OK]   ${result.processName} (PID: ${result.pid}) を終了しました。`);
    process.exit(0);
} else {
    console.error(`[ERROR] 終了に失敗しました: ${result.error}`);
    process.exit(1);
}
