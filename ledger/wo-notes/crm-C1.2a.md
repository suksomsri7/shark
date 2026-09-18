# WO C1.2a — engine ฟิลด์ (`member/fields.ts`) รับ `objectKey` (customer · contact · company · deal · custom)

> RUN "CRM v2" · branch `session/crm` · 18 ก.ย. 2569 · ผู้คุมงาน: Opus 5 · builder/ผู้ตรวจ/ผู้เขียนข้อสอบ = ตัวแทนแยก
> ข้อสอบ: `scripts/qc-crm-c1.2a.mts` (84 + META · commit `8ad1151` · G1 golden แช่แข็งพฤติกรรมลูกค้าเดิม) → **91 ข้อ** หลังเพิ่มกลุ่ม R (พิสูจน์การแก้ตามผู้ตรวจ) · ORACLE-EDIT 2 จุด (§7)

## 1. สิ่งที่ส่งมอบ
- `src/lib/modules/member/fields.ts` (1566 → ~2400 บรรทัด): `FieldCtx.objectKey` + `FieldCtx.actor` · `resolveScope` (ร้าน + ชนิดระบบ + CustomObject ที่ยังไม่เก็บ) · ฟิลด์ระบบ contact 14 / company 12 / deal 12 (`CRM_SYSTEM_TEMPLATE` · ชี้คอลัมน์จริง) · `setRecordValues` ใต้ `pg_advisory_xact_lock('member-fields:<recordId>')` · `dropSensitiveValues` (D8 · ไม่มี actor = ตัดทิ้ง · log `MemberAccessLog` page `crm.<objectKey>` ไม่ยิง event) · `recordFilterWhere` · `applySystemTemplate` · `assertHttpUrl`
- **แก้ตามผู้ตรวจ**: `GOVERNED_CRM_SYSTEM_KEYS` (คอลัมน์ที่มีกฎธุรกิจ/Party/consent/แคช — engine ปฏิเสธ ภาษาไทย ไม่โทษผู้ใช้) · กรองด้วยฟิลด์อ่อนไหวบนทาง CRM ต้องมีสิทธิ์ · `lockRecordForFieldWrite` export + tx ปลอม (PrismaClient) ⇒ เปิด tx เอง
- `member/index.ts`: `export * as fields`
- ทางลูกค้า (customer) **เหมือนเดิมทุกไบต์** — G1 14/14 ทุกรอบ

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (ผู้คุมงานรันเอง ใน worktree แยก `/root/projects/shark-crm-c12a` = HEAD + C1.2a (+C1.2b) ไม่มีงาน C1.3 ปน) |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด | ✅ | `8ad1151` แดง/SKIPPED ถูกเหตุผลก่อน builder |
| D2 | ข้อสอบเขียวเมื่อผู้คุมงานรันเอง | ✅ | 85/85 (รอบแรก) → **91/91 G1 14/14** หลัง reseed ใหม่ (`c12a-verify.log` · `c12b-verify.log`) |
| D3 | กลุ่ม X | ✅ | X1 scope · X3 ล็อกต่อเรคคอร์ด (builder พิสูจน์ negative control: ถอดล็อก = ประวัติแตกกิ่ง) + R.5/R.6 · X6 URL/เพดาน · X8 D8 + R.4 |
| D4 | regression | ✅ | ชุดสมาชิก **ทั้ง 39 ชุด** + C0.2–C1.1 + qc-crm/crm-activity + ฟอร์ม/บอร์ดงานที่ใช้ฟิลด์ — แดงเฉพาะชนิดสภาพแวดล้อม (ภาพใน `.qc-shots/` ของ worktree แยกว่าง · `.claude/skills` ไม่อยู่ใน git · log `/tmp/claude-0/qc-all` · ชุดที่ต้องมีเซิร์ฟเวอร์ :3215 → รันซ้ำกับเซิร์ฟเวอร์ใน §3.1) |
| D5 | typecheck + fitness 2 โหมด | ✅ | ดู §3.1 |
| D6 | build | ✅ | ดู §3.1 |
| D7/D8 | ภาพ/ทะเบียนปุ่ม | N-A | ไม่มี UI |
| D9 | ผู้ตรวจไม่มี BLOCKER | ✅ | ไม่มี BLOCKER · SHOULD-FIX 4 → แก้ 3 (S1 S2 S4) · S3 เป็นหนี้ C1.4/C3.9 |
| D10 | ทะเบียน/เอกสาร | N-A | ไม่มี event ใหม่ |
| D11 | คืนสภาพ QC | ✅ | m1.9 26/26 ทันทีหลังข้อสอบ + หลังจบ |
| D12 | push/deploy | ดู §3.2 | |

