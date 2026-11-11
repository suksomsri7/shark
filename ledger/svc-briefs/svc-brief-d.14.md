# ใบสั่ง D.14 — AI อ่านเลขมิเตอร์จากรูป (ระบบเสนอ · คนยืนยัน) · ตรวจ **เบา (รอบเดียว)** — แต่ "ห้ามตัด": X1 ข้ามร้าน/ข้ามหน่วย/ข้ามอาคาร ⇒ ไม่พบเดียวกัน · ค่า AI ถูกต้องไม่หักซ้ำ · ไม่หักร้านอื่น · UI ตรงแบบ

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` **D.14** ("AI อ่านเลขมิเตอร์จากรูป (เสนอ คนยืนยัน · ใช้ provider AI เดิมของระบบ · คิดค่าตามเครดิต AI เดิม) · ไม่มี AI/ล้ม ⇒ พิมพ์เอง" · ข้อสอบ: "ค่า AI ไม่ถูกบันทึกจนคนยืนยัน · รูปไม่ออกนอก provider ที่อนุญาต (X8) · ตัวจำลอง provider") · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §1 ข้อ 12 "AI เสนอ คนยืนยัน" · **A3** ("ถ่ายรูป → AI อ่านเลขให้ (เสนอ คนยืนยัน) · พิมพ์เองได้ · ออฟไลน์แล้วส่งทีหลัง") · ตารางเสี่ยง ("AI อ่านมิเตอร์ผิด ⇒ เป็นข้อเสนอเสมอ คนยืนยัน · รูปแนบบิล · ค่าผิดปกติกันบิล") · ภาคผนวก ก หอ **#18** (`rooms.meter.aiRead` เปิด · `rooms.meter.requirePhoto` บังคับรูปไฟ) · ภาพ `ledger/design-dorm/03-meter-mobile.png` แผง (ข) "ห้อง 204 — ถ่ายรูป ระบบอ่านเลข คนยืนยัน" ("ไฟฟ้า อ่านจากรูป · ตรวจแล้ว 1,287 → 1,412" · "น้ำประปา พิมพ์เอง 0312 → 0318")
> ใบก่อนที่ต้องอ่าน (โค้ดชนะเอกสาร): `svc-brief-d.6.md` §2–§7 (`submitReadings` = ทางเดียวที่เขียนแถว PERIOD · idempotent ต่อ มิเตอร์×งวด · ป้าย 4 แบบ + พักบิล · `confirmReading` · คิวออฟไลน์ · DOM ของ `MeterWalk`) · `svc-brief-d.4.md` §3.2 + `src/lib/modules/dorm/import-ai.ts` (ตัวต่อ AI เสียบได้ · ไม่มี provider ⇒ `null` · ล้ม ⇒ ทางสำรองไม่ throw · ไม่ส่ง PII) · `svc-brief-d.13.md` §3 (`dormScopeFor`/`dormLiveMember` · fail closed) · `src/lib/modules/dorm/portal.ts` `dormStaffGate` · โค้ด AI เดิม `src/lib/ai/provider.ts` (`resolveProvider` · `AiChatMessage.imageUrls` = vision) + `src/lib/ai/credit.ts` (`canSpend` · `canSpendPeek` · `chargeUsage` · `AiCreditTxn @@unique([tenantId, ref])`) + `src/lib/ai/pricing.ts` (`costMicroUsd`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.14.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `V-1` (ไม่มี QC_BASE) · `Q-*` (svcqc ยังไม่มีฉาก D.6) · `S-1` (หลัง merge) — ผู้คุมรันซ้ำครบก่อนรับ
> รัน: `cd /root/projects/shark-svc-l4 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.14.mts [--no-regression]` (ห้ามครอบ `timeout` · ห้าม kill กลางคัน — ล้างข้อมูลใน `finally`) · ข้อสอบ **ไม่เรียก AI จริง**: ตั้ง `SHARK_AI_KEY` ปลอมในโพรเซสตัวเอง · ครอบ `fetch` (openrouter.ai = ตัวจำลองในโพรเซส · ปลายทางอื่นนอกเครื่อง = บล็อก)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma generate`/migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-meter-ai-scene.mts»** · temp ขึ้นต้น `svc-d14-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.14` (`SQC_DORM_METER_AI_SCENE` · `sqcMeterAiPhoto` · `SQC_VISUAL_SPECS["d.14"]`)
> **ไม่มี migration** — คอลัมน์มีแล้วจาก D.0: `DormMeterReading.aiValue` ("ค่าที่ AI เสนอ (D.14)") · `source` CHECK `('MANUAL','AI','IOT','IMPORT')` · `photoFileId` · ค่าตั้ง `rooms.meter.aiRead` (bool · ค่าเริ่ม true · ชั้น UNIT · ป้ายไทย) มีแล้วจาก D.1 · `kind` CHECK ไม่มีชนิด "ข้อเสนอ" ⇒ **ข้อเสนอห้ามเป็นแถว `DormMeterReading`** (§2 ข้อ 3)

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ `src/` `prisma/` `public/` ตอนรับใบ)

