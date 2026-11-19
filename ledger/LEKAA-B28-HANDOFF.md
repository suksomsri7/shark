# ใบงานส่งไม้ต่อ — แอป Lekaa build 28 (สำหรับบัญชี A · เขียน 19 พ.ย. 2026 โดยบัญชี B)

ตอบเจ้าของเป็นภาษาไทยเสมอ · ความจำร่วม 2 บัญชีอยู่ `/root/.claude/projects/-root/memory/` — อ่าน `MEMORY.md` แล้วเปิด
`project_lekaa_topbar_systems.md` (บันทึกลำดับเหตุการณ์ละเอียดของงานนี้) · `feedback_lekaa_naming_th_en.md` · `reference_expo_native_module_version_match.md` · `project_lekaa_ai_domain_move.md`

## 1. สถานะตอนส่งไม้ (ตรวจ 19 พ.ย. 03:17Z)
- **main = origin/main = `bda823d22`** · เว็บ shark.in.th เป็นโค้ดนี้แล้ว (health 200 · เส้น `rooms/[id]/retry` ตอบ 401 = มีเส้น)
- **แอป iOS 2.0.0 build 28 อยู่บน TestFlight** · เจ้าของใช้งานอยู่บนเครื่องจริง · หลัง build มี OTA 7 รอบ (JS อย่างเดียว) ล่าสุด group `51a3952a` = โค้ด `bda823d22`
- ฐานข้อมูลจริง: migrate แล้ว 2 ไฟล์ (`20261228000800_lekaa_fab` · `20261228001000_team_chat`) · จุดกู้คืน Neon `wo-restore-pre-b27-1117` ยังเก็บไว้ (ลบได้เมื่อเจ้าของยืนยัน: `pnpm neon:delete wo-restore-pre-b27-1117`)
- เจ้าของบอก: **ยังไม่มีร้านใช้จริง** · build ชี้ shark.in.th ตามเดิม · วันหนึ่งจะย้ายเป็น lekaa.ai (ยังไม่สั่งเริ่ม)
- ทรี: หลัก `/root/projects/shark-in-th` (main · มี credentials ของ iOS ใน `apps/mobile/credentials/`) · `/root/projects/shark-b27-team` (detached ที่ main · ใช้ให้ตัวแทนเขียนโค้ด/รัน QC/ถ่ายภาพ) · `/root/projects/shark-sec-ui` (สาขา `wip/build27` = main) · `/root/projects/shark-b27-fab` (สาขาเก่า รวมเข้า main แล้ว ไม่ใช้ต่อ)

## 2. สิ่งที่ส่งมอบแล้วใน build 27→28 (เจ้าของเห็นบนเครื่องจริงแล้ว ✓ / ยังไม่ยืนยัน ◻)
- ✓ แถบบนแสดงทุกระบบ ปัดได้ · ไอคอนกิจการตรึงซ้าย · แผ่น pull-down · ลากจัดลำดับ (ต่อ user · เก็บ `User.prefs.secSystemOrder[tenantId]`) · ทีม/ปฏิทิน/แดชบอร์ด เป็นช่อง built-in ลากได้ (คีย์ `team` `calendar` `home`)
- ✓ ปุ่มลอย Lekaa + แผ่นงาน · คีย์บอร์ดไม่บังช่องพิมพ์ (`KeyboardFrame` ใน `src/components/lekaa/core.tsx`)
- ✓ เข้าระบบแชทลูกค้าได้ (แก้ crash `nativeEvent` ใน `SecTopBar` แล้ว) · ตัวกันหลุด `src/lib/crash-guard.tsx` แสดง error บนจอ
- ✓ ตัวโหลดหน้าเว็บ = โลโก้ Lekaa (`public/lekaa-loading.svg` · `NavProgress.tsx`)
- ✓ ชื่อทั้งระบบ: ไทย = **เลขา** · อังกฤษ = **Lekaa** (รวมแบรนด์ SHARK ที่ผู้ใช้เห็น) — รายการเต็ม `ledger/LEKAA-RENAME-INVENTORY.md`
- ◻ งานเลขาที่ล้ม: การ์ด "ไม่สำเร็จ" + ปุ่ม "ลองอีกครั้ง" (`POST rooms/[id]/retry`) · 401/402/403 ของผู้ให้บริการ AI ล้มทันที · ปุ่ม ‹ ในหน้า "งานใหม่" — ส่ง OTA แล้ว เจ้าของยังไม่ได้ตอบว่าเห็น
- ◻ แชททีม + กลุ่ม (เมนู + · สร้างกลุ่ม · ⚙ ตั้งค่ากลุ่ม · เลือกเบอร์จากรายชื่อ expo-contacts 57.0.3) — ยังไม่มีผลทดสอบจากเครื่องจริง
- ◻ แชทลูกค้า: สวิตช์ "AI แนะนำคำตอบ/การแปล/ภาษาทีม" ในหน้าตั้งค่าแชทลูกค้า + ป้าย "✨ แนะนำคำตอบ" "แปลแล้วส่ง" — ยังไม่มีผลทดสอบจากเครื่องจริง
- ◻ ข้อความขอสิทธิ์ iOS ไทย/อังกฤษ (`apps/mobile/locales/`)

