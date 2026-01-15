import mongoose from "mongoose";

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

export default mongoose.models.PmReading || mongoose.model("PmReading", PmReadingSchema);


