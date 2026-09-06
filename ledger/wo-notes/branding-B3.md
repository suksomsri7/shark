# B3 — โครงแอปใช้ธีม (บันทึกผู้ทำ)

> WO: `ledger/BRANDING-RUN.md` §สัญญา B3 · แบบ: `ledger/DESIGN-BRANDING.md` §5, §7a, §7b (T6/T7/T8)
> มockup: `ledger/design-branding/02-shell-brand.png` · `03-rail-dark-mobile.png` (มีบล็อก 04 มือถือในไฟล์เดียวกัน)
> ข้อสอบ: `scripts/qc-branding-b3.mts` (20 ข้อ · Fable เขียน · builder ไม่แตะ)
> ผล: **20/20 · CRITICAL 0 · MAJOR 0 · MINOR 0**

## 1. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/core/user-preferences.ts` — ที่เดียวที่รู้จักรูปร่างของ `User.prefs` ทั้งก้อน (`kanbanShortcuts` + `navCollapsed`)
- `src/lib/core/preferences-actions.ts` — `"use server"` · `setNavCollapsedAction(boolean)`
- `src/components/app-shell/ThemeRoot.tsx` — โทเคนธีมที่ราก + โหมด `?theme=preview`
- `src/components/app-shell/IssueReportSheet.tsx` — แผ่น "แจ้งปัญหาการใช้งาน"
- `src/components/app-shell/SwipeEdge.tsx` — ท่าปัดจากขอบซ้ายเปิดเมนู
- `src/lib/branding/issue-actions.ts` — `"use server"` · `reportIssueAction(formData)`

**แก้**
- `src/app/app/layout.tsx` — เรียก `getBrandingTokens` + `getUserPreferences` ขนานกับ query เมนูเดิม → ส่ง `<ThemeRoot tokens>` · `branding`/`navTone`/`navCollapsed` ให้ `AppShell` · `navCollapsed` ให้ `AppMain`
- `src/app/globals.css` — ค่าปริยาย `--color-accent-fg` `--nav-bg` `--nav-fg` `--nav-fg2` `--nav-on` + คลาส `.nav-row` / `.nav-row-on` (+ กฎเฉพาะ `[data-nav-tone="LIGHT"]`)
- `src/components/app-shell/Topbar.tsx` — เขียนใหม่ทั้งไฟล์ตาม T7 (โลโก้+ชื่อ ซ้าย · 2 ปุ่มขวา · ☰ เฉพาะเว็บจอเล็ก)
- `src/components/app-shell/NavDrawer.tsx` — สีจากโทเคนโทน · หัวแถบมีโลโก้ · ตัด `NavGroup` (accordion) ทิ้ง · ปุ่ม `nav-collapse` · ท้ายเมนู overlay มี "แจ้งปัญหาการใช้งาน" · ปุ่ม "+ เพิ่มระบบ" กลับสี
- `src/components/app-shell/NavRail.tsx` — โทนตามธีม · ไม่มีตราสัญลักษณ์ · จุดแดง badge · `nav-expand` เป็น callback (ไม่ยิง event เอง)
- `src/components/app-shell/AppShell.tsx` — สถานะ `collapsed` (จำต่อผู้ใช้) · รางทุกหน้า · `SwipeEdge` · แผ่นแจ้งปัญหาจากเมนู
- `src/components/app-shell/AppMain.tsx` — ระยะเว้นซ้ายตามสถานะจริง (ราง 3.5rem / แถบ 18rem) ผ่าน event `app:nav-collapsed`
- `src/components/app-shell/AiDock.tsx` — เขียนใหม่: ไม่มีปุ่มลอยมุมขวาล่างแล้ว เปิดจาก event `app:ai-open`
- `src/lib/branding/issues.ts` — เพิ่ม `assertCanReport(ctx, userId)`
- `src/lib/modules/kanban/preferences.ts` — เหลือเป็น re-export บาง ๆ ของ core (ข้อสอบ K1.14 ยังเขียว 15/15)
- `src/components/branding/BrandingSettings.tsx` — "ดูตัวอย่างเต็มจอ" เขียน sessionStorage ก่อนเปิดแท็บใหม่
- `scripts/visual-branding.mts` — spec `"b3"` (10 ภาพ) + รองรับ path/จอ/ธีมต่อ spec + ท่าปัดนิ้วจริง

