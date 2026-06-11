'use strict';
/**
 * port-utils.js  — Windows netstat ベースのポート管理ユーティリティ
 *
 * net.Server の bind 試行は Windows で 0.0.0.0 vs 127.0.0.1 の
 * アドレス差により LISTENING を誤検出する。
 * netstat -ano を直接パースして LISTENING 状態を確実に検出する。
 */
const { execSync, spawnSync } = require('child_process');

/**
 * 指定ポートを LISTENING している PID を返す。
 * IPv4 (0.0.0.0:PORT) / IPv6 ([::]:PORT) 両方を検出する。
 * 見つからなければ null。
 */
function findPidOnPort(port) {
    try {
        const output = execSync('netstat -ano', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        // 例: "  TCP    0.0.0.0:6101           0.0.0.0:0    LISTENING    1234"
        // 例: "  TCP    [::]:6101              [::]:0       LISTENING    1234"
        const pattern = new RegExp(`[:\\.]${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i');
        for (const line of output.split(/\r?\n/)) {
            const m = line.match(pattern);
            if (m) {
                const pid = parseInt(m[1], 10);
                if (!isNaN(pid) && pid > 0) return pid;
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * PID からプロセス名を返す（tasklist 使用）
 */
function getProcessName(pid) {
    try {
        const out = execSync(
            `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
        );
        const m = out.match(/"([^"]+)"/);
        return m ? m[1] : 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * 指定 PID を強制終了する
 */
function killPid(pid) {
    execSync(`taskkill /F /PID ${pid}`, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    });
}

/**
 * ポート状態をまとめて返す
 * @returns {{ free: boolean, pid: number|null, processName: string|null }}
 */
function checkPort(port) {
    const pid = findPidOnPort(port);
    if (pid == null) return { free: true, pid: null, processName: null };
    return { free: false, pid, processName: getProcessName(pid) };
}

/**
 * ポートを使用しているプロセスを終了し、結果を返す。
 * @returns {{ killed: boolean, pid: number|null, processName: string|null, error: string|null }}
 */
function killPort(port) {
    const pid = findPidOnPort(port);
    if (pid == null) return { killed: false, pid: null, processName: null, error: null };
    const processName = getProcessName(pid);
    try {
        killPid(pid);
        // プロセス終了後、OS がポートを解放するまで最大 2 秒待機
        waitPortFree(port, 2000);
        return { killed: true, pid, processName, error: null };
    } catch (e) {
        return { killed: false, pid, processName, error: e.message };
    }
}

/**
 * ポートが解放されるまでポーリングして待機（最大 maxMs ms）
 */
function waitPortFree(port, maxMs) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        if (findPidOnPort(port) == null) return;
        // 約 200ms 待機（Windows ping ハック: ping 1回≒1秒 なので /n 1 は即時）
        spawnSync('ping', ['-n', '1', '127.0.0.1'], {
            stdio: 'ignore',
            windowsHide: true,
        });
    }
}

module.exports = { findPidOnPort, getProcessName, killPid, checkPort, killPort, waitPortFree };
