import { useState, useEffect, useCallback, useRef } from 'react';
import { acquireLock, releaseLock, fetchLockStatus } from '../api/locks';

/**
 * 編集ロック管理フック
 *
 * 使用例:
 *   const { locked, lockedBy, acquire, release, lockError } = useLock(projectId);
 *
 *   編集ボタン押下時 → acquire() 成功したら編集モードへ
 *   保存/キャンセル時 → release()
 */
export function useLock(projectId) {
    const [locked, setLocked]       = useState(false);
    const [lockedBy, setLockedBy]   = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [myLock, setMyLock]       = useState(false);  // 自分がロック保持中か
    const [lockError, setLockError] = useState(null);
    const refreshRef = useRef(null);

    const checkStatus = useCallback(async () => {
        if (!projectId) return;
        try {
            const res = await fetchLockStatus(projectId);
            setLocked(res.locked);
            setLockedBy(res.locked_by || null);
            setExpiresAt(res.expires_at || null);
        } catch {
            // ステータス確認失敗は無視
        }
    }, [projectId]);

    // 30秒ごとにロック状態をポーリング
    useEffect(() => {
        checkStatus();
        refreshRef.current = setInterval(checkStatus, 30000);
        return () => clearInterval(refreshRef.current);
    }, [checkStatus]);

    const acquire = useCallback(async () => {
        setLockError(null);
        try {
            await acquireLock(projectId);
            setMyLock(true);
            setLocked(true);
            return true;
        } catch (err) {
            setLockError(err.message);
            if (err.locked_by) setLockedBy(err.locked_by);
            return false;
        }
    }, [projectId]);

    const release = useCallback(async () => {
        if (!myLock) return;
        try {
            await releaseLock(projectId);
        } finally {
            setMyLock(false);
            setLocked(false);
            setLockedBy(null);
        }
    }, [projectId, myLock]);

    // アンマウント時に自動解放
    useEffect(() => {
        return () => { if (myLock) releaseLock(projectId).catch(() => {}); };
    }, [projectId, myLock]);

    return { locked, lockedBy, expiresAt, myLock, lockError, acquire, release, checkStatus };
}
