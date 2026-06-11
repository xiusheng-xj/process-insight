const { Pool, types } = require('pg');

// DATE型(OID 1082)を JS Date に変換せず 'YYYY-MM-DD' 文字列のまま返す
// （タイムゾーン変換によるずれを防止）
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'process_schedule',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max:                20,
    idleTimeoutMillis:  30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
};
