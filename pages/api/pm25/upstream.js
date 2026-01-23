import { buildHazemonRangeUrl, getHazemonBaseUrl } from "@/lib/hazemonUrl";

function toEpochSeconds(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const from = toEpochSeconds(req.query.from);
  const to = toEpochSeconds(req.query.to);

  if ((from == null) !== (to == null)) {
    return res.status(400).json({
      success: false,
      error: "Provide both ?from=<epoch_seconds>&to=<epoch_seconds> (or neither)",
    });
  }

  // Ensure from <= to (swap if needed)
  const fromEpoch = from == null ? null : Math.min(from, to);
  const toEpoch = to == null ? null : Math.max(from, to);

  const baseUrl = getHazemonBaseUrl({ node: req.query.node });
  const upstreamUrl =
    fromEpoch == null || toEpoch == null
      ? baseUrl
      : buildHazemonRangeUrl({
          baseUrl,
          beforeEpoch: toEpoch,
          afterEpoch: fromEpoch,
          aggrMinutes: req.query.aggr ?? process.env.HAZEMON_AGGR_MINUTES,
        });

  try {
    const r = await fetchJsonWithTimeout(upstreamUrl, 8000);
    if (!r.ok) {
      return res.status(502).json({
        success: false,
        error: "Upstream error",
        status: r.status,
        upstreamUrl,
      });
    }
    const json = await r.json();
    return res.status(200).json({ success: true, upstreamUrl, json });
  } catch (e) {
    console.error("PM2.5 upstream proxy failed:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
}

