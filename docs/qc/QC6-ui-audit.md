# QC6 — UI/UX Audit ทั้งแอป (Minimal Clean B&W)

> **วันที่:** 2026-07-11 · **ขอบเขต:** ทุกหน้าใน `src/app/` (59+ หน้า รวม restaurant ที่เพิ่งเพิ่ม) + `src/lib/modules/*/ui/forms/editor.tsx` + `src/components/`
> **เกณฑ์:** เทียบกับ design tokens ใน `src/app/globals.css` และหน้า reference ที่เจ้าของพอใจ (`src/app/app/page.tsx`, `src/components/public-booking.tsx`, `src/app/(marketing)/page.tsx`)
> **ระดับ:** HIGH = ใช้งานไม่ได้/มือถือพัง/เสี่ยงข้อมูลเสียหาย · MED = วุ่นวาย/หลุด design system · LOW = polish
> **มาตรฐานที่ใช้แก้:** `docs/UI_STANDARD.md`

## สรุปตัวเลข

| ระดับ | จำนวน |
|---|---|
| HIGH | 25 |
| MED | 66 |
| LOW | 49 |
| **รวม** | **140** |

ข่าวดี: โครงหน้าส่วนใหญ่ *เกือบ* ตรงระบบอยู่แล้ว (แถวรายการ rounded-lg border, ฿ prefix, empty state ไทย) — ปัญหาหลักคือ **(1) token ที่ไม่มีจริงทำ UI พังเงียบๆ (2) action อันตรายไม่มี confirm เลยทั้งแอป (grep `confirm(` = 0 ครั้ง) (3) เมนู account แบนยาว 23 ลิงก์ (4) ปุ่ม operation จิ๋วกว่า touch target บนหน้าที่ใช้บนมือถือหน้างานจริง**

---

## หมวด 1 — ความวุ่นวาย / ไม่มี hierarchy

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| MED | `src/lib/modules/account/ui.tsx:88-138` | **ตัวปัญหาหลัก:** hub บัญชีเป็นทะเลปุ่ม — แท็บเอกสาร 8 + ปุ่มรายจ่าย 4 + ปุ่มบัญชี/รายงาน 11 = 23 ลิงก์เรียงแบน 3 แถบ ไม่มีการจัดกลุ่มที่สแกนได้ | จัด 8 หมวดตาม `UI_STANDARD.md §4` (การ์ดหมวด + `SubNav` + `account/layout.tsx`) |
| MED | `src/app/app/sys/[id]/page.tsx:44-106` | หน้าเดียว host เนื้อหา 8 โมดูล + section "เชื่อมต่อ" อยู่บนสุดเสมอ — โมดูลใหญ่ (ACCOUNT/MEETING) โดนการ์ดเชื่อมต่อดันลงไป งานหลักไม่ใช่สิ่งแรกที่เห็น | ย้าย "เชื่อมต่อ" ไปท้ายหน้า/หน้า ตั้งค่า, เนื้อหาโมดูลขึ้นก่อน |
| MED | `src/app/app/u/[unitSlug]/ticket/event/[id]/page.tsx:63-210` | 6 section ในหน้าเดียว (สรุป+สถานะ+ประเภทตั๋ว+ฟอร์มเพิ่ม+ฟอร์มขาย+ออเดอร์) `gap-8` ยาวมากบนมือถือ | แยก "ขายหน้างาน" เป็น route ลูก, ฟอร์มเพิ่มประเภทเก็บใน `<details>` |
| MED | `src/app/app/sys/[id]/account/finance/page.tsx:74-136` | ฟอร์ม 3 ใบซ้อนกัน (เปิดบัญชี/โอน/เงินสดย่อย) + รายการบัญชี ในหน้าเดียว | เก็บแต่ละฟอร์มใน `<details>` เหมือน products L126 |
| MED | `src/app/app/sys/[id]/account/assets/page.tsx:130-193` | ฟอร์มลงทะเบียนสินทรัพย์ ~15 ช่องกางถาวรท้ายหน้า + สรุป + ฟอร์มคิดค่าเสื่อม + ทะเบียนเต็ม = 4 ก้อนแน่น | ฟอร์มเข้า `<details>`, แบ่งกลุ่มช่องด้วย `Section` |
| MED | `src/app/app/sys/[id]/account/docs/[docType]/page.tsx:108-118` | `DocEditor` เต็มตัวกางถาวรใต้ list ทุกหน้าเอกสาร | ปุ่ม "+ สร้าง" → กางเมื่อกด (details/route) |
| MED | `src/app/app/u/[unitSlug]/hotel/reservations/page.tsx:66-75` | `ReservationForm` ใหญ่อยู่บนสุด ก่อนรายการจองซึ่งเป็นงานหลักของหน้า | list ก่อน + ปุ่ม "+ จองใหม่" กางฟอร์ม |
| MED | `src/lib/modules/meeting/ui.tsx:74-154` | แชททั้งระบบถูกยัดใน `.card` ภายในหน้า sys ที่ `max-w-2xl` — พื้นที่แชทแคบ, มือถือ sidebar ห้องดันข้อความลงไปไกล | แชทควรเป็น route เต็มหน้า (`/meeting`) + mobile: ห้องเป็น dropdown ไม่ใช่ list ค้างบน |
| MED | `src/app/app/sys/[id]/account/tax/page.tsx:38` | h1 ยัด 2 ฟีเจอร์ "ภาษี — ภ.ง.ด.3 / 53 · เครดิตภาษีถูกหัก" | h1 สั้น + คำอธิบายเป็น desc |
| MED | `src/app/app/sys/[id]/account/tax/page.tsx:37` | back-link "← WHT" ชี้ไปหน้า wht ไม่ใช่ hub บัญชี — เดินย้อนงง | back ไป hub เสมอ (แก้ถาวรด้วย `SubNav`) |
| LOW | `src/app/app/sys/[id]/account/finance/page.tsx:33` | h1 ยาว "การเงิน — เงินสด / ธนาคาร / e-Wallet" | ตัวเลือกไว้บรรทัด desc |
| LOW | `src/app/app/u/[unitSlug]/ticket/event/[id]/page.tsx:78-80` | "← กลับ" เป็นปุ่ม ghost บน header — reference ใช้ text link muted เหนือ h1 | ใช้ `PageHeader.back` |
| LOW | `src/app/app/sys/[id]/account/accounts/page.tsx:67` | spacing root `gap-6` ในขณะหน้า account อื่นใช้ `gap-5` | ใช้ scale เดียว (`gap-6` ตามมาตรฐาน) |

