import dbConnect from "@/lib/dbConnect";
import PmReading from "@/models/PmReading";
import { parseHazemonLatest } from "@/lib/hazemon";

const HAZEMON_URL =
  "https://hazemon.in.th/api/time_aggr/hazemon/TH-PKN-HuaHin-5132";

async function fetchWithTimeout(url, timeoutMs) {
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

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const headerSecret = req.headers["x-cron-secret"];
  const querySecret = req.query?.secret;

  return headerSecret === secret || querySecret === secret;
}

export default async function handler(req, res) {
  // Allow GET for easier testing / some schedulers defaulting to GET.
  // Still requires CRON_SECRET.
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      hint: "Provide ?secret=<CRON_SECRET> or header x-cron-secret",
    });
  }

  try {
    const r = await fetchWithTimeout(HAZEMON_URL, 8000);
    if (!r.ok) {
      return res.status(502).json({ success: false, error: "Upstream error", status: r.status });
    }

    const json = await r.json();
    const latest = parseHazemonLatest(json);
    if (!latest) {
      return res.status(404).json({ success: false, error: "No data" });
    }

    await dbConnect();

    const selector = { node_id: latest.node_id, timestamp: latest.timestamp };
    const update = { $setOnInsert: latest };

    await PmReading.updateOne(selector, update, { upsert: true });

    return res.status(200).json({ success: true, saved: true, latest });
  } catch (e) {
    // Duplicate key from unique index should be treated as OK (cron called twice, etc.)
    if (e?.code === 11000) {
      return res.status(200).json({ success: true, saved: false, duplicate: true });
    }
    console.error("PM2.5 collect failed:", e);
    return res.status(500).json({
      success: false,
      error: "Internal error",
      hint: "Check MONGO_URI and that MongoDB is reachable from Railway",
    });
  }
}


