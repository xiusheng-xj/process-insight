'use strict';

/**
 * 全システム共通ポート定義
 * 新システムを追加する場合はここに追記する。
 * frontend は必ず 100 番台の偶数、backend はその +1 とする。
 */
module.exports = {
    ProcessSchedule: { frontend: 6100, backend: 6101 },
    PMOInsight:      { frontend: 6200, backend: 6201 },
    EOLInsight:      { frontend: 6300, backend: 6301 },
    BPMN:            { frontend: 6400, backend: 6401 },
    DTM:             { frontend: 6500, backend: 6501 },
};
