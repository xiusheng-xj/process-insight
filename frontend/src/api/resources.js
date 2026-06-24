import client from './client';

/**
 * 設備/能力枠マスタ一覧取得
 * @param {{ active?: boolean }} params
 * @returns {Resource[]}  home_location_name / home_location_code を含む
 */
export const fetchResources = async (params = {}) => {
    const query = params.active ? { active: 1 } : {};
    const res = await client.get('/resources', { params: query });
    return res.data;
};

export const createResource = async (body) => {
    const res = await client.post('/resources', body);
    return res.data;
};

export const updateResource = async (id, body) => {
    const res = await client.put(`/resources/${id}`, body);
    return res.data;
};
