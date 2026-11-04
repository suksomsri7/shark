# WO S2.1 — โครงแอปเลขา + นำทาง + i18n + แถบบน 3 โซน + ทางเข้าจากหน้าแรก 1.0

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-d` branch `wip/sec-s2.1` (ฐาน 5366c331) · 2026-11-04 UTC · builder: ตัวแทน Opus
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.1.md` (+ COMMON + RESOLUTIONS §F) · แบบ `ledger/DESIGN-SECRETARY.md` §2 + §10 · ภาพ `sec-a.jpg` หน้า 1 · `sec-k.jpg` · `sec-dark-a.jpg` · `sec-c.jpg` หน้า 4 (C3) · `sec-b.jpg` หน้า 1 (B1 ชีตสลับกิจการ)
> ข้อสอบ: `scripts/qc-sec-s2.1.mts` (14 ข้อ · commit 5366c331 · **แก้หลัง commit หรือไม่: ไม่**)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ผู้ตรวจ 1 คน) — ไม่ push (ผู้คุมสั่ง)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/_layout.tsx` (COMMON §D) | แก้ (เพิ่มอย่างเดียว) | Drawer เดิมได้ลูก `Drawer.Screen` index (คงลำดับแรก) + secretary + customers + business (`headerShown:false`) · บรรทัดเดิมอยู่ครบ (L-1) |
| `apps/mobile/app/(app)/index.tsx` | แก้ (ปุ่มเดียว) | ปุ่มลอย `home-open-secretary` "เลขา AI" มุมล่างขวา → `/secretary` · สี `C`/`R`/`S` ของ 1.0 · ซ่อนเมื่อเว็บขอเต็มจอ (hideOrb) |
| `apps/mobile/app/(app)/secretary/_layout.tsx` · `customers/_layout.tsx` · `business/_layout.tsx` | ใหม่ | Stack headerShown:false slide_from_right · ครอบ `BusinessSwitcherHost` · โหลด `secretary/me` ครั้งเดียว |
| `apps/mobile/app/(app)/secretary/index.tsx` | เขียนใหม่ | A1 โครง (มีห้อง = การ์ดเรียบ) / C3 (ไม่มีห้องหรือเส้นยังไม่ขึ้น) · i18n · ชื่อกิจการจริงจาก /me · ไม่ import fixture แล้ว |
| `apps/mobile/app/(app)/secretary/{new,inbox,scheduled}.tsx` · `room/[id]` · `staff/{index,[membershipId],invite}` · `settings/{index,secretary,access,rules,log,knowledge,customers,account,quota}` · `onboarding/name` · `help/{index,[caseId]}` · `customers/{index,[id]/index,[id]/info}` · `business/new` | ใหม่ (23) | โครง `SecSkeleton` (โซน · หัวข้อ · "กำลังสร้าง (ใบ S2.x)") |
| `apps/mobile/src/components/secretary/SecTopBar.tsx` | ใหม่ | แถบบน 3 โซน + badge + ชื่อกิจการ (`TenantTitle`) |
| `apps/mobile/src/components/secretary/BusinessSwitcherSheet.tsx` | ใหม่ | ชีต B1 + `BusinessSwitcherHost`/`useBusinessSwitcher` |
| `apps/mobile/src/components/secretary/SecSkeleton.tsx` | ใหม่ (นอกรายการ "Files you own" — ดู §7) | โครงจอร่วม 23 จอ |
| `apps/mobile/src/components/airy/TopBar.tsx` | แก้ (เพิ่ม prop) | `center?: ReactNode` แทน title/subtitle เมื่อใส่ · ไม่ใส่ = เหมือนเดิม |
| `apps/mobile/src/i18n/{index,th,en}.ts` | ใหม่ | `useT()`/`useLang()`/`setLang()`/`langFrom()` · 63 คีย์ `sec.*` ทั้งสองภาษา |
| `apps/mobile/src/api/secretary.ts` | ใหม่ (นอกรายการ — ดู §7) | type + เรียก secretary/me · rooms · inbox/count · inbox/unread (COMMON §C.12) |
| `apps/mobile/src/theme/index.ts` | แก้ | `export const F` (k 0.73 · v(px) · ชุดตัวอักษร C3) |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | ใหม่ | /me 1 ผู้ใช้ 2 ร้าน · rooms ว่าง · counts 0 · secretary/me (th) · webview-session ฯลฯ · expect 24 route + `/` |
| `scripts/sec-ui-inventory.json` | ใหม่ (หนี้ S0.2 §8) | ทะเบียนปุ่ม 16 แถว |
| `docs/modules/31-secretary.md` | แก้ | §2.3 ตารางเส้นทางแอป (ดู §7 เรื่องเลขหัวข้อ) |
| `apps/mobile/qc/shots-sec/**` | ภาพ/summary | ดู §6 |
ไม่แตะ `src/lib/**` `prisma/**` package.json · `apps/mobile/node_modules` = symlink → shark-in-th (ไม่ commit)

## 5. ผลข้อสอบ
- forced #1: `JSON_SUMMARY {"total":14,"passed":14,"failed":[],"skipped":[],"findings":[]}` exit 0
- unforced: เหมือนกัน 14/14 (ไฟล์มีแล้ว ⇒ ไม่ SKIP)
- forced #2 (หลัง commit): ดูรายงาน
- ข้อสอบก่อนหน้า: `qc-sec-s0.2` forced 30/30
- regression (unforced · qc-sec.sh + gate lock · SHARK_AI_MOCK=1): qc-mobile-app 38/38 · qc-mobile-auth 31/31 · qc-mobile-chat 29/29 · qc-mobile-authz-hotfix 12/12 — exit 0 ทั้งหมด = baseline `sec-baseline-85751098.txt`
- mobile typecheck 0 · `pnpm fitness` 53/53 ทั้งมี env และ `env -u DATABASE_URL`

## 6. ภาพ
คำสั่ง (เลนนี้ใช้สำเนา/พอร์ตของตัวเอง กันชนเลนอื่น):
```
R=/secretary,/secretary/new,/secretary/room/r1,/secretary/inbox,/secretary/scheduled,/secretary/staff,/secretary/staff/m1,/secretary/staff/invite,/secretary/settings,/secretary/settings/secretary,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers,/secretary/settings/account,/secretary/settings/quota,/secretary/onboarding/name,/secretary/help,/secretary/help/c1,/customers,/customers/x1,/customers/x1/info,/business/new
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=$R FIXTURE=apps/mobile/qc/fixtures/secretary/s2.1.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh c 4 apps/mobile/qc/shots-sec/secretary.png apps/mobile/qc/shots-sec/secretary-c3-pair.png
bash scripts/parity-sec.sh c 4 apps/mobile/qc/shots-sec/secretary-dark.png apps/mobile/qc/shots-sec/secretary-dark-c3-pair.png --dark
# จอ 1.0 ก่อน (ฐาน 5366c331 ก่อนแก้) → base-s2.1/ · หลัง → after-s2.1/
bash scripts/iso.sh env QC_PREPARE=1 [QC_SKIP_EXPORT=1] QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4724 ROUTES=/,/login,/sessions FIXTURE=apps/mobile/qc/fixtures/secretary/s2.1.json QC_OUT=$PWD/apps/mobile/qc/shots-sec/<base|after>-s2.1 node apps/mobile/qc/shoot-sec.mjs
```
- 24 route × สว่าง/มืด = `apps/mobile/qc/shots-sec/<route>[-dark].png` (48 ภาพ · summary ok ทุกตัว · overflow false · unmocked [] · errors [])
- ภาพคู่ `/secretary` เทียบ **C3 = sec-c.jpg หน้า 4** (fixture rooms ว่าง ⇒ จอ C3): `apps/mobile/qc/shots-sec/secretary-c3-pair.png` · `secretary-dark-c3-pair.png` — ตำแหน่ง/สี/ลำดับตรงแบบเหมือน S0.2 · ต่างแค่ไอคอนเลขาเป็น `message-circle` (ข้อสอบ T-1 บังคับ · แบบเป็นฟองสี่เหลี่ยม) · ไม่มีแถบสถานะ 9:41
- 23 จอโครง = NO_PAIR (ใบที่วาดจริงทำภาพคู่)
- จอ 1.0 ก่อน/หลัง (`shots-sec/base-s2.1/` vs `shots-sec/after-s2.1/`):
  - `/sessions` sha เดียวกัน (0 px)
  - `/` ต่างเฉพาะปุ่มใหม่ (มุมล่างขวา x 582–748 · y 1576–1656 @2x) + กล่อง AnimatedOrb ที่หมุนอยู่กลางจอ (x 300–480 · y 754–940) — นอกสองกล่องนี้ 0 px
  - `/login` ต่างเฉพาะกล่อง AnimatedOrb 242×242+269+327 (ถ่ายคนละจังหวะ เหมือนที่ S0.2 พบ) — นอกกล่อง 0 px
- ทดลองกดจริง (สคริปต์ puppeteer เล็ก `shots-sec/s2.1-interaction/README-click.mjs.txt`): แตะชื่อกิจการบน /secretary และ /secretary/staff ⇒ ชีตขึ้น (`sheet-secretary.png` · `sheet-staff.png`) · แตะ "บลูเฮาส์ หอพัก" ⇒ switchTenant: localStorage shark_tenant = t2 + หัวใหญ่เปลี่ยน (`switched.png`) · แตะไอคอนลูกค้า ⇒ URL /customers

## 7. มติทางเทคนิค / ส่วนต่างจากใบ
- `(app)/_layout.tsx` เป็น **Drawer** ไม่ใช่ Stack ⇒ เพิ่ม `Drawer.Screen` (ใบเขียน Stack.Screen) · ต้องประกาศ `index` ลำดับแรกด้วย: expo-router วางจอที่ประกาศก่อนจอที่เหลือ (useScreens.getSortedChildren) — ถ้าไม่ประกาศ จอแรกของ drawer = secretary ⇒ ปุ่มย้อน (backBehavior firstRoute) จาก /member /crm ฯลฯ จะไปโซนเลขาแทนหน้าแรก
- customers/business มี `_layout` Stack ของตัวเอง (ไม่งั้น `Drawer.Screen name="customers"` จับได้แค่ customers/index และ [id] กลายเป็นจอ drawer แยก)
- ข้อความ "เลขาของฉัน" ฯลฯ ทั้งหมดผ่าน i18n · ภาษา: `secretary/me.languages[0]` (th/en) ไม่งั้น `navigator.language`/`Intl` · ภาษาอื่น ⇒ ไทย
- ใบเขียน fixture `/api/mobile/secretary` แต่ SECRETARY-API.md มี `/api/mobile/secretary/me` ⇒ โค้ดเรียก `/me` · fixture มีทั้งสองเส้น
- `/api/mobile/secretary/inbox/count` ไม่มีใน SECRETARY-API.md (ใบ S2.1 ระบุใน fixture) ⇒ โค้ดเรียกตามใบ · พลาด = 0 · รอผู้คุมตัดสินว่าจะเพิ่มในสัญญา API หรือให้ badge นับจาก `secretary/inbox`
- badge ใช้สี `status.wait` (ส้ม · ตามภาพ A1/B1) ไม่ใช่แดง (ธีมไม่มีแดง)
- `F` ในธีม = `{k:0.73, v(px), title 30, sub 14, h2 22, p 14, row 14, rowSub 12}` — ชุดตัวอักษรของ C3 คงตามภาพคู่ S0.2 (C3 ต่ำกว่า `tokens.type` อยู่แล้ว · S2.2 วาดใหม่) · จอโครงใหม่ใช้ `tokens.type` ตรง
- `SecSkeleton.tsx` + `src/api/secretary.ts` อยู่นอก "Files you own" (เลี่ยงโค้ดซ้ำ 23 ไฟล์ · COMMON §C.12 ให้ข้อมูลผ่าน api/secretary.ts)
- ตารางเส้นทางลง `docs/modules/31-secretary.md` **§2.3** (ใต้ "IA + การนำทาง") ไม่ใช่ §6 เพราะ §6 ของเอกสาร = state machine ของห้อง
- ปุ่มหน้าแรกโชว์ระหว่างโหลด/พลาดด้วย (WebView บนเว็บ QC ไม่เคย onLoadEnd — ถ้าโชว์เฉพาะหลังโหลด จะพิสูจน์ด้วยภาพไม่ได้ และผู้ใช้ก็ควรเข้าเลขาได้แม้หน้าเว็บช้า)
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี · สิทธิ์: ไม่เปลี่ยน (ทุกจอโครงไม่อ่านข้อมูลธุรกิจ · rooms/inbox ตรวจฝั่งเซิร์ฟเวอร์)

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ซ่อนไอคอนลูกค้าเมื่อไม่มี `chat.conversation.read` · ทีมเฉพาะ OWNER/MANAGER | /me ไม่มีสิทธิ์รายตัว · ใบไม่สั่ง | S2.10 / S2.20 |
| badge โซนทีม ยังไม่มีแหล่ง | ไม่มีเส้น API | S2.10 |
| ชื่อกิจการกลางแถบบนถูกตัด ("The Bea…") เมื่อมี 5 ปุ่ม | โครง · แบบหน้า K ใช้หัวใหญ่ใต้แถบ | S2.20 |
| ย้อนกลับข้ามโซน (ลูกค้า → เลขา) ไปหน้าแรก 1.0 (drawer firstRoute) | ไม่เปลี่ยน backBehavior ของ 1.0 | S2.20 (ถ้าต้องการ) |

## ต่อจากนี้ (ถ้า restart)
ไม่มีงานค้าง — เหลือผู้คุมรันซ้ำ/ผู้ตรวจ · แก้จอแล้ว: รันบล็อกคำสั่ง §6 ใหม่ แล้ว `bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s2.1.mts`
