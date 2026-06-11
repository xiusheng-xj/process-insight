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
 * 案件削除
 * @param {number} id
 */
export const deleteProject = async (id) => {
    await client.delete(`/projects/${id}`);
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
 * マイルストーンパターン適用
 * @param {number} projectId
 * @param {{ pattern_id: number, base_date: string }} body
 * @returns {{ message, event_count, archived_count, applied_milestone_pattern_id, events }}
 */
export const applyMilestonePattern = async (projectId, { pattern_id, base_date }) => {
    const res = await client.post(`/projects/${projectId}/apply-template`, { pattern_id, base_date });
    return res.data;
};
