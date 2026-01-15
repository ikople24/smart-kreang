// Utilities for Hazemon sensor API response parsing
// Example upstream:
// https://hazemon.in.th/api/time_aggr/hazemon/TH-PKN-HuaHin-5132

export function parseHazemonLatest(json) {
  const timeAggr = json?.time_aggr ?? {};
  const nodeIdKey = Object.keys(timeAggr)[0];
  const byTimestamp = nodeIdKey ? timeAggr[nodeIdKey] : null;

  if (!nodeIdKey || !byTimestamp) return null;

  const timestamps = Object.keys(byTimestamp)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));

  if (timestamps.length === 0) return null;

  const latestTs = Math.max(...timestamps);
  const latest = byTimestamp[String(latestTs)];

  const dtLocalArr = latest?.["datetime(UTC+7)"];
  const dtLocal = Array.isArray(dtLocalArr) ? dtLocalArr[0] : null;

  const pm25 = Number(latest?.["PM2.5"]);
  const pm10 = Number(latest?.["PM10"]);
  const pm1 = Number(latest?.["PM1.0"]);

  return {
    node_id: latest?.node_id ?? Number(nodeIdKey),
    node_name: latest?.node_name ?? null,
    timestamp: latestTs,
    datetime_local: dtLocal,
    pm25: Number.isFinite(pm25) ? pm25 : null,
    pm10: Number.isFinite(pm10) ? pm10 : null,
    pm1: Number.isFinite(pm1) ? pm1 : null,
    raw: latest ?? null,
  };
}