---

## หมวด 2 — นอก design system

### 2.1 Token ที่ไม่มีจริง → UI พังเงียบ (บั๊กจริง ไม่ใช่แค่สไตล์)

globals.css มีแค่ `--color-ink/-soft/muted/line/surface/-2/danger` — โค้ดหลายไฟล์อ้าง token ผี:

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| HIGH | `src/app/app/u/[unitSlug]/queue/page.tsx:269` | ปุ่ม "จบ" (primary op ของหน้าคิว) ใช้ `--color-fg`/`--color-bg` ที่ไม่มีจริง → พื้นโปร่ง+ตัวอักษรตกทอด = ปุ่มแทบมองไม่เห็น | `--color-ink` + `--color-surface` (หรือ `.btn-primary`) |
| HIGH | `src/app/app/u/[unitSlug]/ticket/event/[id]/page.tsx:101` | pill สถานะ active ใช้ `--color-fg`/`--color-bg` → ตัวอักษรดำบนพื้นดำ มองไม่เห็นว่า active อะไร | เหมือนบน |
| HIGH | `src/app/app/sys/[id]/account/products/page.tsx:64-65` | แท็บ active `bg-ink` + `text-[--color-bg]` (ไม่มีจริง) → ข้อความแท็บล่องหน | `text-[color:var(--color-surface)]` |
| HIGH | `src/lib/modules/account/GoodsIssueEditor.tsx:56-63` | pill เลือกชนิดเอกสาร ใช้ `--color-bg` ไม่มีจริง → ตัวเลือก active ล่องหน | เหมือนบน |
| HIGH | `src/app/app/sys/[id]/account/assets/page.tsx:271` | `btn btn-secondary` — คลาส `.btn-secondary` ไม่มีใน globals → ปุ่มยืนยันตัดจำหน่ายไม่มีพื้น/ขอบ ดูไม่ออกว่าเป็นปุ่ม | `.btn-primary` |
| MED | `src/app/app/sys/[id]/account/assets/page.tsx:27,94` + `src/app/app/u/[unitSlug]/ticket/event/[id]/SellForm.tsx:69` + `ticket/checkin/CheckinForm.tsx:50` | `var(--color-success,green)` → render **สีเขียวดิบ** (fallback) หลุด B&W | ผลสำเร็จ = ink ตัวหนา/ป้ายขอบดำ ไม่ใช้เขียว |
| MED | `src/app/app/sys/[id]/account/assets/page.tsx:251` | `var(--color-primary,#0a58ca)` → ลิงก์**น้ำเงินดิบ** | underline ink |
| MED | `src/app/app/sys/[id]/account/reports/page.tsx:27` | `var(--color-hover,#f5f5f5)` token ผี + hex ดิบ | `--color-surface-2` |
| MED | `reports/balance-sheet/page.tsx:55,58,61` · `cash-flow/page.tsx:31` · `pp30/page.tsx:10,22` · `profit-loss/page.tsx:99` · `trial-balance/page.tsx:65` | `var(--color-bg,#fafafa)` token ผี (ทำงานเพราะ fallback hex) กระจาย 8 จุด | `--color-surface-2` แล้ว grep ห้าม `--color-bg` ทั้ง repo |