## 2. แผนที่คอมโพเนนต์ (ใครคุยกับใคร)

```
app/layout.tsx (server)
 ├─ getBrandingTokens(tenantId)  ──► <ThemeRoot tokens>  → <style>:root{ 7 ตัวแปร }</style>
 │                                     └─ ?theme=preview → อ่าน sessionStorage ทับ (แท็บเดียว)
 ├─ getUserPreferences(user.id) ──► navCollapsed
 └─ <AppShell branding navTone navCollapsed …>        <AppMain navCollapsed chatSystemIds>
      ├─ <Topbar branding aiUnread inApp>              └─ pl ซ้าย = ราง 3.5rem / แถบ 18rem
      │    ├─ ปุ่ม report-issue → <IssueReportSheet>        ▲
      │    └─ ปุ่ม ai-orb → เว็บ: event `app:ai-open`       │ event `app:nav-collapsed`
      │                    แอป: postMessage {ev:"open-ai"}  │
      ├─ <SwipeEdge> ─ ปัดขอบซ้าย → เปิด drawer             │
      ├─ <NavRail navTone badges onExpand> ────────────────┤ (railMode)
      ├─ <NavDrawer variant=pinned onCollapse> ────────────┘
      ├─ <NavDrawer variant=overlay onReportIssue>
      └─ <AiDock>  ← ฟัง `app:ai-open` (ไม่มีปุ่มของตัวเองแล้ว)
```

**สัญญา event ที่ใช้ (ไม่ยก state ข้ามชั้น — แพตเทิร์นเดิมของ `app:drawer-open`)**
| event | ใครยิง | ใครฟัง | ทำไมไม่ใช้ prop |
|---|---|---|---|
| `app:drawer-open` | โมดูลแชท · (เดิม) NavRail | AppShell | โมดูลห้าม import app-shell |
| `app:ai-open` | Topbar | AiDock | AiDock ไม่มีใครอื่นต้องรู้ว่าเปิดอยู่ |
| `app:nav-collapsed` | AppShell | AppMain | 2 ตัวเป็น **พี่น้อง** ใน layout (server) ยก state ขึ้นไปไม่ได้ |

## 3. ตารางตัวแปร CSS

| ตัวแปร | ค่าปริยาย (globals.css) | LIGHT | BRAND | DARK | ใครใช้ |
|---|---|---|---|---|---|
| `--color-accent` | `#1d4ed8` | สีร้าน | สีร้าน | สีร้าน | ปุ่ม/ลิงก์/แท็บ active ทั้งแอป (ของเดิม) |
| `--color-accent-fg` | `#ffffff` | คำนวณ WCAG | ↑ | ↑ | ตัวอักษรบนพื้น accent (ใหม่) |
| `--color-accent-soft` | `color-mix 8%` | rgba 8% | ↑ | ↑ | พื้นทินท์ (ของเดิม) |
| `--nav-bg` | `#fafafa` | `#fafafa` | = accent | `#111827` | พื้นแถบเมนู/ราง |
| `--nav-fg` | `#0a0a0a` | `#0a0a0a` | = accentFg | `#f9fafb` | ตัวอักษร/ไอคอนบนแถบ |
| `--nav-fg2` | `#737373` | `#737373` | accentFg 72% | `#9ca3af` | ตัวรอง/เส้นคั่น/อีเมลท้ายเมนู |
| `--nav-on` | `#ffffff` | `#ffffff` | accentFg 16% | ขาว 10% | พื้นรายการที่เลือก + hover |

