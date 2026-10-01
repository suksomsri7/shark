# P1.3 — new register screen: UI spec (desktop · iPad landscape · mobile)

> Spec writer (read-only lane) · 1 Oct 2026 · base `28803482` (session/pos) · branch `wip/pos-spec-p1.3`
> Input for the controller's P1.3 **builder brief** and for the P1.3 **reviewer** (pixel parity — owner rule "UI must match the approved mockups").
> Sources read: LANE-RULES · POS-MASTER-PLAN §1–§4 · DESIGN-POS §4 M1/M2/M9/M10 + §6 · docs/UI_STANDARD.md · wo-notes/pos-P0.3-register.md · scripts/qc-pos-p1.3.mts (S1–S5) · REVIEW-POS-DESIGN §6 rows 2/4/10/12/15 · brief P1.1a-R2 §A · today's `register-ui.tsx`, `register/page.tsx`, `actions/pos.ts` · `wip/pos-p1.1a:catalog.ts` · `src/i18n/request.ts`, `src/messages/*/common.json` · app shell (`Topbar`, `NavRail`, `AppMain`) · member module `*-shared.ts` / `*-actions.ts` convention · mockup HTML `ledger/design-pos/{01,05,19,20,14,02}-*.body.html` + `_base/_pos/_airy/_airy2.part` · PNG 01, 05, 19, 20, 14 (5 images).
> **How the mockup CSS resolves** (needed for every number below): `mk.sh` concatenates `_base.part` → `_pos.part` → page `<style>` → `_airy.part` → `_airy2.part`. `_airy*` use `!important`, so they beat both the page style and inline `style=""`. All sizes in this document are the *effective* values after that cascade, cross-checked on the PNGs (PNG scale 1:1 for 01/05/19; 20 is shown at 1.08 — coordinates below are already corrected). Frame origin in 01-register.png = (37, 64).
> **Section 8 (open questions) must be ratified before the builder starts** — several items change scope, a shared file or the oracle.

---

## 0. Ground rules the builder must not miss (from the oracle's static checks)

These are mechanical traps in `scripts/qc-pos-p1.3.mts` S5 — get them wrong and S5 is red even with a perfect screen.

| # | rule | why (oracle line) |
|---|---|---|
| G1 | Write every testid as a **string literal on the JSX element**: `data-testid="pos-reg-search"` or ``data-testid={`pos-reg-product-${p.id}`}``. No helper (`tid("search")`), no constant. | S5.3/S5.4 find "register files" with the regex `data-testid=(\{\`|")pos-reg-` and look for the literal `"pos-reg-…"` / `` `pos-reg-… `` |
| G2 | The keyboard handler (`keydown` listener or `onKeyDown`) and the literals `"F2"`, `"F4"`, `"F8"`, `"Escape"` must sit **in a file that itself contains a `pos-reg-` testid** (put it in `RegisterScreen.tsx`, not in a separate hook file without testids). Same for `.focus()` (S5.8). | S5.7/S5.8 read only the concatenated source of files that carry `pos-reg-` testids |
| G3 | **No Thai characters** outside comments in any file that carries a `pos-reg-` testid — every visible string, `aria-label`, `title`, `placeholder` goes through `t()`. Thai in comments is fine (comments are stripped). | S5.3 |
| G4 | The **first occurrence** (after comment stripping, across the concatenated register files, in walk order `src/lib/modules/pos` → `src/app/app/sys/[id]/pos` → `src/components/pos`) of each of `pos-reg-pay`, `pos-reg-category-`, `pos-reg-product-`, `pos-reg-line-qty-`, `pos-reg-hold`, `pos-reg-held-bills`, `pos-reg-member-pick`, `pos-reg-custom-item`, `pos-reg-scan-camera` must be **inside the JSX tag that also has a ≥44px class** (`h-11`…`h-99`, `min-h-11+`, `size-11+`, `h-[44px]+`, `min-h-[44px]+`, `touch-target`, `pos-touch`). Files inside a folder are walked in `readdirSync` (alphabetical) order — e.g. with §3.1's names `RegisterTopContext.tsx` (mobile camera button) is read before `SearchRow.tsx`, and `CartLine.tsx` before `CartPanel.tsx`, so *every* copy of these ids must carry the ≥44px class. A testid string that first appears in a non-tag place (a constant, a `.find()` selector, an inventory comment that survives stripping) breaks it. Note `pos-reg-pay` is also a prefix of `pos-reg-paydlg-*` — the plain `pos-reg-pay` element must come first in source order. | S5.9 `tagOf()` = `code.indexOf(t)` then the nearest `<…>` |
| G5 | `pos-reg-search` element: `autoFocus` attribute **or** a `ref.focus()` call, and a `.focus()` call after adding a product. | S5.8 |
| G6 | `src/messages/{th,en}/pos.json` content is **not** wrapped in a `pos` key — the oracle prefixes `pos.` from the file name. File = `{ "register": { … } }`. | `posMessages()` |
| G7 | th and en must have identical ICU variable sets per key; en contains no Thai letter; th is never empty, never the key itself, never an `UPPER_SNAKE` enum. | S5.2 |
| G8 | Every clickable `pos-reg-*` id of §4 has a row in `scripts/pos-ui-inventory.json` with `page: "/app/sys/[id]/pos/register"` and non-empty `roles`. | S5.5 |
| G9 | Client components (`"use client"`) never import `register.ts`, `catalog.ts`, `service.ts`, `@/lib/core/db` or anything that reaches prisma — not even for a type if the module has value side effects; shared types live in `register-shared.ts` (pure). | memory `reference_next_client_component_imports_server_module` — tsc passes, `next build` fails |
| G10 | A `"use server"` file exports **only async functions** (no `export type`, no `export const`). | memory `reference_next_use_server_no_type_export` — page 500 at runtime |

---

## 1. Scope — what P1.3 builds vs. hand-offs

Legend: **BUILD** = full behaviour in P1.3 · **SHOW-SOON** = rendered (testid present, parity with mockup) but tapping shows the "soon" toast `pos.register.soon` and does nothing else · **HIDE** = not rendered in P1.3 · **DATA-ONLY** = display element fed by a P1.3 server function.
Recommended answers to the scope questions are in §8; this table already applies the recommendations (marked *Q#*).

### 1.1 Register screen (mockup 01 / 20A / 20B / 05ก)

| # | control / region (mockup) | P1.3 | behaviour until its owner lands | owner WO |
|---|---|---|---|---|
| 1 | Unit (branch) switch "บ้านกาแฟสวนผึ้ง · สาขาหัวหิน ▾" (01 topbar) | BUILD | list = POS-linked units the actor can access (HF-POS-PAGES filter); select ⇒ `router.push(?unit=<id>)`; one unit ⇒ chip without ▾, not a button (testid still present on a `<span>` — see §4 note) | P1.3 |
| 2 | Online dot + "ออนไลน์ · ซิงก์ล่าสุด 09:41" | BUILD (client state) | `navigator.onLine` + `online`/`offline` events; "last sync" = time of the last successful server round-trip (catalog/quote/status) | P1.3 (real sync P3.4) |
| 3 | Shift chip "กะ #12 · เปิด 09:02 · เคาน์เตอร์ 1" | DATA-ONLY | `registerStatus().shift` is always `null` until P1.9 ⇒ chip reads `status.noShift` "ยังไม่เปิดกะ", muted, **no blocking dialog** (19จ "เปิดกะก่อนเริ่มขาย" = P1.9) | P1.9 (device name P1.10) |
| 4 | User "น น้ำฝน · แคชเชียร์" | DATA-ONLY | `registerStatus().user` name + role label mapped client-side (§4 `roles.*`) | P1.3 |
| 5 | App left rail 56px (01) | app shell | not built by P1.3; P1.3 only forces rail mode on this route (§2.0, *Q2*) | app shell |
| 6 | Mode tabs (8): หน้าขาย · โต๊ะ · ออเดอร์ออนไลน์ · บิลวันนี้ · กะ · สินค้า · รายงาน · ตั้งค่า | BUILD | sale = active; บิลวันนี้ → `/app/sys/[id]/pos/sales`; กะ → `/pos/close`; สินค้า → `/pos/products`; ตั้งค่า → `/app/sys/[id]` (overview, today's link settings); โต๊ะ · ออเดอร์ออนไลน์ · รายงาน = **soon** pattern (*Q13*). Online-orders count pill "3" HIDE | P2.4 tables · P2.8 orders · P1.17 reports · P1.18 settings · P1.16 bills · P1.9 shift |
| 7 | Search / scan field "ค้นหาชื่อ / SKU หรือสแกนบาร์โค้ด (F2)" + F2 badge | BUILD | server-side search (name, nameEn, SKU, barcode) debounced 200 ms; Enter = add when exactly one result or one exact SKU/barcode hit (*Q24*); autofocus on pointer-fine devices; refocus after add | P1.3 (wedge burst handling, multi-match chooser, weight barcodes = P1.4/P1.2) |
| 8 | "+ รายการกำหนดเอง" (custom item) | BUILD | dialog name + price; requires `pos.sale.priceOverride` — without it the button is shown disabled with the visible reason `errors.needPriceOverride` (*Q8*) | P1.3 (manager-PIN override P1.15) |
| 9 | "สแกนด้วยกล้อง" | SHOW-SOON | toast | P1.4 |
| 10 | Category chips (horizontal scroll) incl. "ทั้งหมด" | BUILD | `registerCatalog({categoryId})`; chips scroll horizontally on overflow | P1.3 |
| 11 | Product card: image · name · price · small label (`3 ขนาด` / `เหลือ 2` / `สต็อก 11` / `บริการ`) · sold-out state | BUILD | see §5 for every state. `3 ขนาด` label: HIDE until P1.2 provides variant data (*Q6*) | P1.3 (variants P1.2) |
| 12 | Selected-card accent ring + **option popover** (ลาเต้ ขนาด/นม/ความหวาน/ท็อปปิ้ง/หมายเหตุถึงบาร์/จำนวน/เพิ่มลงตะกร้า ฿200) | HIDE | product with option groups: added at base price when no group is required; blocked with toast `errors.optionsRequired` when a required group exists (*Q6*) | P1.2 |
| 13 | Cart header chip "บิลใหม่ · ซื้อกลับ ▾" | SHOW-SOON (chip renders, ▾ tap = toast) | — | bill types: **no P1/P2 WO names it** (DESIGN M1 "[P2]"; dine-in ⇒ P2.4) — flag |
| 14 | "พักบิล" (F8) | SHOW-SOON (button + F8 both toast) | — | P1.5 |
| 15 | "บิลที่พัก" + count pill | SHOW-SOON, pill HIDE | — | P1.5 |
| 16 | Member card (avatar · name · tier · points · visits · "ใช้แต้ม" · "ถอด") | HIDE card; render **"+ เพิ่มสมาชิก"** row (`member.add`) as SHOW-SOON; "ถอด" HIDE (`pos-reg-member-remove` rendered only when a member is attached ⇒ never in P1.3, code present) | — | P1.12 |
| 17 | Cart line: qty box · name · sub-line · amount · small `฿100 × 2` · small `−฿10` | BUILD | sub-line in P1.3 = line-discount text or stock transition `สต็อก 11 → 10` (tracked items); options text "M · นมโอ๊ต" = P1.2 | P1.3 |
| 18 | Line editor (tap line / qty box): qty −/+ · line discount ฿/% · remove | BUILD | discount reason **not stored** in P1.3 (no field in `createSale`) — reason picker HIDE (*Q11*) | P1.3 (reason/audit P1.15) |
| 19 | Totals: รวม · ส่วนลดรายการ · ส่วนลดท้ายบิล + "แก้" · คูปอง CODE · VAT 7% (รวมในราคา) · ยอดสุทธิ | BUILD (display from quote) | VAT line is display-only (P1.6 stores VAT, R7) | P1.3 |
| 20 | Coupon line + entry (`pos-reg-coupon`) | BUILD if *Q12* = yes (recommended), else SHOW-SOON | quote input `couponCode` re-uses today's coupon validation (`actions/pos.ts` `computeTotals`) | P1.3 / P1.12 |
| 21 | "% ส่วนลดท้ายบิล" button + "แก้" link | BUILD | dialog ฿/%; ceiling refusal shown, never clamped | P1.3 (PIN over ceiling P1.15) |
| 22 | "หมายเหตุ" (bill note) | SHOW-SOON (*Q11*) | no note field in `createSale` | P1.6 (createSale extension) |
| 23 | "ใบกำกับเต็มรูป" | SHOW-SOON | — | P1.13 |
| 24 | Pay button "ชำระเงิน ฿625 (F4)" | BUILD | opens the **interim pay dialog** (cash + static PromptPay, manual confirm — same scope as today's register) → `submitRegisterSale` (*Q5*) | P1.3 interim → replaced by P1.6 (mockup 02) |
| 25 | Status bar: แป้นลัด F2/F4/F8/Esc | BUILD (≥1280 px only, see §2) | — | P1.3 |
| 26 | Status bar: รอตัดสต็อก N | DATA-ONLY (`pendingStockCount`) | — | P1.3 |
| 27 | Status bar: รอซิงก์ N | DATA-ONLY (always 0) | — | P3.4 |
| 28 | Status bar: printer "เครื่องพิมพ์ 80 มม. พร้อม" | DATA-ONLY placeholder text `status.printerNone` "ยังไม่เชื่อมเครื่องพิมพ์" | — | P1.10 |
| 29 | Mobile header (05ก): branch ▾ · shift chip · camera · ☰ | BUILD branch/shift; camera SHOW-SOON; ☰ only inside the SHARK app WebView (`useInApp()`), the web Topbar already has ☰ | — | P1.3 |
| 30 | Mobile cart bar (05ก): peek list · "ดูตะกร้า" · "4 รายการ · คุณสมชาย" · total · "ชำระ ›" | BUILD | member name part HIDE (P1.12) | P1.3 |
| 31 | Mobile cart **sheet** (expanded) | BUILD — **no mockup exists** (flag); composed from the 01 cart panel inside the `_base.part` `.sheet` pattern (§2.4) | — | P1.3 |
| 32 | Fullscreen toggle, screen lock PIN (DESIGN M1) | HIDE | — | P1.15 / P1.9 (mockup 13) |

### 1.2 States (mockup 19)

| 19 panel | P1.3 |
|---|---|
| ก empty catalogue — icon, title, body, "+ เพิ่มสินค้า", "นำเข้า CSV", "ชุดตัวอย่างคาเฟ่", chip "+ หมวด", empty cart + disabled pay "ชำระเงิน ฿0" | BUILD title/body/"+ เพิ่มสินค้า" (→ `/app/sys/[id]/pos/products`), empty cart, disabled pay. **HIDE** "นำเข้า CSV", "ชุดตัวอย่างคาเฟ่", "+ หมวด" — **no work order owns them** (onboarding mockup 18 has no WO; category create is not in P1.2's list) (*Q15*) |
| ข online orders not connected | not P1.3 (P2.8) |
| ค human errors (PromptPay not received + print toast) | not P1.3 (P1.6/P1.7/P1.10). P1.3 re-uses only the **error-card visual language** (1.5px danger border, radius 18, title 17 bold danger, body 14.5 ink-soft) for refusal messages inside the pay dialog, and the **toast** style for `pos-reg-toast` |
| ง offline banner + locked member/coupon/card chips + "ชำระเงินสด / โอน" | P1.3 shows the black banner with **interim copy** `status.offlineBanner` ("ออฟไลน์ตั้งแต่ {time} — ขายต่อได้เมื่อกลับมาออนไลน์") and disables pay; offline selling, temp numbers, sync queue = P3.4 (*Q16*) |
| จ no shift (dimmed register + dialog) | HIDE in P1.3 (P1.9) — selling without a shift stays allowed exactly as today |
| ฉ stock insufficient (inline warning, "ขายต่อ" / "ลดเหลือ 2") + "หมด · ครัวแจ้ง 11:00" card | BUILD the line warning for tracked products when `qty > stockLeft` under the default ALLOW_NEGATIVE policy (warning, never a block); "ครัวแจ้ง 11:00" sub-line HIDE (no 86 timestamp in the data — P2.6) |

### 1.3 Hand-off boundaries (what P1.3 must leave as a seam)

- **P1.4 scanner/camera**: P1.3's search `onKeyDown Enter` path is a single function `addFromSearchEnter(q)`; P1.4 replaces it (wedge burst detection, `byBarcode → {items}` chooser per P1.1a-R2 C5) and wires `pos-reg-scan-camera`.
- **P1.5 hold/recall**: `onHold()` / `onOpenHeld()` callbacks in `RegisterScreen` (today: toast). Cart state is one serialisable object (`RegisterCart`, §3.3) so P1.5 can store/restore it verbatim.
- **P1.6 payment**: the interim dialog is its own file `InterimPayDialog.tsx` with the props `{ quote, open, onClose, onPaid(result) }`; P1.6 deletes it and mounts the mockup-02 modal with the same props. The idempotency key lifecycle (§3.4) stays in `RegisterScreen`.
- **P1.12 member**: `CartPanel` has a `memberSlot` prop; P1.3 passes the "+ เพิ่มสมาชิก" soon-row; P1.12 passes the member card. Quote input already carries `memberId?` (oracle S3.13).
- **P1.15 PIN/approval**: discount-ceiling refusals and the disabled custom-item/open-price controls each call `onNeedsApproval(code)`; P1.3 implementation = show the error text; P1.15 opens the PIN modal.
- **P1.2 options**: `ProductCard.onPick(product)`; P1.3 adds directly; P1.2 opens the popover when `optionGroupCount > 0`.

---

## 2. Layout per viewport

### 2.0 Shell, breakpoints, tokens

**Shell.** The register is a full-bleed working screen like the Kanban board: on this route the app shell must be in *rail mode* (56 px icon rail, no 288 px drawer, no page padding). Today that is decided by `isRailPath()` in `src/components/app-shell/NavRail.tsx:18` (`/^\/app\/sys\/[^/]+\/kanban\/b\//`), read by `AppShell.tsx:109` and `AppMain.tsx:48` (main = `px-0 pb-0 pt-14 lg:pl-14`). P1.3 extends that one regex to also match `/app/sys/<id>/pos/register` (1-line hunk in a shared app-shell file — *Q2*). The register root is then `flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden` (3.5rem = real Topbar `h-14`). No `PageHeader`, no `ModuleTabs` on this page (the mode tabs replace them; the page keeps exactly one visually-hidden `<h1>` = `pos.register.title` for a11y/UI_STANDARD §1.3).
Topbar context (unit switch · online · shift · user) — see *Q1*; this section assumes the recommended **Topbar slot** (portal into `#app-topbar-slot`, between the brand and the two right buttons). Fallback B = a 48 px "context row" above the mode tabs (costs 48 px of height on every viewport).

