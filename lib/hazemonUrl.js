const DEFAULT_LEGACY_URL =
  "https://hazemon.in.th/api/time_aggr/hazemon/TH-NRT-%E0%B8%AA.%E0%B8%84%E0%B8%A7%E0%B8%9A%E0%B8%84%E0%B8%B8%E0%B8%A1%E0%B9%84%E0%B8%9F%E0%B8%9B%E0%B9%88%E0%B8%B2%E0%B8%9E%E0%B8%A3%E0%B8%B8%E0%B8%84%E0%B8%A7%E0%B8%99%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B9%87%E0%B8%87-5068";

function stripTrailingSlashes(url) {
  return String(url || "").replace(/\/+$/, "");
}

export function getHazemonBaseUrl({ node } = {}) {
  // Backward compatible:
  // - If HAZEMON_URL is set, assume it's already the full base URL (including node slug if needed)
  // - Else, build from root + node (node id / slug)
  const direct = process.env.HAZEMON_URL;
  if (direct) return stripTrailingSlashes(direct);

  const root =
    process.env.HAZEMON_API_ROOT || "https://hazemon.in.th/api/time_aggr/hazemon";

  const nodeId = node || process.env.HAZEMON_NODE_ID;
  if (!nodeId) return stripTrailingSlashes(DEFAULT_LEGACY_URL);

  // Node id may contain Thai chars; encode for URL path.
  return `${stripTrailingSlashes(root)}/${encodeURIComponent(String(nodeId))}`;
}

export function buildHazemonRangeUrl({
  baseUrl,
  node,
  beforeEpoch, // (to)
  afterEpoch, // (from)
  aggrMinutes,
  order, // "before_after" | "after_before"
} = {}) {
  const base = stripTrailingSlashes(baseUrl || getHazemonBaseUrl({ node }));

  const before = Number.isFinite(Number(beforeEpoch)) ? Math.trunc(Number(beforeEpoch)) : null;
  const after = Number.isFinite(Number(afterEpoch)) ? Math.trunc(Number(afterEpoch)) : null;

  if (before == null || after == null) return base;

  const resolvedOrder =
    order ||
    process.env.HAZEMON_RANGE_ORDER ||
    "before_after";

  // Some Hazemon patterns append /<aggrMinutes> (e.g. /1440)
  const aggr =
    aggrMinutes == null || aggrMinutes === ""
      ? null
      : Number.isFinite(Number(aggrMinutes))
        ? Math.trunc(Number(aggrMinutes))
        : null;

  const path =
    resolvedOrder === "after_before"
      ? `${base}/${after}/${before}`
      : `${base}/${before}/${after}`;

  return aggr != null ? `${path}/${aggr}` : path;
}