| ไฟล์ | | ทำอะไร |
|---|---|---|
| «src/lib/modules/dorm/meter-ai.ts» | ใหม่ (server) | §3 ทั้งหมด: ตัวต่อ `MeterPhotoReader` + `defaultMeterReader` · `proposeMeterReading` · `meterProposals` · `meterAiStatus` — ผ่าน `tenantDb` (**ห้าม `import { prisma }`** · F5.1) · provider ผ่าน `resolveProvider` เท่านั้น (ห้าม `fetch` เอง) · เครดิตผ่าน `@/lib/ai/credit` เท่านั้น |
| `src/lib/modules/dorm/meter.ts` | แก้ (บล็อก `// SVC D.14 ▸ … ◂` แบบ D.4) | `SubmitItem` + `aiProposalId?` `ackLowConfidence?` (§4) · `previewReading` (§3.5 — ใช้ตัวตรวจป้ายเดิม `evaluateValue`) · ห้ามเปลี่ยนพฤติกรรม D.6 เมื่อไม่ส่งฟิลด์ใหม่ (ยกเว้น §4 ข้อ 6) |
| `src/lib/modules/dorm/meter-queue.ts` | แก้ (เพิ่มอย่างเดียว) | `QueuedReading` + `aiProposalId?: string \| null` `ackLowConfidence?: boolean` (§5.3) · ยัง **pure** |
| `src/lib/modules/dorm/index.ts` | แก้ (บล็อกต่อท้าย `// SVC D.14`) | export ชื่อใน §3 + type `MeterPhotoReader` `MeterProposal` `MeterAiManualReason` |
| `src/components/dorm/MeterWalk.tsx` | แก้ | §5.1 (ไม่ส่ง `ai` ⇒ หน้าตา/DOM เท่า D.6 ทุกตัวอักษร) |
| `src/app/app/u/[unitSlug]/dorm/meter/page.tsx` | แก้ | §5.2 |
| `src/app/app/u/[unitSlug]/dorm/meter/actions.ts` | แก้ | `proposeMeterReadingAction` + ส่งต่อ 2 ฟิลด์ใหม่ใน `submitMeterReadingsAction` (§5.2) |
| `src/lib/core/settings/defs/rooms.ts` | แก้ (เพิ่ม def เดียว ต่อจาก `rooms.meter.requirePhoto` · คอมเมนต์ `// SVC D.14`) | `rooms.meter.aiMinConfidence` (§2 ข้อ 7) — ห้ามแตะ def อื่น |
| `src/lib/ai/credit.ts` | แก้ (เพิ่มอย่างเดียว · มติ **R1**) | `ChargeInput.ref?: string` → เขียนลง `AiCreditTxn.ref` · `P2002` บน `(tenantId, ref)` ⇒ คืน `0` ไม่ throw (ทรานแซกชันย้อน ⇒ กระเป๋าไม่ถูกหักซ้ำ) · ไม่ส่ง ref = เดิมทุกอย่าง |
| «scripts/svc-qc-meter-ai-scene.mts» | ใหม่ | ฉาก §7 |

ห้าม: migration · enum `AiCreditSource` ใหม่ (ต้อง migration — มติ **R2**) · event outbox ใหม่ (ข้อเสนอไม่ใช่เหตุการณ์ธุรกิจ) · สิทธิ์ใหม่ (ใช้ `dorm.meter.read` เดิม) · แตะ `provider.ts`/`pricing.ts`/ไฟล์ AI อื่น · แตะ `import-ai.ts` (D.4) · บังคับรูป `rooms.meter.requirePhoto` ฝั่ง server (มติ **R4** — เลื่อน) · `any` · `getDay()` ดิบ · log รูป/base64

