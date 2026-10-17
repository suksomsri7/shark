// QC — POS RUN ใบ P3.9 (S): เครื่องมือ AI จากทะเบียน op (สกิล sales) · ข้อเสนอ pos.* + pos_draft_po · จุดผิดปกติ A11 · สรุปเช้า (Daily Brief)
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P3.9 S · ฐาน session/pos 72669941
// requires: (ไม่ต้อง seed — ร้านชั่วคราวของข้อสอบเอง `posqc-p39-<rand>` + `-t2`) · MockProvider เท่านั้น (SHARK_AI_MOCK=1 · ไม่มีเครือข่าย)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.9.md ⚠️1–10 · §0 · §1 · §2 R1–R13 · §4 · §5 · **§10 มติผู้คุมงาน 1–13 (ผูกมัด)** ·
//   ตารางชื่อเต็ม + drift + ORACLE-EDIT + CONTROLLER-DECISION = ledger/wo-notes/pos-P3.9-oracle.md
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง):
//   src/lib/modules/pos/api/tools.ts (สะพาน · ห้าม import @/lib/ai/* · ห้าม prisma ดิบ) export:
//     posToolInfos() → [{name, opId, write, danger, description, parameters}] = op ที่ประกาศ `tool` (11 ตัว ตาราง TOOL_SPEC)
//     runPosTool(ctx, name, args) → {mode:"error",error} | {mode:"read",result} | {mode:"propose",kind,summary,payload}
//     dispatchPosKind(ctx, kind, payload) → ข้อความไทย (รัน op เป็น actor "user" = ผู้กดยืนยัน · idempotencyKey = proposalId)
//     posKindAccess() → {"pos.<opId>": {module "pos", action = op.action}} (เฉพาะ write/danger) · posDestructiveKinds() = ["pos.sales.void"]
//     posToolScope(name) → op.action | null · posToolAllowedForScopes(name, scopes) → boolean
//   src/lib/ai/tools-pos.ts export posTools(): AiTool[] (adapter บาง แบบ tools-member.ts) · ai/tools.ts ...posTools() + ถอด salesSummary/salesByDay เขียนมือ
//   ชื่อ tool (R1 · มติ 1): sales_summary sales_by_day void_sale (ชื่อเดิม) + pos_top_products pos_shift_report pos_shift_now pos_anomalies pos_hourly
//     pos_find_product pos_set_price pos_set_availability (ทะเบียน) + pos_draft_po (เขียนมือ · systems POS+INVENTORY) · สกิล sales = 15 ชื่อ (SALES_TOOLS)
//   ชื่ออาร์กิวเมนต์ = path param แบบสะพานสมาชิก: {id} ของ /sales → saleId · /products → productId · /shifts → shiftId · อื่น = input ของ op (from to unitId limit …)
//   kind: pos.products.setPrice (pos.product.setPrice) · pos.products.availability (pos.sale.create — มติ 7) · pos.sales.void (pos.sale.void · DESTRUCTIVE) ·
//     pos_draft_po (module inventory · inventory.po.create) · kind เดิม void_sale ยังกดยืนยันได้ (≤ 24 ชม. · ทางเดียวกัน)
//   void_sale args {saleId, reason} — ไม่มี reason / สั้นกว่า 3 ตัว = error ไม่สร้างข้อเสนอ (ข้อสอบใช้เหตุผล ≥ 5 ตัว: op sales.void บังคับ min 5 — ดู CD ในโน้ต)
//   src/lib/modules/pos/ai-insights.ts purchaseSuggestions({tenantId, systemId, unitId?}, actor) → {ok:true, suggestions:[{itemId, qty, supplierId|null, …}]} | refusal
//     หน้าต่าง = 14 วันธุรกิจที่จบเมื่อวาน (D−14..D−1) · velocity = qty/14 · เข้ารายการเมื่อ onHand ≤ reorderPoint หรือ onHand/velocity < 3 ·
//     qty = max(1, ceil(14 × velocity) − onHand) · supplierId = ผู้ขายของ PoLine ล่าสุดของสินค้านั้น (ไม่มี = null)
//   src/lib/modules/pos/ai-brief-shared.ts (บริสุทธิ์ · ไม่มี prisma/db) composeBrief(input: BriefInput, locale "th"|"en") → {title, lines: string[], sections: string[]}
//     ข้อความตายตัว (golden) = GOLDEN ข้างล่าง · body ของแจ้งเตือน = lines.join("\n")
//   src/lib/modules/pos/ai-brief.ts loadBriefInput({tenantId, systemId}, recipient: RegisterActor, businessDate) → BriefInput (หรือ {ok:true,input}) ·
//     sendPosDailyBriefs({now, deadline?, tenantId?, post?}) — tenantId = กรองร้าน (ข้อสอบส่งเสมอ) · post = ตัวส่ง push ฉีดได้ (ต่อไป sendPushToUser)
//   src/lib/modules/pos/settings-shared.ts posAiSettings(settings) → {enabled false, brief {enabled true, hourBkk 6, email false, managerUserIds []}, anomalyInBrief true}
//   POS_ANOMALY_RULES = A1…A11 · POS_ANOMALY_DEFAULTS.A11 = {count: 3} · A11 = audit pos.staff.schedule_override ≥ count ต่อผู้อนุมัติ (actorId) / สาขา / วัน
//   inventory/index.ts บล็อกเดียว `// POS P3.9 ▸ … ◂` re-export createPo · bills.ts voidSaleByActor รับ sourceModule "AI"
//
// BriefInput (ข้อสอบตั้ง · null = ส่วนนั้นถูกปฏิเสธ/ปิด ⇒ ไม่มีบรรทัด · ห้ามแสดงเป็น 0):
//   {businessDate, systemName, daily {netSalesSatang, billCount, avgBillSatang}|null, lastWeek {…}|null, topProducts [{name, qty, salesSatang}]|null,
//    bottomProducts […]|null, peakHour {hour, netSalesSatang}|null, openShifts number|null, overShort [{label, overShortSatang}]|null,
//    anomalies [{rule, count}]|null, stockRisks [{name, onHand, reorderPoint}]|null, soldOut [{name}]|null, pendingApprovals number|null, pendingProposals number|null}
//   สูตร vs สัปดาห์ก่อน: deltaBp = Math.round((net − lastNet) × 10000 / lastNet) (สูตรเดียวกับ posDashboardCard.deltaBp) · lastNet ≤ 0 = ไม่มีบรรทัด
//
// 🔴 กติกาข้อสอบ: SKIP เมื่อสะพาน/adapter/ไฟล์สรุปเช้ายังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST5 + PV4 แบบอ่านไฟล์ (ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราวลบทั้งร้านใน finally · globalThis.fetch = ตัวกั้น (503 + นับ) · ไม่มีผู้ให้บริการ AI จริง
//    SQL ดิบเฉพาะแถวของร้านชั่วคราว: เลื่อนเวลาบิล/กะ/PO ย้อนหลัง · แทรกแถว AuditLog pos.staff.schedule_override (ยังไม่มีผู้เขียนจนกว่า P3.5) · ลบแจ้งเตือนสรุปเช้าระหว่างรอบ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
process.env.SHARK_AI_MOCK = "1"; // R12 · AI_LAYER rule 5 — ห้ามเรียกผู้ให้บริการจริง
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p3.9";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** หมุดของใบ (ฐานของ brief · ST4/ST5 เทียบไฟล์ที่ห้าม/จำกัดการแก้) */
const PIN = process.env.P39_PIN || "8bded5a7";
// ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · P3.8 merge แตะ outbox-consumers.ts · ST4 เทียบไฟล์ห้ามแตะกับหมุดเลน ไม่ใช่หมุดใบ · ST1/ST5 ยังใช้ PIN)
const LANE_PIN = process.env.P39_LANE_PIN || "02b67f91"; // ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · re-pin a2c9a4c7 → 02b67f91) // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP2: หมุด = ฐานก่อน P3.9 ที่รวม P3.4/P3.5 แล้ว · ST1/ST5 เห็นการเปลี่ยนแปลงของใบ · ST4 เทียบ prisma/register/service/outbox)

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: S สถิต · T tool อ่าน/ด่าน · P ข้อเสนอ/เขียน · A จุดผิดปกติ · B สรุปเช้า · V ความเป็นส่วนตัว · Z คืนสภาพ
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P3.9-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── TL เครื่องมือ ──
  D("TL1", "T", "[R1 มติ 1] สกิล sales = 15 ชื่อ (SALES_TOOLS) · toolRegistry มีทุกชื่อครั้งเดียว · posToolInfos = 11 ชื่อตาม TOOL_SPEC · posKindAccess/posDestructiveKinds/posToolScope ตามตาราง · kindAccessOf(pos_draft_po) = inventory.po.create · assertSkillRegistryComplete ผ่าน"),
  D("TL2", "T", "[R1 มติ 1] sales_summary (เจ้าของ · D−14..D−1) = totals.netSalesSatang ของ reportDailySales ช่วงเดียวกัน (คืนเงิน/ยกเลิกถูกหัก — ≠ Σ grandTotal PAID ของช่วง)"),
  D("TL3", "T", "[R1 ⚠️4] แคชเชียร์ A (pos.sale.create อย่างเดียว) + สมาชิกไม่มีสิทธิ์ POS → sales_summary ปฏิเสธ (error ไม่มียอด) · ไม่ถูกยื่น (toolsOfferedTo) · ตัวควบคุมบวก: แคชเชียร์ pos_find_product บาร์โค้ด → เจอสินค้า"),
  D("TL4", "T", "[R1 R7] ผู้จัดการ A → sales_summary = reportDailySales ของผู้จัดการ (สาขา A เท่านั้น ≠ ยอดเจ้าของ) · unitId B → error"),
  D("TL5", "T", "[R1 ⚠️5] พนักงานมี pos.report.view ไม่มี pos.report.anomaly → pos_anomalies ปฏิเสธ · ผู้จัดการ A → ได้ผล (ไม่ error)"),
  D("TL6", "T", "[R2] pos_top_products (14 วัน · > 10 สินค้าขาย) → แถว ≤ 10 · JSON ≤ 8 KB · ทุกผลของ tool อ่านในรอบนี้ ≤ 8 KB"),
  D("TL7", "T", "[R1 P2.13 มติ 7] คีย์ pos-read: sales_summary ได้ผล · pos_set_price / void_sale / pos_create_sale ปฏิเสธ ไม่มีข้อเสนอ · toolAllowedForApiKey + posToolAllowedForScopes ตรงกัน"),
  D("TL8", "T", "[R1] ข้อมูลร้าน T2 ไม่โผล่ในผลของเจ้าของ T (ชื่อสินค้า/ยอด) · actor ของ T2 บน ctx ของ T → ปฏิเสธ · unitId ของ T2 → error"),
  D("TL9", "T", "[fix1 F3 · CD-P39c] คีย์กลาง (scope ว่าง ไม่ผูกระบบ): sales_summary/sales_by_day ได้ (CD-7) · void_sale + pos_create_sale + pos_set_price ปฏิเสธ (toolAllowedForApiKey + posToolAllowedForScopes + runTool) · ไม่มีข้อเสนอ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 TL9)
  // ── PR ข้อเสนอ ──
  D("PR1", "P", "[R1 มติ 7] ผู้จัดการ A pos_set_price → ข้อเสนอ PENDING kind pos.products.setPrice · ราคายังไม่เปลี่ยน · ผลมี proposalId + waiting user_confirm"),
  D("PR2", "P", "[R1 มติ 7] ผู้จัดการยืนยัน → ok · ราคาเปลี่ยนครั้งเดียวผ่าน catalog · AuditLog ของสินค้าโดยผู้จัดการ actorType USER ≥ 1"),
  D("PR3", "P", "[R1] ยืนยันซ้ำ → ok:false \"ถูกดำเนินการ…\" · ราคา/audit Δ0"),
  D("PR4", "P", "[R1 มติ 7] ข้อเสนอตั้งราคาในห้องของแคชเชียร์ (payload จริงของ tool) แคชเชียร์กด → ok:false · คง PENDING · ราคาไม่เปลี่ยน · แคชเชียร์ไม่ได้รับ pos_set_price"),
  D("PR5", "P", "[R1] reject → true + REJECTED · ราคาไม่เปลี่ยน"),
  D("PR6", "P", "[R1 มติ 7] แคชเชียร์ pos_set_availability 86 → ยืนยัน → PosAvailabilityMark ของสาขา A (markedBy แคชเชียร์) · คืนขาย → ยืนยัน → mark หาย"),
  D("PR7", "P", "[R4 มติ 2] void_sale ไม่มี reason → error ไม่มีข้อเสนอ · มี reason → kind pos.sales.void DESTRUCTIVE · ชั้นแรก needsSecondConfirm (PAID) · ชั้นสอง VOIDED · audit pos.sale.void ผู้จัดการ + reason"),
  D("PR8", "P", "[R4 มติ 2] บิลที่ AI เปิด (pos_create_sale · sourceModule AI) → void_sale ยืนยัน 2 ชั้น → VOIDED · กติกา POS_VOID ≥ ฿1,000: void บิล ฿1,200 → ok:false · บิลยัง PAID · คำขอ POS_VOID 1 ใบ"),
  D("PR9", "P", "[R3 มติ 9] pos_create_sale: ผู้จัดการ A ระบุสาขา B → ไม่มีบิล · แคชเชียร์ บรรทัดราคาเอง (ไม่มีในแคตตาล็อก) ไม่มี priceOverride → ไม่มีบิล · บรรทัดแคตตาล็อก → บิล AI สาขา A · createSale( ใน proposals.ts = 1"),
  D("PR10", "P", "[R5 มติ 8] purchaseSuggestions: น้ำ qty = 28 − 5 = 23 + ผู้ขาย PO ล่าสุด · เสื้อ supplierId null · ของพอ ไม่อยู่ · pos_draft_po → ยืนยัน → PO DRAFT 1 ใบ (ผู้ขายล่าสุด · น้ำ 23) · ยืนยันซ้ำ = ยังคง 1"),
  // ── AN จุดผิดปกติ ──
  D("PR11", "P", "[fix1 F2=N1 · CD-P39c] propose_plan ที่มีขั้น POS (void_sale · pos.products.setPrice · pos_draft_po) → ปฏิเสธตั้งแต่เสนอ · ไม่มีแผนเกิด (ไม่มีแผนทำครึ่งเดียว) · ตัวควบคุม: แผนที่ไม่มีขั้น POS สร้างได้"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 PR11)
  D("PR12", "P", "[fix1 F4=N4 · CD-P39c] ผู้จัดการ A เสนอ void บิลสาขา B → ปฏิเสธ · ไม่มีเลขบิล/ยอดของ B ในผล · ไม่มีข้อเสนอ · การ์ดตั้งราคา: สินค้าทุกสาขา = \"ทุกสาขา\" · สินค้าสาขา A = \"สาขา <ชื่อ>\""), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 PR12)
  D("PR13", "P", "[fix2 N6 · CD-P39d] pos_set_availability ของสินค้าทุกสาขาโดยไม่ระบุ unitId → ปฏิเสธตอนเสนอ (\"ระบุสาขา\") · ไม่มีข้อเสนอ · ระบุ unitId → เสนอได้ (ตัวควบคุม)"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix2 PR13)
  D("AN1", "A", "[R11 มติ 6] A11: pos.staff.schedule_override ×3 ของผู้จัดการ/สาขา A/D−1 → แถว A11 count 3 refType USER · เจ้าของ ×2 → ไม่มีแถว"),
  D("AN2", "A", "[R4 มติ 2] A1 นับ void ของ AI: audit pos.sale.void ผู้จัดการ (PR7) → แถว A1 ของผู้จัดการ (เกณฑ์ A1.count 1 ของฟิกซ์เจอร์)"),
  D("AN3", "A", "[R11] POS_ANOMALY_RULES = A1…A11 · ค่าปริยาย A11 {count 3} · A1–A10 เดิม · ตัวอ่านตัดช่วง A11 (0→1 · 5000→1000 · \"x\"→3)"),
  D("AN5", "A", "[fix1 F1=N3 · CD-P39c] รหัสเครื่องเดียวกันในสาขา A และ B: override รูป P3.5 (targetType PosStaffPin ของสาขา A) ×3 → A11 ที่สาขา A ไม่ใช่ B · รหัสกำกวมที่ไม่มีแถว PIN → ไม่นับ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 AN5)
  D("AN4", "A", "[R10 R6] anomalyInBrief false → loadBriefInput.anomalies null + ไม่มีบรรทัดจุดผิดปกติ · true → มี A11 (ตัวควบคุม)"),
  // ── BR สรุปเช้า ──
  D("BR1", "B", "[R6 R12] composeBrief fixture F1 (ครบทุกส่วน) th + en = ข้อความตายตัวทุกบรรทัด + title + sections"),
  D("BR2", "B", "[R6] composeBrief F2 (ส่วนที่ถูกปฏิเสธ = ไม่มีบรรทัด · สัปดาห์ก่อน 0 = ไม่มีบรรทัด) + F3 (deltaBp −4999.5 → −49.99% · ไม่พบจุดผิดปกติ · ใกล้หมด ≤ 5 · ขาด/เกิน 0 ไม่แสดง) th + en"),
  D("BR3", "B", "[R6 R7] loadBriefInput ของพนักงาน view-only → anomalies null · daily ไม่ null (ตัวควบคุม) · ของผู้จัดการ A → anomalies เป็นแถว"),
  D("BR4", "B", "[R7] loadBriefInput เจ้าของ = reportDailySales เจ้าของ (A+B) · ผู้จัดการ A = ของผู้จัดการ (A) · ต่างกัน · stockRisks ของเจ้าของมีน้ำ"),
  D("BR5", "B", "[R8 R9 มติ 4 5] 05:10 → 0 · 06:10 → 1 ใบต่อผู้รับ (เจ้าของ + ผู้จัดการที่เลือกไว้) · พนักงานใน managerUserIds ไม่ได้ · title/body = composeBrief(loadBriefInput ของผู้รับ) th · 06:40 → 0 ใบใหม่"),
  D("BR6", "B", "[R8] ยิงพร้อมกัน 2 รอบ (06:20) → 1 ใบต่อผู้รับ"),
  D("BR7", "B", "[R9] พลาด 06:00 → 09:10 ส่งตามหลัง 1 ใบต่อผู้รับ · push ถึงเครื่องของเจ้าของ + ผู้จัดการ"),
  D("BR8", "B", "[R10] ai.enabled false → 0 · brief.enabled false → 0 · posAiSettings ค่าปริยาย + ตัดค่าเพี้ยน (hourBkk 24 → 6 · managerUserIds สตริงไม่ซ้ำ)"),
  D("BR9", "B", "[R8 มติ 4] push (post ฉีด) ส่งเฉพาะ token ของผู้รับ — ไม่มี token ของพนักงาน/แคชเชียร์ทุกรอบ"),
  D("BR10", "B", "[fix1 F5=N2 · CD-P39c] ระบบ POS 2 ระบบชื่อเดียวกัน → เจ้าของได้ 2 ใบ (หัวเรื่องไม่ชน) · ผู้รับที่ทุกส่วนถูกปฏิเสธ (ผู้จัดการของสาขาระบบอื่น) → ไม่มีแจ้งเตือนเปล่า · ทุกใบมีเนื้อความ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 BR10)
  // ── PV ความเป็นส่วนตัว ──
  D("PV1", "V", "[R2 §5] ผลของ tool ทุกตัว + BriefInput + composeBrief + แจ้งเตือน ไม่มี /staffCommission|payroll|salary|hrPay|pinHash|phone|email/i (ตัวควบคุม: regex จับแถว User ได้)"),
  D("PV2", "V", "[R7 R8] แจ้งเตือนสรุปเช้าทุกใบ recipientUserId ไม่ null"),
  D("PV3", "V", "[R1 มติ 1] งานภายใน scheduled-task (aiSystemActor) เรียก sales_summary → ปฏิเสธ (ไม่มียอด)"),
  D("PV4", "V", "[R2 §5] ไม่มีไฟล์ \"use client\" import ai-brief.ts / ai-insights.ts / pos/api/tools.ts · ไฟล์ใหม่ไม่อ่าน commission / hr / staffCommission"),
  // ── ST สถิต ──
  D("ST1", "S", "[R1 มติ 1 · F13.15] op ที่ประกาศ tool = TOOL_SPEC (11 · ชื่อตรง) · op 49 ตัว (หลัง P3.4) · skills.ts sales.tools = SALES_TOOLS · fitness F13.15 ไม่ตรึง \"ไม่มี tool\" แล้ว"),
  D("ST2", "S", "[R1] pos/api/tools.ts export 7 ชื่อ · ไม่ import @/lib/ai/* · ไม่ import prisma ดิบ · ai/tools-pos.ts export posTools · ai/tools.ts ...posTools() + ไม่มี tool เขียนมือชื่อ sales_summary/sales_by_day"),
  D("ST3", "S", "[⚠️8 p2.8 ST6] src/lib/modules/pos/** ไม่ import @/lib/modules/chat · @/lib/modules/shop · @/lib/ai/*"),
  D("ST4", "S", "[§3 มติ 10] ไม่มี diff เทียบหมุด ใน prisma/ · pos/register*.ts · pos/service.ts · pos/refund*.ts · outbox-consumers.ts · pos-sale-contract.json (+ ไม่มีไฟล์ใหม่ใต้ prisma/)"),
  D("ST5", "S", "[R5 มติ 8] inventory/index.ts diff เทียบหมุด = เพิ่มอย่างเดียว · บล็อกเดียว `// POS P3.9 ▸ … ◂` · re-export ล้วน (มี createPo)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) 0 แถวทุกตารางที่มี tenantId (AiProposal · AiConversation · AppNotification · PurchaseOrder/PoLine · AuditLog · PosSale · PushDevice …) + Tenant + User ของรอบ"),
  D("Z2", "-", "ลายนิ้วมือนอกร้านชั่วคราว (PosSale · AiProposal · AppNotification · PurchaseOrder · AuditLog นับ) เท่าเดิม"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตารางสัญญา ═════════════════════════
type ToolSpec = readonly [opId: string, tool: string, kind: "read" | "write" | "danger", action: string];
/** R1 · มติ 1: 11 op ได้ `tool` (ชื่อเดิม 3 + ใหม่ 8) · op ไม่เพิ่ม (48) */
const TOOL_SPEC: readonly ToolSpec[] = [
  ["sales.summary", "sales_summary", "read", "pos.report.view"],
  ["sales.byDay", "sales_by_day", "read", "pos.report.view"],
  ["reports.products", "pos_top_products", "read", "pos.report.view"],
  ["reports.shifts", "pos_shift_report", "read", "pos.report.view"],
  ["shifts.xReport", "pos_shift_now", "read", "pos.shift.manage"],
  ["reports.anomalies", "pos_anomalies", "read", "pos.report.anomaly"],
  ["reports.hourly", "pos_hourly", "read", "pos.report.view"],
  ["products.lookup", "pos_find_product", "read", "pos.sale.create"],
  ["products.setPrice", "pos_set_price", "write", "pos.product.setPrice"],
  ["products.availability", "pos_set_availability", "write", "pos.sale.create"],
  ["sales.void", "void_sale", "danger", "pos.sale.void"],
];
const OP_COUNT = 49; // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP2: P3.4 sync.sales merged before P3.9 — 48 → 49 ops)
const LEGACY_SALES = ["sales_summary", "sales_by_day", "pos_create_sale", "void_sale", "record_expense", "financial_summary"];
const NEW_SALES = ["pos_top_products", "pos_shift_report", "pos_shift_now", "pos_anomalies", "pos_hourly", "pos_find_product", "pos_set_price", "pos_set_availability", "pos_draft_po"];
const SALES_TOOLS = [...LEGACY_SALES, ...NEW_SALES];
const KIND_SPEC: Record<string, { module: string; action: string }> = {
  "pos.products.setPrice": { module: "pos", action: "pos.product.setPrice" },
  "pos.products.availability": { module: "pos", action: "pos.sale.create" },
  "pos.sales.void": { module: "pos", action: "pos.sale.void" },
};
const DRAFT_PO_KIND = "pos_draft_po";
const DRAFT_PO_ACCESS = { module: "inventory", action: "inventory.po.create" };
const BRIEF_TH = "สรุปเช้า POS";
const BRIEF_EN = "POS morning brief";
const PRIVACY_RE = /staffCommission|payroll|salary|hrPay|pinHash|phone|email/i;
const MAX_TOOL_BYTES = 8 * 1024;

// ── golden ของ composeBrief (R6 · ข้อสอบตั้ง — ผู้สร้างต้องได้ตรงตัวอักษร) ──
const F1_INPUT = {
  businessDate: "2026-10-15",
  systemName: "ร้านคิวซี",
  daily: { netSalesSatang: 1_234_550, billCount: 12, avgBillSatang: 102_879 },
  lastWeek: { netSalesSatang: 1_100_000, billCount: 10, avgBillSatang: 110_000 },
  topProducts: [
    { name: "ลาเต้", qty: 12, salesSatang: 78_000 },
    { name: "น้ำเปล่า", qty: 8, salesSatang: 8_000 },
    { name: "เสื้อยืด", qty: 3, salesSatang: 60_000 },
  ],
  bottomProducts: [{ name: "ขนมเปี๊ยะ", qty: 1, salesSatang: 2_500 }],
  peakHour: { hour: 12, netSalesSatang: 350_000 },
  openShifts: 1,
  overShort: [{ label: "เคาน์เตอร์ 1", overShortSatang: -15_000 }],
  anomalies: [{ rule: "A1", count: 2 }, { rule: "A11", count: 1 }],
  stockRisks: [{ name: "น้ำเปล่า", onHand: 5, reorderPoint: 10 }],
  soldOut: [{ name: "ลาเต้เย็น" }],
  pendingApprovals: 2,
  pendingProposals: 1,
};
const F2_INPUT = {
  businessDate: "2026-10-15",
  systemName: "ร้านคิวซี",
  daily: { netSalesSatang: 500_000, billCount: 4, avgBillSatang: 125_000 },
  lastWeek: { netSalesSatang: 0, billCount: 0, avgBillSatang: 0 },
  topProducts: [{ name: "น้ำเปล่า", qty: 4, salesSatang: 4_000 }],
  bottomProducts: [],
  peakHour: null,
  openShifts: 0,
  overShort: [],
  anomalies: null,
  stockRisks: null,
  soldOut: [],
  pendingApprovals: 0,
  pendingProposals: null,
};
const F3_INPUT = {
  businessDate: "2026-10-14",
  systemName: "Shop B",
  daily: { netSalesSatang: 10_001, billCount: 1, avgBillSatang: 10_001 },
  lastWeek: { netSalesSatang: 20_000, billCount: 2, avgBillSatang: 10_000 },
  topProducts: [],
  bottomProducts: [],
  peakHour: { hour: 9, netSalesSatang: 10_001 },
  openShifts: 2,
  overShort: [{ label: "POS 2", overShortSatang: 2_000 }, { label: "POS 3", overShortSatang: 0 }],
  anomalies: [],
  stockRisks: [
    { name: "s1", onHand: 0, reorderPoint: 3 },
    { name: "s2", onHand: 1, reorderPoint: 3 },
    { name: "s3", onHand: 2, reorderPoint: 3 },
    { name: "s4", onHand: 0, reorderPoint: 1 },
    { name: "s5", onHand: 1, reorderPoint: 2 },
    { name: "s6", onHand: 0, reorderPoint: 9 },
  ],
  soldOut: [{ name: "ไข่" }, { name: "นม" }],
  pendingApprovals: null,
  pendingProposals: 3,
};
type Golden = { title: string; lines: string[]; sections: string[] };
const GOLDEN: Record<"F1" | "F2" | "F3", { input: Any; th: Golden; en: Golden }> = {
  F1: {
    input: F1_INPUT,
    th: {
      title: "สรุปเช้า POS · ร้านคิวซี · 2026-10-15",
      lines: [
        "ยอดขายสุทธิ ฿12,345.50 · 12 บิล · เฉลี่ย ฿1,028.79/บิล",
        "เทียบวันเดียวกันสัปดาห์ก่อน +12.23%",
        "ขายดี: ลาเต้ 12 · น้ำเปล่า 8 · เสื้อยืด 3",
        "ขายน้อย: ขนมเปี๊ยะ 1",
        "ชั่วโมงขายดี 12:00-13:00 ฿3,500.00",
        "กะที่ยังไม่ปิด 1 กะ",
        "เงินขาด/เกิน: เคาน์เตอร์ 1 -฿150.00",
        "จุดผิดปกติ: A1 ×2 · A11 ×1",
        "ใกล้หมด: น้ำเปล่า (5/10)",
        "ของหมด (86): ลาเต้เย็น",
        "รออนุมัติ 2 รายการ",
        "ข้อเสนอ AI รอยืนยัน 1 รายการ",
      ],
      sections: ["sales", "vsLastWeek", "top", "bottom", "peak", "openShifts", "overShort", "anomalies", "stock", "soldOut", "approvals", "proposals"],
    },
    en: {
      title: "POS morning brief · ร้านคิวซี · 2026-10-15",
      lines: [
        "Net sales ฿12,345.50 · 12 bills · avg ฿1,028.79/bill",
        "vs same day last week +12.23%",
        "Top sellers: ลาเต้ 12 · น้ำเปล่า 8 · เสื้อยืด 3",
        "Slow sellers: ขนมเปี๊ยะ 1",
        "Peak hour 12:00-13:00 ฿3,500.00",
        "Open shifts: 1",
        "Cash over/short: เคาน์เตอร์ 1 -฿150.00",
        "Anomalies: A1 ×2 · A11 ×1",
        "Low stock: น้ำเปล่า (5/10)",
        "Sold out (86): ลาเต้เย็น",
        "Pending approvals: 2",
        "AI proposals awaiting confirmation: 1",
      ],
      sections: ["sales", "vsLastWeek", "top", "bottom", "peak", "openShifts", "overShort", "anomalies", "stock", "soldOut", "approvals", "proposals"],
    },
  },
  F2: {
    input: F2_INPUT,
    th: { title: "สรุปเช้า POS · ร้านคิวซี · 2026-10-15", lines: ["ยอดขายสุทธิ ฿5,000.00 · 4 บิล · เฉลี่ย ฿1,250.00/บิล", "ขายดี: น้ำเปล่า 4"], sections: ["sales", "top"] },
    en: { title: "POS morning brief · ร้านคิวซี · 2026-10-15", lines: ["Net sales ฿5,000.00 · 4 bills · avg ฿1,250.00/bill", "Top sellers: น้ำเปล่า 4"], sections: ["sales", "top"] },
  },
  F3: {
    input: F3_INPUT,
    th: {
      title: "สรุปเช้า POS · Shop B · 2026-10-14",
      lines: [
        "ยอดขายสุทธิ ฿100.01 · 1 บิล · เฉลี่ย ฿100.01/บิล",
        "เทียบวันเดียวกันสัปดาห์ก่อน -49.99%",
        "ชั่วโมงขายดี 09:00-10:00 ฿100.01",
        "กะที่ยังไม่ปิด 2 กะ",
        "เงินขาด/เกิน: POS 2 +฿20.00",
        "จุดผิดปกติ: ไม่พบ",
        "ใกล้หมด: s1 (0/3) · s2 (1/3) · s3 (2/3) · s4 (0/1) · s5 (1/2)",
        "ของหมด (86): ไข่ · นม",
        "ข้อเสนอ AI รอยืนยัน 3 รายการ",
      ],
      sections: ["sales", "vsLastWeek", "peak", "openShifts", "overShort", "anomalies", "stock", "soldOut", "proposals"],
    },
    en: {
      title: "POS morning brief · Shop B · 2026-10-14",
      lines: [
        "Net sales ฿100.01 · 1 bill · avg ฿100.01/bill",
        "vs same day last week -49.99%",
        "Peak hour 09:00-10:00 ฿100.01",
        "Open shifts: 2",
        "Cash over/short: POS 2 +฿20.00",
        "Anomalies: none",
        "Low stock: s1 (0/3) · s2 (1/3) · s3 (2/3) · s4 (0/1) · s5 (1/2)",
        "Sold out (86): ไข่ · นม",
        "AI proposals awaiting confirmation: 3",
      ],
      sections: ["sales", "vsLastWeek", "peak", "openShifts", "overShort", "anomalies", "stock", "soldOut", "proposals"],
    },
  },
};

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P3.9-") ? id : `P3.9-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => {
  const abs = p.startsWith("/") ? p : join(ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
};
const short = (v: unknown, n = 160) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const J = (v: unknown) => JSON.stringify(v);
/** JSON แบบเรียงคีย์ (เทียบวัตถุโดยไม่สนลำดับคีย์) */
const C = (v: unknown): string => {
  const norm = (x: unknown): unknown => (Array.isArray(x) ? x.map(norm) : isRecord(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])])) : x);
  return JSON.stringify(norm(v));
};
const bytes = (s: string) => Buffer.byteLength(s ?? "", "utf8");
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
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const srcOf = (f: string) => stripComments(rd(f));
function gitStr(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    return null;
  }
}
const exportsName = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
/** sections ของ composeBrief: array ตรง ๆ หรือ object (คีย์ตามลำดับ) */
const sectionIds = (s: unknown): string[] => (Array.isArray(s) ? s.map(String) : isRecord(s) ? Object.keys(s) : []);