### 2.2 สีนอก palette

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| MED | `src/app/app/sys/[id]/account/periods/page.tsx:56` + `reports/_shared.tsx:53` | error banner `border-red-600 bg-red-50 text-red-800` — แดง Tailwind ดิบ | ข้อความ `--color-danger` บน surface + ขอบ hairline |
| MED | `src/lib/modules/coupon/forms.tsx:108,153` | ข้อความสำเร็จ `text-green-700` | ink + "✓" หรือป้ายขอบดำ |
| MED | `src/app/app/sys/[id]/account/finance/page.tsx:37-38` | `text-emerald-600` | ink |
| MED | `src/app/app/sys/[id]/account/wht/page.tsx:61,67` | แท็บ `bg-black text-white` แทน token + เป็น rounded-lg ขณะที่ที่อื่น rounded-full | ใช้ `TabPills` กลาง |

### 2.3 Component เดียวกัน ทำคนละแบบ

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| MED | แท็บ pill 4 implementation: `docs/[docType]/page.tsx:72-76` (inline style), `journal/page.tsx:90-94` (inline style), `products/page.tsx:64-65` (class+token ผี), `wht/page.tsx:61-67` (bg-black), + `expense-ui.tsx:62-72` (inline style) | active tab หน้าตา/มุมโค้ง/สีต่างกันทุกหน้า | สร้าง `TabPills` ตัวเดียว |
| MED | ปุ่ม action ในแถว ~10 แบบ: `.btn-ghost text-sm` / `rounded-lg border px-2.5 py-1 text-xs` (queue, booking, hotel, restaurant, ticket) / `rounded-full border px-2.5 py-0.5` (queue L117) / `text-xs underline` (ลบทุกที่) / `btn btn-ghost px-2 py-0.5` (kanban L159) | ไม่มีนิยาม "ปุ่มรอง-เล็ก" กลาง ทุก agent ประดิษฐ์เอง | เพิ่ม `.btn-sm` (px-3 py-2 text-sm = ≥40px) ใน globals + แทนที่ทั้งหมด |
| MED | `src/app/app/sys/[id]/account/reports/ReportToolbar.tsx:37,40` + `balance-sheet:47` + `cash-flow:63` + `pp30:78` | `className="btn text-sm"` เปล่า — `.btn` เดี่ยวๆ ไม่มีพื้น/ขอบ → "พิมพ์/CSV/ดู/คำนวณ" ดูเป็นข้อความเฉยๆ | `.btn-ghost` / `.btn-primary` |
| MED | รายการ 2 สไตล์ในหน้าเดียว: `docs/[docType]/[docId]/page.tsx:136` (บรรทัดสินค้า = border-b) vs `:175` (payment = แถวการ์ด) | ผู้ใช้อ่านสลับ pattern | `DataList` + ตารางท้ายเอกสารตามมาตรฐาน |
| LOW | `const baht = …` ประกาศซ้ำ **17 ไฟล์** (public-booking, sys/[id]/page, products, members/[id], booking/setup, ticket ×3, hotel/setup, coupon ×3, account ×4, assets) | ฟอร์แมตเงินไม่มีเจ้าภาพ | `formatBaht`/`MoneyText` กลาง (UI_STANDARD §2.8) |

