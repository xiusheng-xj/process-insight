import client from './client';

/**
 * 案件配下のアラート一覧
 * @param {number} projectId
 * @param {{ is_resolved?: boolean, severity?: string }} params
 * @returns {ProjectAlert[]}
 */
export const fetchAlerts = async (projectId, params = {}) => {
    const res = await client.get(`/projects/${projectId}/alerts`, { params });
    return res.data;
};

/**
 * アラート解決
 * @param {number} projectId
 * @param {number} alertId
 * @returns {ProjectAlert}
 */
export const resolveAlert = async (projectId, alertId) => {
    const res = await client.patch(`/projects/${projectId}/alerts/${alertId}/resolve`);
    return res.data;
};

/**
 * 全案件の未解決アラート集計（ダッシュボード用）
 * @returns {{ project_id, project_no, project_name, total_alerts,
 *             critical_count, warning_count, info_count }[]}
 */
export const fetchAlertSummary = async () => {
    const res = await client.get('/alerts/summary');
    return res.data;
};
