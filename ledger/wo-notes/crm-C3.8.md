# WO C3.8 — REST + AI ชุดสาม (~16 op) · manifest ครบ 32 tool · คู่มือจาก generator 100 %

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c110` (ฐาน `a06a796b` = C3.4 + C3.9 รวมแล้ว) · QC2 (`scripts/qc2.sh`) · 27 ก.ย. 2569 · builder: Opus 5.5
> สัญญา: CRM-RUN §2 C3.8 · `crm-brief-C3.6-C3.9.md` §C3.8 (addendum + Controller ruling) · COMMON · C1.10 · ข้อสอบ `scripts/qc-crm-c3.8.mts` (31 ข้อ · **ไม่ได้แก้**)
> ไม่มี migration · ไม่มี UI ใหม่ (ไม่มีแถว inventory) · ไม่มี commit/push
> ⚠️ หัวไฟล์ข้อสอบเขียน QC3 — คำสั่งของผู้คุมงานให้ใช้ QC2 ⇒ รันด้วย `scripts/qc2.sh` ทั้งหมด

## 0. บันทึกความคืบหน้า (1 บรรทัดต่อหมุด)
- 05:55 UTC อ่าน brief/สัญญา/โค้ด · ช่วงก่อน 07:40 เขียนโค้ดอย่างเดียว (กติกาเครื่อง)
- 06:10 op ใหม่ 16 ตัว (+ แนะนำ 3) ลงทะเบียน · reports.ts เปิดส่งออกให้คีย์ผู้ดูแล · records-dynamic/manifest/routes/x-shark-webhooks/CRM_INTERNAL_EVENTS
- 06:15 generator (หมวดพอร์ทัลฝั่งร้าน · เลนลูกค้า · manifest · "Other") · fitness F13.10/F13.12 strict · SKILL.md
- 07:28 ผู้คุมงานเปิดให้รันได้ · 07:38 gen docs (122 op) · typecheck 0 error
- 07:43 `qc-crm-c3.8` 28/31 (แดง 3 = ข้อขัดกันของข้อสอบ — ORACLE-EDIT A/B §6) · 07:46 รอบ 2 บน DB ที่ใช้แล้ว 28/31 ชุดเดิม
- 07:54 regression ครบ: เขียวทั้งหมด ยกเว้น c1.11 2 ข้อ + c0.2 1 ข้อ = หนี้ของไฟล์ C3.4 (ไม่ใช่ไฟล์ของใบนี้ — §5)

## 1. ทำอะไร
- **op ใหม่ 19 ตัว** (16 ตามตาราง MUST ลบ 3 ตัวที่ C3.4 สร้าง = 13 · + แนะนำ 3 · + `objects.schema.get` อยู่ใน 13 แล้ว — รวมทะเบียน 106 → **122** op):
  - `ops/sales.ts`: `reports.export.start` (danger · คีย์ `crm.admin` เท่านั้น) · `reports.export.get` · `quotas.list` · `quotas.set` · `quotas.board`* · `commissions.list` · `commissions.pending`* · `commissions.approve` · `commissions.reject` (danger)
  - `ops/portal-staff.ts`: `portal.access.list` · `portal.invite` (inviteUrl คืนครั้งเดียว — `replaySecrets`) · `portal.revoke` (danger) — path ฝั่งร้านไม่ขึ้นต้น `/portal`
  - `ops/records-dynamic.ts`: `objects.schema.get` + `RECORDS_DYNAMIC_OPS` · `objectValueSchema` (re-export) · `crmObjectsOpenApi`
  - `ops/integrations.ts`: `integrations.status` · `integrations.targets.get`* · `integrations.targets.set`
  - (* = op ที่ brief "แนะนำ" · test `C3.8-S8.1`)
- **op ร่วมของ C3.4 ใช้ต่อ** (ไม่สร้างซ้ำ): `reports.get` · `quotas.progress` · `commissions.mine` — เติมแค่ (ก) คีย์งวด พ.ศ. (ข) ตัวกรองคีย์บนข้อมูลของคน (บล็อก `CRM C3.8` ใน `ops/assist.ts`)
- **ส่งออกรายงานผ่านคีย์** (`crm/reports.ts`): ผู้ขอ = `APIKEY + ApiKey.id` (ไม่ใช่ผู้สร้างคีย์) · ตอนรันสร้างผู้ทำงานจากคีย์ใหม่ (`activeApiKeyForRun` ใหม่ใน `api-keys/service.ts`) — คีย์ถูกเพิกถอน/หมดอายุ/เปลี่ยนระบบ/ไม่ใช่ชุดผู้ดูแลแล้ว = งาน FAILED พร้อมเหตุผลไทย · คน ↔ คีย์ อ่านงานของกันไม่ได้ · คีย์ชุดอื่นขอดูงาน = 404
- **records dynamic**: `crm/object-schema.ts` (ชั้นบริการ — ไฟล์ op ห้ามแตะ prisma) ฟิลด์จาก engine ตัวเดียว (`fields.listLayout`) · ฟิลด์อ่อนไหวตาม `canViewSensitive` (ไม่มี actor = ตัดทิ้ง) · schema ต่อชนิดฟิลด์ (NUMBER/MONEY/DATE/DATETIME/SELECT/MULTI_SELECT/BOOLEAN/FILE/LOOKUP/TEXT)
- **OpenAPI ต่อผู้เรียก**: `buildOpenApiForRequest(req)` — ไม่มีคีย์/คีย์ใช้ไม่ได้ = เอกสารคงที่ · คีย์ CRM ที่อ่านรายการได้ + ระบบ v2 = + path จริง `/objects/<key>/records…` (body `values` = schema ของวัตถุนั้น) + `x-shark-objects` · route ตอบ `private, no-store` + `Vary: Authorization` เมื่อมีคีย์
- **manifest**: `api/manifest.ts#crmManifest()` (บริสุทธิ์ จากทะเบียน) + route `/api/v1/crm/manifest.json` (ไม่ใช้คีย์) · `buildOpenApi()` มี `x-shark-webhooks`
- **เว็บฮุค**: `CRM_INTERNAL_EVENTS` (ตอนนี้ว่าง — ดู §3) · `crmWebhookEvents()` ตัดรายการนี้ออก
- **คู่มือ 100 % generated**: หมวด "Customer portal (shop side)" · "Integrations" · "Customer portal lane (`/portal/*`)" (ทุก PORTAL_OPS) · "Machine-readable contract" · หมวด "Other" กัน op หายเงียบ · Planned เหลือเฉพาะของ "after CRM v2" · `renderEndpointsReference()` มี CRM_OPS + PORTAL_OPS
- **สกิล** `.claude/skills/shark-crm-api/SKILL.md` (name: shark-crm-api · ชื่อ tool ครบ 32) + `references/endpoints.md` (จาก generator)
- **fitness strict**: F13.10 ครอบ PORTAL_OPS ด้วย · F13.12 จับชื่อ tool ซ้ำ

