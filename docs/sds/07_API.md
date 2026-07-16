# 07 — Public API v1 (ออกแบบล่วงหน้า — สร้างจริงใน WO-0061)

- Base: `https://shark.in.th/api/v1` · Auth: `Authorization: Bearer <API key ต่อ tenant>` (เก็บ hash · สร้าง/หมุนได้ในหน้า settings/developers · สิทธิ์ตาม scope ที่เลือกตอนสร้าง key)
- Resources ชุดแรก (read ก่อน act): `GET /customers` `GET /sales` `GET /bookings` `GET /inventory/items` `POST /bookings` `POST /customers`
- กติกา: rate limit ต่อ key · ทุก response มี `requestId` · pagination cursor · เงินเป็นสตางค์ + field `display` · error รูปแบบเดียว `{error: {code, message_th, message_en}}`
- Webhooks ขาออก (WO-0062): สมัคร URL ต่อ event จาก outbox types · ลายเซ็น HMAC-SHA256 header `X-Shark-Signature` · retry backoff 3 ครั้ง
- เอกสาร: หน้า `/developers` สร้างจาก spec เดียวกัน (single source)