const POS_DIR = "src/lib/modules/pos";
const F = {
  bridge: `${POS_DIR}/api/tools.ts`,
  adapter: "src/lib/ai/tools-pos.ts",
  aiTools: "src/lib/ai/tools.ts",
  skills: "src/lib/ai/skills.ts",
  proposals: "src/lib/ai/proposals.ts",
  opsDir: `${POS_DIR}/api/ops`,
  opTs: `${POS_DIR}/api/op.ts`,
  insights: `${POS_DIR}/ai-insights.ts`,
  briefShared: `${POS_DIR}/ai-brief-shared.ts`,
  brief: `${POS_DIR}/ai-brief.ts`,
  fitness: "scripts/fitness.mts",
  inventoryIdx: "src/lib/modules/inventory/index.ts",
  contract: "scripts/pos-sale-contract.json",
  outbox: "src/lib/outbox-consumers.ts",
};
const BRIDGE_EXPORTS = ["posToolInfos", "runPosTool", "dispatchPosKind", "posKindAccess", "posDestructiveKinds", "posToolScope", "posToolAllowedForScopes"];
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "PV4"].map((x) => `P3.9-${x}`);
const skipReasons: string[] = [];
for (const f of [F.bridge, F.adapter, F.insights, F.briefShared, F.brief]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);