## 2. มติ (ข้อสอบผูก)
1. **เสนอ ≠ บันทึก**: `proposeMeterReading` ไม่เขียน `DormMeterReading` · ไม่ยิง outbox · ไม่แตะแถวเดิม — **ทางเดียวที่ค่าเข้าแถว = คนกด "บันทึก" ⇒ `submitReadings` (+`aiProposalId`)** · จอห้ามส่งเอง (ไม่มี auto-submit หลังอ่านรูป)
2. **หน่วยของ "ครั้ง"** = กุญแจ `K = (หน่วย, มิเตอร์, งวด, sha256(ไบต์รูป))` — รูปเดิมซ้ำ (กดซ้ำ/เน็ตหลุดแล้วส่งใหม่/พร้อมกัน N ทาง/หลายโพรเซส) = **ข้อเสนอเดียว · เรียกตัวอ่าน ≤ 1 ครั้งที่สำเร็จ · หักเงิน ≤ 1 ครั้ง · FileAsset 1 ไฟล์** · ถ่ายรูปใหม่ = ครั้งใหม่ (หักใหม่)
3. **ที่เก็บข้อเสนอ** (ไม่มี migration): แนะนำ `AuditLog` action `dorm.meter.ai.proposed` (`targetType "DormMeter"` · `targetId` = meterId · `after` = `{ periodKey, photoSha, fileId, source, manualReason, value, confidence, model, tokensIn, tokensOut, ref }` — **ไม่มีรูป/base64/ชื่อ/เบอร์**) · `proposalId` = id ของแถว (ทึบ · ข้อสอบไม่ผูกรูปแบบ) · จะเก็บแบบอื่นได้ถ้าไม่ต้อง migration และผ่านข้อสอบ
4. **กันซ้ำพร้อมกัน**: ล็อก `pg_advisory_xact_lock(hashtextextended('dorm.meter.ai:'||K, 0))` ใน tx ของ `tenantDb` (timeout ≥ ตัวอ่าน + 5 วิ) → ใต้ล็อก: หาข้อเสนอของ K → มีผล AI แล้ว ⇒ คืน `cached:true` (ไม่เรียกตัวอ่าน ไม่หัก) → ยังไม่มี ⇒ เรียกตัวอ่าน → บันทึกข้อเสนอ · **อัปรูปก่อนเปิดล็อก** (บทเรียน D.5 K5 — งานช้า/connection อื่นอยู่นอก tx) แล้วใต้ล็อกถ้า K มีไฟล์อยู่แล้ว ⇒ ลบ FileAsset ของตัวเองทิ้ง best-effort (แถวไฟล์สุทธิ +1) · หักเงินด้วย `ref` (ข้อ 5) เป็นกันชั้นสุดท้ายระดับฐาน
5. **คิดเงิน** (มติ **R1/R2**): ก่อนเรียก `canSpend(tenantId)` (false ⇒ `NO_CREDIT` ไม่เรียกตัวอ่าน) · ตัวอ่าน**ตอบกลับสำเร็จ** (แม้อ่านเลขไม่ออก) ⇒ `chargeUsage({ tenantId }, { source: "CHAT", model, tokensIn, tokensOut, userId: actorUserId, note: "dorm.meter.readPhoto", ref })` · `ref = "dorm.meter.ai:<meterId>:<periodKey>:<sha256 hex 64 ตัว>"` (ไม่มี PII) · ตัวอ่าน throw/หมดเวลา ⇒ **ไม่หัก** · หักล้ม (throw) ⇒ logOps แล้วไปต่อ (`charged:false`) — ครั้งถัดไปของ K ที่ได้ cached ให้ลองหักซ้ำด้วย ref เดิม (ref กันซ้ำให้) · หักเฉพาะ `ctx.tenantId` ที่ผ่านด่าน §3.0 เท่านั้น (ร้านอื่น ⇒ ไม่พบ ก่อนแตะเครดิตใด ๆ)
6. **ต้องยืนยันชัด** เมื่อ (ก) ความมั่นใจต่ำ: `confidence × 100 < rooms.meter.aiMinConfidence` (เท่ากับ = ไม่ต่ำ) ⇒ บันทึกค่าเท่าที่ AI เสนอต้องส่ง `ackLowConfidence: true` ไม่งั้น `REJECTED AI_NEEDS_CONFIRM` · (ข) ค่าไม่สมเหตุผล (เลขถอยหลัง / สูง-ต่ำผิดปกติเทียบเฉลี่ย 3 เดือน / ห้องว่างใช้เกิน) = **ตัวตรวจ D.6 เดิม** — ข้อเสนอโชว์ `flag` ล่วงหน้า · พอบันทึกแล้วแถวติดป้าย+พักบิลตาม D.6 และต้อง `confirmReading` (เลขถอยหลัง ⇒ `BACKWARDS_NEEDS_REPLACE` เหมือนเดิม) — ห้ามมีตัวตรวจชุดที่สอง
7. **ค่าตั้ง** (ทะเบียน · ชั้น UNIT): `rooms.meter.aiRead` (มีแล้ว · ห้ามแก้) ปิดระดับหน่วย ⇒ ไม่เรียกตัวอ่าน (`AI_OFF`) · ใหม่ `rooms.meter.aiMinConfidence`: `type "int"` · `labelTh "ความมั่นใจขั้นต่ำของระบบอ่านเลขมิเตอร์ (%)"` · `helpTh` "ต่ำกว่านี้ต้องกดยืนยันว่าตรวจกับรูปแล้ว" · `schema z.number().int().min(50).max(99)` · `defaults { _fallback: 80 }` · `chain U` · สิทธิ์แก้/รูปแบบอื่นตาม `rooms.meter.aiRead` ทุกอย่าง · อ่านด้วย `resolveSetting(s)` ทุกครั้ง (ห้ามฝัง 80)
8. **PDPA / X8**: ตัวอ่านได้แค่ `{ image, kind, digits }` — ไม่มี tenantId/unitId/meterId/เลขห้อง/ชื่อหอ/ชื่อผู้เช่า/เบอร์/serial · `defaultMeterReader` ส่ง **รูปเดียว** (ไบต์ตามที่ผู้ใช้ส่ง = รูปที่ตัดมาแล้วจากจอ) เป็น data URL ไปที่ provider ของระบบ (`resolveProvider("smart")` — OpenRouter) ที่เดียว · ข้อความประกอบมีแค่ชนิดมิเตอร์ (ไฟ/น้ำ) + จำนวนหลัก · ไม่เก็บรูป/base64 ใน AuditLog/outbox/log
9. **ไฟล์ (X10)**: รูปเป็น FileAsset `kind "ATTACHMENT"` `visibility "private"` ผ่าน `uploadFile(…, deps.put ? { put } : undefined)` · รับเฉพาะ JPEG/PNG/WebP ที่ magic ตรงชนิด · 1 ไบต์–5 MB · อื่น ๆ (SVG/HEIC/ปลอมชนิด/ว่าง/ใหญ่) ⇒ `INVALID_FILE` ก่อนอัป/ก่อนเรียกตัวอ่าน/ก่อนหักเงิน (HEIC ยังจดมือ+แนบผ่านทาง D.6 ได้ตามเดิม)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก) — ออกทาง `@/lib/modules/dorm`
```ts
type Fail = { ok: false; code: string; reason: string };         // reason ไทยไม่ว่าง · ห้าม throw
export type MeterAiManualReason = "AI_OFF" | "NO_PROVIDER" | "NO_CREDIT" | "AI_FAILED" | "UNREADABLE";
export type MeterPhotoReader = {
  read(input: { image: { data: Uint8Array; contentType: string }; kind: "ELEC" | "WATER"; digits: number | null }, opts?: { signal?: AbortSignal })
    : Promise<{ value: number | null; confidence: number; model: string; tokensIn: number; tokensOut: number }>;
};
export type MeterProposal = {
  proposalId: string; meterId: string; periodKey: string;
  source: "AI" | "MANUAL"; manualReason: MeterAiManualReason | null;     // AI ⇒ null
  value: number | null; confidence: number | null;                       // MANUAL ⇒ null ทั้งคู่ · confidence 0..1
  prevValue: number | null; units: number | null; flag: MeterFlag | null; // ตัวอย่างล่วงหน้าตามกติกา D.6 (MANUAL ⇒ units/flag null · prevValue ยังมี)
  lowConfidence: boolean; needsConfirm: boolean;                          // needsConfirm = source AI && (lowConfidence || flag !== null)
  createdAt: string;                                                      // ISO
};
```