## 3. 🔴 ติดอยู่ที่เจ้าของ
1. **เครดิต OpenRouter หมด** (402 Insufficient credits · เจอ 17 พ.ย. 14:39Z) → งานเลขา/แนะนำคำตอบ/แปล ที่ใช้ AI ล้มหมดจนกว่าจะเติมที่ openrouter.ai/settings/credits · งานทดสอบ "ลบแชททั้งหมด" (ห้อง `cmwkssvsj000107jtlhgchy05`) ค้างสถานะ FAILED รอเจ้าของกดลองอีกครั้ง — งานนี้แก้ข้อมูล เลขาต้องขออนุมัติก่อนลงมือ ถ้าไม่ขอ = บั๊ก
2. รอเคาะ (ไม่ตอบ = คงตามที่ทำ): ปิดแผ่นระหว่างจัดลำดับ = บันทึก · เลขแจ้งเตือนสีแดงทุกอัน · ไอคอนแทน (บัตรคิว = credit-card · คูปอง = percent · คลังความรู้ = book-open) · ซ่อนปุ่ม Lekaa ตอนแผ่นเปิด · ลองอีกครั้งได้เฉพาะผู้สั่ง · ลองอีกครั้งไม่นับโควตา · งานไม่สำเร็จอยู่ป้าย "กำลังทำ" · คำว่า "แอปเลขา" ในข้อความเชิญ (ชื่อใน App Store = Lekaa) · ถ้อยคำสิทธิ์ไมค์/Face ID
3. รอเคาะ (ยังไม่ได้แตะ): หน้า terms/privacy ยังเขียน SHARK · ข้อความ App Store (`scripts/asc-listing.py`) · ชื่อช่องทาง POS "SHARK Shop" · คำอธิบายรายการที่ส่ง Beam "SHARK POS {ref}"

## 4. งานค้างฝั่งเรา (เรียงตามความสำคัญ)
1. รอผลเจ้าของลองบนเครื่องจริงของรายการ ◻ ข้างบน — แก้ตามภาพที่ส่งมา (เจ้าของส่งภาพทีละเรื่อง ให้แก้แล้วส่ง OTA ทันที)
2. ข้อสอบ `qc-sec-s3a1-s2` T2-1 ยังคาดว่าชวนคนเข้าห้องงานสำเร็จ (เราปิดเป็น 403 แล้ว) → แก้ข้อสอบให้ตรง
3. `qc-sec-s2.14` / `click-sec.mjs`: ทะเบียนปุ่มเปลี่ยนแล้ว ต้องไล่คลิกสร้าง `clicks-sec.json` ใหม่
4. แดงเดิมก่อนงานนี้ ยังไม่ได้แก้: `qc-ai-actions` (AA-5.2) · `qc-ai-analyst` (AN-2.1, AN-3.3) · `qc-sec-s2.1` T-1/I-1/I-2/E-1 · `qc-sec-s1.14` R-2 · U7.1 (สีฝังใน `SecAttach.tsx`)
5. หน้าหลักร้าน "/" พื้นขาวในโหมดมืด (ข้อสอบ s2.1 E-1 ห้าม import ธีมในไฟล์นั้น)
6. ข้อความ "Shark" เก่าในฐานข้อมูลจริง: `scripts/lekaa-rename-db.mts` (dry-run เริ่มต้น · `--apply` ยังไม่เคยรัน) — รอเจ้าของสั่ง · โค้ดแสดงเป็นชื่อใหม่ให้เองอยู่แล้ว
7. `npx expo install --check` ฟ้อง expo-* เกือบทั้งชุดเก่ากว่า SDK 57 คาด — ยกทั้งชุด = งานแยก ต้อง build + เทสเครื่องจริง
8. ย้ายโดเมน shark.in.th → lekaa.ai: มีผลสำรวจจุดฝังโดเมนท้าย `LEKAA-RENAME-INVENTORY.md` · ยังไม่สั่งเริ่ม · EMAIL_FROM บน prod ถ้าตั้งใน env ต้องแก้มือ

