import client from './client';

/** レビュー項目カタログ（有効/無効・将来項目を含む） */
export const fetchReviewRules = async () => {
    const res = await client.get('/review/rules');
    return res.data;
};

/** 案件の工程計画レビューをライブ評価 */
export const fetchProjectReview = async (projectId) => {
    const res = await client.get(`/projects/${projectId}/review`);
    return res.data;
};