### 2.4 Emoji ไม่สม่ำเสมอ

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| LOW | `kanban/ui.tsx:148-149` (👤📅), `meeting/ui.tsx:28,249` (🔒 💬), `restaurant/page.tsx:92` (🔔🧾), `accounts/page.tsx:71,91` + `periods/page.tsx:71` (🔒), `journal/page.tsx:125` (⚑) | emoji โปรยใน body ทั้งที่ระบบกำหนดใช้เฉพาะ icon ระบบใน nav | แทนด้วยข้อความ/ป้ายขอบเทา ตามกฎ §0.8 |

---

## หมวด 3 — Mobile (ลูกค้า+เจ้าของใช้มือถือเป็นหลัก)

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| HIGH | `src/app/app/sys/[id]/account/journal/new/page.tsx:49` | ตาราง JV (select บัญชี + Dr + Cr + memo กว้าง >500px) ห่อด้วย **`overflow-hidden`** → มือถือถูกตัดขาด scroll ไม่ได้ = **ฟอร์มบันทึกบัญชีใช้ไม่ได้บนมือถือ** | ใช้ `TableWrap` (overflow-x-auto + min-w) จาก `reports/_shared.tsx:65-71` หรือ card-per-line |
| HIGH | `src/lib/modules/kanban/ui.tsx:157-176` | ◀/▶ คือ**วิธีเดียว**ในการย้ายการ์ด (ไม่มี drag) แต่เป็น `px-2 py-0.5 text-xs` (~26px) — interaction หลักของบอร์ดกดยากมากบนมือถือ | ปุ่ม ≥44px หรือเมนู "ย้ายไป…" ใน bottom-sheet |
| MED | `src/app/app/sys/[id]/account/ledger/page.tsx:121` + `journal/[entryId]/page.tsx:43` | ตารางใน `overflow-hidden` (ตัด ไม่ scroll) | `TableWrap` |
| MED | `src/app/app/sys/[id]/account/ledger/page.tsx:98` | `min-w-[16rem]` select ใน flex row ล้นจอ 320px | `min-w-0 flex-1` |
| MED | `src/app/app/sys/[id]/account/tax/page.tsx:64` | ตารางแรกไม่มี overflow wrapper (อีก 2 ตารางในหน้าเดียวกันมี L97,L139) | ห่อให้ครบ |
| MED | `src/app/app/u/[unitSlug]/queue/page.tsx:63` | `grid grid-cols-4` ไม่ยุบ — การ์ดสถิติเบียดที่ 360px | `grid-cols-2 sm:grid-cols-4` |
| MED | touch target < 44px บนปุ่มหน้างานที่กดบ่อยสุด: `queue/page.tsx:117,122,139-146,169,236` (เรียก/ข้าม/โอน/เปิด-ปิดช่อง) · `booking/page.tsx:128` (มาถึง/เสร็จ/ไม่มา) · `hotel/reservations/page.tsx:119,136,156` (เช็คอิน/เอาท์/ยกเลิก) · `restaurant/page.tsx:101,106,160-177` (รับเรื่อง/ดูโต๊ะ/เช็คบิล/เปิดโต๊ะ) | ทั้งหมด `px-2.5 py-1 text-xs` (~28px สูง) — ใช้จริงหน้าร้านบนมือถือ | `.btn-sm` ≥40px ทั้งชุด |
| MED | `src/app/app/sys/[id]/account/wht/page.tsx:105-122` | ฟอร์มออก 50 ทวิ (select+input+ปุ่ม) ฝังใน `<td>` — มือถือแถวระเบิด | ย้ายไปหน้ารายละเอียด/`ConfirmDialog` พร้อมฟอร์ม |
| MED | `src/app/app/sys/[id]/account/accounts/page.tsx:108-114` | แถว mapping: label `w-48` ตายตัว + select — 375px เบียด | stack แนวตั้งต่ำกว่า sm |
| MED | `src/lib/modules/account/DocEditor.tsx:164-176` | มือถือ: header คอลัมน์ถูกซ่อน → ช่อง จำนวน/หน่วย/ราคา/ส่วนลด เหลือ placeholder-only เดาเอาเอง + ปุ่มลบบรรทัด ✕ จิ๋ว | label ใน cell บนมือถือ (FormField) + ปุ่มลบ ≥40px |
| LOW | `src/app/app/sys/[id]/account/journal/new/page.tsx:73,76` | ช่องเงิน `w-28` ตายตัว — 7 หลักพิมพ์ไม่เห็น | ยืดหยุ่น + text-right |
| LOW | `src/app/app/sys/[id]/account/finance/[financeId]/statement/page.tsx:53` | มี overflow-x-auto แต่ไม่มี min-w — 6 คอลัมน์เบียดแทนที่จะ scroll | `min-w-[560px]` |
| LOW | `src/lib/modules/kanban/ui.tsx:141,147` | `text-[11px]` เล็กกว่า scale ต่ำสุด | text-xs |
| ✅ | `kanban/ui.tsx:110` (คอลัมน์ w-72 + overflow-x-auto), `public-booking.tsx:168` (แถบวันที่เลื่อน), `reports/_shared.tsx:65-71` (TableWrap), globals.css:35-41 (กัน iOS zoom) | ตัวอย่างที่ทำถูกแล้ว — ใช้เป็นแบบ | — |

