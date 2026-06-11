'use strict';
// 共有ユーティリティへ委譲（port: 6101 固定）
// 直接呼び出し: node scripts/check-ports.js
// npm script:   npm run check:ports
process.argv.push('6101');
require('../../scripts/check-port.js');
