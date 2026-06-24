import client from './client';

/**
 * 場所マスタ一覧取得
 * @param {{ active?: boolean }} params
 * @returns {Location[]}
 */
export const fetchLocations = async (params = {}) => {
    const query = params.active ? { active: 1 } : {};
    const res = await client.get('/locations', { params: query });
    return res.data;
};

export const createLocation = async (body) => {
    const res = await client.post('/locations', body);
    return res.data;
};

export const updateLocation = async (id, body) => {
    const res = await client.put(`/locations/${id}`, body);
    return res.data;
};