### 3.0 ด่าน (ทุกฟังก์ชันใน §3.1–3.3) — **ไม่พบเดียวกันทุกกรณี (X1)**
- `ctx.actorUserId` ต้องมี · `dormStaffGate(ctx, unitId, "dorm.meter.read")` ผ่าน (Membership สดของร้าน · หน่วย DORM ACTIVE ของร้าน · มีสิทธิ์จดมิเตอร์ของหน่วย) · มิเตอร์ active/ถอดแล้วของหน่วยนี้ · **ขอบเขตอาคาร** `dormScopeFor` (D.13): ถูกจำกัด ⇒ อาคารของห้องของมิเตอร์ (ROOM) / `buildingId` ของมิเตอร์ (MAIN) ต้องอยู่ในรายการ (ไม่มีอาคาร ⇒ ซ่อน)
- ไม่ผ่านข้อใด ⇒ `{ ok:false, code:"NOT_FOUND", reason:<ข้อความเดียวกันทุกกรณี> }` (deep-equal · ข้อสอบเทียบ 8 กรณี: ร้านอื่น · หน่วยไม่มีสิทธิ์ · หน่วยโรงแรม · มิเตอร์ไม่มีจริง · มิเตอร์ของหน่วยอื่น · นอกอาคาร · ผู้ใช้ไม่มี `dorm.meter.read` · ไม่มี actorUserId) — ไม่มีการเรียกตัวอ่าน/อัปไฟล์/แตะเครดิต/เขียนใด ๆ · อ่าน (`meterProposals`) ⇒ `[]`

