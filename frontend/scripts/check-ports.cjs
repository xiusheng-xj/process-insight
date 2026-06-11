'use strict';
// 共有ユーティリティへ委譲（port: 6100 固定）
// 直接呼び出し: node scripts/check-ports.cjs
// npm script:   npm run check:ports
process.argv.push('6100');
require('../../scripts/check-port.js');