- ค่าที่ ThemeRoot ใส่มาจาก `getBrandingTokens()` ตัวเดียว (สูตรอยู่ที่ `service.ts` — ไม่คิดสีซ้ำที่ฝั่ง UI)
- `<style>:root{…}` ของ ThemeRoot **ไม่มี @layer** ⇒ ชนะ `@theme` ของ Tailwind v4 เสมอ และ SSR มาพร้อมหน้าแรก (ไม่กะพริบ)
- `.nav-row / .nav-row-on` อยู่ใน globals.css เพราะ `:hover` เขียนเป็น inline style ไม่ได้ · โทน LIGHT ได้กฎพิเศษ (กรอบ hairline + ตัวอักษร accent) เพราะพื้นที่เลือก `#ffffff` แทบไม่ต่างจากพื้นแถบ `#fafafa`

## 4. เส้นทางค่า preferences

```
User.prefs (Json, ข้าม tenant)
  └─ src/lib/core/user-preferences.ts   ← ที่เดียวที่ parse/merge (เขียนทับเฉพาะคีย์ที่ส่ง)
       ├─ src/lib/modules/kanban/preferences.ts   (re-export · ผู้เรียกเดิมไม่ต้องแก้)
       │     └─ kanban/actions.ts setKanbanShortcutsAction · /app/settings/preferences · หน้าบอร์ด
       └─ src/lib/core/preferences-actions.ts setNavCollapsedAction  ← ปุ่ม ‹ / ›
```
- อ่าน: layout → props (server truth) · เขียน: optimistic ใน AppShell แล้วยิง action เบื้องหลัง (`.catch(() => {})` — ปุ่มย่อ/ขยายห้ามทำหน้าพัง)
- `parsePreferences` ทน prefs เพี้ยน (array / สตริง / null) → ค่าปริยายทั้งชุด

## 5. กติกาท่าปัด (SwipeEdge)

| เงื่อนไข | ค่า | เหตุผล |
|---|---|---|
| จุดเริ่มแตะ | `clientX ≤ 24px` | ไม่ให้ท่าไปแย่งการลากทั่วจอ |
| ระยะที่ต้องลาก | `dx ≥ 60px` และ `dx > |dy|` | กันคนเลื่อนหน้าลงแล้วนิ้วเอียง |
| ห้ามเริ่มใน | `input, textarea, select, [contenteditable], [data-scroll-x]` | คนกำลังลากเลือกข้อความ / เลื่อนแถบคอลัมน์บอร์ด |
| ความกว้างจอ | `< 1024px` · ในแอป (`alwaysOn`) ทำงานทุกความกว้าง | iPad แนวนอนในแอปกว้าง ≥ lg แต่ไม่มีแถบปักซ้าย |
| ☰ | เว็บจอเล็กยังมี · **ในแอปไม่มี** | คนที่ปัดไม่ติดบนเว็บต้องไม่ติดกับดัก · ในแอปเจ้าของสั่งให้ไม่มี |

## 6. ส่วนที่ตัดสินใจเอง / ต่างจากตัวหนังสือใน WO

1. **ไม่ได้ลบ `childrenFor()` ออกจาก `layout.tsx`** ทั้งที่ §7a/ตาราง WO เขียนว่า "ตัด children ทุกระบบ" — ตัดที่ **การนำเสนอ** (NavDrawer ไม่เรนเดอร์ accordion แล้ว · เมนู = 1 บรรทัดต่อระบบจริงตามแบบ) แต่คงทะเบียนไว้ในโค้ด
   เหตุผลจากการอ่าน `scripts/qc-nav-functions.mts` (อยู่ในด่านถดถอยของ B3): S2/S3/S4/S5 บังคับว่า `childrenFor` ต้องมี `case` ครบ 19 ระบบ · POS ต้องมี register/close · ทุก route ที่มีอยู่จริงต้องถูกประกาศ (completeness) — ทะเบียนนี้คือ **ตัวกันลิงก์ตายของทั้งแอป** ไม่ใช่แค่ข้อมูลของเมนู ถ้าลบทิ้งจะได้ 5 CRITICAL ทันทีและปิดตาด่านนั้นถาวร → ตัดทะเบียนต้องเป็น WO แยกที่แก้ข้อสอบพร้อมกัน (Fable ตัดสิน) เขียนคอมเมนต์เตือนไว้บนหัว `NavDrawer.tsx` แล้ว