---

## หมวด 4 — UX

### 4.1 Action อันตราย ไม่มี confirm (grep `confirm(` ทั้ง repo = **0**)

| ระดับ | ไฟล์ | action |
|---|---|---|
| HIGH | `docs/[docType]/[docId]/page.tsx:183-188, 222-226, 308-316` | ยกเลิกการรับชำระ (ลบ record การเงิน, เหตุผล hard-code ซ่อน) / ยกเลิกร่าง / void เอกสารที่ออกแล้ว — คลิกเดียว |
| HIGH | `src/lib/modules/account/expense-ui.tsx:228-233, 274-278, 359-364` | ฝั่งจ่ายชุดเดียวกัน: void การจ่าย / ยกเลิกร่าง / ยกเลิกเอกสาร |
| HIGH | `periods/page.tsx:58-64, 72-77` | **ปิดงวดบัญชี** (ล็อกทั้งงวด) + เปิดงวดใหม่ — คลิกเดียว และ L37 ถ้าปิดไม่สำเร็จ `if (!r.ok) return;` **เงียบสนิท** ผู้ใช้ไม่รู้ |
| HIGH | `assets/page.tsx:252-271` | ตัดจำหน่าย/ขายสินทรัพย์ (post GL ย้อนไม่ได้) |
| HIGH | `products/page.tsx:117, 153-157, 193-197` | archive สินค้า / ลบหน่วย / ลบกลุ่ม |
| HIGH | `contacts/page.tsx:46-50` + `finance/page.tsx:62-66` + `accounts/page.tsx:95` | ลบผู้ติดต่อ / ลบบัญชีเงิน / ปิดใช้งานผังบัญชี |
| HIGH | `hotel/reservations/page.tsx:134-141, 152-160` | **เช็คเอาท์** (ย้อนไม่ได้) + ยกเลิกการจอง — ปุ่มจิ๋วคลิกเดียว |
| HIGH | `hotel/setup/page.tsx:61-64, 127-130` | ลบประเภทห้อง/ลบห้อง (อาจมีการจองผูก) |
| HIGH | `ticket/event/[id]/page.tsx:95-107, 127-131, 196-202` | เปลี่ยนสถานะงานเป็น "ยกเลิก" ทั้งอีเวนต์ = แตะ pill เดียว / ลบประเภทตั๋ว / ยกเลิกออเดอร์+คืนโควตา |
| HIGH | `kanban/ui.tsx:102-106, 118-123, 178-185` | เก็บทั้งบอร์ด (underline จิ๋วมุมหน้า) / ลบคอลัมน์ / ✕ เก็บการ์ด |
| MED | `queue/page.tsx:239` (ยกเลิกคิว) · `queue/setup/page.tsx:67-69,116-119,153-156` (ลบประเภท/เคาน์เตอร์/ยกเลิกลิงก์จอ TV ที่กำลังฉายอยู่) · `meeting/ui.tsx:312-320` (ลบข้อความ) · `booking/page.tsx:100-101` (ไม่มา/ยกเลิกนัด) · `sys/[id]/page.tsx:67-77,214-218` + `u/[unitSlug]/page.tsx:91-101` (ยกเลิกการเชื่อมระบบ = แตะ chip "ชื่อ ✕" คำอธิบายอยู่ใน `title` ซึ่ง touch ไม่เห็น / ลบรางวัล) · `restaurant/page.tsx:75-80` (ปิดครัวฉุกเฉิน = underline จิ๋ว) | ทั้งหมดต้องผ่าน `ConfirmDialog` |

