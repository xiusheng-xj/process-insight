// 工程計画レビュー：Rule レジストリ
// Rule を追加する際は、ここに 1 行追加する（＋ review_rules カタログに登録）。
// UI は GET /review の findings を汎用描画するため改修不要。

const rule001 = require('./rules/rule001_resource_overlap');

const registry = {
    'RULE-001': rule001,
    // 'RULE-002': require('./rules/rule002_location_bias'),  // 将来
};

module.exports = registry;
