// Utilities for Hazemon sensor API response parsing
// Example upstream:
// https://hazemon.in.th/api/time_aggr/hazemon/TH-NRT-%E0%B8%AD%E0%B8%9A%E0%B8%95.%E0%B8%84%E0%B8%A7%E0%B8%99%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B9%87%E0%B8%87-5080a

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

export function parseHazemonSeries(json, opts = {}) {
  const fromEpoch = Number.isFinite(Number(opts?.fromEpoch)) ? Number(opts.fromEpoch) : null;

  const timeAggr = json?.time_aggr ?? {};
  const nodeIdKey = Object.keys(timeAggr)[0];
  const byTimestamp = nodeIdKey ? timeAggr[nodeIdKey] : null;
  if (!nodeIdKey || !byTimestamp) return [];

  const rows = [];
  for (const [tsKey, v] of Object.entries(byTimestamp)) {
    const ts = Number(tsKey);
    if (!Number.isFinite(ts)) continue;
    if (fromEpoch != null && ts < fromEpoch) continue;

    const dtLocalArr = v?.["datetime(UTC+7)"];
    const dtLocal = Array.isArray(dtLocalArr) ? dtLocalArr[0] : null;

    const pm25 = Number(v?.["PM2.5"]);
    const pm10 = Number(v?.["PM10"]);
    const pm1 = Number(v?.["PM1.0"]);

    rows.push({
      node_id: v?.node_id ?? Number(nodeIdKey),
      node_name: v?.node_name ?? null,
      timestamp: ts,
      datetime_local: dtLocal,
      pm25: Number.isFinite(pm25) ? pm25 : null,
      pm10: Number.isFinite(pm10) ? pm10 : null,
      pm1: Number.isFinite(pm1) ? pm1 : null,
      raw: v ?? null,
    });
  }

  rows.sort((a, b) => a.timestamp - b.timestamp);
  return rows;
}