**แก้ครั้งเดียว:** component `ConfirmDialog` (UI_STANDARD §2.7) แล้วไล่ห่อ ~30 จุดข้างบน

### 4.2 Enum อังกฤษ/jargon หลุดถึงตาผู้ใช้

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| MED | `src/app/app/sys/[id]/page.tsx:192` | `({s.status})` POS โชว์ enum ดิบ | label map ไทย |
| MED | `docs/[docType]/[docId]/page.tsx:177` + `expense-ui.tsx:222` | ช่องทางจ่าย `p.channel` ดิบ (TRANSFER/PROMPTPAY/…) ทั้งที่ฟอร์มข้างล่างมีคำไทยครบ | `PAY_CHANNEL_LABEL` กลาง |
| MED | `journal/[entryId]/page.tsx:37` | `{entry.journal}` ดิบ (DOC/PAYMENT/…) — คำไทยมีแล้วใน `journal/page.tsx:17-24` แต่ไม่ shared | ย้าย map ไป service แล้ว import |
| MED | `wht/page.tsx:118` + `expense-ui.tsx:349` + `settings/page.tsx:80-81` | "อัตรา WHT (bp เช่น 300=3%)" / "basis point 700 = 7%" — ให้ SME กรอก **basis points** | รับเป็น % (select 7%/3%/1% + custom) |
| MED | `queue/setup/page.tsx:51,62,87` | "prefix", "priority" อังกฤษใน label/help | "อักษรนำ", "ความสำคัญ (มาก=เรียกก่อน)" |
| MED | `assets/page.tsx:113` + `reports/page.tsx:5-9,22` + `_shared.tsx:54` + `goods-issue/page.tsx:56-58` + `trial-balance:69-74` | "idempotent/Dr/Cr/cron/Σ/immutable/บั๊ก/qtyOnHand/GL" ในข้อความ user | เขียนไทยธรรมดา |
| LOW | `hotel/reservations/page.tsx:125` ("ไม่มีห้องว่างให้ assign") · `tax/page.tsx:55` ("Export CSV") · `products/page.tsx:118` ("เก็บเข้าคลัง (archive)") · `restaurant/page.tsx:47` ("KDS") · `cash-flow:72` ("activity=NONE") | อังกฤษปนแบบไม่จำเป็น | ไทย |
| ✅ | Thai label map ทำถูกแล้วหลายที่: `account/service.ts:38-66`, `queue/page.tsx:22-26`, `booking/page.tsx:7-14`, `hotel/reservations:17-22`, `ticket/event:16-26`, `coupon/forms.tsx:13-25` — **แต่ประกาศซ้ำกระจัดกระจาย** | รวมเป็น `src/lib/ui/status-labels.ts` + `StatusChip` | — |

### 4.3 ฟอร์ม placeholder-only (ไม่มี label)

| ระดับ | ไฟล์ | วิธีแก้ |
|---|---|---|
| MED | `contacts/page.tsx:60-75` (9 ช่องรวมเลขภาษี/เครดิต) · `products/page.tsx:264-284` (~10 ช่องรวมราคา/VAT) · `assets/page.tsx:148-152,263,270` (ทุน/ซาก/อายุ) · `finance/page.tsx:83-133` (วันที่ไม่มี label เลย) · `docs/[docId]/page.tsx:265-298` + `expense-ui.tsx:329-351` (ฟอร์มรับ/จ่ายเงิน) · `pp30/page.tsx:76-77` (เครดิตยกมา = ช่องเงินไร้ label) · `coupon/forms.tsx:47-77` (8 ช่องตัวเลข) · `kanban/ui.tsx:197-221` (ช่อง due date เหลือแค่ `title`) | ห่อ `FormField` ทุกช่อง — แบบที่ถูกมีแล้ว: `settings/page.tsx`, `hotel/setup`, `queue/setup`, `ticket/event:139-150`, `DocEditor:115-159` |