## 2. ไฟล์ (บรรทัด ณ ตอนส่ง)
| ไฟล์ | สถานะ | จุดสำคัญ |
|---|---|---|
| `src/lib/modules/crm/api/ops/sales.ts` | ใหม่ | pageOf 35 · exportStart 56 · exportGet 77 · quotasList 96 · quotasSet 115 · quotasBoard 146 · commissionsList 167 · commissionsPending 185 · assertCommissionInKeyScope 203 · approve 211 · reject 230 |
| `src/lib/modules/crm/api/ops/portal-staff.ts` | ใหม่ | accessList 19 · invite 36 (replaySecrets) · revoke 65 |
| `src/lib/modules/crm/api/ops/integrations.ts` | ใหม่ | status 17 · targetsGet 35 · targetsSet 55 |
| `src/lib/modules/crm/api/ops/records-dynamic.ts` | ใหม่ | crmObjectsOpenApi 36 · schemaGet 59 · RECORDS_DYNAMIC_OPS |
| `src/lib/modules/crm/object-schema.ts` | ใหม่ | visibleFields 40 · valueSchemaOf 62 · crmSystem 95 · objectValueSchema 108 · liveObjectsOf 135 |
| `src/lib/modules/crm/api/manifest.ts` | ใหม่ | crmManifest |
| `src/app/api/v1/crm/manifest.json/route.ts` | ใหม่ | GET (ไม่ใช้คีย์) |
| `src/app/api/v1/crm/openapi.json/route.ts` | แก้ | GET(req) → buildOpenApiForRequest · cache ตามคีย์ |
| `src/lib/modules/crm/api/openapi.ts` | แก้ | ข้อตกลง 17–20 · `CrmOpenApiDocument` + x-shark-webhooks 65 · buildOpenApiForRequest 75 |
| `src/lib/modules/crm/api/webhook-events.ts` | แก้ | CRM_INTERNAL_EVENTS 17 · crmWebhookEvents ตัด internal |
| `src/lib/modules/crm/api/registry.ts` | แก้ | import 30 · บล็อก `CRM C3.8` ท้าย CRM_OPS 65 |
| `src/lib/modules/crm/api/ops/assist.ts` | แก้ | quotas.progress 117 · commissions.mine 131/138 (บล็อก C3.8) |
| `src/lib/modules/crm/api/filters.ts` | แก้ | keyPeopleOf · inKeyPeople · outsideKeyPeople (58–82) |
| `src/lib/modules/crm/api/schema.ts` | แก้ | periodKeyText · periodKeyIn (58–) |
| `src/lib/modules/crm/api/op.ts` | แก้ | TARGET_OF + commissions / portal-access (26) |
| `src/lib/modules/crm/api/index.ts` | แก้ | export buildOpenApiForRequest · crmManifest · CRM_INTERNAL_EVENTS |
| `src/lib/modules/crm/reports.ts` | แก้ | ข้อความ API_EXPORT_MSG 91 · startExport requester 852 · requesterOf 887 · keyActorForRun 898 · runExportJobs ผู้ทำงานของคีย์ 973 · getExport 1008 |
| `src/lib/api-keys/service.ts` | แก้ | activeApiKeyForRun 265–281 |
| `scripts/gen-crm-api-docs.mts` | แก้ | import PORTAL_OPS 24 · หมวด 38/57 · Planned 101 · Other 224 · เลนลูกค้า + manifest 239 · teamroom payload 304 · reference 347 |
| `scripts/fitness.mts` | แก้ | F13.10 strict 982 · F13.12 ชื่อซ้ำ 1013 |
| `docs/api/CRM-API.md` | regenerate | 122 op + 16 op พอร์ทัล |
| `.claude/skills/shark-crm-api/SKILL.md` · `references/endpoints.md` | ใหม่/regenerate | (gitignored — ข้อสอบ S7.1 ตรวจในเวิร์กทรี) |

