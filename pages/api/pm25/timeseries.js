import { parseHazemonSeries } from "@/lib/hazemon";

const HAZEMON_URL =
  process.env.HAZEMON_URL ||
  "https://hazemon.in.th/api/time_aggr/hazemon/TH-NRT-%E0%B8%AD%E0%B8%9A%E0%B8%95.%E0%B8%84%E0%B8%A7%E0%B8%99%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B9%87%E0%B8%87-5080a";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toEpochSeconds(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function buildHazemonUrl(baseUrl, fromEpoch, toEpoch) {
  // Hazemon supports: <base>/<to>/<from>
  if (fromEpoch == null || toEpoch == null) return baseUrl;
  return `${baseUrl}/${toEpoch}/${fromEpoch}`;
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

function downsampleByStep(points, stepSec) {
  if (!stepSec || stepSec <= 0) return points;

  const buckets = new Map(); // bucketTs -> accum
  for (const p of points) {
    const ts = typeof p?.timestamp === "number" ? p.timestamp : null;
    if (ts == null) continue;
    const bucketTs = Math.floor(ts / stepSec) * stepSec;

    const cur =
      buckets.get(bucketTs) || {
        timestamp: bucketTs,
        datetime_local: p.datetime_local ?? null,
        pm25_sum: 0,
        pm25_count: 0,
      };

    if (typeof p.pm25 === "number" && Number.isFinite(p.pm25)) {
      cur.pm25_sum += p.pm25;
      cur.pm25_count += 1;
    }

    // keep latest datetime_local seen in the bucket (more recent)
    cur.datetime_local = p.datetime_local ?? cur.datetime_local;

    buckets.set(bucketTs, cur);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((b) => ({
      timestamp: b.timestamp,
      datetime_local: b.datetime_local,
      pm25: b.pm25_count > 0 ? Math.round(b.pm25_sum / b.pm25_count) : null,
      count: b.pm25_count,
    }))
    .filter((p) => typeof p.pm25 === "number" && Number.isFinite(p.pm25));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const nowEpoch = Math.floor(Date.now() / 1000);

  const fromQ = toEpochSeconds(req.query.from);
  const toQ = toEpochSeconds(req.query.to);

  if ((fromQ == null) !== (toQ == null)) {
    return res.status(400).json({
      success: false,
      error: "Provide both ?from=<epoch_seconds>&to=<epoch_seconds> or use ?hours=<n>",
    });
  }

  const hours = clampInt(req.query.hours, 1, 72, 24); // default: 24h, max: 72h (3 days)
  const step = clampInt(req.query.step, 0, 6 * 60 * 60, 15 * 60); // default: 15 min, 0 = no downsample
  const limit = clampInt(req.query.limit, 10, 5000, 2000);

  const fromEpochRaw = fromQ != null ? fromQ : nowEpoch - hours * 60 * 60;
  const toEpochRaw = toQ != null ? toQ : nowEpoch;

  const fromEpoch = Math.min(fromEpochRaw, toEpochRaw);
  const toEpoch = Math.max(fromEpochRaw, toEpochRaw);

  const upstreamUrl = buildHazemonUrl(HAZEMON_URL, fromEpoch, toEpoch);

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
    const raw = parseHazemonSeries(json, { fromEpoch });
    const inRange = raw.filter((p) => typeof p.timestamp === "number" && p.timestamp <= toEpoch);

    // Filter out missing/invalid values to avoid "broken" chart segments.
    const minimal = inRange
      .map((p) => ({
        timestamp: p.timestamp,
        datetime_local: p.datetime_local ?? null,
        pm25: p.pm25 ?? null,
      }))
      .filter((p) => typeof p.pm25 === "number" && Number.isFinite(p.pm25));

    const sampled = downsampleByStep(minimal, step);
    const points = sampled.slice(Math.max(0, sampled.length - limit));

    return res.status(200).json({
      success: true,
      source: "hazemon",
      upstreamUrl,
      from: fromEpoch,
      to: toEpoch,
      step,
      limit,
      points,
    });
  } catch (e) {
    console.error("PM2.5 timeseries failed:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
}

