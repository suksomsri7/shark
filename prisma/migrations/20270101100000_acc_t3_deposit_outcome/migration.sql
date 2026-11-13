-- ACC T3 (Job A2) — ผลการคืน/ริบของใบรับ/จ่ายมัดจำ (ค่าที่คำนวณจากใบลดหนี้/JV · deposit-outcome-db.ts) — additive · nullable
ALTER TABLE "AccountDocument" ADD COLUMN "depositOutcome" JSONB;