### 4.4 ไม่มี pending state บน submit (เสี่ยงกดซ้ำ = record ซ้ำ)

| ระดับ | ไฟล์ | ปัญหา |
|---|---|---|
| HIGH | `docs/[docType]/[docId]/page.tsx:282` (บันทึกรับชำระ) · `expense-ui.tsx:339` (จ่ายชำระ) · `journal/new/page.tsx:87` (post JV) · `finance/page.tsx:100-135` (โอน/เงินสดย่อย) | double-tap บนมือถือ = **รายการเงินซ้ำ** — server-action form ทั้งแอปไม่มี `useFormStatus` เลย ยกเว้น client form (coupon/forms, CheckinForm, SellForm, public-booking ทำถูกแล้ว) |
| MED | ฟอร์ม server-action อื่นทั้งหมด (~30 ฟอร์ม) | สร้าง `SubmitButton` (client, useFormStatus → disabled + "กำลังบันทึก…") ใช้แทน `<button>` ในทุก form |

### 4.5 รูปแบบเงิน/วันที่ไม่สม่ำเสมอ

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| MED | เงิน **suffix** `1,234 ฿`: `assets:99-101,141,245` · `finance:57` · `statement:49,85` · `tax:134` · `wht:77,135` — ขณะที่ docs/journal/hub ใช้ `฿1,234` prefix | สองรูปแบบปนในโมดูลเดียว | `MoneyText` (฿ prefix) ที่เดียว |
| LOW | `ledger/page.tsx:137-160` | tbody เลขเปล่า tfoot มี ฿ | เลือกทางเดียว (ตารางบัญชี = เลขเปล่า + header บอกหน่วย) |
| LOW | `print/[docId]/page.tsx:71,94` | ส่วนลด render "฿-1,000.00" (ลบหลัง ฿) | ฟอร์แมตติดลบใน `MoneyText` |
| LOW | วันที่ 3 แบบใน account เดียวกัน (`docs list` = ปี 2 หลัก, detail = ปีเต็ม, hub = ไม่มีปี) | อ่านสับสน | `formatThaiDate` กลาง |

### 4.6 Empty/error/print

| ระดับ | ไฟล์ | ปัญหา | วิธีแก้ |
|---|---|---|---|
| HIGH | `print/[docId]/page.tsx` (ทั้งไฟล์) | เอกสารที่ **VOIDED/CANCELLED พิมพ์ออกมาเหมือนใบจริงทุกประการ** ไม่มีตราประทับ | เช็ค status → watermark "ยกเลิก" |
| HIGH | `wht/[certId]/print/page.tsx:84` | ช่อง "(ตัวอักษร)" ของ 50 ทวิ พิมพ์เป็น**ตัวเลข** ไม่ใช่คำอ่านภาษาไทย (ฟอร์มราชการต้องเป็นตัวอักษร) | implement บาทเป็นคำอ่าน หรือเอา "(ตัวอักษร)" ออก |
| MED | `reports/balance-sheet:44-47` + `cash-flow:61-62` | ช่วงเดือนเป็น free-text "YYYY-MM" (trial-balance/profit-loss ใช้ `type="month"` ถูกแล้ว) | `type="month"` ทุกรายงาน |
| LOW | `ledger/page.tsx:137-153` | เลือกบัญชีแล้วไม่มีความเคลื่อนไหว → ตารางโล่งไม่มีคำอธิบาย | แถว "ไม่มีรายการในช่วงนี้" |
| LOW | `products/page.tsx:91,180` + `goods-issue:77` | `display:flex` บน `<summary>` ซ่อนลูกศร disclosure ในบางเบราว์เซอร์ | ใส่ indicator เอง |
| LOW | `wht/[certId]/print:89` | checkbox "(☑)" hardcode ติ๊กค้าง ทั้งที่ฟอร์มจริงมีหลายตัวเลือก | render ตามข้อมูล |
| LOW | `tax/page.tsx:24` | `sp.type === "53" ? 53 : 53` — dead branch (ผลถูกโดยบังเอิญ) | แก้เป็น `: 3` ตาม intent |

---

## 10 หน้าที่แย่สุด (แก้ก่อน)

