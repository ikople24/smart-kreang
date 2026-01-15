/**
 * Standalone PM2.5 collector (Railway Cron Service friendly)
 *
 * - Fetches Hazemon JSON
 * - Parses latest reading
 * - Upserts into MongoDB (collection: pmreadings)
 *
 * Required env:
 * - MONGO_URI
 *
 * Optional env:
 * - HAZEMON_URL (default: TH-PKN-HuaHin-5132)
 */

const mongoose = require("mongoose");

const HAZEMON_URL =
  process.env.HAZEMON_URL ||
  "https://hazemon.in.th/api/time_aggr/hazemon/TH-PKN-HuaHin-5132";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing env MONGO_URI");
  process.exit(1);
}

function parseHazemonLatest(json) {
  const timeAggr = (json && json.time_aggr) || {};
  const nodeIdKey = Object.keys(timeAggr)[0];
  const byTimestamp = nodeIdKey ? timeAggr[nodeIdKey] : null;
  if (!nodeIdKey || !byTimestamp) return null;

  const timestamps = Object.keys(byTimestamp)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  if (timestamps.length === 0) return null;

  const latestTs = Math.max(...timestamps);
  const latest = byTimestamp[String(latestTs)] || null;
  if (!latest) return null;

  const dtLocalArr = latest["datetime(UTC+7)"];
  const dtLocal = Array.isArray(dtLocalArr) ? dtLocalArr[0] : null;

  const pm25 = Number(latest["PM2.5"]);
  const pm10 = Number(latest["PM10"]);
  const pm1 = Number(latest["PM1.0"]);

  return {
    node_id: latest.node_id != null ? Number(latest.node_id) : Number(nodeIdKey),
    node_name: latest.node_name || null,
    timestamp: latestTs,
    datetime_local: dtLocal,
    pm25: Number.isFinite(pm25) ? pm25 : null,
    pm10: Number.isFinite(pm10) ? pm10 : null,
    pm1: Number.isFinite(pm1) ? pm1 : null,
    raw: latest,
  };
}

const PmReadingSchema = new mongoose.Schema(
  {
    node_id: { type: Number, required: true, index: true },
    node_name: { type: String },
    timestamp: { type: Number, required: true, index: true }, // epoch seconds
    datetime_local: { type: String },
    pm25: { type: Number },
    pm10: { type: Number },
    pm1: { type: Number },
    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);
PmReadingSchema.index({ node_id: 1, timestamp: 1 }, { unique: true });

const PmReading =
  mongoose.models.PmReading || mongoose.model("PmReading", PmReadingSchema);

async function main() {
  const r = await fetch(HAZEMON_URL, { headers: { accept: "application/json" } });
  if (!r.ok) {
    throw new Error(`Upstream error ${r.status}`);
  }
  const json = await r.json();
  const latest = parseHazemonLatest(json);
  if (!latest) {
    throw new Error("No data");
  }

  await mongoose.connect(MONGO_URI, { bufferCommands: false });

  await PmReading.updateOne(
    { node_id: latest.node_id, timestamp: latest.timestamp },
    { $setOnInsert: latest },
    { upsert: true }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        node_id: latest.node_id,
        timestamp: latest.timestamp,
        pm25: latest.pm25,
        datetime_local: latest.datetime_local,
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