### 3.1 `proposeMeterReading` (ถ่ายรูป ⇒ ข้อเสนอ)
```ts
proposeMeterReading(ctx: MeterCtx, input: { unitId: string; meterId: string; periodKey: string; photo: { data: Uint8Array; contentType: string } },
  deps?: { reader?: MeterPhotoReader | null; put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; now?: Date; timeoutMs?: number })
  → Promise<({ ok: true; cached: boolean; charged: boolean } & MeterProposal) | Fail>
```
ลำดับตายตัว: ด่าน §3.0 ⇒ `NOT_FOUND` → `periodKey` ผิดรูป ⇒ `INVALID_INPUT` → มิเตอร์ถูกถอด ⇒ `METER_REMOVED` → แถวงวดนี้ยืนยันแล้ว (`confirmedAt`) ⇒ `LOCKED` (ไม่เปลืองเงิน) → รูป §2 ข้อ 9 ⇒ `INVALID_FILE` → อัปรูป (ล้ม ⇒ `UPLOAD_FAILED` · ไม่เรียกตัวอ่าน) → ล็อก K (§2 ข้อ 4) → มีผล AI ของ K แล้ว ⇒ คืนเดิม `cached:true charged:false` → `rooms.meter.aiRead` ของหน่วย = false ⇒ `AI_OFF` → ตัวอ่าน = `deps.reader` (ส่ง `null` = ไม่มี AI · ไม่ส่ง = `defaultMeterReader(ctx)`) เป็น null ⇒ `NO_PROVIDER` → `canSpend` false ⇒ `NO_CREDIT` → เรียกตัวอ่าน**ครั้งเดียว** (หมดเวลา `deps.timeoutMs ?? 15000` ⇒ ยกเลิกด้วย signal · ผลที่มาช้า **ไม่ใช้ ไม่หัก**) — throw/หมดเวลา ⇒ `AI_FAILED` · สำเร็จ ⇒ หักเงิน §2 ข้อ 5 → ตรวจค่า: จำนวนเต็ม `0 ≤ value ≤ 10^digits − 1` (digits null ⇒ ≤ 999,999,999,999) ไม่งั้น `UNREADABLE` (value null) · confidence ไม่ใช่ตัวเลขใน [0,1] ⇒ 0 → ตัวอย่างล่วงหน้า (`previewReading` กติกาเดียวกับ D.6 ณ `deps.now`) → บันทึกข้อเสนอ
- ข้อเสนอ `MANUAL` (AI_OFF/NO_PROVIDER/NO_CREDIT/AI_FAILED/UNREADABLE) **ยังคืน `ok:true` + `proposalId`** (รูปเก็บไว้แนบตอนพิมพ์เอง = "ไม่มี AI/ล้ม ⇒ พิมพ์เอง" ทางเดียวกัน) · รูปเดิมซ้ำหลัง `AI_OFF/NO_PROVIDER/NO_CREDIT/AI_FAILED` ⇒ ใช้ `proposalId`+ไฟล์เดิม แล้วลองอ่านใหม่ตามค่าตั้งปัจจุบัน · หลัง `UNREADABLE` (เรียกสำเร็จ = จ่ายแล้ว) ⇒ cached (ไม่เรียกซ้ำ ไม่หักซ้ำ)
- `charged` = หักเงินสำเร็จในการเรียกครั้งนี้ · `cached` = ได้ผล AI ที่มีอยู่แล้วของ K

### 3.2 `meterProposals` (จอโหลดข้อเสนอค้าง — รีเฟรชหน้าแล้วไม่หาย)
```ts
meterProposals(ctx: MeterCtx, input: { unitId: string; periodKey: string }) → Promise<MeterProposal[]>
```
- ข้อเสนอ**ล่าสุดต่อมิเตอร์** ของงวดนั้น เฉพาะมิเตอร์ที่ **ยังไม่มีแถว PERIOD** ของงวด · ตามด่าน §3.0 (นอกอาคาร = ไม่เห็น · ร้านอื่น/ไม่มีสิทธิ์ ⇒ `[]`) · อ่านอย่างเดียว

### 3.3 `meterAiStatus` (สถานะปุ่ม — อ่านอย่างเดียว)
```ts
meterAiStatus(ctx: MeterCtx, input: { unitId: string }) → Promise<{ enabled: boolean; available: boolean; minConfidence: number }>
```
- `enabled` = `rooms.meter.aiRead` ของหน่วย · `available` = enabled && `resolveProvider("smart") !== null` && `canSpendPeek(tenantId)` · `minConfidence` = ค่าตั้งของหน่วย · หน่วยไม่ใช่ DORM ของร้าน ⇒ `{ enabled:false, available:false, minConfidence:<ค่าระดับร้าน/ค่าเริ่มของทะเบียน> }` (อ่านจากทะเบียน · ห้ามฝังเลข — ข้อสอบ S-6 ไล่ `?? 80`)
- 🔴 **ห้ามเขียน** (ห้าม `canSpend`/`ensureWallet` — เปิดหน้าจอแล้วร้านที่ไม่เคยใช้ AI ถูกเปิดกระเป๋า+แถว GRANT เงียบ ๆ = บั๊กที่ `canSpendPeek` เขียนไว้)

### 3.4 `defaultMeterReader` (ตัวต่อจริง · แบบ `defaultColumnGuesser` แต่ **ไม่หักเงินเอง**)
```ts
defaultMeterReader(ctx: { tenantId: string }): MeterPhotoReader | null | Promise<MeterPhotoReader | null>   // resolveProvider("smart") null ⇒ null (sync หรือ async ก็ได้ · ข้อสอบ await)
```
- `read` = `provider.chat([{ role:"system", content:<คำสั่ง> }, { role:"user", content:<ชนิด+จำนวนหลักเท่านั้น>, imageUrls:[`data:<contentType>;base64,<ไบต์รูป>`] }], { maxTokens: ≤ 300 })` ครั้งเดียว · ขอคำตอบ JSON `{"value": <จำนวนเต็มหรือ null>, "confidence": <0..1>}` · อ่านแบบผ่อนปรน (`{` ตัวแรก ถึง `}` ตัวสุดท้าย · พังเป็น `{ value:null, confidence:0 }`) · คืน `model/tokensIn/tokensOut` จาก `AiReply` · provider throw ⇒ throw ต่อ (ผู้เรียกแปลงเป็น `AI_FAILED`) · ไม่เรียก `canSpend`/`charge*` (ผู้เรียกทำ — กันหักสองชั้น)

