# WO S0.2 — ธีม Airy ในแอป (RN) + เครื่องมือถ่าย/เทียบภาพ + ข้อสอบ UI ใช้ร่วม

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-b` branch `wip/sec-s0.2` (ฐาน 1eb52030) · 2026-11-04 UTC · builder: ตัวแทน Opus
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S0.2.md` (+ COMMON) · ภาพ `ledger/design-secretary/sec-c.jpg` หน้า 4 (C3) + `sec-dark-c.jpg` หน้า 4
> ข้อสอบ: `scripts/qc-sec-s0.2.mts` (30 ข้อ · commit 0b246226 · **แก้หลัง commit หรือไม่: ไม่**)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ผู้ตรวจ) — ไม่ push (ผู้คุมสั่งไม่ push)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| apps/mobile/src/theme/{tokens,light,dark,index}.ts | ใหม่ | โทเคนขนาด · ชุดสีสว่าง/มืด (คีย์เท่ากัน) · useTheme/ThemeProvider + ตัวช่วย glass/orb/screenBg/halo/zoneColor |
| apps/mobile/src/theme.ts | แก้ (shim) | C = legacyLight · R = legacyR · S = legacyS (ค่าเดิมทุกตัว) |
| apps/mobile/src/lib/theme-store.ts | ใหม่ | system/light/dark · เว็บ localStorage · มือถือ expo-secure-store · คีย์ `shark_theme` |
| apps/mobile/src/components/airy/*.tsx (16 + index.ts) | ใหม่ | Glass TopBar IconBtn Orb Chip Dot SysTag/SysBadge Sheet InputBar(ไม่มีไมค์) Tabs Segment SectionLabel Note PrimaryButton AiryScreen Icon |
| apps/mobile/app/(app)/secretary/index.tsx | ใหม่ | placeholder หน้า C3 จาก fixture (ไม่เรียก API) |
| apps/mobile/app/(app)/secretary/_gallery.tsx | ใหม่ | แกลเลอรี dev-only (`__DEV__ \|\| EXPO_PUBLIC_QC==="1"` ไม่งั้น Redirect /secretary) |
| apps/mobile/qc/shoot-sec.mjs | ใหม่ | สำเนา shoot-crm + ROUTES/FIXTURE/--dark/--both/tall · summary รวมตามชื่อ |
| apps/mobile/qc/fixtures/secretary/{s0.2.json,README.md} | ใหม่ | fixture + รูปแบบ |
| scripts/parity-sec.sh | ใหม่ | ตัดจอจากภาพแบบ (กริดในหัวไฟล์) → MOCKUP \| 1px \| RENDER |
| scripts/qc-sec-ui.mts | ใหม่ | ข้อสอบ UI ใช้ร่วม U1–U7 |
| apps/mobile/qc/shots-sec/** | ใหม่ | ภาพ + summary + ภาพคู่ + ก่อน/หลังจอ 1.0 |
ไม่แตะ `_layout.tsx` หรือจอ 1.0 ใด ๆ · ไม่แตะ package.json

## 5. ผลข้อสอบ
- forced #1 / #2 / unforced (รวม typecheck): `JSON_SUMMARY {"total":30,"passed":30,"failed":[],"skipped":[],"findings":[]}` ×3 exit 0
- `ROUTES=/secretary qc-sec-ui.mts`: `{"total":9,"passed":9,...}` · positive control: ROUTES=/secretary/nope ⇒ U1–U6 FAIL exit 1
- mobile typecheck 0 · fitness 53/53 ทั้งมี env และ `env -u DATABASE_URL`
- `parity-sec.sh` ไม่มี arg ⇒ exit 2 · คู่ตัวอย่าง ⇒ exit 0

## 6. ภาพ
คำสั่ง (จากรากรีโป):
```
bash scripts/iso.sh env QC_PREPARE=1 ROUTES=/secretary,/secretary/_gallery node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh c 4 apps/mobile/qc/shots-sec/secretary.png apps/mobile/qc/shots-sec/secretary-c3-pair.png
bash scripts/parity-sec.sh c 4 apps/mobile/qc/shots-sec/secretary-dark.png apps/mobile/qc/shots-sec/secretary-dark-c3-pair.png --dark
# จอ 1.0 ก่อน (ฐาน 1eb52030 ก่อนแก้) / หลัง:
bash scripts/iso.sh env QC_PREPARE=1 ROUTES=/login,/sessions QC_OUT=$PWD/apps/mobile/qc/shots-sec/after-1.0 node apps/mobile/qc/shoot-sec.mjs
```
| หน้า | mockup | ภาพคู่ | โหมด | overflow | จุดต่าง |
|---|---|---|---|---|---|
| C3 | c/4 | shots-sec/secretary-c3-pair.png | สว่าง | false | แบบมีแถบสถานะ 9:41 (เว็บไม่มี) · ตัวอักษรใหญ่กว่าสัดส่วนแบบ ~15% (ตั้งใจ — อ่านได้บนเครื่องจริง) · ตำแหน่งแนวตั้งของทุกชิ้นตรงแบบ ±10dp |
| C3 | c/4 dark | shots-sec/secretary-dark-c3-pair.png | มืด | false | เหมือนข้างบน · ป้าย CRM มืด = #a3abff ตามตาราง INLINE |
- จอ 1.0: `/sessions` ก่อน=หลัง 0 px ต่าง (sha เดียวกัน) · `/login` ต่างเฉพาะกล่อง 242×242 ของ orb ที่หมุน/เต้นอยู่ (AnimatedOrb — ถ่ายคนละจังหวะ) · นอกกล่องนั้น 0 px ต่าง
- placeholder: "ยังไม่ใช่จอตามแบบจริง · ข้อมูล fixture · ทำจริงที่ S2.1/S2.2"

## 7. มติทางเทคนิค
- **สเกล:** จอในภาพแบบกว้าง 536 px (= 1.37× ของ 390) · ถ้าใช้ px ตรงทั้งหมด แถวที่ 3 ของ C3 จมใต้ช่องสั่งงาน (ลองแล้ว) ⇒ `tokens.radii`/`tokens.type` = ค่าตามใบสั่ง (px ของแบบ) · `tokens.size` ย่อให้พอดีจอ (ปุ่มไอคอน 44 · ช่องสั่งงาน 56 · ปุ่มส่ง 44 · orb hero 76) · จอ C3 ตั้งตำแหน่งแนวตั้ง = แบบ × 0.73 และตัวอักษร ≈ 0.85 (ค่าคงที่ F ในไฟล์จอ) — ผู้คุมตัดสินได้ว่าจะให้ S2 ใช้สเกลเดียวกันไหม
- ไอคอน: ไม่มี react-native-svg ⇒ `@expo/vector-icons` ชุด Feather (message-square · inbox · users · help-circle · plus · chevron-* · arrow-up)
- กระจก/ไล่สี: JS ล้วน — เว็บใช้ `backgroundImage` + `backdropFilter` · มือถือใช้ `experimental_backgroundImage` (RN 0.86) + `boxShadow` string · ไม่มี expo-blur
- theme-store: ไม่มี AsyncStorage ในแอป ⇒ เว็บ localStorage · มือถือ expo-secure-store (มีอยู่แล้ว)
- import: `@/src/theme` ยังชี้ `src/theme.ts` (ไฟล์ชนะโฟลเดอร์) ⇒ จอใหม่ import `@/src/theme/index`
- ป้ายระบบใน C3 (.sugg .k) ตามภาพแบบ = กล่องเล็กไม่มีขนาด ตัวสีเนื้อความ (SysBadge ปริยาย) · แบบ .step/.lnk = `solid`
- shim S1.2: ข้อสอบหาค่า C เดิมใน theme.ts หรือ light.ts ⇒ ค่าอยู่ใน `legacyLight` ของ light.ts · dark.ts จึงมี `legacyDark` คีย์เดียวกัน (S2.1)
- QC copy: `/root/qc-shark-mobile` สร้างใหม่ตาม README ขั้น 1 (node_modules = symlink → shark-in-th/apps/mobile/node_modules มี RNW 0.21.2) · shoot-sec ใช้ `/root/qc-shark-mobile-sec` พอร์ต 4714
- `apps/mobile/node_modules` ในเลนนี้ = symlink (ไม่ถูก .gitignore เพราะ `node_modules/` จับแต่โฟลเดอร์) — ไม่ commit
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี · สิทธิ์: ไม่เปลี่ยน (route /secretary เปิดได้ด้วย URL เท่านั้น)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `scripts/sec-ui-inventory.json` ยังไม่มี (testID ของ placeholder ยังไม่ลงทะเบียน) | ไม่อยู่ใน "Files you own" · placeholder ถูกแทน | S2.1 |
| สตริงไทยใน placeholder มาจาก fixture ตรง (ยังไม่มี i18n) | ตามมติผู้คุม | S2.1 |

## ต่อจากนี้ (ถ้า restart)
ไม่มีงานค้าง — เหลือผู้คุมรันซ้ำ/ผู้ตรวจ · ถ้าแก้โค้ดจอ: รันบล็อกคำสั่ง §6 ใหม่แล้ว `bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s0.2.mts`