## 3. มติ/เหตุผล
1. **`commissions.mine` ผ่านคีย์ API = แถวของผู้สร้างคีย์** (ตัดสินตาม C3.4 ข้อ 13 · ความเห็นผู้ตรวจ): actor ของคีย์มี `userId` = ผู้สร้าง (คนเดียวกับ `actorUserId` ของ audit ทุก op ของคีย์) · คีย์ต้องถือ `crm.commission.view` ซึ่งเปิด `commissions.list` ของทั้งระบบ (ตามการมองเห็นดีล) อยู่แล้ว ⇒ ไม่เห็นเกินที่มี · ชุด readonly/operate ไม่มี `crm.commission.view` · คีย์ที่มีตัวกรองแล้วผู้สร้างอยู่นอกกรอบ = รายการว่าง · ระบุในคำบรรยาย op ว่า "the caller's own" (คีย์ = คนเบื้องหลังคีย์)
2. **ส่งออกรายงานผ่านคีย์ผูก `ApiKey.id` ไม่ใช่ผู้สร้างคีย์** — ตามโน้ตของรีวิว C3.1 S2 ใน `reports.ts` ("C3.8 ต้องสร้าง actor จากคีย์ใหม่ตอนรันและผูกงานกับ ApiKey.id") ⇒ คีย์อื่นของคนเดียวกันอ่านไม่ได้ (ดู ORACLE-EDIT ข้อ B)
3. **"signed /api/files link" ของ addendum ไม่ได้ทำ** — ข้อสอบ **C3.1-X10.1** ตรึงว่า DTO ของ `getExport` "carries no CDN/URL field (the CSV is handed to the requester only)" ⇒ `reports.export.get` คืน CSV ในคำตอบให้ผู้ขอคนเดียว (เหมือนหน้าเว็บ) · ลิงก์ลงนามเป็นของงานส่งออก PDPA ของ C3.9
4. **คีย์งวด พ.ศ.**: บริการเก็บ ค.ศ. (`isPeriodKey` ปฏิเสธ "2569-09" โดยออกแบบ) · ข้อสอบ/สัญญาส่ง "2569-09" ⇒ แปลงที่ชั้น REST เท่านั้น (ปี ≥ 2400 − 543 · ปีที่บริการรับได้สูงสุด 2199 ⇒ ไม่กำกวม) · บริการไม่เปลี่ยน
5. **ตัวกรองคีย์บนโควตา/คอมมิชชัน** (ของใหม่ — ตารางไม่มี teamId): ขอบเขต = ผู้ดูแลในตัวกรอง ∪ สมาชิกปัจจุบันของทีมในตัวกรอง (+ ทีมในตัวกรองสำหรับโควตาทีม) · อ่าน = กรองออก/404 · ตั้งโควตานอกกรอบ = 422 (กติกาเดียวกับ filters.ts)
6. **`CRM_INTERNAL_EVENTS` ว่าง**: consumer ที่ขึ้นต้น crm./custom.record./team. ทั้ง 46 ตัวมีป้ายเว็บฮุคอยู่แล้ว · ธงตัวเดียว (`crm.teamroom.posted`) C3.4 ตั้งใจเปิดให้เว็บฮุค — ไม่เปลี่ยนการตัดสินของใบอื่น · กติกา S6.1 ทำให้ event ใหม่ที่ลืมป้ายถูกจับทันที
7. `objectValueSchema` / `crmObjectsOpenApi` **ไม่มีประตูรุ่นในตัว** (บริการรายการของ C1.2b ก็ไม่มี) — ประตูอยู่ที่ทางเข้า: REST = altAuth · เอกสารต่อคีย์ = `requireV2: true` (ระบบรุ่น 1 = เอกสารคงที่)
8. `portal.invite` คืน `inviteUrl` (มี token ดิบ) **ครั้งเดียว** — `replaySecrets: ["inviteUrl"]` ⇒ ยิงซ้ำด้วย Idempotency-Key เดิมได้ `null` (แบบ PIN ของบัตรกำนัล M2.10)
9. ไม่ทำ `commissions.report` (แนะนำ) — ยอดรวมของรายงานจะไม่ตรงกับแถวเมื่อคีย์มีตัวกรอง · อยู่ใน Planned "after CRM v2"