/** แกะ op จากซอร์ส ops/*.ts (ไม่ import — ใช้ได้ใน --no-db) */
type ParsedOp = { id: string; kind: string; tool: string | null };
function parseOps(): ParsedOp[] {
  const ops: ParsedOp[] = [];
  for (const file of walk(F.opsDir)) {
    const src = stripComments(rd(file));
    for (const m of src.matchAll(/definePosOp\s*\(\s*\{/g)) {
      const body = src.slice(m.index!, m.index! + 3000);
      const head = body.slice(0, body.indexOf("handler") > 0 ? body.indexOf("handler") : body.length);
      const str = (k: string) => new RegExp(`\\b${k}\\s*:\\s*"([^"]*)"`).exec(head)?.[1] ?? "";
      const tool = /\btool\s*:\s*\{[^}]*?\bname\s*:\s*"([^"]+)"/.exec(head)?.[1] ?? null;
      ops.push({ id: str("id"), kind: str("kind"), tool });
    }
  }
  return ops;
}
/** รายชื่อ tool ของสกิล sales จากข้อความ skills.ts */
function salesSkillToolsFromSrc(): string[] | null {
  const sk = srcOf(F.skills);
  const at = sk.indexOf('id: "sales"');
  if (at < 0) return null;
  const blk = sk.slice(at, at + 2500);
  const m = /tools\s*:\s*\[([\s\S]*?)\]/.exec(blk);
  if (!m) return null;
  return [...m[1]!.matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]!);
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
const stNotes: Record<string, string[]> = {};
function runStatic(): void {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · หมุด ${PIN}) ──`);
  // ST1 ทะเบียน tool
  {
    const p: string[] = [];
    const ops = parseOps();
    if (ops.length !== OP_COUNT) p.push(`op ${ops.length} ตัว (คาด ${OP_COUNT})`);
    const withTool = ops.filter((o) => o.tool);
    for (const [opId, tool, kind] of TOOL_SPEC) {
      const o = ops.find((x) => x.id === opId);
      if (!o) p.push(`ไม่มี op ${opId}`);
      else if (o.tool !== tool) p.push(`${opId} tool ${o.tool ?? "ไม่มี"} (คาด ${tool})`);
      else if (o.kind !== kind) p.push(`${opId} kind ${o.kind} (คาด ${kind})`);
    }
    const extra = withTool.filter((o) => !TOOL_SPEC.some(([id]) => id === o.id)).map((o) => `${o.id}:${o.tool}`);
    if (extra.length) p.push(`op เกินตารางประกาศ tool: ${extra.join(",")}`);
    const sales = salesSkillToolsFromSrc();
    if (!sales) p.push("skills.ts อ่านสกิล sales ไม่ได้");
    else {
      const miss = SALES_TOOLS.filter((n) => !sales.includes(n));
      const more = sales.filter((n) => !SALES_TOOLS.includes(n));
      if (miss.length) p.push(`สกิล sales ขาด ${miss.join(",")}`);
      if (more.length) p.push(`สกิล sales เกิน ${more.join(",")}`);
    }
    const fit = rd(F.fitness);
    if (!/F13\.15/.test(fit)) p.push("fitness.mts ไม่มี F13.15");
    else if (/posWithTool\.length\s*===\s*0/.test(fit)) p.push("fitness F13.15 ยังตรึง \"ไม่มี op ประกาศ tool\" (ORACLE-EDIT ของผู้สร้าง)");
    stNotes.ST1 = p;
  }
  // ST2 สะพาน + adapter
  {
    const p: string[] = [];
    const raw = rd(F.bridge);
    if (!raw) p.push(`ไม่มี ${F.bridge}`);
    else {
      const b = stripComments(raw);
      for (const n of BRIDGE_EXPORTS) if (!exportsName(b, n)) p.push(`api/tools.ts ไม่ export ${n}`);
      if (/from\s+["']@\/lib\/ai\//.test(b) || /import\(\s*["']@\/lib\/ai\//.test(b)) p.push("api/tools.ts import @/lib/ai/*");
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(b) || /new\s+PrismaClient/.test(b)) p.push("api/tools.ts import prisma ดิบ");
    }
    const ad = srcOf(F.adapter);
    if (!ad) p.push(`ไม่มี ${F.adapter}`);
    else if (!exportsName(ad, "posTools")) p.push("tools-pos.ts ไม่ export posTools");
    const at = srcOf(F.aiTools);
    if (!/\.\.\.\s*posTools\s*\(\s*\)/.test(at)) p.push("ai/tools.ts ไม่มี ...posTools()");
    if (!/from\s+["']\.\/tools-pos["']/.test(at)) p.push("ai/tools.ts ไม่ import ./tools-pos");
    for (const n of ["sales_summary", "sales_by_day"]) if (new RegExp(`name:\\s*"${n}"`).test(at)) p.push(`ai/tools.ts ยังมี tool เขียนมือ ${n}`);
    stNotes.ST2 = p;
  }
  // ST3 เส้นข้ามโมดูล
  {
    const p: string[] = [];
    for (const f of walk(POS_DIR)) {
      const c = srcOf(f);
      for (const [re, what] of [[/["']@\/lib\/modules\/chat(\/|["'])/, "chat"], [/["']@\/lib\/modules\/shop(\/|["'])/, "shop"], [/["']@\/lib\/ai\//, "@/lib/ai"]] as const) {
        if (re.test(c)) p.push(`${f.replace(`${POS_DIR}/`, "")} → ${what}`);
      }
    }
    stNotes.ST3 = p;
  }
  // ST4 หมุดไฟล์ห้ามแตะ
  {
    const p: string[] = [];
    const changed = gitStr(["diff", "--name-only", LANE_PIN]); // ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · หมุดเลน)
    if (changed === null) p.push(`git diff ${LANE_PIN} ไม่ได้`);
    const untracked = gitStr(["ls-files", "--others", "--exclude-standard"]) ?? "";
    const files = [...(changed ?? "").split("\n"), ...untracked.split("\n")].map((x) => x.trim()).filter(Boolean);
    const banned = (f: string) =>
      f.startsWith("prisma/") ||
      /^src\/lib\/modules\/pos\/register[^/]*\.ts$/.test(f) ||
      f === `${POS_DIR}/service.ts` ||
      /^src\/lib\/modules\/pos\/refund[^/]*\.ts$/.test(f) ||
      f === F.outbox ||
      f === F.contract;
    const hit = [...new Set(files.filter(banned))];
    if (hit.length) p.push(`แก้ไฟล์ต้องห้าม: ${hit.join(", ")}`);
    stNotes.ST4 = p;
  }
  // ST5 inventory/index.ts = บล็อกเดียว re-export
  {
    const p: string[] = [];
    const d = gitStr(["diff", "-U0", PIN, "--", F.inventoryIdx]);
    if (d === null) p.push(`git diff ${PIN} inventory/index.ts ไม่ได้`);
    else {
      const lines = d.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
      const removed = lines.filter((l) => l.startsWith("-"));
      const added = lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1));
      if (!added.length) p.push("inventory/index.ts ไม่มีบล็อก POS P3.9 (ยังไม่ re-export createPo)");
      if (removed.length) p.push(`ลบบรรทัดเดิม ${removed.length}`);
      const hunks = (d.match(/^@@/gm) ?? []).length;
      if (added.length && hunks !== 1) p.push(`hunk ${hunks} (คาด 1 บล็อก)`);
      if (added.length) {
        if (!/POS P3\.9 ▸/.test(added[0] ?? "") && !added.some((l) => /POS P3\.9 ▸/.test(l))) p.push("ไม่มีเครื่องหมาย `// POS P3.9 ▸`");
        if (!added.some((l) => /◂/.test(l))) p.push("ไม่มีเครื่องหมายปิด ◂");
        const code = stripComments(added.join("\n")).split("\n").map((l) => l.trim()).filter(Boolean);
        const joined = code.join(" ");
        const stmts = joined.split(";").map((s) => s.trim()).filter(Boolean);
        const bad = stmts.filter((s) => !/^export\s+(type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["']$/.test(s));
        if (bad.length) p.push(`ไม่ใช่ re-export: ${short(bad[0], 80)}`);
        if (!/\bcreatePo\b/.test(joined)) p.push("ไม่มี createPo ในบล็อก");
      }
    }
    stNotes.ST5 = p;
  }
  // PV4 สถิต
  {
    const p: string[] = [];
    const IMPORT_RE = /["'](?:@\/lib\/modules\/pos\/(?:ai-brief|ai-insights|api\/tools)|\.{1,2}\/(?:[^"']*\/)?(?:ai-brief|ai-insights|api\/tools))["']/;
    for (const f of walk("src")) {
      const raw = rd(f);
      const head = raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use client["']/.test(head)) continue;
      if (IMPORT_RE.test(stripComments(raw))) p.push(`"use client" ${f} import ไฟล์ฝั่งเซิร์ฟเวอร์ของ P3.9`);
    }
    const NO_HR = /staffCommission|reportStaffCommission|["']commission["']|@\/lib\/modules\/hr\b|hrPay|payroll/;
    for (const f of [F.bridge, F.adapter, F.insights, F.briefShared, F.brief]) {
      const c = srcOf(f);
      if (c && NO_HR.test(c)) p.push(`${f.split("/").pop()} อ้าง commission/hr/payroll`);
    }
    stNotes.PV4 = p;
  }
}
function finishStatic(): void {
  for (const id of ["ST1", "ST2", "ST3", "ST4", "ST5", "PV4"]) {
    const p = stNotes[id] ?? ["ไม่ได้ตรวจ"];
    chk(id, p.length === 0, "ตามตารางชื่อ", joinP(p));
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
  try {
    runStatic();
    finishStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, pin: PIN, missing: skipReasons })}`);
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

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือ ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const TEMP_LIKE = "posqc-%";
const FP_TABLES: [string, string][] = [["PosSale", "status"], ["AiProposal", "status"], ["AppNotification", "readAt"], ["PurchaseOrder", "status"]];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE $1))`,
        TEMP_LIKE,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 30)}`;
    }
  }
  try {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE $1))`, TEMP_LIKE)) as Any[];
    out.AuditLog = `${r[0]?.n ?? "?"}`;
  } catch (e) {
    out.AuditLog = `err:${(e as Error).message.slice(0, 30)}`;
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3.9 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · Z เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีโมดูล/ฟังก์ชัน — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, missing: true };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : "UNKNOWN");
const toolsMod = await tryImport("@/lib/ai/tools");
const propMod = await tryImport("@/lib/ai/proposals");
const actorMod = await tryImport("@/lib/ai/actor");
const convMod = await tryImport("@/lib/ai/conversation-owner");
const accessMod = await tryImport("@/lib/ai/tool-access");
const skillsMod = await tryImport("@/lib/ai/skills");
const bridge = existsSync(join(ROOT, F.bridge)) ? await tryImport("@/lib/modules/pos/api/tools") : null;
const adapter = existsSync(join(ROOT, F.adapter)) ? await tryImport("@/lib/ai/tools-pos") : null;
const insights = existsSync(join(ROOT, F.insights)) ? await tryImport("@/lib/modules/pos/ai-insights") : null;
const briefShared = existsSync(join(ROOT, F.briefShared)) ? await tryImport("@/lib/modules/pos/ai-brief-shared") : null;
const briefMod = existsSync(join(ROOT, F.brief)) ? await tryImport("@/lib/modules/pos/ai-brief") : null;
const setShared = await tryImport("@/lib/modules/pos/settings-shared");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const regFacade = await tryImport("@/lib/modules/pos/register");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const posSvc = await tryImport("@/lib/modules/pos/service");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const sysSvc = await tryImport("@/lib/modules/system/service");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const procMod = await tryImport("@/lib/modules/inventory/procurement");
const apSvc = await tryImport("@/lib/modules/approval/service");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p39-${RAND}`;
const T_SLUG = `posqc-p39-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";

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

// ── เวลา: D = วันนี้ (ไทย) · at(k, hh, mm) = วัน D−k เวลาไทย hh:mm ──
const DAY_MS = 86_400_000;
const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const D0 = bkkYmd(new Date());
const dayStr = (k: number) => new Date(Date.parse(`${D0}T00:00:00Z`) - k * DAY_MS).toISOString().slice(0, 10);
const at = (k: number, hh: number, mm = 0) => new Date(Date.parse(`${dayStr(k)}T00:00:00Z`) + (hh - 7) * 3600_000 + mm * 60_000);
const YESTERDAY = dayStr(1);