2. **`nav-expand` บนหน้าบอร์ดงานเปิดเมนู overlay แทนการคลายค่า** — บอร์ดบังคับรางเสมอ (K1.5) ถ้าให้ปุ่มไปตั้ง `navCollapsed=false` ก็ยังเห็นรางอยู่ดี = ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น · พร้อมกันนี้แก้ `alwaysOverlay={inApp || railMode}` ซึ่ง**ปิดบั๊กเดิมของ K1.5**: overlay เดิมมี `lg:hidden` ⇒ ปุ่ม "กางเมนูเต็ม" ท้ายรางบนเดสก์ท็อปกดแล้วไม่มีอะไรขึ้นเลย
3. **โทน LIGHT ของแถบเมนูเป็น `#fafafa` ไม่ใช่ `#ffffff` เดิม** — ตามสัญญา B1 (`LIGHT_NAV.navBg`) ที่ลงไปแล้ว · ต่างจากของเดิม 1 สเต็ปเทา (เท่ากับสีรางไอคอนเดิมพอดี) ยังมีเส้นคั่นขวาเหมือนเดิม เทียบภาพแล้วแยกไม่ออกด้วยตา ถ้าอยากได้ `#ffffff` เป๊ะต้องแก้ที่ service (จุดเดียว)
4. **กล่องตัวย่อในหัวแถบเมนูใช้ `--nav-on` เมื่อโทน BRAND** — ถ้าใช้ `--color-accent` ตามแถบบน กล่องจะจมหายไปในพื้นแถบสีเดียวกัน (เจอจากภาพจริงรอบแรก) · แถบบน (พื้นขาว) ยังใช้ accent เหมือนเดิม
5. **`window.open(url, "_blank")` ของ "ดูตัวอย่างเต็มจอ" ไม่ใส่ `rel/noopener`** — เบราว์เซอร์ก๊อป sessionStorage ให้แท็บใหม่เฉพาะเมื่ออยู่ browsing context group เดียวกัน ใส่ noopener แล้วโหมดพรีวิวจะอ่านค่าไม่เจอและแสดงธีมที่บันทึกไว้แทนแบบเงียบ ๆ (origin เดียวกันทั้งคู่ ⇒ ไม่ใช่ช่อง tabnabbing)
6. **สวิตช์ "จำสถานะย่อ/ขยาย" (`branding-toggle-collapse`) ยังอยู่แต่ไม่ผูกอะไร** — ข้อสอบ B2 S1.1 บังคับให้ testid นี้มีอยู่ · แก้คำอธิบายให้ตรงความจริงว่า "ระบบจำต่อบัญชีอยู่แล้วเสมอ" แทนที่จะทำสวิตช์ที่ปิดแล้วไม่มีผล (จะเป็นปุ่มโกหก)
7. **`AiDock` เลิกรับ `aiUnread`/`hideOnMobile`** — badge ย้ายไปที่ orb บนแถบบน · `AppMain` จึงลด `pb-24`→`pb-10` และหน้าแชทเต็มจอ `lg:pb-24`→`lg:pb-2` (ช่องว่างล่างเดิมมีไว้หลบปุ่มลอยที่ไม่มีแล้ว) — SH-3.x ของ `qc-chat-v2-shell` ยังเขียว
8. **`assertCanReport` ใช้ `prisma` ตรง (ไม่ผ่าน `tenantDb`)** — `Membership` เป็นตารางระดับบัญชีไม่ใช่ของร้าน · where ผูก `tenantId + userId + acceptedAt` ลงไปใน SQL ครบ (แพตเทิร์นเดียวกับ `requireMembership` ของ core) · `src/lib/branding/` ไม่ใช่โมดูล ⇒ ไม่กระทบ ratchet F5
9. **ภาพแนบของแผ่นแจ้งปัญหาใช้ `kind: "ATTACHMENT"`** (enum มีแค่ LOGO/ATTACHMENT) แต่ตรวจไฟล์ด้วย `validateLogoFile` ตามสัญญา (รูปจริง ≤2MB · SVG ห้ามมีสคริปต์)
10. **harness `b3` ต้องรอ 62 วิ ก่อนเปลี่ยนโทน** — `getBrandingTokens` แคช 60 วิ **ในโปรเซสของเซิร์ฟเวอร์ QC** ซึ่งคนละโปรเซสกับสคริปต์ ⇒ `invalidateBrandingCache()` ที่ฝั่งสคริปต์ล้างของเซิร์ฟเวอร์ไม่ได้ · ถ้าไม่รอจะได้ภาพ "โทนใหม่แต่สีเก่า" แบบเงียบ ๆ (ผลลบปลอมที่หลอกตาที่สุด) · รวมเวลาเดินสเปก ≈ 3 นาที