## 4. ผล QC (QC2 · log `.qc-shots/c38/*.log` · สรุป `.qc-shots/c38/summary.log`)
| ชุด | ผล | log |
|---|---|---|
| `qc-crm-c3.8` รอบ 1 | **28/31** — ❌ S8.4 · S8.5 · X1.1 (ข้อสอบขัดกันเอง — §6 ORACLE-EDIT A/B) · CLEAN ✅ | `c38-r1.log` |
| `qc-crm-c3.8` รอบ 2 (DB ที่ใช้แล้ว) | **28/31** ชุดเดิม | `c38-r2.log` |
| qc-crm-c1.10 | 66/66 | `c110.log` |
| qc-crm-c2.11 | 47/47 | `c211.log` |
| qc-crm-c3.4 | 53/53 | `c34.log` |
| qc-crm-c3.5 (เลนพอร์ทัล) | 67/67 | `c35.log` |
| qc-crm-c3.1 (แตะ reports.ts — เพิ่มเอง) | 56/56 (รวม X10.1 "ไม่มี URL ใน DTO") | `c31.log` |
| qc-crm-c1.11 (`CRM_V2_SWITCH=all`) | 64/66 — ❌ S1.6 · S6.10 = ไฟล์ C3.4 (§5) | `c111.log` |
| qc-ai-tools · qc-ai-skills | 18/18 · 23/23 | `ai-tools.log` · `ai-skills.log` |
| qc-crm-c0.2 (docs/facade) | 26/27 — ❌ S1.4 = `aiBridges` ของ C3.4 (§5) | `c02.log` |
| qc-nav-functions | 11/11 | `nav.log` |
| `pnpm fitness` (env QC2) · ไม่มี DATABASE_URL | 33/33 · 33/33 | `fitness-env.log` · `fitness-noenv.log` |
| typecheck | exit 0 · 0 error | `typecheck.log` |
| gen docs | 122 op · `--check` เขียว (S5.1 + F13.11) | `gen-docs.log` |
ข้อมูลชั่วคราว: ไม่มีค้าง (C3.8-CLEAN ✅ ทั้งสองรอบ)

## 5. finding ให้เลนอื่น
- **(C3.4 — แดงใน regression ที่ C3.4 ไม่ได้รัน · ไม่ใช่ไฟล์ของใบนี้ · ไม่ได้แก้)**
  - `qc-crm-c0.2` **S1.4**: facade export `aiBridges` (บรรทัดท้าย `crm/index.ts`) — ข้อสอบ C0.2 หา binding ต้นทางใน service/ui/rules/actions ไม่เจอ ⇒ ต้อง ORACLE-EDIT C0.2 (เพิ่ม `ai-bridges` ในรายการไฟล์ต้นทาง แบบที่ใบก่อน ๆ ทำ) หรือย้าย export
  - `qc-crm-c1.11` **S1.6**: `src/components/crm/ai/CrmAiHomeAtRisk.tsx` มี `min-w-[420px]` ไม่มี prefix (กฎ 390 px)
  - `qc-crm-c1.11` **S6.10**: `src/app/app/sys/[id]/crm/_actions/ai.ts` ("use server") ไม่อ่านประตู v2 ตามรูปที่ข้อสอบสแกน
