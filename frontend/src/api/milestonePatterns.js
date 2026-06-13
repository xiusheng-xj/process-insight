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
        const err = new Error('通信に失敗しました。');
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

export const fetchMilestonePatternsList = (includeInactive = false) =>
    apiFetch(`/milestone-patterns${includeInactive ? '?include_inactive=true' : ''}`);

export const fetchMilestonePattern = (id) =>
    apiFetch(`/milestone-patterns/${id}`);

export const createMilestonePattern = (body) =>
    apiFetch('/milestone-patterns', { method: 'POST', body: JSON.stringify(body) });

export const updateMilestonePattern = (id, body) =>
    apiFetch(`/milestone-patterns/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const toggleMilestonePattern = (id) =>
    apiFetch(`/milestone-patterns/${id}/toggle-active`, { method: 'PATCH' });

export const deleteMilestonePattern = (id, reason = null) =>
    apiFetch(`/milestone-patterns/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ deleted_reason: reason }),
    });

export const fetchEventMasterList = () =>
    apiFetch('/event-master');
