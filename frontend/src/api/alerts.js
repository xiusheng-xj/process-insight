import client from './client';

/* ── 案件配下（プロジェクトスコープ） ── */

export const fetchAlerts = async (projectId, params = {}) => {
    const res = await client.get(`/projects/${projectId}/alerts`, { params });
    return res.data;
};

export const resolveAlert = async (projectId, alertId) => {
    const resolvedBy = sessionStorage.getItem('userName') || 'unknown';
    const res = await client.patch(
        `/projects/${projectId}/alerts/${alertId}/resolve`,
        { resolved_by: resolvedBy },
        { headers: { 'X-User-Name': resolvedBy } }
    );
    return res.data;
};

/* ── グローバル（全案件） ── */

export const fetchAlertsGlobal = async (params = {}) => {
    const res = await client.get('/alerts', { params });
    return res.data;
};

export const resolveAlertGlobal = async (alertId, resolvedBy) => {
    const user = resolvedBy || sessionStorage.getItem('userName') || 'unknown';
    const res = await client.patch(
        `/alerts/${alertId}/resolve`,
        { resolved_by: user },
        { headers: { 'X-User-Name': user } }
    );
    return res.data;
};

export const fetchAlertSettings = async () => {
    const res = await client.get('/alerts/settings');
    return res.data;
};

export const updateAlertSettings = async (settings) => {
    const res = await client.put('/alerts/settings', settings);
    return res.data;
};

export const generateAlerts = async () => {
    const res = await client.post('/alerts/generate');
    return res.data;
};

export const fetchAlertSummary = async () => {
    const res = await client.get('/alerts/summary');
    return res.data;
};