/** ค้นค่าตัวเลขในผล tool: สตางค์ตรง ๆ · บาท (n/100) · ข้อความบาท 2 ตำแหน่ง */
function hasAmount(raw: string, satang: number): boolean {
  let j: Any = null;
  try {
    j = JSON.parse(raw);
  } catch {
    /* ไม่ใช่ JSON */
  }
  const nums: number[] = [];
  const strs: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "number") nums.push(v);
    else if (typeof v === "string") strs.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (isRecord(v)) Object.values(v).forEach(visit);
  };
  visit(j);
  if (nums.includes(satang) || nums.some((n) => Math.abs(n - satang / 100) < 1e-9)) return true;
  const baht = (satang / 100).toFixed(2);
  const bahtC = (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return strs.some((s) => s.includes(baht) || s.includes(bahtC)) || raw.includes(String(satang));
}
const parseJ = (raw: string): Any => {
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
};
const isErr = (j: Any) => isRecord(j) && j.error !== undefined && j.error !== null && j.error !== "";
function maxArrayLen(v: unknown): number {
  let m = 0;
  const visit = (x: unknown) => {
    if (Array.isArray(x)) {
      m = Math.max(m, x.length);
      x.forEach(visit);
    } else if (isRecord(x)) Object.values(x).forEach(visit);
  };
  visit(v);
  return m;
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const allOutputs: string[] = [];
const readOutputs: string[] = [];
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} · วันนี้ ${D0} ──`);
  let fx = "";
  const notes: string[] = [];
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; tid: string }> = {};
  const PR: Record<string, string> = {};
  const PN: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const step = async <R,>(label: string, fn: () => Promise<R> | R): Promise<R | null> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return r;
  };
  const ean = (first12: string) => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += (i % 2 === 0 ? 1 : 3) * (first12.charCodeAt(i) - 48);
    return first12 + String((10 - (s % 10)) % 10);
  };
  const BARCODE = ean(`886${String(Date.now()).slice(-9)}`);

  // ─── ร้าน · สาขา · ระบบ ───
  try {
    T = (await P.tenant.create({ data: { name: `QC P3.9 AI ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P3.9 ร้านอื่น ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS คิวซี ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ─── ผู้ใช้ + Membership จริง ───
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of [
        ["OWNER", T, "OWNER", ["*"], {}],
        ["MGR", T, "MANAGER", [U.A!], {}],
        ["SUP", T, "STAFF", [U.A!], { "pos.report.view": true }],
        ["CASH", T, "STAFF", [U.A!], { "pos.sale.create": true }],
        ["NOPERM", T, "STAFF", [U.A!], {}],
        ["OWNER2", T2, "OWNER", ["*"], {}],
      ] as const) {
        const u = await P.user.create({ data: { email: `${T_SLUG}-${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: [...ua], permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess: [...ua], perms: { ...perms }, tid };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const M = (k: string): Any => ({ role: US[k]?.role ?? "STAFF", unitAccess: [...(US[k]?.unitAccess ?? [])], permissions: { ...(US[k]?.perms ?? {}) } });
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const rctx = (): Any => ({ tenantId: T, systemId: S.POS ?? "none" });
  const cc = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid("OWNER") });
  const invCtx = (): Any => ({ tenantId: T, systemId: S.INV ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `qc39${RAND}${pfx}${++keyN}`;
  const patchPos = async (fn: (pos: Record<string, Any>) => void) => {
    const s0 = (await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
    const s = isRecord(s0) ? JSON.parse(JSON.stringify(s0)) : {};
    const pos = isRecord(s.pos) ? s.pos : {};
    fn(pos);
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s, pos } } });
  };
  const aiSettings = (over: Record<string, Any> = {}) => ({
    enabled: true,
    brief: { enabled: true, hourBkk: 6, email: false, managerUserIds: [uid("MGR"), uid("SUP"), uid("CASH")] },
    anomalyInBrief: true,
    ...over,
  });
  if (!fx) {
    await step("ค่าตั้ง POS", () =>
      patchPos((pos) => {
        pos.shift = { ...(isRecord(pos.shift) ? pos.shift : {}), required: { register: false, otherSources: false } };
        pos.reports = { ...(isRecord(pos.reports) ? pos.reports : {}), anomaly: { enabled: true, rules: { A1: { count: 1, satang: 100_000 } } } };
        pos.ai = aiSettings();
      }),
    );
  }

  // ─── สินค้า: คลัง (น้ำ W · เสื้อ T · ของพอ Z) + ไม่ผูกคลัง (ขนม · ราคา · 86 · บาร์โค้ด · m1..m12) + T2 ───
  const rowOf = async (invId: string): Promise<string> => String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: invId }, select: { id: true } }).catch(() => null))?.id ?? "");
  if (!fx) {
    await step("สินค้าคลัง", async () => {
      const mkInv = async (key: string, name: string, qty: number, cost: number, price: number, reorderPoint: number) => {
        const it = await invSvc.createItem(invCtx(), { sku: `${TAG}-${key}`, name: `${name} ${RAND}`, unitLabel: "ชิ้น", costSatang: cost, reorderPoint });
        INV[key] = it.id;
        PN[key] = `${name} ${RAND}`;
        if (qty > 0) await invSvc.receive(invCtx(), { itemId: it.id, qty, costSatang: cost, idempotencyKey: `${TAG}-recv-${key}` });
        PR[key] = await rowOf(it.id);
        if (!PR[key]) throw new Error(`${key} ไม่มีแถว PosProduct`);
        must(`setPrice ${key}`, await call(catalog, "setPrice", cc(), PR[key], price));
      };
      await mkInv("W", "น้ำเปล่า", 33, 400, 1000, 10);
      await mkInv("T", "เสื้อยืด", 50, 8000, 20000, 60);
      await mkInv("Z", "ของพอ", 100, 100, 500, 5);
    });
    await step("สินค้าไม่ผูกคลัง", async () => {
      const mk = async (key: string, name: string, price: number, extra: Any = {}) => {
        PN[key] = `${name} ${RAND}`;
        PR[key] = String(must(`createProduct ${key}`, await call(catalog, "createProduct", cc(), { name: PN[key], kind: "PRODUCT", basePriceSatang: price, ...extra }))?.id ?? "");
      };
      await mk("bar", "ขนม", 2500);
      await mk("price", "สินค้าตั้งราคา", 5000, { unitId: U.A }); // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.9 CD-9: all-branch price needs rights at every linked branch — catalog.ts rowWriteVerdict; PR2–PR5 target a unit-A product)
      await mk("p86", "สินค้าหมด", 3000);
      await mk("bc", "สินค้าบาร์โค้ด", 4000, { barcode: BARCODE });
      for (let i = 1; i <= 12; i++) await mk(`m${i}`, `เมนูทดสอบ${i}`, 1000 + i * 10);
      const r = must("createProduct T2", await call(catalog, "createProduct", { tenantId: T2, systemId: S.POSX, actorUserId: uid("OWNER2") }, { name: `สินค้าร้านอื่น ${RAND}`, kind: "PRODUCT", basePriceSatang: 77_700 }));
      PR.X = String(r?.id ?? "");
      PN.X = `สินค้าร้านอื่น ${RAND}`;
    });
  }
  // ─── ผู้ขาย + PO เดิม (น้ำ: เก่า SUP_OLD 30 วัน · ล่าสุด SUP_NEW 20 วัน) ───
  let SUP_OLD = "";
  let SUP_NEW = "";
  if (!fx) {
    await step("ผู้ขาย/PO เดิม", async () => {
      SUP_OLD = String((await procMod.createSupplier(invCtx(), { name: `ผู้ขายเก่า ${RAND}` })).id);
      SUP_NEW = String((await procMod.createSupplier(invCtx(), { name: `ผู้ขายล่าสุด ${RAND}` })).id);
      const po0 = await procMod.createPo(invCtx(), { supplierId: SUP_OLD, lines: [{ itemId: INV.W, qty: 5, costSatang: 380 }] });
      await P.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "createdAt" = $1 WHERE id = $2 AND "tenantId" = $3`, at(30, 10), po0.id, T);
      const po1 = await procMod.createPo(invCtx(), { supplierId: SUP_NEW, lines: [{ itemId: INV.W, qty: 10, costSatang: 400 }] });
      await P.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "createdAt" = $1 WHERE id = $2 AND "tenantId" = $3`, at(20, 10), po1.id, T);
    });
  }

  // ─── ขาย (quote → submit) + เลื่อนเวลา ───
  type Sold = { saleId: string; grand: number };
  const NONE: Sold = { saleId: "", grand: 0 };
  const sell = async (label: string, unit: string, actorK: string, lines: Any[], when: Date | null, dev?: string): Promise<Sold> => {
    if (fx) return NONE;
    const q = await call(regFacade, "quoteRegisterCart", ctxU(unit), A(actorK), { lines });
    const g = q?.ok === true ? Number(q.grandTotalSatang) : NaN;
    if (!Number.isFinite(g)) {
      notes.push(`quote ${label}: ${codeOf(q)} ${short(q?.message ?? "", 60)}`);
      return NONE;
    }
    const r = await call(regFacade, "submitRegisterSale", ctxU(unit, dev), A(actorK), { lines, payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g, expectedGrandTotalSatang: g, idempotencyKey: newKey("reg") });
    const saleId = r?.ok === true ? String(r.saleId ?? "") : "";
    if (!saleId) notes.push(`submit ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    if (saleId && when) await step(`เลื่อนเวลา ${label}`, () => P.$executeRawUnsafe(`UPDATE "PosSale" SET "createdAt" = $1, "paidAt" = $1 WHERE id = $2 AND "tenantId" = $3`, when, saleId, T));
    return { saleId, grand: g };
  };
  const pl = (key: string, qty = 1) => ({ productId: PR[key] ?? `none-${key}`, qty });
  // ประวัติ: น้ำ ×2 ทุกวัน D−1..D−14 (velocity 2/วัน · คงเหลือ 33 − 28 = 5)
  for (let k = 1; k <= 14; k++) await sell(`W-${k}`, "A", "OWNER", [pl("W", 2)], at(k, 12));
  // > 10 สินค้าใน 14 วัน (TL6)
  for (let i = 1; i <= 12; i++) await sell(`m${i}`, "A", "OWNER", [pl(`m${i}`)], at(2, 13, i));
  // D−1: ขนม ×2 → คืน 1 · ขนม ×1 → ยกเลิก · สาขา B ×2 บิล · สัปดาห์ก่อน (D−8) ขนม ×4
  const y1 = await sell("y1", "A", "OWNER", [pl("bar", 2)], at(1, 14));
  const y2 = await sell("y2", "A", "OWNER", [pl("bar")], at(1, 16));
  await sell("b1", "B", "OWNER", [pl("bar", 3)], at(1, 11));
  await sell("b2", "B", "OWNER", [pl("bar", 3)], at(1, 19));
  await sell("lw", "A", "OWNER", [pl("bar", 4)], at(8, 18));
  if (y1.saleId) {
    await step("คืนเงิน y1", async () => {
      const line = await P.posSaleLine.findFirst({ where: { saleId: y1.saleId }, select: { id: true } });
      const r = must("refundSale", await call(refundMod, "refundSale", ctxU("A"), A("OWNER"), { saleId: y1.saleId, lines: [{ lineId: String(line?.id ?? ""), qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 2500 }], reasonCode: "CHANGED_MIND", reason: `ลูกค้าเปลี่ยนใจ ${RAND}`, idempotencyKey: newKey("rf") }));
      const rid = String(r?.refund?.id ?? "");
      if (rid) await P.$executeRawUnsafe(`UPDATE "PosSale" SET "createdAt" = $1, "paidAt" = $1 WHERE id = $2 AND "tenantId" = $3`, at(1, 15), rid, T);
    });
  }
  if (y2.saleId) await step("ยกเลิก y2", () => posSvc.voidSale(T, U.A, y2.saleId));
  // กะ D−1 ที่เครื่อง A: เสื้อ ×1 เงินสด ฿200 · นับได้ ฿50 ⇒ ขาด ฿150
  const DEV = `qc39${RAND}dev`;
  let DEVID = "";
  let SHIFT = "";
  if (!fx) {
    await step("เครื่อง/กะ", async () => {
      const r = must("registerDevice", await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เคาน์เตอร์ ${RAND}`, deviceCode: DEV }));
      DEVID = String(r.device?.id ?? "");
      const o = must("openShift", await call(shiftMod, "openShift", ctxU("A", DEV), A("OWNER"), { deviceId: DEV, deviceLabel: `เคาน์เตอร์ ${RAND}`, floatSatang: 0 }));
      SHIFT = String(o.shift?.id ?? o.shiftId ?? "");
    });
    const sh = await sell("shift-tee", "A", "OWNER", [pl("T")], at(1, 10), DEV);
    if (SHIFT && sh.saleId) {
      await step("ปิดกะขาด ฿150", async () => {
        must("closeShift", await call(shiftMod, "closeShift", ctxU("A", DEV), A("OWNER"), { shiftId: SHIFT, countedCashSatang: sh.grand - 15_000, note: `เงินขาดทดสอบ ${RAND}`, idempotencyKey: newKey("close") }));
        await P.$executeRawUnsafe(`UPDATE "PosShift" SET "openedAt" = $1, "closedAt" = $2 WHERE id = $3 AND "tenantId" = $4`, at(1, 9), at(1, 22), SHIFT, T);
      });
    }
  }
  // T2: บิล ฿777 ของสินค้าร้านอื่น
  if (!fx && PR.X) {
    await step("บิล T2", async () => {
      const q = await call(regFacade, "quoteRegisterCart", ctxU("X"), A("OWNER2"), { lines: [pl("X")] });
      const g = Number(q?.grandTotalSatang ?? 77_700);
      must("submit T2", await call(regFacade, "submitRegisterSale", ctxU("X"), A("OWNER2"), { lines: [pl("X")], payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g, expectedGrandTotalSatang: g, idempotencyKey: newKey("t2") }));
    });
  }
  // A11: override ×3 ของผู้จัดการ · ×2 ของเจ้าของ (D−1 · แถว audit ดิบเท่านั้น — ผู้เขียนจริง = P3.5)
  if (!fx) {
    await step("audit schedule_override", async () => {
      const mk = async (by: string, n: number, hh: number) =>
        P.auditLog.create({ data: { tenantId: T, actorType: "USER", actorId: uid(by), action: "pos.staff.schedule_override", targetType: "PosDevice", targetId: DEVID || "none", after: { userId: uid("CASH"), byUserId: uid(by), reason: "OUTSIDE_HOURS", deviceId: DEV, unitId: U.A, n }, createdAt: at(1, hh, n) } });
      for (let i = 0; i < 3; i++) await mk("MGR", i, 8);
      for (let i = 0; i < 2; i++) await mk("OWNER", i, 7);
    });
  }
  // push token ของทุกคนในร้าน (BR9)
  const TOKEN: Record<string, string> = {};
  if (!fx) {
    await step("PushDevice", async () => {
      for (const k of ["OWNER", "MGR", "SUP", "CASH"]) {
        TOKEN[k] = `ExponentPushToken[qc39-${RAND}-${k.toLowerCase()}]`;
        await P.pushDevice.create({ data: { userId: uid(k), tenantId: T, expoToken: TOKEN[k], platform: "ios" } });
      }
    });
  }
  // วันนี้: บิลเป้าหมาย void (V1) · บิลใหญ่ ฿1,200 (BIG)
  const V1 = await sell("V1", "A", "OWNER", [pl("bar")], null);
  const BIG = await sell("BIG", "A", "OWNER", [pl("T", 6)], null);
  if (notes.length) console.log(`  (ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 3).join(" | ")})`);

  // ─── actor + ห้องสนทนา ───
  const memberActor = (k: string): Any => (typeof actorMod?.aiMemberActor === "function" ? actorMod.aiMemberActor(US[k]?.tid ?? T, uid(k), { role: US[k]?.role ?? "STAFF", unitAccess: US[k]?.unitAccess ?? [], permissions: US[k]?.perms ?? {} }) : { kind: "member", tenantId: T, userId: uid(k), membership: M(k) });
  const CONV: Record<string, string> = {};
  for (const k of ["OWNER", "MGR", "CASH", "SUP"]) {
    if (fx) break;
    await step(`ห้อง ${k}`, async () => {
      const id = convMod.newConversationId({ tenantId: T, actor: memberActor(k) });
      await P.aiConversation.create({ data: { id, tenantId: T, title: `qc39 ${k}` } });
      CONV[k] = id;
    });
  }
  let keyActor: Any = null;
  if (!fx) {
    await step("คีย์ pos-read", async () => {
      const scopes = scopesMod.expandBundles(["pos-read"]);
      const k = await akSvc.createApiKey({ tenantId: T }, `QC P3.9 pos-read ${RAND}`, { scopes, systemId: S.POS });
      keyActor = actorMod.aiApiKeyActor({ tenantId: T, keyId: k.id, scopes, systemId: S.POS });
      const id = convMod.newConversationId({ tenantId: T, actor: keyActor });
      await P.aiConversation.create({ data: { id, tenantId: T, title: "qc39 key" } });
      CONV.KEY = id;
    });
  }
  const rt = async (k: string, name: string, args: Any, opts: { conv?: boolean; read?: boolean } = {}): Promise<{ raw: string; j: Any }> => {
    const actor = k === "KEY" ? keyActor : k === "SYS" ? (typeof actorMod?.aiSystemActor === "function" ? actorMod.aiSystemActor(T, "scheduled-task") : null) : memberActor(k);
    const ctx: Any = { tenantId: T, actor, ...(opts.conv && CONV[k] ? { conversationId: CONV[k] } : {}), ...(k === "KEY" ? { systemId: S.POS } : {}) };
    let raw: string;
    if (typeof toolsMod?.runTool !== "function") raw = J({ error: "runTool โหลดไม่ได้" });
    else {
      try {
        raw = String(await toolsMod.runTool(ctx, name, args));
      } catch (e) {
        raw = J({ error: `THROW ${(e as Error).message.slice(0, 100)}` });
      }
    }
    allOutputs.push(raw);
    if (opts.read) readOutputs.push(raw);
    return { raw, j: parseJ(raw) };
  };
  const confirm = (k: string, id: string, confirm2x = false) => call(propMod, "executeProposal", M(k), { tenantId: T }, id, { userId: uid(k), confirm2x });
  const propRow = async (id: string): Promise<Any> => (id ? P.aiProposal.findFirst({ where: { id, tenantId: T } }).catch(() => null) : null);
  const saleRow = async (id: string): Promise<Any> => (id ? P.posSale.findFirst({ where: { id, tenantId: T }, select: { id: true, status: true, unitId: true, sourceModule: true, grandTotalSatang: true } }).catch(() => null) : null);
  const priceOf = async (id: string): Promise<number | null> => (await P.posProduct.findFirst({ where: { id, tenantId: T }, select: { basePriceSatang: true } }).catch(() => null))?.basePriceSatang ?? null;
  const daily = async (k: string, from: string, to: string): Promise<Any> => call(reportsMod, "reportDailySales", rctx(), A(k), { from, to });
  const RANGE = { from: dayStr(14), to: dayStr(1) };

  // ════════ TL ════════
  {
    const p: string[] = [];
    const sales = (skillsMod?.SKILLS ?? []).find((s: Any) => s.id === "sales");
    const st: string[] = sales?.tools ?? [];
    const miss = SALES_TOOLS.filter((n) => !st.includes(n));
    const more = st.filter((n) => !SALES_TOOLS.includes(n));
    if (miss.length || more.length) p.push(`สกิล sales ขาด [${miss.join(",")}] เกิน [${more.join(",")}]`);
    const reg = typeof toolsMod?.toolRegistry === "function" ? (toolsMod.toolRegistry() as Any[]).map((t) => String(t.def?.name)) : [];
    const dup = reg.filter((n, i) => reg.indexOf(n) !== i);
    if (dup.length) p.push(`toolRegistry ชื่อซ้ำ ${[...new Set(dup)].join(",")}`);
    const absent = SALES_TOOLS.filter((n) => !reg.includes(n));
    if (absent.length) p.push(`toolRegistry ไม่มี ${absent.join(",")}`);
    const infos = callSync(bridge, "posToolInfos");
    const names = Array.isArray(infos) ? infos.map((i: Any) => String(i.name)).sort() : [];
    const wantNames = TOOL_SPEC.map(([, t]) => t).sort();
    if (J(names) !== J(wantNames)) p.push(`posToolInfos ${Array.isArray(infos) ? names.join(",") : codeOf(infos)}`);
    if (Array.isArray(infos)) {
      for (const [opId, t, kind] of TOOL_SPEC) {
        const i = infos.find((x: Any) => x.name === t);
        if (i && (i.opId !== opId || !!i.write !== (kind !== "read") || !!i.danger !== (kind === "danger"))) p.push(`${t} opId/write/danger ${i.opId}/${i.write}/${i.danger}`);
      }
    }
    const ka = callSync(bridge, "posKindAccess");
    if (!isRecord(ka) || ka.ok === false) p.push(`posKindAccess ${codeOf(ka)}`);
    else if (J(Object.keys(ka).sort()) !== J(Object.keys(KIND_SPEC).sort()) || Object.entries(KIND_SPEC).some(([k, v]) => C(ka[k]) !== C(v))) p.push(`posKindAccess ${short(ka, 120)}`);
    const dk = callSync(bridge, "posDestructiveKinds");
    if (J(dk) !== J(["pos.sales.void"])) p.push(`posDestructiveKinds ${short(dk, 60)}`);
    for (const [, t, , action] of TOOL_SPEC) {
      const s = callSync(bridge, "posToolScope", t);
      if (s !== action) {
        p.push(`posToolScope(${t}) ${short(s, 40)}`);
        break;
      }
    }
    if (callSync(bridge, "posToolScope", "pos_create_sale") !== null) p.push("posToolScope(pos_create_sale) ไม่ใช่ null (เขียนมือ)");
    const ko = callSync(propMod, "kindAccessOf", DRAFT_PO_KIND);
    if (C(ko) !== C(DRAFT_PO_ACCESS)) p.push(`kindAccessOf(pos_draft_po) ${short(ko, 60)}`);
    for (const [k, v] of Object.entries(KIND_SPEC)) {
      const r = callSync(propMod, "kindAccessOf", k);
      if (C(r) !== C(v)) p.push(`kindAccessOf(${k}) ${short(r, 60)}`);
    }
    const complete = callSync(skillsMod, "assertSkillRegistryComplete");
    if (complete?.ok === false) p.push(`assertSkillRegistryComplete ${short(complete.message, 100)}`);
    chk("TL1", p.length === 0, "ทะเบียนตามตาราง", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const r = await daily("OWNER", RANGE.from, RANGE.to);
    const net = r?.ok === true ? Number(r.report?.totals?.netSalesSatang) : NaN;
    if (!Number.isFinite(net)) p.push(`(ตัวควบคุม) reportDailySales ${codeOf(r)}`);
    const paid = (await P.posSale.findMany({ where: { tenantId: T, systemId: S.POS, docType: "SALE", status: "PAID", createdAt: { gte: at(14, 0), lt: at(0, 0) } }, select: { grandTotalSatang: true } }).catch(() => [])) as Any[];
    const naive = paid.reduce((s, x) => s + Number(x.grandTotalSatang ?? 0), 0);
    if (Number.isFinite(net) && naive === net) p.push(`(ตัวควบคุม) ยอดสุทธิ = Σ PAID ${naive} — ฟิกซ์เจอร์ไม่มีคืนเงิน`);
    const o = await rt("OWNER", "sales_summary", { ...RANGE }, { read: true });
    if (isErr(o.j)) p.push(`sales_summary error ${short(o.j.error, 80)}`);
    else if (Number.isFinite(net) && !hasAmount(o.raw, net)) p.push(`ไม่มียอดสุทธิ ${net} ในผล ${short(o.raw, 100)}`);
    chk("TL2", p.length === 0, `net ${net}`, FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    for (const k of ["CASH", "NOPERM"]) {
      const o = await rt(k, "sales_summary", { ...RANGE });
      if (!isErr(o.j)) p.push(`${k} ไม่ถูกปฏิเสธ ${short(o.raw, 60)}`);
      const offered = callSync(accessMod, "toolsOfferedTo", memberActor(k), ["sales_summary", "sales_by_day"]);
      if (!Array.isArray(offered) || offered.length) p.push(`${k} ถูกยื่น ${short(offered, 50)}`);
    }
    const f = await rt("CASH", "pos_find_product", { unitId: U.A, barcode: BARCODE }, { read: true });
    if (isErr(f.j) || !f.raw.includes(PN.bc ?? "§")) p.push(`(ตัวควบคุม) แคชเชียร์ pos_find_product ${short(f.raw, 80)}`);
    chk("TL3", p.length === 0, "ปฏิเสธ ×2 · ไม่ยื่น · find_product ได้", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const ro = await daily("OWNER", RANGE.from, RANGE.to);
    const rm = await daily("MGR", RANGE.from, RANGE.to);
    const no = Number(ro?.report?.totals?.netSalesSatang);
    const nm = Number(rm?.report?.totals?.netSalesSatang);
    if (!(Number.isFinite(no) && Number.isFinite(nm) && no !== nm)) p.push(`(ตัวควบคุม) เจ้าของ ${no} ผู้จัดการ ${nm}`);
    const o = await rt("MGR", "sales_summary", { ...RANGE }, { read: true });
    if (isErr(o.j)) p.push(`error ${short(o.j.error, 80)}`);
    else {
      if (!hasAmount(o.raw, nm)) p.push(`ไม่มียอดของผู้จัดการ ${nm}`);
      if (hasAmount(o.raw, no)) p.push(`มียอดทั้งร้าน ${no}`);
    }
    const b = await rt("MGR", "sales_summary", { ...RANGE, unitId: U.B });
    if (!isErr(b.j)) p.push(`unitId B ไม่ error ${short(b.raw, 60)}`);
    chk("TL4", p.length === 0, "สาขา A เท่านั้น", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const s = await rt("SUP", "pos_anomalies", { ...RANGE });
    if (!isErr(s.j)) p.push(`พนักงาน view-only ไม่ถูกปฏิเสธ ${short(s.raw, 60)}`);
    const m = await rt("MGR", "pos_anomalies", { ...RANGE }, { read: true });
    if (isErr(m.j)) p.push(`ผู้จัดการ error ${short(m.j.error, 80)}`);
    chk("TL5", p.length === 0, "ปฏิเสธ / ได้ผล", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const rp = await call(reportsMod, "reportProducts", rctx(), A("OWNER"), { ...RANGE });
    const nRows = rp?.ok === true ? (rp.report?.rows ?? []).length : -1;
    if (nRows <= 10) p.push(`(ตัวควบคุม) reportProducts ${nRows} แถว`);
    const o = await rt("OWNER", "pos_top_products", { ...RANGE }, { read: true });
    if (isErr(o.j)) p.push(`error ${short(o.j.error, 80)}`);
    else {
      const ml = maxArrayLen(o.j);
      if (ml > 10 || ml === 0) p.push(`แถว ${ml}`);
    }
    if (bytes(o.raw) > MAX_TOOL_BYTES) p.push(`ขนาด ${bytes(o.raw)} B`);
    for (const name of ["sales_by_day", "pos_shift_report", "pos_hourly"]) await rt("OWNER", name, { ...RANGE }, { read: true });
    if (SHIFT) await rt("OWNER", "pos_shift_now", { shiftId: SHIFT }, { read: true });
    // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.9 fix1 N5 · TL6): ผลของ pos_draft_po ≤ 8 KB · รายการ ≤ 10 · adapter ส่งผ่านตัวตัดของสะพาน (capPosToolResult) — เดิม TL6 ไม่ครอบ pos_draft_po
    const dp = await rt("OWNER", "pos_draft_po", { unitId: U.A }, { conv: true });
    if (bytes(dp.raw) > MAX_TOOL_BYTES) p.push(`pos_draft_po ${bytes(dp.raw)} B`);
    if (maxArrayLen(dp.j) > 10) p.push(`pos_draft_po รายการ ${maxArrayLen(dp.j)}`);
    if (!/capPosToolResult\s*\(/.test(srcOf(F.adapter))) p.push("ai/tools-pos.ts ไม่ส่งผล pos_draft_po ผ่าน capPosToolResult");
    if (dp.j?.proposalId) await call(propMod, "rejectProposal", { tenantId: T, actor: memberActor("OWNER") }, String(dp.j.proposalId));
    const big = readOutputs.filter((x) => bytes(x) > MAX_TOOL_BYTES);
    if (big.length) p.push(`ผลอ่านเกิน 8 KB ${big.length} ตัว (${Math.max(...big.map(bytes))} B)`);
    chk("TL6", p.length === 0, "≤ 10 แถว · ≤ 8 KB", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const scopes: string[] = keyActor?.scopes ?? [];
    if (!keyActor) p.push("(ฟิกซ์เจอร์) ไม่มีคีย์ pos-read");
    const r = await rt("KEY", "sales_summary", { ...RANGE }, { read: true });
    if (isErr(r.j)) p.push(`sales_summary error ${short(r.j.error, 80)}`);
    const before = Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1));
    const w1 = await rt("KEY", "pos_set_price", { productId: PR.price, priceSatang: 9900 }, { conv: true });
    const w2 = await rt("KEY", "void_sale", { saleId: V1.saleId || "none", reason: "ทดสอบคีย์อ่าน" }, { conv: true });
    const w3 = await rt("KEY", "pos_create_sale", { lines: [{ name: PN.bar, qty: 1, unitPriceSatang: 2500 }], payType: "CASH" }, { conv: true });
    for (const [n, w] of [["pos_set_price", w1], ["void_sale", w2], ["pos_create_sale", w3]] as const) if (!isErr(w.j)) p.push(`${n} ไม่ถูกปฏิเสธ ${short(w.raw, 50)}`);
    const after = Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1));
    if (after !== before) p.push(`ข้อเสนอเพิ่ม ${after - before}`);
    const allow = (t: string) => callSync(skillsMod, "toolAllowedForApiKey", t, scopes);
    const allowB = (t: string) => callSync(bridge, "posToolAllowedForScopes", t, scopes);
    const want: [string, boolean][] = [["sales_summary", true], ["sales_by_day", true], ["pos_top_products", true], ["pos_set_price", false], ["void_sale", false], ["pos_create_sale", false], ["pos_set_availability", false]];
    for (const [t, w] of want) {
      if (allow(t) !== w) p.push(`toolAllowedForApiKey(${t}) ${short(allow(t), 30)}`);
      if (t !== "pos_create_sale" && allowB(t) !== w) p.push(`posToolAllowedForScopes(${t}) ${short(allowB(t), 30)}`);
    }
    chk("TL7", p.length === 0, "อ่านได้ · เขียนปฏิเสธ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const outs = [await rt("OWNER", "pos_top_products", { from: dayStr(14), to: dayStr(0) }, { read: true }), await rt("OWNER", "sales_by_day", { from: dayStr(14), to: dayStr(0) }, { read: true })];
    for (const o of outs) if (o.raw.includes(`สินค้าร้านอื่น ${RAND}`) || hasAmount(o.raw, 77_700)) p.push(`เห็นข้อมูล T2 ${short(o.raw, 60)}`);
    if (outs.some((o) => isErr(o.j))) p.push(`(ตัวควบคุม) ผลของเจ้าของ error ${short(outs.find((o) => isErr(o.j))?.raw, 60)}`);
    const x = await rt("OWNER2", "sales_summary", { ...RANGE });
    if (!isErr(x.j)) p.push(`actor T2 บน ctx T ไม่ถูกปฏิเสธ`);
    const u = await rt("OWNER", "sales_summary", { ...RANGE, unitId: U.X });
    if (!isErr(u.j)) p.push(`unitId T2 ไม่ error ${short(u.raw, 50)}`);
    chk("TL8", p.length === 0, "ไม่ข้ามร้าน", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 TL9) ▸ คีย์กลางรุ่นเดิม: อ่านชื่อเดิมได้ · เสนอเขียนของ POS ไม่ได้ (ตั้งใจ — F3) ◂
  {
    const p: string[] = [];
    const gen: Any = typeof actorMod?.aiApiKeyActor === "function" ? actorMod.aiApiKeyActor({ tenantId: T, keyId: `qc39${RAND}general`, scopes: [], systemId: null }) : null;
    if (!gen) p.push("(ฟิกซ์เจอร์) aiApiKeyActor");
    const want: [string, boolean][] = [["sales_summary", true], ["sales_by_day", true], ["void_sale", false], ["pos_create_sale", false], ["pos_set_price", false]];
    for (const [t, w] of want) {
      const a = callSync(skillsMod, "toolAllowedForApiKey", t, []);
      const b = callSync(bridge, "posToolAllowedForScopes", t, []);
      if (a !== w) p.push(`toolAllowedForApiKey(${t},[]) ${short(a, 20)}`);
      if (b !== w) p.push(`posToolAllowedForScopes(${t},[]) ${short(b, 20)}`);
    }
    let conv = "";
    if (gen && !fx) {
      await step("ห้องคีย์กลาง", async () => {
        conv = convMod.newConversationId({ tenantId: T, actor: gen });
        await P.aiConversation.create({ data: { id: conv, tenantId: T, title: "qc39 general key" } });
      });
    }
    const run = async (name: string, args: Any) => {
      try {
        return parseJ(String(await toolsMod.runTool({ tenantId: T, actor: gen, ...(conv ? { conversationId: conv } : {}) }, name, args)));
      } catch (e) {
        return { error: `THROW ${(e as Error).message.slice(0, 60)}` };
      }
    };
    const before = Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1));
    const v = await run("void_sale", { saleId: V1.saleId || "none", reason: "คีย์กลางขอยกเลิก" });
    const c = await run("pos_create_sale", { unitName: `${TAG} สาขาA`, lines: [{ name: PN.bar, qty: 1, unitPriceSatang: 2500 }], payType: "CASH" });
    if (!isErr(v)) p.push(`void_sale คีย์กลางไม่ถูกปฏิเสธ ${short(v, 50)}`);
    if (!isErr(c)) p.push(`pos_create_sale คีย์กลางไม่ถูกปฏิเสธ ${short(c, 50)}`);
    if (Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1)) !== before) p.push("มีข้อเสนอเกิด");
    const r = await run("sales_summary", { ...RANGE });
    if (isErr(r)) p.push(`(ตัวควบคุม) sales_summary คีย์กลาง error ${short(r.error, 60)}`);
    chk("TL9", p.length === 0, "อ่านได้ · เสนอเขียนไม่ได้", FXB(joinP(p)));
  }

  // ════════ PR ════════
  let P1 = "";
  let price0: number | null = null;
  {
    const p: string[] = [];
    price0 = await priceOf(PR.price ?? "none");
    const o = await rt("MGR", "pos_set_price", { productId: PR.price, priceSatang: 5500 }, { conv: true });
    P1 = String(o.j?.proposalId ?? "");
    const row = await propRow(P1);
    if (!P1 || isErr(o.j)) p.push(`ไม่มีข้อเสนอ ${short(o.raw, 80)}`);
    if (o.j?.waiting !== "user_confirm") p.push(`waiting ${short(o.j?.waiting, 20)}`);
    if (row && (row.status !== "PENDING" || row.kind !== "pos.products.setPrice" || row.conversationId !== CONV.MGR)) p.push(`แถว ${row.status}/${row.kind}`);
    if ((await priceOf(PR.price ?? "none")) !== price0) p.push("ราคาเปลี่ยนก่อนยืนยัน");
    chk("PR1", p.length === 0, "PENDING pos.products.setPrice", FXB(joinP(p)));
  }
  let auditN = -1;
  const t0 = new Date(Date.now() - 1000);
  const auditCount = async () => Number(await P.auditLog.count({ where: { tenantId: T, targetId: PR.price, actorId: uid("MGR"), createdAt: { gte: t0 } } }).catch(() => -1));
  {
    const p: string[] = [];
    const r = await confirm("MGR", P1 || "none");
    if (r?.ok !== true) p.push(`ยืนยัน ${short(r?.note ?? r?.message ?? codeOf(r), 80)}`);
    const pr = await priceOf(PR.price ?? "none");
    if (pr !== 5500) p.push(`ราคา ${pr}`);
    auditN = await auditCount();
    const types = ((await P.auditLog.findMany({ where: { tenantId: T, targetId: PR.price, actorId: uid("MGR"), createdAt: { gte: t0 } }, select: { actorType: true } }).catch(() => [])) as Any[]).map((x) => x.actorType);
    if (auditN < 1 || types.some((x) => x !== "USER")) p.push(`audit ${auditN} ${types.join(",")}`);
    if ((await propRow(P1))?.status !== "EXECUTED") p.push(`สถานะ ${(await propRow(P1))?.status}`);
    chk("PR2", p.length === 0, "ราคา 5500 · audit USER", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const r = await confirm("MGR", P1 || "none");
    if (r?.ok !== false || !/ดำเนินการ|ปิดไปแล้ว/.test(String(r?.note ?? ""))) p.push(`ยืนยันซ้ำ ${short(r, 80)}`);
    if ((await priceOf(PR.price ?? "none")) !== 5500) p.push("ราคาเปลี่ยน");
    if ((await auditCount()) !== auditN) p.push(`audit Δ ${(await auditCount()) - auditN}`);
    if (!P1) p.push("(ฟิกซ์เจอร์) ไม่มีข้อเสนอ PR1");
    chk("PR3", p.length === 0, "ok:false · Δ0", FXB(joinP(p)));
  }
  let P5 = "";
  {
    const p: string[] = [];
    const o = await rt("MGR", "pos_set_price", { productId: PR.price, priceSatang: 7000 }, { conv: true });
    P5 = String(o.j?.proposalId ?? "");
    const src = await propRow(P5);
    if (!src) p.push(`(ฟิกซ์เจอร์) ข้อเสนอต้นทาง ${short(o.raw, 60)}`);
    const made = src && CONV.CASH ? await call(propMod, "createProposal", { tenantId: T }, { conversationId: CONV.CASH, kind: src.kind, summary: src.summary, payload: src.payload }) : null;
    const pid = String(made?.id ?? "");
    const r = pid ? await confirm("CASH", pid) : null;
    if (r?.ok !== false) p.push(`แคชเชียร์ยืนยัน ${short(r, 60)}`);
    if ((await propRow(pid))?.status !== "PENDING") p.push(`สถานะ ${(await propRow(pid))?.status ?? "ไม่มี"}`);
    if ((await priceOf(PR.price ?? "none")) !== 5500) p.push("ราคาเปลี่ยน");
    const c = await rt("CASH", "pos_set_price", { productId: PR.price, priceSatang: 100 }, { conv: true });
    if (!isErr(c.j)) p.push(`แคชเชียร์ได้รับ pos_set_price ${short(c.raw, 50)}`);
    chk("PR4", p.length === 0, "คง PENDING", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const r = P5 ? await call(propMod, "rejectProposal", { tenantId: T, actor: memberActor("MGR") }, P5) : null;
    if (r !== true) p.push(`reject ${short(r, 40)}`);
    if ((await propRow(P5))?.status !== "REJECTED") p.push(`สถานะ ${(await propRow(P5))?.status ?? "ไม่มี"}`);
    if ((await priceOf(PR.price ?? "none")) !== 5500) p.push("ราคาเปลี่ยน");
    chk("PR5", p.length === 0, "REJECTED", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const markOf = async () => P.posAvailabilityMark.findFirst({ where: { tenantId: T, unitId: U.A, productId: PR.p86 } }).catch(() => null);
    const o1 = await rt("CASH", "pos_set_availability", { productId: PR.p86, unitId: U.A, available: false }, { conv: true });
    const r1 = o1.j?.proposalId ? await confirm("CASH", String(o1.j.proposalId)) : null;
    if (r1?.ok !== true) p.push(`86 ${short(r1 ?? o1.raw, 70)}`);
    const m1 = await markOf();
    if (!m1 || m1.markedByUserId !== uid("CASH")) p.push(`mark ${short(m1, 50)}`);
    const k1 = o1.j?.proposalId ? (await propRow(String(o1.j.proposalId)))?.kind : null;
    if (k1 !== "pos.products.availability") p.push(`kind ${k1}`);
    const o2 = await rt("CASH", "pos_set_availability", { productId: PR.p86, unitId: U.A, available: true }, { conv: true });
    const r2 = o2.j?.proposalId ? await confirm("CASH", String(o2.j.proposalId)) : null;
    if (r2?.ok !== true) p.push(`คืนขาย ${short(r2 ?? o2.raw, 70)}`);
    if (await markOf()) p.push("mark ยังอยู่");
    chk("PR6", p.length === 0, "86 → คืนขาย", FXB(joinP(p)));
  }
  let VOID_P = "";
  {
    const p: string[] = [];
    const before = Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1));
    const nr = await rt("MGR", "void_sale", { saleId: V1.saleId || "none" }, { conv: true });
    if (!isErr(nr.j)) p.push(`ไม่มี reason ไม่ error ${short(nr.raw, 50)}`);
    if (Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1)) !== before) p.push("ไม่มี reason แต่มีข้อเสนอ");
    const o = await rt("MGR", "void_sale", { saleId: V1.saleId || "none", reason: "ลูกค้าเปลี่ยนใจ ทดสอบ AI" }, { conv: true });
    VOID_P = String(o.j?.proposalId ?? "");
    const row = await propRow(VOID_P);
    if (row?.kind !== "pos.sales.void" || row?.risk !== "DESTRUCTIVE") p.push(`แถว ${row?.kind}/${row?.risk} ${short(o.raw, 50)}`);
    const c1 = await confirm("MGR", VOID_P || "none");
    if (!(c1?.ok === false && c1?.needsSecondConfirm === true)) p.push(`ชั้นแรก ${short(c1, 60)}`);
    if ((await saleRow(V1.saleId))?.status !== "PAID") p.push("ชั้นแรกยกเลิกแล้ว");
    const c2 = await confirm("MGR", VOID_P || "none", true);
    if (c2?.ok !== true) p.push(`ชั้นสอง ${short(c2?.note ?? c2, 70)}`);
    if ((await saleRow(V1.saleId))?.status !== "VOIDED") p.push(`บิล ${(await saleRow(V1.saleId))?.status}`);
    const au = (await P.auditLog.findMany({ where: { tenantId: T, action: "pos.sale.void", targetId: V1.saleId || "none" }, select: { actorId: true, after: true } }).catch(() => [])) as Any[];
    if (au.length !== 1 || au[0]?.actorId !== uid("MGR") || !/ลูกค้าเปลี่ยนใจ ทดสอบ AI/.test(J(au[0]?.after ?? ""))) p.push(`audit pos.sale.void ${au.length} ${short(au[0], 60)}`);
    chk("PR7", p.length === 0, "2 ชั้น · VOIDED · audit", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    // บิลที่ AI เปิด
    const o = await rt("OWNER", "pos_create_sale", { unitName: `${TAG} สาขาA`, lines: [{ name: PN.bar, qty: 1, unitPriceSatang: 2500 }], payType: "CASH" }, { conv: true });
    const c = o.j?.proposalId ? await confirm("OWNER", String(o.j.proposalId)) : null;
    const ai = (await P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: { contains: String(o.j?.proposalId ?? "§") } }, select: { id: true, sourceModule: true, status: true } }).catch(() => null)) as Any;
    if (c?.ok !== true || ai?.sourceModule !== "AI") p.push(`(ฟิกซ์เจอร์) บิล AI ${short(c?.note ?? o.raw, 60)} ${ai?.sourceModule}`);
    const v = await rt("OWNER", "void_sale", { saleId: ai?.id ?? "none", reason: "ยกเลิกบิลที่ AI เปิด" }, { conv: true });
    const vid = String(v.j?.proposalId ?? "");
    await confirm("OWNER", vid || "none");
    const v2 = await confirm("OWNER", vid || "none", true);
    if (v2?.ok !== true || (await saleRow(ai?.id ?? ""))?.status !== "VOIDED") p.push(`void บิล AI ${short(v2?.note ?? v.raw, 70)} ${(await saleRow(ai?.id ?? ""))?.status}`);
    // กติกา POS_VOID ≥ ฿1,000
    const pol = await step("กติกา POS_VOID", async () => String((await apSvc.createPolicy({ tenantId: T }, { name: `QC P3.9 ยกเลิกบิล ≥ ฿1,000 ${RAND}`, entityType: "POS_VOID", thresholdSatang: 100_000, steps: [{ order: 1, approverRole: "MANAGER" }] }))?.id ?? ""));
    if (!pol) p.push("(ฟิกซ์เจอร์) กติกา POS_VOID");
    if (!(BIG.grand >= 100_000)) p.push(`(ฟิกซ์เจอร์) บิลใหญ่ ${BIG.grand}`);
    const b = await rt("MGR", "void_sale", { saleId: BIG.saleId || "none", reason: "ลูกค้าขอยกเลิกบิลใหญ่" }, { conv: true });
    const bid = String(b.j?.proposalId ?? "");
    await confirm("MGR", bid || "none");
    const b2 = await confirm("MGR", bid || "none", true);
    if (b2?.ok !== false) p.push(`void บิลใหญ่ ok ${short(b2, 50)}`);
    if ((await saleRow(BIG.saleId))?.status !== "PAID") p.push(`บิลใหญ่ ${(await saleRow(BIG.saleId))?.status}`);
    const reqs = BIG.saleId ? ((await P.approvalRequest.findMany({ where: { tenantId: T, entityType: "POS_VOID", entityId: { startsWith: BIG.saleId } } }).catch(() => [])) as Any[]) : [];
    if (reqs.length !== 1) p.push(`คำขอ POS_VOID ${reqs.length}`);
    if (!bid) p.push(`ไม่มีข้อเสนอ void บิลใหญ่ ${short(b.raw, 50)}`);
    chk("PR8", p.length === 0, "บิล AI VOIDED · บิลใหญ่ PAID + คำขอ 1", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const salesAt = async (unitId: string) => Number(await P.posSale.count({ where: { tenantId: T, unitId, sourceModule: "AI" } }).catch(() => -1));
    const b0 = await salesAt(U.B ?? "none");
    const a = await rt("MGR", "pos_create_sale", { unitName: `${TAG} สาขาB`, lines: [{ name: PN.bar, qty: 1, unitPriceSatang: 2500 }], payType: "CASH" }, { conv: true });
    const ra = a.j?.proposalId ? await confirm("MGR", String(a.j.proposalId)) : null;
    if (ra?.ok !== false || (await salesAt(U.B ?? "none")) !== b0) p.push(`สาขา B ${short(ra ?? a.raw, 60)}`);
    if (!a.j?.proposalId) p.push(`(ฟิกซ์เจอร์) ข้อเสนอสาขา B ${short(a.raw, 50)}`);
    const a0 = await salesAt(U.A ?? "none");
    const c = await rt("CASH", "pos_create_sale", { unitName: `${TAG} สาขาA`, lines: [{ name: `ของแถมราคาเอง ${RAND}`, qty: 1, unitPriceSatang: 999 }], payType: "CASH" }, { conv: true });
    const rc = c.j?.proposalId ? await confirm("CASH", String(c.j.proposalId)) : null;
    if (rc?.ok !== false || (await salesAt(U.A ?? "none")) !== a0) p.push(`ราคาเองไม่มี priceOverride ${short(rc ?? c.raw, 60)}`);
    const g = await rt("CASH", "pos_create_sale", { unitName: `${TAG} สาขาA`, lines: [{ name: PN.bar, qty: 1, unitPriceSatang: 2500 }], payType: "CASH" }, { conv: true });
    const rg = g.j?.proposalId ? await confirm("CASH", String(g.j.proposalId)) : null;
    if (rg?.ok !== true || (await salesAt(U.A ?? "none")) !== a0 + 1) p.push(`บรรทัดแคตตาล็อก ${short(rg?.note ?? g.raw, 60)}`);
    const n = (stripComments(rd(F.proposals)).match(/\bcreateSale\s*\(/g) ?? []).length;
    if (n !== 1) p.push(`createSale( ใน proposals.ts = ${n}`);
    chk("PR9", p.length === 0, "B ปฏิเสธ · ราคาเองปฏิเสธ · แคตตาล็อกได้", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const sg = await call(insights, "purchaseSuggestions", { tenantId: T, systemId: S.POS, unitId: U.A }, A("OWNER"));
    allOutputs.push(J(sg));
    const list: Any[] = Array.isArray(sg) ? sg : Array.isArray(sg?.suggestions) ? sg.suggestions : [];
    if (!list.length) p.push(`purchaseSuggestions ${codeOf(sg)} ${short(sg?.message ?? "", 60)}`);
    const w = list.find((x) => x?.itemId === INV.W);
    const t = list.find((x) => x?.itemId === INV.T);
    if (!w || w.qty !== 23 || w.supplierId !== SUP_NEW) p.push(`น้ำ ${short(w, 90)}`);
    if (!t || t.supplierId !== null) p.push(`เสื้อ ${short(t, 60)}`);
    if (list.some((x) => x?.itemId === INV.Z)) p.push("ของพอโผล่");
    const poCount = async () => Number(await P.purchaseOrder.count({ where: { tenantId: T, systemId: S.INV } }).catch(() => -1));
    const c0 = await poCount();
    const o = await rt("OWNER", "pos_draft_po", { unitId: U.A }, { conv: true });
    const pid = String(o.j?.proposalId ?? "");
    const row = await propRow(pid);
    if (row?.kind !== DRAFT_PO_KIND) p.push(`ข้อเสนอ ${row?.kind ?? "ไม่มี"} ${short(o.raw, 60)}`);
    if (!o.raw.includes(PN.T ?? "§")) p.push("ผลไม่บอกเสื้อที่ยังไม่มีผู้ขาย");
    const r1 = pid ? await confirm("OWNER", pid) : null;
    const r2 = pid ? await confirm("OWNER", pid) : null;
    if (r1?.ok !== true) p.push(`ยืนยัน ${short(r1?.note ?? r1, 60)}`);
    if (r2?.ok !== false) p.push("ยืนยันซ้ำ ok");
    if ((await poCount()) !== c0 + 1) p.push(`PO +${(await poCount()) - c0}`);
    const po = (await P.purchaseOrder.findFirst({ where: { tenantId: T, systemId: S.INV }, orderBy: { createdAt: "desc" }, include: { lines: true } }).catch(() => null)) as Any;
    const wl = (po?.lines ?? []).find((l: Any) => l.itemId === INV.W);
    if (po?.status !== "DRAFT" || po?.supplierId !== SUP_NEW || wl?.qty !== 23) p.push(`PO ${po?.status}/${po?.supplierId === SUP_NEW ? "SUP_NEW" : short(po?.supplierId, 12)}/น้ำ ${wl?.qty}`);
    chk("PR10", p.length === 0, "23 · SUP_NEW · DRAFT ×1", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 PR12) ▸ ไม่ข้ามสาขาตอนเสนอ + การ์ดบอกขอบเขต ◂
  {
    const p: string[] = [];
    const bBill = (await P.posSale.findFirst({ where: { tenantId: T, unitId: U.B, docType: "SALE", status: "PAID" }, select: { id: true, receiptNo: true, grandTotalSatang: true } }).catch(() => null)) as Any;
    if (!bBill) p.push("(ฟิกซ์เจอร์) บิลสาขา B");
    const before = Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1));
    const o = await rt("MGR", "void_sale", { saleId: bBill?.id ?? "none", reason: "ลองยกเลิกบิลสาขาอื่น" }, { conv: true });
    if (!isErr(o.j)) p.push(`void บิล B ไม่ถูกปฏิเสธ ${short(o.raw, 60)}`);
    if (bBill?.receiptNo && o.raw.includes(String(bBill.receiptNo))) p.push("ผลมีเลขบิลของ B");
    if (bBill && hasAmount(o.raw, Number(bBill.grandTotalSatang))) p.push("ผลมียอดบิลของ B");
    if (Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1)) !== before) p.push("มีข้อเสนอเกิด");
    const all = await rt("OWNER", "pos_set_price", { productId: PR.bar, priceSatang: 2600 }, { conv: true });
    const one = await rt("OWNER", "pos_set_price", { productId: PR.price, priceSatang: 5600 }, { conv: true });
    if (!String(all.j?.summary ?? "").includes("ทุกสาขา")) p.push(`การ์ดสินค้าทุกสาขา ${short(all.j?.summary ?? all.raw, 80)}`);
    if (!String(one.j?.summary ?? "").includes(`สาขา ${TAG} สาขาA`)) p.push(`การ์ดสินค้าสาขา A ${short(one.j?.summary ?? one.raw, 80)}`);
    for (const x of [all, one]) if (x.j?.proposalId) await call(propMod, "rejectProposal", { tenantId: T, actor: memberActor("OWNER") }, String(x.j.proposalId));
    chk("PR12", p.length === 0, "ปฏิเสธข้ามสาขา · การ์ดบอกขอบเขต", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix2 PR13) ▸ 86 ของสินค้าทุกสาขาต้องระบุสาขาตั้งแต่ตอนเสนอ ◂
  {
    const p: string[] = [];
    const before = Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1));
    const o = await rt("CASH", "pos_set_availability", { productId: PR.p86, available: false }, { conv: true });
    if (!isErr(o.j) || !/ระบุสาขา/.test(String(o.j?.error ?? ""))) p.push(`ไม่ระบุสาขา ${short(o.raw, 70)}`);
    if (Number(await P.aiProposal.count({ where: { tenantId: T } }).catch(() => -1)) !== before) p.push("มีข้อเสนอเกิด");
    const ok = await rt("CASH", "pos_set_availability", { productId: PR.p86, unitId: U.A, available: false }, { conv: true });
    if (isErr(ok.j) || !ok.j?.proposalId) p.push(`(ตัวควบคุม) ระบุสาขา A ${short(ok.raw, 60)}`);
    if (ok.j?.proposalId) await call(propMod, "rejectProposal", { tenantId: T, actor: memberActor("CASH") }, String(ok.j.proposalId));
    chk("PR13", p.length === 0, "ปฏิเสธ · ระบุสาขาแล้วเสนอได้", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 PR11) ▸ ขั้น POS ในแผน = ต้องให้คนกดเองทีละรายการ ◂
  {
    const p: string[] = [];
    const planCount = async () => Number(await P.aiPlan.count({ where: { tenantId: T } }).catch(() => -1));
    const before = await planCount();
    const exp = { kind: "record_expense", summary: "ค่าน้ำแข็ง", payload: { note: `qc39 ${RAND}`, amountSatang: 100 } };
    const posSteps: [string, Any][] = [
      ["void_sale", { saleId: BIG.saleId || "none" }],
      ["pos.products.setPrice", { opId: "products.setPrice", input: { priceSatang: 100 }, params: { id: PR.price ?? "none" }, systemId: S.POS }],
      ["pos_draft_po", { inventorySystemId: S.INV, supplierId: SUP_NEW, lines: [{ itemId: INV.W ?? "none", qty: 999, costSatang: 1 }] }],
    ];
    for (const [kind, payload] of posSteps) {
      const o = await rt("OWNER", "propose_plan", { title: `qc39 แผน ${kind}`, steps: [exp, { kind, summary: "ขั้น POS", payload }] }, { conv: true });
      if (!isErr(o.j)) p.push(`${kind} ไม่ถูกปฏิเสธ ${short(o.raw, 60)}`);
    }
    if ((await planCount()) !== before) p.push(`มีแผนเกิด ${(await planCount()) - before}`);
    const ctl = await rt("OWNER", "propose_plan", { title: "qc39 แผนปกติ", steps: [exp] }, { conv: true });
    if (isErr(ctl.j) || !ctl.j?.planId) p.push(`(ตัวควบคุม) แผนไม่มีขั้น POS ${short(ctl.raw, 60)}`);
    chk("PR11", p.length === 0, "ปฏิเสธ ×3 · แผน Δ0", FXB(joinP(p)));
  }

  // ════════ AN ════════
  {
    const p: string[] = [];
    const r = await call(reportsMod, "reportAnomalies", rctx(), A("OWNER"), { from: YESTERDAY, to: YESTERDAY });
    const rows: Any[] = r?.ok === true ? r.report?.rows ?? [] : [];
    if (r?.ok !== true) p.push(`reportAnomalies ${codeOf(r)}`);
    const a11 = rows.filter((x) => x.rule === "A11");
    const mg = a11.find((x) => x.userId === uid("MGR"));
    if (!mg || mg.count !== 3 || mg.unitId !== U.A || mg.businessDate !== YESTERDAY || mg.refType !== "USER") p.push(`A11 ผู้จัดการ ${short(mg, 100)}`);
    if (a11.some((x) => x.userId === uid("OWNER"))) p.push("A11 ของเจ้าของ (2 ครั้ง) โผล่");
    chk("AN1", p.length === 0, "A11 ×3 ผู้จัดการ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const r = await call(reportsMod, "reportAnomalies", rctx(), A("OWNER"), { from: dayStr(1), to: dayStr(0) });
    const rows: Any[] = r?.ok === true ? r.report?.rows ?? [] : [];
    const au = Number(await P.auditLog.count({ where: { tenantId: T, action: "pos.sale.void", actorId: uid("MGR") } }).catch(() => -1));
    if (au < 1) p.push(`(ตัวควบคุม) audit pos.sale.void ของผู้จัดการ ${au}`);
    if (!rows.some((x) => x.rule === "A1" && x.userId === uid("MGR"))) p.push(`ไม่มีแถว A1 ของผู้จัดการ (${codeOf(r)} · A1 ${rows.filter((x) => x.rule === "A1").length})`);
    chk("AN2", p.length === 0, "A1 ของผู้จัดการ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const RULES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"];
    if (J(setShared?.POS_ANOMALY_RULES) !== J(RULES)) p.push(`POS_ANOMALY_RULES ${short(setShared?.POS_ANOMALY_RULES, 80)}`);
    const def = setShared?.POS_ANOMALY_DEFAULTS ?? {};
    if (C(def.A11) !== C({ count: 3 })) p.push(`ค่าปริยาย A11 ${short(def.A11, 40)}`);
    const old = { A1: { count: 3, satang: 100_000 }, A2: { count: 3, satang: 100_000 }, A3: { bp: 1500 }, A4: { bp: 5000 }, A5: { count: 3 }, A6: { count: 5 }, A7: { count: 2 }, A8: { satang: 10_000 }, A9: { count: 2 }, A10: { count: 3 } };
    for (const [k, v] of Object.entries(old)) if (C(def[k]) !== C(v)) p.push(`ค่าปริยาย ${k} เปลี่ยน ${short(def[k], 40)}`);
    const th = (a11: unknown) => callSync(setShared, "posAnomalyThresholds", { pos: { reports: { anomaly: { rules: { A11: a11 } } } } })?.rules?.A11?.count;
    for (const [inp, want] of [[{ count: 0 }, 1], [{ count: 5000 }, 1000], [{ count: "x" }, 3], [{ count: 4 }, 4]] as const) if (th(inp) !== want) p.push(`A11 ${J(inp)} → ${th(inp)} (คาด ${want})`);
    chk("AN3", p.length === 0, "A1…A11 · ตัดช่วง", joinP(p));
  }
  const loadInput = async (k: string, date = YESTERDAY): Promise<Any> => {
    const r = await call(briefMod, "loadBriefInput", rctx(), A(k), date);
    const v = isRecord(r) && r.ok === true && isRecord(r.input) ? r.input : r;
    allOutputs.push(J(v));
    return v;
  };
  const compose = (input: Any, locale: "th" | "en"): Any => {
    const r = callSync(briefShared, "composeBrief", input, locale);
    allOutputs.push(J(r));
    return r;
  };
  {
    const p: string[] = [];
    await step("anomalyInBrief false", () => patchPos((pos) => (pos.ai = aiSettings({ anomalyInBrief: false }))));
    const off = await loadInput("OWNER");
    if (off?.ok === false) p.push(`loadBriefInput ${codeOf(off)}`);
    else {
      if (off?.anomalies !== null && off?.anomalies !== undefined) p.push(`anomalies ${short(off.anomalies, 50)}`);
      const lines: string[] = compose(off, "th")?.lines ?? [];
      if (lines.some((l) => l.startsWith("จุดผิดปกติ"))) p.push("มีบรรทัดจุดผิดปกติ");
    }
    await step("anomalyInBrief true", () => patchPos((pos) => (pos.ai = aiSettings())));
    const on = await loadInput("OWNER");
    if (!Array.isArray(on?.anomalies) || !on.anomalies.some((x: Any) => x?.rule === "A11" && x?.count >= 1)) p.push(`(ตัวควบคุม) เปิดแล้วไม่มี A11 ${short(on?.anomalies, 60)}`);
    chk("AN4", p.length === 0, "ปิด = ไม่มี · เปิด = มี", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 AN5) ▸ สาขาของ A11 มาจากแถว PIN ก่อน · รหัสเครื่องที่อยู่หลายสาขา = ไม่เดา ◂
  {
    const p: string[] = [];
    const D2 = dayStr(2);
    if (!fx) {
      await step("AN5 เครื่องซ้ำ + PIN + audit", async () => {
        await P.posDevice.create({ data: { tenantId: T, unitId: U.B, systemId: S.POS, name: `เครื่องซ้ำ ${RAND}`, deviceCode: DEV, registeredByUserId: uid("OWNER") } });
        const pin = await P.posStaffPin.create({ data: { tenantId: T, unitId: U.A, userId: uid("CASH"), pinHash: `qc39-${RAND}`, setById: uid("OWNER") } });
        const mk = (by: string, targetType: string, targetId: string, i: number, hh: number) =>
          P.auditLog.create({ data: { tenantId: T, actorType: "USER", actorId: uid(by), action: "pos.staff.schedule_override", targetType, targetId, after: { userId: uid("CASH"), byUserId: uid(by), reason: "OUTSIDE_HOURS", deviceId: DEV }, createdAt: at(2, hh, i) } });
        for (let i = 0; i < 3; i++) await mk("MGR", "PosStaffPin", pin.id, i, 8);
        for (let i = 0; i < 3; i++) await mk("OWNER", "QcUnknown", "none", i, 9);
      });
    }
    const r = await call(reportsMod, "reportAnomalies", rctx(), A("OWNER"), { from: D2, to: D2 });
    const rows: Any[] = r?.ok === true ? (r.report?.rows ?? []).filter((x: Any) => x.rule === "A11") : [];
    if (r?.ok !== true) p.push(`reportAnomalies ${codeOf(r)}`);
    const mg = rows.find((x) => x.userId === uid("MGR"));
    if (!mg || mg.unitId !== U.A || mg.count !== 3) p.push(`ผู้จัดการ ${short(mg ? { unit: mg.unitId === U.A ? "A" : mg.unitId === U.B ? "B" : mg.unitId, count: mg.count } : null, 60)}`);
    if (rows.some((x) => x.unitId === U.B)) p.push("มีแถว A11 ที่สาขา B");
    if (rows.some((x) => x.userId === uid("OWNER"))) p.push("รหัสกำกวมถูกนับ (เจ้าของ)");
    chk("AN5", p.length === 0, "A11 ที่สาขา A · กำกวม = ไม่นับ", FXB(joinP(p)));
  }

  // ════════ BR ════════
  const goldenDiff = (fid: "F1" | "F2" | "F3", locale: "th" | "en"): string[] => {
    const g = GOLDEN[fid][locale];
    const r = compose(JSON.parse(J(GOLDEN[fid].input)), locale);
    const p: string[] = [];
    if (!isRecord(r) || r.ok === false) return [`${fid}/${locale} composeBrief ${codeOf(r)}`];
    if (r.title !== g.title) p.push(`${fid}/${locale} title ${short(r.title, 60)}`);
    const lines: string[] = Array.isArray(r.lines) ? r.lines : [];
    if (lines.length !== g.lines.length) p.push(`${fid}/${locale} ${lines.length} บรรทัด (คาด ${g.lines.length})`);
    g.lines.forEach((l, i) => {
      if (lines[i] !== l) p.push(`${fid}/${locale}[${i}] "${short(lines[i], 60)}" ≠ "${l}"`);
    });
    if (J(sectionIds(r.sections)) !== J(g.sections)) p.push(`${fid}/${locale} sections ${short(sectionIds(r.sections), 80)}`);
    return p;
  };
  {
    const p = [...goldenDiff("F1", "th"), ...goldenDiff("F1", "en")];
    chk("BR1", p.length === 0, "F1 ตรงทุกบรรทัด", joinP(p));
  }
  {
    const p = [...goldenDiff("F2", "th"), ...goldenDiff("F2", "en"), ...goldenDiff("F3", "th"), ...goldenDiff("F3", "en")];
    chk("BR2", p.length === 0, "F2 + F3 ตรงทุกบรรทัด", joinP(p));
  }
  {
    const p: string[] = [];
    const s = await loadInput("SUP");
    if (s?.ok === false) p.push(`พนักงาน ${codeOf(s)}`);
    else {
      if (s?.anomalies !== null && s?.anomalies !== undefined) p.push(`พนักงาน anomalies ${short(s.anomalies, 50)}`);
      if (!isRecord(s?.daily)) p.push("(ตัวควบคุม) พนักงาน daily null");
      if ((compose(s, "th")?.lines ?? []).some((l: string) => l.startsWith("จุดผิดปกติ"))) p.push("พนักงานมีบรรทัดจุดผิดปกติ");
    }
    const m = await loadInput("MGR");
    if (!Array.isArray(m?.anomalies)) p.push(`ผู้จัดการ anomalies ${short(m?.anomalies, 40)}`);
    chk("BR3", p.length === 0, "ถูกปฏิเสธ = ไม่มีส่วนนั้น", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const ro = await daily("OWNER", YESTERDAY, YESTERDAY);
    const rm = await daily("MGR", YESTERDAY, YESTERDAY);
    const no = Number(ro?.report?.totals?.netSalesSatang);
    const nm = Number(rm?.report?.totals?.netSalesSatang);
    if (!(no > 0 && nm > 0 && no !== nm)) p.push(`(ตัวควบคุม) D−1 เจ้าของ ${no} ผู้จัดการ ${nm}`);
    const io = await loadInput("OWNER");
    const im = await loadInput("MGR");
    if (Number(io?.daily?.netSalesSatang) !== no) p.push(`เจ้าของ ${io?.daily?.netSalesSatang} (คาด ${no})`);
    if (Number(im?.daily?.netSalesSatang) !== nm) p.push(`ผู้จัดการ ${im?.daily?.netSalesSatang} (คาด ${nm})`);
    if (!Array.isArray(io?.stockRisks) || !io.stockRisks.some((x: Any) => String(x?.name ?? "").includes(PN.W ?? "§"))) p.push(`stockRisks ${short(io?.stockRisks, 60)}`);
    if (io?.businessDate !== YESTERDAY) p.push(`businessDate ${io?.businessDate}`);
    chk("BR4", p.length === 0, "เจ้าของ A+B · ผู้จัดการ A", FXB(joinP(p)));
  }
  const posted: string[] = [];
  const post = async (payloads: unknown[]) => {
    for (const x of payloads as Any[]) posted.push(String(x?.to ?? ""));
    return (payloads as Any[]).map(() => ({ status: "ok", id: `qc-${RAND}` }));
  };
  const job = (hh: number, mm: number) => call(briefMod, "sendPosDailyBriefs", { now: at(0, hh, mm), deadline: new Date(Date.now() + 60_000), tenantId: T, post });
  const briefRows = async (): Promise<Any[]> => (await P.appNotification.findMany({ where: { tenantId: T, OR: [{ title: { startsWith: BRIEF_TH } }, { title: { startsWith: BRIEF_EN } }] }, orderBy: { id: "asc" } }).catch(() => [])) as Any[];
  const delBriefs = () => step("ลบแจ้งเตือนสรุปเช้า", () => P.appNotification.deleteMany({ where: { tenantId: T, OR: [{ title: { startsWith: BRIEF_TH } }, { title: { startsWith: BRIEF_EN } }] } }));
  const RECIP = () => [uid("OWNER"), uid("MGR")].sort();
  const recips = (rows: Any[]) => rows.map((r) => String(r.recipientUserId)).sort();
  const allBriefRows: Any[] = [];
  {
    const p: string[] = [];
    const r0 = await job(5, 10);
    if (r0?.ok === false) p.push(`05:10 ${codeOf(r0)} ${short(r0?.message ?? "", 60)}`);
    if ((await briefRows()).length !== 0) p.push(`05:10 ส่ง ${(await briefRows()).length}`);
    const r1 = await job(6, 10);
    if (r1?.ok === false) p.push(`06:10 ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    const rows = await briefRows();
    allBriefRows.push(...rows);
    if (J(recips(rows)) !== J(RECIP())) p.push(`06:10 ผู้รับ ${rows.length} [${rows.map((x) => Object.entries(US).find(([, v]) => v.id === x.recipientUserId)?.[0] ?? "?").join(",")}]`);
    const mgrRow = rows.find((x) => x.recipientUserId === uid("MGR"));
    const exp = compose(await loadInput("MGR"), "th");
    if (mgrRow && (mgrRow.title !== exp?.title || mgrRow.body !== (exp?.lines ?? []).join("\n"))) p.push(`ผู้จัดการ title/body ≠ composeBrief (${short(mgrRow.title, 40)})`);
    const r2 = await job(6, 40);
    if (r2?.ok === false) p.push(`06:40 ${codeOf(r2)}`);
    if ((await briefRows()).length !== rows.length) p.push(`06:40 เพิ่ม ${(await briefRows()).length - rows.length}`);
    chk("BR5", p.length === 0, "0 · 2 · +0", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await delBriefs();
    const [a, b] = await Promise.all([job(6, 20), job(6, 20)]);
    if (a?.ok === false || b?.ok === false) p.push(`${codeOf(a)}/${codeOf(b)}`);
    const rows = await briefRows();
    allBriefRows.push(...rows);
    if (J(recips(rows)) !== J(RECIP())) p.push(`พร้อมกัน ${rows.length} ใบ`);
    chk("BR6", p.length === 0, "1 ใบต่อผู้รับ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await delBriefs();
    const before = posted.length;
    const r = await job(9, 10);
    if (r?.ok === false) p.push(`09:10 ${codeOf(r)}`);
    const rows = await briefRows();
    allBriefRows.push(...rows);
    if (J(recips(rows)) !== J(RECIP())) p.push(`ส่งตามหลัง ${rows.length} ใบ`);
    const now = posted.slice(before);
    if (!now.includes(TOKEN.OWNER ?? "§") || !now.includes(TOKEN.MGR ?? "§")) p.push(`push ${now.length} [${now.map((t) => Object.entries(TOKEN).find(([, v]) => v === t)?.[0] ?? "?").join(",")}]`);
    chk("BR7", p.length === 0, "ส่งตามหลัง + push", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await delBriefs();
    await step("ai.enabled false", () => patchPos((pos) => (pos.ai = aiSettings({ enabled: false }))));
    await job(9, 20);
    if ((await briefRows()).length) p.push(`ai ปิด ส่ง ${(await briefRows()).length}`);
    await step("brief.enabled false", () => patchPos((pos) => (pos.ai = { ...aiSettings(), brief: { ...aiSettings().brief, enabled: false } })));
    await job(9, 30);
    if ((await briefRows()).length) p.push(`brief ปิด ส่ง ${(await briefRows()).length}`);
    await step("คืนค่า ai", () => patchPos((pos) => (pos.ai = aiSettings())));
    const d = callSync(setShared, "posAiSettings", undefined);
    const want = { enabled: false, brief: { enabled: true, hourBkk: 6, email: false, managerUserIds: [] }, anomalyInBrief: true };
    if (C(d) !== C(want)) p.push(`posAiSettings(undefined) ${short(d, 120)}`);
    const w = callSync(setShared, "posAiSettings", { pos: { ai: { enabled: true, brief: { hourBkk: 24, managerUserIds: ["u1", 5, "u1", "u2"] } } } });
    if (w?.enabled !== true || w?.brief?.hourBkk !== 6 || J(w?.brief?.managerUserIds) !== J(["u1", "u2"]) || w?.brief?.enabled !== true || w?.anomalyInBrief !== true) p.push(`ค่าเพี้ยน ${short(w, 120)}`);
    chk("BR8", p.length === 0, "ปิด = 0 · ตัวอ่าน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const allowed = new Set([TOKEN.OWNER, TOKEN.MGR]);
    const bad = posted.filter((t) => !allowed.has(t));
    if (bad.length) p.push(`token นอกผู้รับ ${bad.length} [${[...new Set(bad.map((t) => Object.entries(TOKEN).find(([, v]) => v === t)?.[0] ?? short(t, 20)))].join(",")}]`);
    if (!posted.length) p.push("ไม่มี push เลย");
    chk("BR9", p.length === 0, "เฉพาะ token ผู้รับ", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.9 fix1 BR10) ▸ กันซ้ำแยกระบบ + ไม่ส่งสรุปเปล่า ◂
  {
    const p: string[] = [];
    let S2 = "";
    let MGR2 = "";
    if (!fx) {
      await step("BR10 ระบบที่สองชื่อซ้ำ", async () => {
        const UC = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาC`, slug: `${T_SLUG}-c` } })).id;
        S2 = (await sysSvc.createSystem(T, "POS", `POS คิวซี ${RAND}`)).id;
        await sysSvc.linkUnit(T, S2, UC);
        const u = await P.user.create({ data: { email: `${T_SLUG}-mgr2@qc.invalid`, name: `MGR2 คิวซี${RAND}` } });
        MGR2 = u.id;
        await P.membership.create({ data: { userId: u.id, tenantId: T, role: "MANAGER", unitAccess: [UC], permissions: {}, acceptedAt: new Date() } });
        const s0 = (await P.appSystem.findUnique({ where: { id: S2 }, select: { settings: true } }))?.settings ?? {};
        const s2 = isRecord(s0) ? JSON.parse(JSON.stringify(s0)) : {};
        s2.pos = { ...(isRecord(s2.pos) ? s2.pos : {}), ai: { enabled: true, brief: { enabled: true, hourBkk: 6, email: false, managerUserIds: [MGR2] }, anomalyInBrief: true } };
        await P.appSystem.update({ where: { id: S2 }, data: { settings: s2 } });
        await patchPos((pos) => (pos.ai = { ...aiSettings(), brief: { ...aiSettings().brief, managerUserIds: [uid("MGR"), MGR2] } }));
      });
    }
    await delBriefs();
    const r = await call(briefMod, "sendPosDailyBriefs", { now: at(0, 9, 40), deadline: new Date(Date.now() + 60_000), tenantId: T, post });
    if (r?.ok === false) p.push(`job ${codeOf(r)}`);
    const rows = await briefRows();
    allBriefRows.push(...rows);
    const own = rows.filter((x) => x.recipientUserId === uid("OWNER"));
    if (own.length !== 2 || new Set(own.map((x) => x.title)).size !== 2) p.push(`เจ้าของ ${own.length} ใบ [${own.map((x) => short(x.title, 50)).join(" | ")}]`);
    // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.9 fix2 N7 · BR10): ร้านมี POS ≥ 2 ระบบ ⇒ ทุกหัวเรื่องมี "(…<id 8 ตัวท้าย>)" ของระบบนั้น (ไม่ขึ้นกับชื่อซ้ำ) — เดิมตรวจแค่ "ไม่ชน"
    for (const sid of [S.POS ?? "none", S2 || "none"]) if (!own.some((x) => String(x.title).includes(`(…${sid.slice(-8)})`))) p.push(`ไม่มีหัวเรื่องที่ลงท้าย (…${sid.slice(-8)})`);
    const m2 = rows.filter((x) => x.recipientUserId === MGR2);
    if (m2.length !== 1) p.push(`ผู้จัดการสาขา C ${m2.length} ใบ (คาด 1 — ของระบบตัวเอง)`);
    const empty = rows.filter((x) => !String(x.body ?? "").trim());
    if (empty.length) p.push(`แจ้งเตือนเปล่า ${empty.length}`);
    await step("คืนค่า BR10", async () => {
      await patchPos((pos) => (pos.ai = aiSettings()));
      if (S2) await P.appSystem.update({ where: { id: S2 }, data: { active: false } });
    });
    chk("BR10", p.length === 0, "2 ใบ · ไม่มีใบเปล่า", FXB(joinP(p)));
  }

  // ════════ PV ════════
  {
    const p: string[] = [];
    const userRow = await P.user.findFirst({ where: { id: uid("OWNER") } }).catch(() => null);
    if (!PRIVACY_RE.test(J(userRow ?? {}))) p.push("(ตัวควบคุม) regex จับแถว User ไม่ได้");
    for (const r of allBriefRows) allOutputs.push(J({ title: r.title, body: r.body }));
    const hits = allOutputs.filter((o) => PRIVACY_RE.test(o));
    if (hits.length) p.push(`พบ ${hits.length}: ${short(PRIVACY_RE.exec(hits[0]!)?.[0], 20)} ใน ${short(hits[0], 80)}`);
    if (allOutputs.length < 20) p.push(`(ตัวควบคุม) ผลที่ตรวจ ${allOutputs.length}`);
    chk("PV1", p.length === 0, "ไม่มีข้อมูลเงินเดือน/ติดต่อ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!allBriefRows.length) p.push("ไม่มีแจ้งเตือนสรุปเช้า");
    const nulls = allBriefRows.filter((r) => !r.recipientUserId);
    if (nulls.length) p.push(`recipientUserId null ${nulls.length}`);
    chk("PV2", p.length === 0, "ไม่ null", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const s = await rt("SYS", "sales_summary", { ...RANGE });
    const ro = await daily("OWNER", RANGE.from, RANGE.to);
    if (!isErr(s.j)) p.push(`ไม่ถูกปฏิเสธ ${short(s.raw, 60)}`);
    if (hasAmount(s.raw, Number(ro?.report?.totals?.netSalesSatang ?? -1))) p.push("มียอดขาย");
    chk("PV3", p.length === 0, "ปฏิเสธ", FXB(joinP(p)));
  }
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
    if (t.length && t[0].slug !== slug) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  // ตารางลูกที่ไม่มี tenantId (ผูกด้วย FK) — ถูกลบตามแม่ (Cascade) หรือว่างอยู่แล้ว · ผู้ใช้ของรอบ (อีเมลมี slug)
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`).catch(() => {});
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
let usersLeft = -1;
try {
  runStatic();
  finishStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await sleep(300);
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    // ผู้ใช้ของรอบ (OWNER2 มี Membership ใน T2 ⇒ ลบหลังล้างทั้งสองร้าน)
    await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${T_SLUG}%@qc.invalid`).catch(() => {});
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${T_SLUG}%@qc.invalid`)) as Any[])[0]?.n ?? -1);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = wipes.reduce((a, w) => a + w.tenantLeft, 0);
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && usersLeft === 0, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · User 0", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`, tenantLeft ? "Tenant ยังอยู่" : "", wipeErr, `User ${usersLeft}`].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.values(fpBefore).some((v) => v.startsWith("err"));
chk("Z2", fpDrift.length === 0 && !fpErr, "ลายนิ้วมือเท่าเดิม", fpDrift.length ? `ต่าง ${fpDrift.join(", ")}` : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, pin: PIN, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft + Math.max(0, usersLeft) })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3.9 S: จอ 08 แผงผู้ช่วย AI + จอ 10 การ์ด/ชีตตั้งค่าสรุปเช้า (P3.9U · ภาพ) · LLM ขัดเกลาสรุป (ใบภายหลัง) · KB คู่มือ POS ·
//   แจ้งเตือนระหว่างวัน · A12 (ออฟไลน์ถูกปฏิเสธ — หลัง P3.4) · ห้องทีม/LINE/Telegram · สั่งอาหารผ่านแชทลูกค้า (P3.7)
// งานของ hunter (มติ 12): ยืนยันพร้อมกัน ×2 · void vs refund แข่ง · อนุมัติค้างแล้วยืนยันซ้ำ · 86 vs ออเดอร์เปิด · PO ยืนยันพร้อมกัน — ไม่อยู่ในข้อสอบนี้
