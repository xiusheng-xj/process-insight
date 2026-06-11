import client from './client';

/**
 * ロック取得（編集開始時に呼ぶ）
 * @param {number} projectId
 * @returns {{ project_id, locked_by, locked_at, expires_at, lock_status }}
 * @throws {{ status: 423, message: string, locked_by: string }} 他ユーザーがロック中
 */
export const acquireLock = async (projectId) => {
    const res = await client.post(`/projects/${projectId}/locks/acquire`);
    return res.data;
};

/**
 * ロック解放（編集完了・キャンセル時に呼ぶ）
 * @param {number} projectId
 */
export const releaseLock = async (projectId) => {
    const res = await client.post(`/projects/${projectId}/locks/release`);
    return res.data;
};

/**
 * ロック状態確認
 * @param {number} projectId
 * @returns {{ locked: boolean, locked_by?: string, expires_at?: string }}
 */
export const fetchLockStatus = async (projectId) => {
    const res = await client.get(`/projects/${projectId}/locks/status`);
    return res.data;
};