## 7. ผลด่าน

```
pnpm exec tsx scripts/qc-branding-b3.mts
  ผ่าน 20/20 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":20,"passed":20,"findings":[]}

# regression
qc-branding-b1     21/21 · CRITICAL 0
qc-branding-b2     16/16 · CRITICAL 0
qc-branding (เดิม)   5/5  · CRITICAL 0
qc-chat-v2-shell   26/26 · CRITICAL 0
qc-chat-inbox-ui   55/55 · CRITICAL 0
qc-nav-functions   ✅ ผ่านทั้งหมด — 10 เช็ก
qc-kanban-k1.5     17/17 · CRITICAL 0
qc-kanban-k1.14    15/15 · CRITICAL 0
qc-mobile-app      38/38 · CRITICAL fail 0

pnpm typecheck                                     0 error
pnpm exec tsx scripts/fitness.mts (ไม่ export env)  23/23 · CRITICAL 0
grep ":any|<any>|as any" ใน src/                    0 (ยกเว้นที่มี eslint-disable เดิม)
```

**ภาพจริง** (`bash scripts/acc-v2-serve.sh` → `visual-branding.mts b3` → `stop`) — 10 ใบใน `.qc-shots/branding/b3/` · failures 0
| ไฟล์ | เทียบกับแบบ |
|---|---|
| `light-shell-desktop/mobile` | โทนสว่าง = หน้าตาเดิม (แถบขาว · accent น้ำเงิน · รายการที่เลือกมีกรอบ + ตัวอักษร accent) |
| `brand-shell-desktop` | ตรง mockup 02: แถบเทียล 288px · หัวแถบ กล่องตัวย่อ+"กิจการ"+ชื่อ+▾ · เมนู 1 บรรทัด/ระบบ · "+ เพิ่มระบบ" ขาวบนเทียล · แถบบน: ตัวย่อ+ชื่อซ้าย · ขวา 2 ปุ่ม · ไม่มี ☰ |
| `brand-rail-desktop` | ตรง mockup 03: ราง 56px สีเทียล · ไม่มีตราสัญลักษณ์ · ไอคอนที่เลือกเป็นพื้นขาวโปร่ง · › ท้ายราง |
| `brand-board-rail-desktop` | หน้าบอร์ดงานยังบังคับราง (K1.5) · รางเป็นสีธีมไม่ใช่ดำ · บอร์ด 5 คอลัมน์ปกติ |
| `brand-issue-sheet-desktop` | แผ่นแจ้งปัญหา: 3 ประเภท (ตัวที่เลือกเป็นสี accent) · ช่องข้อความ · แนบรูป · บรรทัด "ระบบจะแนบให้อัตโนมัติ" · ส่งเรื่อง/ยกเลิก |
| `brand-mobile-swiped-mobile` | ตรง mockup 04: ปัดจากขอบซ้ายแล้วเมนูเลื่อนเข้ามา · ท้ายเมนูมี "แจ้งปัญหาการใช้งาน" |
| `dark-shell-desktop/mobile` · `dark-rail-desktop` | โทนเข้ม `#111827` อ่านออกทั้งแถบ · accent (เทียล) ยังเป็นจุดเน้น |

