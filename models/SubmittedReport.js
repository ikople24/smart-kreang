import mongoose from 'mongoose';

const SubmittedReportSchema = new mongoose.Schema({
  prefix: String,
  fullName: String,
  phone: String,
  community: String,
  problems: [String],
  category: String,
  images: [String],
  detail: String,
  location: {
    lat: Number,
    lng: Number,
  },
  complaintId: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'อยู่ระหว่างดำเนินการ',
  },
  officer: {
    type: String,
    default: 'on',
  },
}, {
  timestamps: true // ✅ ให้ mongoose จัดการ createdAt และ updatedAt อัตโนมัติ
});

export default mongoose.models.SubmittedReport || mongoose.model('SubmittedReport', SubmittedReportSchema);