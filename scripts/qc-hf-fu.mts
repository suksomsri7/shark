// QC — POS RUN ใบ HF-FU: ถังงานตามเก็บฝั่งเซิร์ฟเวอร์ (ออเดอร์ที่ครัวพักไว้ · รอบร่างกำพร้า · เศษส่วนแบ่งหมุนเวียน · รวมโต๊ะแผน DONE ·
//   ขั้น void ของออเดอร์ · saleStatus · หัวใบรายการ · ชื่อสมาชิก/วิธีจ่ายของใบ · รหัสย่อยคำปฏิเสธ · ล็อกส่งมอบ · เครื่องหมาย P2.9b · FU ของ P2.11)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-HF-FU.md ⚠️ · §0 ข้อเท็จจริง · §2 ตาราง a b c d i j n p s l1 l2 F3 h1 h2 z1–z4 f1–f3 · §6 แผนข้อสอบ (25 ข้อ) · §7 หมุด ·
//        §10 มติผู้คุม 1–13 (ผูกมัด: a = กวาดหลัง commit ตอนเลิกพักครัว/เปลี่ยนเพดาน + กวาดตอนอ่าน · วันเดียวกัน · sale_refused ไม่ลองซ้ำ ·
//        b = ทิ้งรวม MERGED · c = หมุนเศษทั้ง EQUAL และ SEAT · d = ปฏิเสธแผน DONE ฝั่งต้นทาง · j = ขั้นในสายหลักใต้บรรทัดคีย์ ·
//        z1 = เครื่องหมาย และ เอกสาร · z3 = bookSystemId เคร่ง · f3 อยู่ในใบ)
//        โน้ต: ledger/wo-notes/pos-HF-FU-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ขอบเขต: ST สถิต · HN ออเดอร์ที่ครัวพักไว้ · OD รอบร่างกำพร้า · EQ เศษส่วนแบ่ง · DM รวมโต๊ะ · VO ขั้น void · CN saleStatus · PB หัวใบรายการ ·
//         SM ใบของแผน · LK รหัสย่อย/คีย์ · HU ส่งมอบ · ZE เครื่องหมาย zero entry · FU P2.11 · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.5): SKIP เมื่อของ HF-FU ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · PAR เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB ไม่ import อะไร · --no-db = ST1 ST2 + บริสุทธิ์ EQ1 PB1 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-hffu-<rand>` + `posqc-hffu-<rand>-t2` + ผู้ใช้ `posqc-hffu-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch (ข้อพัง = แดงพร้อมเหตุผล ไม่ล้มทั้งชุด)
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink · SQL ดิบ = เวลา (receivedAt) / ล็อก / ลายนิ้วมือ / ลบร้านชั่วคราว
//    การแข่งทุกข้อบังคับลำดับด้วยธุรกรรมที่สามถือล็อก + pg_blocking_pids (ไม่พึ่งจังหวะ)
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-hf-fu";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต · X3 สิทธิ์/เพดาน · X4 เงิน/จำนวน · X5 ไม่เขียนอะไร · PAR = เขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`HF-FU-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "PAR", "[§3 §4 §7 มติ 6] ไม่มี migration · prisma/ ไม่เปลี่ยน (เทียบฐาน c3c52ef1 หรือ merge-base) · ไฟล์ห้ามแตะ §4 (register*.ts service.ts tender*.ts refund*.ts deposit.ts account-bridge.ts · InterimPayDialog PayDone BillsClient · restaurant/** · visual-pos.mts) ไม่เปลี่ยน · outbox-consumers: บรรทัดเหนือ \"pos.sale.voided\": เพิ่ม ≤ 4 · รอยต่อ POS P2.4/P2.6/P2.8 อยู่ใน ±8 บรรทัดของคีย์ · รอยต่อ HF-FU j (ถ้ามี) อยู่ใต้คีย์ · *-shared/pre-bill-render บริสุทธิ์ · 'use client' ไม่ import pos/table(-split)/order/kds · ทะเบียนผู้เรียก createSale เท่าเดิม"),
  D("ST2", "S", "[มติ 7 9 10 · ST7] คีย์ข้อความใหม่ th = en (th ไทย · en ไม่มีไทย): orders.event.held · orders.errors.memberNotFound/partyNotFound/conversationNotFound · recipe.errors.kind/itemArchived/itemService/duplicate/noLines/shape · products.branch.incomplete ({unit}) · products.branch.conflict · OrderPanel EVENT_TYPES มี held · POS-OWNER-PENDING มีบรรทัด P2.9b + HF-FU (บิลเงินสดล้วนหลังเลิกจด VAT ค้าง 2200 · z4)"),
  // ── HN ออเดอร์ที่ครัวพักไว้ (a) ──
  D("HN1", "-", "[a มติ 1] พักครัว + ช่องทาง adapter NONE รับอัตโนมัติ → ingest = NEW + event held 1 แถว (NEW→NEW · payload.reason paused) · kitchenPauseAction เรียก releaseHeldOrders หลัง setKitchenPause (รอยต่อ POS HF-FU) · เลิกพัก + releaseHeldOrders(T, A) → ACCEPTED (acceptedByUserId null · event accepted ผู้กระทำ null · รอบครัว 1 · บิล PLATFORM 1 · audit pos.order.accept {auto:true, swept:true} ผู้กระทำ SYSTEM) · ผลคืน accepted มี id · ออเดอร์ที่รับเข้าก่อนต้นวันไทย (receivedAt · ครัวพักข้ามเที่ยงคืน) ถูกกวาดด้วย (P2.14 Q2 · มติ 14) · กวาดซ้ำ = ไม่มีอะไรเปลี่ยน"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-3)
  D("HN2", "X1", "[a มติ 1] เพดาน 1 + ตั๋วค้าง → ออเดอร์ R (GRAB ของไม่พอ) + CHAT c1 c2 c3 = NEW + held {reason:backlog} · kdsTicketDone ตั๋วค้าง → listOrders (กวาดตอนอ่าน) → R ถูกปฏิเสธบิล (STOCK_INSUFFICIENT) คง NEW + held {reason:sale_refused} 1 แถว ไม่มีบิล · c1 ACCEPTED · c2 c3 NEW (หยุดที่ตัวแรกที่ติดเพดาน) · done c1 → kdsBoard (กวาดตอนอ่าน) → c2 · done c2 → listOrders → c3 · FIFO ตาม receivedAt · R ไม่ถูกลองซ้ำ (sale_refused ยัง 1)"),
  D("HN3", "X1", "[a มติ 1] กวาด ‖ พนักงาน acceptOrder ออเดอร์เดียวกัน (ธุรกรรมที่สามถือแถว PosOrder · ทั้งคู่รอ) → ACCEPTED 1 · บิล PLATFORM 1 · รอบครัว 1 · ตัวควบคุมที่ไม่ถูกกวาด: ช่องทางปิดรับอัตโนมัติภายหลัง · MANUAL ที่เริ่ม NEW · NEW ที่ไม่มี held · ช่องทางพักรับ (pausedUntil) · ออเดอร์ held ของสาขา B · ของร้าน T2"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 1): HN4 (R1 F2)
  D("HN4", "X1", "[a fix1 มติ 2] ออเดอร์ held 3 รายการที่เพดาน 1 · ตัวกวาด 6 ตัวพร้อมกัน (releaseHeldOrders ×4 + listOrders ×2 · ธุรกรรมที่สามถือแถว o1 ให้ตัวแรกผ่านด่านเพดานแล้วรอ · ช่องทาง o1 ปิดรับอัตโนมัติหลังกวาด — ORD-6) → ACCEPTED 1 · ตั๋วค้าง ≤ เพดาน · บิล 1 · รอบครัว 1"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-6 · CD-B6)
  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 2): HN5 (hunter H1)
  D("HN5", "X1", "[a fix2 มติ 1] ออเดอร์ PLATFORM (PLATFORM_PAID) พักที่เพดาน 1 · (ก) ช่องทาง CUSTOM เปลี่ยน payout เป็น DIRECT ก่อนกวาด → กวาด ⇒ ยัง NEW + held sale_refused 1 · บิล 0 · รอบครัว 0 · พนักงาน acceptOrder คู่ที่ไม่ตรง ⇒ CHANNEL_PAY_MISMATCH ไม่มีบิล · (ข) ธุรกรรมที่สามถือ posorder-release ⇒ ตัวกวาดคืนทันที swept:false ไม่รับ · ปล่อยล็อกแล้วครั้งถัดไป = รับ (บิล 1 · รอบครัว 1) — ORD-2 try-lock"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-2 · CD-B6)
  // ── OD รอบร่างกำพร้า (b) ──
  D("OD1", "X1", "[b มติ 2] รอบร่าง HELD ของ session ที่หน้าเดิมปิด (table.closeSession) และของ session ที่หน้าเดิมรวมเข้าโต๊ะอื่น (MERGED) → registerTables (อ่านผัง) → DISCARDED ทั้งคู่ + audit pos.heldCart.discard 1 แถว/ร่าง (actorType SYSTEM · after {status DISCARDED, via session_not_open, tableSessionId}) · อ่านซ้ำไม่เพิ่ม audit · registerTables เรียก sweepOrphanTableDrafts"),
  D("OD2", "PAR", "[b มติ 2] ไม่แตะ: ร่างของ session ที่ยัง OPEN · บิลพักในลิ้นชัก (tableSessionId null) · ร่างของ session ที่ปิดแล้วของสาขา B (อ่านผังสาขา A) — ยัง HELD ทุกแถว version เดิม"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 1): OD3 (R1 F1)
  D("OD3", "X1", "[b fix1 มติ 1] ร่าง HELD ของ session CLOSED (จ่ายครบ + หน้าเดิมปิด) · ธุรกรรมที่สามถือแถว session และเปิดกลับ OPEN → registerTables (ตัวกวาดอ่าน CLOSED แล้วรอ session · ORD-4) → ปล่อย ⇒ ร่างยัง HELD (version เดิม · ไม่มี audit ทิ้ง)"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-4 · CD-B6)
  // ── EQ เศษส่วนแบ่ง (c) ──
  D("EQ1", "P", "[c มติ 3] allocateTableSplit บริสุทธิ์: 30 รายการราคาคี่ EQUAL 3 ค่าบริการ 0 → ฐานต่อใบห่าง ≤ 1 · |ค่าบริการของใบ| ≤ 1 · Σ สุทธิ = ยอดโต๊ะ · SEAT กลางโต๊ะล้วน 30 รายการ → ฐานห่าง ≤ 1 · ผลตรงตัวอ้างอิงหมุนเศษ (rot) ทุกบรรทัด · เจ้าของสต็อก = ใบ 1"),
  D("EQ2", "X4", "[c มติ 3] 500 แผนสุ่ม (EQUAL/SEAT มีกลางโต๊ะ · seed คงที่) ตรงตัวอ้างอิงหมุนเศษ · ยอดส่วนแบ่งต่อใบห่าง ≤ 1 · Σ สุทธิตรง · เรียกซ้ำผลเดิม · แผนจริงบน DB (EQUAL 3 ราคาคี่ · ลำดับรายการตามบิลโต๊ะ createdAt,id) = ผลบริสุทธิ์ทุกบรรทัด · ฐานห่าง ≤ 1"),
  // ── DM รวมโต๊ะของหน้าเดิม (d) ──
  D("DM1", "X5", "[d มติ 4] legacyMergeSplitGuard: ต้นทางมีแผน DONE → {ok:false, reason} · ออเดอร์ไม่ย้าย · ต้นทางยัง OPEN · แผนยัง DONE บน session ต้นทาง · ตัวควบคุม: ไม่มีแผน → ok + table.mergeSession {ok:true}"),
  // ── VO ขั้น void ของออเดอร์ (j) ──
  D("VO1", "X1", "[j มติ 6] สถิต: \"pos.sale.voided\" เรียกตัวรับออเดอร์ในสายหลัก (ก่อน if (failed) throw) ไม่ใช่ compose ตัวสุดท้าย · รอยต่อ POS HF-FU ▸ j ใต้คีย์ · พฤติกรรม: void บิลของออเดอร์ LINEMAN ที่ READY → ระบายคิว → CANCELLED + REFUNDED · เล่นตัวรับซ้ำ ×2 → event cancelled 1 · version ไม่ขยับ"),
  // ── CN saleStatus (n) ──
  D("CN1", "-", "[n มติ 7] getOrder.order.saleStatus: บิล PAID = \"PAID\" · ไม่มีบิล = null · void แล้วตัวรับยังไม่ถึง (ธุรกรรมที่สามถือแถว PosOrder) = \"VOIDED\" ขณะออเดอร์ยังไม่ปิด · OrderPanel.tsx ให้ saleStatus === \"VOIDED\" ปลดปุ่มยกเลิกเหมือน saleVoided"),
  D("CN2", "PAR", "[n §0] บิลถูก void แล้วตัวรับยังไม่ถึง → STAFF (ไม่มี pos.sale.void) cancelOrder → ok · ออเดอร์ CANCELLED + REFUNDED · บิล VOIDED · pos.sale.voided ของบิล 1 · event cancelled 1"),
  // ── PB หัวใบรายการ (p) ──
  D("PB1", "P", "[p มติ 7] renderPreBillHtml th: .t มีสอง span ไม่ตัดบรรทัด (white-space:nowrap) \"ใบรายการ —\" + \"ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี\" (span ที่สอง font-size .95em · <wbr> หลัง /) · <title> = หัวเต็ม · PRE_BILL_LABELS.th.title เดิม · en .t = หัวเดิม · HTML นอก .t/<style> = ฐาน (golden c3c52ef1 · th 80/58 · en) · ESC/POS ไบต์ = ฐาน (golden th 80 raster · th 58 tis620 · en 80)"),
  // ── SM ใบของแผน (s) ──
  D("SM1", "X2", "[s มติ 7] SplitPlanPartView.memberName: แผน SEAT 3 ใบ (ใบ 1 สมาชิก M1 · ใบ 2 M2 · ใบ 3 ไม่มี) → registerSplitTable + registerSplitDetail ชื่อตรงสมาชิก · ใบ 3 null · สมาชิกร้าน T2 บนใบ → MEMBER_NOT_FOUND ไม่มีแผน (ไม่เคยเป็นของร้านอื่น)"),
  D("SM2", "-", "[s มติ 7] SplitPlanPartView.paidMethods: ใบ 1 จ่าย CASH+CARD → [CARD, CASH] (ไม่ซ้ำ) · ใบ 2 CASH → [CASH] · ใบ 3 OPEN → null · TableSplitDialog.tsx ไม่เรียก billDetailAction และอ่าน paidMethods/memberName"),
  // ── LK รหัสย่อย/คีย์ (l) ──
  D("LK1", "X3", "[l1 มติ 7] สูตร: KIND (PRODUCT) · ITEM_ARCHIVED · ITEM_SERVICE · DUPLICATE · NO_LINES (setBomEnabled ไม่มีสูตร) · SHAPE (qty 0 · ช่องเกิน) → CatalogError VALIDATION + reason ตรงกรณี ∈ RECIPE_REFUSAL_REASONS (recipe-shared.ts · 6 ค่า) · คีย์ recipe.errors.<camel(reason)> th/en (en ไม่มีไทย) · recipe-actions ส่ง reason · recipeRefusalText ใช้ reason ก่อนข้อความบริการ"),
  D("LK2", "X2", "[l2 F3 มติ 7] ingestOrder ด้วย memberId/partyId/chatConversationId มั่ว → VALIDATION + messageKey orders.errors.memberNotFound/partyNotFound/conversationNotFound · orderChannelSettings(ctx, actor) คืนค่าตั้งรับออเดอร์ของช่องทางสาขา (NOPERM = PERMISSION_DENIED · สาขาร้านอื่น = NOT_FOUND) · order-ui-actions.ts ไม่มี prisma. และเรียก orderChannelSettings"),
  // ── HU ส่งมอบ (h1 h2) ──
  D("HU1", "X1", "[h1 h2 มติ 7] สถิต: ขั้นส่งมอบอ่านสถานะบิลในธุรกรรม (FOR SHARE \"PosSale\") · webOrderForUpdate SQL มี \"tenantId\" · พฤติกรรม: ธุรกรรมที่สามถือแถว PosOrder → handOver รอ → void บิล commit → ปล่อย → handOver ORDER_STATE_INVALID messageKey orders.errors.saleVoided · ออเดอร์ไม่เคย HANDED (CANCELLED + REFUNDED หลังระบาย)"),
  // ── ZE เครื่องหมาย zero entry (z1 z3) ──
  D("ZE1", "X2", "[z3 มติ 9] เครื่องหมายของบิล X ในสมุด A (recordExternalSaleZeroEntry เขียน after.bookSystemId) → ย้าย POS ไปผูกสมุด B → applyExternalChannelCommission = {posted:false, reason:no-paid} (ไม่มี JV ใดในสมุด B) · ผูกกลับ A → posted (หรือ already)"),
  D("ZE2", "-", "[z1 มติ 8] posSalePosted: เครื่องหมาย + เอกสารขาย = true · เครื่องหมายไม่มีเอกสาร = false · บิลที่มี JV PAID = true (ตัวควบคุม)"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 2): ZE3 (hunter H2)
  D("ZE3", "X2", "[z fix2 มติ 2] บิล zero entry ที่มีค่าคอมฯ จริงในสมุด A (ฉาก A10: มัดจำตอนจด VAT → เลิกจด → บิลสุดท้าย ฿20 · ตัวแทน DIRECT 10%) → ย้าย POS ไปผูกสมุด B → คืนบิลครบ → ระบายคิว ⇒ pos.sale.refunded DONE · ไม่มี P2002 ใน log · COMMISSION ในสมุด B 0 · COMMISSION_REFUNDED ในสมุด B 0 (ปักไว้ · เรื่องเจ้าของ) · COMMISSION ในสมุด A ยัง 1 · + บิลที่ 3 (มีสต็อก · ลง JV ในสมุด A ก่อนย้าย) คืนหลังย้าย = ข้าม other-book ในสมุด B · สต็อก +1 (ใบคืน) ไม่ตัดซ้ำ"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ACC-3)
  // ── FU P2.11 (f1 f2 f3) ──
  D("FU1", "-", "[f1 f2 มติ 7] report.channels.empty th \"ไม่มียอดในช่วงนี้\" en \"No sales in this period\" (ไม่มี วันนี้/today) · loadProductsData สาขาที่โหลดไม่ครบ (CatalogError — สาขาไม่ผูก POS) อยู่ใน incompleteUnitIds · สาขาปกติไม่อยู่ · ProductPanel ใช้ incompleteUnitIds/branch.incomplete"),
  D("FU2", "X1", "[f3 มติ 10] setChannelPrices + expectedRowsHash: ค่าเก่า → CatalogError CONFLICT ไม่เขียน · ตรง (= ProductsRow.rowsHash = channelRowsHash(rows)) → ok เขียน · ไม่ส่ง → ok (ของเดิม) · channelRowsHash ไม่ขึ้นกับลำดับแถว · คีย์ products.branch.conflict"),
  // ── Z คืนสภาพ ──
  D("Z1", "PAR", "QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "PAR", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์/id · AuditLog/OutboxEvent ที่มีรหัสรอบ · Tenant slug · InvItem sku) · ลายนิ้วมือร้านอื่น (PosOrder PosHeldCart PosTableSplit SalesChannel) ก่อน/หลังพิมพ์เป็นข้อมูล"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("HF-FU-") ? id : `HF-FU-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** ห่อข้อสอบหนึ่งข้อ — throw = แดงพร้อมเหตุผล (ไม่ล้มทั้งชุด) */
async function step(id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ไม่ throw", `harness throw: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "VALUE");
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    const o = e as { reason?: unknown; field?: unknown } | null;
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true, reason: o?.reason, field: o?.field };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const THAI = /[ก-๛]/;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8; // QC_ALL=1 = พิมพ์ทุกเหตุผล
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const halfUp = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));
const vatOf = (gross: number, rateBp: number) => (rateBp > 0 ? gross - Math.floor((2 * gross * 10_000 + (10_000 + rateBp)) / (2 * (10_000 + rateBp))) : 0);
const setStr = (xs: unknown[]) => [...xs].map(String).sort(byId).join(",");
const camel = (code: string) => code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