**Breakpoints** (Tailwind defaults; `md` 768 · `lg` 1024 · `xl` 1280):
| name | width | drawn in | layout |
|---|---|---|---|
| D desktop | ≥ 1280 | 01 (1440), 20B | rail · long tab labels · 4-column grid · cart 480 · status bar |
| T tablet-landscape | 1024–1279 | 20A (1024×768) | rail (*Q2*) · icon-over-label tabs, short labels · 3-column grid · cart 380 · no status bar · icon-only search buttons |
| M tablet-portrait | 768–1023 | **not drawn** | as T but no rail (below `lg`), cart 340, 2-column grid, tabs scroll horizontally |
| C compact | < 768 | 05ก (390×844) | single column · mobile header · 3-column grid · bottom cart bar + sheet · no tabs · no status bar |

**Colour tokens** (mockup variable → `globals.css` token). Only these are allowed (UI_STANDARD §0.1):
| mockup | hex | token | note |
|---|---|---|---|
| `--ink` | #0a0a0a | `--color-ink` | |
| `--ink2` | #404040 | `--color-ink-soft` | |
| `--mut` | #737373 | `--color-muted` | |
| `--mut2` | #a3a3a3 | **no token** | used for small card labels (`3 ขนาด`, `สต็อก 11`), empty-cart text, disabled pay text. Recommend `--color-muted` (*Q18*) |
| `--line` | #e5e5e5 | `--color-line` | |
| `--line2` | #d4d4d4 | **no token** | kbd badge border, grab handle. Recommend `--color-line` |
| `--sf` / `--sf2` | #fff / #fafafa | `--color-surface` / `--color-surface-2` | |
| `--stage` | #f4f5f7 | `--color-stage` exists in `globals.css:49` (Kanban) but is **not** in UI_STANDARD's allowed list | product image placeholder. Recommend allowing it for this one use (*Q18*) |
| `--acc` | #1d4ed8 | `--color-accent` | active tab underline, "แก้" link, "ดูตะกร้า" link |
| `--acc-bg` | #e9eefc | nearest `--color-accent-soft` (8 % mix ≈ #eef2fd) | only on "ใช้แต้ม" chip ⇒ not used in P1.3 |
| `--dg` | #b91c1c | `--color-danger` | discount amounts, "หมด", error text, stock warning border |
| shadows | rgba(10,10,10,.18/.20/.22/.28) | **no token** | sheet shadow, toast shadow, scrim. Recommend Tailwind `shadow-xl` / `bg-[color:var(--color-ink)]/30` |

**Typography.** Mockup font = Noto Sans Thai; the app font is IBM Plex Sans Thai (`src/app/layout.tsx:8`) — glyph widths differ by a few px, accepted delta (*Q17*). Base text 15 px (mockup round-3 rule "no text below 12.5 px" — exceptions in the mockup itself: VAT row 12, status bar 12, kbd 10.5–11; keep them as drawn). Money: `tabular-nums` everywhere.
**Spacing.** The mockup uses px values off UI_STANDARD §1.2's scale (22, 26, 30, 18 …). Parity is the owner rule, so use the exact px through Tailwind arbitrary values (`gap-[22px]`, `px-[30px]`), tolerance ±2 px (*Q19*).
**Buttons.** Keep the house classes (`btn btn-primary`, `btn btn-ghost`, `btn-sm`) and add the mockup size on top (`h-[46px] rounded-[13px] px-5 text-[15px]`); never a hand-made button.

### 2.1 D — 1440×900 (mockup 01; English twin 20B)

Vertical stack (real app): Topbar 56 (app shell; context in slot) → **mode tabs 58** → **body** (flex-1, two columns) → **status bar 34**. Body height at 900 = 900 − 56 − 58 − 34 = **752 px**. The mockup frame is drawn 1440 × ≈1210 (round-2 CSS set `.frame{height:auto}`), so at a real 900 px viewport the grid and the cart lines **scroll inside their regions** (*Q3*).

| region | geometry | content / style (effective mockup CSS → token) |
|---|---|---|
| Mode tabs | full width right of rail; `px-[26px]`; border-bottom `--color-line`; height 58 | each tab: icon 14 + label, gap 9, padding 18 / 22 / 16 (top/x/bottom), 15 px `--color-ink-soft`, nowrap; **active**: `--color-ink` bold + 2 px bottom border `--color-accent` (underline spans the tab incl. padding; "หน้าขาย" tab measured 117 px wide, x = 82–199 in frame coords). Order: หน้าขาย · โต๊ะ · ออเดอร์ออนไลน์ · บิลวันนี้ · กะ · สินค้า · รายงาน · ตั้งค่า |
| Left column | width = viewport − 56 (rail) − 480 (cart) = **904** at 1440, border-right `--color-line`; flex column | |
| ├ search row | padding 14 top / 18 x; gap 16; items centred | search: flex-1, **h 48**, radius 13, 1 px `--color-line`, px 16, 15 px placeholder `--color-muted`, search icon 14 at left (gap 7), kbd "F2" at right (min-w 24, h 20, radius 5, 1 px border, 11 px bold `--color-ink-soft`, bg surface). Measured 498 × 48 at frame x 74. Two ghost buttons **h 46** (`btn btn-ghost`, radius 13, px 20, 15 px, gap 9, icon 14): "+ รายการกำหนดเอง" (172 wide), "สแกนด้วยกล้อง" (160 wide) |
| ├ category chips | padding 22 top / 30 x; gap 12; single row, `overflow-x-auto`, no visible scrollbar | chip **h 44**, px 20, radius 13, 1 px `--color-line`, 15 px `--color-ink-soft`; **active**: bg `--color-ink`, text `--color-surface`, bold, border ink. First chip "ทั้งหมด" |
| ├ product grid | flex-1 `overflow-y-auto`; padding 24 / 30; **4 equal columns, gap 22** | card: 1 px `--color-line`, radius 18, padding 16, min-h 170, bg surface, flex column space-between. Image block h 104, radius 8, bg `--color-stage`, mb 8 (real image = `object-cover` in the same box). Name 16 px / 1.35 weight 600, max 2 lines (`line-clamp-2`). Price row: mt 6, 16 px `--color-ink-soft`, flex justify-between; right small label 12.5 px `--color-muted` (`--mut2` no token); low-stock label "เหลือ 2" `--color-ink-soft` bold. Measured card **194 × 195** |
| Cart column | width **480**; flex column; bg surface | |
| ├ cart header | padding 12 / 16; gap 12; border-bottom; height 68 (mockup 64 with 40 px buttons; +4 because of the 44 px rule) | chip "บิลใหม่ · ซื้อกลับ ▾": h 28, px 11, radius 8, 1 px `--color-ink`, 13 px bold ink, chevron 12. Spacer. "⏱ พักบิล" and "บิลที่พัก [2]" = `btn-sm` **h 44** (mockup 40), px 14, radius 11, 14 px, icon 14; count pill hidden in P1.3 |
| ├ member slot | margin 12 / 16 / 4 | P1.3: "+ เพิ่มสมาชิก" row in the member-card box (1 px line, radius 18, bg `--color-surface-2`, padding 14 / 16, min-h 56, users icon 18 `--color-muted`, 15 px `--color-ink-soft`). Mockup member card (P1.12) is 70 tall at frame y 202–272 |
| ├ lines | flex-1 `overflow-y-auto` | line: padding 18 / 24, gap 16, border-bottom `--color-line`, align top. Qty box 34 × 34, radius 10, 1 px line, 15 px bold — inside a 44 × 44 button (S5.9). Name 16 px 600; sub-line 13.5 px `--color-muted`, mt 4. Amount 16 px 600 nowrap tabular, right; under it small 12.5 px `--color-muted` "฿100 × 2" (qty > 1) or "−฿10" in `--color-danger` weight 600 (line discount). Measured line height 84 |
| ├ totals | border-top; padding 20 / 24; 15 px | rows padding 6 / 0, `--color-ink-soft`, justify-between, amounts tabular. Discount amounts `--color-danger`. "แก้" = 12 px bold `--color-accent`, ml 6 after "ส่วนลดท้ายบิล". VAT row 12 px `--color-muted`. Total row "ยอดสุทธิ" 26 px bold ink, pt 12 |
| ├ action row | grid 3 equal columns, gap 12, px 16 | `btn-sm` h 40 (not in the S5.9 list — keep 40 as drawn; UI_STANDARD minimum for `.btn-sm` is 40), radius 11, 14 px, icon 12: "% ส่วนลดท้ายบิล" · "✎ หมายเหตุ" · "▤ ใบกำกับเต็มรูป" |
| └ pay button | margin 16 / 24 / 24; **h 72**; radius 18; px 24; bg `--color-ink`; text `--color-surface` 19 px bold | left "ชำระเงิน", right "฿625" + " (F4)" 12 px 600 opacity .7 ml 10. Measured 432 × 72 |
| Status bar | full width right of rail, under both columns; h 34; border-top; bg `--color-surface-2`; px 18; gap 26; 12 px `--color-muted` | left: "แป้นลัด" · [F2] ค้นหา · [F4] ชำระ · [F8] พักบิล · [Esc] ล้าง (kbd h 18, min-w 22, 10.5 px). Spacer. Right: "รอตัดสต็อก 0" · "·" · "รอซิงก์ 0" · "·" · printer icon 12 + printer text |

Height budget of the cart at 752: header 68 + member slot 72 + totals ≈ 244 (5 rows + total) + action row 40 + pay 112 (72 + 16 + 24) = 536 ⇒ **lines viewport ≈ 216 px ≈ 2.5 lines** before scrolling (mockup shows 4 because its frame is 1210 tall). With no coupon and no line discount the totals block shrinks by ≈ 68 ⇒ ≈ 3.3 lines. Reviewer: compare the cart *above the fold* against the mockup's top 752 px of the body and the bottom block (totals → pay) against the mockup's bottom block; lines between scroll.

### 2.2 T — 1024×768 (mockup 20A)