- `scripts/{acc-v2,crm,member}-expected.json` ในเวิร์กทรีนี้ถูกเขียนใหม่ระหว่าง 05:55–06:17 UTC (ไม่ใช่ใบนี้ — น่าจะเป็น seed ของ QC2) · ไม่ได้แตะ · ผู้คุมงานตัดสินว่าจะรวมหรือ checkout คืน
- หัวไฟล์ `scripts/qc-crm-c3.8.mts` บอกให้รันบน QC3 — ใบนี้รันบน QC2 ตามคำสั่ง (ผลเขียว 28 ข้อ ไม่ขึ้นกับสาขา)

## 6. ส่งต่อผู้ตรวจ / ORACLE-EDIT ที่ขอ (ผู้คุมงานตัดสิน)
**A. C3.8-S8.4 และ C3.8-X1.1 — `{tab}` ไม่ใช่ id ของระเบียน** · ทั้งสองข้อเลือก op ด้วย `/\{(?!key\})[^}]+\}/` แล้ว `idForSegment` คืน `"overview"` สำหรับ `{tab}` เสมอ (ไม่ขึ้นกับ I_B/I_S2) ⇒ `GET /reports/overview` และ `POST /reports/overview/export` ของคีย์ร้าน A ตอบ 200 ถูกต้อง (รายงานของร้าน A เอง · ไม่มีชื่อต่างร้านในผล — ตรวจ leak ผ่าน) แต่ข้อสอบนับเป็น "cross-tenant 200"
  hunk (บรรทัด 625 และ 873):
  ```
  - OPS.filter((x) => /\{(?!key\})[^}]+\}/.test(String(x.path)))
  + OPS.filter((x) => /\{(?!key\}|tab\})[^}]+\}/.test(String(x.path)))
  ```
  (X1.1: `... /\{(?!key\}|tab\})[^}]+\}/.test(String(x.path)) && !String(x.path).startsWith("/teams")`)
**B. C3.8-S8.5 — `reports.export.get` ผ่านคีย์ readonly = 404** · งานส่งออกผูก `ApiKey.id` ของคีย์ผู้ขอ (โน้ตรีวิว C3.1 S2 ใน reports.ts: "ผูกงานกับ ApiKey.id" · สัญญา: "requester only") · fixture ของข้อสอบมีงานเดียว = ของคีย์ admin ⇒ คีย์ readonly (ส่งออกเองไม่ได้) ไม่มีทางได้ 200 · X2.1 (เมทริกซ์) ยอมรับ 404 ของเคสเดียวกันแล้ว
  hunk (บรรทัด 641):
  ```
  - else if (inBundle ? r.status !== 200 : r.status !== 403) bad.push(...)
  + else if (inBundle ? !(r.status === 200 || (o.id === "reports.export.get" && r.status === 404 && ecode(r) === "not_found")) : r.status !== 403) bad.push(...)
  ```
  ทางเลือกถ้าผู้คุมงานไม่รับ B: ผูกงานของคีย์กับ "ผู้สร้างคีย์" (คีย์ทุกใบของคนเดียวกันเห็นงานกัน — แบบเดียวกับมติ commissions.mine) แก้ที่ `requesterOf` บรรทัดเดียว — แต่ขัดโน้ต C3.1 S2 และทำให้คีย์ readonly อ่าน CSV ที่คีย์ admin ส่งออกได้
**ให้ผู้ตรวจดู**: (1) `reports.ts` เส้นคีย์ API ทั้งเส้น (startExport → runExportJobs `keyActorForRun` → getExport) — คีย์ถูกเพิกถอนระหว่างคิว = FAILED ไทย · คน/คีย์อ่านงานข้ามกันไม่ได้ (2) `object-schema.ts` การตัดฟิลด์อ่อนไหว (ไม่มี actor = ตัด · `canViewSensitive` ด้วย customerId "" แบบ `assertMayFilterSensitive`) (3) `buildOpenApiForRequest` ไม่มีคีย์/คีย์เสีย/ระบบรุ่น 1 = เอกสารคงที่ทุกไบต์ + cache private เมื่อมีคีย์ (4) ตัวกรองคีย์บนโควตา/คอมมิชชัน (`filters.ts#keyPeopleOf`) (5) `portal.invite` replaySecrets