### 3.5 `previewReading` (ใน meter.ts · ใช้ `evaluateValue` เดิม)
```ts
previewReading(ctx: MeterCtx, input: { unitId: string; meterId: string; periodKey: string; value: number; readAt?: string })
  → Promise<{ ok: true; prevValue: number | null; units: number | null; flag: MeterFlag | null } | Fail>
```
- ผลต้องเท่ากับที่ `submitReadings` จะได้ถ้าส่งค่านี้ (ไม่เขียนอะไร) · ขอบเขตร้าน/หน่วยแบบ D.6 (`NOT_FOUND`) · ค่าผิด ⇒ `INVALID_INPUT`

## 4. บันทึก (คนยืนยัน) — `submitReadings` ของ D.6 + 2 ฟิลด์
```ts
SubmitItem += { aiProposalId?: string | null; ackLowConfidence?: boolean }
```
1. `aiProposalId` ต้องเป็นข้อเสนอของ **ร้าน+หน่วย+มิเตอร์+งวด เดียวกันกับรายการ** — ไม่ใช่ (ร้านอื่น · มิเตอร์อื่น · งวดอื่น · ไม่มีจริง) ⇒ รายการ `REJECTED` `code "NOT_FOUND"` (ไม่มีแถว/ไฟล์/event) · รายการอื่นในชุดทำต่อ
2. ข้อเสนอ `AI` + `value === proposal.value` + `lowConfidence` + ไม่มี `ackLowConfidence === true` ⇒ `REJECTED` `code "AI_NEEDS_CONFIRM"` (ไม่มีแถว) — ตัดสินจาก `lowConfidence` ที่บันทึกไว้ตอนเสนอ
3. ผล CREATED/UPDATED ที่มี `aiProposalId`: `aiValue = proposal.value` (MANUAL ⇒ null) · `source = (proposal.source === "AI" && value === proposal.value) ? "AI" : "MANUAL"` · `photoFileId` = ไฟล์ของข้อเสนอ (ไม่อัปซ้ำ — ถ้ารายการส่ง `photo` มาด้วย ใช้ทาง D.6 เดิม) · `readById = ctx.actorUserId` (คนกด) · ใน tx เดียวกับการเขียนแถว
4. ป้าย/พักบิล/event/การ์ด = D.6 ทุกอย่าง (§2 ข้อ 6 ข) · UNCHANGED/LOCKED = ไม่แตะ (ส่งซ้ำ = ผลเดิม · ไม่มีการหักเงินในขั้นนี้เลย)
5. ไม่ส่งฟิลด์ใหม่ ⇒ พฤติกรรม D.6 เดิมทุกตัวอักษร (`qc-svc-d.6` ต้องเขียวเท่าเดิม)
6. UPDATED **ไม่มี** `aiProposalId` บนแถวที่ `source "AI"` ⇒ `source "MANUAL"` · `aiValue null` (ค่าใหม่คนพิมพ์ ไม่ใช่ของ AI)

## 5. จอ (ภาพ หอ 03 แผง ข · มือถือ 390)
### 5.1 «MeterWalk.tsx» (เพิ่ม props · `'use client'` · import ได้แค่ `import type` + `meter-queue` เหมือนเดิม · ไม่ import actions)
```ts
ai?: { enabled: boolean; available: boolean; minConfidence: number } | null;
propose?: (input: { meterId: string; periodKey: string; photo: { dataUrl: string; contentType: string } }) => Promise<unknown>;
proposals?: MeterProposal[];
```
- `ai` ไม่ส่ง/`enabled:false` ⇒ เท่า D.6 (ไม่มี attr `data-ai-*` เลย · ป้ายปุ่ม "ถ่ายรูปมิเตอร์…" เดิม)
- `ai.enabled && ai.available && propose` ⇒ ปุ่มรูปเดิม (`<input type="file" accept="image/*" capture="environment">`) ป้าย "ถ่ายรูป ระบบอ่านเลข" · เลือกรูป ⇒ `propose(...)` ⇒ **เติมช่องกรอก ไม่ส่งเอง** (ต้องกด "บันทึก") · ส่งบันทึกพร้อม `aiProposalId` (+`ackLowConfidence` เมื่อติ๊ก) ผ่านคิวออฟไลน์ (§5.3)
- แผงห้อง ต่อมิเตอร์ที่มีข้อเสนอ (จาก `proposals` หรือผล `propose`): กล่อง `data-ai-proposal="<meterId>"` `data-ai-source="AI|MANUAL"`
  - AI: ช่อง `data-meter-input` เติมค่า (`value="<ตัวเลข>"`) · ข้อความ "อ่านจากรูป" · `lowConfidence` ⇒ `data-ai-low="true"` + ข้อความมีคำว่า "ไม่แน่ใจ" + `<input type="checkbox" data-ai-ack="<meterId>">` ข้อความ "ตรวจกับรูปแล้ว" (ไม่ติ๊ก ⇒ ไม่ส่ง ack) · `flag` ⇒ `data-ai-flag="<flag>"` + ไทย (HIGH "สูงกว่าปกติ" · LOW "ต่ำกว่าปกติ" · BACKWARDS "เลขถอยหลัง" · VACANT_USAGE "ห้องว่าง")
  - MANUAL: ข้อความ "พิมพ์เอง" (+ เหตุสุภาพ เช่น "ระบบอ่านเลขไม่ได้") · ช่องกรอกว่าง
