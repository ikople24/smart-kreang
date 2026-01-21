import dbConnect from "@/lib/dbConnect";
import PmReading from "@/models/PmReading";
import { parseHazemonSeries } from "@/lib/hazemon";

const HAZEMON_URL =
  process.env.HAZEMON_URL ||
  "https://hazemon.in.th/api/time_aggr/hazemon/TH-NRT-%E0%B8%AD%E0%B8%9A%E0%B8%95.%E0%B8%84%E0%B8%A7%E0%B8%99%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B9%87%E0%B8%87-5080a";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

function buildHazemonUrl(baseUrl, fromEpoch, toEpoch) {
  // Hazemon supports: <base>/<to>/<from>
  if (!fromEpoch || !toEpoch) return baseUrl;
  return `${baseUrl}/${toEpoch}/${fromEpoch}`;
}

function dateKeyFromDatetimeLocal(dtLocal) {
  // expects "YYYY-MM-DD HH:mm:ss" (UTC+7)
  if (typeof dtLocal !== "string") return null;
  const d = dtLocal.split(" ")[0];
  if (!d || d.length !== 10) return null;
  return d;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const days = clampInt(req.query.days, 1, 31, 7);
  const months = clampInt(req.query.months, 1, 24, 12);

  // We store Hazemon "timestamp" as epoch seconds. Use it for range filtering.
  const nowEpoch = Math.floor(Date.now() / 1000);
  const startDaysEpoch = nowEpoch - days * 24 * 60 * 60;
  const startMonthsEpoch = nowEpoch - months * 32 * 24 * 60 * 60; // rough window, grouping handles month boundary

  // 1) Prefer upstream (direct sensor), then fallback to DB.
  try {
    const fromEpoch = Math.min(startDaysEpoch, startMonthsEpoch);
    const upstreamUrl = buildHazemonUrl(HAZEMON_URL, fromEpoch, nowEpoch);

    const r = await fetchJsonWithTimeout(upstreamUrl, 8000);
    if (r.ok) {
      const json = await r.json();
      const seriesAll = parseHazemonSeries(json, { fromEpoch });
      const seriesForDays = seriesAll.filter((p) => typeof p.timestamp === "number" && p.timestamp >= startDaysEpoch);
      const seriesForMonths =
        months <= 1
          ? seriesForDays
          : seriesAll.filter((p) => typeof p.timestamp === "number" && p.timestamp >= startMonthsEpoch);

      if (seriesForDays.length > 0) {
        const dailyMap = new Map(); // date -> { sum, count }
        for (const row of seriesForDays) {
          if (row?.pm25 == null) continue;
          const dateKey = dateKeyFromDatetimeLocal(row.datetime_local);
          if (!dateKey) continue;
          const cur = dailyMap.get(dateKey) || { sum: 0, count: 0 };
          cur.sum += Number(row.pm25) || 0;
          cur.count += 1;
          dailyMap.set(dateKey, cur);
        }

        const daily = Array.from(dailyMap.entries())
          .map(([date, v]) => ({ date, avg: Math.round(v.sum / v.count), count: v.count }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-days);

        const monthlyMap = new Map(); // YYYY-MM -> { sum, count }
        for (const row of seriesForMonths) {
          if (row?.pm25 == null) continue;
          const dateKey = dateKeyFromDatetimeLocal(row.datetime_local);
          if (!dateKey) continue;
          const monthKey = dateKey.slice(0, 7);
          const cur = monthlyMap.get(monthKey) || { sum: 0, count: 0 };
          cur.sum += Number(row.pm25) || 0;
          cur.count += 1;
          monthlyMap.set(monthKey, cur);
        }

        const monthly = Array.from(monthlyMap.entries())
          .map(([key, v]) => ({ key, avg: Math.round(v.sum / v.count), count: v.count }))
          .sort((a, b) => b.key.localeCompare(a.key))
          .slice(0, months);

        return res.status(200).json({
          success: true,
          source: "hazemon",
          upstreamUrl,
          days,
          months,
          daily,
          monthly,
        });
      }
    }
  } catch (e) {
    console.error("PM2.5 history upstream failed:", e);
  }

  try {
    await dbConnect();

    const daily = await PmReading.aggregate([
      {
        $match: {
          timestamp: { $gte: startDaysEpoch },
          pm25: { $ne: null },
        },
      },
      {
        $addFields: {
          tsDate: { $toDate: { $multiply: ["$timestamp", 1000] } },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$tsDate",
              timezone: "Asia/Bangkok",
            },
          },
          avg: { $avg: "$pm25" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } }, // newest first
      { $limit: days },
      { $sort: { _id: 1 } }, // return oldest -> newest (nice for UI)
      {
        $project: {
          _id: 0,
          date: "$_id", // YYYY-MM-DD
          avg: { $round: ["$avg", 0] },
          count: 1,
        },
      },
    ]);

    const monthly = await PmReading.aggregate([
      {
        $match: {
          timestamp: { $gte: startMonthsEpoch },
          pm25: { $ne: null },
        },
      },
      {
        $addFields: {
          tsDate: { $toDate: { $multiply: ["$timestamp", 1000] } },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$tsDate",
              timezone: "Asia/Bangkok",
            },
          },
          avg: { $avg: "$pm25" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } }, // latest first
      { $limit: months },
      {
        $project: {
          _id: 0,
          key: "$_id", // YYYY-MM
          avg: { $round: ["$avg", 0] },
          count: 1,
        },
      },
    ]);

    return res.status(200).json({ success: true, days, months, daily, monthly });
  } catch (e) {
    console.error("PM2.5 history failed:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
}


