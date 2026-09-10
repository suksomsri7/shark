# WO M1.7 — ความเป็นส่วนตัว/PDPA (นโยบายเวอร์ชัน · ยินยอมรายช่องทาง D19 · ใครดูข้อมูลอ่อนไหวได้ D8+D17 · บันทึกการดู · คำขอ export/erase + สายอนุมัติ · ลบอัตโนมัติ · หน้าตั้งค่า ภาพ 14) · โน้ตของ builder

> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.7 · พิมพ์เขียว `docs/modules/06-member-v2.md` §4.3 §5.10 §6.3 §7.1 §7.5 §11.8 §12 · ข้อสอบ `scripts/qc-member-m1.7.mts` (26 ข้อ)
> **ผล: 25/26 เขียว** — ข้อที่เหลือคือ `S7.2` (ภาพหน้าจอ) ซึ่งเป็นงานของ Fable (builder ห้าม build)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| `src/lib/modules/member/privacy.ts` | แก้ (ต่อจาก M1.4 · 192 → ~1,100 บรรทัด) | ทั้งใบ: นโยบายเวอร์ชัน (list/create/publish/current/accept) · ยินยอม (get/set + sync legacy) · นโยบายอ่อนไหว (list/set/delete + `hrPositionsSummary`) · `listAccessLog` · `exportBundle`/`requestExport` · `requestErase`/`eraseMember`/`applyEraseApproved` · `sweepAutoErase` · ตัวช่วยหน้าจอ (`consentStats` `sensitiveMatrix` `listPrivacyRequests` `getAutoEraseYears` `setAutoEraseYears`) |
| `src/lib/core/sanitize.ts` | **ใหม่** | `sanitizeHtml()` + `htmlToText()` — allowlist ล้วน ไม่มี dependency ใหม่ (ดู §3.1) |
| `src/lib/core/channels.ts` | แก้ 1 บรรทัด | `WHATSAPP.canConsent: false → true` (ดู §2.1) |
| `src/lib/modules/member/access.ts` | แก้ | `canManagePrivacy()` (คีย์ `member.privacy.manage` · MANAGER ไม่ผ่านโดยปริยาย) |
| `src/lib/modules/member/profile.ts` | แก้ | `Member360Field` เพิ่ม `id` + `hidden` · ฟิลด์อ่อนไหวที่ดูไม่ได้ = ส่งหัวฟิลด์ `hidden: true` + `value: null` (เดิม `continue` ทิ้งทั้งฟิลด์) |
| `src/lib/modules/member/index.ts` | แก้ | facade: 8 ฟังก์ชัน + 9 ชนิดของ privacy |
| `src/lib/modules/member/nav.ts` | แก้ | `MEMBER_SETTINGS_NAV` (6 หน้าย่อยของ "ตั้งค่า") + `memberSettingsNavItems()` · `memberNavChildren` ต่อท้ายหน้าย่อยที่เปิดได้ (ดู §3.4) |
| `src/lib/modules/member/privacy-actions.ts` | **ใหม่** | server action 7 ตัว · ด่านเดียว `gate()` = requireTenant → read-โดยนัย → `member.privacy.manage` → ระบบเป็น MEMBER ของร้านนี้ · `revalidatePath` + `safeReason` ทุกตัว |
| `src/app/app/sys/[id]/member/settings/privacy/page.tsx` | **ใหม่** | หน้าเซิร์ฟเวอร์ (404-not-403) + โหลดข้อมูล 8 ก้อนขนานกัน |
| `src/components/member/PrivacySettings.tsx` | **ใหม่** | 6 บล็อกตามภาพ 14 (testid ครบ 8) |
| `src/components/member/MemberSettingsTabs.tsx` | **ใหม่** | แท็บย่อยของหมวดตั้งค่า (ฟิลด์ · ความเป็นส่วนตัว · อีก 4 หน้า "เร็ว ๆ นี้") |
| `src/lib/approval-effects.ts` | แก้ | เคส `member.erase` (approved → `applyEraseApproved` · rejected → คำขอ REJECTED) |
| `src/lib/outbox-consumers.ts` | แก้ | consumer `member.consent.changed` (no-op + `withAutomation`) |
| `src/lib/automation/labels.ts` | แก้ | `member.consent.changed` ป้ายไทย (spread ต่อเข้า `WEBHOOK_EVENTS` = ประกาศที่เดียว) |
| `src/lib/platform/cron.ts` | แก้ | ขั้น `autoErase` (เรียก `sweepAutoErase`) + ฟิลด์ใหม่ใน `runDailyCron` (ของเดิมครบ) |
| `src/lib/modules/point/service.ts` + `index.ts` | แก้ | `listCustomerLedger()` — สำเนาแต้มของ PDPA ผ่าน facade (ไม่ให้ member รู้จักตาราง `PointLedger`) |
| `prisma/schema/member.prisma` | แก้ | `MemberPrivacyPolicy.effectiveAt` → nullable (ดู §2.2) |
| `prisma/migrations/20261014000000_member_v2_b2/migration.sql` | **ใหม่** | `ALTER COLUMN "effectiveAt" DROP NOT NULL` (ผ่อนคลายล้วน) |
| `scripts/fitness.mts` | แก้ 1 บรรทัด | ถอด `lib/core/sanitize.ts` ออกจาก `XREF_BASELINE` ตามที่ ratchet F7.2 สั่ง (ไฟล์ถูกสร้างจริงแล้ว — ดู §3.1) |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` · `member-qc-env.mts` · `visual-member.mts` · `qc-all.mts` · `.env*` · ไม่มี `next build/dev` · ไม่มี `git add/commit/push`

---

## 2. ข้อแย้ง / จุดที่ต้องเปลี่ยนของเดิม (พร้อมหลักฐาน)

### 2.1 ข้อสอบบังคับให้ **วอทส์แอปขอความยินยอมได้** — ทะเบียนช่องทางเดิมตั้ง `canConsent: false`

- `S2.1` เรียก `setConsent(..., { channel: "WHATSAPP", granted: true, source: "STAFF" })` แล้ว **คาดว่าสำเร็จ**
- `S2.3` ระบุว่า "channel ที่ `canConsent=false` (WEBCHAT) → throw" ⇒ ด่านของ `setConsent` ต้องเป็น `canConsent` ตามตัวอักษร
- แต่ `src/lib/core/channels.ts` (M1.1) ตั้ง `WHATSAPP: { canConsent: false, canNotify: false }`

สองข้อนี้อยู่ร่วมกันไม่ได้ถ้า WHATSAPP ยัง `canConsent: false` ⇒ **แก้ทะเบียน 1 บรรทัด** เป็น `canConsent: true`
(คง `canNotify: false` — SHARK ยังไม่มี adapter ส่งออกทางวอทส์แอป · รูปแบบเดียวกับ `PHONE` ที่เก็บความยินยอมได้แต่ระบบไม่ได้เป็นคนส่ง)

หลักฐานว่าไม่ขัดสัญญาเดิม:
- `qc-member-m1.1` S1b.1 บังคับเฉพาะ "LINE/EMAIL/SMS/PUSH ต้อง `canConsent`+`canNotify` = true" และ `consentChannels().every(canConsent)` — ไม่ได้ห้ามช่องอื่นเป็น true → **รันแล้ว 28/28 เขียว**
- `notifyChannels()` ไม่เปลี่ยน (canNotify คงเดิม) ⇒ แคมเปญ/แจ้งเตือนของ M3.x ไม่ได้ช่องทางใหม่มาแบบเงียบ ๆ
- ความเป็นจริงทางธุรกิจ: WhatsApp Business ส่งข้อความเทมเพลตหาลูกค้าได้ต่อเมื่อมี opt-in ⇒ เป็นช่องทางที่ **ต้องเก็บความยินยอม** จริง
- ผลข้างเคียงที่ตั้งใจ: `getConsents()` คืน 6 ช่องทาง (ไลน์ · อีเมล · SMS · โทรศัพท์ · แจ้งเตือนในแอป · วอทส์แอป) และหน้า M1.6 (ฟอร์มสมัคร) จะมีช่องวอทส์แอปเพิ่มมาเอง — `qc-member-m1.6` ยังไม่มีโค้ด (SKIPPED) จึงไม่กระทบวันนี้

### 2.2 ต้องมี migration หลังจากทั้งหมด: `MemberPrivacyPolicy.effectiveAt` ต้องเป็น nullable

หัวข้อสอบ: `createPolicyVersion(...) → effectiveAt null = ร่าง` และ `S1.1` ตรวจว่า v2 (ไม่ส่ง `effectiveAt`) ต้อง `isCurrent === false`
แต่คอลัมน์เดิมของ M1.1 เป็น `effectiveAt DateTime` (NOT NULL) ⇒ ถ้าไม่ปลด NOT NULL ต้องแอบใส่ "วันปลอม" (เช่น ปี 2999)
แล้วทุกคิวรี "เวอร์ชันปัจจุบัน" ต้องรู้จักค่าเวทมนตร์นั้นตลอดไป ⇒ เลือกทำ migration ตามที่ใบงานอนุญาต

- ชื่อ: `20261014000000_member_v2_b2` · เนื้อหา **บรรทัดเดียว**: `ALTER TABLE "MemberPrivacyPolicy" ALTER COLUMN "effectiveAt" DROP NOT NULL;`
- ผ่อนคลายล้วน (ไม่ใช่ additive แต่ก็ไม่ทำลาย): แถวเดิมทุกแถวมีค่าอยู่แล้ว ⇒ ทำงานเหมือนเดิมเป๊ะ · ย้อนกลับได้ด้วย `SET NOT NULL`
- ตาราง `MemberPrivacyPolicy` บน prod **ยังว่างทุกร้าน** (ฟีเจอร์นี้เพิ่งเกิดวันนี้) ⇒ ความเสี่ยงตอน deploy = ศูนย์
- `migrate deploy` บน QC ผ่าน · `migrate diff --from-config-datasource … --to-schema` = **empty** (รันซ้ำหลังงานเสร็จก็ยังว่าง)

**ไม่มีข้อแย้งกับตัวข้อสอบ** — ไม่ได้ขอให้แก้ `scripts/qc-member-m1.7.mts` แม้แต่บรรทัดเดียว

---

## 3. ข้อตัดสิน (นอกเหนือ §2)

### 3.1 `sanitizeHtml` อยู่ที่ `src/lib/core/sanitize.ts` (ไม่ใช่ยืมของบอร์ดงาน)

- ข้อสอบ S8.2 ห้าม `privacy.ts` import `@/lib/modules/kanban/*` ที่ไม่ใช่ `index` ⇒ ยืม `kanban/sanitize.ts` ตรง ๆ ไม่ได้ (และเป็นเส้น `member→kanban` ใหม่โดยไม่จำเป็น)
- `core` เป็นที่ของกลาง (โมดูลห้าม import ข้ามกัน — F2) และ **`SECURITY.md` ระบุพาธนี้ไว้ตั้งแต่แรก**: fitness มี `lib/core/sanitize.ts` อยู่ใน `XREF_BASELINE` พร้อม disposition `BUILD 🔜 — SECURITY.md [B]` ⇒ สร้างไฟล์นี้ = ปิดหนี้เก่าที่ ratchet เฝ้าอยู่ จึงถอดบรรทัดนั้นออกตามกติกา ratchet (F7.2 บอกให้ถอดเอง: "ซ่อมแล้ว 1 ตัว — ถอดออกจาก XREF_BASELINE")
- allowlist ของ core กว้างกว่าของบอร์ดงานเล็กน้อย (`h3` `blockquote` `pre` `u` `hr`) เพราะเอกสารนโยบาย PDPA จริงมีหัวข้อสามชั้น/ย่อหน้าอ้างกฎหมาย · `<a>` รับเฉพาะ `http(s)` + ใส่ `rel="noopener"` ให้เอง
- **หนี้**: `kanban/sanitize.ts` ยังมี `sanitizeDescription` ของตัวเอง (พ่วง markdown-lite) — รวมสองที่เป็นตัวเดียวเป็นงานเก็บกวาดใบแยก ไม่แตะในใบนี้ (จะลากข้อสอบบอร์ดงานทั้งชุดมาเสี่ยงโดยไม่จำเป็น)

### 3.2 `exportBundle` อ่านข้อมูลของโมดูลอื่นด้วย prisma ตรง (ยกเว้นแต้ม/ตัวตนกลาง)

- **แต้ม** ผ่าน facade `point/index.ts` — เพิ่ม `listCustomerLedger()` ให้โมดูลแต้มเป็นคนตอบว่า "ระบบแต้มไหนผูกกับระบบสมาชิกนี้" (ตรรกะของเขาเอง) ⇒ member ไม่ต้องรู้จักตาราง `PointLedger`
- **ตัวตนกลาง** ผ่าน `party/index.ts#getProfile`
- **แชท/บัญชี/บอร์ดงาน/บิลขาย/นัดหมาย** อ่านด้วย prisma ตรงพร้อมคอมเมนต์ยาว (แบบเดียวกับ `profile.connectionsOf` ของ M1.4) เพราะ facade ของโมดูลเหล่านั้นกรองตาม **สิทธิ์ของผู้ดู** ซึ่งผิดเจตนาของสำเนา PDPA — สำเนาต้องครบทุกแถวที่เป็นของ *เจ้าของข้อมูล* ไม่ใช่เท่าที่พนักงานคนที่กดปุ่มมีสิทธิ์เห็น (`kanban/links.listCardsForTarget` ต้องการ `KanbanActor` + systemId ของบอร์ด ซึ่ง `exportBundle(ctx, customerId)` ไม่มีตามสัญญา)
- ⇒ **ไม่ต้องเพิ่มเส้นใน `ALLOWED_EDGES`** เลย (fitness 23/23 ทั้งสองโหมด) · เส้นที่ใช้จริง = `member→approval` `member→point` `member→party` ซึ่งมีอยู่แล้วตั้งแต่ M1.4
- 🔴 บั๊กที่กันไว้ตั้งแต่เขียน: `Customer.spent12mSatang` เป็น `BigInt` ⇒ ต้อง `Number()` ก่อนใส่ลง bundle ไม่งั้น `JSON.stringify` โยน error **เฉพาะตอนส่งไฟล์ให้ลูกค้าจริง** (ข้อสอบ S5.1 `JSON.stringify(b)` จับได้พอดี)

### 3.3 "ลบ" = anonymize · ตัวตนกลางลบเมื่อไม่มีใครชี้

- คงไว้: บิลขาย · รายการแต้ม · ประวัติระดับ · ไทม์ไลน์ · บันทึกการดู · แถวความยินยอม (ถอนทั้งหมด) — เป็นหลักฐานทางบัญชี
- ตัดทิ้ง: ชื่อ/เบอร์/เบอร์สำรอง/อีเมล/วันเกิด/คำนำหน้า/เพศ/สัญชาติ/รูป/ไลน์/เฟซบุ๊ก/โน้ต/แท็ก + ค่าฟิลด์กำหนดเอง **รวมประวัติค่าเก่า** (`MemberFieldValueHistory` — เป็นข้อมูลส่วนบุคคลชุดเดียวกัน ไม่ใช่หลักฐานทางบัญชี) + ที่อยู่ + ตัวตนช่องทาง
- `Party` ถูก anonymize เฉพาะเมื่อ **ไม่มี** `AccountContact`/`CrmContact`/`ChatContact`/`HrEmployee`/`KanbanCardLink(PARTY)` ชี้อยู่ — ถ้ามี แปลว่าเอกสารของโมดูลอื่นยังต้องใช้ชื่อนั้น (ใบเสร็จที่ออกไปแล้วห้ามเปลี่ยนชื่อผู้ซื้อ)
- เพิ่มไทม์ไลน์ 1 แถว (`PDPA_ERASED`) ให้ตรวจสอบย้อนหลังได้ว่า "ถูกลบเมื่อไร ตามคำขอไหน"

### 3.4 หน้าตั้งค่ามีแท็บย่อย + ต้องไม่เป็น "หน้ากำพร้า"

- `qc-nav-functions.mts` S5 บังคับว่า **ทุก `page.tsx` ที่ไม่ใช่ `[param]` ต้องอยู่ในเมนู** ⇒ ถ้าเพิ่มหน้า privacy โดยไม่แตะ `nav.ts` ข้อสอบชุดนั้นแดงทันที
- แก้ด้วยการทำทะเบียน `MEMBER_SETTINGS_NAV` ใน `nav.ts` (ที่เดียวกับ drawer ☰) แล้วให้ `memberNavChildren` ต่อท้ายหน้าย่อยที่ผู้ใช้เปิดได้จริง — คนที่ไม่มี `member.privacy.manage` ไม่เห็นลิงก์นี้เลย
- ระวังไว้แล้ว: S0.3 ของชุดนั้นนับ `status: "ready"` เทียบกับ `path: "…", status: "ready"` ⇒ เขียนให้อยู่บรรทัดเดียวกันทุกตัว (นับได้ 4 = 4) · **รัน `qc-nav-functions` แล้วเขียว 11/11**
- สิทธิ์ของแท็บย่อยแยกกันจริง: "ฟิลด์" = `member.settings.manage` · "ความเป็นส่วนตัว" = `member.privacy.manage` (§6.1 คนละคีย์)

### 3.5 อื่น ๆ

- `setConsent` ของพนักงานต้องมี `member.customer.update` (ข้อสอบไม่ได้ระบุ — เลือกคีย์ที่ตรงความหมาย "แก้ข้อมูลสมาชิก") · ลูกค้าเองต้องเป็นเจ้าของ `customerId` + `source = CUSTOMER_SELF`
- `setConsent` ไม่ทับ `policyVersion` เดิมเมื่อผู้เรียกไม่ส่งมา (ความยินยอมเดิมผูกกับนโยบายเวอร์ชันไหนต้องไม่หายไป)
- `setSensitivePolicy` เป็น "ตั้งค่าใหม่ทั้งแถว": ไม่ส่ง `hrPositions`/`hrDepartments` = ล้างเป็นว่าง — ไม่งั้นคนกดลบชิปบนจอแล้วสิทธิ์ไม่หายจริง
- `requestErase` ยื่นเข้าสายอนุมัติ **เสมอ แม้ผู้ขอเป็นเจ้าของร้าน** (ต่างจาก `setManualTier` ของ M1.9 ที่ OWNER ทำได้ทันที) — การลบข้อมูลถาวรต้องมีคนที่สองเห็นด้วยเสมอ · ไม่มีนโยบายในร้าน = `autoApproved` ⇒ ลบทันที (เป็นการตัดสินใจของเจ้าของร้านที่ยังไม่ตั้งนโยบาย)
- `sweepAutoErase` ตัดที่ 200 คน/ระบบ/รอบ และ try/catch สองชั้น (ต่อร้าน + ต่อคน) — ร้านเดียวพังต้องไม่ล้ม cron ทั้งรอบ
- `getMember360` ของฟิลด์อ่อนไหวที่ดูไม่ได้: เปลี่ยนจาก "ไม่ส่งฟิลด์เลย" เป็น "ส่งหัวฟิลด์ + `hidden: true` + `value: null` + `display: "ซ่อน"`" ตาม §6.4 (หน้าจอต้องวาดกล่องว่างพร้อมป้าย "ซ่อน" ได้ — ถ้าไม่ส่งอะไรเลย ผู้ใช้ไม่มีทางรู้ว่ามีฟิลด์นี้อยู่และต้องขอสิทธิ์)

---

## 4. ผลข้อสอบ M1.7 — **25/26**

```
JSON_SUMMARY {"total":26,"passed":25,"findings":[{"id":"M1.7-S7.2","sev":"MAJOR"}]}
```

| หมวด | ผล |
|---|---|
| S1 นโยบายเวอร์ชัน (3) | ✅ ✅ ✅ |
| S2 ยินยอมรายช่องทาง (4) | ✅ ✅ ✅ ✅ |
| S3 นโยบายอ่อนไหว D8+D17 (5) | ✅ ✅ ✅ ✅ ✅ |
| S4 บันทึกการดู (2) | ✅ ✅ |
| S5 สำเนาข้อมูล (3) | ✅ ✅ ✅ |
| S6 ลบข้อมูล + สายอนุมัติ + ลบอัตโนมัติ (5) | ✅ ✅ ✅ ✅ ✅ |
| S7 หน้าจอ (2) | ✅ S7.1 · ❌ **S7.2 = ภาพ (builder ห้าม build — Fable ถ่าย)** |
| S8 ทะเบียน event/โครง (2) | ✅ ✅ |

รัน **3 รอบ** (รอบแรกก่อนมี UI 24/26 · หลังทำ UI 25/26 · หลัง reseed ของ M1.1 อีกครั้ง 25/26) ⇒ ข้อสอบคืนสภาพเองครบและผลนิ่ง

---

## 5. Regressions (รันเองทั้งหมด · ทีละ 1 ชุด เครื่อง 2 คอร์)

| ชุด | ผล |
|---|---|
| `qc-member-m1.1` (ชุดนี้ **reseed** ตัวเอง — ดู §7) | 🟢 **28/28** |
| `qc-member-m1.2` | 🟢 **27/27** (รันซ้ำหลัง reseed ก็ 27/27) |
| `qc-member-m1.3` | 🟢 **14/14** |
| `qc-member-m1.4` | 🟢 **37/37** (รันซ้ำหลัง reseed ก็ 37/37) |
| `qc-member-m1.5` | 🟢 **20/20** (รันซ้ำหลัง reseed ก็ 20/20) |
| `qc-member-m1.9` | 🟢 **26/26** (รันซ้ำหลัง reseed ก็ 26/26) |
| `qc-approval-wiring` | 🟢 **7/7** (×2) |
| `qc-nav-functions` (เพิ่มเอง — แตะ `nav.ts`) | 🟢 **ผ่านทั้งหมด 11 เช็ก** |
| `qc-cron` (เพิ่มเอง — แตะ `cron.ts`) | 🟢 **4/4** |
| `tsc --noEmit` (`NODE_OPTIONS=--max-old-space-size=3584`) | 🟢 ไม่มี error |
| `fitness.mts` **ไม่มี env** (`env -u DATABASE_URL -u DIRECT_URL`) | 🟢 **23/23** |
| `fitness.mts` **มี env QC** | 🟢 **23/23** |
| `prisma migrate deploy` (QC) | ✅ `20261014000000_member_v2_b2` applied |
| `prisma migrate diff … --script` | ✅ `-- This is an empty migration.` |

> `fitness` รอบแรกได้ 22/23 (MINOR `F7.2` สั่งให้ถอด `lib/core/sanitize.ts` ออกจาก `XREF_BASELINE` เพราะไฟล์ถูกสร้างแล้ว) → ถอดตามที่ ratchet สั่ง → 23/23 ทั้งสองโหมด

---

## 6. หนี้ (ทิ้งไว้ให้ WO ถัดไป / Fable)

1. **sanitizer 2 ตัว**: `core/sanitize.ts` (ใหม่) กับ `kanban/sanitize.ts` (เดิม) — ควรรวมเป็นตัวเดียวในใบเก็บกวาด (ต้องรัน qc บอร์ดงานทั้งชุดด้วย จึงไม่ทำในใบนี้)
2. **ข้อความขอความยินยอมต่อช่องทาง** ยังสร้างจากป้ายของทะเบียน (`"อนุญาตให้ร้านส่งข่าวสารและสิทธิพิเศษทาง<ช่องทาง>"`) — ร้านยังแก้เองไม่ได้ · ภาพ 14 มีคอลัมน์นี้เป็นข้อความของร้าน ⇒ ย้ายไปเก็บใน settings ที่ **M3.6 (แจ้งเตือน)** พร้อมช่อง "ค่าเริ่มต้นตอนสมัคร" (ตอนนี้แสดงเป็น "ถาม" ตายตัว)
3. **ปุ่ม "ดาวน์โหลด"** ของคำขอที่ทำแล้วยังไม่มี (bundle ถูกคืนกลับตอนกดขอ แต่ยังไม่เก็บเป็นไฟล์) — ต้องมี `fileId` + storage ⇒ ใบ **M1.11** (REST ส่งไฟล์) หรือใบ storage แยก · คอลัมน์ `MemberPrivacyRequest.fileId` เตรียมไว้แล้วตั้งแต่ M1.1
4. **หน้าคำขอฝั่งลูกค้า** (`/m/*` กดขอสำเนา/ขอลบเอง) = **M2.9** — ฝั่ง service รองรับแล้ว (`actor.role === "CUSTOMER"` ผ่านทั้ง consent/export/erase)
5. `consentStats` นับความยินยอมในขอบเขต **ร้าน** ไม่ใช่ระบบสมาชิก (ตาราง `MemberConsent` ไม่มี relation ไป `Customer` ตาม §4.3) — ร้านที่มีระบบสมาชิก 2 ระบบจะเห็นตัวเลขรวม · เป็นตัวเลขสรุปบนการ์ด ไม่ใช่ตัวเลขคิดเงิน
6. **prod**: migration `member_v2_b2` ต้องขึ้น prod พร้อม deploy · ไม่มี backfill ให้รัน (ตารางนโยบายว่างทุกร้าน)

---

## 7. คืนสภาพชุดข้อมูล QC

| ของ | สถานะหลังรันทุกชุด (ตรวจด้วยคิวรีตรง) |
|---|---|
| `Customer` ในร้าน QC | **60** (เท่าเดิม) · ที่ถูก anonymize = **0** |
| `MemberPrivacyRequest` | **0** |
| `MemberPrivacyPolicy` | **0** |
| `MemberSensitivePolicy` | **0** |
| `ApprovalRequest` | **0** |
| `MemberAccessLog` | **0** |
| `AppSystem.settings` ของระบบสมาชิก | `{}` (ค่า `autoEraseYears` ถูกคืน) |
| `OutboxEvent` ค้าง (PENDING/FAILED) | **0 / 0** — ระบายเองจนเงียบหลังจบงาน (5 ใบสุดท้ายที่ข้อสอบทิ้งไว้เพราะ emit หลัง drain ครั้งสุดท้าย) |

หมายเหตุ: `qc-member-m1.1` S3.4 **ลบร้านแล้ว seed ใหม่ตามดีไซน์** (tenantId เปลี่ยน · `scripts/member-expected.json` ถูกเขียนใหม่ = ไฟล์นี้ขึ้น modified ใน git แต่เนื้อหาเป็น id ชุดใหม่เท่านั้น) ⇒ หลัง reseed **รันซ้ำ M1.2/M1.4/M1.5/M1.9/M1.7/approval-wiring ใหม่ทั้งหมด** และเขียวครบตามตาราง §5

---

## 8. เวลา

อ่านสัญญา/พิมพ์เขียว/โค้ดเดิม/ภาพ 14 ~45 นาที · เขียน service + migration ~35 นาที · UI (หน้า/คอมโพเนนต์/actions/nav) ~30 นาที ·
ข้อสอบ 3 รอบ + regressions 9 ชุด + tsc + fitness ×2 + คืนสภาพ ~35 นาที ⇒ **รวม ~2 ชม. 25 นาที** · งานหนักรันทีละ 1 ตลอด

---

## ตรวจภาพ

<!-- เว้นไว้ให้ Fable: ถ่าย settings-privacy-owner (desktop/mobile) + settings-privacy-thana (404) เทียบภาพ 14 แล้วบันทึกผล + บรรทัด PARITY -->

## ตรวจภาพ (Fable · 10 ก.ย. 2569)
- `.qc-shots/member/1.7/settings-privacy-owner-desktop.png` เทียบ `ledger/design-member/14-consent-pdpa-settings.png` — 2 คอลัมน์ครบ 6 บล็อก: นโยบาย (เวอร์ชัน/บังคับใช้/ยอมรับแล้ว n/60 + ปุ่ม แก้ข้อความ/ออกเวอร์ชันใหม่) · ช่องทางความยินยอม 6 ช่องจากทะเบียน (ข้อความ · ค่าเริ่มต้น "ถาม"/"ถาม (ยังส่งออกไม่ได้)" · ยินยอมแล้ว) · บันทึกการเข้าถึง (ตัวกรอง ใคร/ช่วง) · ใครดูอ่อนไหวได้ (เมทริกซ์ ส่วน/ฟิลด์ × จ/ผ/พ × ตำแหน่ง/แผนก HR × สาขาเดียวกัน · คำเตือน "พนักงาน 1 คนยังไม่ผูกบัญชี" ลิงก์ HR · สวิตช์บันทึกการดู) · คำขอ PDPA (ค้น + ขอส่งออก/ขอลบ) · ลบอัตโนมัติ (dropdown ปี) · มือถือซ้อนเป็นคอลัมน์เดียว · thana 404
- จุดต่างที่ยอมรับ: ยังไม่มีนโยบาย/ประวัติการดู/คำขอใน seed จึงเป็น empty state · ชิปตำแหน่งยังว่าง (ยังไม่ได้ตั้ง) แสดง dropdown "เพิ่มตำแหน่ง/แผนก" แทน
- **PARITY: ผ่าน**

