# Marketing / การตลาด (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
แคมเปญ + เซกเมนต์ลูกค้า + บันทึกการส่ง (LINE/EMAIL/SMS). ผู้ใช้: เจ้าของ/การตลาด. **Layer 4: Advanced** (feature no.20) — scope=system (AppSystem type MARKETING).
โค้ด: `src/lib/modules/marketing/{service,actions,rules,ui}.ts` · schema `prisma/schema/marketing.prisma`.

## Data model (prisma/schema/marketing.prisma) — tenantId+systemId
- **MktCampaign** — `name` `channel`(LINE/EMAIL/SMS default LINE) `status`(DRAFT/SCHEDULED/SENT/CANCELLED) `message` `segmentJson`(เงื่อนไข tier/ยอดซื้อ/ไม่มาเกิน N วัน) `couponCode?` `scheduledAt?` `sentAt?` `audienceCount`. index `[systemId,status]`.
- **MktRecipient** — `campaignId` `customerId?` `contact`(เบอร์/อีเมล freeze ตอนส่ง) `sentAt?`. index `[campaignId]`.

## Service API (src/lib/modules/marketing/service.ts) — ctx {tenantId,systemId}
- `createCampaign(ctx, input)` — สร้างแคมเปญ DRAFT (+ segmentJson).
- `previewAudience(ctx, campaignId)` — {count} — คำนวณจำนวนผู้รับตาม segment (rules.matchesSegment ต่อ Customer).
- `sendCampaign(...)` — freeze รายชื่อ (MktRecipient), ตั้ง status SENT/sentAt, audienceCount. (ช่องส่งจริง LINE/Email = wiring ภายหลัง.)
- `listCampaigns(ctx, take=100)`.
- **rules.ts** (Fable): `matchesSegment(customer, seg, now)` — pure (ตัดสินว่าลูกค้าเข้า segment ไหม).

## การเชื่อมต่อ
- **Member (อ่าน segment)**: previewAudience/sendCampaign query Customer ตาม segmentJson.
- **Coupon**: couponCode แนบในแคมเปญ (แจกโค้ด).
- **Chat/Notify (ส่ง)**: ปลายทางส่งจริง (LINE/Email) — ผ่าน facade/wiring ภายหลัง.
- ไม่มี outbox event.

## Permissions (assertCan ใน actions.ts)
`marketing.campaign.create` · `marketing.campaign.send`.

## UI
- `/app/sys/[id]` (type=MARKETING, MarketingContent) — สร้างแคมเปญ/ดู audience/ส่ง.

## การทดสอบ
- `scripts/qc-marketing.mts` (Fable oracle) — แคมเปญ + เซกเมนต์ + audience (matchesSegment) ผ่าน service จริง; severity CRITICAL/MAJOR/MINOR.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- ช่องส่งจริง (LINE/Email/SMS) ยังไม่ต่อ provider → WO-0067 (LINE OA ลึก) · WO-0072 (Onboarding drip ผ่าน Automation).
- AI ออกแคมเปญผ่าน proposal: `marketing_create_campaign` เป็น ProposalKind แล้ว (WO-0045 ต่อยอด).