Real budget: 768 − 56 (Topbar; mockup 54) − tabs ≈ 57 = **655** body; no status bar (20A has none: "ทั้งหมดอยู่ในจอเดียว ไม่ต้องเลื่อน").
| region | 20A effective values | P1.3 delta |
|---|---|---|
| Topbar context | biz chip h 30, 12.5 px; "● ออนไลน์" (no last-sync text); chip "กะ #12 · เคาน์เตอร์ 1" (no open time); user "น น้ำฝน" (no role) | shift chip text = `status.noShift` |
| Mode tabs | `px-2`; each tab a **column**: icon 19 above label 13 px, gap 3, padding 8 / 13 / 6, min-w 64; short labels ขาย · โต๊ะ · ออนไลน์ · บิล · กะ · สินค้า · รายงาน · ตั้งค่า; count pill absolute top 4 right 10 | pill hidden |
| Left column | width 1024 − 380 = 644 in the mockup; **588 with the rail** (*Q2*) | |
| ├ search row | padding 12 / 16; gap 10; search **h 44**, 14 px, placeholder short "ค้นหาชื่อ / SKU หรือสแกน" (no F2 badge); two **icon-only** ghost buttons 48 × 44 (plus, camera; icon 18) with `aria-label` | |
| ├ chips | padding 12 / 16; gap 8; chip h **38**, px 14, 14 px, radius 11 | **h 44** (S5.9) — +6 px (*Q14*) |
| ├ grid | **3 columns**, gap 12, padding 14 / 16; card padding 11, radius 15, no min-h; image 84 mb 6; name 15 px; price 15 px mt 2 | |
| Cart | width **380** | |
| ├ header | padding 9 / 14, gap 8; `btn-sm` h 36, px 11, 13 px; labels "พักบิล", "ที่พัก" (short) | buttons h 44 (+8) |
| ├ member slot | margin 8 / 14 / 2, padding 9 / 12, gap 12, no "ถอด" | P1.3 soon-row same box, min-h 48 |
| ├ lines | padding 8 / 16, gap 12; qty 30 × 30, 14 px; name 15; sub 12.5 mt 1; amount 15; **no** "฿100 × 2" small | hide the unit × qty small below `xl` |
| ├ totals | padding 8 / 16; 14 px; rows padding 1 / 0; total 24 px pt 4 | |
| ├ action row | px 14, gap 8; `btn-sm` h 36, px 6, 13 px, gap 5; short labels "ลดท้ายบิล" · "หมายเหตุ" · "ใบกำกับ" | |
| └ pay | **h 70**, margin 10 / 14 / 12, px 22, 21 px; no "(F4)" | |
Measured 20A: cart x = 677–1056 (380), pay 350 × 69, grid card ≈ 180 × 147.

### 2.3 M — 768–1023 (not drawn — derived; reviewer has no mockup, check only "no overflow, all reachable")
As T, minus the rail (below `lg`), cart **340**, grid **2 columns**, tabs row `overflow-x-auto`. Status bar hidden.

### 2.4 C — 390×844 (mockup 05ก)

05ก is drawn as the SHARK app WebView (OS status bar, no SHARK Topbar). On the web the 56 px Topbar sits above — accepted delta.
| region | 05ก effective values |
|---|---|
| Mobile header | padding 8 / 20 / 14, gap 16, items centred: branch name 16 px bold + chevron 12 (`pos-reg-unit-switch`); chip "กะ #12" h 28 13 px (P1.3: `status.noShift` short "ยังไม่เปิดกะ"); spacer; icon buttons 36 × 36 radius 10 1 px line `--color-ink-soft`: camera, ☰ (☰ only in app) — **camera 44 × 44** (S5.9) |
| Body | `px-[22px]`, page scroll (not inner scroll) | |
| ├ search | full width, **h 48**, radius 13, placeholder "ค้นหาชื่อ / SKU หรือสแกน" | |
| ├ chips | row `overflow-x-auto` (mockup shows the 4th chip cut at the edge = scrollable); chip h 44, px 20, 15 px, gap 12. Mockup indents the chip row by 30 px (CSS artifact of `.cats{padding:22px 30px 0!important}`) — recommend **align with the search field** (padding-top 16, x 0) (*Q20*) |
| ├ grid | **3 columns**, gap 14, padding 16 / 0; card min-h 120, padding 12, radius 18; image 80; name 16 / 600; price 16. Measured card **104 × 163** |
| ├ in-cart card | border `--color-ink` + inset 1 px ink (reads as 2 px); qty badge absolute top 6 right 6: min-w 22, h 22, radius 7, bg ink, text surface 11.5 bold |
| Cart bar (`pos-reg-cart-bar`) | `sticky bottom-0` (or fixed), bg surface, border-top, padding 18 / 22 / max(32, safe-area) |
| ├ peek row | list icon 14 · item summary 12 px `--color-ink-soft` single-line ellipsis ("ลาเต้ ×2 · อเมริกาโน่ · …") · "ดูตะกร้า" 12 px bold `--color-accent`; gap 16; pb 10 mb 10 border-bottom |
| └ main row | gap 19: left column "{n} รายการ" 12 px `--color-muted` over total 20 px bold tabular; right `btn btn-primary` **h 48**, px 22, 15 px "ชำระ ›" |
Empty cart: bar shows `cart.empty` muted in place of the peek row and a disabled pay button "ชำระ ฿0" (19ก disabled style: bg surface-2, text muted, 1 px line).

**Cart sheet (no mockup — flag).** Opens from the peek row, "ดูตะกร้า" or anywhere on the bar except the pay button. Base pattern `_base.part .sheet`: fixed bottom, radius 16 16 0 0, shadow up, grab handle 38 × 4 radius 2 (`--color-line`), padding-top 8, max-h 85dvh, scrim `--color-ink` at 30 %. Inside = the D cart panel stacked full-width (header with title `cart.title` "ตะกร้า" + close ✕ 44 × 44 instead of the hold buttons row? → keep hold buttons, add close), lines (scroll), totals, action row, pay h 56. Esc / scrim tap / drag-down closes. Only one cart panel may be mounted at a time (testid uniqueness): use `useMediaQuery("(min-width: 768px)")` after mount; SSR renders the inline panel with `hidden md:flex` and the bar with `md:hidden`.

---

## 3. Components, state, keyboard, touch

### 3.1 Files (house conventions: member `*-shared.ts` pure + `*-actions.ts` "use server" thin wrappers; UI under `src/components/<module>/`)

| file | kind | imports allowed | contents |
|---|---|---|---|
| `src/lib/modules/pos/pricing-shared.ts` | pure (server part of P1.3) | nothing but `./*-shared` | `priceCart` (oracle S2) |
| `src/lib/modules/pos/register-shared.ts` | pure | `./pricing-shared` only | types `RegisterProduct`, `RegisterCategory`, `RegisterStatus`, `RegisterCart`, `RegisterCartLine`, `RegisterQuote`, `RegisterRefusalCode` (union of the ratified vocabulary), constants `REGISTER_MAX_LINES = 200`, `REGISTER_MAX_QTY = 9999`, `REGISTER_LOW_STOCK = 5` (*Q10*), `REGISTER_PAGE_SIZE = 100`; pure helpers `cartToQuoteInput(cart)`, `cartToPriceInput(cart, products, vat, maxDiscountBp)` (local optimistic pricing), `refusalMessageKey(code)` → i18n key, `moneyText(satang)` (wraps `formatBaht`, decimals when `satang % 100 !== 0`), `displayName(row, locale)` (`en` ⇒ `nameEn ?? name`) |
| `src/lib/modules/pos/register.ts` | server (exists) | prisma, catalog | new exports from the oracle contract + `registerVatConfig(ctx)` (*Q25*) |
| `src/lib/modules/pos/register-actions.ts` | `"use server"`, async functions only (G10) | `register.ts`, `requireTenant`, actor builder | `registerCatalogAction({systemId, unitId, q?, categoryId?, cursor?})`, `quoteRegisterCartAction({systemId, unitId, cart})`, `submitRegisterSaleAction({systemId, unitId, cart, payMethods, cashReceivedSatang?, idempotencyKey})`, `registerStatusAction({systemId, unitId})`. Each = `requireTenant()` → actor (`toMemberActor` shape per oracle) → `register.*` → returns the `{ok…}` object unchanged (never throws to the client; unexpected errors → `{ok:false, code:"UNKNOWN"}` through `safeReason`). A new file — **do not** append to `src/lib/actions/pos.ts` (CRM C2.7 oracle reads that file; keep it untouched) |
| `src/app/app/sys/[id]/pos/register/page.tsx` | server page (rewrite on top of HF-POS-PAGES) | anything server | guard (404-not-403), units filtered by access, active unit from `?unit=`, then in parallel: `registerStatus`, first `registerCatalog` page, `registerVatConfig`, permissions (`canCreate`, `canOverridePrice`, `maxDiscountBp`), PromptPay profile (interim pay) → `<RegisterScreen …/>`. Flag gating (*Q4*): `settings.pos.registerV2 !== true` ⇒ render today's `PosRegister` exactly as now |
| `src/components/pos/register/RegisterScreen.tsx` | `"use client"` | `register-shared`, `pricing-shared`, `register-actions`, `next-intl`, `next/navigation`, `@/lib/ui/money`, sibling components | owns all state (§3.3), the **keyboard handler (G2)**, the search ref and its `.focus()` (G5), layout switch D/T/M/C, toast |
| `…/register/RegisterTopContext.tsx` | client | shared, intl | unit switch, online dot + last sync, shift chip, user — rendered through `createPortal` into `#app-topbar-slot` (*Q1*) at ≥ md; mobile header on C |
| `…/register/RegisterModeTabs.tsx` | client (needs `usePathname` only if links; can be server) | intl | 8 tabs `pos-reg-tab-<key>` |
| `…/register/SearchRow.tsx` | client | intl | search input (forwardRef), custom item, camera |
| `…/register/CategoryChips.tsx` | client | intl, shared | chips |
| `…/register/ProductGrid.tsx` + `ProductCard.tsx` | client | intl, shared | grid, cards, empty/no-result states, load-more sentinel |
| `…/register/CartPanel.tsx` | client | intl, shared | header, member slot, lines, totals, actions, pay button (`pos-reg-pay` — keep its first source occurrence on the button, G4) |
| `…/register/CartLine.tsx` + `LineEditor.tsx` | client | intl, shared | line row; editor popover (D/T anchored, via the house `PortalMenu` pattern) / bottom sheet (C) |
| `…/register/BillDiscountDialog.tsx`, `CouponDialog.tsx`, `CustomItemDialog.tsx`, `OpenPriceDialog.tsx`, `ClearBillDialog.tsx` | client | intl, shared | small dialogs (bottom sheet on C, centred on ≥ md, UI_STANDARD §2.7 look) |
| `…/register/InterimPayDialog.tsx` + `SaleDone.tsx` | client | intl, shared, `@/components/PromptPayQr` | interim payment (*Q5*); P1.6 deletes both |
| `…/register/MobileCartBar.tsx` + `MobileCartSheet.tsx` | client | intl, shared | C only |
| `…/register/RegisterStatusBar.tsx` | client | intl | D only |
| `src/messages/{th,en}/pos.json` + 1 hunk in `src/i18n/request.ts` | — | — | §6 |
| `scripts/pos-ui-inventory.json` | rows | — | §4 |
| `src/components/app-shell/NavRail.tsx` (`isRailPath` regex) + `Topbar.tsx` (empty slot div) | shared shell, smallest hunks, marked `// POS P1.3 ▸ … ◂` | — | *Q1*, *Q2* |
Today's `src/lib/modules/pos/register-ui.tsx` stays **unchanged** (legacy path behind the flag; CRM `qc-crm-c2.7` and `fitness.mts` F14.1 `CRM_HOSTED_CONTROLS` read it).

### 3.2 Data contracts the UI consumes (from the oracle + additive fields this spec asks for)

- `registerCatalog` → `{ok, categories: RegisterCategory[], products: RegisterProduct[], nextCursor?}`; product = oracle S1.3 keys `{id, invItemId, name, nameEn, kind, categoryId, priceSatang|null, sku, barcode, imageUrl, optionGroupCount, soldOut, stockLeft|null}` **plus (additive, ratify)** `soldOutReason: "UNAVAILABLE" | "NO_STOCK" | null` (*Q9*), `requiredOptionGroupCount: number` (*Q6*), `trackStock: boolean` (effective, P1.1a-R2 C2). Input **plus** `{cursor?, limit?}` (*Q21*; P1.1a-R2 C6 paging). Category `{id, name, nameEn, productCount}`.
- `quoteRegisterCart` → `{ok, …priceCart result (subtotalSatang, lineDiscountSatang, billDiscountSatang, couponDiscountSatang, netSatang, vatSatang, grandTotalSatang), lines[], vatMode, vatRateBp}` — `lines[i]` aligned with the input lines and **should** carry the server unit price used (`unitPriceSatang`) so the cart can show re-priced values (*Q22*).
- `submitRegisterSale` → `{ok, saleId, receiptNo, grandTotalSatang, changeSatang, duplicated}`.
- `registerStatus` → `{ok, unit{id,name}, user{name, roleLabel}, shift: null, pendingStockCount, pendingSyncCount}` **plus** `user.role` code (`OWNER|MANAGER|STAFF`) so the client can translate (`roles.*`) — `roleLabel` is Thai from the server and cannot serve the English screen (*Q23*).
- Refusals: `{ok:false, code, message}`; the client **ignores `message`** for display (it is Thai) and maps `code` → `pos.register.errors.*` (§4.6).

### 3.3 State model (all in `RegisterScreen`)

