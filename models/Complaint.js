import mongoose from 'mongoose';

const ComplaintSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String },
  community: { type: String },
  problems: { type: [String], default: [] },
  category: { type: String },
  images: { type: [String], default: [] },
  detail: { type: String },
  location: {
    lat: { type: Number },
    lng: { type: Number }
  },
  complaintId: { type: String },
  status: { 
    type: String,
    default: 'อยู่ระหว่างดำเนินการ'
  },
  officer: { type: String },
}, {
  collection: 'submittedreports', // ให้ตรงกับชื่อ collection ใน Compass
  timestamps: true // เพื่อให้ mongoose จัดการ createdAt / updatedAt ให้อัตโนมัติ
});

export default mongoose.models.Complaint || mongoose.model('Complaint', ComplaintSchema);