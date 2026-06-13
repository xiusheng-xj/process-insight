import client from './client';

/**
 * 案件一覧取得
 * @param {{ status?: string, search?: string, page?: number, limit?: number }} params
 * @returns {{ data: Project[], total: number, page: number, limit: number }}
 */
export const fetchProjects = async (params = {}) => {
    const res = await client.get('/projects', { params });
    return res.data;
};

/**
 * 案件単件取得
 * @param {number} id
 * @returns {Project}
 */
export const fetchProject = async (id) => {
    const res = await client.get(`/projects/${id}`);
    return res.data;
};

/**
 * 案件新規作成
 * @param {{ project_no: string, project_name: string, pattern_no?: string,
 *           machine_type?: string, product_name?: string, quantity?: number,
 *           status?: string, comment?: string }} body
 * @returns {Project}
 */
export const createProject = async (body) => {
    const res = await client.post('/projects', body);
    return res.data;
};

/**
 * 案件更新
 * @param {number} id
 * @param {Partial<Project>} body
 * @returns {Project}
 */
export const updateProject = async (id, body) => {
    const res = await client.put(`/projects/${id}`, body);
    return res.data;
};

/**
 * 論理削除（ゴミ箱へ移動）
 * @param {number} id
 * @param {{ reason?: string, deletedBy?: string }} opts
 */
export const deleteProject = async (id, { reason = null, deletedBy = null } = {}) => {
    await client.delete(`/projects/${id}`, { data: { reason, deleted_by: deletedBy } });
};

/**
 * ゴミ箱一覧取得
 */
export const fetchTrash = async () => {
    const res = await client.get('/projects/trash');
    return res.data;
};

/**
 * 復元
 * @param {number} id
 */
export const restoreProject = async (id) => {
    const res = await client.patch(`/projects/${id}/restore`);
    return res.data;
};

/**
 * マイルストーンパターン一覧取得
 * @returns {{ id, pattern_code, pattern_name, event_count, milestone_count }[]}
 */
export const fetchMilestonePatterns = async () => {
    const res = await client.get('/templates');
    return res.data;
};

/**
 * 案件イベント構成を新規パターンとして保存
 * axios interceptor が error body を捨てるため fetch で直接呼ぶ。
 * 非 2xx 時は err.status / err.error / err.existing_pattern を持つ Error を throw する。
 */
export const saveAsPattern = async (projectId, { pattern_name, pattern_code, description }) => {
    const base     = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6101/api';
    const userName = encodeURIComponent(sessionStorage.getItem('userName') || 'anonymous');

    let res;
    try {
        res = await fetch(`${base}/projects/${projectId}/save-as-pattern`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-name': userName },
            body: JSON.stringify({ pattern_name, pattern_code, description }),
        });
    } catch {
        const err = new Error('保存処理を開始できませんでした。ユーザー名または通信設定を確認してください。');
        err.status = 0;
        throw err;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const err = new Error(
            data.message || data.error || `保存に失敗しました。（HTTP ${res.status}）`
        );
        err.status           = res.status;
        err.error            = data.error;
        err.existing_pattern = data.existing_pattern;
        err.data             = data;
        throw err;
    }

    return data;
};

/**
 * プログラムガント用案件一覧取得
 * @param {{ status?: string, health_status?: string, search?: string }} params
 */
export const fetchProjectsGantt = async (params = {}) => {
    const res = await client.get('/projects/gantt', { params });
    return res.data;
};

/**
 * マイルストーンパターン適用
 * @param {number} projectId
 * @param {{ pattern_id: number, base_date: string }} body
 * @returns {{ message, event_count, archived_count, applied_milestone_pattern_id, events }}
 */
export const applyMilestonePattern = async (projectId, { pattern_id, base_date }) => {
    const res = await client.post(`/projects/${projectId}/apply-template`, { pattern_id, base_date });
    return res.data;
};