## 5. วิธีส่งของ (ใช้ตามนี้ ผ่านมาแล้วทุกบรรทัด)
**แก้ JS ของแอป (ไม่มีโมดูล native ใหม่) = OTA ไม่ต้อง build** — เจ้าของต้องปิดแอปสนิท → เปิด → รอ ~15 วิ → ปิดสนิท → เปิดใหม่
```
cd /root/projects/shark-in-th
E=<scratchpad>/shark-expo.env; (umask 077; grep -oP '^EXPO_TOKEN=\S+' /root/.claude/projects/-root/memory/reference_expo_token_shark.md > $E)
ISO_MEM=10000M bash scripts/iso.sh bash -c "cd apps/mobile && set -a && . $E && set +a && npx eas-cli update --channel production --environment production --platform ios --non-interactive --message '<ข้อความ>'"
rm -f $E
```
- ⚠️ OTA ไปถึงทุกเครื่องที่เป็น runtime 2.0.0 รวม build ≤26 ที่ไม่มีโมดูล native ใหม่ (จะพังจนกว่าจะอัปเดตเป็น 28)
- แก้ฝั่งเซิร์ฟเวอร์/เว็บ = `git push origin main` → Vercel build รัน `prisma migrate deploy` เอง แล้ว deploy (~10 นาที) · migration ต้อง additive

