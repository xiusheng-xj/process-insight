import client from './client';

/**
 * イベント一覧取得
 * @param {number} projectId
 * @param {{ event_type?: string, status?: string }} params
 * @returns {ProjectEvent[]}
 */
export const fetchEvents = async (projectId, params = {}) => {
    const res = await client.get(`/projects/${projectId}/events`, { params });
    return res.data;
};

/**
 * イベント単件取得
 * @param {number} projectId
 * @param {number} eventId
 * @returns {ProjectEvent}
 */
export const fetchEvent = async (projectId, eventId) => {
    const res = await client.get(`/projects/${projectId}/events/${eventId}`);
    return res.data;
};

/**
 * イベント新規作成
 * @param {number} projectId
 * @param {{ event_type: string, event_name: string, plan_date?: string,
 *           actual_date?: string, status?: string,
 *           owner_department?: string, updated_by?: string }} body
 * @returns {ProjectEvent}
 */
export const createEvent = async (projectId, body) => {
    const res = await client.post(`/projects/${projectId}/events`, body);
    return res.data;
};

/**
 * イベント更新（実績日入力・差異計算）
 * @param {number} projectId
 * @param {number} eventId
 * @param {Partial<ProjectEvent>} body
 * @returns {ProjectEvent}
 */
export const updateEvent = async (projectId, eventId, body) => {
    const res = await client.put(`/projects/${projectId}/events/${eventId}`, body);
    return res.data;
};

/**
 * イベント削除
 * @param {number} projectId
 * @param {number} eventId
 */
export const deleteEvent = async (projectId, eventId) => {
    await client.delete(`/projects/${projectId}/events/${eventId}`);
};