```ts
type RegisterCartLine =
  | { key: string; kind: "product"; productId: string; qty: number; discount?: { type: "AMOUNT" | "PERCENT"; value: number }; openPriceSatang?: number }
  | { key: string; kind: "custom"; name: string; unitPriceSatang: number; qty: number; discount?: { type: "AMOUNT" | "PERCENT"; value: number } };
type RegisterCart = { lines: RegisterCartLine[]; billDiscount?: { type: "AMOUNT" | "PERCENT"; value: number }; couponCode?: string; memberId?: string };
```
- `PERCENT.value` is **basis points** (oracle). The UI shows/accepts percent ("10") and converts ×100; never shows "bp" (UI_STANDARD §3.2). `AMOUNT.value` = satang; UI accepts baht with ≤ 2 decimals.
- Other state: `products` (current page(s) of the grid, `Map` by id kept for every product ever added so cart lines render after the grid changes), `categories`, `q`, `categoryId`, `catalogPending`, `nextCursor`, `quote: RegisterQuote | null`, `quoteState: "idle" | "pending" | "ok" | "error"`, `quoteError?: code`, `idemKey`, `submitState: "idle" | "sending" | "unknown"`, `status` (from server, refreshed), `online`, `lastSyncAt`, `toast`, open dialogs.
- **Adding a product**: same `productId`, no discount, no open price ⇒ `qty + 1` on the existing line; otherwise a new line (`key = crypto.randomUUID()` fallback as today's `newKey()`). At 200 distinct lines a new line is refused client-side with `errors.tooManyLines` (qty increments still allowed). Qty clamp 1…9999.
- **Optimistic totals**: every cart change → `priceCart` locally (grid prices, VAT config from the page, `maxDiscountBp` from the page) for instant numbers; then `quoteRegisterCartAction` debounced **250 ms** (same value as today's register); the server quote replaces the local numbers when it arrives (stale responses dropped by a request counter). Local refusal (e.g. `DISCOUNT_EXCEEDS_LIMIT`, `LINE_DISCOUNT_EXCEEDS_LINE`) is shown immediately and the offending edit is **not applied** (dialog stays open with the inline error) — never clamped (oracle S2.4–S2.6).
- **Pay enabled** iff cart non-empty ∧ `quoteState === "ok"` ∧ quote matches the current cart (request counter) ∧ `online` ∧ `canCreate` ∧ `submitState === "idle"`. While a quote is pending the pay button keeps the last amount and shows no spinner if < 400 ms; after 400 ms the amount is replaced by `common.loading`.
- **Re-pricing**: if a quote line price differs from the grid price, the cart line shows the quote price; the grid card is refreshed on the next catalog fetch. `PRICE_CHANGED` / `PAYMENT_MISMATCH` at submit ⇒ re-quote, keep the dialog open, show `errors.priceChanged` / `errors.paymentMismatch`.

### 3.4 Idempotency key lifecycle
1. `idemKey` is created when the screen mounts and after every *completed* bill.
2. Kept unchanged across quote calls, dialog open/close and retries.
3. On submit the cart is **frozen** (`submitState = "sending"`: all cart controls disabled, Esc ignored).
4. Definite answer `ok:true` (incl. `duplicated:true`) ⇒ show done view; "ขายบิลถัดไป" resets cart, new `idemKey`, refocus search.
5. Definite refusal `ok:false` with a code ⇒ no sale exists ⇒ **new `idemKey`**, cart unfrozen, error shown.
6. Network error / timeout / non-JSON ⇒ `submitState = "unknown"`: cart stays frozen; dialog shows `errors.unknownResult` "ยังไม่แน่ใจว่าบันทึกบิลแล้วหรือยัง — กดลองอีกครั้ง ระบบจะไม่เก็บเงินซ้ำ" with **only** "ลองอีกครั้ง" (same key, byte-identical payload) — no edit, no cancel-and-change, until a definite answer arrives (S3.14–S3.16 guarantee the retry is safe).
7. Esc / "clear bill" never reuses the key of an unknown-result attempt (blocked by 6).

### 3.5 Errors, offline, loading
- Catalog fetch error ⇒ keep the previous grid, toast `errors.loadFailed` with retry. Quote error ⇒ inline danger text under the totals (`pos-reg-error`), pay disabled. Submit refusal ⇒ inside the pay dialog, error-card style of 19ค (no code shown; the refusal code goes to `data-code` for tests only).
- Offline (`navigator.onLine === false`): topbar dot hollow (1.5 px ink ring, 19ง) + `status.offline`; black banner `pos-reg-offline-banner` under the tabs (19ง: bg ink, text surface 14 px, padding 13 / 20, warn icon) with interim copy; pay disabled; grid and cart still editable (local pricing).
- Loading: first paint is server-rendered (no skeleton). Search/category change: previous grid stays, dimmed `opacity-60` while `catalogPending` (`useTransition`). Load-more: sentinel `pos-reg-grid-more` (IntersectionObserver) + visible button fallback.
- Status refresh: `registerStatusAction` after every completed sale and every 60 s while visible (`document.visibilityState`).

### 3.6 Keyboard map (single `keydown` listener on `window` in `RegisterScreen`; G2)
| key | when | action |
|---|---|---|
| `F2` | always (also while typing in another field) | `preventDefault()`; focus + select the search field (`.focus()`); closes nothing |
| `F4` | no dialog open, pay enabled | `preventDefault()`; open pay dialog (same as `pos-reg-pay`). If pay disabled: nothing (no toast) |
| `F8` | no dialog open | `preventDefault()`; `onHold()` (P1.3: soon toast) |
| `Escape` | layered | 1) close the top-most dialog/popover/sheet; 2) else if search has text ⇒ clear it; 3) else if cart non-empty and `submitState === "idle"` ⇒ open `ClearBillDialog` (confirm "ล้างบิลนี้?"; confirm = empty cart, new key) — UI_STANDARD §0.7; 4) else nothing |
| `Enter` (in search) | not composing (`e.nativeEvent.isComposing === false` — Thai IME) | `addFromSearchEnter(q)`: if the current result set has exactly one product, or exactly one product whose SKU or barcode equals `q` (case-insensitive) ⇒ add it, clear `q`, refocus; else nothing |
| `↑/↓/Enter` in dialogs | — | native form behaviour; dialogs submit on Enter |
F-keys are matched on `e.key` (`"F2"`, `"F4"`, `"F8"`, `"Escape"`), ignore when `e.repeat` for F4/F8. On macOS laptops F-keys may need fn — the visible buttons are the primary path.
**Scan autofocus**: on mount, if `matchMedia("(pointer: fine)")` matches (keyboard/scanner device) ⇒ `searchRef.current.focus()`; never on touch-only devices (it would pop the soft keyboard over the grid). After any add (tap or Enter), after a dialog closes and after "ขายบิลถัดไป" ⇒ refocus under the same condition. A wedge scanner types into the focused search and ends with Enter ⇒ handled by the Enter rule (P1.4 hardens it).

### 3.7 Touch targets
Every control a cashier presses repeatedly is ≥ 44 px in both dimensions **as a class on the element carrying the testid** (G4): pay (72/70/48), category chip (h-11), product card (≥ 120), line qty button (44 × 44 wrapping the 34/30 visual box), hold / held bills (h-11), member pick (min-h-14 row), custom item (h-[46px]; T 48 × 44), camera (h-[46px]; T 48 × 44; C 44 × 44), line-editor −/+ (h-12 w-12), dialog buttons (h-12), mobile cart-bar pay (h-12), sheet close (size-11). Action-row buttons stay 40 (drawn; `.btn-sm` minimum). Spacing between adjacent targets ≥ 8 px (chips 12, action row 12/8).

---

## 4. Every element — testid · role · copy · server call · inventory row

Copy: **th / en exactly as in mockups 01 (th) and 20B (en)**; where a mockup has no English (20A short labels, 05ก, 19, dialogs) the en text is proposed here and marked †. Keys are under `pos.register.` (so `search.placeholder` = `pos.register.search.placeholder`). Keys in **bold** are the oracle's 51 (S5.1); the others are additions this spec needs (ratify the list, *Q26*).
Inventory: page is always `/app/sys/[id]/pos/register`, `system: "POS"`, `query: "unit=[unitId]"`, `wo: "P1.3"`, `oracle: "qc-pos-p1.3"` for the asserted ids, `hiddenFor: []` unless stated. Expect types per `scripts/crm-ui-inventory.json` `$fields`.

### 4.1 Top context (Topbar slot / mobile header)
| testid | element | role / a11y | key → th / en | calls | inventory (kind · roles · expect) |
|---|---|---|---|---|---|
| `pos-reg-unit-switch` | unit chip ▾ (menu of units) | `button aria-haspopup="menu"`; one unit ⇒ plain text, same testid | data: `{tenant} · {unit}` (D), `{unit}` (C) — not translated | `router.push(?unit=)` → page reloads data | menu · owner, cashier · `{type:"navigate", target:"/app/sys/[id]/pos/register", note:"?unit=<other unit the actor can access>; single-unit actors see a non-interactive chip"}` |
| `pos-reg-status-online` | dot + text | `role="status"` | **status.online** ออนไลน์ / Online · **status.offline** ออฟไลน์ / Offline · **status.lastSync** `ซิงก์ล่าสุด {time}` / `last sync {time}` (joined with " · "; D only) | — | display |
| `pos-reg-status-shift` | chip with clock icon | — | **status.shift** `กะ #{no} · เปิด {time}` / `Shift #{no} · opened {time}` (P1.9) · **status.noShift** ยังไม่เปิดกะ / No shift open | `registerStatus` | display |
| `pos-reg-status-user` | avatar (first letter, 28 px square radius 8 border) + text | — | `{name} · {role}`; **roles.owner** เจ้าของ / Owner · **roles.manager** ผู้จัดการ / Manager · **roles.cashier** แคชเชียร์ / Cashier (T and C: name only) | `registerStatus` | display |
| `pos-reg-mobile-menu` | ☰ (C, in app only) | `aria-label` = `menu` ↓ | `menu` เมนู / Menu † | dispatch `app:drawer-open` | button · owner, cashier · `{type:"ui", target:"nav-drawer", state:"appears", note:"SHARK app WebView only"}` |

### 4.2 Mode tabs (`<nav aria-label={t("tabs.label")}>`; links are `<Link>`; soon tabs are `<span aria-disabled="true">` + chip)
| testid | th / en (D) | th / en short (T) | target |
|---|---|---|---|
| `pos-reg-tab-sale` | หน้าขาย / Sale | ขาย / Sale † | current (aria-current="page") |
| `pos-reg-tab-tables` | โต๊ะ / Tables | โต๊ะ / Tables | soon (P2.4) |
| `pos-reg-tab-online-orders` | ออเดอร์ออนไลน์ / Online orders | ออนไลน์ / Online † | soon (P2.8) |
| `pos-reg-tab-bills` | บิลวันนี้ / Today's bills | บิล / Bills † | `/app/sys/[id]/pos/sales` |
| `pos-reg-tab-shift` | กะ / Shift | กะ / Shift | `/app/sys/[id]/pos/close` |
| `pos-reg-tab-products` | สินค้า / Products | สินค้า / Products | `/app/sys/[id]/pos/products` |
| `pos-reg-tab-reports` | รายงาน / Reports | รายงาน / Reports | soon (P1.17) |
| `pos-reg-tab-settings` | ตั้งค่า / Settings | ตั้งค่า / Settings | `/app/sys/[id]` |
Keys `tabs.<key>` and `tabsShort.<key>`, `tabs.label` แถบโหมด / Modes †, `soonChip` เร็ว ๆ นี้ / Soon †. Inventory: one pattern row `pos-reg-tab-*` · tab · owner, cashier · `{type:"navigate", target:"/app/sys/[id]/pos/*", anyOf:["/app/sys/[id]"], note:"tables/online-orders/reports are 'soon' (no link) until P2.4/P2.8/P1.17"}`.

### 4.3 Left column
| testid | element | role / a11y | key → th / en | calls | inventory |
|---|---|---|---|---|---|
| `pos-reg-search` | search input (h-12) | `type="search"`, `aria-label`=placeholder, `enterKeyHint="search"`, `autoComplete="off"` | **search.placeholder** `ค้นหาชื่อ / SKU หรือสแกนบาร์โค้ด (F2)` / `Search name / SKU or scan barcode (F2)` · `search.placeholderShort` `ค้นหาชื่อ / SKU หรือสแกน` / `Search name / SKU or scan` † (T, C) | `registerCatalogAction({q})` debounced 200 ms; Enter → `addFromSearchEnter` | input · owner, cashier · `{type:"ui", target:"pos-reg-grid", state:"changes"}` |
| `pos-reg-search-kbd` | "F2" badge (D) | `aria-hidden` | literal `F2` (not translated) | — | display |
| `pos-reg-custom-item` | ghost button | `aria-label` in T (icon-only) | **search.customItem** รายการกำหนดเอง / Custom item | opens `pos-reg-custom-dialog` | button · owner · `{type:"modal", target:"pos-reg-custom-dialog", note:"needs pos.sale.priceOverride; cashier sees it disabled with reason (Q8)"}` |
| `pos-reg-scan-camera` | ghost button | `aria-label` in T/C | **search.scanCamera** สแกนด้วยกล้อง / Scan with camera | soon toast | button · owner, cashier · `{type:"toast", target:"pos-reg-toast", note:"P1.4 wires the camera"}` |
| `pos-reg-category-all` / `pos-reg-category-<categoryId>` | chip buttons | `role="tab"` inside `role="tablist"`, `aria-selected` | **category.all** ทั้งหมด / All · category names = data (`nameEn` in en) | `registerCatalogAction({categoryId})` | button · owner, cashier · `{type:"ui", target:"pos-reg-grid", state:"changes"}` (pattern `pos-reg-category-*`) |
| `pos-reg-grid` | grid container | `role="list"`, `aria-busy` while pending | — | — | display |
| `pos-reg-product-<productId>` | card `<button>` | `aria-label` = `{name} {price}` (+ sold-out text) | **product.soldOut** หมด / Sold out (suffix " · หมด") · **product.left** `เหลือ {count}` / `{count} left` · **product.stock** `สต็อก {count}` / `Stock {count}` · **product.service** บริการ / Service · **product.sizes** `{count} ขนาด` / `{count} sizes` (P1.2) · `product.noPrice` ยังไม่ตั้งราคา / No price set † | add to cart (local) → quote | button · owner, cashier · `{type:"ui", target:"pos-reg-lines", state:"changes"}` (pattern `pos-reg-product-*`, `not:["pos-reg-product-grid"]` — never create such an id) |
| `pos-reg-grid-more` | sentinel + "แสดงเพิ่ม" button | — | `search.loadMore` แสดงเพิ่ม / Show more † | `registerCatalogAction({cursor})` | button · owner, cashier · `{type:"ui", target:"pos-reg-grid", state:"changes"}` |
| `pos-reg-search-empty` | no-result block | `role="status"` | `search.noResult` `ไม่พบ “{q}” — ลองชื่ออื่น SKU หรือบาร์โค้ด` / `Nothing matches “{q}” — try another name, SKU or barcode` † | — | display |
| `pos-reg-search-clear` | ghost button in no-result block | — | `search.clear` ล้างคำค้น / Clear search † | clears q | button · owner, cashier · `{type:"ui", target:"pos-reg-grid", state:"changes"}` |
| `pos-reg-empty` | empty-catalogue block (19ก) | — | **empty.title** ยังไม่มีสินค้าให้ขาย / No products to sell yet † · **empty.body** (see *Q15*) | — | display |
| `pos-reg-empty-add-product` | `btn btn-primary` + plus icon | — | `empty.addProduct` เพิ่มสินค้า / Add product † | link | link · owner · `{type:"navigate", target:"/app/sys/[id]/pos/products"}` hiddenFor cashier? → **no**: cashier sees it, products page decides (record) |

