'use strict';
/**
 * check-port.js  — ポート状態確認 CLI
 * Usage: node scripts/check-port.js <port> [port2] ...
 *
 * 空き:    exit 0
 * 使用中:  exit 1  （PID・プロセス名を表示）
 */
const { checkPort } = require('./port-utils');

const ports = process.argv.slice(2).map(Number).filter(p => p > 0);
if (ports.length === 0) {
    console.error('Usage: node scripts/check-port.js <port> [port2] ...');
    process.exit(2);
}

let hasConflict = false;

for (const port of ports) {
    const { free, pid, processName } = checkPort(port);
    if (free) {
        console.log(`[OK]    Port ${port} : 空きあり`);
    } else {
        console.error(`[ERROR] Port ${port} : 使用中`);
        console.error(`        PID      : ${pid}`);
        console.error(`        Process  : ${processName}`);
        console.error(`        Kill cmd : node scripts/kill-port.js ${port}`);
        hasConflict = true;
    }
}

process.exit(hasConflict ? 1 : 0);
