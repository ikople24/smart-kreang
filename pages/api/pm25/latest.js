import dbConnect from "@/lib/dbConnect";
import PmReading from "@/models/PmReading";
import { parseHazemonLatest } from "@/lib/hazemon";

const HAZEMON_URL =
  "https://hazemon.in.th/api/time_aggr/hazemon/TH-PKN-HuaHin-5132";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // 1) Try upstream first (fresh realtime)
  try {
    const r = await fetch(HAZEMON_URL, { headers: { accept: "application/json" } });
    if (r.ok) {
      const json = await r.json();
      const latest = parseHazemonLatest(json);
      if (latest) return res.status(200).json({ success: true, source: "hazemon", latest });
    }
  } catch (e) {
    console.error("PM2.5 upstream fetch failed:", e);
  }

  // 2) Fallback to DB (if upstream is down / CORS etc.)
  try {
    await dbConnect();
    const latest = await PmReading.findOne({}).sort({ timestamp: -1 }).lean();
    if (!latest) return res.status(404).json({ success: false, error: "No data" });
    return res.status(200).json({ success: true, source: "mongo", latest });
  } catch (e) {
    console.error("PM2.5 DB fallback failed:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
}


