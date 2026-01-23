import dbConnect from "@/lib/dbConnect";
import PmReading from "@/models/PmReading";
import { parseHazemonSeries } from "@/lib/hazemon";
import { buildHazemonRangeUrl, getHazemonBaseUrl } from "@/lib/hazemonUrl";

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

function dateKeyFromDatetimeLocal(dtLocal) {
  // expects "YYYY-MM-DD HH:mm:ss" (UTC+7)
  if (typeof dtLocal !== "string") return null;
  const d = dtLocal.split(" ")[0];
  if (!d || d.length !== 10) return null;
  return d;
}

function isoDateBangkokFromEpoch(epochSeconds) {
  // Bangkok is UTC+7 (no DST). Shift to UTC then take ISO date.
  const shifted = (epochSeconds + 7 * 60 * 60) * 1000;
  return new Date(shifted).toISOString().slice(0, 10); // YYYY-MM-DD
}

function padDaily(dailyRows, days, nowEpoch) {
  const map = new Map();
  for (const r of Array.isArray(dailyRows) ? dailyRows : []) {
    if (r?.date) map.set(r.date, r);
  }

  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = isoDateBangkokFromEpoch(nowEpoch - i * 24 * 60 * 60);
    const existing = map.get(date);
    if (existing) out.push(existing);
    else out.push({ date, avg: null, count: 0 });
  }
  return out;
}

function bangkokMidnightEpochFromIso(isoDate) {
  // isoDate: YYYY-MM-DD (Bangkok)
  const [y, m, d] = String(isoDate)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return null;
  // Bangkok midnight = UTC - 7 hours
  return Math.floor(Date.UTC(y, m - 1, d, 0, 0, 0) / 1000) - 7 * 60 * 60;
}

async function fetchSeriesWithFallbackOrder({ baseUrl, fromEpoch, toEpoch, aggrMinutes }) {
  const url1 = buildHazemonRangeUrl({
    baseUrl,
    beforeEpoch: toEpoch,
    afterEpoch: fromEpoch,
    aggrMinutes,
    order: "before_after",
  });
  const url2 = buildHazemonRangeUrl({
    baseUrl,
    beforeEpoch: toEpoch,
    afterEpoch: fromEpoch,
    aggrMinutes,
    order: "after_before",
  });

  const r1 = await fetchJsonWithTimeout(url1, 8000);
  if (r1.ok) {
    const j1 = await r1.json();
    const s1 = parseHazemonSeries(j1, { fromEpoch }).filter(
      (p) => typeof p.timestamp === "number" && p.timestamp <= toEpoch
    );
    if (s1.length > 0) return { series: s1, urlUsed: url1 };
  }

  const r2 = await fetchJsonWithTimeout(url2, 8000);
  if (r2.ok) {
    const j2 = await r2.json();
    const s2 = parseHazemonSeries(j2, { fromEpoch }).filter(
      (p) => typeof p.timestamp === "number" && p.timestamp <= toEpoch
    );
    if (s2.length > 0) return { series: s2, urlUsed: url2 };
  }

  return { series: [], urlUsed: url2 };
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
    const baseUrl = getHazemonBaseUrl({ node: req.query.node });
    const aggrMinutes = req.query.aggr ?? process.env.HAZEMON_AGGR_MINUTES;

    // Hazemon may limit results for large ranges. For daily summary, fetch day-by-day (max 7 days)
    // to reliably include older days like 18–19 when a 7-day range returns only recent points.
    const dayWindows = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const iso = isoDateBangkokFromEpoch(nowEpoch - i * 24 * 60 * 60);
      const from = bangkokMidnightEpochFromIso(iso);
      if (from == null) continue;
      const to = Math.min(from + 24 * 60 * 60, nowEpoch);
      dayWindows.push({ iso, from, to });
    }

    const perDay = await Promise.all(
      dayWindows.map(async (w) => {
        const r = await fetchSeriesWithFallbackOrder({
          baseUrl,
          fromEpoch: w.from,
          toEpoch: w.to,
          aggrMinutes,
        });
        return { ...w, ...r };
      })
    );

    const dailyRaw = perDay
      .map((d) => {
        const nums = d.series
          .map((x) => x.pm25)
          .filter((v) => typeof v === "number" && Number.isFinite(v));
        if (nums.length === 0) return { date: d.iso, avg: null, count: 0 };
        const sum = nums.reduce((a, b) => a + b, 0);
        return { date: d.iso, avg: Math.round(sum / nums.length), count: nums.length };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const daily = padDaily(dailyRaw, days, nowEpoch);

    // Monthly: keep range bounded (sensor is new; we only need recent months anyway).
    const MAX_UPSTREAM_DAYS_FOR_MONTHLY = 120; // prevent huge upstream queries
    const monthlyFromEpoch = Math.max(startMonthsEpoch, nowEpoch - MAX_UPSTREAM_DAYS_FOR_MONTHLY * 24 * 60 * 60);
    const upstreamUrlMonthly = buildHazemonRangeUrl({
      baseUrl,
      beforeEpoch: nowEpoch,
      afterEpoch: monthlyFromEpoch,
      aggrMinutes,
    });

    let monthly = [];
    if (months > 0) {
      try {
        const rMonthly = await fetchJsonWithTimeout(upstreamUrlMonthly, 8000);
        if (rMonthly.ok) {
          const jsonMonthly = await rMonthly.json();
          const seriesForMonths = parseHazemonSeries(jsonMonthly, { fromEpoch: monthlyFromEpoch }).filter(
            (p) => typeof p.timestamp === "number" && p.timestamp <= nowEpoch
          );

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

          monthly = Array.from(monthlyMap.entries())
            .map(([key, v]) => ({ key, avg: Math.round(v.sum / v.count), count: v.count }))
            .sort((a, b) => b.key.localeCompare(a.key))
            .slice(0, months);
        }
      } catch (e) {
        console.error("PM2.5 history upstream monthly failed:", e);
      }
    }

    // Return debug URLs for day-by-day fetch if requested.
    const debug = String(req.query.debug || "") === "1";
    return res.status(200).json({
      success: true,
      source: "hazemon",
      days,
      months,
      daily,
      monthly,
      ...(debug
        ? {
            upstreamDailyRequests: perDay.map((d) => ({
              date: d.iso,
              urlUsed: d.urlUsed,
              count: d.series.length,
            })),
            upstreamUrlMonthly,
          }
        : { upstreamUrlMonthly }),
    });
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

    const dailyPadded = padDaily(daily, days, nowEpoch);
    return res.status(200).json({ success: true, days, months, daily: dailyPadded, monthly });
  } catch (e) {
    console.error("PM2.5 history failed:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
}


