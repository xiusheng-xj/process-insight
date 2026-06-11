/**
 * 共通エラーハンドラーミドルウェア
 */
function errorHandler(err, req, res, next) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);

    if (err.code === '23505') {
        return res.status(409).json({ error: '重複エラー: 既に同じ値が存在します。', detail: err.detail });
    }
    if (err.code === '23503') {
        return res.status(400).json({ error: '参照エラー: 関連するレコードが存在しません。', detail: err.detail });
    }
    if (err.code === '22P02') {
        return res.status(400).json({ error: '不正な値の形式です。' });
    }

    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'サーバー内部エラー' });
}

module.exports = errorHandler;