- ไม่มี ฿/คำต้องห้าม สคบ. · ไม่ล้น 390
### 5.2 page + actions
- page: `meterAiStatus` + (`enabled` ⇒) `meterProposals` ผ่าน facade (ctx มี `actorUserId`) → `ai` `proposals` `propose={proposeMeterReadingAction.bind(null, unitSlug)}` (ส่ง `propose` เฉพาะ `enabled`) · เพิ่ม `?roomNo=<เลขห้อง>` ⇒ `initialRoomId` ของห้องเลขนั้น (`?room=` เดิมยังใช้ได้)
- actions: `proposeMeterReadingAction(unitSlug, input)` — `gate` เดิม · รูป dataURL ด้วย `photoOf` เดิม (≤ 5 MB) · เรียก `proposeMeterReading(g.ctx, {...})` **ไม่ส่ง deps** (ผู้ใช้ฉีดตัวอ่าน/เวลา ไม่ได้) · `submitMeterReadingsAction` ส่งต่อ `aiProposalId` (string ≤ 64) + `ackLowConfidence === true`
### 5.3 คิวออฟไลน์ (pure)
- `QueuedReading` + `aiProposalId?` `ackLowConfidence?` · `nextBatch` ส่งต่อทั้งสอง · `enqueueReading` แทนที่รายการเดิม: กติการูปของ D.6 คงเดิม (ใหม่ไม่มีรูป ⇒ คงรูปเดิม) · `aiProposalId`: ใหม่มี ⇒ ใช้ของใหม่ · ใหม่ไม่มี**และ**ไม่มีรูป ⇒ คงของเดิม (รูปหลักฐานของข้อเสนอไม่หาย) · `ackLowConfidence` **ไม่คงเลย** (ค่าใหม่ต้องยืนยันใหม่)

## 6. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.14.mts»
S โครงสร้าง/ค่าตั้ง/สุขอนามัย 9 (+S-1/S-2/S-13 git ตอนรับใบ) · PC ตัวควบคุมเขียวก่อนมีงาน 5 · P เสนอ 15 · C คิดเงิน+พร้อมกัน 7 · K ยืนยัน/บันทึก 9 · X ขอบเขต 4 · M PDPA+ตัวต่อจริงผ่านตัวจำลอง OpenRouter 6 · U จอ+คิว 7 · Q ฉาก 2 · V ภาพ 1 · Z ล้าง 1 · G regression 4 (`qc-svc-d.6` · `qc-svc-d.8 --no-regression` · `qc-svc-d.13 --no-regression` · `qc-svc-smoke` — หลังล้างข้อมูล)
- ข้อมูล (หน่วย DA · 2 อาคาร · มีผู้เช่าทุกห้อง): ประวัติ 4 งวด 1000/1100/1200/1300 (เลขก่อน 1300 · เฉลี่ย 100) · digits 5 · ตัวอ่านจำลองนับครั้ง/เก็บ input · โมเดล `anthropic/claude-sonnet-5` 1200/30 token ⇒ ค่า = `costMicroUsd(...)` (= 4,050 ไมโครดอลลาร์) · DA2 `aiMinConfidence 50` · DA3 `aiRead false` · ร้าน Z เครดิต 0 · ร้าน W ไม่มีกระเป๋า · ผู้ใช้ MS ถูกจำกัดอาคาร 1

## 7. ฉาก «scripts/svc-qc-meter-ai-scene.mts» (svcqc · ต่อจากฉาก D.6 · อยู่ร่วมกันได้)
- ด่าน `loadSvcQcEnv("svc-qc-meter-ai-scene")` · อ่าน `SQC_DORM_METER_AI_SCENE` + `sqcMeterAiPhoto()` จาก `./svc-qc-data.mjs` · ต้องมีฉาก D.6 (`meterWalk` เดือนนี้ progress 36/27) ไม่งั้น exit 3 พร้อมข้อความให้รัน `svc-qc-meter-scene.mts`
- ข้อเสนอค้าง 1 รายการ: ห้อง 209 ไฟ งวดเดือนนี้ไทย ผ่าน `proposeMeterReading` จริง (ผู้กระทำ = owner svcqc) ด้วยตัวอ่านตายตัวในสคริปต์ (`value = prevValue + unitsOverPrev` · `confidence 0.62` · **token 0 ⇒ ไม่มีแถว USAGE**) · `deps.put` ไม่ออกเน็ต · **ไม่เขียน DormMeterReading / SettingValue / OutboxEvent / แถว AiCreditTxn USAGE** · ห้อง 209 ยังไม่จด (progress คง 27)
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0 (รูปเดิม = ข้อเสนอเดิม) · `--clear` ลบเฉพาะข้อเสนอของฉาก (+ FileAsset ของมัน) · ภาพ: `SQC_VISUAL_SPECS["d.14"]` = `/dorm/meter?roomNo=209` (แผง ข: "อ่านจากรูป" + "ไม่แน่ใจ" + ตรวจกับรูปแล้ว)