| # | หน้า | เหตุผล |
|---|---|---|
| 1 | `src/app/app/sys/[id]/account/products/page.tsx` | แท็บ active ล่องหน (token ผี) + ลบ 3 จุดไม่มี confirm + ฟอร์ม 10 ช่องไร้ label + 3 แท็บ×(list+ฟอร์ม) แน่น |
| 2 | `src/app/app/sys/[id]/account/assets/page.tsx` | token ผี 3 ตัว (เขียว/น้ำเงิน/ปุ่มล่องหน) + ตัดจำหน่ายไม่มี confirm + ฟอร์ม 15 ช่อง + jargon หนัก |
| 3 | `src/lib/modules/account/ui.tsx` (hub บัญชี) | เมนูแบน 23 ลิงก์ = ศูนย์กลางความ "วุ่นวาย" ที่เจ้าของ feedback — ต้องจัด 8 หมวด (UI_STANDARD §4) |
| 4 | `src/app/app/sys/[id]/account/docs/[docType]/[docId]/page.tsx` | void/ยกเลิก 3 จุดคลิกเดียว + เสี่ยงบันทึกเงินซ้ำ + channel enum ดิบ + DocEditor กางถาวรใน list |
| 5 | `src/app/app/u/[unitSlug]/ticket/event/[id]/page.tsx` | pill สถานะล่องหน + ยกเลิกงาน/ตั๋ว/ออเดอร์ไม่มี confirm + 6 section หน้าเดียว |
| 6 | `src/app/app/u/[unitSlug]/queue/page.tsx` | ปุ่ม "จบ" ล่องหน (token ผี) + ปุ่ม op ทั้งหน้าจิ๋วกว่า touch target ทั้งที่เป็นหน้ามือถือหน้างานแท้ๆ + grid ไม่ยุบ |
| 7 | `src/app/app/sys/[id]/account/periods/page.tsx` | ปิด/เปิดงวดคลิกเดียว + ล้มเหลวแบบเงียบ + แดงดิบ |
| 8 | `src/app/app/sys/[id]/account/journal/new/page.tsx` | ฟอร์ม JV ถูก `overflow-hidden` ตัดขาด = ใช้ไม่ได้บนมือถือ + ไม่มี pending (JV ซ้ำ) |
| 9 | `src/lib/modules/kanban/ui.tsx` (บอร์ด) | interaction หลัก (ย้ายการ์ด) ปุ่มจิ๋ว + เก็บบอร์ด/การ์ดไม่มี confirm + text-[11px] |
| 10 | `src/app/app/u/[unitSlug]/hotel/reservations/page.tsx` | เช็คเอาท์/ยกเลิกจองคลิกเดียวปุ่มจิ๋ว + ฟอร์มจองใหญ่คั่นหน้า list |

รองลงมา: `finance/page.tsx`, `wht/page.tsx`, `print/[docId]` (watermark), `contacts`, `meeting/ui.tsx`

## ลำดับการแก้ (refactor pass ถัดไป)

1. **Pass 0 — บั๊ก token ผี (ครึ่งวัน):** แทน `--color-fg/bg/success/primary/hover` + `.btn-secondary` + แดง/เขียว/emerald ดิบ ~25 จุด — เห็นผลทันที ไม่แตะโครงสร้าง
2. **Pass 1 — shared components (1-1.5 วัน):** สร้าง 9 ตัวใน `src/components/ui/` + `.input`/`.btn-sm` ใน globals + `status-labels.ts` + `money.ts`/`date.ts` (สเปกครบใน UI_STANDARD §2)
3. **Pass 2 — account (26 หน้า, ~2 วัน):** `account/layout.tsx` + `SubNav` 8 หมวด + hub ใหม่ → ไล่หน้า top-10 ก่อน (ConfirmDialog/FormField/TabPills/MoneyText/TableWrap)
4. **Pass 3 — unit modules (queue/booking/hotel/ticket/restaurant, ~1 วัน):** ปุ่ม op → `.btn-sm`, ConfirmDialog, ยุบ grid
5. **Pass 4 — lib modules (meeting/kanban/coupon) + เก็บตก (~1 วัน)**

รวม ~5-6 agent-day แยก commit ต่อ pass ได้อิสระ — ทุก pass จบด้วย checklist ใน UI_STANDARD §5