### 4.4 Cart column
| testid | element | role / a11y | key → th / en | calls | inventory |
|---|---|---|---|---|---|
| `pos-reg-bill-type` | ink chip ▾ | `button` | **cart.newBill** บิลใหม่ / New bill · **cart.billType.takeaway** ซื้อกลับ / Takeaway → `บิลใหม่ · ซื้อกลับ` | soon toast | button · owner, cashier · `{type:"toast", target:"pos-reg-toast", note:"bill types: no WO yet"}` |
| `pos-reg-hold` | `btn-sm` + clock icon | `aria-keyshortcuts="F8"` | **cart.hold** พักบิล / Hold | `onHold` (soon toast) | button · owner, cashier · `{type:"toast", target:"pos-reg-toast", note:"P1.5"}` |
| `pos-reg-held-bills` | `btn-sm` (+ pill later) | — | **cart.heldBills** บิลที่พัก / Held bills · `cart.heldBillsShort` ที่พัก / Held † (T) | soon toast | button · owner, cashier · `{type:"toast", target:"pos-reg-toast", note:"P1.5"}` |
| `pos-reg-member-pick` | "+ เพิ่มสมาชิก" row | `button` | **member.add** เพิ่มสมาชิก / Add member † | soon toast | button · owner, cashier · `{type:"toast", target:"pos-reg-toast", note:"P1.12"}` |
| `pos-reg-member-remove` | "ถอด" underline link | — | **member.remove** ถอด / Remove | (P1.12) | button · owner, cashier · `{type:"ui", target:"pos-reg-member-pick", state:"appears", note:"rendered only with an attached member — never in P1.3"}` |
| `pos-reg-lines` | lines scroll container | `role="list"`, `aria-label`=`cart.title` | `cart.title` ตะกร้า / Cart † | — | display |
| `pos-reg-cart-empty` | empty-cart text | — | **cart.empty** `ยังไม่มีรายการ\nแตะสินค้าเพื่อเริ่มบิล` / `No items yet\nTap a product to start a bill` † (`whitespace-pre-line`) | — | display |
| `pos-reg-cart-line-<key>` | line row `<button>` (opens editor) | `aria-label` = `{qty} × {name} {amount}` | name = data; sub-line `line.discount` `ลด {amount}` / `−{amount}` (20B) · `line.stockMove` `สต็อก {from} → {to}` / `Stock {from} → {to}` · small `line.unitTimesQty` `{price} × {qty}` (same both) | opens `pos-reg-line-editor` | button · owner, cashier · `{type:"modal", target:"pos-reg-line-editor"}` |
| `pos-reg-line-qty-<key>` | qty button 44 × 44 around the 34 px box | `aria-label`=`editor.qty` | number | opens editor focused on qty | button · owner, cashier · `{type:"modal", target:"pos-reg-line-editor"}` |
| `pos-reg-line-warn-<key>` | stock warning box (19ฉ) | `role="alert"` | **errors.stockInsufficient** `สต็อกมี {count} — ขายได้ ระบบจะตั้งธงให้ตรวจนับ` / `Only {count} in stock — you can still sell; a stock count will be flagged` † | — | display |
| `pos-reg-line-warn-keep-<key>` / `pos-reg-line-warn-reduce-<key>` | `btn btn-primary` h-10 / `btn btn-ghost` h-10 | — | `line.keepSelling` ขายต่อ / Keep selling † · `line.reduceTo` `ลดเหลือ {count}` / `Reduce to {count}` † | local | button · owner, cashier · `{type:"ui", target:"pos-reg-line-warn-*", state:"disappears"}` (two pattern rows) |
| `pos-reg-subtotal` | totals row | — | **totals.subtotal** รวม / Subtotal | quote | display |
| `pos-reg-line-discounts` | row (only if > 0) | — | **totals.lineDiscounts** ส่วนลดรายการ / Line discounts | quote | display |
| `pos-reg-bill-discount-line` | row (always when cart non-empty; ฿0 in ink-soft) | — | **totals.billDiscount** ส่วนลดท้ายบิล / Bill discount | quote | display |
| `pos-reg-bill-discount-edit` | "แก้" link-button inside that row | `button` | **totals.edit** แก้ / Edit | opens dialog | button · owner, cashier · `{type:"modal", target:"pos-reg-bill-discount-dialog"}` |
| `pos-reg-coupon-line` | row (only when a coupon is applied) | — | **totals.coupon** `คูปอง {code}` / `Coupon {code}` | quote | display |
| `pos-reg-vat-line` | row (mode ≠ NONE) | — | **totals.vatIncluded** `VAT {rate}% (รวมในราคา)` / `VAT {rate}% (included)` · **totals.vatExcluded** `VAT {rate}%` / `VAT {rate}%` | quote | display |
| `pos-reg-total` | "ยอดสุทธิ" row | `aria-live="polite"` | **totals.total** ยอดสุทธิ / Total | quote | display |
| `pos-reg-error` | inline danger text under totals | `role="alert"` | `errors.*` | — | display |
| `pos-reg-bill-discount` | action-row `btn-sm` "% ส่วนลดท้ายบิล" | — | **actions.billDiscount** ส่วนลดท้ายบิล / Bill discount · `actions.billDiscountShort` ลดท้ายบิล / Discount † (T) | opens dialog | button · owner, cashier · `{type:"modal", target:"pos-reg-bill-discount-dialog"}` |
| `pos-reg-note` | `btn-sm` "✎ หมายเหตุ" | — | **actions.note** หมายเหตุ / Note | soon toast (*Q11*) | button · owner, cashier · `{type:"toast", target:"pos-reg-toast"}` |
| `pos-reg-tax-invoice` | `btn-sm` "▤ ใบกำกับเต็มรูป" | — | **actions.taxInvoice** ใบกำกับเต็มรูป / Full tax invoice · `actions.taxInvoiceShort` ใบกำกับ / Tax invoice † (T) | soon toast | button · owner, cashier · `{type:"toast", target:"pos-reg-toast", note:"P1.13"}` |
| `pos-reg-pay` | pay button (h-[72px] D, h-[70px] T) | `aria-keyshortcuts="F4"`, disabled state as §3.3 | **actions.pay** ชำระเงิน / Pay + amount + ` (F4)` (D only, literal) | opens interim dialog | button · owner, cashier · `{type:"modal", target:"pos-reg-paydlg"}` |
| `pos-reg-coupon` | coupon code input **inside** `pos-reg-bill-discount-dialog` (mockup 01 has no separate coupon entry; *Q12*) | `aria-label`=`coupon.placeholder` | `coupon.label` คูปอง / Coupon † · `coupon.placeholder` โค้ดคูปอง / Coupon code † | quote with `couponCode` | input · owner, cashier · `{type:"ui", target:"pos-reg-coupon-line", state:"appears"}` |

### 4.5 Status bar (D only), mobile bar, toast, offline
| testid | element | key → th / en | inventory |
|---|---|---|---|
| `pos-reg-shortcuts` | left group | **shortcuts.title** แป้นลัด / Shortcuts · **shortcuts.search** ค้นหา / Search · **shortcuts.pay** ชำระ / Pay · **shortcuts.hold** พักบิล / Hold · **shortcuts.clear** ล้าง / Clear (kbd literals F2 F4 F8 Esc) | display |
| `pos-reg-status-stock-pending` | text | **status.pendingStock** `รอตัดสต็อก {count}` / `Stock pending {count}` | display |
| `pos-reg-status-sync-pending` | text | **status.pendingSync** `รอซิงก์ {count}` / `Sync pending {count}` | display |
| `pos-reg-status-printer` | icon + text | **status.printerReady** `เครื่องพิมพ์ {width} มม. พร้อม` / `Printer {width} mm ready` (P1.10) · `status.printerNone` ยังไม่เชื่อมเครื่องพิมพ์ / No printer connected † (P1.3) | display |
| `pos-reg-cart-bar` | mobile bar (whole bar is a button except the pay button) | peek list = data · `cart.viewCart` ดูตะกร้า / View cart † · `cart.itemCount` `{count} รายการ` / `{count, plural, one {# item} other {# items}}` † | button · owner, cashier · `{type:"modal", target:"pos-reg-cart-sheet"}` |
| `pos-reg-cart-bar-pay` | "ชำระ ›" h-12 | `cart.payShort` ชำระ / Pay † | button · owner, cashier · `{type:"modal", target:"pos-reg-paydlg"}` |
| `pos-reg-cart-sheet` / `pos-reg-sheet-close` | sheet / close ✕ size-11 | `cart.close` ปิด / Close † | sheet display · close: button · owner, cashier · `{type:"ui", target:"pos-reg-cart-sheet", state:"disappears"}` |
| `pos-reg-offline-banner` | black banner | `status.offlineBanner` `ออฟไลน์ตั้งแต่ {time} — ขายต่อได้เมื่อกลับมาออนไลน์` / `Offline since {time} — you can sell again once back online` † | display |
| `pos-reg-toast` | toast (19ค style: bg ink, text surface 14, radius 16, padding 14 / 18, bottom-centre, 4 s) | `soon` ฟังก์ชันนี้จะเปิดใช้เร็ว ๆ นี้ / Coming soon † | display |

### 4.6 Dialogs (centred ≥ md: width 420, radius 22, padding 28, shadow; bottom sheet on C)
| testid | element | keys th / en (all †) | calls | inventory (all owner, cashier unless stated) |
|---|---|---|---|---|
| `pos-reg-line-editor` | editor popover/sheet | `editor.title` แก้รายการ / Edit item | — | display |
| `pos-reg-editor-qty-dec` / `-inc` / `pos-reg-editor-qty-input` | −/+ 48 × 48, number input | `editor.qty` จำนวน / Quantity | local → quote | button/button/input · `{type:"ui", target:"pos-reg-total", state:"changes"}` |
| `pos-reg-line-discount-<key>` | discount value input in the editor | `editor.discount` ส่วนลดรายการ / Item discount · `editor.baht` บาท / Baht · `editor.percent` เปอร์เซ็นต์ / Percent | local priceCart → quote | input · `{type:"ui", target:"pos-reg-line-discounts", state:"appears"}` (pattern) |
| `pos-reg-editor-discount-amount` / `-percent` | segmented toggle | as above | local | toggle · `{type:"ui", target:"pos-reg-line-editor", state:"changes"}` |
| `pos-reg-editor-apply` / `pos-reg-editor-close` | `btn-primary` h-12 / ✕ | `editor.apply` ใช้ / Apply · `cart.close` | local | button · `{type:"ui", target:"pos-reg-line-editor", state:"disappears"}`; refusal ⇒ `{type:"inline-error", target:"pos-reg-editor-error"}` in `anyOf` |
| `pos-reg-editor-error` | inline danger text | `errors.*` | — | display |
| `pos-reg-line-remove-<key>` | `btn btn-ghost` danger text h-12 in the editor | `editor.remove` ลบรายการ / Remove item | local (no confirm, *Q27*) | button · `{type:"ui", target:"pos-reg-cart-line-*", state:"disappears"}` (pattern) |
| `pos-reg-bill-discount-dialog` | dialog | **actions.billDiscount** as title | — | display |
| `pos-reg-bill-discount-amount` / `-percent` / `pos-reg-bill-discount-value` / `pos-reg-bill-discount-apply` / `pos-reg-bill-discount-clear` / `pos-reg-bill-discount-cancel` | toggle ×2, input, buttons | `editor.baht` / `editor.percent` · `billDiscount.apply` ใช้ส่วนลด / Apply discount · `billDiscount.remove` ไม่มีส่วนลด / No discount · `common.cancel` | local → quote | toggle/toggle/input/button/button/button · apply/clear `{type:"ui", target:"pos-reg-bill-discount-line", state:"changes", anyOf-inline-error:"pos-reg-bill-discount-error"}` |
| `pos-reg-coupon-apply` / `pos-reg-coupon-remove` | buttons next to `pos-reg-coupon` | `coupon.apply` ใช้คูปอง / Apply · `coupon.remove` เอาคูปองออก / Remove coupon | quote | button · `{type:"ui", target:"pos-reg-coupon-line", state:"appears"/"disappears"}` |
| `pos-reg-custom-dialog` · `pos-reg-custom-name` · `pos-reg-custom-price` · `pos-reg-custom-add` · `pos-reg-custom-cancel` | dialog, inputs, buttons | `custom.title` = **search.customItem** · `custom.name` ชื่อรายการ / Item name · `custom.price` ราคา (บาท) / Price (baht) · `custom.add` เพิ่มลงตะกร้า / Add to cart | local → quote | owner only · add: `{type:"ui", target:"pos-reg-lines", state:"changes"}` |
| `pos-reg-open-price-dialog` · `pos-reg-open-price-input` · `pos-reg-open-price-add` · `pos-reg-open-price-cancel` | unpriced product with permission | `openPrice.title` ตั้งราคาขายครั้งนี้ / Set a price for this sale · `openPrice.hint` `{name} ยังไม่ตั้งราคา — ราคานี้ใช้กับบิลนี้เท่านั้น` / `{name} has no price yet — this price applies to this bill only` | line `openPrice: true` | owner only |
| `pos-reg-clear-dialog` · `pos-reg-clear-confirm` · `pos-reg-clear-cancel` | Esc confirm | `clear.title` ล้างบิลนี้? / Clear this bill? · `clear.detail` รายการทั้งหมดในตะกร้าจะถูกลบ / Every item in the cart will be removed · `clear.confirm` ล้างบิล / Clear bill | local | confirm: `{type:"ui", target:"pos-reg-cart-empty", state:"appears"}` |
| `pos-reg-paydlg` | interim pay dialog (*Q5*) | `pay.title` ชำระเงิน / Payment · `pay.due` ยอดที่ต้องชำระ / Amount due | — | display |
| `pos-reg-paydlg-method-cash` / `-method-promptpay` | 78 px method tiles (mockup 02 `.paym`) | `pay.cash` เงินสด / Cash · `pay.promptpay` PromptPay / PromptPay · `pay.noPromptPay` ร้านยังไม่ตั้ง PromptPay ID / PromptPay ID not set up | local | toggle · `{type:"ui", target:"pos-reg-paydlg", state:"changes"}` |
| `pos-reg-paydlg-received` · `pos-reg-paydlg-quick-<amount>` · `pos-reg-paydlg-change` | cash input, quick-amount buttons (exact · ฿100 · ฿500 · ฿1,000), change display | `pay.received` รับเงิน / Cash received · `pay.exact` พอดี / Exact · `pay.change` เงินทอน / Change | local | input / button (pattern) · `{type:"ui", target:"pos-reg-paydlg-change", state:"changes"}` |
| `pos-reg-paydlg-confirm` | `btn-primary` h-14 | `pay.confirmCash` `ยืนยันรับเงินสด {amount}` / `Confirm cash {amount}` · `pay.confirmPromptPay` ยืนยันว่าเงินเข้าแล้ว / Confirm money received | `submitRegisterSaleAction` | button · `{type:"mutation", target:"action:submitRegisterSaleAction", resultTarget:"pos-reg-done", db:"PosSale PAID + PosPayment"}` |
| `pos-reg-paydlg-retry` | shown only for unknown result | `pay.retry` ลองอีกครั้ง / Try again · `errors.unknownResult` | same key | button · same as confirm |
| `pos-reg-paydlg-close` | ✕ (hidden while sending/unknown) | `cart.close` | — | button · `{type:"ui", target:"pos-reg-paydlg", state:"disappears"}` |
| `pos-reg-paydlg-error` | error card (19ค style) | `errors.*` | — | display |
| `pos-reg-done` · `pos-reg-done-receipt` · `pos-reg-done-change` · `pos-reg-done-next` | done view in the dialog | `done.title` ขายสำเร็จ / Sale complete · `done.receipt` `ใบเสร็จ {no}` / `Receipt {no}` · `done.change` = `pay.change` · `done.next` ขายบิลถัดไป / Next sale | reset | next: button · `{type:"ui", target:"pos-reg-cart-empty", state:"appears"}` |