## § ผลหลังผู้คุมงานรับ ORACLE-EDIT A/B
- ผู้คุมงานแก้ข้อสอบตาม A/B เอง · `qc-crm-c3.8` **31/31 ×2** (`final-1.log` · `final-2.log`) · คืน `scripts/{acc-v2,crm,member}-expected.json` จาก git แล้ว

## § รอบ 2 — แก้ตามรีวิว (MERGEABLE AFTER SHOULD-FIX)
| ข้อ | แก้อย่างไร | ที่ |
|---|---|---|
| S1 ค่าลับค้างใน ApiIdempotency | เก็บ `scrubReplaySecrets(op, result.body)` แทน body ดิบ (แก้ที่แกน — ปิดทั้งกลุ่ม: token เชิญพอร์ทัล · PIN บัตรกำนัล · ตั๋วสมัคร · คีย์ API ใหม่) · คำตอบครั้งแรกยังได้ค่าจริง · replay ได้ null เหมือนเดิม | `src/lib/api/idempotency.ts:215-219` |
| S2 เพดานของคีย์ | `crm/key-caps.ts#crmCapFor` (ใหม่): คนจริงเหมือนเดิม (OWNER ไม่จำกัด) · คีย์ = เพดาน **ปัจจุบัน** ของผู้สร้างคีย์ (อ่าน Membership ทุกครั้ง) · ผู้สร้างไม่อยู่/ยังไม่ตอบรับ = 0 (ทุกยอดเข้าทางอนุมัติ = 409 approval_required) · ใช้ทั้ง `commissions.approve` และ `_maxReassignPerDay` ของ `deals.reassign` (นับโควตาต่อวันด้วย id ผู้สร้างคีย์ — ร่วมกับการโอนบนหน้าจอของคนเดียวกัน) · คำบรรยาย op approve ระบุ "an API key uses the current cap of the person who created it" | `crm/key-caps.ts` · `commissions.ts:1592-1598` · `deals.ts:1050` · `ops/sales.ts` (summary ของ approve) |
| N1 | `keyPeopleOf` มีทั้งตัวกรองทีมและผู้ดูแล = AND (ผู้ดูแลในตัวกรอง ∩ สมาชิกทีม) เหมือน visibleWhere · คีย์ที่มีตัวกรองผู้ดูแลไม่เห็นโควตาทีม | `api/filters.ts:63-72` |
| N2 | `commissions.get(ctx, actor, id)` ใหม่ (การมองเห็นเดียวกับ approve · คีย์ view หรือ approve) → `assertCommissionInKeyScope` หาแถวตาม id · ตัวกรองคีย์เข้าไปในคำสั่งของบริการก่อนเพดาน 500: `commissions.list({ userIds })` · `quotas.listQuotas({ owners })` ⇒ nextCursor ถูก | `commissions.ts:1707-1731` · `quotas.ts:392-420` · `ops/sales.ts` |
| N3 | `openapi.json` แบบมีคีย์นับเข้าถังอ่านของคีย์ (`crm:api:read:<keyId>` — ถังเดียวกับ REST) · เต็ม = 429 ไทย + Retry-After | `api/openapi.ts:86-89` · `openapi.json/route.ts` |
| N5 (มติ: คงไว้) | คีย์ readonly เห็นโควตาทั้งระบบ (reportScopeOf ของคีย์ = ALL) — แก้คำของชุด `crm.readonly` เป็น "the reports of the whole system (read)" (+ คอมเมนต์ 213) | `api-keys/scopes.ts:213 · 343` |
| N6 | ก๊อป `SKILL.md` + `references/endpoints.md` ไป `/root/.claude/skills/shark-crm-api/` (ที่เก็บสกิลของผู้ใช้ — ไม่อยู่ใน git) | — |

**หนี้/มติ (ไม่แก้โค้ด)**
- N4 `portal.revoke` ซ้ำ = อัปเดต revokedAt ใหม่ + audit อีกแถว (บริการของ C3.5 ไม่ idempotent ระดับบริการ — REST กันซ้ำด้วย Idempotency-Key อยู่แล้ว) → หนี้ของเลนพอร์ทัล
- N5 ตามมติผู้คุมงาน: คงพฤติกรรม แก้แค่ถ้อยคำ

**หลักฐาน S1** — `scripts/pending/probe-c38-idem.mts` (QC2 · ร้านชั่วคราว ลบใน finally) **4/4** (`.qc-shots/c38/r2-probe-idem.log`): ครั้งแรก 200 มี inviteUrl · `ApiIdempotency.responseJson` ไม่มี token (`data.inviteUrl = null`) · replay 200 + `Idempotent-Replayed: true` + inviteUrl null + accessId เดิม · ลบร้าน/คีย์หมด

