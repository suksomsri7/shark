# fixtures ของจอเลขา AI (qc/shoot-sec.mjs)

ไฟล์ละ 1 ใบงาน: `s<ใบ>.json` (เช่น `s0.2.json`) · ข้อมูลจำลองล้วน — **ห้ามมีข้อมูลร้านจริง ชื่อ/เบอร์ลูกค้าจริง หรือสตริงคล้าย token/คีย์** (`sk-…`, `napi_…`, `Bearer …`, `eyJ…`) — ข้อสอบ X10 ตรวจ

## รูปแบบ
```jsonc
{
  "_about": "คำอธิบายสั้น",
  "screen": { … },            // ข้อมูลที่จอ placeholder import ตรง (เฉพาะใบที่จอยังไม่เรียก API · S0.2 = หน้า C3)
  "noAuth": ["/login"],        // route ที่เปิดแบบยังไม่ login (ไม่ตั้ง shark_token) · ปริยาย ["/login"]
  "expect": {                  // route → testID ที่ต้องเห็น (shoot-sec รอ + ตรวจ · qc-sec-ui U4 ใช้หา fixture ของ route)
    "/secretary": ["sec-home", "sec-input"]
  },
  "routes": ["/secretary/new"], // (ไม่บังคับ) route เพิ่มที่ fixture นี้รองรับแต่ไม่มี expect
  "tall": { "/secretary/_gallery": 2900 }, // (ไม่บังคับ) viewport สูงพิเศษ (กว้างคง 390)
  "endpoints": {               // mock ของ https://shark.in.th/* — คีย์ "<METHOD> <path>" หรือ "<path>" (ทุก method) → body JSON (ตอบ 200)
    "GET /api/mobile/me": { "user": { … }, "memberships": [ … ] },
    "POST /api/mobile/push/register": { "ok": true }
  }
}
```
- endpoint ที่ไม่มีใน `endpoints` ⇒ ตอบ 404 และถูกจดใน `unmocked[]` ของ `shots-sec/summary.json` (ข้อสอบ UI ต้องการ `unmocked: []`)
- path ไม่รวม query string · body เดียวต่อ path (ต้องการหลายสถานะ = แยกไฟล์ fixture)
- ทุกจอใน `(app)` ต้องมี `GET /api/mobile/me` ที่คืน membership ≥ 1 (ไม่งั้นยามหน้าประตูพาไป /dna)

## รัน
```bash
# จากรากรีโป · export web ในสำเนา /root/qc-shark-mobile-sec (งานหนัก → iso.sh)
bash scripts/iso.sh env QC_PREPARE=1 ROUTES=/secretary FIXTURE=apps/mobile/qc/fixtures/secretary/s0.2.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh c 4 apps/mobile/qc/shots-sec/secretary.png apps/mobile/qc/shots-sec/secretary-c3-pair.png
bash scripts/parity-sec.sh c 4 apps/mobile/qc/shots-sec/secretary-dark.png apps/mobile/qc/shots-sec/secretary-dark-c3-pair.png --dark
ROUTES=/secretary pnpm exec tsx scripts/qc-sec-ui.mts
```
ชื่อภาพคู่ต้องขึ้นต้นด้วยชื่อ route (`secretary-…pair.png` / `secretary-dark-…pair.png`) — ข้อสอบ UI (U6) หาไฟล์ตามนี้