**Refusal code → key** (`refusalMessageKey`; all †; no raw code ever shown):
| code | key | th | en |
|---|---|---|---|
| NOT_FOUND | errors.notFound | ไม่พบสาขานี้ หรือบัญชีนี้ยังขายที่สาขานี้ไม่ได้ | This branch isn't available to this account |
| PERMISSION_DENIED | **errors.permissionDenied** | บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์ | This account can't sell yet — ask the owner to grant access |
| VALIDATION · INVALID_LINE | errors.invalidLine | จำนวนหรือราคาไม่ถูกต้อง — ตรวจรายการอีกครั้ง | A quantity or price isn't valid — please check the items |
| PRODUCT_NOT_FOUND | errors.productNotFound | มีสินค้าที่ถูกลบหรือย้ายไปแล้ว — นำออกจากตะกร้าแล้วลองใหม่ | An item was removed from the catalogue — take it out of the cart and try again |
| PRODUCT_UNAVAILABLE | **errors.productUnavailable** | สินค้านี้ปิดขายที่สาขานี้อยู่ | This item isn't on sale at this branch right now |
| MEMBER_NOT_FOUND | errors.memberNotFound | ไม่พบสมาชิกนี้ในร้าน | This member wasn't found in the shop |
| PRICE_NOT_SET | errors.priceNotSet | สินค้านี้ยังไม่ตั้งราคา — ตั้งราคาที่หน้าสินค้าก่อน | This item has no price yet — set it on the Products page first |
| PRICE_CHANGED | errors.priceChanged | ราคาบางรายการเปลี่ยน — ตรวจยอดใหม่แล้วชำระอีกครั้ง | Some prices changed — check the new total and pay again |
| PAYMENT_MISMATCH | **errors.paymentMismatch** | ยอดเงินไม่ตรงกับยอดบิลล่าสุด — ตรวจยอดใหม่แล้วชำระอีกครั้ง | The amount doesn't match the latest total — check it and pay again |
| IDEMPOTENCY_CONFLICT | errors.idempotencyConflict | บิลนี้ถูกส่งไปแล้ว — เริ่มบิลใหม่ | This bill was already sent — start a new bill |
| LINE_DISCOUNT_EXCEEDS_LINE | errors.lineDiscountExceedsLine | ส่วนลดมากกว่าราคาของรายการ | The discount is more than the item's price |
| BILL_DISCOUNT_EXCEEDS_TOTAL | errors.billDiscountExceedsTotal | ส่วนลดท้ายบิลมากกว่ายอดบิล | The bill discount is more than the bill total |
| DISCOUNT_EXCEEDS_LIMIT | **errors.discountExceedsLimit** | `ส่วนลดเกินสิทธิ์ของบัญชีนี้ (สูงสุด {limit}%) — ให้ผู้จัดการทำรายการนี้` | `This discount is above this account's limit (max {limit}%) — ask a manager` |
| TOO_MANY_LINES | errors.tooManyLines | `บิลหนึ่งใส่ได้ไม่เกิน {max} รายการ — แยกเป็นบิลใหม่` | `A bill can hold up to {max} items — start a new bill for the rest` |
| STOCK_INSUFFICIENT | **errors.stockInsufficient** | (line warning, above) | |
| client: offline | errors.offline | ออฟไลน์อยู่ — ชำระเงินได้เมื่อกลับมาออนไลน์ | You're offline — you can take payment once back online |
| client: network/timeout on submit | errors.unknownResult | ยังไม่แน่ใจว่าบันทึกบิลแล้วหรือยัง — กดลองอีกครั้ง ระบบจะไม่เก็บเงินซ้ำ | We're not sure the bill was saved — tap Try again; the customer won't be charged twice |
| client: catalog load failed | errors.loadFailed | โหลดรายการสินค้าไม่สำเร็จ — ลองอีกครั้ง | Couldn't load products — try again |
| client: options required | errors.optionsRequired | สินค้านี้ต้องเลือกตัวเลือก — ยังขายจากหน้านี้ไม่ได้ | This item needs options — it can't be sold from here yet |
| client: no priceOverride | errors.needPriceOverride | ต้องมีสิทธิ์ตั้งราคาเอง — ให้ผู้จัดการทำรายการนี้ | Setting your own price needs a manager |
| coupon refused (today's coupon facade message) | errors.couponInvalid | ใช้คูปองนี้ไม่ได้ | This coupon can't be used |
| anything else | errors.unknown | เกิดข้อผิดพลาด — ลองอีกครั้ง | Something went wrong — please try again |

### 4.7 Inventory rows to add (`scripts/pos-ui-inventory.json` → `rows`) — exact shape of the existing rows
Template (one per clickable id/pattern above; the 23 oracle ids are mandatory for S5.5, the rest keep F15.3 green because they are new clickable testids in POS folders):
```json
{ "page": "/app/sys/[id]/pos/register", "testid": "pos-reg-pay", "kind": "button", "roles": ["owner", "cashier"], "hiddenFor": [],
  "expect": { "type": "modal", "target": "pos-reg-paydlg", "note": "F4 does the same · disabled while the cart is empty, the quote is pending/failed, offline, or a submit is in flight" },
  "wo": "P1.3", "oracle": "qc-pos-p1.3", "system": "POS", "query": "unit=[unitId]" }
```
Pattern rows: `pos-reg-tab-*`, `pos-reg-category-*`, `pos-reg-product-*`, `pos-reg-cart-line-*`, `pos-reg-line-qty-*`, `pos-reg-line-discount-*`, `pos-reg-line-remove-*`, `pos-reg-line-warn-keep-*`, `pos-reg-line-warn-reduce-*`, `pos-reg-paydlg-quick-*`. The three legacy rows (`pos-pay-button`, `pos-member-select`, `pos-catalog-item`, wo Wave1-B/M2.8) **stay** while the legacy screen exists behind the flag (*Q4*). `baselineDebt` for `register/page.tsx` goes to 0 (rewritten page; the legacy branch only renders `<PosRegister/>`, the ModuleTabs/EmptyState/Link elements of the legacy page must carry testids or move into a legacy component under the same debt rules); `register-ui.tsx` debt stays 22 until P1.12 removes the legacy file (S5.6 conflict → *Q4*).

---

## 5. States

| state | data condition | grid / card | cart / pay | copy |
|---|---|---|---|---|
| Empty catalogue (19ก) | `registerCatalog` → `products: []`, `categories: []`, no `q`, no `categoryId` | chips row shows only "ทั้งหมด" (active); grid area replaced by `pos-reg-empty`: icon tile 76 × 76 radius 22 bg surface-2 border (box icon 32, stroke 1.5, ink-soft), title 20 bold, body 14.5 muted max-w 380, `+ เพิ่มสินค้า` primary h 46; vertically centred, gap 12 | cart: `cart.empty` centred `--color-muted` 13.5 (19ก `--mut2`); pay disabled: bg surface-2, text muted, 1 px line, `ชำระเงิน ฿0` | §4.3 |
| Search no result | `q` non-empty and `products: []` | `pos-reg-search-empty` centred in the grid area: 15 px muted text + `pos-reg-search-clear` ghost h 44 | unchanged | §4.3 |
| Category with no products | `categoryId` set, `products: []` | same block, text `search.noResultCategory` ยังไม่มีสินค้าในหมวดนี้ / No products in this category † (no clear button) | unchanged | |
| Price not set | `priceSatang === null` | card price slot shows `product.noPrice` in `--color-muted` 13.5 (no ฿); card NOT dimmed. Tap: with `canOverridePrice` ⇒ `pos-reg-open-price-dialog`; without ⇒ toast `errors.priceNotSet`. **Never** add at 0 or at cost (R2) | line from open price shows the entered price; server checks `pos.sale.priceOverride` (S3.23) | §4.6 |
| Zero price | `priceSatang === 0` | shows `฿0` normally (S1.2), sells at 0 | normal | |
| Sold out — unavailable at branch (86) | `soldOut && soldOutReason === "UNAVAILABLE"` | card `opacity-45`; name + " · " + `product.soldOut` in `--color-danger` (mockup `.oos .nm::after`); tap ⇒ toast `errors.productUnavailable`, nothing added; `aria-disabled="true"` | — | |
| Sold out — no stock (tracked, onHand ≤ 0) | `soldOut && soldOutReason === "NO_STOCK"` | same look as above; tap **adds** (default policy ALLOW_NEGATIVE — server sells, S3.18) and the line shows the stock warning `pos-reg-line-warn-<key>` with `count = max(stockLeft, 0)` | line: 3 px `--color-danger` left border (19ฉ `.cl.wl`), warning box bg surface-2 border line radius 14 padding 12 / 13: warn icon danger, bold danger "สต็อกมี N", rest ink-soft 13.5; buttons "ขายต่อ" (primary h 40) / "ลดเหลือ N" (ghost h 40; hidden when N = 0) | if the controller prefers blocking, the BLOCK policy is P1.6 (S6.1) |
| Low stock | tracked, `0 < stockLeft ≤ REGISTER_LOW_STOCK` | right label `product.left` "เหลือ N", `--color-ink-soft` bold | warning appears when line qty > stockLeft | |
| Normal stock (tracked) | `stockLeft > REGISTER_LOW_STOCK` | right label `product.stock` "สต็อก N", muted | line sub-line `line.stockMove` "สต็อก N → N−qty" (01 "สต็อก 11 → 10"); hidden when the line has a discount (discount text wins) | |
| Untracked | `stockLeft === null` | no stock label; SERVICE kind shows `product.service` "บริการ" muted | no stock sub-line | |
| Options (P1.2) | `optionGroupCount > 0` | P1.3 shows the card normally; `requiredOptionGroupCount > 0` ⇒ tap = toast `errors.optionsRequired` (*Q6*); `product.sizes` label hidden | — | |
| Loading catalogue | `catalogPending` | previous grid at `opacity-60`, `aria-busy` | unchanged | — |
| Loading quote | `quoteState === "pending"` | — | local numbers shown immediately; pay keeps last amount; > 400 ms ⇒ amount slot shows `common.loading` "กำลังโหลด..." | |
| Quote refused | `quoteState === "error"` | — | `pos-reg-error` under totals in `--color-danger` 13.5; pay disabled | §4.6 table |
| Submit refused | `ok:false` | — | error card inside `pos-reg-paydlg` (`pos-reg-paydlg-error`), dialog stays open; new idem key (§3.4) | |
| Submit unknown | network/timeout | — | cart frozen; only `pos-reg-paydlg-retry` | `errors.unknownResult` |
| Offline | `navigator.onLine === false` | grid usable | `pos-reg-offline-banner` under tabs (C: under the mobile header); pay disabled with `errors.offline` as its `title` + visible text under totals | §4.5 |
| No permission to sell | `canCreate === false` (page) | grid visible | pay disabled + `errors.permissionDenied` under totals (the page itself is 404 for users without POS access — HF-POS-PAGES) | |
| Long names | product 60+ chars, Thai without spaces | grid name `line-clamp-2` + `break-words` (Thai has no spaces: also `[overflow-wrap:anywhere]`); full name in `title` + `aria-label` | cart name wraps freely (`break-words`), amount column `whitespace-nowrap shrink-0`; mobile peek row single-line ellipsis | |
| Long category name | e.g. "เมล็ดกาแฟและของฝาก" | chip `whitespace-nowrap`, row scrolls; T mockup shows a shortened label "ของฝาก" — data cannot be shortened, accept full name + scroll | | |
| 200-line cart | `lines.length === 200` | adding a *new* product ⇒ toast `errors.tooManyLines` (`{max}` = 200); qty +1 on existing lines still works | lines list is plain DOM (200 rows ≈ 17 k px; no virtualisation needed — P5.3 perf owns it); quote payload sent as is (S3.21 server side) | |
| Big numbers | totals up to 9,999 × price | amounts `tabular-nums whitespace-nowrap`; total row 26 px fits "฿9,999,999.99" in 480 − 48; on T 24 px in 380 − 32 (check) | | |
| Fractional satang | e.g. 8550 | `moneyText` ⇒ `฿85.50` (decimals only when `satang % 100 ≠ 0`); `formatBaht` alone would print `฿85.5` ✗ | VAT row always 2 decimals (`฿40.89`) | |

**Numbers.** All money is integer satang end-to-end; display through `formatBaht` (`src/lib/ui/money.ts`, `th-TH` grouping, `−฿` for negatives — U+2212 as the mockups) wrapped by `moneyText` (above). Discounts display as negatives `−฿10` in `--color-danger`; a zero bill discount displays `฿0` in ink-soft (01). The English screen keeps `฿` and Thai grouping (20B "เงินยังเป็น ฿ ตามสกุลเงินร้าน"). Quantities `toLocaleString("th-TH")`. Times (`last sync`, offline since) via `formatThaiTime` (`src/lib/ui/date.ts`, Asia/Bangkok) — 24 h "09:41" in both locales.

**VAT line before P1.6.** Display only, from the quote: `vatMode` comes from the accounting book linked to the POS (`vatRegistered` ⇒ INCLUDED at its `vatRateBp`; not registered or no accounting link ⇒ NONE ⇒ row hidden). EXCLUDED cannot occur in P1.3 because no "price excludes VAT" setting exists anywhere (review §6 row 5) — the UI still supports it (row `VAT 7%` in ink-soft, total includes it) for P1.6. Rate shown as percent: `rateBp / 100` with no trailing ".00" (700 ⇒ "7"). Nothing about VAT is stored by P1.3 (R7); the sale keeps `vatSatang = 0` as today and Accounting re-derives.

---

## 6. i18n plumbing

1. **Files**: `src/messages/th/pos.json` and `src/messages/en/pos.json`, each `{ "register": { … } }` (no outer `pos` key — G6), nested exactly as the dotted keys of §4 (`register.search.placeholder`, `register.tabs.sale`, `register.errors.notFound` …). Both files have the identical key tree (S5.1 checks the 51; the reviewer checks the rest by diffing the two trees).
2. **`src/i18n/request.ts`** — one append-only hunk, marked:
   ```ts
   // POS P1.3 ▸ module messages: messages/<locale>/pos.json under the "pos" namespace ◂
   const pos = (await import(`../messages/${locale}/pos.json`)).default;
   return { locale, messages: { ...messages, pos } };
   ```
   (replace the existing `return { locale, messages };`). Keep `common.json` as is. The root layout's `<NextIntlClientProvider>` (no `messages` prop, next-intl v4) already forwards all request messages to client components — no change in `src/app/layout.tsx`.
3. **Usage**: client components `const t = useTranslations("pos.register")`; ICU variables `{count}`, `{time}`, `{code}`, `{rate}`, `{no}`, `{name}`, `{q}`, `{max}`, `{limit}`, `{amount}`, `{price}`, `{qty}`, `{from}`, `{to}`, `{width}`. `cart.empty` uses a literal `\n` + `whitespace-pre-line`. `common.loading` / `common.cancel` come from the existing `common` namespace (`useTranslations("common")`).
4. **Locale**: decided by the `LOCALE` cookie (`src/i18n/config.ts`); there is no locale switcher in the UI today — the visual harness sets `LOCALE=en` for 20B. (A switcher is not owned by any P1 WO — P1.18 "th/en" is the nearest; flag.)
5. **Must NOT be translated** (render data/literals as is): product, category, unit and tenant names (except `nameEn` when locale = en and present), member names, coupon codes, receipt numbers, SKU/barcode, the currency sign `฿` and Thai digit grouping, kbd labels `F2 F4 F8 Esc`, the literal ` (F4)` on the pay button, "PromptPay", "VAT", "80 มม." comes from the printer key (P1.10), times (24 h). The server's Thai `message` in refusals is never displayed.
6. **Not in `pos.json`**: legacy screen strings (`register-ui.tsx` stays Thai-hardcoded — out of scope), app-shell strings.

---

## 7. Parity checklist (reviewer — screenshot vs mockup)

Shots: `visual-pos.mts p1.3 --page register` gives 1440×900, 1024×768, 390×844 (CONTROLLER-RUN; needs a server). The reviewer also needs, from the controller, shots with a **seeded 4-line cart equal to mockup 01** (ลาเต้ ×2 at ฿100 open/priced, อเมริกาโน่ ฿70, ครัวซองต์อัลมอนด์ ฿95 −฿10, เมล็ดกาแฟ 250 g ฿320 tracked stock 11, coupon WELCOME50 −฿50, VAT-registered book) and `LOCALE=en` for 20B, plus empty-catalogue and offline states (19). Positions below are in the register's own coordinates: **x from the viewport's left edge**, **y from the bottom of the real Topbar** (the mockup Topbar is 66 px in 01 / 54 px in 20A vs. 56 real). Tolerance ±2 px for sizes, ±4 px for positions, exact for colours/text. Accepted deltas are listed after each block — anything else is a finding.

### 7.1 D — 1440×900 (vs 01-register.png, frame origin (37, 64), Topbar 66)
1. Rail visible, 56 px wide, bg surface-2, right border line; register content starts at x = 56.
2. Mode-tab row height 58, bottom border `#e5e5e5`; first tab starts at x = 82 (56 + 26).
3. 8 tabs in order หน้าขาย · โต๊ะ · ออเดอร์ออนไลน์ · บิลวันนี้ · กะ · สินค้า · รายงาน · ตั้งค่า, each with a 14 px icon left of a 15 px label.
4. Active tab "หน้าขาย": ink `#0a0a0a`, bold, 2 px `#1d4ed8` underline flush with the row's bottom border, underline ≈ 117 px wide.
5. Inactive tab labels `#404040`, regular weight.
6. Search field: x = 74, top = tabs bottom + 14, height 48, width ≈ 498, radius 13, 1 px `#e5e5e5` border.
7. Search placeholder exactly "ค้นหาชื่อ / SKU หรือสแกนบาร์โค้ด (F2)" in `#737373` 15 px, magnifier icon left; "F2" kbd badge at the right inside the field (≈ 24 × 20, radius 5).
8. "+ รายการกำหนดเอง" ghost button 46 tall, ≈ 172 wide, 16 px right of the search; "สแกนด้วยกล้อง" ≈ 160 wide, 16 px further right; both radius 13, 1 px line border, 15 px ink.
9. Category row: first chip x = 86 (56 + 30), top = search bottom + 22; chips 44 tall, radius 13, gap 12.
10. Active chip: bg ink, white bold text; inactive: white bg, 1 px line border, `#404040` text.
11. Grid: 4 equal columns starting x = 86, column gap 22, first row top = chips bottom + 24.
12. Card ≈ 194 wide × ≥ 170 tall, radius 18, 1 px `#e5e5e5` border, 16 px inner padding.
13. Card image block 104 tall, radius 8, colour `#f4f5f7`, full card inner width.
14. Card name 16 px semibold ink, max 2 lines; price 16 px `#404040` with ฿ prefix, left-aligned, 6 px below the name.
15. Card right label ("สต็อก 11", "บริการ") 12.5 px muted, right-aligned on the price baseline; low-stock "เหลือ 2" `#404040` bold.
16. Sold-out card at ≈ 45 % opacity with " · หมด" in `#b91c1c` after the name.
17. Cart column: x = 960 → 1440 (480 wide), 1 px line border on its left (= left column's right border), full body height.
18. Cart header height ≈ 68 (mockup 64 — accepted +4), bottom border line; chip "บิลใหม่ · ซื้อกลับ ▾" at x = 976, 28 tall, 1 px ink border, 13 px bold.
19. "⏱ พักบิล" and "บิลที่พัก" right-aligned in the header, 44 tall (mockup 40 — accepted), gap 12, 16 px from the right edge.
20. Member slot box at x = 976 → 1424, radius 18, bg `#fafafa`, 1 px line (content differs — P1.3 shows "+ เพิ่มสมาชิก"; accepted).
21. Cart line: padding 18 / 24; qty box 34 × 34, radius 10, 1 px line, bold 15 px number, at x = 984.
22. Line name 16 px semibold at x ≈ 1034 (qty box + 16 gap); sub-line 13.5 px muted 4 px below.
23. Line amount right-aligned at x = 1416 (24 from edge), 16 px semibold; "฿100 × 2" 12.5 px muted under it; line discount "−฿10" `#b91c1c` 600 under it.
24. Lines separated by 1 px `#e5e5e5` rules spanning the full cart width.
25. Totals block: top border line, 24 px side padding, rows "รวม · ส่วนลดรายการ · ส่วนลดท้ายบิล แก้ · คูปอง WELCOME50 · VAT 7% (รวมในราคา) · ยอดสุทธิ" in that order, ≈ 34 px row pitch.
26. Discount amounts `−฿10` / `−฿50` in `#b91c1c`; bill discount `฿0` in `#404040`; "แก้" 12 px bold `#1d4ed8`, 6 px after the label.
27. VAT row 12 px `#737373`, amount "฿40.89" (2 decimals).
28. "ยอดสุทธิ" row 26 px bold ink, total "฿625" right-aligned at x = 1416.
29. Action row: three equal buttons 40 tall, radius 11, gap 12, inset 16 px: "% ส่วนลดท้ายบิล" · "✎ หมายเหตุ" · "▤ ใบกำกับเต็มรูป".
30. Pay button: x = 984 → 1416 (432 wide), 72 tall, radius 18, bg ink; 16 px below the action row; bottom edge 24 px above the status bar.
31. Pay label "ชำระเงิน" 19 px bold white at the left (24 px inset); right "฿625" bold + " (F4)" 12 px at 70 % opacity.
32. Status bar 34 tall at the very bottom, bg `#fafafa`, top border line, spans x = 56 → 1440.
33. Status bar left: "แป้นลัด" then kbd chips F2 ค้นหา · F4 ชำระ · F8 พักบิล · Esc ล้าง, 12 px muted, 26 px gaps.
34. Status bar right: "รอตัดสต็อก 0 · รอซิงก์ 0 · 🖨 <printer text>" right-aligned with 18 px inset.
35. No horizontal scrollbar on the page; grid and cart lines scroll vertically inside their regions; pay button and totals stay visible while lines scroll.
36. Topbar slot (*Q1*): unit chip "บ้านกาแฟสวนผึ้ง · สาขาหัวหิน ▾" (32 tall, radius 8, 1 px line, 13 px), then at the right "● ออนไลน์ · ซิงก์ล่าสุด HH:MM" 12.5 muted, shift chip, avatar + "name · role".
Accepted deltas (D): real Topbar 56 vs 66 and its own brand/buttons; IBM Plex vs Noto glyph widths; frame height 900 vs 1210 (scroll); no option popover / selected-card ring (P1.2); member card → "+ เพิ่มสมาชิก"; hold buttons 44 vs 40; no count pills; shift chip text "ยังไม่เปิดกะ"; printer text placeholder; soon-tab dimming (*Q13*).

### 7.2 T — 1024×768 (vs 20-en-ipad.png 20A; image shown at 1/1.08 — numbers here are true px)
1. Whole register fits in 768 without page scroll; no status bar.
2. Mode tabs are icon-over-label columns (icon 19, label 13 px), ≥ 64 wide each, short labels ขาย · โต๊ะ · ออนไลน์ · บิล · กะ · สินค้า · รายงาน · ตั้งค่า.
3. Active tab "ขาย" ink bold with 2 px accent underline.
4. Cart column exactly 380 wide at the right edge.
5. Left column 588 wide with rail (644 in the mockup without rail — *Q2*).
6. Search field 44 tall, 14 px, placeholder "ค้นหาชื่อ / SKU หรือสแกน", no F2 badge.
7. Two icon-only buttons (plus, camera) 48 × 44, gap 10, right of the search.
8. Search row padding 12 top / 16 sides.
9. Category chips 44 tall (mockup 38 — accepted, *Q14*), 14 px, radius 11, gap 8, row padding 12 / 16.
10. Grid 3 equal columns, gap 12, padding 14 / 16.
11. Card radius 15, padding 11, image 84 tall, name 15 px, price 15 px.
12. Cart header padding 9 / 14, buttons "พักบิล" / "ที่พัก" 44 tall (mockup 36 — accepted).
13. Member slot margin 8 / 14, no "ถอด" link.
14. Cart line padding 8 / 16, qty box 30 × 30, name 15, sub 12.5, amount 15, no "฿100 × 2" small line.
15. Totals padding 8 / 16, 14 px rows with 1 px vertical padding, total row 24 px.
16. Action row buttons 36 tall, labels "ลดท้ายบิล" · "หมายเหตุ" · "ใบกำกับ", gap 8, inset 14.
17. Pay button 70 tall, 352 wide (380 − 28), radius 18, 21 px label "ชำระเงิน" / amount, **no** "(F4)".
18. Pay button bottom 12 px above the viewport bottom.
19. With the 01 4-line cart, all 4 lines + totals + pay visible without scrolling (20A promise) — if not, record the overflow height (consequence of *Q1* fallback B / 44 px rules).
20. Topbar slot: unit chip 30 tall 12.5 px; "● ออนไลน์" without last-sync; shift chip short; user name only.
21. Grid third row partially visible and scrollable; no horizontal overflow.
22. Card sold-out styling identical to D (opacity, " · หมด" danger).
23. Low-stock "เหลือ 2" bold ink-soft right label; "สต็อก 11" muted.
24. Discounts danger, VAT row muted small, total bold — same colour rules as D.
25. Touch: every chip, card, qty, hold, held, member, custom, camera, pay ≥ 44 px in both directions.
Accepted deltas (T): rail present (*Q2*); 44 px minimums; Topbar 56 vs 54; English-label widths.

### 7.3 C — 390×844 (vs 05-mobile.png panel ก, frame origin (37, 141))
1. No mode tabs and no status bar.
2. Mobile header: branch name 16 px bold + chevron at x = 20; shift chip 28 tall right of it (gap 16).
3. Camera button 44 × 44 (mockup 36 — accepted) right-aligned 20 px from the edge; ☰ only in the app WebView.
4. Body side padding 22: search field x = 22 → 368, 48 tall, radius 13, placeholder "ค้นหาชื่อ / SKU หรือสแกน".
5. Category chips 44 tall, 15 px, radius 13, gap 12, horizontally scrollable; first chip aligned with the search field (x = 22 — mockup 52, *Q20*).
6. Active chip ink bg white bold.
7. Grid 3 columns, gap 14, starts 16 below the chips; card ≈ 104 wide × ≥ 120 (mockup 163 with names), radius 18, padding 12.
8. Card image 80 tall `#f4f5f7`, radius 8.
9. Card name 16 px semibold, price 16 px ink-soft.
10. In-cart card: 2 px-looking ink border (1 px border + 1 px inset), qty badge 22 tall ink pill top-right 6/6 with white 11.5 px bold number.
11. Low-stock label "เหลือ 2" bold ink-soft right on the price row.
12. Cart bar pinned to the bottom, full width, white, top border line.
13. Bar padding 18 / 22, bottom padding ≥ 32 (safe area).
14. Peek row: list icon, summary 12 px ink-soft single-line ellipsis ("ลาเต้ ×2 · อเมริกาโน่ · …"), "ดูตะกร้า" 12 px bold accent at the right.
15. Peek row separated from the main row by a 1 px line with 10 px above/below.
16. Main row left: "4 รายการ" 12 px muted over "฿625" 20 px bold.
17. "ชำระ ›" primary button 48 tall, 22 px side padding, 15 px, right-aligned.
18. Tapping the bar opens the sheet (no mockup — reviewer checks only: grab handle, radius 16 top corners, scrim, all cart controls reachable, pay button visible without scrolling the sheet).
19. Empty cart: bar shows "ยังไม่มีรายการ …" muted and a disabled "ชำระ ฿0".
20. No horizontal scroll at 390 (also at 360).
21. Search input font ≥ 16 px on this width (iOS zoom rule — globals.css enforces; do not override with text-[15px]).
22. Grid scrolls with the page; the bar never covers the last card (bottom padding = bar height).
23. Offline: black banner directly under the mobile header.
24. Sold-out card dimmed with " · หมด" danger.
25. Mobile header and grid visible under the web Topbar (56) — accepted delta vs the in-app mockup.
Accepted deltas (C): web Topbar; 44 px camera; chip row alignment (*Q20*); member name missing in "4 รายการ · คุณสมชาย" (P1.12).

### 7.4 20B English (1440×900, `LOCALE=en`) — same geometry as 7.1, text checks
1. Tabs: Sale · Tables · Online orders · Today's bills · Shift · Products · Reports · Settings.
2. Search placeholder "Search name / SKU or scan barcode (F2)"; buttons "Custom item", "Scan with camera".
3. Category "All"; product names from `nameEn` (Latte, Americano …); labels "3 sizes" (P1.2), "2 left", "Stock 11", "Service"; sold-out suffix " · Sold out".
4. Cart: "New bill · Takeaway", "Hold", "Held bills"; line sub-lines "−฿10 · …", "Stock 11 → 10"; "฿100 × 2".
5. Totals: "Subtotal · Line discounts · Bill discount Edit · Coupon WELCOME50 · VAT 7% (included) · Total".
6. Actions "Bill discount · Note · Full tax invoice"; pay "Pay ฿625 (F4)".
7. Status bar "Shortcuts F2 Search F4 Pay F8 Hold Esc Clear … Stock pending 0 · Sync pending 0 · <printer>".
8. Money still "฿" with Thai grouping; no Thai letter anywhere on the register except data (names without `nameEn`).

### 7.5 19 states (any viewport ≥ 1024)
1. 19ก: box icon tile 76 × 76 radius 22 surface-2; title "ยังไม่มีสินค้าให้ขาย" 20 bold; primary "+ เพิ่มสินค้า"; empty cart text centred muted; disabled pay "ชำระเงิน ฿0" surface-2 / muted / line border.
2. 19ง: banner bg ink, white 14 px, warn icon, padding 13 / 20, under the tabs; topbar dot is a hollow ring + "ออฟไลน์".
3. 19ฉ: warned line has a 3 px danger left border and the warning box (surface-2, radius 14) with "สต็อกมี N" bold danger, buttons "ขายต่อ" / "ลดเหลือ N".
4. Toast (19ค style): bottom, bg ink, radius 16, white 14 px, shadow.

---

## 8. Open questions for the controller (each with a recommendation)

| # | contradiction / gap (evidence) | recommendation |
|---|---|---|
| Q1 | Mockups 01/20 put unit switch, online state, shift chip and user **in the global top bar**; the real `Topbar.tsx` (T7 owner ruling, header comment) is "logo + name left · exactly 2 buttons right", no slot. At 1440 the context cluster (≈ 740 px) does not fit in the free part of the tab row (≈ 475 px). | **A (recommended)**: add an empty `<div id="app-topbar-slot" className="flex min-w-0 flex-1 items-center justify-end gap-3" />` to `Topbar.tsx` (3-line hunk, marked) and let the register portal its context into it — matches the mockup, costs no height. Needs the owner's OK because it touches T7. **B (fallback)**: a 48 px context row inside the register above the tabs (iPad then cannot show 4 lines + pay without scrolling). |
| Q2 | Rail: 01 shows the 56 px rail; 20A (1024) explicitly has **no** rail ("ยุบเป็นปุ่มเมนู"), but Tailwind `lg` = 1024 shows the rail. | Extend `isRailPath()` to the register (1-line regex) and **accept the rail at 1024** (left column 588 instead of 644; 3 columns still ≈ 177 px). Hiding it only between 1024–1279 needs AppShell + AppMain changes — not worth it. |
| Q3 | Mockup 01 is labelled 1440×900 but renders 1440 × ≈1210 (round-2 `.frame{height:auto}`); at a real 900 px the cart shows ≈ 2.5 lines and the grid ≈ 2.5 rows. | Accept; regions scroll; reviewer compares top-of-region and bottom block separately (§2.1). If the owner wants 4 lines visible, shrink line padding 18 → 12 (owner call). |
| Q4 | Replacing the register removes production features that only the legacy `register-ui.tsx` has: member pick + rights panel (vouchers/points/gift cards, M2.8), CRM deal link (`pos-deal-select`, C2.7 — read by `qc-crm-c2.7.mts` and `fitness.mts` `CRM_HOSTED_CONTROLS` while CRM RUN is live), coupon, PromptPay. Oracle S5.6 wants `register-ui.tsx` debt 0 **or the file gone**. | Ship the new screen behind a per-POS-system flag `settings.pos.registerV2` (QC tenants on, production off until P1.6 + P1.12 land); keep `register-ui.tsx` **byte-identical**; rewrite `page.tsx` (its debt → 0). **ORACLE-EDIT S5.6**: accept `register-ui.tsx` debt unchanged while the flag exists, closes in P1.12 (which deletes the legacy file and moves the CRM deal control — CRM must be told). |
| Q5 | Pay button target: payment screen is P1.6, but P1.3's own oracle sells (`submitRegisterSale` with `payMethods`), and the flagged screen must be usable for QC/trial. | Interim pay dialog = today's scope (cash with received/change, static PromptPay QR + manual confirm), own file, P1.6 deletes it. Testids `pos-reg-paydlg-*`, `pos-reg-done-*` added to the inventory. |
| Q6 | Products with option groups (`optionGroupCount > 0`; restaurant menus often have required groups) — the popover is P1.2; selling a latte without a size is wrong. | Additive field `requiredOptionGroupCount`; P1.3 adds products whose groups are all optional at base price and **blocks** required-option products with a toast. Better alternative if lane B is on time: merge P1.2 before P1.3 goes live (flag stays off anyway). |
| Q7 | "Subtotal" means two things: `priceCart`/quote `subtotalSatang` = Σ gross before line discounts (oracle S2.1 68 500, S3.1 22 500 — matches mockup "รวม ฿685") but `PosSale.subtotalSatang` = Σ lineTotal after line discounts (S3.2/S3.21, oracle header "ratified"). | UI shows the quote value (= mockup). Document in the builder brief that the stored sale subtotal differs from the displayed "รวม" by the line discounts — intended, not a bug; P1.16 bill views must label accordingly. |
| Q8 | `pos.sale.priceOverride` (oracle S3.8/S3.23) **does not exist** in `src/lib/core/permissions.ts` (only `pos.sale.create`, `pos.product.setPrice`, `pos.sale.void`). Mockup 01 shows the cashier with an active "รายการกำหนดเอง". | P1.3 adds the key (shared file, smallest hunk): OWNER/MANAGER yes, STAFF no. Cashier sees the button disabled with the visible reason `errors.needPriceOverride`; P1.15 adds manager-PIN override. (If the owner wants cashiers to key custom items, grant STAFF — product decision.) |
| Q9 | Oracle product shape has only `soldOut: boolean`; the UI must block 86/unavailable (server refuses PRODUCT_UNAVAILABLE) but allow stock-out under ALLOW_NEGATIVE (server sells, S3.18; 19ฉ "ไม่บล็อกการขาย"). | Additive `soldOutReason: "UNAVAILABLE" \| "NO_STOCK" \| null` on `registerCatalog` products (S1.3 only requires presence of its 13 keys). |
| Q10 | "เหลือ 2" vs "สต็อก 11": no threshold in any document. | `REGISTER_LOW_STOCK = 5` constant in `register-shared.ts` (later: per-item reorder point, P1.14/P2). |
| Q11 | Line-discount **reason** ("ลด ฿10 · ของช่วงบ่าย"), line note, bill note ("หมายเหตุ"): `createSale` lines have no note/reason, PosSale has no note in the contract; the oracle submit input has `note?` per line but nothing stores it. | P1.3: line discount without reason (sub-line "ลด ฿10"); "หมายเหตุ" button = soon. Storing reason/notes = `createSale` additive fields in P1.6 (F15.2-safe), audit of discounts in P1.15. |
| Q12 | Coupon: in mockup 01 (cart line) and in legacy register (production), not in the P1.3 oracle; 01 shows no coupon *entry* control (the entry is drawn in 02). | Include in P1.3: coupon code field inside the bill-discount dialog (`pos-reg-coupon`), quote input `couponCode` re-using today's coupon validation; **ORACLE-EDIT**: add 2 checks (valid coupon priced into the quote; invalid coupon refused, not silently dropped). Otherwise defer to P1.12 and make `pos-reg-coupon` soon. |
| Q13 | Tabs โต๊ะ / ออเดอร์ออนไลน์ / รายงาน have no page in P1; mockup draws them as normal tabs (+ badge "3"). UI_STANDARD §2.9 "soon" pattern = dimmed + "เร็ว ๆ นี้", not a link. "ภาพรวม" (today's first ModuleTab) is absent from the mockup. | Use the soon pattern (accepted parity delta); ตั้งค่า → `/app/sys/[id]` (today's overview with system links) until P1.18. Alternative: hide the three tabs until their WO (cleaner, but the tab row then differs more from the mockup). |
| Q14 | iPad mockup sizes below the oracle's 44 px rule: chips 38, header buttons 36, mobile icon buttons 36. | 44 everywhere the oracle lists (S5.9 wins over the mockup); accepted delta in §7. |
| Q15 | 19ก empty state offers "นำเข้า CSV", "ชุดตัวอย่างคาเฟ่" and a "+ หมวด" chip — **no work order owns** CSV import, sample data or category creation (onboarding mockup 18 has no WO). Oracle key `empty.body` copy "เพิ่มสินค้าแรกของคุณ หรือใช้ชุดตัวอย่าง" mentions the sample set. | Hide the three; "+ เพิ่มสินค้า" → `/pos/products`. `empty.body` = "เพิ่มสินค้าแรกของคุณที่หน้าสินค้า แล้วกลับมาขายที่นี่" / "Add your first product on the Products page, then come back here to sell" until an onboarding WO exists. Controller: decide whether onboarding (18) needs a WO. |
| Q16 | 19ง promises offline selling ("ขายต่อได้ด้วยเงินสดและโอน · รอซิงก์ 3 บิล · เลขชั่วคราว") = P3.4. | P1.3 banner with interim copy, pay disabled while offline. |
| Q17 | Mockup font Noto Sans Thai, app font IBM Plex Sans Thai. | Accept (global font is a branding decision). |
| Q18 | Mockup colours without a UI_STANDARD token: `#a3a3a3`, `#d4d4d4`, `#f4f5f7` (exists as `--color-stage` for Kanban only), shadows/scrim. | `#a3a3a3` → `--color-muted`; `#d4d4d4` → `--color-line`; allow `--color-stage` for the product image placeholder (add one line to UI_STANDARD §0.1 in P1.18 or now); shadows via Tailwind `shadow-*`, scrim `bg-[color:var(--color-ink)]/30`. |
| Q19 | Mockup spacing (22/26/30/18 px …) is off UI_STANDARD §1.2's gap scale. | Parity wins: exact px via Tailwind arbitrary values, ±2 px tolerance; note the register as an explicit exception (operation screen) in UI_STANDARD later. |
| Q20 | 05ก chip row is indented 30 px from the search field — a CSS artifact (`_airy2` `.cats{padding:22px 30px 0!important}` hit the mobile frame too). | Align chips with the search field on C (x = 22); accepted delta. |
| Q21 | `registerCatalog(ctx, actor, {q?, categoryId?})` has no paging, but catalogues > 200 must work (R4) and P1.1a-R2 C6 pages `listForUnit` (default 100, max 500). Returning everything is unbounded. | Additive `{cursor?, limit?}` → `nextCursor`; UI loads 100 per page with infinite scroll; search/category always server-side. |
| Q22 | The cart must show re-priced values, but the quote result contract does not say whether `lines[i]` carries the server unit price. | Quote `lines[i]` = `{productId?, unitPriceSatang, grossSatang, discountSatang, lineTotalSatang}` aligned to input order (additive). |
| Q23 | `registerStatus.user.roleLabel` is Thai (S4.1); the English screen needs "Cashier". | Add `user.role` (`OWNER|MANAGER|STAFF`) and translate client-side (`roles.*`); keep `roleLabel` for the oracle. |
| Q24 | Scanner path: the master plan gives "wedge autofocus · scan repeated +1" to P1.4, but S5.8 (autofocus) is in P1.3 and a scanner already "types + Enter" into the search. | P1.3 = autofocus + Enter adds the single/exact match (§3.6); P1.4 = burst detection, `byBarcode {items}` chooser, camera, weight barcodes. |
| Q25 | The client needs the VAT config for optimistic pricing before the first quote; no function exposes it. | `registerVatConfig(ctx)` in `register.ts` (same helper the quote uses), passed by the page; `vatMode` ∈ {INCLUDED, NONE} in P1.3. |
| Q26 | The oracle lists 51 keys; this spec needs ≈ 110 (`tabs.*`, `tabsShort.*`, dialogs, errors, pay). | Ratify the list in §4 (S5.1 checks only the 51; extra keys are free). |
| Q27 | UI_STANDARD §2.7 requires a confirm for "ลบบรรทัดที่มีข้อมูล"; a confirm on every line removal slows the till; DESIGN M1 is silent. | Line remove inside the editor (already a deliberate 2-step: open editor → ลบรายการ) without a second confirm; clearing the whole bill (Esc) **with** confirm. |
| Q28 | HF-POS-PAGES (`hotfix/pos-page-authz`) rewrites the guard in `register/page.tsx` (unit filtering, 404-not-403). | Base the P1.3 builder on a commit that already contains that hotfix; the new page keeps its guard verbatim. |
| Q29 | Money regression: P1.3 adds a new caller of `createSale` (`submitRegisterSale`). | Builder runs the POS-MASTER-PLAN §1 money set + REVIEW §6 row 18 additions + `qc-pos-register.mts` (legacy path) + `qc-crm-c2.7` (legacy screen untouched) before "done". |

## 9. Things in the mockups that no work order owns (for the controller's backlog)
1. Bill-type selector "บิลใหม่ · ซื้อกลับ ▾" (01/20) — DESIGN M1 says [P2]; no P2 row names it (P2.4 covers dine-in tables only).
2. Empty-state "นำเข้า CSV", "ชุดตัวอย่างคาเฟ่", category chip "+ หมวด" (19ก) and the whole onboarding flow (mockup 18).
3. Locale switcher (20B is reachable only via the `LOCALE` cookie).
4. Mobile cart sheet (05ก draws only the collapsed bar) and tablet-portrait 768–1023 layout — not drawn at all.
5. Fullscreen toggle (DESIGN M1 "โหมดเต็มจอ") — no WO, no mockup.
6. "ครัวแจ้ง 11:00" (86 timestamp on a sold-out card, 19ฉ) — needs an availability-change time; nearest owner P2.6 (KDS 86).
7. Product image upload for cards (cards show `images[0]`; nobody owns uploading in P1 — products page P1.2?).
