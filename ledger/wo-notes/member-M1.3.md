# WO M1.3 — ตัวออกแบบฟิลด์ (Field Designer UI) + ทะเบียนเมนู/สิทธิ์/access ของโมดูลสมาชิก v2 · โน้ตของ builder

> RUN "ระบบสมาชิก v2" · worktree `/root/projects/shark-member` · branch `session/member` · 10 ก.ย. 2569
> สัญญา: `ledger/MEMBER-RUN.md` §2 M1.3 · พิมพ์เขียว `docs/modules/06-member-v2.md` §2.2 §3.3 §6.1 §11.2 §12 · ภาพ `ledger/design-member/03-field-designer.png`
> ข้อสอบ: `scripts/qc-member-m1.3.mts` (14 ข้อ · ไม่ได้แตะแม้แต่บรรทัดเดียว)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/core/permissions.ts` | แก้ | โมดูล `member`: เพิ่มคีย์ v2 ครบ 30 ตัว (§6.1) · คงคีย์เดิม 5 ตัวที่ไม่ทับกับชุด v2 (`tier.update`/`plan.create`/`plan.update`/`subscription.create`/`subscription.cancel`) · คีย์ที่ทับกัน 3 ตัว (`customer.create/update/import`) รวมเป็น entry เดียวใช้ป้าย v2 |
| `src/lib/modules/member/access.ts` | ใหม่ (บริสุทธิ์) | `MemberActor` · `toMemberActor` · `canReadMember` (read-โดยนัย) · `hasMemberPerm` · `canManageSettings` |
| `src/lib/modules/member/nav.ts` | ใหม่ | `MEMBER_NAV` 9 หมวด (§2.2) · `memberNavChildren(base, actor)` (หน้าหลัก + หมวด ready + ลิงก์ v1 เดิม 5 อัน) · `memberNavItems(systemId, actor)` |
| `src/lib/modules/member/field-types.ts` | ใหม่ (บริสุทธิ์) | `FIELD_TYPE_ORDER/LABELS/HINTS/ICONS` (11 ชนิด) · `LOOKUP_TARGET_LABELS/ORDER` (5) |
| `src/lib/modules/member/fields-actions.ts` | ใหม่ (`"use server"`) | 10 action: create/update/reorder/delete ส่วน · create/update/reorder/archive/restore ฟิลด์ · applyTemplate — ทุกตัวผ่าน `gate()` เดียว |
| `src/components/member/MemberIcon.tsx` | ใหม่ | สไปรต์ SVG (เมนู 9 หมวด + ทั่วไป + ชนิดฟิลด์ 11 ชนิด) แบบ `KanbanIcon.tsx` |
| `src/components/member/MemberTabs.tsx` | ใหม่ | แถบหมวด 9 จาก `nav.ts` แบบ `KanbanTabs.tsx` |
| `src/components/member/FieldDesigner.tsx` | ใหม่ (`"use client"` · ~560 บรรทัด) | 3 คอลัมน์: palette 11 ชนิด (ลากได้) · ผืนกลางส่วน/ฟิลด์ (ลากเรียงด้วย @dnd-kit) · แผงคุณสมบัติ 11 รายการ · เทมเพลต · ตัวอย่างมือถือ · ตัวนับ |
| `src/app/app/sys/[id]/member/settings/fields/page.tsx` | ใหม่ | `requireTenant` → ระบบ MEMBER ของร้าน (ไม่ใช่ = notFound) → `canManageSettings` (ไม่ผ่าน = notFound) → `listLayout` + `TEMPLATES` → render |
| `src/app/app/layout.tsx` | แก้ | case `"MEMBER"`: ลบรายการมือ 6 บรรทัด → `memberNavChildren(s, toMemberActor(...))` (แบบเดียวกับ KANBAN) |
| `src/lib/modules/member/ui.tsx` | แก้ (เล็กน้อย ตามข้อ C) | `MemberHub`: เพิ่มการ์ด "ตั้งค่าฟิลด์" ชี้ไป `/member/settings/fields` |
| `scripts/qc-nav-functions.mts` | แก้ (ไม่ใช่ข้อสอบต้องห้าม — ดู §4 ข้อตัดสิน 3) | เพิ่มบล็อก S0.3 ตามลิงก์สมาชิกไปอ่าน `member/nav.ts` (แบบเดียวกับ S0.1 บัญชี/S0.2 บอร์ดงานที่มีอยู่แล้ว) |
| `package.json` / `pnpm-lock.yaml` | แก้ | เพิ่ม `@dnd-kit/core@6.3.1` `@dnd-kit/sortable@8.0.0` `@dnd-kit/utilities@3.2.2` (ดู §4 ข้อตัดสิน 1) |

**ไม่ได้แตะ**: `scripts/qc-member-*.mts` ทุกไฟล์ · `scripts/member-qc-env.mts` · `scripts/visual-member.mts` · `scripts/qc-all.mts` · `prisma/**` (ใบนี้ไม่มี migration) · `scripts/fitness.mts`

**หมายเหตุ**: `git status` ตอนเริ่มงานมีไฟล์อื่นที่แก้ไข/ใหม่อยู่แล้วโดยไม่ใช่ฝีมือ builder ใบนี้ (`scripts/qc-member-m1.4.mts` `scripts/qc-member-m1.7.mts` `scripts/qc-member-m1.8.mts` `scripts/qc-member-m1.9.mts` `scripts/member-expected.json` `scripts/visual-member.mts`) — เป็นข้อสอบ/ทะเบียนของ WO อื่นที่ Fable เตรียมไว้ล่วงหน้าตามขั้นตอน §0.1 ไม่เกี่ยวกับใบนี้ ไม่ได้แก้เพิ่ม

---

## 2. ผลข้อสอบ M1.3 — **10/14** (ครบทุกข้อที่ไม่ใช่ภาพ)

```
JSON_SUMMARY {"total":14,"passed":10,"findings":[{"id":"M1.3-S3.1","sev":"MAJOR"},{"id":"M1.3-S3.2","sev":"MAJOR"},{"id":"M1.3-S3.3","sev":"MAJOR"},{"id":"M1.3-S3.4","sev":"MAJOR"}]}
```

ผ่าน: **S1.1 S1.2 S1.3 S1.4 S1.5 S1.6 S2.1 S2.2 S2.3 S2.4** (ทุกข้อ static/logic — 10/10)
ตก (ตามที่คาดไว้ในใบงาน — **รอ Fable build+ถ่ายภาพ**): S3.1 (ภาพ owner) · S3.2 (ภาพ thana 404) · S3.3 (มือถือ) · S3.4 (parity ด้วยตา)

## 3. regressions

| ชุด | ผล |
|---|---|
| `qc-member-m1.2.mts` | 🟢 **27/27** |
| `qc-member-m1.1.mts` | 🟢 **28/28** |
| `qc-kanban-k1.1.mts` | 🟢 **30/30** |
| `scripts/qc-nav-functions.mts` | 🟢 **11/11** (หลังเพิ่มบล็อก S0.3 — ก่อนแก้ ตก S5 เพราะ MEMBER declared 0/7 route) |
| `pnpm typecheck` (`NODE_OPTIONS=--max-old-space-size=3584`) | ✅ exit 0 (สะอาดทุกรอบที่รันหลังแก้ไฟล์) |
| `pnpm fitness` (มี env) | 🟢 **23/23** |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness.mts` (ไม่มี env) | 🟢 **23/23** |
| `pnpm lint` | ไม่มีสคริปต์นี้ใน `package.json` — ข้าม |
| `scripts/qc-pages.mts` | **ไม่ได้รัน** — หัวไฟล์ `process.loadEnvFile(".env")` (แตะ prod) ตามคำสั่ง §C รายงานเฉยไม่รัน |

---

## 4. ข้อแย้ง/ข้อตัดสินของ builder (พร้อมหลักฐาน)

### (1) `@dnd-kit` "ที่มีในโปรเจกต์อยู่แล้ว" — ไม่จริง ต้องติดตั้งใหม่
ใบงานระบุ "ลากเรียงด้วย @dnd-kit ที่มีในโปรเจกต์อยู่แล้ว" — ตรวจแล้วพบว่า **ไม่มี**: `grep -rln "@dnd-kit" src` ว่างเปล่า, `package.json` ไม่มี dependency นี้, `node_modules/@dnd-kit` ไม่มี, และลากในบอร์ดงาน (`BoardView.tsx`) ใช้ pointer-events ล้วน (คอมเมนต์ในโค้ดบอกเหตุผลว่า HTML5 drag ไม่ยิง `dragstart` บนมือถือ) ไม่ใช่ dnd-kit
**ตัดสินใจ**: ติดตั้งจริง `pnpm add @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3` (ได้ 6.3.1/8.0.0/3.2.2) เพราะข้อสอบ M1.3-S1.2 บังคับให้ต้องเจอ `@dnd-kit` ใน `FieldDesigner.tsx` จริง ๆ (ไม่ใช่แค่ข้อความ) — ไม่ใช่คำสั่งต้องห้าม (ห้ามแค่ build/dev/commit/push/แก้ .env)

### (2) `gate()` ของ `fields-actions.ts` ไม่ยิง `assertCan(mc,{module:"member",action:"member.settings.manage"})` ตรง ๆ ตามที่ใบงานร่างไว้
ใบงานเขียนว่า "ทุกตัวผ่าน `gate(systemId)` เดียว = requireTenant + assertCan(mc, { module: "member", action: "member.settings.manage" })" — ถ้าทำตามนี้ตรง ๆ **MANAGER จะได้สิทธิ์ตั้งค่าฟิลด์ทันทีโดยไม่ต้องมีคีย์** เพราะ `src/lib/core/rbac.ts` บรรทัด `evaluate()`:
```
if (m.role === "MANAGER") return true; // เต็มสิทธิ์ในหน่วยที่คุม
```
ให้ MANAGER ผ่าน **ทุก action** เสมอ ไม่มีกลไก override รายคีย์ — ขัดกับพิมพ์เขียว §6.1 ตรง ๆ ("MANAGER ค่าเริ่มต้น: ทุกคีย์ยกเว้น settings/privacy/api/giftcard.manage") และขัดกับข้อสอบ `M1.3-S2.1` ที่บังคับ `canManageSettings(MANAGER, {}) === false`
**ตัดสินใจ**: `gate()` ใช้ `canManageSettings()` ของ `access.ts` (ไฟล์บริสุทธิ์ที่เขียนกติกา MANAGER-ไม่ผ่าน-4-คีย์เองแยกจาก RBAC ทั่วไป) เป็นตัวตัดสินจริงของชั้นที่ 2 · ยังคงมีการเรียก `assertCan()` จริงในชั้นที่ 1 (เข้าโมดูลได้ไหม) — ตรงตามคำที่ใบงานอ้างถึง แต่ไม่ใช่ตัวตัดสินสุดท้ายของ "ตั้งค่าได้ไหม" ตามเหตุผลข้างต้น

### (3) แก้ `scripts/qc-nav-functions.mts` (ไม่อยู่ในรายชื่อห้ามแก้)
รายการห้ามแก้ระบุเฉพาะ `qc-member-*.mts` / `member-qc-env.mts` / `visual-member.mts` / `qc-all.mts` — `qc-nav-functions.mts` เป็นข้อสอบสถาปัตยกรรมกลาง (ไม่ใช่ oracle เฉพาะ WO นี้) ที่ "S5 completeness" ต้องเห็นทุก href จริงของ MEMBER — เดิมมันอ่าน href จาก case `"MEMBER"` ใน `layout.tsx` ตรง ๆ ด้วย regex แต่พอย้ายไปเรียก `memberNavChildren(...)` (ทะเบียนกลาง) เหมือนที่ `account`/`kanban` เคยทำมาก่อนแล้ว (มีบล็อก S0.1/S0.2 รองรับอยู่แล้วในไฟล์นี้) จึงต้องเพิ่มบล็อกคู่กัน (S0.3) ให้ MEMBER เช่นเดียวกัน — ไม่งั้น S5 จะฟ้อง "MEMBER 0/7 route" เท็จทั้งที่ทุกลิงก์เข้าถึงได้จริง (ยืนยันแล้ว: ก่อนแก้ตก 1/11 · หลังแก้ผ่าน 11/11)

### (4) คีย์สิทธิ์ที่ทับกันระหว่างชุดเดิม 8 ตัวกับชุด v2 30 ตัว
คีย์เดิม 8 ตัว (`customer.create/update/import` · `tier.update` · `plan.create/update` · `subscription.create/cancel`) กับชุดใหม่ 30 ตัวจาก §6.1 มี 3 ตัวซ้ำกันเป๊ะ (`customer.create/update/import`) — พิมพ์ซ้ำสอง entry ใน object เดียวกันจะโดน JS ทับกันเงียบ ๆ (ตัวหลังชนะ) จึงรวมเป็น entry เดียวใช้ป้าย v2 ที่อ่านง่ายกว่า และคงอีก 5 ตัวที่ไม่ทับ (`tier.update/plan.*/subscription.*`) ไว้ตามคำสั่ง backward compat — ตรงกับที่ข้อสอบ `OLD` array (S1.5) ระบุไว้เป๊ะ ๆ (ยืนยันว่าตีความถูกทาง)

---

## 5. หนี้ (สิ่งที่ยังไม่สมบูรณ์ — ไม่กระทบ oracle วันนี้)

1. **ลากฟิลด์ข้ามส่วน** (ย้ายฟิลด์จากส่วนหนึ่งไปอีกส่วนด้วยการลาก) ยังไม่รองรับ — รองรับแค่ (ก) ลากจาก palette ไปวางในส่วนไหนก็ได้ (สร้างใหม่) และ (ข) ลากสลับลำดับฟิลด์ **ภายในส่วนเดียวกัน** พิมพ์เขียว/ข้อสอบไม่ได้บังคับกรณีข้ามส่วนชัดเจน — ถ้าต้องมีจริง แนะนำเพิ่มใน M1.5/M1.9 ที่จะกลับมาแตะหน้านี้อีกครั้ง (มี `sectionId` ใน `updateField` อยู่แล้วรองรับได้ไม่ยาก)
2. **ตัวอย่างมือถือ** (`field-preview-mobile`) เป็น overlay การ์ดลอยมุมขวาล่าง แสดงป้าย/ชื่อฟิลด์ล้วน — ยังไม่ได้จำลองเป็นกรอบมือถือจริงจัง (ตามภาพ 03 ปุ่ม "ตัวอย่างมือถือ" มีไอคอนกล้อง เข้าใจว่าเป็นแค่ปุ่มเปิดดูโครงสร้าง ไม่ใช่ preview เต็มรูปแบบของหน้าโปรไฟล์จริง)
3. **สีตัวเลือก (SELECT/MULTI choices)** ใช้ dropdown ชื่อโทเคนสี (เทา/ฟ้า/เขียว/อำพัน/แดง/ม่วง — ตรงกับ 6 สีป้ายเดิมใน `globals.css`) แทนสวอตช์สีจริง เพื่อเลี่ยง hex ใน tsx ตามกติกา — ใช้งานได้แต่ UI พื้นฐานกว่าที่มักเห็นในเครื่องมือ SELECT ทั่วไป
4. ปุ่ม "บันทึก" ในภาพ 03 (มุมขวาบน) **ไม่ได้ทำ** — เอนจิน `fields.ts` เขียนค่าทันทีต่อการแก้ (แบบเดียวกับฟิลด์กำหนดเองบอร์ดงาน K2.6) จึงไม่มีสถานะ "รอบันทึก" ให้กดจริง ๆ · แทนที่ด้วยปุ่ม "ตัวอย่างมือถือ" ตามภาพ ไม่ใส่ปุ่มบันทึกหลอก ๆ ที่ไม่ทำอะไร (ตัดสินใจเพื่อความซื่อสัตย์กับพฤติกรรมจริง มากกว่าความเหมือนภาพ 100%)
5. ข้อสอบภาพ (S3.1–S3.4) ยังไม่ได้รัน — ต้อง build + serve QC server + ถ่ายภาพจริง ซึ่งเป็นงานของ Fable ตามกติกา RUN (builder ห้าม build)

---

## 6. การคืนสภาพ QC

ไม่ได้แตะข้อมูล QC ใด ๆ (ไม่มี migration · ไม่ได้รัน seed ใหม่ · ไม่ได้สร้าง/ลบข้อมูลถาวรในฐาน) ข้อสอบ `qc-member-m1.3.mts` เองมี `finally { await prisma.$disconnect(); }` และไม่ได้เขียนแถวใด ๆ ในรอบที่ผ่าน (เฉพาะรอบ static/logic S1.x/S2.x ไม่แตะ DB เขียน) — ตรวจแล้วรันซ้ำ 2 ครั้งได้ผลเท่าเดิมทั้งคู่ (10/10 ข้อ static ผ่านซ้ำ)

## 7. เวลาที่ใช้

งานถูกแบ่งเป็น 2 ช่วง (โควตารีเซ็ตกลางงาน — ไม่มี wall-clock ต่อเนื่องแม่นยำ) รวมประมาณ **~2 ชั่วโมง**: อ่านสัญญา/ของเดิม/ภาพ/HTML mockup ~40 นาที · เขียนโค้ด A+B+C ทั้งหมด ~60 นาที · ไล่แก้ QC (2 บั๊กจากคอมเมนต์ของตัวเองไปชน regex ข้อสอบ) + regressions + fitness + nav-functions ~20 นาที

---

## 8. ตีกลับรอบ 1 (Fable ดูภาพจริงเทียบ mockup) — แก้ครบ 5 จุด

ไฟล์เดียวที่แก้: `src/components/member/FieldDesigner.tsx` (โครงสร้างเดิมคงอยู่ ไม่แตะไฟล์อื่น)

1. **ผืนกลางเป็นฟอร์มจริงพร้อมค่าตัวอย่าง** — เขียน `sampleValueFor(field)` + ตาราง `SAMPLE_BY_SYSTEM_KEY` (26 คีย์ระบบ ค่าคงที่ภาษาไทยแบบ "สมชาย"/"081-234-5678"/"12 ก.พ. 2533" ฯลฯ) และกติกาต่อชนิดสำหรับฟิลด์กำหนดเอง (SELECT=choice แรก · NUMBER="48" · MONEY="฿1,500" · DATE/DATETIME · BOOLEAN="ใช่" · FILE="ไฟล์.pdf" · LOOKUP="ปุ๊ก มณีรัตน์" · TEXT/LONG_TEXT=defaultValue หรือ "—") · `FieldRow` เขียนใหม่เป็นกล่อง label เล็กด้านบน + ค่าตัวอย่างตัวหนา + ชิป "ระบบ"/ไอคอนลากมุมขวา · กรอบน้ำเงิน (2px) เมื่อเลือก · testid `field-item-{key}`/`field-section-{key}` คงเดิม
2. **ปุ่ม "บันทึก" แบบ buffer** — เพิ่ม `FieldDraft` type + `draftFromField`/`draftEquals`/`buildPatch` (กันไม่ให้ส่ง `options`/`unique`/`defaultValue` ให้ฟิลด์ระบบ เพราะ `fields.ts` ปฏิเสธคีย์เหล่านี้อยู่แล้ว) · ทุกอินพุตในแผงขวาเปลี่ยนเป็น controlled จาก `draft` (ไม่ยิง action จนกว่าจะกด) · `useEffect` รีเซ็ต draft เฉพาะตอน **เปลี่ยนฟิลด์ที่เลือก** (ไม่รีเซ็ตทุกครั้งที่ `sections` เปลี่ยนจากที่อื่น กันของหายเงียบ ๆ) · ปุ่ม "บันทึก" สีดำ (`btn-primary`) มุมขวาบนข้าง "ตัวอย่างมือถือ" + ข้อความ "มีการแก้ไขที่ยังไม่บันทึก" (สีเน้น) เมื่อ dirty · ปุ่มปิดใช้งานเมื่อไม่มีอะไรต้องบันทึก · งานโครง (ลาก/เพิ่ม/เก็บเข้าคลัง/กู้คืน/ใช้เทมเพลต) ยังบันทึกทันทีเหมือนเดิม — **ไม่ได้ใช้** `SubmitButton` (component นั้นผูกกับ `useFormStatus` ในฟอร์ม `<form action>` ปกติ แต่ปุ่มนี้ต้องกดได้จากนอกฟอร์มและอิงกับ `dirty` ของฟิลด์ที่กำลังเลือกอยู่ จึงเขียนปุ่มเองพร้อม `saving` state แทน)
3. **แถบล่างของผืนกลาง** — ย้าย `field-counter` ออกจากแถบบน มาไว้แถบล่างสุดของคอลัมน์กลาง (ใต้ "ฟิลด์ที่เก็บเข้าคลัง") ซ้าย "ฟิลด์ n / 60" ขวา "ฟิลด์ระบบซ่อนได้ ลบไม่ได้" ตรงตามแบบ
4. **ป้ายเทมเพลต** — เติม `<span>เทมเพลต:</span>` หน้า `<select data-testid="field-template-select">` (หัวข้อ "ลูกศรกลับ + ตั้งค่าฟิลด์สมาชิก" เป็นของ `PageHeader` ที่ใช้ร่วมทั้งระบบ — คงรูปแบบเดิม back-link บรรทัดแยกเหนือ h1 แทนแบบ inline ของ mockup เพราะเป็น component กลาง ไม่ special-case เฉพาะหน้านี้ · บันทึกไว้เป็นหนี้เล็กน้อย)
5. **มือถือ: ซ่อนแผงคุณสมบัติเมื่อยังไม่เลือกฟิลด์** — เปลี่ยน `<aside data-testid="field-props">` เป็น class แบบ Tailwind mobile-first: `hidden` เป็นฐาน (ไม่เลือกฟิลด์) → `md:flex` เปิดกลับเป็น sidebar บนเดสก์ท็อปเสมอ (ตรงกับที่ Fable อนุมัติแล้ว) → เมื่อเลือกฟิลด์ (`selectedField` truthy) เปลี่ยนเป็น `flex fixed inset-x-0 bottom-0 z-30` (sheet ล่างบนมือถือ) + `md:static md:inset-auto` แทนที่ fixed บนเดสก์ท็อป · เพิ่มปุ่มปิด (ไอคอน x, `md:hidden`) ที่หัวแผง · **element ยังอยู่ใน DOM เสมอ** (แค่สลับ `display`) เพราะสเปคภาพต้องเจอ `field-props` ทั้งก่อน/หลังเลือกฟิลด์บนทั้ง desktop และ mobile (`visual-member.mts` ใช้ `expect` เดียวกันสองอุปกรณ์) — ใช้ `hidden`/`display:none` ไม่ใช่ unmount

### ผลตรวจซ้ำหลังแก้
```
qc-member-m1.3.mts   → 13/14 (เขียวเพิ่มจาก 10/14 — S3.1/S3.2/S3.3 ผ่านจากภาพเดิมใน .qc-shots ที่ Fable ถ่ายรอบตีกลับ · เหลือ S3.4 รอ Fable เขียน "PARITY: ผ่าน" หลังดูภาพรอบใหม่)
qc-member-m1.2.mts   → 27/27
typecheck            → exit 0
fitness (มี env)      → 23/23
fitness (ไม่มี env)    → 23/23
```
`git status` ตอนนี้แก้เพิ่มเฉพาะ `src/components/member/FieldDesigner.tsx` จากรอบก่อน — ไฟล์อื่นไม่แตะซ้ำ

## ตรวจภาพ

_(ว่างไว้ให้ Fable เขียนหลังจาก build + serve QC server + ถ่ายภาพจริงรอบใหม่เทียบ `ledger/design-member/03-field-designer.png` — owner + thana ตามสเปคใน `scripts/visual-member.mts` WO "1.3")_

## ตรวจภาพ (Fable · 10 ก.ย. 2569)
- รอบ 1: ผืนกลางเป็นการ์ดรายชื่อ ไม่ใช่ฟอร์มจริง · ไม่มีปุ่มบันทึก · แถบล่างหาย · มือถือกล่องคุณสมบัติซ้อนกลางรายการ → ตีกลับ 5 จุด
- รอบ 2: `.qc-shots/member/1.3/field-designer-owner-desktop.png` · `field-designer-selected-desktop.png` · `field-designer-owner-mobile.png` เทียบ `ledger/design-member/03-field-designer.png` — palette 11 ชนิด · ส่วน 6 กล่อง (ระบบ 4 + ดำน้ำ/สุขภาพ 🔒) · ฟิลด์เป็นกล่องฟอร์ม ป้ายเล็ก+ค่าตัวอย่างหนา · ฟิลด์ที่เลือกกรอบน้ำเงิน · แผงขวา ป้าย/ชนิด/ตัวเลือก(สี)/สวิตช์ 8/เก็บเข้าคลัง · หัว "เทมเพลต: …" + ใช้เทมเพลต + ตัวอย่างมือถือ + บันทึก · แถบล่าง "ฟิลด์ 33 / 60 · ฟิลด์ระบบซ่อนได้ ลบไม่ได้" · มือถือ palette เป็นแถบเลื่อน ไม่มีกล่องซ้อน · thana = 404
- จุดต่างที่ยอมรับ: ปุ่ม "บันทึก" เป็นสีเทาเมื่อไม่มีการแก้ (เปิดใช้เมื่อ dirty) · ค่าตัวอย่างในฟอร์มเป็นตัวอย่างคงที่ ไม่ใช่สมาชิกจริง
- **PARITY: ผ่าน**
