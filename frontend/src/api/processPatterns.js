const base = () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:6101/api';

const userName = () => encodeURIComponent(sessionStorage.getItem('userName') || 'anonymous');

async function apiFetch(path, opts = {}) {
    let res;
    try {
        res = await fetch(`${base()}${path}`, {
            headers: { 'Content-Type': 'application/json', 'x-user-name': userName(), ...opts.headers },
            ...opts,
        });
    } catch {
        const err = new Error('保存に失敗しました。入力内容または通信設定を確認してください。');
        err.status = 0;
        throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.error  = data.error;
        err.data   = data;
        throw err;
    }
    return data;
}

// ── 工程パターン ─────────────────────────────────────────

export const fetchProcessPatterns = (includeInactive = false) =>
    apiFetch(`/process-patterns${includeInactive ? '?include_inactive=true' : ''}`);

export const createProcessPattern = (body) =>
    apiFetch('/process-patterns', { method: 'POST', body: JSON.stringify(body) });

export const toggleProcessPattern = (id, is_active) =>
    apiFetch(`/process-patterns/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) });

export const deleteProcessPattern = (id) =>
    apiFetch(`/process-patterns/${id}`, { method: 'DELETE' });

// ── プロジェクト工程ステップ ────────────────────────────

export const fetchProjectProcessSteps = (projectId, parentEventId = null) => {
    const qs = parentEventId ? `?parent_event_id=${parentEventId}` : '';
    return apiFetch(`/projects/${projectId}/process-steps${qs}`);
};

export const createProjectProcessStep = (projectId, body) =>
    apiFetch(`/projects/${projectId}/process-steps`, { method: 'POST', body: JSON.stringify(body) });

export const updateProjectProcessStep = (projectId, stepId, body) =>
    apiFetch(`/projects/${projectId}/process-steps/${stepId}`, { method: 'PUT', body: JSON.stringify(body) });

export const deleteProjectProcessStep = (projectId, stepId) =>
    apiFetch(`/projects/${projectId}/process-steps/${stepId}`, { method: 'DELETE' });

export const uncompleteProjectProcessStep = (projectId, stepId) =>
    apiFetch(`/projects/${projectId}/process-steps/${stepId}/uncomplete`, { method: 'PATCH' });

export const addProcessStepActual = (projectId, stepId, body) =>
    apiFetch(`/projects/${projectId}/process-steps/${stepId}/actuals`,
        { method: 'POST', body: JSON.stringify(body) });

export const cancelLatestProcessStepActual = (projectId, stepId) =>
    apiFetch(`/projects/${projectId}/process-steps/${stepId}/actuals/latest`,
        { method: 'DELETE' });

// ── パターン適用 / 保存 ──────────────────────────────────

export const applyProcessPattern = (projectId, eventId, body) =>
    apiFetch(`/projects/${projectId}/events/${eventId}/apply-process-pattern`,
        { method: 'POST', body: JSON.stringify(body) });

export const saveProcessPattern = (projectId, eventId, body) =>
    apiFetch(`/projects/${projectId}/events/${eventId}/save-process-pattern`,
        { method: 'POST', body: JSON.stringify(body) });
