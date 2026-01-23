This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## PM2.5 (Hazemon) + เก็บย้อนหลังใน MongoDB

โปรเจ็กนี้มี widget PM2.5 realtime บนหน้าแรก โดยดึงข้อมูลจาก Hazemon ผ่าน API ของโปรเจ็กนี้ (กัน CORS + ทำ fallback ได้)

### API ที่เกี่ยวข้อง

- `GET /api/pm25/latest`
  - ดึงค่าล่าสุดจาก Hazemon (ถ้าดึงไม่ได้จะ fallback ไปอ่านค่าล่าสุดจาก MongoDB)
- `GET /api/pm25/upstream`
  - proxy เรียก Hazemon upstream แบบ raw (กัน CORS)
  - ถ้าต้องการ “ช่วงเวลา” ให้ส่ง `?from=<epoch_seconds>&to=<epoch_seconds>` แล้วระบบจะเรียก `<base>/<before>/<after>` (ก่อน=to, หลัง=from)
  - ถ้า upstream ของคุณต้องมีท้าย `/1440` ให้ส่ง `?aggr=1440` (หรือใช้ env `HAZEMON_AGGR_MINUTES=1440`)
- `GET /api/pm25/timeseries`
  - คืนค่าเป็นชุดข้อมูลพร้อมทำกราฟ (chart-friendly)
  - ใช้ `?hours=<1..72>` (default 24) หรือระบุ `?from=<epoch>&to=<epoch>`
  - ปรับความถี่ด้วย `?step=<seconds>` (default 900 = 15 นาที), จำกัดจำนวนจุดด้วย `?limit=<n>`
- `GET /api/pm25/history`
  - **ดึงจาก Hazemon upstream ก่อน** แล้วค่อย fallback ไป DB (ถ้า upstream ใช้ไม่ได้)
  - เหมาะกับกรณีมีข้อมูลเซนเซอร์เพิ่งเริ่ม (เช่นมีแค่ 3 วัน) และยังไม่อยากตั้ง cron เก็บลง DB
- `POST /api/pm25/collect`
  - ดึงค่าล่าสุดจาก Hazemon แล้ว `upsert` ลง MongoDB
  - ต้องส่ง secret เพื่อความปลอดภัย (เหมาะสำหรับ Railway Cron)

### Environment Variables

- `MONGO_URI`: MongoDB connection string
- `CRON_SECRET`: secret สำหรับเรียก `/api/pm25/collect`
- `HAZEMON_URL` (optional): ใช้แบบเดิม (ใส่ URL เต็มของ Hazemon upstream) เช่น `https://hazemon.in.th/api/time_aggr/hazemon/<node-slug>`
- `HAZEMON_NODE_ID` (optional): ใช้แบบใหม่ (ใส่ node id/slug) เช่น `TH-CRI-เทศบาลท่าสุด-5092` แล้วระบบจะประกอบเป็น `https://hazemon.in.th/api/time_aggr/hazemon/<nodeid>`
- `HAZEMON_API_ROOT` (optional): เปลี่ยน root ของ API (default: `https://hazemon.in.th/api/time_aggr/hazemon`)
- `HAZEMON_AGGR_MINUTES` (optional): ถ้า upstream ต้องการ suffix เช่น `/1440` ให้ตั้งเป็น `1440`

### ตั้งค่า Railway Cron (ทุก 10 นาที)

1) ตั้งค่า env `CRON_SECRET` ใน Railway ให้เป็นค่าที่ยากต่อการเดา

2) สร้าง Cron Job ให้เรียก:

- Method: `POST` (หรือ `GET` ก็ได้)
- URL: `https://<your-railway-domain>/api/pm25/collect?secret=<CRON_SECRET>`
- Schedule: ทุก 10 นาที

หมายเหตุ: endpoint นี้มี unique index (`node_id + timestamp`) กันการบันทึกซ้ำ หาก cron ยิงซ้ำก็จะไม่สร้างข้อมูลใหม่

### Railway แบบไม่ต้องให้เว็บ service รีสตาร์ทตามเวลา (แนะนำ)

ถ้าคุณไม่อยากใช้ `Cron Schedule` ของ service (ซึ่งจะ “รัน/รีสตาร์ท” service ตามเวลา)
ให้สร้าง **Cron service แยก** ที่รันสคริปต์เก็บข้อมูลแทน (เว็บหลักจะไม่ถูกแตะ)

1) สร้าง service ใหม่ใน Railway จาก repo เดิม (แยกจาก web service)
2) ตั้งค่า start command เป็น:

- `npm run pm25:collect`

3) ตั้ง Cron Schedule ของ service ใหม่นี้เป็น:

- `*/10 * * * *`

4) ให้ service ใหม่นี้มี env อย่างน้อย:

- `MONGO_URI`
- (optional) `HAZEMON_URL`

สคริปต์จะ fetch Hazemon แล้ว upsert ลง MongoDB ใน collection `pmreadings` ทุกครั้งที่รัน

### เช็คใน MongoDB ต้องดู collection ชื่ออะไร?

Mongoose จะสร้าง collection ชื่อ **`pmreadings`** (ตัวเล็ก + plural) โดยอัตโนมัติ

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