**build ใหม่ (มี native เปลี่ยน)** — ต้องให้เจ้าของสั่งก่อนทุกครั้ง (รอบ #28 บัญชี B สั่งเองเพราะ #27 เปิดไม่ได้ และแจ้งเจ้าของแล้ว)
```
ISO_MEM=… bash scripts/iso.sh bash -c "cd apps/mobile && set -a && . $E && set +a && EAS_BUILD_NO_EXPO_GO_WARNING=true npx eas-cli build -p ios --profile production --non-interactive --no-wait --auto-submit"
```
แล้ว commit `apps/mobile/app.json` (autoIncrement เขียน buildNumber) + push · ลำดับเต็ม: Neon restore (`pnpm neon:create wo-restore-…`) → `bash scripts/iso.sh pnpm exec prisma migrate deploy` → push main → build

## 6. กับดักที่เจอจริงในรอบนี้ (อย่าทำซ้ำ)
- 🔴 `scripts/iso.sh` **ย้าย cwd ไปรากรีโปและไม่ส่ง env** → mobile tsc ต้องเป็น `NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10000M bash scripts/iso.sh bash -c "cd apps/mobile && npx tsc --noEmit"` · แบบ `cd apps/mobile && bash ../../scripts/iso.sh npx tsc` = ตรวจ server แทน (ผ่านปลอม) · token ต้อง source ใน `bash -c`
- 🔴 token Expo ของแอปนี้ = บัญชี `shark-in-ths-team` (`reference_expo_token_shark.md`) — ห้ามใช้ `/root/.siamdive/expo.env`
- 🔴 เพิ่มโมดูล `expo-*` ต้องปักรุ่นให้ตรงวันออกของ `expo-modules-core` ที่ลงอยู่ (57.0.8) — `npx expo install` หยิบรุ่นล่าสุดแล้วแอปหลุดตอนเปิด (#27)
- 🔴 ห้ามอ่าน `e.nativeEvent…` ในตัวอัปเดต state / setTimeout / promise — บนเครื่องจริงเป็น null แล้ว (เว็บไม่พัง)
- 🔴 `KeyboardAvoidingView` ในแผ่นที่เริ่มกลางจอเว้นไม่พอ → ใช้ `KeyboardFrame inSheet`
- 🔴 เรนเดอร์เว็บ (shoot-*.mjs) จับปัญหา native ไม่ได้เลย — ทุกอย่างที่เป็นท่าทาง/คีย์บอร์ด/โมดูล native ต้องบอกเจ้าของตรง ๆ ว่ายังไม่ยืนยัน แล้วให้ลองบนเครื่อง
- อย่ารัน `npm install`/`npm ci` ใน `apps/mobile` ของทรีหลักโดยไม่จำเป็น: เครื่องมือถ่ายภาพ `/root/qc-cal-nm` symlink เข้ามา และ npm จะลบ `react-native-web` ทิ้ง (ลงคืน: `npm install --no-save react-native-web@~0.21.0`)
- pre-commit fitness อ่าน prisma client ที่ generate แล้ว → commit ในทรีที่ `prisma generate` ล่าสุด (ทรีหลัก / shark-b27-team)

## 7. เครื่องมือสืบปัญหา
- **crash log จาก TestFlight** (หลังเจ้าของกด Share ~3–5 นาที): ASC API `GET /v1/apps/6793749205/betaFeedbackCrashSubmissions?sort=-createdDate` → `…/crashLog` (`attributes.logText`) · JWT จาก `apps/mobile/credentials/AuthKey_U9DGP7TVFK.p8` (kid `U9DGP7TVFK` · iss `40d5244e-97b6-47a8-9487-0ffa8db07dc4` · aud `appstoreconnect-v1`)
- **error ฝั่ง JS**: ตอนนี้ขึ้นบนจอ "แอปเจอข้อผิดพลาด" ให้เจ้าของถ่ายภาพส่งมา
- **อ่านฐานข้อมูลจริงแบบอ่านอย่างเดียว**: เขียนสคริปต์ชั่วคราวใน `scripts/` แล้ว `bash scripts/iso.sh bash -c 'node --env-file=.env --import tsx scripts/<probe>.mts'` · ดู `AiRoomJob` + `OpsEvent` · ลบสคริปต์หลังใช้ · ห้ามเขียน
- รายงานเจ้าของทาง Telegram: `tg "ข้อความ"` · `tg --photo <path เต็ม> "คำบรรยาย"` · `tg --doc <path เต็ม>`
- ภาพเทียบแบบ/เรนเดอร์: `/root/qc/b27-fab` `b27-team` `b27-merged/send` `b27-chat` `b27-rename` `b27-order2` `b27-failed` · แบบที่อนุมัติ: `/root/mockups/topbar-systems/topbar2.png` · `/root/mockups/lekaa-fab/fab6.png` · `/root/mockups/team-invite/team4.png`

## 8. กติกาของเจ้าของที่ใช้กับงานนี้
- ภาพก่อนโค้ดสำหรับหน้าจอใหม่ (ส่งทาง Telegram) · แก้เล็กตามภาพจากเครื่องจริง = แก้เลยแล้วส่ง OTA
- build / migrate prod / รันสคริปต์แก้ข้อมูลจริง = รอเจ้าของสั่ง
- ชื่อ: ไทย "เลขา" · อังกฤษ "Lekaa" · ไม่เหลือ "Shark" ในข้อความที่ผู้ใช้เห็น · ไม่แตะโดเมน/URL/อีเมล/ชื่อนิติบุคคลจนสั่ง
- งานหนักทุกอย่างผ่าน `scripts/iso.sh` ทีละตัว · ฐาน QC เท่านั้นสำหรับชุดทดสอบ (`scripts/qc-sec.sh`)
