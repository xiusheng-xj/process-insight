import axios from 'axios';

const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
});

// ログインユーザー名をヘッダーに付与（編集ロック判定に使用）
client.interceptors.request.use((config) => {
    const userName = sessionStorage.getItem('userName') || 'anonymous';
    config.headers['x-user-name'] = encodeURIComponent(userName);
    return config;
});

// レスポンスエラーの共通ハンドリング
client.interceptors.response.use(
    (res) => res,
    (err) => {
        const status  = err.response?.status;
        const message = err.response?.data?.error || err.message;

        if (status === 423) {
            // 編集ロック中は呼び出し元に locked_by を渡す
            return Promise.reject({ status, message, locked_by: err.response.data.locked_by });
        }
        return Promise.reject({ status, message });
    }
);

export default client;
