// location_id / resource_id の解決ヘルパー（project_events / project_process_steps 共通）
// resource_id 指定かつ location 未指定のとき、resource.home_location_id を補完する。
//
// 戻り値:
//   hasLocation : location を更新すべきか（明示送信 or resource からの補完が成立）
//   hasResource : resource を更新すべきか（body に resource_id キーがある）
//   locationId  : 解決後の location_id（null 可）
//   resourceId  : 解決後の resource_id（null 可）
async function resolveLocationResource(db, body) {
    const hasResource = Object.prototype.hasOwnProperty.call(body, 'resource_id');
    const hasLocation = Object.prototype.hasOwnProperty.call(body, 'location_id');
    let resourceId = hasResource ? (body.resource_id || null) : undefined;
    let locationId = hasLocation ? (body.location_id || null) : undefined;

    if (resourceId && (locationId == null)) {
        const { rows } = await db.query(
            'SELECT home_location_id FROM resources WHERE id = $1',
            [resourceId]
        );
        if (rows[0]?.home_location_id) {
            locationId = rows[0].home_location_id;
        }
    }

    return {
        hasLocation: hasLocation || (resourceId != null && locationId != null),
        hasResource,
        locationId,
        resourceId,
    };
}

module.exports = { resolveLocationResource };