**ผลรอบ 2 (QC2 · สรุป `.qc-shots/c38/r2-summary.log`)**
- typecheck 0 error (`r2-typecheck.log`) · gen docs (`r2-gen-docs.log`)
- `qc-crm-c3.8` **31/31 ×2** (`r2-c38-a.log` · `r2-c38-b.log`) · qc-crm-c1.10 66/66 · qc-crm-c2.11 47/47
- qc-crm-c3.3 83/90 (`r2-c33.log`) — H1–H6 = แดงของ ORACLE-EDIT ที่รู้อยู่แล้ว · **M7 แดง** (ใน log ของ C3.4 ข้อนี้ผ่าน · เป็นเรื่องยอดรวมตอนยกเลิกการชำระ ไม่ได้ผ่านเส้นอนุมัติ) → ต้องรันซ้ำเพื่อแยกว่าสุ่มพังหรือไม่
- (หยุดช่วง prod build ตามคำสั่ง แล้วรันต่อหลัง RESUME)
- qc-crm-c3.3 รันซ้ำ **83/90** (`r2-c33-b.log`) — แดงชุดเดิมพอดี H1–H6 + M7 = ฐานที่ผู้คุมงานยืนยัน (ข้อสอบมี edit M7/X3.3 แต่ยังไม่มีโค้ด C3.3-fix ใน c110) · ไม่มีข้อแดงอื่น
- qc-crm-c3.5 67/67 · qc-account-api-core 64/64 (ครอบการกันซ้ำ/replay ของแกน) · fitness **33/33 ×2** (มี env QC2 / ไม่มี DATABASE_URL)
- qc-member-m1.11 8/10 · qc-member-m2.10 0/1 (ERR) — **สาเหตุคือสภาพแวดล้อม ไม่ใช่โค้ด**: ข้อสอบอ่าน id สมาชิก/ผู้ใช้จาก `scripts/member-expected.json` ซึ่งคืนเป็นฉบับ git ตามคำสั่ง (ไม่ตรงกับ seed ของ QC2) ⇒ `customer.findUnique(m(1).id)` = null (`Cannot read properties of null (reading 'nickname')`/`'role'`) · S2.3 = GET `/members/<id ที่ไม่มีใน QC2>` → 404 · ต้องรันบน QC ที่ expected ตรงกับ seed (QC1) หรือใช้ expected ของ QC2 · การเปลี่ยนแปลงของแกน (S1) มีหลักฐานจาก probe 4/4 + account-api-core
- qc-kanban-k1.15 28/30 — S3.2/S3.4 = โฟลเดอร์สกิล `.claude/skills/shark-kanban-api` ไม่มีในเวิร์กทรี c110 (gitignored — มีแค่ shark-crm-api) ⇒ endpoints.md 0 ไบต์ · ไม่เกี่ยวกับใบนี้
- log: `.qc-shots/c38/r2-{c33-b,c35,m111,m210,acc-api-core,k115,fitness-env,fitness-noenv}.log`