// ═════════════════════════ ซอร์ส (สถิต) ═════════════════════════
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
// ตัดคอมเมนต์บรรทัดก่อนคอมเมนต์ก้อน — คอมเมนต์บรรทัดที่มี "/*" (เช่น path `/api/m/*`) จะไม่เปิดก้อนยาวกลืนโค้ด
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const srcOf = (f: string) => stripComments(rd(f));
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
/** เนื้อฟังก์ชัน (export หรือไม่ก็ได้) ถึงฟังก์ชันระดับบนตัวถัดไป */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next);
}
/** ช่วงของ const/ออบเจกต์ที่เริ่มด้วย marker (ถึงวงเล็บปิดคู่แรก) */
function constBody(src: string, marker: string): string {
  const i0 = src.indexOf(marker);
  if (i0 < 0) return "";
  const eq = src.indexOf("=", i0);
  if (eq < 0) return "";
  const i = eq + 1;
  const open = src.slice(i).search(/[[{(]/);
  if (open < 0) return "";
  const start = i + open;
  const o = src[start]!;
  const c = o === "[" ? "]" : o === "(" ? ")" : "}";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === o) depth++;
    else if (src[j] === c && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}
const firstStatement = (raw: string) => raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
const isUseClient = (raw: string) => /^["']use client["']/.test(firstStatement(raw));

// ── git (PAR: ของที่ HF-FU ห้ามแตะ = ตรงฐาน c3c52ef1 หรือตรงหมุดของเลน c5fc223b) ──
const BASE_REV = "c3c52ef1";
function gitRun(args: string[]): { ok: boolean; status: number; out: string } {
  try {
    const out = execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
    return { ok: true, status: 0, out };
  } catch (e) {
    const st = (e as { status?: number }).status;
    return { ok: false, status: typeof st === "number" ? st : -1, out: "" };
  }
}
let mergeBaseRev: string | null | undefined;
const LANE_PIN = "50019b25"; // ORACLE-EDIT ผู้คุม 22.10 (CD-RP17 P3-SKEL U merge · re-pin 359f6537 → 50019b25) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP16 harness type fix · re-pin 8b6b66e4 → 359f6537) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP15 P3.6U merge · re-pin e774edeb → 8b6b66e4) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP14 P5.2 merge · re-pin 5eabd360 → e774edeb) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP13 P3.8U merge · re-pin 2d0acc1b → 5eabd360) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP12 P3.7U merge · re-pin 85c366dd → 2d0acc1b) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP11 P3.9U merge · re-pin 9cfa81bb → 85c366dd) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 P3-SKEL merge · re-pin bafdf89f → 9cfa81bb) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 P3.6 merge · re-pin b2458030 → bafdf89f) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP8 P3.4U merge · re-pin 580c6b0a → b2458030) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP7 vis harness p3.5u · re-pin da75347a → 580c6b0a) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP6b · P3.5U แตะ visual-pos.mts (เลน U) · product tip · re-pin 8bded5a7 → da75347a) · product tip · re-pin 8bded5a7 → b02c8751) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1b · settings-general re-resolution · re-pin 0617d17b → 8bded5a7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1 lane-pin · re-pin 3b8a228d → 0617d17b) · ORACLE-EDIT ผู้คุม 16.10 (HF-FU2 lane-pin · re-pin c5fc223b → 3b8a228d) · ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437 · CD-B1c gates111 → U3 merge c5fc223b: ปลาย P2-close หลังรอบ U2/U2b/U3 ที่แตะ RegisterScreen (CD-U2b) · use-display-publish (H1b) · visual-pos (H5) ตามมติผู้คุม): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
function mergeBase(): string | null {
  if (mergeBaseRev !== undefined) return mergeBaseRev;
  const r = gitRun(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`]); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
  mergeBaseRev = r.ok ? r.out.trim() || null : null;
  return mergeBaseRev;
}
/** path (ไฟล์/โฟลเดอร์) ใน working tree ตรงกับ rev ไหม (รวมไฟล์ใหม่ที่ยังไม่ track) · null = git ใช้ไม่ได้ */
function sameAsRev(rev: string, path: string): boolean | null {
  const spec = `:(literal)${path}`; // [id] ใน path = ตัวอักษรจริง ไม่ใช่ glob
  const d = gitRun(["diff", "--quiet", rev, "--", spec]);
  if (!d.ok && d.status !== 1) return null;
  if (!d.ok) return false;
  const u = gitRun(["ls-files", "--others", "--exclude-standard", "--", spec]);
  if (!u.ok) return null;
  return u.out.trim() === "";
}
const showAt = (rev: string, path: string): string | null => {
  const r = gitRun(["show", `${rev}:${path}`]);
  return r.ok ? r.out : null;
};

// ═════════════════════════ ค่าคงที่ของสัญญา ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const F = {
  order: `${POS_DIR}/order.ts`,
  orderShared: `${POS_DIR}/order-shared.ts`,
  kds: `${POS_DIR}/kds.ts`,
  heldCart: `${POS_DIR}/held-cart.ts`,
  table: `${POS_DIR}/table.ts`,
  split: `${POS_DIR}/table-split.ts`,
  splitShared: `${POS_DIR}/table-split-shared.ts`,
  preBill: `${POS_DIR}/pre-bill-render.ts`,
  catalog: `${POS_DIR}/catalog.ts`,
  priceShared: `${POS_DIR}/price-shared.ts`,
  recipeShared: `${POS_DIR}/recipe-shared.ts`,
  recipeActions: `${POS_DIR}/recipe-actions.ts`,
  orderUiActions: `${POS_DIR}/order-ui-actions.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  actRest: "src/lib/actions/restaurant.ts",
  accIndex: "src/lib/modules/account/index.ts",
  gl: "src/lib/modules/account/gl.ts",
  orderPanel: "src/components/pos/orders/OrderPanel.tsx",
  splitDialog: "src/components/pos/tables/TableSplitDialog.tsx",
  recipeUi: "src/components/pos/products/recipe-ui.tsx",
  productPanel: "src/app/app/sys/[id]/pos/products/ProductPanel.tsx",
  productsData: "src/app/app/sys/[id]/pos/products/products-data.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
/** §4 ห้ามแตะ — ตรงฐานหรือ merge-base ทุกไบต์ */
const NEVER_TOUCH: string[] = [
  "prisma",
  "src/lib/modules/restaurant",
  "scripts/visual-pos.mts",
  "src/components/pos/register/InterimPayDialog.tsx",
  "src/components/pos/register/PayDone.tsx",
  "src/app/app/sys/[id]/pos/sales/BillsClient.tsx",
  `${POS_DIR}/service.ts`,
  `${POS_DIR}/deposit.ts`,
  `${POS_DIR}/account-bridge.ts`,
];
const NEVER_TOUCH_GLOB = /^(register[\w-]*|tender[\w-]*|refund[\w-]*)\.tsx?$/;
/** ทะเบียนผู้เรียก createSale (= qc-pos-p2.5 L2 + pos/order.ts 1 · HF-TX ไม่มีจุดใหม่) */
// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13) มติ 1: POST /sales ผ่าน submitRegisterSale ⇒ ไฟล์ pos/api/ops/sales.ts ไม่เรียก createSale แล้ว (1 → 0 · ถอดแถว)
const CALL_SITES: Record<string, number> = {
  "src/lib/actions/booking.ts": 1, "src/lib/actions/pos.ts": 1, "src/lib/ai/proposals.ts": 1, "src/lib/modules/booking/service.ts": 1,
  "src/lib/modules/clinic/service.ts": 1, "src/lib/modules/giftcard/service.ts": 2, "src/lib/modules/hotel/service.ts": 2,
  "src/lib/modules/member/subscription.ts": 1, "src/lib/modules/pos/register.ts": 1,
  "src/lib/modules/rental/service.ts": 2, "src/lib/modules/restaurant/order.ts": 1, "src/lib/modules/school/service.ts": 1,
  "src/lib/modules/shop/service.ts": 1, "src/lib/modules/ticket/service.ts": 1, "src/lib/modules/pos/order.ts": 1,
};
/** คีย์ข้อความใหม่ (path ใต้ pos.json) — th = en · th ไทย · en ไม่มีไทย */
const NEW_KEYS = [
  "orders.event.held",
  "orders.errors.memberNotFound", "orders.errors.partyNotFound", "orders.errors.conversationNotFound",
  "recipe.errors.kind", "recipe.errors.itemArchived", "recipe.errors.itemService", "recipe.errors.duplicate", "recipe.errors.noLines", "recipe.errors.shape",
  "products.branch.incomplete", "products.branch.conflict",
] as const;
const RECIPE_REASONS = ["KIND", "ITEM_ARCHIVED", "ITEM_SERVICE", "DUPLICATE", "NO_LINES", "SHAPE"] as const;
const EMPTY_TH = "ไม่มียอดในช่วงนี้";
const EMPTY_EN = "No sales in this period";
const PREBILL_TITLE_TH = "ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี";
const PREBILL_TITLE_EN = "PRE-BILL — NOT A RECEIPT";
const PREBILL_HEAD_1 = "ใบรายการ —";
const PREBILL_HEAD_2 = "ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี";
/** golden ของ c3c52ef1 (scripts/qc-hf-fu.mts PB1 · payload เดียวกับ qc-pos-p2.5 B3) — ESC/POS = sha256(hex(bytes)|JSON(rasterSlots)) · HTML = sha256(HTML ที่ <style> ว่าง + .t = "T") */
const PB_GOLD = {
  escTh80: "4a25219188e77c151e851245406e01b6b1792a96a2dd510fa371068bd571c2d6",
  escTh58: "3cb8b3cf67a7f15e6fc9c15a607b711453effc7d87c303369f85794454140cb5",
  escEn80: "4cc4d7a992f18a298f13336d92d61fddf32729a75f330700707f20a654b9bb50",
  htmlTh80: "323f485bf1e24c2eaa13780ceac0654947fe01fe0b3892a83156c2845b9ba717",
  htmlTh58: "0966b7e4fe1143f6ac2541960948f68638f0312ceffbc56bf630aea1d1b49684",
  htmlEn80: "0062d317db83d68d78ceb7b7c963e07c56e193b52296898565fd88543a2b2864",
};
const AUDIT_ACCEPT = "pos.order.accept";
const AUDIT_DISCARD = "pos.heldCart.discard";
const ZERO_ENTRY_ACTION = "account.external.zeroEntry";

/** ไฟล์ "shared"/ตัวเรนเดอร์ ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) และไม่มีนาฬิกา/สุ่ม — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  if ([...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system|restaurant|member)|^node:|^crypto$|^next|server-only|^\.\/(catalog|catalog-legacy|register|service|bills|refund|held-cart|table|table-split|channel|shift|device|receipt|kds|order|recipe)$/.test(p))) return false;
  return !/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bMath\.random\s*\(/.test(s);
};
const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
const getPath = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (isRecord(a) ? a[k] : undefined), o);
const msgJson = (f: string): Any => {
  try {
    return JSON.parse(rd(f) || "null");
  } catch {
    return null;
  }
};

const skipReasons: string[] = [];
for (const [f, names] of [
  [F.order, ["releaseHeldOrders", "orderChannelSettings"]],
  [F.heldCart, ["sweepOrphanTableDrafts"]],
  [F.recipeShared, ["RECIPE_REFUSAL_REASONS"]],
  [F.priceShared, ["channelRowsHash"]],
] as [string, string[]][])
  for (const n of names) if (!exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);

// ═════════════════════════ ตัวอ้างอิงของข้อสอบ — allocateTableSplit + หมุนเศษ (มติ 3) · เขียนเอง ไม่ import ═════════════════════════
/** แบ่ง total ตามน้ำหนัก: floor ก่อน แล้วเศษไปใบที่เศษมากสุด · เสมอกัน → ใบเลขต่ำ · น้ำหนักรวม 0 = แบ่งเท่า (เศษไปใบต่ำ) · BigInt กันล้น */
function lrSplit(total: number, weights: number[]): number[] {
  const n = weights.length;
  const ZERO = BigInt(0);
  const W = weights.reduce((a, b) => a + BigInt(b), ZERO);
  if (W <= ZERO) {
    const q = Math.floor(total / n);
    const r = total - q * n;
    return weights.map((_, i) => q + (i < r ? 1 : 0));
  }
  const T = BigInt(total);
  const base = weights.map((w) => (T * BigInt(w)) / W);
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % W }));
  let left = Number(T - base.reduce((a, b) => a + b, ZERO));
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map(Number);
  for (const x of rem) {
    if (left <= 0) break;
    out[x.i]!++;
    left--;
  }
  return out;
}
type RItem = { id: string; qty: number; unitSatang: number };
type RAlloc = { itemId: string; partNo: number | null; qty: number };
type RDisc = { type: "PERCENT" | "AMOUNT"; value: number } | null;
type RIn = { mode: "ITEM" | "EQUAL" | "SEAT"; partCount: number; items: RItem[]; allocations?: RAlloc[]; billDiscount?: RDisc; serviceChargeBp: number; vatRateBp?: number };
type RLine = { itemId: string; qty: number | null; shareNum: number | null; shareDen: number | null; amountSatang: number; stockOwner: boolean };
type RPart = { no: number; baseSatang: number; discountSatang: number; serviceChargeSatang: number; totalSatang: number; vatSatang: number; lines: RLine[] };
type ROut = { ok: true; baseSatang: number; discountSatang: number; serviceChargeSatang: number; totalSatang: number; parts: RPart[] } | { ok: false; code: string };
/** = qc-pos-p2.5 refAlloc (ORACLE-EDIT 15 ต.ค. HF-FU c) — ส่วนแบ่งต่อรายการ: ใบ p ได้ +1 เมื่อ ((p−1−rot) mod N) < r แล้ว rot = (rot + r) mod N ตามลำดับรายการ */
function refAllocRot(i: RIn): ROut {
  const N = i.partCount;
  if (!Number.isInteger(N) || N < 2 || N > 20) return { ok: false, code: "VALIDATION" };
  if (i.items.length > 200) return { ok: false, code: "TOO_MANY_LINES" };
  if (!i.items.length) return { ok: false, code: "VALIDATION" };
  const whole = new Map<string, Map<number, number>>();
  const shared = new Map<string, number>();
  if (i.mode === "EQUAL") {
    if (i.allocations && i.allocations.length) return { ok: false, code: "VALIDATION" };
    for (const it of i.items) shared.set(it.id, it.qty);
  } else {
    const got = new Map<string, number>();
    for (const a of i.allocations ?? []) {
      if (!i.items.some((x) => x.id === a.itemId) || !Number.isInteger(a.qty) || a.qty < 1) return { ok: false, code: "VALIDATION" };
      if (a.partNo === null) {
        if (i.mode !== "SEAT") return { ok: false, code: "VALIDATION" };
        shared.set(a.itemId, (shared.get(a.itemId) ?? 0) + a.qty);
      } else {
        if (!Number.isInteger(a.partNo) || a.partNo < 1 || a.partNo > N) return { ok: false, code: "VALIDATION" };
        const m = whole.get(a.itemId) ?? new Map<number, number>();
        m.set(a.partNo, (m.get(a.partNo) ?? 0) + a.qty);
        whole.set(a.itemId, m);
      }
      got.set(a.itemId, (got.get(a.itemId) ?? 0) + a.qty);
    }
    for (const it of i.items) if ((got.get(it.id) ?? 0) !== it.qty) return { ok: false, code: "VALIDATION" };
  }
  const lines: RLine[][] = Array.from({ length: N }, () => []);
  let rot = 0;
  for (const it of i.items) {
    for (const [p, k] of [...(whole.get(it.id) ?? new Map<number, number>()).entries()].sort((a, b) => a[0] - b[0]))
      lines[p - 1]!.push({ itemId: it.id, qty: k, shareNum: null, shareDen: null, amountSatang: k * it.unitSatang, stockOwner: true });
    const u = shared.get(it.id) ?? 0;
    if (u > 0) {
      const g = u * it.unitSatang;
      const q = Math.floor(g / N);
      const r = g - q * N;
      for (let p = 1; p <= N; p++) lines[p - 1]!.push({ itemId: it.id, qty: null, shareNum: u, shareDen: N, amountSatang: q + ((((p - 1 - rot) % N) + N) % N < r ? 1 : 0), stockOwner: p === 1 });
      rot = (rot + r) % N;
    }
  }
  if (lines.some((l) => !l.length)) return { ok: false, code: "VALIDATION" };
  const b = lines.map((l) => sum(l.map((x) => x.amountSatang)));
  const B = sum(b);
  const d0 = i.billDiscount;
  const Dd = !d0 ? 0 : d0.type === "AMOUNT" ? d0.value : d0.value > 10_000 ? B + 1 : halfUp(B * d0.value, 10_000);
  if (Dd > B) return { ok: false, code: "BILL_DISCOUNT_EXCEEDS_TOTAL" };
  const d = lrSplit(Dd, b);
  const S = halfUp((B - Dd) * i.serviceChargeBp, 10_000);
  let s: number[];
  let t: number[];
  if (i.mode === "EQUAL") {
    const T = B - Dd + S;
    const q = Math.floor(T / N);
    const r = T - q * N;
    t = b.map((_, k) => q + (k < r ? 1 : 0));
    s = t.map((x, k) => x - b[k]! + d[k]!);
  } else {
    s = lrSplit(S, b.map((x, k) => x - d[k]!));
    t = b.map((x, k) => x - d[k]! + s[k]!);
  }
  const vr = i.vatRateBp ?? 0;
  return {
    ok: true,
    baseSatang: B,
    discountSatang: Dd,
    serviceChargeSatang: S,
    totalSatang: B - Dd + S,
    parts: b.map((x, k) => ({ no: k + 1, baseSatang: x, discountSatang: d[k]!, serviceChargeSatang: s[k]!, totalSatang: t[k]!, vatSatang: vatOf(t[k]!, vr), lines: lines[k]! })),
  };
}
/** เทียบผลแผน (บริสุทธิ์หรือของเซิร์ฟเวอร์) กับตัวอ้างอิง — คืนรายการความต่าง (ว่าง = ตรง) */
function diffPlan(got: Any, want: ROut, idMap: (id: string) => string = (x) => x.slice(-6)): string[] {
  const p: string[] = [];
  if (!want.ok) return got?.ok === false && String(got.code) === want.code ? [] : [`คาด ${want.code} ได้ ${codeOf(got)}`];
  if (!isRecord(got)) return [`ผล ${short(got, 60)}`];
  for (const k of ["baseSatang", "discountSatang", "serviceChargeSatang", "totalSatang"] as const) if (got[k] !== want[k]) p.push(`${k} ${got[k]} (คาด ${want[k]})`);
  const parts = (Array.isArray(got.parts) ? got.parts : []) as Any[];
  if (parts.length !== want.parts.length) p.push(`parts ${parts.length} (คาด ${want.parts.length})`);
  for (const wp of want.parts) {
    const gp = parts.find((x) => Number(x?.no) === wp.no);
    if (!gp) {
      p.push(`ไม่มีใบ ${wp.no}`);
      continue;
    }
    for (const k of ["baseSatang", "discountSatang", "serviceChargeSatang", "totalSatang"] as const) if (gp[k] !== wp[k]) p.push(`ใบ${wp.no}.${k} ${gp[k]} (คาด ${wp[k]})`);
    const key = (l: Any) => `${l.itemId}|${l.qty === null || l.qty === undefined ? "S" : "W"}`;
    const proj = (l: Any) => `${idMap(String(l.itemId))}:${l.qty ?? "-"}:${l.shareNum ?? "-"}/${l.shareDen ?? "-"}:${l.amountSatang}:${l.stockOwner ? "O" : "x"}`;
    const gl = ((Array.isArray(gp.lines) ? gp.lines : []) as Any[]).map((l) => ({ k: key(l), v: proj(l) })).sort((a, b) => byId(a.k, b.k));
    const wl = wp.lines.map((l) => ({ k: key(l), v: proj(l) })).sort((a, b) => byId(a.k, b.k));
    if (gl.map((x) => x.v).join(",") !== wl.map((x) => x.v).join(",")) p.push(`ใบ${wp.no}.lines ${short(gl.map((x) => x.v), 160)} (คาด ${short(wl.map((x) => x.v), 160)})`);
  }
  return p;
}
/** ยอดส่วนแบ่ง (บรรทัด qty null) ต่อใบ */
const shareOf = (plan: Any): number[] => ((Array.isArray(plan?.parts) ? plan.parts : []) as Any[]).map((x) => sum(((x.lines ?? []) as Any[]).filter((l) => l.qty === null || l.qty === undefined).map((l) => Number(l.amountSatang))));
const spread = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
/** PRNG มีเมล็ด (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** แผนสุ่ม EQUAL/SEAT ที่มีรายการกลางโต๊ะเสมอ (SEAT) — ราคาคี่ */
function randomSharedPlan(r: () => number): RIn {
  const ri = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  for (;;) {
    const mode = r() < 0.5 ? "EQUAL" : "SEAT";
    const N = r() < 0.15 ? ri(9, 20) : ri(2, 8);
    const items: RItem[] = Array.from({ length: ri(2, 16) }, (_, k) => ({ id: `i${String(k).padStart(2, "0")}`, qty: ri(1, 5), unitSatang: 2 * ri(1, 30000) + 1 }));
    const allocations: RAlloc[] = [];
    if (mode === "SEAT") {
      let next = 1;
      for (const it of items)
        for (let u = 0; u < it.qty; u++) {
          const shared = r() < 0.5;
          const p = shared ? null : next <= N ? next++ : ri(1, N);
          const same = allocations.find((a) => a.itemId === it.id && a.partNo === p);
          if (same) same.qty++;
          else allocations.push({ itemId: it.id, partNo: p, qty: 1 });
        }
      if (!allocations.some((a) => a.partNo === null)) continue;
    }
    const B = sum(items.map((x) => x.qty * x.unitSatang));
    const dk = r();
    const billDiscount: RDisc = dk < 0.6 ? null : dk < 0.8 ? { type: "PERCENT", value: ri(1, 5000) } : { type: "AMOUNT", value: ri(0, B) };
    const serviceChargeBp = [0, 500, 1000, 1250, 333][ri(0, 4)]!;
    return { mode, partCount: N, items, ...(mode === "EQUAL" ? {} : { allocations }), billDiscount, serviceChargeBp, vatRateBp: r() < 0.8 ? 700 : 0 };
  }
}

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  await step("ST1", async () => {
    const p: string[] = [];
    const mb = mergeBase();
    // ไฟล์ห้ามแตะ (§4) + prisma/
    const extra = walk(POS_DIR).filter((f) => NEVER_TOUCH_GLOB.test(f.split("/").pop() ?? ""));
    const paths = [...NEVER_TOUCH, ...extra];
    let checked = 0;
    for (const f of paths) {
      const a = sameAsRev(BASE_REV, f);
      if (a === null) {
        p.push(`git ใช้ไม่ได้ (${f})`);
        break;
      }
      checked++;
      if (a) continue;
      const b = mb ? sameAsRev(mb, f) : false;
      if (!b) p.push(`${f} เปลี่ยนจากฐาน ${BASE_REV}${mb ? `/merge-base ${mb.slice(0, 8)}` : ""} (§4 ห้ามแตะ${f === "prisma" ? " · ไม่มี migration" : ""})`);
    }
    // outbox-consumers: บรรทัดเหนือคีย์ + หน้าต่างของรอยต่อ
    const raw = rd(F.consumers).split("\n");
    const keyAt = raw.findIndex((l) => l.includes('"pos.sale.voided":'));
    if (keyAt < 0) p.push('outbox-consumers.ts ไม่มี "pos.sale.voided":');
    else {
      const refAt = (rev: string | null): number | null => {
        if (!rev) return null;
        const s = showAt(rev, F.consumers);
        if (s === null) return null;
        const i = s.split("\n").findIndex((l) => l.includes('"pos.sale.voided":'));
        return i < 0 ? null : i;
      };
      const deltas = [refAt(BASE_REV), refAt(mb)].filter((x): x is number => x !== null).map((x) => keyAt - x);
      if (!deltas.length) p.push("อ่านตำแหน่งคีย์ของฐานไม่ได้ (git)");
      else if (Math.min(...deltas) > 4) p.push(`บรรทัดเหนือ "pos.sale.voided": เพิ่ม ${Math.min(...deltas)} (เพดาน 4 · หน้าต่าง ST3 ของ p2.4/p2.6/p2.8)`);
      for (const tag of ["POS P2.4", "POS P2.6", "POS P2.8"]) {
        const win = raw.slice(Math.max(0, keyAt - 8), keyAt + 9).join("\n");
        if (!win.includes(`${tag} ▸`)) p.push(`รอยต่อ ${tag} ▸ ไม่อยู่ใน ±8 บรรทัดของ "pos.sale.voided": (หน้าต่าง ST3)`);
      }
      const jAt = raw.findIndex((l) => /POS HF-FU\s*▸\s*j\b/.test(l));
      if (jAt >= 0 && jAt < keyAt) p.push(`รอยต่อ POS HF-FU ▸ j อยู่เหนือคีย์ (บรรทัด ${jAt + 1} < ${keyAt + 1})`);
    }
    // บริสุทธิ์
    for (const f of [F.splitShared, F.preBill, F.priceShared, F.recipeShared, F.orderShared]) if (existsSync(join(ROOT, f)) && !purePath(f)) p.push(`${f.split("/").pop()} ไม่บริสุทธิ์`);
    // 'use client' ไม่ import ฝั่งเซิร์ฟเวอร์
    for (const f of walk("src")) {
      const r0 = rd(f);
      if (!isUseClient(r0)) continue;
      const imps = [...stripComments(r0).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
      const bad = imps.filter((x) => /modules\/pos\/(table|table-split|order|kds)$/.test(x));
      if (bad.length) p.push(`${f} ('use client') import ${bad.join(",")}`);
    }
    // ทะเบียนผู้เรียก createSale
    const found: Record<string, number> = {};
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const n = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
      if (n) found[f] = n;
    }
    const diff = [...new Set([...Object.keys(CALL_SITES), ...Object.keys(found)])].filter((f) => (CALL_SITES[f] ?? 0) !== (found[f] ?? 0)).map((f) => `${f.replace("src/lib/", "")}:${CALL_SITES[f] ?? 0}→${found[f] ?? 0}`);
    if (diff.length) p.push(`ผู้เรียก createSale ต่าง: ${diff.join(", ")}`);
    chk("ST1", p.length === 0, "ไม่มี migration · ไฟล์ห้ามแตะเดิม · หน้าต่าง outbox · บริสุทธิ์ · 'use client' · createSale เท่าเดิม", P8(p) || `ครบ (${checked} path · merge-base ${mb ? mb.slice(0, 8) : "ไม่มี"})`);
  });
  await step("ST2", async () => {
    const p: string[] = [];
    const th = msgJson(F.msgTh);
    const en = msgJson(F.msgEn);
    if (!th || !en) p.push("อ่าน pos.json th/en ไม่ได้");
    for (const k of NEW_KEYS) {
      const a = getPath(th, k);
      const b = getPath(en, k);
      if (typeof a !== "string" || !a.trim()) p.push(`th: ${k} ไม่มี`);
      else if (!THAI.test(a)) p.push(`th: ${k} ไม่ใช่ภาษาไทย`);
      if (typeof b !== "string" || !b.trim()) p.push(`en: ${k} ไม่มี`);
      else if (THAI.test(b)) p.push(`en: ${k} มีอักษรไทย`);
    }
    for (const [lang, j] of [["th", th], ["en", en]] as const) {
      const v = getPath(j, "products.branch.incomplete");
      if (typeof v === "string" && !v.includes("{unit}")) p.push(`${lang}: products.branch.incomplete ไม่มี {unit}`);
    }
    const ev = constBody(srcOf(F.orderPanel), "const EVENT_TYPES");
    if (!/"held"/.test(ev)) p.push("OrderPanel EVENT_TYPES ไม่มี held");
    const own = rd(F.ownerPending).split("\n").filter((l) => /P2\.9b/.test(l) && /HF-FU/.test(l) && /2200/.test(l) && /(เงินสด|cash)/i.test(l));
    if (!own.length) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.9b + HF-FU (บิลเงินสดล้วนหลังเลิกจด VAT ค้าง 2200 · z4)");
    chk("ST2", p.length === 0, "คีย์ใหม่ th/en · EVENT_TYPES held · บรรทัดเจ้าของ z4", P8(p) || `ครบ (${NEW_KEYS.length} คีย์)`);
  });
}

// ═════════════════════════ 1b. บริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
const pbPayload = (o: Any = {}): Any => ({
  kind: "PRE_BILL", shop: { name: "บ้านกาแฟสวนผึ้ง", branch: "สาขาหัวหิน" }, tableName: "A5", guestCount: 4, openedAt: "2026-10-14T05:02:00.000Z", printedAt: "2026-10-14T06:30:00.000Z",
  staffName: "น้ำฝน", part: null, member: null,
  lines: [{ qty: 1, name: "ต้มยำกุ้ง", options: [], amountSatang: 18000 }, { qty: 2, name: "กะเพราไก่ไข่ดาว", options: ["ไข่ดาว"], amountSatang: 19800 }],
  subtotalSatang: 124000, discountSatang: 0, serviceCharge: { rateBp: 1000, satang: 12400 }, vatIncludedSatang: 8923, totalSatang: 136400, itemsHash: "h", notReceipt: true, copy: false, locale: "th", ...o,
});
const T_DIV = /<div class="t[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const normHtml = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/, "<style></style>").replace(T_DIV, `<div class="t">T</div>`);
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
async function runPure(sharedMod: Any, renderMod: Any): Promise<void> {
  console.log("\n── บริสุทธิ์ (ไม่แตะ DB) ──");
  await step("EQ1", async () => {
    const p: string[] = [];
    const alloc = (i: RIn) => callSync(sharedMod, "allocateTableSplit", i);
    if (!sharedMod) p.push(`${MISSING} table-split-shared.ts (หรือไม่บริสุทธิ์)`);
    else {
      const items: RItem[] = Array.from({ length: 30 }, (_, k) => ({ id: `e${String(k).padStart(2, "0")}`, qty: 1, unitSatang: 1001 + 3 * k }));
      const eq: RIn = { mode: "EQUAL", partCount: 3, items, serviceChargeBp: 0, vatRateBp: 700 };
      const g = alloc(eq);
      if (g?.ok !== true) p.push(`EQUAL 3 → ${codeOf(g)}`);
      else {
        const parts = g.parts as Any[];
        const b = parts.map((x) => Number(x.baseSatang));
        const s = parts.map((x) => Number(x.serviceChargeSatang));
        if (spread(b) > 1) p.push(`ฐานต่อใบ ${b.join("/")} (ห่าง ${spread(b)} · คาด ≤ 1)`);
        if (s.some((x) => Math.abs(x) > 1)) p.push(`ค่าบริการของใบ ${s.join("/")} (คาด |s| ≤ 1)`);
        if (sum(parts.map((x) => Number(x.totalSatang))) !== sum(items.map((x) => x.unitSatang))) p.push("Σ สุทธิ ≠ ยอดโต๊ะ");
        const d = diffPlan(g, refAllocRot(eq));
        if (d.length) p.push(`EQUAL ≠ ตัวอ้างอิงหมุนเศษ: ${P8(d)}`);
        if (parts.some((x) => ((x.lines ?? []) as Any[]).some((l) => !!l.stockOwner !== (x.no === 1)))) p.push("เจ้าของสต็อกไม่ใช่ใบ 1");
      }
      const seat: RIn = { mode: "SEAT", partCount: 3, items, allocations: items.map((x) => ({ itemId: x.id, partNo: null, qty: 1 })), serviceChargeBp: 0, vatRateBp: 700 };
      const gs = alloc(seat);
      if (gs?.ok !== true) p.push(`SEAT กลางโต๊ะ → ${codeOf(gs)}`);
      else {
        const b = (gs.parts as Any[]).map((x) => Number(x.baseSatang));
        if (spread(b) > 1) p.push(`SEAT ฐานต่อใบ ${b.join("/")} (ห่าง ${spread(b)})`);
        const d = diffPlan(gs, refAllocRot(seat));
        if (d.length) p.push(`SEAT ≠ ตัวอ้างอิงหมุนเศษ: ${P8(d)}`);
      }
    }
    chk("EQ1", p.length === 0, "30 รายการราคาคี่: ฐานห่าง ≤ 1 · |s| ≤ 1 · Σ ตรง · ตรงตัวอ้างอิงหมุนเศษ", P8(p) || "ครบ");
  });
  await step("PB1", async () => {
    const p: string[] = [];
    if (!renderMod) p.push(`${MISSING} pre-bill-render.ts (หรือไม่บริสุทธิ์)`);
    else {
      const html = (pl: Any, paper: "80" | "58", locale: string) => callSync(renderMod, "renderPreBillHtml", pl, { paper, locale });
      const esc = (pl: Any, o: Any): string => {
        const e = callSync(renderMod, "renderPreBillEscPos", pl, o);
        return e?.bytes instanceof Uint8Array ? sha256(Buffer.from(e.bytes).toString("hex") + "|" + JSON.stringify(e.rasterSlots)) : `ผล ${short(e, 60)}`;
      };
      const th = html(pbPayload(), "80", "th");
      if (typeof th !== "string") p.push(`renderPreBillHtml → ${short(th, 80)}`);
      else {
        const t = T_DIV.exec(th)?.[1] ?? "";
        const spans = [...t.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)].map((m) => ({ attr: m[1] ?? "", inner: m[2] ?? "" }));
        const css = (/<style>([\s\S]*?)<\/style>/.exec(th)?.[1] ?? "").replace(/\s+/g, " ");
        const nowrap = (attr: string) => {
          if (/white-space\s*:\s*nowrap/i.test(attr)) return true;
          const cls = /class="([^"]+)"/.exec(attr)?.[1]?.split(/\s+/) ?? [];
          return cls.some((c) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}\\b[^{]*\\{[^}]*white-space\\s*:\\s*nowrap`, "i").test(css)) || /\.t\s+span\b[^{]*\{[^}]*white-space\s*:\s*nowrap/i.test(css);
        };
        const small = (attr: string) => {
          if (/font-size\s*:\s*0?\.95em/i.test(attr)) return true;
          const cls = /class="([^"]+)"/.exec(attr)?.[1]?.split(/\s+/) ?? [];
          return cls.some((c) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}\\b[^{]*\\{[^}]*font-size\\s*:\\s*0?\\.95em`, "i").test(css));
        };
        if (spans.length !== 2) p.push(`.t มี span ${spans.length} (คาด 2) · ${short(t, 120)}`);
        else {
          if (stripTags(spans[0]!.inner) !== PREBILL_HEAD_1) p.push(`span 1 "${stripTags(spans[0]!.inner)}" (คาด "${PREBILL_HEAD_1}")`);
          if (stripTags(spans[1]!.inner) !== PREBILL_HEAD_2) p.push(`span 2 "${stripTags(spans[1]!.inner)}" (คาด "${PREBILL_HEAD_2}")`);
          if (!spans.every((x) => nowrap(x.attr))) p.push("span ไม่ white-space:nowrap ทั้งคู่");
          if (!small(spans[1]!.attr)) p.push("span ที่สองไม่ font-size .95em");
          if (!/\/<wbr\s*\/?>/.test(spans[1]!.inner)) p.push("span ที่สองไม่มี <wbr> หลัง /");
        }
        if (!th.includes(`<title>${PREBILL_TITLE_TH}</title>`)) p.push("<title> ไม่ใช่หัวเต็ม");
        if (sha256(normHtml(th)) !== PB_GOLD.htmlTh80) p.push("HTML th 80 นอก .t/<style> ต่างจากฐาน");
      }
      const th58 = html(pbPayload({ part: { no: 1, of: 2 }, copy: true }), "58", "th");
      if (typeof th58 !== "string" || sha256(normHtml(th58)) !== PB_GOLD.htmlTh58) p.push("HTML th 58 (ใบ 1/2 · สำเนา) นอก .t/<style> ต่างจากฐาน");
      const en = html(pbPayload({ locale: "en" }), "80", "en");
      if (typeof en !== "string" || stripTags(T_DIV.exec(en)?.[1] ?? "") !== PREBILL_TITLE_EN || sha256(normHtml(en)) !== PB_GOLD.htmlEn80) p.push("HTML en ต่างจากฐาน (หรือ .t ไม่ใช่หัวเดิม)");
      if (renderMod.PRE_BILL_LABELS?.th?.title !== PREBILL_TITLE_TH) p.push(`PRE_BILL_LABELS.th.title ${short(renderMod.PRE_BILL_LABELS?.th?.title)}`);
      const e1 = esc(pbPayload(), { paper: "80", thaiText: "raster", locale: "th" });
      const e2 = esc(pbPayload(), { paper: "58", thaiText: "tis620", locale: "th" });
      const e3 = esc(pbPayload({ locale: "en" }), { paper: "80", thaiText: "raster", locale: "en" });
      if (e1 !== PB_GOLD.escTh80 || e2 !== PB_GOLD.escTh58 || e3 !== PB_GOLD.escEn80) p.push(`ESC/POS ต่างจากฐาน (th80 ${e1 === PB_GOLD.escTh80} · th58 ${e2 === PB_GOLD.escTh58} · en80 ${e3 === PB_GOLD.escEn80})`);
    }
    chk("PB1", p.length === 0, "หัว th สอง span nowrap · <title>/ป้ายเดิม · HTML อื่น + ESC/POS = ฐาน", P8(p) || "ครบ");
  });
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
const loadShared = async () => (existsSync(join(ROOT, F.splitShared)) && purePath(F.splitShared) ? await tryImport("@/lib/modules/pos/table-split-shared") : null);
const loadRender = async () => (existsSync(join(ROOT, F.preBill)) && purePath(F.preBill) ? await tryImport("@/lib/modules/pos/pre-bill-render") : null);
const loadPriceShared = async () => (purePath(F.priceShared) ? await tryImport("@/lib/modules/pos/price-shared") : null);
if (NODB) {
  const ids = ["ST1", "ST2", "EQ1", "PB1"].map((x) => `HF-FU-${x}`);
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    await runPure(await loadShared(), await loadRender());
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือก่อน ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const FP_TABLES: [string, string][] = [["PosOrder", "version"], ["PosHeldCart", "version"], ["PosTableSplit", "version"], ["SalesChannel", "updatedAt"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-hffu-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ HF-FU ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล · PAR เขียว)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · PAR เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const sharedMod = await loadShared();
const renderMod = await loadRender();
const priceSharedMod = await loadPriceShared();
const recipeSharedMod = await tryImport("@/lib/modules/pos/recipe-shared");
const orderMod = await tryImport("@/lib/modules/pos/order");
const kdsMod = await tryImport("@/lib/modules/pos/kds");
const tableMod = await tryImport("@/lib/modules/pos/table");
const splitMod = await tryImport("@/lib/modules/pos/table-split");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const register = await tryImport("@/lib/modules/pos/register");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const setGenMod = await tryImport("@/lib/modules/pos/settings-general");
const productsDataMod = await tryImport("@/app/app/sys/[id]/pos/products/products-data");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const rtable = await tryImport("@/lib/modules/restaurant/table");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const accIdx = await tryImport("@/lib/modules/account");
const glMod = await tryImport("@/lib/modules/account/gl");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-hffu-${RAND}`;
const T_SLUG = `posqc-hffu-${RAND}`;
const T2_SLUG = `posqc-hffu-${RAND}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qcfu-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const MY_SALES: string[] = [];

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}
/** ต้นวันไทย (สูตรเดียวกับ pos/service posDayStart — ข้อสอบเขียนเอง) */
const bkkDayStart = (now: Date) => new Date(new Date(`${new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00Z`).getTime() - 7 * 3_600_000);

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   สาขา A (RESTAURANT · POS + คลัง + สมาชิก + บัญชี A · BLOCK · ช่องทาง CHAT/LINEMAN/GRAB(NONE)/CUSTOM_*) · B (RESTAURANT · POS) · C (SHOP · ไม่ผูก POS) · บัญชี B · POS Z (ZE) · ร้าน T2 สาขา X (POS + สมาชิก)");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const ST: Record<string, string> = {};
  const MI: Record<string, string> = {};
  const PP: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const CH: Record<string, string> = {};
  const MEM: Record<string, string> = {};
  const MEM_NAME: Record<string, string> = { M1: `คุณหนึ่ง คิวซี ${RAND}`, M2: `คุณสอง คิวซี ${RAND}` };
  const TB: Record<string, string> = {};
  let ZONE = "";
  let ZONE_B = "";
  try {
    T = (await P.tenant.create({ data: { name: `QC HF-FU ตามเก็บ ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC HF-FU ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.C = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาC`, slug: `${T_SLUG}-c` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "RESTAURANT", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี A ${RAND}`)).id;
    S.ACCB = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี B ${RAND}`)).id;
    S.POSZ = (await sysSvc.createSystem(T, "POS", `POS Z ${RAND}`)).id;
    S.POS2 = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    S.MEM2 = (await sysSvc.createSystem(T2, "MEMBER", `สมาชิก T2 ${RAND}`)).id;
    for (const [acc, nm] of [[S.ACC, "A"], [S.ACCB, "B"]] as const) {
      await accSvc.saveSettings(T, acc, { orgName: `ร้านตามเก็บคิวซี ${nm} ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
      await glMod.ensureAccounting({ tenantId: T, systemId: acc });
    }
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POSZ } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    await sysSvc.linkUnit(T2, S.POS2, U.X);
    await sysSvc.linkUnit(T2, S.MEM2, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง
  const spec: [string, () => string, string, () => string[], Record<string, boolean>][] = [
    ["OWNER", () => T, "OWNER", () => ["*"], {}],
    ["STAFF", () => T, "STAFF", () => [U.A ?? "-"], { "pos.sale.create": true, "pos.order.accept": true, "pos.order.reject": true }],
    ["NOPERM", () => T, "STAFF", () => [U.A ?? "-"], {}],
    ["OWNER2", () => T2, "OWNER", () => ["*"], {}],
  ];
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of spec) {
        const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid(), role, unitAccess: ua(), permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess: ua(), perms };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const DEV1 = `qcfu${RAND}d1`;
  const DEVB = `qcfu${RAND}db`;
  const ctxA = (dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.A ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const ctxB = (dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.B ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const ctxX = (): Any => ({ tenantId: T2, systemId: S.POS2 ?? "none", unitId: U.X ?? "none" });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;

  // ─── เมนู · สินค้า · นโยบาย BLOCK (สาขา A) ───
  if (!fx) {
    try {
      await menu.ensureDefaultStations(T, U.A);
      const sts = (await menu.listStations(T, U.A)) as Any[];
      ST.hot = String(sts.find((s) => s.name !== "เครื่องดื่ม")?.id ?? sts[0]?.id ?? "");
      ST.drink = String(sts.find((s) => s.name === "เครื่องดื่ม")?.id ?? ST.hot);
      const cat = must("createCategory", await menu.createCategory(T, U.A, { name: `อาหาร ${RAND}` }, uid("OWNER")));
      const mk = async (key: string, name: string, basePrice: number, stationId: string) => {
        const r = must(`createItem ${key}`, await menu.createItem(T, U.A, { categoryId: cat.id, stationId, name, basePrice }, uid("OWNER")));
        MI[key] = r.id;
        PP[key] = String((await P.menuItem.findUnique({ where: { id: r.id }, select: { posProductId: true } }))?.posProductId ?? "");
        if (!PP[key]) throw new Error(`เมนู ${key} ไม่มี posProductId`);
      };
      await mk("padthai", `ผัดไทย ${RAND}`, 9000, ST.hot!);
      await mk("kaprao", `กะเพรา ${RAND}`, 9900, ST.hot!);
      await mk("chayen", `ชาเย็น ${RAND}`, 4500, ST.drink!);
      for (const [k, price] of [["o1", 1001], ["o2", 2003], ["o3", 3007], ["o4", 4001], ["o5", 5003], ["o6", 6007]] as const) await mk(k, `ราคาคี่ ${k} ${RAND}`, price, ST.hot!);
      const ic: Any = { tenantId: T, systemId: S.INV, actorUserId: uid("OWNER") };
      const inv = async (key: string, name: string, qty: number, price: number, extra: Any = {}) => {
        const it = await invSvc.createItem(ic, { sku: `${KEY_PREFIX}-${key}`, name: `${name} ${RAND}`, unitLabel: "ชิ้น", costSatang: 100, ...extra });
        INV[key] = it.id;
        if (qty > 0) await invSvc.receive(ic, { itemId: it.id, qty, costSatang: 100, idempotencyKey: `${KEY_PREFIX}-recv-${key}` });
        PP[key] = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: it.id }, select: { id: true } }))?.id ?? "");
        if (price >= 0 && PP[key]) must(`setPrice ${key}`, await call(catalog, "setPrice", cc("OWNER"), PP[key], price));
      };
      await inv("salt", "ไข่เค็ม", 1, 2000);
      await inv("water", "น้ำเปล่า", 100, 1000);
      await inv("rice", "ข้าวสาร", 100, -1);
      await inv("old", "วัตถุดิบเลิกใช้", 0, -1);
      await inv("svc", "บริการห่อของ", 0, -1, { kind: "SERVICE", durationMin: 30, priceSatang: 5000 });
      await invSvc.archiveItem(ic, INV.old);
      if (!PP.salt || !PP.water) throw new Error("salt/water ไม่มีแถว PRODUCT (P1.1b)");
      must("BLOCK", await call(setGenMod, "updatePosUnitStockPolicy", { tenantId: T, systemId: S.POS }, A("OWNER"), { unitId: U.A, oversellPolicy: "BLOCK" }));
    } catch (e) {
      fx = `เมนู/สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── ช่องทาง (A · B · X) ───
  if (!fx) {
    try {
      const ens = async (ctx: Any, sfx: string) => {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${sfx}: ${codeOf(r)}`);
        for (const c of r as Any[]) CH[`${c.code}_${sfx}`] = c.id;
      };
      await ens(ctxA(), "A");
      await ens(ctxB(), "B");
      await ens(ctxX(), "X");
      const save = async (alias: string, ctx: Any, actor: string, input: Any) => {
        const r = must(`saveChannel ${alias}`, await call(chMod, "saveChannel", ctx, A(actor), input));
        CH[alias] = String(r.channel?.id ?? "");
      };
      await save("LM", ctxA(), "OWNER", { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 });
      await save("GB", ctxA(), "OWNER", { code: "GRAB", name: `Grab ${RAND}`, payout: "PLATFORM", commissionBp: 2500, adapter: "NONE" });
      await save("OFF", ctxA(), "OWNER", { code: "CUSTOM_OFF", name: `ปิดรับอัตโนมัติ ${RAND}`, payout: "DIRECT", adapter: "NONE" });
      await save("PZ", ctxA(), "OWNER", { code: "CUSTOM_PZ", name: `พักรับ ${RAND}`, payout: "DIRECT", adapter: "NONE" });
      await save("NH", ctxA(), "OWNER", { code: "CUSTOM_NH", name: `ไม่มี held ${RAND}`, payout: "DIRECT", adapter: "NONE" });
      await save("CB", ctxB(), "OWNER", { code: "CUSTOM_B", name: `สาขา B ${RAND}`, payout: "DIRECT", adapter: "NONE" });
      await save("CX", ctxX(), "OWNER2", { code: "CUSTOM_X", name: `ร้าน T2 ${RAND}`, payout: "DIRECT", adapter: "NONE" });
      const auto = async (ctx: Any, actor: string, id: string, on: boolean) => must(`autoAccept ${id.slice(-6)}`, await call(orderMod, "setChannelOrderSettings", ctx, A(actor), { channelId: id, autoAccept: on }));
      for (const k of ["GB", "OFF", "PZ"]) await auto(ctxA(), "OWNER", CH[k]!, true);
      await auto(ctxB(), "OWNER", CH.CB!, true);
      await auto(ctxX(), "OWNER2", CH.CX!, true);
      if (!CH.CHAT_A) throw new Error("ไม่มีช่องทาง CHAT ของสาขา A");
    } catch (e) {
      fx = `ช่องทาง:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── สมาชิก (A · T2) ───
  if (!fx) {
    try {
      for (const [mctx, key, nm] of [
        [{ tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") }, "M1", MEM_NAME.M1],
        [{ tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") }, "M2", MEM_NAME.M2],
        [{ tenantId: T2, systemId: S.MEM2, actorUserId: uid("OWNER2") }, "MX", `คุณร้านอื่น ${RAND}`],
      ] as [Any, string, string][]) {
        const actor = key === "MX" ? A("OWNER2") : A("OWNER");
        if (!(await P.memberTierDef?.count?.({ where: { tenantId: mctx.tenantId, systemId: mctx.systemId } }).catch(() => 0))) {
          try {
            await tierMod.createTierDef(mctx, actor, { key: "silver", name: "Silver", color: "SLATE", isDefault: true, legacyTier: "SILVER" });
          } catch {
            /* มีอยู่แล้ว */
          }
        }
        const m = await memMod.createMember(mctx, actor, { phone: `0896${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, name: nm, source: "WALK_IN", ...(key === "MX" ? { homeUnitId: U.X } : { homeUnitId: U.A }) });
        MEM[key] = String(m?.customerId ?? "");
        if (!MEM[key]) throw new Error(`สมาชิก ${key} ไม่มี customerId`);
      }
    } catch (e) {
      console.log(`  ⚠️  สมาชิก: ${(e as Error).message.slice(0, 120)} (SM1/SM2 แดงด้วยเหตุ fixture)`);
    }
  }
  // ─── โซน · เครื่อง + กะ (A · B) ───
  if (!fx) {
    try {
      ZONE = must("zone A", await rtable.createZone(T, U.A, `ในร้าน ${RAND}`)).id;
      ZONE_B = must("zone B", await rtable.createZone(T, U.B, `ในร้าน B ${RAND}`)).id;
      for (const [dev, ctx, label] of [[DEV1, ctxA, "A"], [DEVB, ctxB, "B"]] as const) {
        const rg = await call(devMod, "registerDevice", ctx(), A("OWNER"), { name: `เคาน์เตอร์ QC HF-FU ${label}`, deviceCode: dev });
        if (rg?.ok !== true) console.log(`  ⚠️  registerDevice ${label}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
        const o = await call(shiftMod, "openShift", ctx(dev), A("OWNER"), { deviceId: dev, deviceLabel: `เคาน์เตอร์ QC HF-FU ${label}`, floatSatang: 0 });
        if (o?.ok !== true) throw new Error(`เปิดกะ ${label}: ${codeOf(o)} ${short(o?.message ?? "", 60)}`);
      }
    } catch (e) {
      fx = `โซน/กะ:${(e as Error).message.slice(0, 160)}`;
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NF = (mod: Any, ...names: string[]) => names.filter((n) => typeof mod?.[n] !== "function").map((n) => `${MISSING} ${n} · `).join("");

  // ─── ตัวช่วย: ออเดอร์ ───
  const O = (fn: string, ...args: unknown[]) => call(orderMod, fn, ...args);
  const K = (fn: string, ...args: unknown[]) => call(kdsMod, fn, ...args);
  const ln = (key: string, qty: number): Any => ({ productId: PP[key] ?? `none-${key}`, qty });
  const ingest = (ctx: Any, actor: string, input: Any) => O("ingestOrder", ctx, A(actor), input);
  const mkOrder = async (label: string, channelId: string, lines: Any[], o: Any = {}, ctx: Any = ctxA(DEV1), actor = "OWNER"): Promise<string> => {
    const r = await ingest(ctx, actor, { channelId, idempotencyKey: newKey(label), lines, customer: { name: `คุณ ${label}` }, fulfilment: "PICKUP", ...o });
    const id = r?.ok === true ? String(r.orderId ?? "") : "";
    if (!id) throw new Error(`ออเดอร์ ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    if (r.saleId) MY_SALES.push(String(r.saleId));
    await sleep(15); // receivedAt เรียงแน่นอน (FIFO)
    return id;
  };
  const orow = async (id: string): Promise<Any> => (id ? P.posOrder.findUnique({ where: { id } }).catch(() => null) : null);
  const evsOf = async (id: string): Promise<Any[]> => (id ? ((await P.posOrderEvent.findMany({ where: { orderId: id }, orderBy: [{ at: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : []);
  const heldEvs = async (id: string) => (await evsOf(id)).filter((e) => e.type === "held");
  const roundsOf = async (orderId: string): Promise<Any[]> => (orderId ? ((await P.restaurantOrder.findMany({ where: { tenantId: { in: [T, T2] }, posOrderId: orderId }, include: { items: true } }).catch(() => [])) as Any[]) : []);
  const salesOf = async (orderId: string): Promise<Any[]> => (orderId ? ((await P.posSale.findMany({ where: { tenantId: { in: [T, T2] }, sourceModule: "POS", sourceId: orderId } }).catch(() => [])) as Any[]) : []);
  const auditsOf = async (action: string, targetId?: string): Promise<Any[]> => ((await P.auditLog.findMany({ where: { tenantId: T, action, ...(targetId ? { targetId } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]);
  const ostr = (o: Any) => short(o && { st: o.status, by: o.acceptedByUserId ?? null, sale: o.saleId ? "มี" : null, v: o.version }, 100);
  const release = (unitId = U.A!) => O("releaseHeldOrders", T, unitId, { limit: 20 });
  /** ตั๋วที่ยังค้าง (NEW/COOKING) ของสาขา A ทั้งหมด → kdsTicketDone ต่อ (รอบ, สถานี) */
  const clearKitchen = async (): Promise<void> => {
    const rs = (await P.restaurantOrder.findMany({ where: { tenantId: T, unitId: U.A }, include: { items: true } }).catch(() => [])) as Any[];
    for (const r of rs) {
      const st = [...new Set(((r.items ?? []) as Any[]).filter((i) => i.kdsStatus === "NEW" || i.kdsStatus === "COOKING").map((i) => String(i.stationId ?? "")))].filter(Boolean);
      for (const s of st) await K("kdsTicketDone", ctxA(), A("OWNER"), { orderId: r.id, stationId: s });
    }
  };
  const doneRoundsOf = async (orderId: string) => {
    for (const r of await roundsOf(orderId)) for (const s of [...new Set(((r.items ?? []) as Any[]).map((i) => String(i.stationId ?? "")))].filter(Boolean)) await K("kdsTicketDone", ctxA(), A("OWNER"), { orderId: r.id, stationId: s });
  };
  /**
   * ธุรกรรมที่สามถือล็อก (sql) → เริ่มงานทีละตัว: เริ่ม → รอจนมี backend ถูก pid นี้กั้นเพิ่มขึ้น แล้วรออีก gapMs → ตัวถัดไป · ระหว่างถือเรียก during() ได้ ·
   * ครบแล้วปล่อย (แบบ qc-hf-tx HT2.8 / qc-pos-p2.5 holdLock) · blocked = จำนวนสูงสุดที่เห็นถูกกั้นตรงโดยผู้ถือ
   */
  const holdLock = async (sql: string, args: unknown[], starters: (() => Promise<Any>)[], during?: (waitBlocked: (n: number, ms?: number) => Promise<number>) => Promise<void>, gapMs = 800): Promise<{ blocked: number; res: Any[] }> => {
    let blocked = 0;
    const box: { ps: Promise<Any>[] } = { ps: [] };
    await P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(sql, ...args);
        const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS p`)) as Any[])[0].p);
        const count = async () => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid)) as Any[])[0].n);
        const waitBlocked = async (n: number, ms = 12_000): Promise<number> => {
          const t1 = Date.now();
          let c = 0;
          while (Date.now() - t1 < ms) {
            c = await count();
            if (c > blocked) blocked = c;
            if (c >= n) break;
            await sleep(150);
          }
          return c;
        };
        for (let i = 0; i < starters.length; i++) {
          box.ps.push(starters[i]!().catch((e: unknown) => ({ ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 120), threw: true })));
          await waitBlocked(i + 1);
          await sleep(gapMs);
        }
        if (during) await during(waitBlocked);
      },
      { timeout: 90_000, maxWait: 15_000 },
    );
    return { blocked, res: await Promise.all(box.ps) };
  };
  const LOCK_ORDER = `SELECT id FROM "PosOrder" WHERE id = $1 FOR UPDATE`;
  const voidSale = (saleId: string) => call(billsMod, "voidSaleByActor", ctxA(DEV1), A("OWNER"), { unitId: U.A, saleId: saleId || "none", idempotencyKey: newKey("void"), reason: "ลูกค้ายกเลิก" });
  /** ออเดอร์ LINEMAN (MANUAL) รับแล้ว (บิล PLATFORM ในธุรกรรมรับ) → PREPARING → READY */
  const readyLm = async (label: string): Promise<{ id: string; saleId: string }> => {
    const id = await mkOrder(label, CH.LM!, [ln("water", 1)], { externalRef: `${label}-${RAND}`, startStatus: "ACCEPTED" });
    for (const fn of ["markPreparing", "markReady"]) must(`${fn} ${label}`, await O(fn, ctxA(DEV1), A("OWNER"), { id }));
    const o = await orow(id);
    if (o?.status !== "READY" || !o?.saleId) throw new Error(`(fixture) ${label} ${ostr(o)}`);
    MY_SALES.push(String(o.saleId));
    return { id, saleId: String(o.saleId) };
  };

  // ════════ HN ออเดอร์ที่ครัวพักไว้ (a) — ก่อนโต๊ะ (ครัวว่าง) ════════
  console.log("\n── HN ออเดอร์ที่ครัวพักไว้ ──");
  await step("HN1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    // สถิต: kitchenPauseAction (ชั้น action · restaurant/** แช่แข็ง)
    const act = fnBody(srcOf(F.actRest), "kitchenPauseAction");
    const actRaw = fnBody(rd(F.actRest), "kitchenPauseAction");
    const si = act.indexOf("menu.setKitchenPause(");
    const ri = act.search(/\breleaseHeldOrders\s*\(/);
    if (ri < 0 || si < 0 || ri < si) p.push(`kitchenPauseAction: releaseHeldOrders ${ri < 0 ? "ไม่ถูกเรียก" : "อยู่ก่อน setKitchenPause"}`);
    if (!/POS HF-FU\s*▸/.test(actRaw)) p.push("kitchenPauseAction ไม่มีรอยต่อ // POS HF-FU ▸ … ◂");
    for (const [f, fn] of [[F.kds, "kdsSetAutoAcceptMax"], [F.kds, "kdsBoard"], [F.order, "listOrders"]] as const) if (!/\breleaseHeldOrders\b/.test(fnBody(srcOf(f), fn))) p.push(`${fn} ไม่เรียก releaseHeldOrders (มติ 1)`);
    await clearKitchen();
    await menu.setKitchenPause(T, U.A, true, "qc hffu HN1");
    let h1 = "";
    let hOld = "";
    try {
      h1 = await mkOrder("hn1", CH.GB!, [ln("padthai", 1)], { externalRef: `GB1-${RAND}` });
      hOld = await mkOrder("hn1old", CH.GB!, [ln("padthai", 1)], { externalRef: `GB0-${RAND}` });
    } finally {
      await menu.setKitchenPause(T, U.A, false);
    }
    const o0 = await orow(h1);
    const hv = await heldEvs(h1);
    if (o0?.status !== "NEW") p.push(`พักครัว + รับอัตโนมัติ → ${ostr(o0)} (คาด NEW)`);
    if (hv.length !== 1 || hv[0]?.fromStatus !== "NEW" || hv[0]?.toStatus !== "NEW" || hv[0]?.payload?.reason !== "paused") p.push(`event held ${hv.length} ${short(hv.map((e) => [e.fromStatus, e.toStatus, e.payload]), 100)} (คาด 1 · NEW→NEW · reason paused)`);
    // ออเดอร์ของวันก่อน (เวลา receivedAt ย้อนก่อนต้นวันไทย) — ถูกกวาดด้วย // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-3) มติ 14: P2.14 Q2 ชนะ · เดิม "ไม่ถูกกวาด (มติ 1)"
    await P.$executeRawUnsafe(`UPDATE "PosOrder" SET "receivedAt" = $2 WHERE id = $1 AND "tenantId" = $3`, hOld, new Date(bkkDayStart(new Date()).getTime() - 2 * 3_600_000), T);
    const a0 = await auditsOf(AUDIT_ACCEPT);
    // = kitchenPauseAction หลังเลิกพัก (setKitchenPause แล้ว → releaseHeldOrders)
    const r = await release();
    const o1 = await orow(h1);
    const acc = (await evsOf(h1)).filter((e) => e.toStatus === "ACCEPTED" && e.fromStatus === "NEW");
    const rounds = await roundsOf(h1);
    const sales = await salesOf(h1);
    for (const s of sales) MY_SALES.push(String(s.id));
    const au = (await auditsOf(AUDIT_ACCEPT, h1)).filter((x) => !a0.some((y) => y.id === x.id));
    if (r?.ok === false) p.push(`releaseHeldOrders → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else if (!Array.isArray(r?.accepted) || !r.accepted.includes(h1) || !r.accepted.includes(hOld)) p.push(`ผลคืน accepted ${short(r?.accepted, 80)} (คาดมี h1 และออเดอร์วันก่อน)`); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-3)
    if (o1?.status !== "ACCEPTED" || o1?.acceptedByUserId !== null || !o1?.saleId) p.push(`หลังกวาด ${ostr(o1)} (คาด ACCEPTED · ผู้รับ null · มีบิล PLATFORM)`);
    if (acc.length !== 1 || acc[0]?.actorUserId !== null) p.push(`event accepted ${acc.length} ผู้กระทำ ${short(acc[0]?.actorUserId)}`);
    if (rounds.length !== 1 || sales.length !== 1) p.push(`รอบครัว ${rounds.length} · บิล ${sales.length} (คาด 1 · 1)`);
    if (au.length !== 1 || au[0]?.actorType !== "SYSTEM" || au[0]?.after?.auto !== true || au[0]?.after?.swept !== true) p.push(`audit ${AUDIT_ACCEPT} ${au.length} ${short(au.map((x) => [x.actorType, x.after]), 120)} (คาด 1 · SYSTEM · {auto:true, swept:true})`);
    const oOld = await orow(hOld);
    for (const s of await salesOf(hOld)) MY_SALES.push(String(s.id)); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-3)
    if (oOld?.status !== "ACCEPTED") p.push(`ออเดอร์วันก่อน → ${ostr(oOld)} (คาด ACCEPTED · ครัวพักข้ามเที่ยงคืนถูกกวาด)`); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-3)
    // กวาดซ้ำ = ไม่มีอะไรเปลี่ยน
    const ev0 = Number(await P.posOrderEvent.count({ where: { tenantId: T } }).catch(() => -1));
    const n0 = (await auditsOf(AUDIT_ACCEPT)).length;
    const r2 = await release();
    if (r2?.ok === false || (Array.isArray(r2?.accepted) && r2.accepted.length) || Number(await P.posOrderEvent.count({ where: { tenantId: T } }).catch(() => -1)) !== ev0 || (await auditsOf(AUDIT_ACCEPT)).length !== n0) p.push(`กวาดซ้ำ → ${codeOf(r2)} ${short(r2?.accepted, 60)} (คาด ไม่มีอะไรเปลี่ยน)`);
    chk("HN1", NF(orderMod, "releaseHeldOrders") === "" && p.length === 0, "held ตอนพักครัว · เลิกพักแล้วกวาด = ACCEPTED (ระบบรับ) + audit swept · วันก่อนกวาดด้วย (P2.14 Q2) · กวาดซ้ำ no-op", FX(NF(orderMod, "releaseHeldOrders") + (P8(p) || "ครบ")));
  });

  await step("HN2", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    await clearKitchen();
    must("เพดาน 1", await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: 1 }));
    must("CHAT autoAccept", await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CH.CHAT_A, autoAccept: true }));
    try {
      const blocker = await mkOrder("hn2b", CH.LM!, [ln("padthai", 1)], { externalRef: `LMB-${RAND}`, startStatus: "ACCEPTED" });
      const R = await mkOrder("hn2r", CH.GB!, [ln("salt", 2)], { externalRef: `GBR-${RAND}` });
      const c1 = await mkOrder("hn2c1", CH.CHAT_A!, [ln("padthai", 1)], { paymentState: "UNPAID" });
      const c2 = await mkOrder("hn2c2", CH.CHAT_A!, [ln("padthai", 1)], { paymentState: "UNPAID" });
      const c3 = await mkOrder("hn2c3", CH.CHAT_A!, [ln("padthai", 1)], { paymentState: "UNPAID" });
      for (const [lbl, id] of [["R", R], ["c1", c1], ["c2", c2], ["c3", c3]] as const) {
        const o = await orow(id);
        const hv = await heldEvs(id);
        if (o?.status !== "NEW" || hv.length !== 1 || hv[0]?.payload?.reason !== "backlog") p.push(`${lbl} ตอนรับเข้า ${ostr(o)} · held ${short(hv.map((e) => e.payload), 60)} (คาด NEW · held backlog 1)`);
      }
      must("done ตั๋วค้าง", await K("kdsTicketDone", ctxA(), A("OWNER"), { orderId: String((await roundsOf(blocker))[0]?.id ?? "none"), stationId: ST.hot }));
      // กวาดตอนอ่าน #1 (listOrders)
      const l1 = await O("listOrders", ctxA(), A("OWNER"), {});
      if (l1?.ok !== true) p.push(`listOrders → ${codeOf(l1)}`);
      const st1 = await Promise.all([R, c1, c2, c3].map(orow));
      const refusedEv = async () => (await heldEvs(R)).filter((e) => e.payload?.reason === "sale_refused");
      if (st1.map((o) => o?.status).join(",") !== "NEW,ACCEPTED,NEW,NEW") p.push(`หลังอ่าน #1 [R c1 c2 c3] = ${st1.map((o) => o?.status).join(",")} (คาด NEW,ACCEPTED,NEW,NEW)`);
      if ((await refusedEv()).length !== 1 || (await salesOf(R)).length !== 0) p.push(`R: held sale_refused ${(await refusedEv()).length} · บิล ${(await salesOf(R)).length} (คาด 1 · 0)`);
      // กวาดตอนอ่าน #2 (kdsBoard)
      await doneRoundsOf(c1);
      const b2 = await K("kdsBoard", ctxA(), A("OWNER"), { stationId: ST.hot });
      if (b2?.ok !== true) p.push(`kdsBoard → ${codeOf(b2)}`);
      const st2 = await Promise.all([R, c2, c3].map(orow));
      if (st2.map((o) => o?.status).join(",") !== "NEW,ACCEPTED,NEW") p.push(`หลังอ่าน #2 [R c2 c3] = ${st2.map((o) => o?.status).join(",")} (คาด NEW,ACCEPTED,NEW)`);
      // กวาดตอนอ่าน #3
      await doneRoundsOf(c2);
      await O("listOrders", ctxA(), A("OWNER"), {});
      const st3 = await Promise.all([R, c3].map(orow));
      if (st3.map((o) => o?.status).join(",") !== "NEW,ACCEPTED") p.push(`หลังอ่าน #3 [R c3] = ${st3.map((o) => o?.status).join(",")} (คาด NEW,ACCEPTED)`);
      const ts = await Promise.all([c1, c2, c3].map(async (id) => new Date((await orow(id))?.acceptedAt ?? 0).getTime()));
      if (!(ts[0]! > 0 && ts[0]! < ts[1]! && ts[1]! < ts[2]!)) p.push(`FIFO acceptedAt ${ts.join(" < ")}`);
      if ((await refusedEv()).length !== 1 || (await orow(R))?.acceptedByUserId !== null) p.push(`R ถูกลองซ้ำ: sale_refused ${(await refusedEv()).length} (คาด 1 · ไม่ลองซ้ำ)`);
      for (const id of [c1, c2, c3]) if ((await orow(id))?.acceptedByUserId !== null) p.push(`${id.slice(-6)} ผู้รับไม่ใช่ null`);
    } finally {
      await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: null });
      await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CH.CHAT_A, autoAccept: false });
    }
    chk("HN2", NF(orderMod, "releaseHeldOrders") === "" && p.length === 0, "เพดาน: held backlog · กวาดตอนอ่าน FIFO หยุดที่ติดเพดาน · บิลถูกปฏิเสธ = sale_refused ไม่ลองซ้ำ", FX(NF(orderMod, "releaseHeldOrders") + (P8(p) || "ครบ")));
  });

  await step("HN3", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    await clearKitchen();
    const ctl: Record<string, string> = {};
    let h = "";
    await menu.setKitchenPause(T, U.A, true, "qc hffu HN3");
    await menu.setKitchenPause(T, U.B, true, "qc hffu HN3");
    await menu.setKitchenPause(T2, U.X, true, "qc hffu HN3");
    try {
      h = await mkOrder("hn3", CH.GB!, [ln("padthai", 1)], { externalRef: `GB3-${RAND}` });
      ctl.off = await mkOrder("hn3off", CH.OFF!, [ln("padthai", 1)]);
      ctl.paused = await mkOrder("hn3pz", CH.PZ!, [ln("padthai", 1)]);
      ctl.manual = await mkOrder("hn3m", CH.LM!, [ln("padthai", 1)], { externalRef: `LMN-${RAND}`, startStatus: "NEW" });
      ctl.noheld = await mkOrder("hn3nh", CH.NH!, [ln("padthai", 1)]);
      ctl.unitB = await mkOrder("hn3b", CH.CB!, [{ name: "ของสาขา B", unitPriceSatang: 5000, qty: 1 }], {}, ctxB(DEVB));
      const x = await ingest(ctxX(), "OWNER2", { channelId: CH.CX, idempotencyKey: newKey("hn3x"), lines: [{ name: "ของร้าน T2", unitPriceSatang: 5000, qty: 1 }], customer: { name: "คุณ T2" }, fulfilment: "PICKUP" });
      ctl.t2 = x?.ok === true ? String(x.orderId) : "";
      if (!ctl.t2) p.push(`(fixture) ออเดอร์ร้าน T2 ${codeOf(x)} ${short(x?.message ?? "", 60)}`);
    } finally {
      await menu.setKitchenPause(T, U.A, false);
    }
    must("ปิดรับอัตโนมัติ OFF", await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CH.OFF, autoAccept: false }));
    must("พักรับ PZ", await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CH.PZ, pausedUntil: new Date(Date.now() + 2 * 3_600_000).toISOString() }));
    must("NH รับอัตโนมัติหลังรับเข้า", await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CH.NH, autoAccept: true }));
    const hv = await heldEvs(h);
    if ((await orow(h))?.status !== "NEW" || hv.length !== 1) p.push(`(fixture) h ${ostr(await orow(h))} held ${hv.length}`);
    if ((await heldEvs(ctl.manual!)).length || (await heldEvs(ctl.noheld!)).length) p.push("MANUAL/ช่องทางที่ปิดรับอัตโนมัติตอนรับเข้า มี held (คาด ไม่มี)");
    // แข่ง: กวาด ‖ พนักงานรับ (ธุรกรรมที่สามถือแถว PosOrder)
    const hl = await holdLock(LOCK_ORDER, [h], [() => release(), () => O("acceptOrder", ctxA(DEV1), A("STAFF"), { id: h })]);
    const [sw, ac] = hl.res;
    const o = await orow(h);
    const acc = (await evsOf(h)).filter((e) => e.toStatus === "ACCEPTED");
    const sales = await salesOf(h);
    for (const s of sales) MY_SALES.push(String(s.id));
    const rounds = await roundsOf(h);
    if (hl.blocked < 1) p.push("ไม่มีใครรอแถว PosOrder (จัดฉากไม่ถึง)");
    if (o?.status !== "ACCEPTED" || acc.length !== 1 || sales.length !== 1 || rounds.length !== 1) p.push(`แข่ง: ${ostr(o)} · accepted ${acc.length} · บิล ${sales.length} · รอบ ${rounds.length} (คาด ACCEPTED · 1 · 1 · 1) · กวาด ${codeOf(sw)} ${short(sw?.accepted, 40)} · รับ ${codeOf(ac)}`);
    if (sw?.ok === false) p.push(`releaseHeldOrders → ${codeOf(sw)} ${short(sw?.message ?? "", 60)}`);
    // ตัวควบคุม: กวาดอีกรอบ → ไม่มีตัวไหนถูกรับ
    const r2 = await release();
    if (r2?.ok === false) p.push(`กวาดรอบสอง → ${codeOf(r2)}`);
    await O("listOrders", ctxA(), A("OWNER"), {});
    for (const [k, id] of Object.entries(ctl)) {
      if (!id) continue;
      const c = await orow(id);
      if (c?.status !== "NEW") p.push(`ตัวควบคุม ${k} → ${ostr(c)} (คาด NEW ไม่ถูกกวาด)`);
    }
    await menu.setKitchenPause(T, U.B, false);
    await menu.setKitchenPause(T2, U.X, false);
    chk("HN3", NF(orderMod, "releaseHeldOrders") === "" && p.length === 0, "กวาด ‖ รับ = ผู้ชนะคนเดียว (บิล 1 รอบ 1) · ตัวควบคุม 6 แบบไม่ถูกกวาด", FX(NF(orderMod, "releaseHeldOrders") + (P8(p) || "ครบ")));
  });

  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 1): HN4 = เพดานกับตัวกวาดหลายตัวพร้อมกัน (R1 F2 · มติ fix1 ข้อ 2 · 6) —
  //   ลำดับบังคับด้วยธุรกรรมที่สามถือแถว PosOrder ของ o1: S1 ผ่านด่านเพดาน (0 ตั๋ว) แล้วรอแถว o1 · ระหว่างนั้นช่องทางของ o1 ปิดรับอัตโนมัติ
  //   (= รายการผู้สมัครของตัวกวาดตัวหลังไม่มี o1 · แบบจำลองรายการเก่า/ตัวแรกต่างกัน) · S2–S6 (releaseHeldOrders ×3 + listOrders ×2) เริ่ม ·
  //   ไม่มีล็อกต่อสาขา = S2 ผ่านด่านเพดาน (S1 ยังไม่ commit) แล้วรับ o2 ⇒ ACCEPTED 2 ที่เพดาน 1 (แดงก่อนแก้) · มีล็อก = S2–S6 รอ S1 แล้วติดเพดาน ◂
  await step("HN4", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    await clearKitchen();
    const ids: string[] = [];
    let ch1 = "";
    try {
      const sv = must("ช่องทาง H4", await call(chMod, "saveChannel", ctxA(), A("OWNER"), { code: "CUSTOM_H4", name: `เพดาน H4 ${RAND}`, payout: "PLATFORM", commissionBp: 2000, adapter: "NONE" }));
      ch1 = String(sv.channel?.id ?? "");
      must("H4 autoAccept", await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: ch1, autoAccept: true }));
      must("เพดาน 1", await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: 1 })); // ก่อนรับเข้า (ตั้งเพดาน = กวาดทันที)
      await menu.setKitchenPause(T, U.A, true, "qc hffu HN4");
      try {
        ids.push(await mkOrder("hn4o1", ch1, [ln("padthai", 1)]));
        ids.push(await mkOrder("hn4o2", CH.GB!, [ln("padthai", 1)], { externalRef: `GB4a-${RAND}` }));
        ids.push(await mkOrder("hn4o3", CH.GB!, [ln("padthai", 1)], { externalRef: `GB4b-${RAND}` }));
      } finally {
        await menu.setKitchenPause(T, U.A, false); // เลิกพักตรง (ไม่ผ่าน kitchenPauseAction = ไม่กวาด)
      }
      for (const id of ids) {
        const o = await orow(id);
        if (o?.status !== "NEW" || (await heldEvs(id)).length !== 1) throw new Error(`(fixture) ${id.slice(-6)} ${ostr(o)} held ${(await heldEvs(id)).length}`);
      }
      const [o1] = ids;
      const sweeps: Promise<Any>[] = [];
      const hl = await holdLock(LOCK_ORDER, [o1], [() => release()], async () => {
        // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-6 · CD-B6): การแก้ช่องทางย้ายออกนอกล็อกแถว o1 (ORD-6: ตัวกวาดถือ SalesChannel FOR SHARE ⇒ การแก้ช่องทางรอตัวกวาด) — ปิดรับอัตโนมัติหลังกวาด
        for (let i = 0; i < 5; i++) sweeps.push((i < 3 ? release() : O("listOrders", ctxA(), A("OWNER"), {})).catch((e: unknown) => ({ ok: false, code: errCode(e), threw: true })));
        // รอจน S2–S6 จบ (ไม่มีล็อกต่อสาขา) หรือรอคิวล็อกครบ 5 (มีล็อก) — แล้วปล่อยแถว o1
        const t0 = Date.now();
        let settled = 0;
        void Promise.allSettled(sweeps).then(() => (settled = 1));
        while (!settled && Date.now() - t0 < 10_000) {
          const w = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`)) as Any[])[0].n);
          if (w >= 6) break;
          await sleep(150);
        }
        await sleep(600);
      });
      const rs = await Promise.all(sweeps);
      must("H4 ปิดรับอัตโนมัติ (หลังกวาด)", await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: ch1, autoAccept: false })); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-6 · CD-B6)
      const sw1 = hl.res[0];
      if (hl.blocked < 1) p.push("S1 ไม่รอแถว PosOrder ของ o1 (จัดฉากไม่ถึง)");
      if (sw1?.ok === false || rs.some((r) => r?.ok === false)) p.push(`ตัวกวาด → ${[sw1, ...rs].map(codeOf).join(",")}`);
      const st = await Promise.all(ids.map(orow));
      const accN = st.filter((o) => o?.status === "ACCEPTED").length;
      let sales = 0;
      let rounds = 0;
      for (const id of ids) {
        const ss = await salesOf(id);
        for (const s of ss) MY_SALES.push(String(s.id));
        sales += ss.length;
        rounds += (await roundsOf(id)).length;
      }
      const bl = (await call(kdsMod, "kitchenBacklog", T, U.A)) as Any;
      const maxOpen = Array.isArray(bl) ? Math.max(0, ...bl.map((b: Any) => Number(b?.open ?? 0))) : -1;
      if (accN !== 1 || sales !== 1 || rounds !== 1) p.push(`6 ตัวกวาดพร้อมกันที่เพดาน 1: [o1 o2 o3] = ${st.map((o) => o?.status).join(",")} · ACCEPTED ${accN} · บิล ${sales} · รอบครัว ${rounds} (คาด 1 · 1 · 1)`);
      if (maxOpen < 0 || maxOpen > 1) p.push(`ตั๋วค้างสูงสุดต่อสถานี ${maxOpen} (คาด ≤ เพดาน 1)`);
      if (st[0]?.status !== "ACCEPTED") p.push(`o1 (S1 ผ่านด่านก่อน) → ${ostr(st[0])} (คาด ACCEPTED)`);
    } finally {
      await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: null });
      for (const id of ids) if ((await orow(id))?.status === "NEW") await O("rejectOrder", ctxA(DEV1), A("OWNER"), { id, reasonCode: "OTHER" });
    }
    chk("HN4", NF(orderMod, "releaseHeldOrders") === "" && p.length === 0, "6 ตัวกวาดพร้อมกันที่เพดาน 1 = รับ 1 · บิล 1 · รอบ 1 · ตั๋วค้าง ≤ เพดาน", FX(NF(orderMod, "releaseHeldOrders") + (P8(p) || "ครบ")));
  });

  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 2): HN5 = ตัวกวาดตัดสินเงินจากแถวช่องทางเก่า (hunter H1 · มติ fix2 ข้อ 1 · 3) —
  //   (ก) ออเดอร์ PLATFORM (PLATFORM_PAID) ถูกพักที่เพดาน 1 → เจ้าของเปลี่ยน payout ของช่องทาง CUSTOM เป็น DIRECT ก่อนกวาด → ตั๋วค้างเสร็จ → กวาด
  //       ⇒ ยัง NEW + held sale_refused 1 · บิล 0 · รอบ 0 (ก่อนแก้ = ACCEPTED ไม่มีบิล — รายได้แพลตฟอร์มหาย) · พนักงาน acceptOrder คู่ที่ไม่ตรง = CHANNEL_PAY_MISMATCH ไม่มีบิล
  //   (ข) ออเดอร์ PLATFORM ถูกพักที่เพดาน 1 → ตั๋วค้างเสร็จ → ธุรกรรมที่สามถือล็อกต่อสาขา posorder-release ให้ตัวกวาดอ่านผู้สมัคร (ช่องทางยังรับอัตโนมัติ) แล้วรอ ·
  //       ระหว่างนั้นช่องทางปิดรับอัตโนมัติ → ปล่อย ⇒ ยัง NEW · ไม่มี held ใหม่ · บิล 0 · รอบ 0 (ก่อนแก้ = รับด้วยแถวช่องทางเก่า) ◂
  await step("HN5", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    await clearKitchen();
    const ids: string[] = [];
    const LOCK_RELEASE = `SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext($1::text))) l`;
    try {
      const mkCh = async (code: string, label: string) => {
        const sv = must(`ช่องทาง ${code}`, await call(chMod, "saveChannel", ctxA(), A("OWNER"), { code, name: `${label} ${RAND}`, payout: "PLATFORM", commissionBp: 2000, adapter: "NONE" }));
        const id = String(sv.channel?.id ?? "");
        must(`${code} autoAccept`, await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: id, autoAccept: true }));
        return id;
      };
      const chP = await mkCh("CUSTOM_H5P", "เปลี่ยนวิธีรับเงิน H5");
      const chA = await mkCh("CUSTOM_H5A", "ปิดรับอัตโนมัติ H5");
      must("เพดาน 1", await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: 1 }));
      const blocker = async (lbl: string) => mkOrder(lbl, CH.LM!, [ln("padthai", 1)], { externalRef: `${lbl}-${RAND}`, startStatus: "ACCEPTED" });
      const heldAtCeiling = async (id: string, lbl: string) => {
        const o = await orow(id);
        const hv = await heldEvs(id);
        if (o?.status !== "NEW" || o?.paymentState !== "PLATFORM_PAID" || hv.length !== 1 || hv[0]?.payload?.reason !== "backlog") throw new Error(`(fixture) ${lbl} ${ostr(o)} ${o?.paymentState} held ${short(hv.map((e) => e.payload), 60)} (คาด NEW · PLATFORM_PAID · held backlog 1)`);
      };
      // (ก) payout PLATFORM → DIRECT ก่อนกวาด
      const b1 = await blocker("hn5b1");
      const oP = await mkOrder("hn5p", chP, [ln("padthai", 1)]);
      ids.push(oP);
      await heldAtCeiling(oP, "oP");
      must("H5P payout DIRECT", await call(chMod, "saveChannel", ctxA(), A("OWNER"), { id: chP, name: `เปลี่ยนวิธีรับเงิน H5 ${RAND}`, payout: "DIRECT" }));
      await doneRoundsOf(b1);
      const rP = await release();
      const oP1 = await orow(oP);
      const sP = await salesOf(oP);
      for (const s of sP) MY_SALES.push(String(s.id));
      const refusedP = (await heldEvs(oP)).filter((e) => e.payload?.reason === "sale_refused").length;
      const roundsP = (await roundsOf(oP)).length;
      if (rP?.ok === false) p.push(`(ก) releaseHeldOrders → ${codeOf(rP)}`);
      if (oP1?.status !== "NEW" || refusedP !== 1 || sP.length !== 0 || roundsP !== 0 || (Array.isArray(rP?.accepted) && rP.accepted.includes(oP)))
        p.push(`(ก) payout เปลี่ยนเป็น DIRECT ก่อนกวาด → ${ostr(oP1)} · held sale_refused ${refusedP} · บิล ${sP.length} · รอบครัว ${roundsP} · accepted ${short(rP?.accepted, 40)} (คาด NEW · 1 · 0 · 0 · ไม่มี)`);
      const ac = await O("acceptOrder", ctxA(DEV1), A("STAFF"), { id: oP });
      const oP2 = await orow(oP);
      const sP2 = await salesOf(oP);
      for (const s of sP2) MY_SALES.push(String(s.id));
      if (!refused(ac, "CHANNEL_PAY_MISMATCH") || oP2?.status !== "NEW" || sP2.length !== 0) p.push(`(ก) พนักงานรับคู่ที่ไม่ตรง → ${codeOf(ac)} · ${ostr(oP2)} · บิล ${sP2.length} (คาด CHANNEL_PAY_MISMATCH · NEW · 0)`);
      // (ข) autoAccept ปิดระหว่างตัวกวาดรอล็อกต่อสาขา
      await clearKitchen();
      const b2 = await blocker("hn5b2");
      const oA = await mkOrder("hn5a", chA, [ln("padthai", 1)]);
      ids.push(oA);
      await heldAtCeiling(oA, "oA");
      await doneRoundsOf(b2);
      // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-2 · CD-B6): ตัวกวาดทางอ่านใช้ try-lock (ORD-2) — ระหว่างธุรกรรมที่สามถือ posorder-release ตัวกวาดคืนทันที swept:false ไม่รับ ·
      //   ปล่อยล็อกแล้วเรียกครั้งถัดไป = รับออเดอร์ (บิล 1 · รอบครัว 1) — แทนฉาก "รอล็อกแล้วช่องทางปิดรับ" ที่ try-lock ทำให้เกิดไม่ได้
      let rBusy: Any = null;
      let busyMs = -1;
      await holdLock(LOCK_RELEASE, [`posorder-release:${T}:${U.A}`], [], async () => {
        const t0 = Date.now();
        rBusy = await release();
        busyMs = Date.now() - t0;
      });
      const oA0 = await orow(oA);
      if (rBusy?.swept !== false || (Array.isArray(rBusy?.accepted) && rBusy.accepted.length) || busyMs < 0 || busyMs > 2000 || oA0?.status !== "NEW")
        p.push(`(ข) ตัวกวาดระหว่างล็อกถูกถือ → ${short(rBusy, 60)} ${busyMs} ms · ${ostr(oA0)} (คาด swept:false · ไม่รับ · < 2 วิ · NEW)`);
      const rNext = await release();
      const oA1 = await orow(oA);
      const sA = await salesOf(oA);
      for (const s of sA) MY_SALES.push(String(s.id));
      const roundsA = (await roundsOf(oA)).length;
      if (!(Array.isArray(rNext?.accepted) && rNext.accepted.includes(oA)) || oA1?.status !== "ACCEPTED" || sA.length !== 1 || roundsA !== 1)
        p.push(`(ข) ครั้งถัดไปหลังปล่อยล็อก → ${short(rNext, 60)} · ${ostr(oA1)} · บิล ${sA.length} · รอบครัว ${roundsA} (คาด รับ · ACCEPTED · 1 · 1)`);
    } finally {
      await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: null });
      for (const id of ids) if ((await orow(id))?.status === "NEW") await O("rejectOrder", ctxA(DEV1), A("OWNER"), { id, reasonCode: "OTHER" });
    }
    chk("HN5", NF(orderMod, "releaseHeldOrders") === "" && p.length === 0, "ช่องทางเปลี่ยนก่อนกวาด: payout ไม่ตรง = NEW + sale_refused ไม่มีบิล · ล็อกถูกถือ = swept:false ไม่รับ แล้วครั้งถัดไปรับ (ORD-2) · ไม่มีบิลจากคู่ที่ไม่ตรง" /* ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-2 · CD-B6) */, FX(NF(orderMod, "releaseHeldOrders") + (P8(p) || "ครบ")));
  });

  // ════════ VO CN HU LK2 (ออเดอร์ LINEMAN · บิล PLATFORM) ════════
  console.log("\n── VO CN HU LK2 ──");
  await step("VO1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const raw = rd(F.consumers);
    const s = stripComments(raw);
    const k0 = s.indexOf('"pos.sale.voided":');
    const k1 = s.indexOf('"pos.sale.refunded":', k0);
    const blk = k0 < 0 ? "" : s.slice(k0, k1 < 0 ? undefined : k1);
    const ft = blk.indexOf("if (failed) throw err");
    const main = ft < 0 ? "" : blk.slice(0, ft);
    const tail = ft < 0 ? blk : blk.slice(ft);
    if (!/\bposOrderOnSaleVoided\s*\(|\borders\.onSaleVoided\s*\(/.test(main)) p.push("ตัวรับออเดอร์ไม่อยู่ในสายหลัก (ก่อน if (failed) throw err)");
    if (/\bposOrderOnSaleVoided\b/.test(tail)) p.push("posOrderOnSaleVoided ยังเป็น compose ตัวท้าย (ล้ม = WARN กลืน)");
    const rl = raw.split("\n");
    const keyAt = rl.findIndex((l) => l.includes('"pos.sale.voided":'));
    const endAt = rl.findIndex((l, i) => i > keyAt && l.includes('"pos.sale.refunded":'));
    const jAt = rl.findIndex((l) => /POS HF-FU\s*▸\s*j\b/.test(l));
    if (jAt < 0 || jAt < keyAt || (endAt > 0 && jAt > endAt)) p.push(`รอยต่อ POS HF-FU ▸ j ${jAt < 0 ? "ไม่มี" : "ไม่อยู่ใต้คีย์ในตัวรับ pos.sale.voided"}`);
    // พฤติกรรม
    const lm = await readyLm("vo1");
    const v = await voidSale(lm.saleId);
    await drain();
    const o = await orow(lm.id);
    const canc = async () => (await evsOf(lm.id)).filter((e) => e.toStatus === "CANCELLED").length;
    if (v?.ok !== true || o?.status !== "CANCELLED" || o?.paymentState !== "REFUNDED") p.push(`void → ${codeOf(v)} · ออเดอร์ ${ostr(o)} ${o?.paymentState} (คาด CANCELLED REFUNDED)`);
    const h = consMod?.consumers?.["pos.sale.voided"];
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && e.payload.saleId === lm.saleId);
    if (!evs.length || typeof h !== "function") p.push(`(fixture) event voided ${evs.length} · consumer ${typeof h}`);
    else
      for (const ev of evs)
        for (let i = 0; i < 2; i++)
          try {
            await h(ev);
          } catch (e) {
            p.push(`เล่นซ้ำ ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
    const o2 = await orow(lm.id);
    if ((await canc()) !== 1 || o2?.version !== o?.version) p.push(`เล่นซ้ำ → cancelled ${await canc()} · version ${o?.version}→${o2?.version} (คาด 1 · เท่าเดิม)`);
    chk("VO1", p.length === 0, "ขั้นออเดอร์อยู่ในสายหลักใต้คีย์ · void → CANCELLED REFUNDED · เล่นซ้ำไม่เพิ่ม", FX(P8(p) || "ครบ"));
  });

  {
    // CN1 + CN2 ใช้ฉากเดียว (บิล void ระหว่างที่ตัวรับถูกกั้นที่แถว PosOrder)
    const pc1: string[] = [];
    const pc2: string[] = [];
    let crashed = "";
    try {
      if (fx) throw new Error(`fixture ${fx}`);
      const ss = (r: Any) => (r?.ok === true && isRecord(r.order) ? (r.order.saleStatus === undefined ? "ไม่มีช่อง" : r.order.saleStatus) : `ผล ${codeOf(r)}`);
      const lm = await readyLm("cn");
      const g0 = await O("getOrder", ctxA(), A("OWNER"), { id: lm.id });
      if (ss(g0) !== "PAID") pc1.push(`บิล PAID → saleStatus ${short(ss(g0))} (คาด PAID)`);
      const nos = await mkOrder("cnnone", CH.CHAT_A!, [ln("padthai", 1)], { paymentState: "UNPAID" });
      const g1 = await O("getOrder", ctxA(), A("OWNER"), { id: nos });
      if (ss(g1) !== null) pc1.push(`ไม่มีบิล → saleStatus ${short(ss(g1))} (คาด null)`);
      const panel = stripComments(rd(F.orderPanel));
      const nc = /const\s+noCancel\s*=[^\n]*/.exec(panel)?.[0] ?? "";
      if (!/saleStatus\s*===\s*["']VOIDED["']/.test(nc)) pc1.push("OrderPanel noCancel ไม่อ่าน saleStatus === \"VOIDED\"");
      let gMid: Any = null;
      let midStatus = "";
      let vr: Any = null;
      // 🔴 ห้าม await drain() ระหว่างถือล็อก (ตัวรับรอแถวนี้ = รอตัวเอง) — การระบายพื้นหลังของ void (scheduleDrain) ไปรอที่แถว PosOrder เอง
      const hl = await holdLock(LOCK_ORDER, [lm.id], [], async (waitBlocked) => {
        vr = await voidSale(lm.saleId);
        await waitBlocked(1, 15_000);
        gMid = await O("getOrder", ctxA(), A("OWNER"), { id: lm.id });
        midStatus = String((await orow(lm.id))?.status ?? "");
      });
      void hl;
      if (vr?.ok !== true) pc1.push(`(fixture) void → ${codeOf(vr)} ${short(vr?.message ?? "", 60)}`);
      if (ss(gMid) !== "VOIDED" || midStatus === "CANCELLED") pc1.push(`void แล้วตัวรับยังไม่ถึง → saleStatus ${short(ss(gMid))} · ออเดอร์ ${midStatus} (คาด VOIDED · ยังไม่ปิด)`);
      // CN2: STAFF (ไม่มี pos.sale.void) ยกเลิกระหว่างที่ตัวรับยังถูกกั้น
      const lm2 = await readyLm("cn2");
      const box2: { p: Promise<Any> | null } = { p: null };
      const hl2 = await holdLock(LOCK_ORDER, [lm2.id], [], async (waitBlocked) => {
        const v2 = await voidSale(lm2.saleId);
        if (v2?.ok !== true) pc2.push(`(fixture) void → ${codeOf(v2)}`);
        await waitBlocked(1, 15_000);
        const before = await waitBlocked(99, 10);
        const pr = O("cancelOrder", ctxA(DEV1), A("STAFF"), { id: lm2.id, reason: "ลูกค้าไม่มารับ" });
        await waitBlocked(before + 1, 8_000);
        box2.p = pr;
      });
      void hl2;
      const cr = await box2.p;
      await drain();
      const o = await orow(lm2.id);
      const sale = await P.posSale.findUnique({ where: { id: lm2.saleId } }).catch(() => null);
      const vEvs = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && e.payload.saleId === lm2.saleId);
      const canc = (await evsOf(lm2.id)).filter((e) => e.toStatus === "CANCELLED");
      if (US.STAFF?.perms["pos.sale.void"]) pc2.push("(fixture) STAFF มี pos.sale.void");
      if (cr?.ok !== true) pc2.push(`STAFF cancelOrder → ${codeOf(cr)} ${short(cr?.message ?? "", 60)} (คาด ok)`);
      if (o?.status !== "CANCELLED" || o?.paymentState !== "REFUNDED" || sale?.status !== "VOIDED" || vEvs.length !== 1 || canc.length !== 1) pc2.push(`ออเดอร์ ${ostr(o)} ${o?.paymentState} · บิล ${sale?.status} · voided ${vEvs.length} · cancelled ${canc.length} (คาด CANCELLED REFUNDED · VOIDED · 1 · 1)`);
    } catch (e) {
      crashed = `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`;
    }
    chk("CN1", !crashed && pc1.length === 0, "saleStatus PAID/null/VOIDED · OrderPanel อ่าน saleStatus", FX(crashed || P8(pc1) || "ครบ"));
    chk("CN2", !crashed && pc2.length === 0, "STAFF ยกเลิกออเดอร์ของบิลที่ void แล้ว = ok · void ครั้งเดียว · cancelled 1", FX(crashed || P8(pc2) || "ครบ"));
  }

  await step("HU1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const src = srcOf(F.order);
    const wf = fnBody(src, "webOrderForUpdate");
    const sqlW = (/\$queryRaw[^`]*`([^`]*)`/.exec(wf)?.[1] ?? "");
    if (!/"tenantId"/.test(sqlW)) p.push(`webOrderForUpdate SQL ไม่มี "tenantId" (${short(sqlW, 80)})`);
    const stp = fnBody(src, "step");
    const mi = stp.search(/\bmutate\s*\(/);
    if (mi < 0 || !/FOR\s+SHARE/i.test(stp.slice(mi)) || !/"PosSale"/.test(stp.slice(mi))) p.push("ขั้นส่งมอบไม่อ่านสถานะบิลในธุรกรรม (FOR SHARE \"PosSale\" ใน mutate)");
    const lm = await readyLm("hu1");
    let vr: Any = null;
    const hl = await holdLock(LOCK_ORDER, [lm.id], [() => O("handOver", ctxA(DEV1), A("OWNER"), { id: lm.id })], async (waitBlocked) => {
      vr = await voidSale(lm.saleId);
      await waitBlocked(2, 6_000);
    });
    const [ho] = hl.res;
    await drain();
    const o = await orow(lm.id);
    const handed = (await evsOf(lm.id)).filter((e) => e.toStatus === "HANDED");
    if (hl.blocked < 1) p.push("handOver ไม่รอแถว PosOrder (จัดฉากไม่ถึง)");
    if (vr?.ok !== true) p.push(`(fixture) void → ${codeOf(vr)} ${short(vr?.message ?? "", 60)}`);
    if (!refused(ho, "ORDER_STATE_INVALID") || ho?.messageKey !== "orders.errors.saleVoided") p.push(`handOver หลัง void commit → ${codeOf(ho)} ${short(ho?.messageKey ?? ho?.message ?? "", 60)} (คาด ORDER_STATE_INVALID · orders.errors.saleVoided)`);
    if (o?.status === "HANDED" || handed.length) p.push(`ออเดอร์ถูกส่งมอบบนบิลที่ void แล้ว (${ostr(o)})`);
    else if (o?.status !== "CANCELLED" || o?.paymentState !== "REFUNDED") p.push(`หลังระบาย ${ostr(o)} ${o?.paymentState} (คาด CANCELLED REFUNDED)`);
    chk("HU1", p.length === 0, "อ่านบิลในธุรกรรมส่งมอบ · tenant predicate · void ระหว่างทาง = saleVoided ไม่ HANDED", FX(P8(p) || "ครบ"));
  });

  await step("LK2", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const base = (o: Any) => ({ channelId: CH.CHAT_A, idempotencyKey: newKey("lk2"), lines: [ln("padthai", 1)], customer: { name: "คุณมั่ว", ...(o.customer ?? {}) }, fulfilment: "PICKUP", paymentState: "UNPAID", ...(o.extra ?? {}) });
    const cases: [string, Any, string][] = [
      ["memberId", { customer: { memberId: `bogus-${RAND}` } }, "orders.errors.memberNotFound"],
      ["partyId", { customer: { partyId: `bogus-${RAND}` } }, "orders.errors.partyNotFound"],
      ["chatConversationId", { extra: { chatConversationId: `bogus-${RAND}` } }, "orders.errors.conversationNotFound"],
    ];
    const n0 = Number(await P.posOrder.count({ where: { tenantId: T } }).catch(() => -1));
    for (const [lbl, o, key] of cases) {
      const r = await ingest(ctxA(DEV1), "OWNER", base(o));
      if (!refused(r, "VALIDATION") || r?.messageKey !== key) p.push(`${lbl} มั่ว → ${codeOf(r)} messageKey ${short(r?.messageKey)} (คาด VALIDATION ${key})`);
    }
    if (Number(await P.posOrder.count({ where: { tenantId: T } }).catch(() => -1)) !== n0) p.push("มีออเดอร์ถูกสร้าง");
    // F3: ตัวอ่านของโมดูล
    const oua = srcOf(F.orderUiActions);
    if (/\bprisma\./.test(oua)) p.push("order-ui-actions.ts ยังอ่าน prisma ตรง (F3)");
    if (!/\borderChannelSettings\s*\(/.test(oua)) p.push("order-ui-actions.ts ไม่เรียก orderChannelSettings");
    const ok = await O("orderChannelSettings", ctxA(), A("OWNER"));
    const items = (Array.isArray(ok?.items) ? ok.items : []) as Any[];
    const chat = items.find((x) => x.id === CH.CHAT_A);
    const pz = items.find((x) => x.id === CH.PZ);
    if (ok?.ok !== true || !chat || typeof chat.autoAccept !== "boolean" || !("prepMinutes" in chat) || chat.pausedUntil !== null || typeof pz?.pausedUntil !== "string") p.push(`orderChannelSettings → ${codeOf(ok)} ${short(chat ?? items.slice(0, 1), 100)} · PZ ${short(pz?.pausedUntil)}`);
    if (items.some((x) => x.id === CH.CB)) p.push("orderChannelSettings มีช่องทางของสาขา B");
    const np = await O("orderChannelSettings", ctxA(), A("NOPERM"));
    if (!refused(np, "PERMISSION_DENIED")) p.push(`NOPERM → ${codeOf(np)} (คาด PERMISSION_DENIED)`);
    const xt = await O("orderChannelSettings", { tenantId: T, systemId: S.POS, unitId: U.X }, A("OWNER"));
    if (!refused(xt, "NOT_FOUND")) p.push(`สาขาของร้าน T2 ใต้ ctx ร้าน T → ${codeOf(xt)} (คาด NOT_FOUND)`);
    chk("LK2", NF(orderMod, "orderChannelSettings") === "" && p.length === 0, "messageKey ต่อกรณี · ตัวอ่านค่าตั้งช่องทางของโมดูล · action ไม่มี prisma", FX(NF(orderMod, "orderChannelSettings") + (P8(p) || "ครบ")));
  });

  // ════════ โต๊ะ: OD DM EQ2 SM ════════
  console.log("\n── โต๊ะ: OD DM EQ2 SM ──");
  const mkT = async (name: string, zone = ZONE, unit = U.A!): Promise<string> => {
    const k = `${unit === U.A ? "A" : "B"}:${name}`;
    if (TB[k]) return TB[k]!;
    const r = must(`table ${name}`, await rtable.createTable(T, unit, { zoneId: zone, name, seats: 4 }));
    TB[k] = r.id;
    return r.id;
  };
  const tbl = (fn: string, ...args: unknown[]) => call(tableMod, fn, ...args);
  const sp = (fn: string, ...args: unknown[]) => call(splitMod, fn, ...args);
  const hold = (sessionId: string | null, lines: Any[], ctx: Any = ctxA(DEV1)): Promise<Any> =>
    call(heldMod, "holdRegisterCart", ctx, A("OWNER"), { cart: { lines }, ...(sessionId ? { tableSessionId: sessionId, newDraft: true } : {}) });
  const heldId = (h: Any) => String(h?.heldCart?.id ?? h?.id ?? "");
  const heldRow = async (id: string): Promise<Any> => (id ? P.posHeldCart.findUnique({ where: { id } }).catch(() => null) : null);
  const sessRow = async (id: string): Promise<Any> => (id ? P.tableSession.findUnique({ where: { id } }).catch(() => null) : null);
  type Seat = { sid: string; it: Record<string, string>; orderId: string };
  const KEY_OF_PP = (pid: string) => Object.entries(PP).find(([, v]) => v === pid)?.[0] ?? pid.slice(-6);
  const open = async (name: string, o: { guestCount?: number; ctx?: Any; unit?: string; zone?: string } = {}): Promise<string> => {
    const tid = await mkT(name, o.zone ?? ZONE, o.unit ?? U.A!);
    const r = await tbl("registerOpenTable", o.ctx ?? ctxA(), A("OWNER"), { tableId: tid, guestCount: o.guestCount ?? 2 });
    if (r?.ok !== true || !r.sessionId) throw new Error(`เปิดโต๊ะ ${name}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    return String(r.sessionId);
  };
  const seat = async (name: string, lines: Any[]): Promise<Seat> => {
    const sid = await open(name);
    const h = await hold(sid, lines);
    const s = await tbl("registerSendTableRound", ctxA(DEV1), A("OWNER"), { tableSessionId: sid, heldCartId: heldId(h) });
    if (s?.ok !== true) throw new Error(`ส่งรอบ ${name}: พัก ${codeOf(h)} · ส่ง ${codeOf(s)} ${short(s?.message ?? "", 60)}`);
    const it: Record<string, string> = {};
    for (const row of (await P.restaurantOrderItem.findMany({ where: { id: { in: ((s.itemIds ?? []) as string[]).map(String) } } }).catch(() => [])) as Any[]) it[KEY_OF_PP(String(row.productId ?? ""))] = row.id;
    return { sid, it, orderId: String(s.orderId) };
  };
  const wq = (sessionId: string) => call(register, "quoteRegisterCart", ctxA(DEV1), A("OWNER"), { lines: [], tableSessionId: sessionId });
  const hashOf = async (sessionId: string): Promise<string> => String((await wq(sessionId))?.table?.itemsHash ?? "none");
  const mkSplit = async (sessionId: string, body: Any): Promise<Any> => sp("registerSplitTable", ctxA(DEV1), A("OWNER"), { tableSessionId: sessionId, expectedItemsHash: await hashOf(sessionId), ...body });
  const splitOf = (r: Any): Any => (r?.ok === true && isRecord(r.split) ? r.split : null);
  const partOf = (split: Any, no: number): Any => ((split?.parts ?? []) as Any[]).find((x) => Number(x?.no) === no) ?? null;
  const pq = (partId: string) => call(register, "quoteRegisterCart", ctxA(DEV1), A("OWNER"), { lines: [], tableSplitPartId: partId || "none" });
  const payPart = async (split: Any, no: number, methods?: (grand: number) => Any[]): Promise<{ saleId: string; r: Any }> => {
    const pid = String(partOf(split, no)?.id ?? "");
    const q = await pq(pid);
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const pm = methods ? methods(grand) : [{ type: "CASH", amountSatang: grand }];
    const cash = sum(pm.filter((x: Any) => x.type === "CASH").map((x: Any) => Number(x.amountSatang)));
    const r = await call(register, "submitRegisterSale", ctxA(DEV1), A("OWNER"), { lines: [], tableSplitPartId: pid || "none", expectedSplitVersion: Number(q?.split?.version ?? split?.version ?? 1), idempotencyKey: newKey("pp"), expectedGrandTotalSatang: grand, payMethods: pm, ...(cash ? { cashReceivedSatang: cash } : {}) });
    const saleId = r?.ok === true ? String(r.saleId) : "";
    if (saleId) MY_SALES.push(saleId);
    return { saleId, r };
  };
  const discards = async (): Promise<Any[]> => auditsOf(AUDIT_DISCARD);

  {
    // OD1 + OD2 (ฉากเดียว)
    const p1: string[] = [];
    const p2: string[] = [];
    let crashed = "";
    try {
      if (fx) throw new Error(`fixture ${fx}`);
      const s1 = await open("OD1");
      const d1 = heldId(await hold(s1, [ln("padthai", 1)]));
      const c1 = await rtable.closeSession(T, U.A, s1);
      const s2 = await open("OD2");
      const d2 = heldId(await hold(s2, [ln("kaprao", 1)]));
      const s3 = await open("OD3");
      const m = await rtable.mergeSession(T, U.A, s3, s2);
      const s4 = await open("OD4");
      const d4 = heldId(await hold(s4, [ln("chayen", 1)]));
      const dr = heldId(await hold(null, [ln("water", 1)]));
      const sb = await open("ODB", { ctx: ctxB(), unit: U.B!, zone: ZONE_B });
      const db = heldId(await hold(sb, [{ name: "ของสาขา B", unitPriceSatang: 5000, qty: 1 }], ctxB(DEVB)));
      const cb = await rtable.closeSession(T, U.B, sb);
      if (!d1 || !d2 || !d4 || !dr || !db || c1?.ok !== true || m?.ok !== true || cb?.ok !== true) throw new Error(`(fixture) ร่าง ${[d1, d2, d4, dr, db].map((x) => (x ? "✓" : "✗")).join("")} · ปิด ${short(c1)} · รวม ${short(m)} · ปิด B ${short(cb)}`);
      const v0 = Object.fromEntries(await Promise.all([d4, dr, db].map(async (id) => [id, (await heldRow(id))?.version])));
      const a0 = (await discards()).length;
      // สถิต
      if (!/\bsweepOrphanTableDrafts\s*\(/.test(fnBody(srcOf(F.table), "registerTables"))) p1.push("registerTables ไม่เรียก sweepOrphanTableDrafts");
      const f1 = await tbl("registerTables", ctxA(), A("OWNER"));
      if (f1?.ok !== true) p1.push(`registerTables → ${codeOf(f1)}`);
      const r1 = await heldRow(d1);
      const r2 = await heldRow(d2);
      if (r1?.status !== "DISCARDED" || r2?.status !== "DISCARDED") p1.push(`ร่างของ session ที่ปิด (${(await sessRow(s1))?.status}) ${r1?.status} · ของ session MERGED ${r2?.status} (คาด DISCARDED ทั้งคู่)`);
      const au = (await discards()).slice(a0);
      for (const [id, sid] of [[d1, s1], [d2, s2]] as const) {
        const x = au.filter((y) => y.targetId === id);
        if (x.length !== 1 || x[0]?.actorType !== "SYSTEM" || x[0]?.after?.via !== "session_not_open" || x[0]?.after?.status !== "DISCARDED" || x[0]?.after?.tableSessionId !== sid || x[0]?.before?.status !== "HELD") p1.push(`audit ร่าง ${id.slice(-6)} ${x.length} ${short(x.map((y) => [y.actorType, y.before?.status, y.after]), 140)}`);
      }
      const f2 = await tbl("registerTables", ctxA(), A("OWNER"));
      if (f2?.ok !== true || (await discards()).length !== a0 + 2) p1.push(`อ่านซ้ำ → ${codeOf(f2)} · audit +${(await discards()).length - a0} (คาด +2 รวม)`);
      // OD2 PAR
      for (const [lbl, id] of [["session OPEN", d4], ["ลิ้นชัก", dr], ["สาขา B", db]] as const) {
        const r = await heldRow(id);
        if (r?.status !== "HELD" || r?.version !== v0[id]) p2.push(`${lbl} → ${r?.status} v${r?.version} (คาด HELD v${v0[id]})`);
      }
    } catch (e) {
      crashed = `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`;
    }
    chk("OD1", !crashed && NF(heldMod, "sweepOrphanTableDrafts") === "" && p1.length === 0, "ร่างของ session ปิด/MERGED → DISCARDED + audit SYSTEM session_not_open ครั้งเดียว", FX(crashed || NF(heldMod, "sweepOrphanTableDrafts") + (P8(p1) || "ครบ")));
    chk("OD2", !crashed && p2.length === 0, "ร่าง OPEN · ลิ้นชัก · สาขาอื่น ไม่ถูกแตะ", FX(crashed || P8(p2) || "ครบ"));
  }

  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 1): OD3 = ตัวกวาดร่างกำพร้า ‖ void ที่เปิด session กลับ (R1 F1 · มติ fix1 ข้อ 1 · 6) —
  //   session มีรอบร่าง HELD · จ่ายรายการโต๊ะครบ (มีร่าง ⇒ session ยัง OPEN) · หน้าเดิมปิดโต๊ะ ⇒ CLOSED (ร่างยัง HELD = กำพร้า) ·
  //   ธุรกรรมที่สามถือแถว PosHeldCart ของร่าง → registerTables (ตัวกวาดอ่าน session = CLOSED นอกธุรกรรมแล้วรอแถวร่าง) →
  //   ระหว่างรอ void บิลโต๊ะ + ระบายคิว (ตัวรับ void เปิด session กลับ OPEN) → ปล่อย ⇒ ร่างต้องยัง HELD (version เดิม · ไม่มี audit ทิ้ง) ◂
  await step("OD3", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const sv = await seat("OD3r", [ln("water", 1)]);
    const d = heldId(await hold(sv.sid, [ln("padthai", 1)]));
    const q = await wq(sv.sid);
    const g = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const pay = await call(register, "submitRegisterSale", ctxA(DEV1), A("OWNER"), {
      lines: [], tableSessionId: sv.sid, expectedTableItemsHash: q?.table?.itemsHash ?? "none",
      idempotencyKey: newKey("od3"), expectedGrandTotalSatang: g, payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g,
    });
    const saleId = pay?.ok === true ? String(pay.saleId) : "";
    if (saleId) MY_SALES.push(saleId);
    const cl = await rtable.closeSession(T, U.A, sv.sid);
    await drain();
    const s0 = await sessRow(sv.sid);
    const r0 = await heldRow(d);
    if (!d || !saleId || cl?.ok !== true || s0?.status !== "CLOSED" || r0?.status !== "HELD") throw new Error(`(fixture) ร่าง ${d ? "✓" : "✗"} · จ่าย ${codeOf(pay)} ${short(pay?.message ?? "", 60)} · ปิด ${short(cl)} · session ${s0?.status} · ร่าง ${r0?.status}`);
    const a0 = (await discards()).filter((x) => x.targetId === d).length;
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-4 · CD-B6): ORD-4 ตัวกวาดล็อก session ก่อนร่าง ⇒ ฉากใหม่ = ธุรกรรมที่สามถือแถว session (เปิดกลับ OPEN ในธุรกรรมนั้น ·
    //   แบบที่ตัวรับ void ทำ) → registerTables (ตัวกวาดอ่าน CLOSED แล้วรอ session) → ปล่อย ⇒ ร่างต้องยัง HELD · แล้ว void บิลโต๊ะตามจริง (session คง OPEN)
    const LOCK_SESSION_REOPEN = `UPDATE "TableSession" SET status = 'OPEN', "closedAt" = NULL WHERE id = $1 RETURNING id`;
    const hl = await holdLock(LOCK_SESSION_REOPEN, [sv.sid], [() => tbl("registerTables", ctxA(), A("OWNER"))]);
    const f = hl.res[0];
    const r1 = await heldRow(d);
    const a1 = (await discards()).filter((x) => x.targetId === d).length;
    const vd = await voidSale(saleId);
    await drain();
    if (hl.blocked < 1) p.push("ตัวกวาดไม่รอแถว session (จัดฉากไม่ถึง)");
    if (vd?.ok !== true) p.push(`(ฉาก) void ${codeOf(vd)} ${short(vd?.message ?? "", 60)} (คาด ok)`);
    if (f?.ok !== true) p.push(`registerTables → ${codeOf(f)}`);
    if (r1?.status !== "HELD" || r1?.version !== r0?.version || a1 !== a0) p.push(`ร่างของ session ที่ถูกเปิดกลับ → ${r1?.status} v${r1?.version} (คาด HELD v${r0?.version}) · audit ทิ้ง +${a1 - a0} (คาด 0)`);
    if ((await sessRow(sv.sid))?.status !== "OPEN") p.push(`session หลังจบ ${(await sessRow(sv.sid))?.status} (คาด OPEN)`);
    chk("OD3", NF(heldMod, "sweepOrphanTableDrafts") === "" && p.length === 0, "ตัวกวาด ‖ void เปิด session กลับ = ร่างยัง HELD", FX(NF(heldMod, "sweepOrphanTableDrafts") + (P8(p) || "ครบ")));
  });

  await step("DM1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const into = await seat("DMi", [ln("kaprao", 1)]);
    const from = await seat("DMf", [ln("chayen", 1), ln("padthai", 1)]);
    const pl = splitOf(await mkSplit(from.sid, { mode: "EQUAL", partCount: 2 }));
    await hold(from.sid, [ln("water", 1)]); // รอบร่าง ⇒ จ่ายครบแล้ว session ต้นทางยัง OPEN
    const a = await payPart(pl, 1);
    const b = await payPart(pl, 2);
    const row0 = pl ? await P.posTableSplit.findUnique({ where: { id: String(pl.splitId) } }).catch(() => null) : null;
    if (!a.saleId || !b.saleId || row0?.status !== "DONE" || (await sessRow(from.sid))?.status !== "OPEN") throw new Error(`(fixture) แผน DONE ${codeOf(a.r)}/${codeOf(b.r)} · ${row0?.status} · ต้นทาง ${(await sessRow(from.sid))?.status}`);
    const g = await sp("legacyMergeSplitGuard", { tenantId: T, unitId: U.A, intoSessionId: into.sid, fromSessionId: from.sid });
    const ord = await P.restaurantOrder.findUnique({ where: { id: from.orderId } }).catch(() => null);
    const row1 = await P.posTableSplit.findUnique({ where: { id: String(pl.splitId) } }).catch(() => null);
    if (g?.ok !== false || typeof g?.reason !== "string" || !g.reason.trim()) p.push(`แผน DONE ฝั่งต้นทาง → ตัวกัน ${short(g, 80)} (คาด {ok:false, reason})`);
    if (ord?.sessionId !== from.sid || (await sessRow(from.sid))?.status !== "OPEN" || row1?.status !== "DONE" || row1?.sessionId !== from.sid) p.push(`ไม่เขียน: ออเดอร์ ${ord?.sessionId === from.sid ? "เดิม" : "ย้าย"} · ต้นทาง ${(await sessRow(from.sid))?.status} · แผน ${row1?.status} ${row1?.sessionId === from.sid ? "เดิม" : "ย้าย"}`);
    const i2 = await seat("DMni", [ln("kaprao", 1)]);
    const f2 = await seat("DMnf", [ln("chayen", 1)]);
    const g2 = await sp("legacyMergeSplitGuard", { tenantId: T, unitId: U.A, intoSessionId: i2.sid, fromSessionId: f2.sid });
    const m2 = g2?.ok === true ? await rtable.mergeSession(T, U.A, i2.sid, f2.sid) : null;
    if (g2?.ok !== true || JSON.stringify(m2) !== JSON.stringify({ ok: true }) || (await sessRow(f2.sid))?.status !== "MERGED") p.push(`(ตัวควบคุม) ไม่มีแผน → ตัวกัน ${short(g2, 40)} · รวม ${short(m2, 40)}`);
    chk("DM1", p.length === 0, "แผน DONE ฝั่งต้นทาง = ปฏิเสธ ไม่เขียน · ไม่มีแผน = รวมได้", FX(P8(p) || "ครบ"));
  });

  await step("EQ2", async () => {
    const p: string[] = [];
    // บริสุทธิ์ 500 แผน
    const alloc = (i: RIn) => callSync(sharedMod, "allocateTableSplit", i);
    if (!sharedMod) p.push(`${MISSING} table-split-shared.ts`);
    else {
      const r = rng(0x48_46_46_55);
      let bad = 0;
      for (let k = 0; k < 500; k++) {
        const inp = randomSharedPlan(r);
        const frozen = JSON.stringify(inp);
        const ref = refAllocRot(inp);
        const g1 = alloc(inp);
        const g2 = alloc(JSON.parse(frozen) as RIn);
        const d = diffPlan(g1, ref);
        if (JSON.stringify(inp) !== frozen) d.push("แก้อินพุต");
        if (short(g1, 100000) !== short(g2, 100000)) d.push("เรียกซ้ำผลต่าง");
        if (ref.ok && g1?.ok === true) {
          if (sum((g1.parts as Any[]).map((x) => Number(x.totalSatang))) !== ref.totalSatang) d.push("Σ สุทธิ ≠ ยอดทั้งโต๊ะ");
          if (spread(shareOf(g1)) > 1) d.push(`ส่วนแบ่งต่อใบห่าง ${spread(shareOf(g1))}`);
        }
        if (d.length) {
          bad++;
          if (bad <= 3) p.push(`แผนสุ่ม #${k} (${inp.mode} ${inp.partCount} ใบ ${inp.items.length} รายการ): ${P8(d)}`);
        }
      }
      if (bad > 3) p.push(`แผนสุ่มผิดรวม ${bad}/500`);
    }
    // แผนจริงบน DB
    if (fx) p.push(`fixture ${fx}`);
    else {
      const s = await seat("EQ", ["o1", "o2", "o3", "o4", "o5", "o6"].map((k, i) => ln(k, 1 + (i % 2))));
      const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 3 }));
      if (!pl) p.push("(fixture) แผน EQUAL 3 ไม่ได้");
      else {
        const rows = (await P.restaurantOrderItem.findMany({ where: { tenantId: T, order: { sessionId: s.sid }, kdsStatus: { not: "CANCELLED" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[];
        const items: RItem[] = rows.map((x) => ({ id: String(x.id), qty: Number(x.qty), unitSatang: Number(x.unitPrice) + Number(x.optionsTotal ?? 0) }));
        const ref = refAllocRot({ mode: "EQUAL", partCount: 3, items, serviceChargeBp: Number(pl.serviceChargeBp ?? 0), vatRateBp: 700 });
        const d = diffPlan(pl, ref);
        if (d.length) p.push(`แผน DB ≠ ตัวอ้างอิงหมุนเศษ: ${P8(d)}`);
        const b = ((pl.parts ?? []) as Any[]).map((x) => Number(x.baseSatang));
        if (spread(b) > 1) p.push(`แผน DB ฐาน ${b.join("/")} (ห่าง ${spread(b)})`);
        const pure = alloc({ mode: "EQUAL", partCount: 3, items, serviceChargeBp: Number(pl.serviceChargeBp ?? 0), vatRateBp: 700 });
        const dp = diffPlan(pl, pure?.ok === true ? (pure as ROut) : ({ ok: false, code: codeOf(pure) } as ROut));
        if (dp.length) p.push(`แผน DB ≠ allocateTableSplit: ${P8(dp)}`);
      }
    }
    chk("EQ2", p.length === 0, "500 แผน = ตัวอ้างอิงหมุนเศษ · ส่วนแบ่งห่าง ≤ 1 · แผน DB = ผลบริสุทธิ์", FX(P8(p) || "ครบ"));
  });

  {
    // SM1 + SM2 (ฉากเดียว)
    const p1: string[] = [];
    const p2: string[] = [];
    let crashed = "";
    try {
      if (fx) throw new Error(`fixture ${fx}`);
      if (!MEM.M1 || !MEM.M2 || !MEM.MX) throw new Error("(fixture) ไม่มีสมาชิก");
      const s = await seat("SM", [ln("kaprao", 1), ln("chayen", 1), ln("padthai", 1)]);
      const allocations = [{ itemId: s.it.kaprao, partNo: 1, qty: 1 }, { itemId: s.it.chayen, partNo: 2, qty: 1 }, { itemId: s.it.padthai, partNo: 3, qty: 1 }];
      const bad = await mkSplit(s.sid, { mode: "SEAT", partCount: 3, allocations, parts: [{ no: 1, memberId: MEM.MX }, { no: 2, memberId: null }, { no: 3, memberId: null }] });
      if (!refused(bad, "MEMBER_NOT_FOUND") || Number(await P.posTableSplit.count({ where: { tenantId: T, sessionId: s.sid } }).catch(() => -1)) !== 0) p1.push(`สมาชิกร้าน T2 บนใบ → ${codeOf(bad)} (คาด MEMBER_NOT_FOUND ไม่มีแผน)`);
      const mk = await mkSplit(s.sid, { mode: "SEAT", partCount: 3, allocations, parts: [{ no: 1, memberId: MEM.M1 }, { no: 2, memberId: MEM.M2 }, { no: 3, memberId: null }] });
      const pl = splitOf(mk);
      if (!pl) throw new Error(`(fixture) แผน SEAT ${codeOf(mk)} ${short(mk?.message ?? "", 60)}`);
      const names = (v: Any) => [1, 2, 3].map((n) => (partOf(v, n)?.memberName === undefined ? "ไม่มีช่อง" : partOf(v, n)?.memberName));
      const want = [MEM_NAME.M1, MEM_NAME.M2, null];
      if (short(names(pl)) !== short(want)) p1.push(`registerSplitTable memberName ${short(names(pl))} (คาด ${short(want)})`);
      const dt = await sp("registerSplitDetail", ctxA(), A("OWNER"), { tableSessionId: s.sid });
      if (short(names(dt?.split)) !== short(want)) p1.push(`registerSplitDetail memberName ${short(names(dt?.split))} (คาด ${short(want)})`);
      // SM2 วิธีจ่าย
      const pm = (v: Any) => [1, 2, 3].map((n) => {
        const x = partOf(v, n)?.paidMethods;
        return x === undefined ? "ไม่มีช่อง" : x === null ? null : Array.isArray(x) ? [...x].map(String).sort().join("+") : short(x);
      });
      if (short(pm(pl)) !== short([null, null, null])) p2.push(`ก่อนจ่าย paidMethods ${short(pm(pl))} (คาด null ×3)`);
      const a = await payPart(pl, 1, (g) => [{ type: "CASH", amountSatang: 1000 }, { type: "CARD", amountSatang: g - 1000 }]);
      const b = await payPart(pl, 2);
      if (!a.saleId || !b.saleId) p2.push(`(fixture) จ่าย ${codeOf(a.r)} ${short(a.r?.message ?? "", 40)} / ${codeOf(b.r)}`);
      const dt2 = await sp("registerSplitDetail", ctxA(), A("OWNER"), { tableSessionId: s.sid });
      if (short(pm(dt2?.split)) !== short(["CARD+CASH", "CASH", null])) p2.push(`paidMethods ${short(pm(dt2?.split))} (คาด [CARD+CASH, CASH, null])`);
      const dlg = stripComments(rd(F.splitDialog));
      if (/\bbillDetailAction\b/.test(dlg)) p2.push("TableSplitDialog.tsx ยังเรียก billDetailAction (ทีละใบ)");
      if (!/\bpaidMethods\b/.test(dlg) || !/\bmemberName\b/.test(dlg)) p2.push("TableSplitDialog.tsx ไม่อ่าน paidMethods/memberName ของใบ");
    } catch (e) {
      crashed = `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`;
    }
    chk("SM1", !crashed && p1.length === 0, "ชื่อสมาชิกต่อใบ (สร้าง/อ่าน) · ใบไม่มีสมาชิก null · สมาชิกร้านอื่นถูกปฏิเสธ", FX(crashed || P8(p1) || "ครบ"));
    chk("SM2", !crashed && p2.length === 0, "วิธีจ่ายต่อใบ (ไม่ซ้ำ) · OPEN null · จอไม่เรียก billDetailAction", FX(crashed || P8(p2) || "ครบ"));
  }

  // ════════ LK1 FU (แคตตาล็อก) ════════
  console.log("\n── LK1 FU ──");
  await step("LK1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const list = recipeSharedMod?.RECIPE_REFUSAL_REASONS;
    if (!Array.isArray(list) || setStr(list) !== setStr([...RECIPE_REASONS])) p.push(`RECIPE_REFUSAL_REASONS ${short(list)} (คาด ${RECIPE_REASONS.join(",")})`);
    const cases: [string, () => Promise<Any>][] = [
      ["KIND", () => call(catalog, "setRecipe", cc("OWNER"), PP.water, [{ invItemId: INV.rice, qty: 1 }])],
      ["ITEM_ARCHIVED", () => call(catalog, "setRecipe", cc("OWNER"), PP.kaprao, [{ invItemId: INV.old, qty: 1 }])],
      ["ITEM_SERVICE", () => call(catalog, "setRecipe", cc("OWNER"), PP.kaprao, [{ invItemId: INV.svc, qty: 1 }])],
      ["DUPLICATE", () => call(catalog, "setRecipe", cc("OWNER"), PP.kaprao, [{ invItemId: INV.rice, qty: 1 }, { invItemId: INV.rice, qty: 2 }])],
      ["NO_LINES", () => call(catalog, "setBomEnabled", cc("OWNER"), PP.chayen, true)],
      ["SHAPE", () => call(catalog, "setRecipe", cc("OWNER"), PP.kaprao, [{ invItemId: INV.rice, qty: 0 }])],
      ["SHAPE", () => call(catalog, "setRecipe", cc("OWNER"), PP.kaprao, [{ invItemId: INV.rice, qty: 1, extra: 1 }])],
    ];
    const th = msgJson(F.msgTh);
    const en = msgJson(F.msgEn);
    for (const [want, f] of cases) {
      const r = await f();
      if (r?.code !== "VALIDATION" || r?.reason !== want) p.push(`${want} → ${codeOf(r)} reason ${short(r?.reason)} (คาด VALIDATION ${want})`);
      const key = `recipe.errors.${camel(want)}`;
      const ve = getPath(en, key);
      const vt = getPath(th, key);
      if (typeof ve !== "string" || THAI.test(ve) || typeof vt !== "string" || !THAI.test(vt)) p.push(`คีย์ ${key} th/en ${short([vt, ve], 80)}`);
    }
    const rr = await P.recipeLine.count({ where: { tenantId: T, productId: { in: [PP.kaprao, PP.water].filter(Boolean) } } }).catch(() => -1);
    if (rr !== 0) p.push(`มีสูตรถูกเขียน ${rr} แถว`);
    // สถิต: action ส่ง reason · จอแปล reason ก่อนข้อความบริการ
    const ra = fnBody(srcOf(F.recipeActions), "refusalOf");
    if (!/\breason\b/.test(ra)) p.push("recipe-actions refusalOf ไม่ส่ง reason");
    const ru = fnBody(srcOf(F.recipeUi), "recipeRefusalText");
    const iReason = ru.search(/\breason\b/);
    const iSv = ru.indexOf("serverValidation");
    if (iReason < 0 || (iSv >= 0 && iReason > iSv)) p.push("recipeRefusalText ไม่ใช้ reason ก่อนข้อความบริการ (errors.serverValidation)");
    chk("LK1", p.length === 0, "รหัสย่อย 6 แบบ + คีย์ th/en · action/จอใช้ reason", FX(P8(p) || "ครบ"));
  });

  await step("FU1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const th = msgJson(F.msgTh);
    const en = msgJson(F.msgEn);
    const et = getPath(th, "report.channels.empty");
    const ee = getPath(en, "report.channels.empty");
    if (et !== EMPTY_TH || ee !== EMPTY_EN) p.push(`report.channels.empty ${short([et, ee], 80)} (คาด "${EMPTY_TH}" / "${EMPTY_EN}")`);
    if (/วันนี้/.test(String(et)) || /today/i.test(String(ee))) p.push("ข้อความยังมี วันนี้/today");
    const d = await call(productsDataMod, "loadProductsData", { tenantId: T, systemId: S.POS }, A("OWNER"), [{ id: U.A, name: "A" }, { id: U.C, name: "C" }]);
    const inc = d?.incompleteUnitIds;
    if (!Array.isArray(inc) || !inc.includes(U.C) || inc.includes(U.A)) p.push(`incompleteUnitIds ${short(inc)} (คาดมีสาขา C ที่ไม่ผูก POS · ไม่มีสาขา A) ${d?.ok === false ? codeOf(d) : ""}`);
    const pp = stripComments(rd(F.productPanel));
    if (!/\bincompleteUnitIds\b/.test(pp) || !/["'`]branch\.incomplete["'`]|\.incomplete\b/.test(pp)) p.push("ProductPanel ไม่ใช้ incompleteUnitIds/branch.incomplete");
    chk("FU1", p.length === 0, "ข้อความว่างไม่ผูกวันนี้ · สาขาโหลดไม่ครบอยู่ใน incompleteUnitIds · จอใช้", FX(P8(p) || "ครบ"));
  });

  await step("FU2", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const pid = PP.water!;
    const rowsDb = async () => ((await P.posProductChannelPrice.findMany({ where: { tenantId: T, productId: pid } }).catch(() => [])) as Any[]).map((r) => `${r.channelCode ?? "-"}|${r.unitId ?? "-"}|${r.priceSatang ?? "-"}|${r.notSold ? 1 : 0}`).sort().join(",");
    const set = (rows: Any[], extra: Any = {}) => call(catalog, "setChannelPrices", cc("OWNER"), { productId: pid, rows, ...extra });
    const r0 = await set([{ channelCode: "LINEMAN", unitId: null, priceSatang: 1500 }, { channelCode: "GRAB", unitId: U.A, priceSatang: 1600 }]);
    if (r0?.ok === false) p.push(`(ไม่ส่ง hash) ตั้งราคา → ${codeOf(r0)} ${short(r0?.message ?? "", 60)}`);
    const d = await call(productsDataMod, "loadProductsData", { tenantId: T, systemId: S.POS }, A("OWNER"), [{ id: U.A, name: "A" }]);
    const row = ((d?.products ?? []) as Any[]).find((x) => x.id === pid);
    const h0 = row?.rowsHash;
    const viaFn = callSync(priceSharedMod, "channelRowsHash", row?.rows ?? []);
    const rev = callSync(priceSharedMod, "channelRowsHash", [...(row?.rows ?? [])].reverse());
    if (typeof h0 !== "string" || !h0 || h0 !== viaFn) p.push(`ProductsRow.rowsHash ${short(h0, 40)} · channelRowsHash ${short(viaFn, 40)} (คาดเท่ากัน)`);
    if (typeof viaFn === "string" && viaFn !== rev) p.push("channelRowsHash ขึ้นกับลำดับแถว");
    const before = await rowsDb();
    const st = await set([{ channelCode: "LINEMAN", unitId: null, priceSatang: 1700 }], { expectedRowsHash: `${String(h0 ?? "x")}0` });
    if (st?.code !== "CONFLICT" || (await rowsDb()) !== before) p.push(`hash เก่า → ${codeOf(st)} · แถว ${(await rowsDb()) === before ? "เดิม" : "เปลี่ยน"} (คาด CONFLICT · เดิม)`);
    const ok = await set([{ channelCode: "LINEMAN", unitId: null, priceSatang: 1800 }, { channelCode: "GRAB", unitId: U.A, priceSatang: 1600 }], { expectedRowsHash: h0 });
    if (ok?.ok === false || !(await rowsDb()).includes("LINEMAN|-|1800|0")) p.push(`hash ตรง → ${codeOf(ok)} ${short(ok?.message ?? "", 60)} · ${await rowsDb()}`);
    const ab = await set([{ channelCode: "LINEMAN", unitId: null, priceSatang: 1900 }, { channelCode: "GRAB", unitId: U.A, priceSatang: 1600 }]);
    if (ab?.ok === false || !(await rowsDb()).includes("LINEMAN|-|1900|0")) p.push(`ไม่ส่ง hash → ${codeOf(ab)} (คาด ok · ของเดิม)`);
    for (const [lang, j] of [["th", msgJson(F.msgTh)], ["en", msgJson(F.msgEn)]] as const) {
      const v = getPath(j, "products.branch.conflict");
      if (typeof v !== "string" || (lang === "en" ? THAI.test(v) : !THAI.test(v))) p.push(`${lang}: products.branch.conflict ${short(v, 40)}`);
    }
    chk("FU2", p.length === 0, "hash เก่า = CONFLICT ไม่เขียน · ตรง/ไม่ส่ง = ok · rowsHash = channelRowsHash", FX(P8(p) || "ครบ"));
  });

  // ════════ ZE เครื่องหมาย zero entry ════════
  console.log("\n── ZE ──");
  await step("ZE1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    await drain();
    const X = `${KEY_PREFIX}-zx`;
    await glMod.recordExternalSaleZeroEntry({ tenantId: T, systemId: S.ACC }, X, { zeroEntry: true, refId: X, grossSatang: 2000 });
    const mk = (await auditsOf(ZERO_ENTRY_ACTION, X))[0];
    if (mk?.after?.bookSystemId !== S.ACC) p.push(`เครื่องหมาย after.bookSystemId ${short(mk?.after?.bookSystemId)} (คาด สมุด A)`);
    const relink = (acc: string) => P.accountSystemLink.updateMany({ where: { tenantId: T, linkedKind: "POS", linkedId: S.POSZ }, data: { systemId: acc } });
    const com = () => accIdx.applyExternalChannelCommission({ tenantId: T, sourceSystemId: S.POSZ, refId: X, occurredAt: new Date(), commissionSatang: 300, commissionVatSatang: 21, payout: "DIRECT", channelName: `ตัวแทน ZE ${RAND}` }).catch((e: unknown) => ({ posted: false, reason: `throw ${(e as Error).message.slice(0, 60)}` }));
    let inB: Any = null;
    let backA: Any = null;
    try {
      await relink(S.ACCB);
      inB = await com();
    } finally {
      await relink(S.ACC);
    }
    backA = await com();
    const jeB = Number(await P.accountJournalEntry.count({ where: { tenantId: T, systemId: S.ACCB } }).catch(() => -1));
    if (inB?.posted !== false || inB?.reason !== "no-paid" || jeB !== 0) p.push(`สมุด B → ${short(inB, 80)} · JV ในสมุด B ${jeB} (คาด {posted:false, reason:no-paid} · 0)`);
    if (!(backA?.posted === true || backA?.reason === "already")) p.push(`ผูกกลับสมุด A → ${short(backA, 80)} (คาด posted/already)`);
    chk("ZE1", p.length === 0, "เครื่องหมายผูกสมุด · ย้ายสมุดแล้วประตูค่าคอมฯ ปิด · กลับมาเปิด", FX(P8(p) || "ครบ"));
  });

  await step("ZE2", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const posted = (sys: string, refId: string) => accIdx.posSalePosted({ tenantId: T, sourceSystemId: sys, refId }).catch((e: unknown) => `throw ${(e as Error).message.slice(0, 60)}`);
    const Y = `${KEY_PREFIX}-zy`;
    const Z = `${KEY_PREFIX}-zz`;
    await glMod.recordExternalSaleZeroEntry({ tenantId: T, systemId: S.ACC }, Y, { zeroEntry: true, refId: Y, grossSatang: 0 });
    const doc = await accSvc.upsertExternalSaleDocument({
      tenantId: T, systemId: S.ACC, refSystemId: S.POSZ, refId: Z, docNo: null, occurredAt: new Date(), contactId: null, vatMode: "INCLUDE", vatRegistered: true, vatRateBp: 700, grandTotalSatang: 2000,
      lines: [{ description: `ของ ZE ${RAND}`, qty: 1, unitPrice: 2000, discount: 0, vatRateBp: null, productId: null }],
    });
    if (doc?.ok !== true) p.push(`(fixture) เอกสารขาย ${short(doc, 80)}`);
    await glMod.recordExternalSaleZeroEntry({ tenantId: T, systemId: S.ACC }, Z, { zeroEntry: true, refId: Z, grossSatang: 2000 });
    const py = await posted(S.POSZ, Y);
    const pz = await posted(S.POSZ, Z);
    if (py !== false) p.push(`เครื่องหมายไม่มีเอกสาร → ${short(py)} (คาด false · ทางซ่อมเอกสาร R5 F1)`);
    if (pz !== true) p.push(`เครื่องหมาย + เอกสาร → ${short(pz)} (คาด true · มติ 8)`);
    // ตัวควบคุม: บิลจริงที่มี JV PAID
    const q = await call(register, "quoteRegisterCart", ctxA(DEV1), A("OWNER"), { lines: [ln("water", 1)] });
    const g = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const s = await call(register, "submitRegisterSale", ctxA(DEV1), A("OWNER"), { lines: [ln("water", 1)], idempotencyKey: newKey("ze"), expectedGrandTotalSatang: g, payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g });
    const sid = s?.ok === true ? String(s.saleId) : "";
    if (sid) MY_SALES.push(sid);
    await drain();
    const pr = sid ? await posted(S.POS, sid) : "ไม่มีบิล";
    if (pr !== true) p.push(`(ตัวควบคุม) บิลที่มี JV PAID → ${short(pr)} ${codeOf(s)}`);
    chk("ZE2", p.length === 0, "posSalePosted: เครื่องหมาย+เอกสาร true · ไม่มีเอกสาร false · JV PAID true", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 2): ZE3 = คืนบิล zero entry ที่มีค่าคอมฯ จริงในสมุด A หลังย้าย POS ไปผูกสมุด B (hunter H2 · มติ fix2 ข้อ 2 · 3) —
  //   ฉากจริงเดียวที่บิลมีค่าคอมฯ แต่ไม่มี JV ขาย = ฉาก A10 ของ qc-pos-p2.9b (มัดจำ ฿1,070 ตอนจด VAT → สมุดเลิกจด → ใช้ ฿1,050 แล้ว ฿20 · ช่องทางตัวแทน DIRECT 10%) —
  //   ช่องทาง payout PLATFORM มีแถวจ่าย PLATFORM เต็มยอดเสมอ ⇒ ไม่มีวันเป็น zero entry · POS Z3 ของตัวเอง (สาขา Z3 · สมุด A3 จด VAT แล้วเลิกจด) ·
  //   COMMISSION ของบิล ฿20 ลงสมุด A3 → ย้าย POS Z3 ไปผูกสมุด B (จด VAT) → คืนบิล ฿20 ครบ (โอน) → ระบายคิว ⇒ pos.sale.refunded DONE · ไม่มี P2002 ใน log ·
  //   COMMISSION ในสมุด B 0 · COMMISSION_REFUNDED ในสมุด B 0 (ปักไว้ — การกลับค่าคอมฯ ข้ามสมุด = เรื่องของเจ้าของ · POS-OWNER-PENDING) · COMMISSION ในสมุด A3 ยัง 1 ·
  //   ความเคลื่อนไหวสต็อกของร้านไม่เพิ่ม (ฝั่งสมุด B ไม่ตัดส่วนประกอบซ้ำ) ◂
  await step("ZE3", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const svcMod = await tryImport("@/lib/modules/pos/service");
    const depMod = await tryImport("@/lib/modules/pos/deposit");
    const paySetMod = await tryImport("@/lib/modules/pos/payment-settings");
    const refundMod = await tryImport("@/lib/modules/pos/refund");
    const owner = A("OWNER");
    const xfer = (amt: number): Any => ({ type: "TRANSFER", amountSatang: amt });
    const jvCount = (systemId: string, key: string) => P.accountJournalEntry.count({ where: { tenantId: T, systemId, idempotencyKey: key } }).catch(() => -1) as Promise<number>;
    const unit = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาZ3`, slug: `${T_SLUG}-z3` } })).id;
    const pos = (await sysSvc.createSystem(T, "POS", `POS Z3 ${RAND}`)).id;
    await sysSvc.linkUnit(T, pos, unit);
    must("เปิดมัดจำ", await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: pos }, owner, { deposit: { enabled: true } }));
    const accA = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี A3 ${RAND}`)).id;
    const org = `ร้านตามเก็บคิวซี A3 ${RAND} จำกัด`;
    await accSvc.saveSettings(T, accA, { orgName: org, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: accA });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: accA, linkedKind: "POS", linkedId: pos } });
    const ctxZ: Any = { tenantId: T, systemId: pos, unitId: unit };
    const ch = must("ช่องทางตัวแทน Z3", await call(chMod, "saveChannel", ctxZ, owner, { code: "CUSTOM_AGENT", name: `ตัวแทน Z3 ${RAND}`, payout: "DIRECT", commissionBp: 1000 }));
    const channelId = String(ch.channel?.id ?? "");
    const dr = must("รับมัดจำ", await call(depMod, "registerTakeDeposit", ctxZ, owner, { amountSatang: 107_000, payMethods: [xfer(107_000)], idempotencyKey: newKey("z3dep"), customerName: `คุณมัดจำ Z3 ${RAND}`, phone: `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` }));
    const depId = String(dr?.deposit?.id ?? dr?.depositId ?? "");
    const dep = depId ? await P.posDeposit.findUnique({ where: { id: depId } }).catch(() => null) : null;
    if (!dep?.receiptSaleId) throw new Error(`(fixture) มัดจำ Z3 ไม่มีใบรับ ${short(dr, 80)}`);
    MY_SALES.push(String(dep.receiptSaleId));
    await drain();
    await accSvc.saveSettings(T, accA, { orgName: org, taxId: "0105561177639", vatRegistered: false });
    const sale = async (lbl: string, amt: number) => {
      const r = await call(svcMod, "createSale", { tenantId: T, unitId: unit, systemId: pos, idempotencyKey: newKey(lbl), channelId, lines: [{ name: `ของ ${lbl} ${RAND}`, qty: 1, unitPriceSatang: amt }], payMethods: [{ type: "DEPOSIT", amountSatang: amt, refSaleId: dep.receiptSaleId }] });
      if (!r || r.ok === false || typeof r.saleId !== "string") throw new Error(`(fixture) บิล ${lbl} ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      MY_SALES.push(String(r.saleId));
      return String(r.saleId);
    };
    await sale("z3b1", 105_000);
    const b2 = await sale("z3b2", 2_000);
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ACC-3) ▸ บิลที่ 3 (ไม่ใช่ zero entry · บรรทัดผูกสต็อกจริง itemId น้ำเปล่า) — ลง JV PAID ในสมุด A3 ก่อนย้ายสมุด ⇒ คืนหลังย้าย = ตัวรับคืนเงินรันเส้นขายซ้ำในสมุด B
    //   (posSalePosted ของสมุด B = false) ⇒ postExternalSale เจอคีย์ในสมุดอื่น = ข้าม other-book · สต็อกขยับเฉพาะใบคืน (+1) ไม่ตัดซ้ำ ◂
    await sysSvc.linkUnit(T, S.INV, unit);
    const b3r = await call(svcMod, "createSale", { tenantId: T, unitId: unit, systemId: pos, idempotencyKey: newKey("z3b3"), lines: [{ name: `น้ำ z3b3 ${RAND}`, qty: 1, unitPriceSatang: 1_000, itemId: INV.water }], payMethods: [xfer(1_000)] });
    if (!b3r || b3r.ok === false || typeof b3r.saleId !== "string") throw new Error(`(fixture) บิล z3b3 ${codeOf(b3r)} ${short(b3r?.message ?? "", 80)}`);
    const b3 = String(b3r.saleId);
    MY_SALES.push(b3);
    await drain();
    const b3Moves0 = Number(await P.invMovement.count({ where: { tenantId: T, itemId: INV.water } }).catch(() => -1));
    if ((await jvCount(accA, `PosSale#${b3}#PAID`)) !== 1) throw new Error(`(fixture) บิล z3b3 ไม่มี JV PAID ในสมุด A3 (${await jvCount(accA, `PosSale#${b3}#PAID`)})`);
    // ◂ ORACLE-EDIT
    // ฉากก่อนย้ายสมุด: บิล ฿20 ไม่มี JV ขาย · เครื่องหมายของสมุด A3 · COMMISSION ในสมุด A3 1 รายการ
    const comKey = `PosSale#${b2}#COMMISSION`;
    const mk = (await auditsOf(ZERO_ENTRY_ACTION, b2)).filter((x) => x?.after?.bookSystemId === accA);
    if ((await jvCount(accA, `PosSale#${b2}#PAID`)) !== 0 || mk.length !== 1 || (await jvCount(accA, comKey)) !== 1)
      throw new Error(`(fixture) บิล ฿20: JV PAID ${await jvCount(accA, `PosSale#${b2}#PAID`)} · เครื่องหมาย A3 ${mk.length} · COMMISSION A3 ${await jvCount(accA, comKey)} (คาด 0 · 1 · 1)`);
    const mv0 = Number(await P.invMovement.count({ where: { tenantId: T } }).catch(() => -1));
    const relink = (acc: string) => P.accountSystemLink.updateMany({ where: { tenantId: T, linkedKind: "POS", linkedId: pos }, data: { systemId: acc } });
    const logs: string[] = [];
    const orig = { error: console.error, warn: console.warn };
    let rid = "";
    let rid3 = ""; // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ACC-3)
    try {
      await relink(S.ACCB);
      const line = await P.posSaleLine.findFirst({ where: { saleId: b2 } });
      const f = await call(refundMod, "refundSale", ctxZ, owner, { saleId: b2, lines: [{ lineId: String(line?.id ?? "none"), qty: 1 }], payMethods: [xfer(2_000)], reasonCode: "CHANGED_MIND", idempotencyKey: newKey("z3rf") });
      const docs = (await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: b2 } }).catch(() => [])) as Any[];
      for (const d of docs) MY_SALES.push(String(d.id));
      if (f?.ok !== true || docs.length !== 1) throw new Error(`(fixture) คืน ฿20 → ${codeOf(f)} ${short(f?.message ?? "", 80)} · ใบคืน ${docs.length}`);
      rid = String(docs[0].id);
      // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ACC-3) ▸ คืนบิลที่ 3 ครบ (คืนเข้าคลัง) หลังย้ายสมุด ◂
      const line3 = await P.posSaleLine.findFirst({ where: { saleId: b3 } });
      const f3 = await call(refundMod, "refundSale", ctxZ, owner, { saleId: b3, lines: [{ lineId: String(line3?.id ?? "none"), qty: 1, restock: true }], payMethods: [xfer(1_000)], reasonCode: "CHANGED_MIND", idempotencyKey: newKey("z3rf3") });
      const docs3 = (await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: b3 } }).catch(() => [])) as Any[];
      for (const d of docs3) MY_SALES.push(String(d.id));
      if (f3?.ok !== true || docs3.length !== 1) throw new Error(`(fixture) คืน z3b3 → ${codeOf(f3)} ${short(f3?.message ?? "", 80)} · ใบคืน ${docs3.length}`);
      rid3 = String(docs3[0].id);
      const cap = (k: "error" | "warn") => (...a: unknown[]) => {
        logs.push(a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x, Object.getOwnPropertyNames(x ?? {})); } catch { return String(x); } })())).join(" "));
        orig[k](...a);
      };
      console.error = cap("error");
      console.warn = cap("warn");
      await drain();
    } finally {
      console.error = orig.error;
      console.warn = orig.warn;
      await relink(accA);
    }
    const ev = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.refunded" } }).catch(() => [])) as Any[]).filter((e) => e.payload?.refundSaleId === rid);
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ACC-3) ▸ บิลที่ 3: คิวคืน DONE · ไม่มี JV/เอกสารของบิลในสมุด B (ข้าม other-book) · JV PAID ในสมุด A3 ยัง 1 · สต็อกน้ำเปล่า +1 แถวเดียว (ใบคืน) ◂
    const ev3 = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.refunded" } }).catch(() => [])) as Any[]).filter((e) => e.payload?.refundSaleId === rid3);
    const paidB3 = await jvCount(S.ACCB, `PosSale#${b3}#PAID`);
    const paidA3 = await jvCount(accA, `PosSale#${b3}#PAID`);
    const docB3 = Number(await P.accountDocument.count({ where: { tenantId: T, systemId: S.ACCB, refType: "PosSale", refId: b3 } }).catch(() => -1));
    const b3Moves1 = Number(await P.invMovement.count({ where: { tenantId: T, itemId: INV.water } }).catch(() => -1));
    if (ev3.length !== 1 || ev3[0]?.status !== "DONE") p.push(`บิลที่ 3 pos.sale.refunded ${ev3.length} · ${ev3.map((e) => `${e.status}/${e.attempts}`).join(",")} ${short(ev3[0]?.lastError ?? "", 80)} (คาด 1 · DONE)`);
    if (paidB3 !== 0 || docB3 !== 0) p.push(`บิลที่ 3 ในสมุด B: JV PAID ${paidB3} · เอกสาร ${docB3} (คาด 0 · 0 — ข้าม other-book)`);
    if (paidA3 !== 1) p.push(`บิลที่ 3 JV PAID ในสมุด A3 ${paidA3} (คาด 1 เดิม)`);
    if (b3Moves0 < 0 || b3Moves1 !== b3Moves0 + 1) p.push(`สต็อกน้ำเปล่า ${b3Moves0} → ${b3Moves1} (คาด +1 = ใบคืน · ไม่ตัดซ้ำ)`);
    // ◂ ORACLE-EDIT
    const p2002 = logs.filter((l) => /P2002|Unique constraint/i.test(l)).length + ev.filter((e) => /P2002|Unique constraint/i.test(String(e.lastError ?? ""))).length;
    const comB = await jvCount(S.ACCB, comKey);
    const revB = await jvCount(S.ACCB, `PosSale#${rid}#COMMISSION_REFUNDED`);
    const comA = await jvCount(accA, comKey);
    const mv1 = Number(await P.invMovement.count({ where: { tenantId: T } }).catch(() => -1));
    const jvB = ((await P.accountJournalEntry.findMany({ where: { tenantId: T, systemId: S.ACCB, refId: { in: [b2, rid] } }, select: { idempotencyKey: true } }).catch(() => [])) as Any[]).map((e) => String(e.idempotencyKey));
    const mkB = (await auditsOf(ZERO_ENTRY_ACTION, b2)).filter((x) => x?.after?.bookSystemId === S.ACCB).length;
    const docB = Number(await P.accountDocument.count({ where: { tenantId: T, systemId: S.ACCB, refType: "PosSale", refId: { in: [b2, rid] } } }).catch(() => -1));
    console.log(`  (ZE3 ข้อมูล) สมุด B: JV ${short(jvB, 160)} · เครื่องหมาย ${mkB} · เอกสาร ${docB} · คิวคืน ${ev.map((e) => `${e.status}/${e.attempts}`).join(",")} · log P2002 ${p2002}`);
    if (ev.length !== 1 || ev[0]?.status !== "DONE") p.push(`pos.sale.refunded ${ev.length} ตัว · ${ev.map((e) => `${e.status}/${e.attempts}`).join(",")} ${short(ev[0]?.lastError ?? "", 80)} (คาด 1 · DONE)`);
    if (p2002 !== 0) p.push(`P2002 ใน log ${p2002} ครั้ง (คาด 0)`);
    if (comB !== 0) p.push(`COMMISSION ในสมุด B ${comB} (คาด 0)`);
    if (revB !== 0) p.push(`COMMISSION_REFUNDED ในสมุด B ${revB} (คาด 0 · ปักไว้ มติ fix2 ข้อ 2)`);
    if (comA !== 1) p.push(`COMMISSION ในสมุด A3 ${comA} (คาด 1 เดิม)`);
    if (mv0 < 0 || mv1 !== mv0 + 1) p.push(`ความเคลื่อนไหวสต็อกของร้าน ${mv0} → ${mv1} (คาด +1 = ใบคืนบิลที่ 3 เท่านั้น)`); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ACC-3) (เดิม "เท่าเดิม" — บรรทัดไม่มี itemId จึงไม่เคยแดง)
    chk("ZE3", p.length === 0, "คืนบิลหลังย้ายสมุด: คิว DONE · ไม่มี P2002 · ไม่มี COMMISSION/COMMISSION_REFUNDED ในสมุด B · สต็อกไม่ขยับ", FX(P8(p) || "ครบ"));
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสอง + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  const targets = ([[T, T_SLUG], [T2, T2_SLUG]] as [string, string][]).filter(([id]) => !!id);
  if (targets.length) {
    for (const [id, slug] of targets) {
      const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, id)) as Any[];
      if (t.length && t[0].slug !== slug) {
        rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
        return rep;
      }
    }
    await drain();
    await sleep(300);
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
    for (const [id, slug] of targets) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
      await P.$executeRawUnsafe(`UPDATE "TableSession" SET "mergedIntoId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
      let pending = [...tables];
      for (let pass = 0; pass < 10 && pending.length; pass++) {
        const next: string[] = [];
        for (const tb of pending) {
          try {
            await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id);
          } catch {
            next.push(tb);
          }
        }
        pending = next;
      }
      try {
        await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, id, slug);
      } catch (e) {
        rep.err = [rep.err, `ลบ Tenant ${slug} ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
      }
      for (const tb of tables) {
        try {
          const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, id)) as Any[])[0]?.n ?? 0);
          if (n) rep.left[`${slug === T_SLUG ? "T" : "T2"}.${tb}`] = n;
        } catch {
          rep.left[tb] = -1;
        }
      }
      rep.tenantLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, id)) as Any[])[0]?.n ?? 0);
    }
  }
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
try {
  await runStatic();
  await runPure(sharedMod, renderMod);
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenants();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err].filter(Boolean).join(" · "));
/** รอยของรอบนี้นอกร้านชั่วคราว (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function leaksOutside(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - MIN);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  if (MY_SALES.length) await n("posSale.id", () => P.posSale.count({ where: { id: { in: MY_SALES.filter(Boolean) } } }));
  await n("invItem", () => P.invItem.count({ where: { sku: { startsWith: KEY_PREFIX } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'') || coalesce("targetId",'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND ("payload"::text LIKE $2 OR "idempotencyKey" LIKE $2)`, since, like)) as Any[])[0]?.n);
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", leaks.length === 0, "ไม่มีรอยของรอบนี้นอกร้านชั่วคราว (ลายนิ้วมือ = ข้อมูล)",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีรอย", fpDrift.length ? `(ข้อมูล · lane อื่นอาจเขียน) ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือร้านอื่นเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const parIds = CHECKS.filter(([, x]) => x === "PAR").map(([id]) => id);
const parRed = parIds.filter((id) => failed.includes(id));
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""} · PAR ${parIds.length - parRed.length}/${parIds.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, parRed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต HF-FU S: e (ตัวกันหน้าเดิมนอก tx → P2.14) · f o (UI/บรรทัดเจ้าของ) · g (PIN ถูกแฮชสองครั้ง → P2.13) · q r (→ P2.9bU) ·
//   m(ii)/(iii) G2 ชิปบิล F7 (→ P2.12) · ภาพ (§9: ผู้คุมถ่ายเฉพาะ state ที่ใบแตะ) · ชุด regression §8 ผู้สร้างรันก่อน/หลัง
