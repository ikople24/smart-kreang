import dbConnect from "@/lib/dbConnect";
import PmReading from "@/models/PmReading";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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