## § รอบ 3 — หมายเหตุจากรีวิวรอบ 2 (MERGEABLE with notes)
- `commissions.pending(ctx, actor, { userIds })` — ตัวกรองคีย์เข้าไปในคำสั่งก่อนเพดาน listMax (แบบเดียวกับ list) · op `commissions.pending` ส่ง `people.owners` (`commissions.ts#pending` · `ops/sales.ts`)
- คำบรรยาย `quotas.list`: คนที่ไม่มี crm.quota.manage เห็นของตัวเอง/ทีม · **คีย์ API เห็นโควตาทั้งระบบ** (แคบลงตามตัวกรองทีม/ผู้ดูแลของคีย์) — ตรงกับมติ N5 · regenerate docs
- **บันทึกมติ (ตั้งใจ · ฝั่งปลอดภัย):** คีย์ที่ OWNER สร้าง = เพดานอนุมัติไม่จำกัด (`crmCapFor` → OWNER ไม่จำกัด) แต่ actor ของคีย์ชุดผู้ดูแลมีบทบาท MANAGER ⇒ **อนุมัติแถวคอมมิชชันของเจ้าของร้านเองไม่ได้** (กติกา "ห้ามอนุมัติของตัวเอง ยกเว้น OWNER" ใช้ role ของ actor ซึ่งไม่ใช่ OWNER) — ถือว่าถูก: การอนุมัติของตัวเองต้องทำบนหน้าจอโดยเจ้าของร้าน ไม่ใช่ผ่านคีย์
- ชุดสมาชิกที่แตะ replaySecrets (m1.11 · m2.10 · m2.6/m2.7/m2.9 · m3.10/m3.11 · fix-s1/s4) **รันบน QC2 ไม่ได้ตอนนี้**: probe `scripts/pending/probe-c38-seedid.mts` (อ่านอย่างเดียว) ยืนยันว่า id สมาชิก #1 ทั้งของ `member-expected.json` ฉบับ git และฉบับของ `shark-crm`/`c12a` **ไม่มี** ใน QC2 (seed ของ QC2 ถูกสร้างใหม่ แต่ไฟล์ expected ที่ตรงกันหายไปตอน checkout คืนตามคำสั่ง) ⇒ ต้อง seed QC2 ใหม่ (งานของผู้คุมงาน) หรือรันบน QC1 · หลักฐานของแกน replay: probe S1 4/4 + qc-account-api-core 64/64 + qc-account-api-keys (รอบ 3)
- **ผลรอบ 3** (`.qc-shots/c38/r3-summary.log`): typecheck 0 error · gen docs · qc-crm-c3.8 31/31 · qc-crm-c3.3 83/90 (H1–H6 + M7 = ฐานของ c110 ไม่มีข้ออื่น) · qc-crm-c3.9 36/36 (รวม S6.5) · qc-crm-c3.2 47/47 · qc-crm-c3.4 53/53 · qc-account-api-keys 51/51 · fitness 33/33 ×2 · `scripts/*-expected.json` ตรงกับ git (ไม่มี diff)

## ผู้คุมงาน (Fable 5.1 · 27 ก.ย. 2569) — รับงาน
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 31 ข้อเขียนก่อน (`82653840`) · ruling addendum · ORACLE-EDIT A ({tab} ไม่ใช่ id · S8.4/X1.1) + B (export.get ผ่านคีย์อื่น 404 · S8.5) — ผู้ตรวจยืนยันไม่ทำให้อ่อนลง |
| D2 | ✅ | `qc-crm-c3.8` **31/31 ×2** QC1 seed ใหม่ (`c38-verify.log` · ครั้งแรก 30/31 = skill gitignored ยังไม่ได้คัดลอกเข้า main) · 31/31 ×2 ทุกรอบบน QC2 |
| D3 | ✅ | มติ commissions.mine ผ่านคีย์ = แถวผู้สร้างคีย์ · คีย์ OWNER = role MANAGER อนุมัติแถวเจ้าของไม่ได้ (ตั้งใจ) · readonly เห็นโควตาทั้งระบบ (แก้ถ้อยคำ scopes) |
| D4 | ✅ | ถอยหลัง QC1 (`c38-verify.log` 66 ขั้น): c3.4 53 · c3.9 36/48 (H รอ fix) · account-api-core 64 · account-api-keys 51 · m1.11 25/26 (S5.2 ภาพ) · m2.10 17/20 (S5.x server) · k1.15 · ai ×5 · kb ×3 · meeting 22 · c1.7 57 · + regression ชุด C3.4/C3.9 ทั้งหมด · แดง = รู้จัก (m2.9/m3.11/c3.7 ภาพ · k2.3) |
| D5/D6 | ✅ | typecheck 5120 exit 0 ×2 · fitness 33/33 ×2 · build ผ่าน (`c38-verify-b.log` · หลังพักเลนอื่น — OOM ครั้งที่ 3 ยืนยันกฎ) |
| D7 | — | ไม่มี UI ใหม่ (manifest/OpenAPI/docs) · ภาพ 3.7 owner/thana บน build ใหม่ 0 failures · c3.7 30/30 · m3.10 21/21 |
| D8–D11 | ✅ | ผู้ตรวจอิสระ 2 รอบ (SHOULD-FIX 2: token ดิบใน ApiIdempotency (แกนกลาง) · เพดานของคีย์ · NOTE 6 → รอบ 2 MERGEABLE + notes ปิด) · probe idempotency 4/4 |
| D12 | ⏳ | รอ push (⛔ prod รอ C3.9-fix) — `76b0f81a` |
หนี้: N4 portal.revoke idempotency (C3.5) · REPORT_EXPORT กำลังรันตอนลบ (C3.9-fix) · commissions.pending/list 500 (แก้แล้ว) · member suites replay ยืนยันบน QC1 แล้ว (m1.11 25/26 · account-api-core 64)