## 8. regression · X · ส่งต่อ
- ต้องเขียวเท่าเดิม: `qc-svc-d.6` (meter.ts/MeterWalk/คิว) · `qc-svc-d.8 --no-regression` (พักบิลอ่าน `heldRooms`) · `qc-svc-d.13 --no-regression` (ค่าตั้งหอ/หน้า 17 กลุ่ม meter) · smoke · typecheck · fitness 2 โหมด (F5.1 ไม่เพิ่ม)
- X: X1 (X-1..4 · ด่าน §3.0) · X3 (C-4/C-5 พร้อมกันในโพรเซส + 10 ทางจาก 5 โพรเซส) · X4 (P-4 ส่งซ้ำ · C-3 ref) · X6 (P-14 ไฟล์) · X8 (M-1..4) · X10 (P-3 ไฟล์ส่วนตัว) · ที่เหลือไม่เกี่ยว (ไม่มี endpoint สาธารณะ/งานตามเวลา/นำเข้า)
- หนี้/ส่งต่อ: `rooms.meter.requirePhoto` ฝั่ง server (R4) · enum `DORM_ASSIST` ใน migration รอบหน้า (R2) · crop บนจอ (ตอนนี้ส่งรูปที่ผู้ใช้ถ่าย/ตัดมาเท่านั้น)

## 9. มติที่ขอผู้คุมเคาะ (ข้อสอบเขียนตามค่าที่เสนอ — ไม่เห็นด้วย = ORACLE-EDIT ข้อที่อ้าง)
- **R1** แก้ `src/lib/ai/credit.ts` แบบเพิ่มอย่างเดียว (`ref?` + P2002 ⇒ 0) — นอกโมดูลหอแต่เป็นทางเดียวที่ "ไม่หักซ้ำ" มีหลักประกันระดับฐาน (unique `(tenantId, ref)` มีอยู่แล้ว · ทางอื่นทุกจุดไม่ส่ง ref = เหมือนเดิม) · ข้อ C-1 C-3
- **R2** `source "CHAT"` + `note "dorm.meter.readPhoto"` (ตาม D.4 · enum ใหม่ต้อง migration) · ข้อ C-1
- **R3** อ่านเลขไม่ออก (`UNREADABLE`) ยังหักเงิน (provider เรียกสำเร็จ = มีค่าใช้จ่ายจริง · ตรงกติกา credit.ts "คำตอบออกไปแล้ว ห้ามเก็บฟรี") · ล้ม/หมดเวลา ไม่หัก · ข้อ P-8 P-9 P-10 M-5 M-6
- **R4** ไม่บังคับรูป (`rooms.meter.requirePhoto` ค่าเริ่ม ELEC) ฝั่ง server ในใบนี้ — บังคับใน `submitReadings` จะทำ `qc-svc-d.6`/D.4 นำเข้า/ฉาก D.6 แดงทันที · เสนอเป็นใบเล็กต่อจาก D.14 (บังคับเฉพาะ action หน้าจด)
- **R5** `rooms.meter.aiRead` ค่าเริ่ม **เปิด** คงตามภาคผนวก #18 ที่เจ้าของอนุมัติ — ขัดกับมติ AI 8 ส.ค. "ระบบทำเองแล้วหักเครดิตต้องปิดไว้ก่อน" หรือไม่: เสนอว่า**ไม่ขัด** เพราะ AI ทำงานเฉพาะเมื่อคนถ่ายรูปเอง (ไม่ใช่งานเบื้องหลัง) — ถ้าเจ้าของต้องการปิดก่อน แก้ค่าเริ่มที่ D.1 (ไม่ใช่ใบนี้)
- **R6** ด่านสิทธิ์อยู่ใน service (ต่างจาก `submitReadings` ของ D.6 ที่ด่านอยู่ใน action) เพราะใบนี้ใช้เงินร้าน — `ctx.actorUserId` บังคับ

## มติผู้คุม (31 ต.ค. 2569)
- R1 ✅ แก้ `src/lib/ai/credit.ts` เพิ่มอย่างเดียว (`ref?` + P2002 ⇒ คืน 0 ไม่หักซ้ำ) — เป็นบั๊กจริงของระบบเครดิตเดิม (ref ไม่ถูกใช้) · ตรวจเข้มจุดนี้ในรีวิว
- R2 ✅ source "CHAT" + note "dorm.meter.readPhoto" (enum ใหม่ = migration ถัดไป → หนี้)
- R3 ✅ อ่านไม่ออกแต่เรียก provider สำเร็จ ⇒ หัก · ล้ม/หมดเวลา ⇒ ไม่หัก
- R4 ✅ ยังไม่บังคับรูปฝั่ง server ในใบนี้ (แยกใบเล็กภายหลัง)
- R5 ✅ ค่าเริ่ม aiRead เปิดตามภาคผนวก #18 (AI ทำงานเมื่อคนกดถ่ายเองเท่านั้น) · จดเป็นคำถามเจ้าของใน SVC-OWNER-QUESTIONS (ค่าปลอดภัย = ตามนี้)
- R6 ✅ ด่านสิทธิ์ใน service + บังคับ actorUserId
- G-1 ใช้ d.6 --no-regression (ORACLE-EDIT) · ผู้คุมรัน d.6 เต็มตอนด่านรวม