**ตรวจโหมดพรีวิวด้วยเบราว์เซอร์จริง** (สคริปต์ชั่วคราว ลบแล้ว): ยัด sessionStorage แล้วเปิด
`/app?theme=preview` → `--color-accent = #7C3AED`, drawer bg = `rgb(17,24,39)` · เปิด `/app` เฉย ๆ ในเบราว์เซอร์เดียวกัน → **ไม่** ใช้ค่าพรีวิว (ได้ค่าจาก DB)

**คืนสภาพร้าน QC หลังถ่าย**: `brandColor=null · navTone=LIGHT · displayName=null` · `kb-owner.prefs = {navCollapsed:false}` · session `qc-visual-branding` เหลือ 0

## 8. จุดที่อยากให้ Fable ลองแหย่

1. **แข่งกันเขียน prefs**: เปิด 2 แท็บ แท็บหนึ่งกด ‹/› รัว ๆ อีกแท็บสลับสวิตช์ปุ่มลัดที่ `/app/settings/preferences` — `setUserPreferences` เป็น read-modify-write **2 คำสั่ง** (ไม่ใช่ SQL เดียว) ⇒ ตามทฤษฎีมีช่องทับกันได้ (ของเดิมจาก K1.14 ก็เป็นแบบนี้ · ตอนนี้มี 2 ผู้เขียนแล้วจึงน่าแหย่กว่าเดิม) — ถ้าซีเรียส ควรเป็น `jsonb_set` คำสั่งเดียว
2. **โหมดพรีวิวข้ามแท็บ**: กด "ดูตัวอย่างเต็มจอ" แล้ว **เปลี่ยนหน้าในแท็บพรีวิว** (`/app` → `/app/sys/...`) — ธีมพรีวิวจะหายเพราะ `?theme=preview` ไม่ติดไปกับลิงก์ · ตั้งใจให้เป็นแบบนี้หรืออยากให้เกาะทั้ง session ของแท็บ?
3. **ท่าปัดชนของจริง**: หน้าบอร์ดงานบนมือถือ (`MobileBoard` เลื่อนคอลัมน์แนวนอน) และแถบแท็บของโมดูล — ผมกันด้วย `[data-scroll-x]` แต่ยังไม่ได้ไล่ว่ามีกี่จุดในแอปที่เลื่อนแนวนอนได้จริงแต่ไม่ได้ติดป้ายนี้ (ค้นแล้วเจอน้อยผิดคาด)
4. **ร้านที่มีระบบเยอะมาก**: รางไอคอนไม่มี scroll — ถ้าเปิด 15 ระบบบนจอ 900px ไอคอนจะล้นทับปุ่ม › (แถบเต็มมี `overflow-y-auto` แต่รางไม่มี)
5. **โลโก้ที่อัปจริง**: ผมทดสอบด้วยตัวย่ออย่างเดียว (ร้าน QC ไม่มี `logoUrl`) — โลโก้แนวนอนสัดส่วนแปลก ๆ ใน `h-[34px] w-[34px] object-contain` จะดูเป็นอย่างไรบนแถบบน/หัวแถบเมนู ยังไม่มีใครเห็น
6. **`--nav-fg2` เป็นเส้นคั่น**: ผมใช้ `h-px + opacity .25` แทน `border-t` เพื่อให้เส้นเปลี่ยนตามโทน — บนโทน BRAND ที่สีอ่อน (เช่น เหลือง → accentFg เป็นสีเข้ม) เส้นอาจแรงเกิน ยังไม่ได้ลองสีอ่อนสุด ๆ
7. **`?theme=preview` กับคนอื่น**: ถ้าใครส่งลิงก์ `/app?theme=preview` ให้เพื่อน เพื่อนจะเห็นธีมปกติ (sessionStorage ของเขาว่าง) — ตั้งใจ แต่ควรลองยืนยันว่าไม่มีทางที่ค่าใน sessionStorage จะรั่วไปทำอย่างอื่นได้ (ผมกรองค่าและกรอง CSS ด้วย `safeCss()` แล้ว)