## 7. สิ่งที่เจอ/แก้/ตัดสิน
- **ORACLE-EDIT `C1.2a-S5.6` + `C1.2a-X6.1`** (ผู้คุมงาน · หลักฐานใน CRM-RUN §4): รายการหยิบฟิลด์มี `firstName/lastName` ที่กลายเป็นคีย์ต้องห้าม ⇒ เปลี่ยนเป็นคีย์ธรรมดา
- **กลุ่ม R (6 ข้อ)** เขียนโดยผู้เขียนข้อสอบแยก — ทุกข้อมี positive control
- ตัดสิน K3: log เก็บ id ของเรคคอร์ด CRM + page `crm.<objectKey>` ไม่ยิง event · actor ต้องส่งทุกครั้ง · archived CustomObject = ไม่พบ · กรอง IN-list ในแอป (→ C5 ถ้าช้า)
- 🔴 **ความผิดของผู้คุมงาน**: หยุดรอบตรวจรอบแรกกลาง `qc-member-m1.1` ⇒ ผู้ใช้ทดสอบ 1 + ร้านทดสอบ 1 ค้าง ⇒ m1.1 รอบถัดไป ERR (unique email) · กวาดด้วย `scripts/pending/sweep-m11-orphans.mts` (dry-run ก่อน) · บทเรียน: อย่าหยุด unit กลางชุดที่สร้างข้อมูล — รอจบชุดหรือกวาดทันที
- รอบตรวจรอบแรกไม่ได้ตั้ง `QC_ENV_FILE` (qc-crm/crm-activity CRASH เพราะหา `.env` ไม่เจอ — worktree แยกไม่มี `.env` = ปลอดภัย) → รอบสองตั้งแล้ว
- worktree แยกใช้ `node_modules` แบบ **bind mount** (Turbopack ไม่รับ symlink ออกนอก root) — 🔴 ต้อง `umount` ก่อนลบ worktree ไม่งั้นลบ node_modules ตัวจริง

## 8. หนี้ / ส่งต่อ
| เรื่อง | เจ้าของ |
|---|---|
| แถว `MemberAccessLog` ของ CRM โผล่ในหน้าความเป็นส่วนตัวของสมาชิก | **C1.4** กรอง page `crm.` · **C3.9** ลบ/ส่งออก |
| ทางลูกค้ากรองด้วยฟิลด์อ่อนไหวได้โดยไม่มีสิทธิ์ (เดิม) | **C3.9** |
| ค่า unique ตรวจนอกล็อก (สองเรคคอร์ดได้ค่าซ้ำเมื่อเขียนพร้อมกัน · ทางลูกค้าเหมือนเดิม) | **C5** |
| actor สร้างผ่าน `toMemberActor`/`memberActorForKey` เท่านั้น · bundle API ตั้ง `apiRole` | **C1.4 · C1.10** |
| `expectedCloseAt` ใช้เที่ยงคืน UTC แบบ engine | **C1.5** |
| ตัวอ่าน `CustomRecordValueHistory` ต้องใช้ D8 | **C1.9 · C3.9** |

## 3.2 D12 — push/deploy
✅ push `a7a7bce` (C1.2a `479fbd7` + C1.2b `a7a7bce`) → session/crm + main 11:45 UTC · deploy ใหม่ `dpl_6FHj9…` ขึ้นจริงหลัง 420 วิ · `/api/health` `{ok:true,db:true,outboxPending:0}` · หน้าแรก 200 · `/api/files/abc123` 403 ตามแบบ · ไม่มี migration ในใบนี้ · `settings.crm.uiVersion` ยังเป็น 1 (ไม่มีร้านใดเห็น UI ใหม่)
### 3.1 typecheck/fitness/build (worktree แยก)
typecheck exit 0 · fitness 29/29 ทั้งสองโหมด · BUILD exit 0 · เซิร์ฟเวอร์ :3215 ขึ้นแล้วรัน m2.10/m3.10/m3.11/public: แดงเหลือแค่ `.claude/skills` (M2.10-S1.2 · M3.10-S2.3) และภาพ (M3.10-S4.3 · M3.11-S3.2) · m1.1 S3.1 = ชน seed CRM (หนี้เดิม · ตัดสินตอนปิดเฟส C1) · m1.9 26/26
