// QC — POS RUN ใบ P2.2: ราคาตามช่องทาง / สาขา / ช่วงเวลา (PosProductChannelPrice · PosPriceRule happy hour/โปร) + ตัวแก้ราคาบริสุทธิ์
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (ฐาน tmp/p118u-merge 348c6d47)
// requires: pos-seed (ใช้ userId ของร้าน QC กาแฟ/อาหารเป็นผู้กระทำจริงใน audit + สมาชิกภาพในร้านชั่วคราว)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.2.md §2 R1–R12 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD10 · §9 มติผู้คุมงาน (ผูกมัด)
//        ต่อยอด: qc-pos-p2.1 (ร้านชั่วคราว · ช่องทาง · quote/submit · บิลพัก · GL) · qc-pos-p1.12 (ระดับสมาชิก/คูปอง) · qc-pos-p1.5 (บิลพัก)
//                qc-pos-p1.8 (คืนเงิน) · qc-pos-p1.2 (สินค้าชั่ง/ตัวเลือก/ตัวแปร) · fitness-pos F15.2 (สัญญา createSale)
//        โน้ต: ledger/wo-notes/pos-P2.2-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.2 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   schema: model PosProductChannelPrice · model PosPriceRule · enum PosPriceSource/PosPriceRuleKind/PosPriceRuleAdjust ·
//     PosSaleLine += priceSource priceRuleId listPriceSatang · migration `20261204100000_pos_p22_prices` (CHECK + unique NULLS NOT DISTINCT มือ)
//   pos/price-shared.ts (บริสุทธิ์): resolveUnitPrice · channelMarkupPrice · PRICE_SOURCES · ค่าคงที่เพดาน
//   pos/price.ts: resolvePrices (C-6 priceFor · export ผ่าน pos/index.ts) · pos/price-rule.ts: listPriceRules savePriceRule archivePriceRule
//   pos/price-rule-actions.ts ("use server") · catalog.ts: setChannelPrices · bulkChannelMarkup · listForUnit.channelPrices เต็ม
//   register: ราคาตามชั้น (รอยต่อ P2.1 คงข้อความ) · quote line += priceSource listPriceSatang priceRule · catalog/scan += listPriceSatang priceSource priceRule ·
//     ผล catalog += priceValidUntil · CHANNEL_NOT_SOLD · held-cart.ts probe พก channelId · createSale lines[] += 3 ฟิลด์ไม่บังคับ ·
//   bills: BillDetail.lines[] += priceSource priceRuleName listPriceSatang · permissions "pos.price.rule" · ข้อความ th/en
//
// ขอบเขต: ST สถิต · S3 สัญญา createSale · B ตัวแก้ราคาบริสุทธิ์ · C ราคาช่องทาง/สาขา · P กติการาคา · Q หน้าขาย · S บิล · H บิลพัก ·
//   R คืนเงิน/ยกเลิก · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.1): SKIP เมื่อของ P2.2 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST4 + S3 + ตัวแก้ราคาบริสุทธิ์ B1–B7 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p22-<rand>` + `posqc-p22-<rand>-t2` (ลบทั้งร้านใน finally · แถวค้าง = 0)
//    ไม่มีนาฬิกาทดสอบในโค้ดเซิร์ฟเวอร์ (CD10): กติกาเวลาของ DB สร้างรอบ "ตอนนี้จริง" (เวลาไทย ±60 นาที) · ใกล้ขอบหน้าต่าง = ไม่รัน (exit 0 + เหตุผล)
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
//    โมดูล/โมเดล/คอลัมน์ที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · SQL ดิบเมื่อคอลัมน์มีจริง) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.2";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบ/ไม่เขียนอะไร · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.2-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 R3 R7 §3] schema + migration เพิ่มอย่างเดียว: model PosProductChannelPrice (คอลัมน์ R1 · @@index([tenantId, systemId, productId])) · model PosPriceRule (คอลัมน์ R3 · @@index([tenantId, systemId, archivedAt])) · enum PosPriceSource (7) / PosPriceRuleKind / PosPriceRuleAdjust ค่าตรง · PosSaleLine += priceSource PosPriceSource? priceRuleId String? listPriceSatang Int? · migration เดียว `20261204100000_pos_p22_prices`: SET lock_timeout · CREATE TYPE ×3 · CREATE TABLE IF NOT EXISTS ×2 · CHECK 3 เงื่อนไข · unique \"PosProductChannelPrice_product_code_unit_key\" (productId, channelCode, unitId) NULLS NOT DISTINCT (หรือ coalesce) · ADD COLUMN IF NOT EXISTS 3 ตัวพอดี · ไม่มีคำสั่งอื่น · schema มีคำเตือน \"ห้ามลบ\" ของ index มือ"),
  D("ST2", "S", "[R3 R12 §3 Q5] ลงทะเบียน: scope.ts PosProductChannelPrice + PosPriceRule · pos-qc-env POS_MODELS posProductChannelPrice + posPriceRule และ PosProductChannelPrice ไม่อยู่ใน POS_FUTURE_MODELS · permissions.ts \"pos.price.rule\" (ป้าย \"ตั้งโปรราคาและ happy hour\") · RegisterRefusalCode + REFUSAL_KEY ครบ CHANNEL_NOT_SOLD PRICE_RULE_NOT_FOUND PRICE_RULE_LIMIT → errors.<camel> · messages th+en register.errors 3 คีย์ (th ไทย) · ก้อน price.* (th ไทย)"),
  D("ST3", "S", "[R2–R6 R10 hard rules Q8] โมดูล: price-shared.ts (resolveUnitPrice channelMarkupPrice PRICE_SOURCES) ไม่ import อะไรที่ถึง prisma · price.ts export resolvePrices + pos/index.ts ส่งออก resolvePrices และ catalog.setChannelPrices/bulkChannelMarkup · price-rule.ts export listPriceRules savePriceRule archivePriceRule · catalog.ts export setChannelPrices bulkChannelMarkup · ผู้เขียนเดียว (PosProductChannelPrice เขียนใน catalog.ts เท่านั้น · PosPriceRule ใน price-rule.ts เท่านั้น) · register.ts ใช้ตัวแก้ราคา + รอยต่อ \"P2.2 ▸ channel price here\" ยังอยู่ (Q8) · pos-integrations MARKETING.happyHourPricing ยัง false (Q8) · catalog.ts toViews ไม่คืน channelPrices: [] ตายตัวแล้ว"),
  D("ST4", "S", "[hard rule] ทุกไฟล์ \"use server\" ใน modules/pos export async function ล้วน · price-rule-actions.ts: \"use server\" คำสั่งแรก · requireTenant · listPriceRulesAction savePriceRuleAction archivePriceRuleAction (แต่ละตัวเรียกฟังก์ชันบริการ + catch)"),
  D("S3", "S", "[R7 F15.2] scripts/pos-sale-contract.json: functions + MemberSaleChoices + SaleResult + ฟิลด์เดิม 45 ตัวของ CreateSaleInput ตรงฐาน 348c6d47 (แฮช) · ฟิลด์ใหม่ = lines[].priceSource? lines[].priceRuleId? (string) lines[].listPriceSatang? (number) พอดี — ทุกตัวไม่บังคับ"),
  // ── B ตัวแก้ราคาบริสุทธิ์ (price-shared.ts) ──
  D("B1", "P", "[R4 CD2 Q3] resolveUnitPrice ตารางลำดับ 16 แถว (สาขา × ช่องทางทุกสาขา × ช่องทาง+สาขา × กติกา 10%) บน LINEMAN สาขา A: rule > (code,unit) > (code,all) > (all,unit) > base · % คิดบนราคาขั้น ④ · list = ราคาฐาน 7,500 ทุกแถว · ruleId · ① OPEN/CUSTOM/WEIGHED ไม่โดนแถว/กติกา · ฐาน null + กติกา = PRICE_NOT_SET"),
  D("B2", "P", "[R4 ②④⑤] ตัวแปร (ไม่ตั้งราคา): ราคาแม่ = list · แถวของแม่ใช้กับลูก (CHANNEL 9,500 · BRANCH 7,000) · แถวของลูกเองชนะแถวแม่ระดับเดียวกัน · กติกาที่ระบุ id แม่ / หมวดของแม่ใช้กับลูก · แม่และลูกไม่มีราคา = PRICE_NOT_SET"),
  D("B3", "P", "[R4 ⑤⑥ CD5] คณิตกติกา (สตางค์ · ครึ่งขึ้น): PERCENT 7,500×20% → 6,000 · 7,550×15% (ลด 1,132.5 → 1,133) → 6,417 · 1×50% → 0 · 3×50% → 1 · 100% → 0 · AMOUNT 1,000 → 6,500 · AMOUNT 9,000 → 0 (clamp) · PRICE 5,900 · PRICE 0 · PRICE 9,900 (สูงกว่าฐาน) · % บนช่องทาง 9,500 → 7,600 · ตัวเลือก +1,000 บวกหลังกติกา (unit 6,900 · price 5,900)"),
  D("B4", "P", "[R4 ⑤ CD8] หน้าต่างเวลาไทย (+7 คงที่): 14:00–16:00 → 13:59:59.999 นอก · 14:00 ใน · 15:59:59.999 ใน · 16:00 นอก · วันในสัปดาห์ตามเวลาไทย (2026-10-08T17:00Z = ศุกร์ ใน · 16:59:59.999Z = พฤหัส นอก) · ช่วงวันที่ [startsAt, endsAt) ขอบทั้งสอง · 00:00–23:59 ที่ 23:59:30 นอก"),
  D("B5", "P", "[R4 ⑤] ตัดสินกติกาชน: priority สูงก่อน → ราคาผลต่ำก่อน → createdAt เก่าก่อน → id น้อยก่อน (ไม่ขึ้นกับลำดับในอาร์เรย์) · ขอบเขตไม่ตรง (สาขา/ช่องทาง/สินค้า/หมวด) · active false · archivedAt = ไม่นับ"),
  D("B6", "P", "[R1 R4 ④] notSold ต่อระดับ: (code,unit) notSold ชนะ (code,all) ราคา → CHANNEL_NOT_SOLD · (code,all) notSold แต่ (code,unit) มีราคา → ราคา · (all,unit) notSold ไม่มีแถวช่องทาง → CHANNEL_NOT_SOLD · มีแถวช่องทาง → ราคาช่องทาง · กติกาไม่ช่วย notSold · ช่องทางอื่นไม่สน notSold ของ LINEMAN · ลูกมีราคาเองชนะ notSold ของแม่"),
  D("B7", "P", "[R2 CD6 Q6] channelMarkupPrice ปัดครั้งเดียว: 7,500 × 2,700 bp ปัด 100 → 9,500 · ปัด 1 → 9,525 · 6,000 → 7,600 · 115 × 3,000 bp ปัด 100 → 100 (ไม่ปัดสองชั้น) · 7,550 × 1,500 ปัด 1 → 8,683 · ค่าคงที่ PRICE_SOURCES (7 ตัวเรียง) PRICE_RULE_LIMIT 100 CHANNEL_PRICE_ROWS_MAX 60 BULK_MARKUP_BP_MAX 20000 PRICE_RULE_PRODUCTS_MAX 500 PRICE_RULE_CATEGORIES_MAX 50"),
  // ── C ราคาช่องทาง/สาขา (catalog.ts) ──
  D("C1", "-", "[R1 R2] setChannelPrices (เจ้าของ): ตั้ง 3 แถว (LINEMAN ทุกสาขา · สาขา A ทุกช่องทาง · LINEMAN สาขา A) → แถวตรง + updatedByUserId · แทนทั้งชุดด้วย 1 แถว → เหลือ 1 · [] → 0 · รหัส builtin (QR_TABLE) ได้ · notSold → priceSatang null · ตั้งแถวของ fixture (ลาเต้ LINEMAN 9,400 → C6 9,500 · ม็อคค่า LINEMAN 8,500 · มัทฉะ LINEMAN ไม่ขาย · อเมริกาโน่ สาขา A 5,500)"),
  D("C2", "X5", "[R1 R2 CD7] VALIDATION ไม่เขียนอะไร: (code,unit) ซ้ำ · (null,null) · คีย์แปลก (แถว/บน) · notSold+ราคา · ไม่ notSold+ไม่มีราคา · ราคา −1 / 1.5 / สตริง / เกิน PRICE_MAX · รหัสที่ระบบไม่มี (GRAB) / ตัวเล็ก / ช่องทางที่เก็บถาวร · 61 แถว · rows ไม่ใช่อาร์เรย์ · สินค้าชั่ง → VALIDATION (แถวสินค้าชั่ง 0)"),
  D("C3", "X3", "[R2 Q5 X2] สิทธิ์ pos.product.setPrice ตามขอบเขต: ผู้จัดการสาขา A เขียนแถวสาขา A ได้ · แถวทุกสาขา → PERMISSION_DENIED · พนักงาน (pos.sale.create) → PERMISSION_DENIED · สินค้าร้าน T2 / id มั่ว → PRODUCT_NOT_FOUND · แถวไม่เปลี่ยน"),
  D("C4", "X5", "[R2] audit pos.product.channelPrice ต่อการเขียน (actorId = userId จริง · มี productId · before/after) · คำขอที่ถูกปฏิเสธไม่มี audit · AccountProduct.salePrice + InvItem.priceSatang ของสินค้าที่ผูกบัญชีไม่เปลี่ยน (ตัวควบคุมบวก: setPrice ฐานเขียนกลับจริง)"),
  D("C5", "-", "[R6] listForUnit.channelPrices: สาขา A อเมริกาโน่ = (LINEMAN ทุกสาขา 7,600 · channelId = LINEMAN ของสาขา A) + (สาขา A 5,500 · channelId null) · สาขา B ไม่เห็นแถวสาขา A · LINEMAN ที่สาขา B ไม่มีช่องทาง → channelId null · คีย์ต่อแถวตรง {channelId channelCode unitId priceSatang notSold}"),
  D("C6", "X4", "[R2 CD6 Q6] bulkChannelMarkup LINEMAN +27% ปัด 100 หมวดกาแฟ → แถวราคาตายตัว (ลาเต้ 9,500 · อเมริกาโน่ 7,600) · ข้ามสินค้าไม่มีราคา · ไม่แตะสินค้านอกหมวด · audit ต่อสินค้า · ผู้จัดการสาขา A ปรับเฉพาะ (LINEMAN, A) ได้ แถวอื่นของสินค้าคงอยู่ · ทุกสาขา → PERMISSION_DENIED · พนักงาน → PERMISSION_DENIED · bp 0 / 20001 · roundTo 10 · ทั้ง productIds+categoryId · ไม่มีทั้งคู่ · คีย์แปลก → VALIDATION"),
  // ── P กติการาคา (price-rule.ts) ──
  D("P1", "-", "[R3 CD8] savePriceRule/listPriceRules/archivePriceRule: สร้าง (คีย์ผล 18 ตัวพอดี · ค่าสะท้อนตรง) · แก้ด้วย id · ขอบที่ผ่าน (priority 0/100 · bp 1/10000 · PRICE 0 · ชื่อ 60 ตัว · 00:00–23:59 · หมวดล้วน) · ผิด → VALIDATION (ชื่อว่าง/61 · priority −1/101 · bp 0/10001 · AMOUNT 0 · PRICE −1/เกิน MAX · ไม่มีสินค้า+หมวด · เวลาข้างเดียว · from ≥ to · ข้ามเที่ยงคืน 22:00–02:00 · start ≥ end · วัน 7 · \"25:00\" · kind/adjust แปลก · คีย์แปลก · สินค้า 501 · หมวด 51 · ช่องทางตัวเล็ก) · archive → list ปกติไม่เห็น · includeArchived เห็น archived:true"),
  D("P2", "-", "[R3] เพดาน 100 กติกาที่ไม่เก็บถาวรต่อระบบ: เติมถึง 100 → ตัวที่ 101 → PRICE_RULE_LIMIT (ไม่มีแถวเพิ่ม) · เก็บถาวร 1 ตัว → สร้างได้อีก (กติกาที่เก็บถาวรไม่นับ)"),
  D("P3", "X3", "[R3 Q5] สิทธิ์ pos.price.rule: พนักงาน (pos.sale.create) list ได้ · save → PERMISSION_DENIED · ไม่มีสิทธิ์ POS list → PERMISSION_DENIED · ผู้จัดการสาขา A save unitIds [A] ได้ แต่ unitIds [] (ทุกสาขา) → PERMISSION_DENIED · archive กติกาทุกสาขา → PERMISSION_DENIED · พนักงานที่ได้คีย์ pos.price.rule ทุกสาขาบันทึก unitIds [] ได้ (ตัวควบคุมบวกของชื่อคีย์)"),
  D("P4", "X2", "[R3] id ของร้าน T2 / id มั่ว → PRICE_RULE_NOT_FOUND (save + archive) · แถวของ T2 ไม่เปลี่ยน · list ของร้านนี้ไม่เห็นกติกา T2"),
  D("P5", "X5", "[R3 R4 R5] quote ไม่ใช้กติกาที่ active false / เก็บถาวร / นอกช่วงวันที่ / นอกเวลา / นอกวัน / สาขาอื่น (ตัวควบคุมบวก: กติกาเดียวกันที่ใช้ได้ = RULE) · audit pos.priceRule.created / updated / archived actorId จริง (เจ้าของ · ผู้จัดการ) มี ruleId · คำขอที่ถูกปฏิเสธไม่มี audit"),
  // ── Q หน้าขาย ──
  D("Q1", "X4", "[R5 PAR] quote STORE ของสินค้าไม่มีแถว/กติกา = ก่อน P2.2 ทุกไบต์: ยอด + บรรทัด (คีย์เดิม) เท่าตะกร้าควบคุมรายการกำหนดเองราคาเดียวกัน (ส่วนลดบรรทัด + ท้ายบิล) · คีย์บนสุดเท่ากัน · คีย์ใหม่ของบรรทัดถ้ามี = priceSource BASE · listPriceSatang 5,000 · priceRule null (ข้อนี้ผ่านบนฐานเดิม)"),
  D("Q2", "-", "[R5 R10] channelId = LINEMAN → ลาเต้ 9,500 source CHANNEL list 7,500 priceRule null · STORE → 7,500 BASE · ลูกของม็อคค่า (ไม่ตั้งราคา) บน LINEMAN = แถวแม่ 8,500 · resolvePrices (channelId / channelCode) = ผลเดียวกัน · ส่งออกผ่าน pos facade"),
  D("Q3", "-", "[R4 CD2] แถวสาขา A (อเมริกาโน่ 5,500): STORE สาขา A = 5,500 BRANCH · สาขา B = 6,000 BASE · LINEMAN สาขา A = 7,600 CHANNEL (ช่องทางชนะสาขา)"),
  D("Q4", "X4", "[R5 R6] happy hour (PRICE 5,900 · STORE · ช่วงตอนนี้ ±60 นาที) → quote ลาเต้ 5,900 source RULE list 7,500 priceRule {id, name} · registerCatalog: priceSatang 5,900 listPriceSatang 7,500 priceSource RULE priceRule.id · priceValidUntil อยู่ในอนาคต ≤ ปลายหน้าต่าง"),
  D("Q5", "-", "[R4 CD2 Q3] กติกา STORE ไม่โดน LINEMAN (9,500 CHANNEL) → เพิ่มกติกา 20% ทุกช่องทาง priority 0 → LINEMAN 7,600 RULE (คิดบน 9,500) · STORE ยัง 5,900 (priority 10 ชนะ)"),
  D("Q6", "X4", "[R4 ⑥ CD5] ตัวเลือก M +1,000 บวกหลังกติกา: STORE 6,900 (optionsSatang 1,000) · LINEMAN 8,600 · listPriceSatang ไม่รวมตัวเลือก (7,500)"),
  D("Q7", "-", "[R4 ① CD7] ราคาเปิด 4,000 ของลาเต้ระหว่าง happy hour → 4,000 OPEN (STORE + LINEMAN) · รายการกำหนดเอง → CUSTOM · สินค้าชั่ง 500 g × 1,200/kg → 60,000 WEIGHED · ทั้งหมด priceRule null · list null"),
  D("Q8", "X5", "[R1 R4 R12] LINEMAN [เอสเพรสโซ่, มัทฉะ(ไม่ขาย)] → CHANNEL_NOT_SOLD lineIndex 1 (ข้อความไทย \"ไม่ขายในช่องทางนี้\") · STORE ตะกร้าเดียวกันผ่าน (ตัวควบคุม) · submit LINEMAN → CHANNEL_NOT_SOLD ไม่มีบิล"),
  D("Q9", "X4", "[R5 CD4 Q4] สมาชิก Gold 5% + คูปอง PCT10 บนราคากติกา: ลาเต้ ×2 (5,900) = ตะกร้าควบคุมรายการกำหนดเอง 5,900 ×2 ทุกยอด (คูปอง 1,180 · tier · grand) และ ≠ ตะกร้า 7,500 · เพดานส่วนลดพนักงาน 10% คิดบน 5,900 (10% ผ่าน ลด 590 · 10.01% → DISCOUNT_EXCEEDS_LIMIT) — กติกาไม่ใช่ส่วนลด"),
  D("Q10", "X5", "[R5] submit ด้วย expectedGrandTotal 5,900 หลังเก็บกติกา → PRICE_CHANGED พกยอดสด 7,500 (บรรทัด BASE) · ไม่มีแถวใหม่ (บิล/จ่าย/outbox/เลขใบเสร็จ) · ส่งใหม่ 7,500 → สำเร็จ บรรทัด BASE"),
  // ── S บิล ──
  D("S1", "X4", "[R5 R7 R11] submit STORE [ลาเต้ RULE, อเมริกาโน่ BRANCH, เอสเพรสโซ่ BASE, กำหนดเอง CUSTOM] + LINEMAN [ลาเต้ RULE 7,600 จาก 9,500] → PosSaleLine.priceSource/priceRuleId/listPriceSatang ตรงต่อบรรทัด · Σ บรรทัด = ยอดบิล = quote · billDetail.lines[] มี priceSource priceRuleName listPriceSatang"),
  D("S2", "X5", "[R7 CD3] createSale ตรง: ผู้เรียกเดิม (ไม่ส่ง) → 3 คอลัมน์ null · ส่งครบ → เขียนตามที่ส่ง (createSale ไม่คิดราคาเอง) · priceSource แปลก / priceRuleId 41 ตัว / listPriceSatang −1 / 1.5 → VALIDATION ไม่มีบิล · คีย์ซ้ำ + ฟิลด์ snapshot ต่าง = บิลเดิม (ไม่อยู่ใน samePayload)"),
  D("S4", "X1", "[R5 X1] submit ระหว่าง happy hour (คีย์ K) → เก็บกติกา → submit คีย์ K ซ้ำ (ยอดเดิม 5,900) → บิลเดิม duplicated · outbox pos.sale.paid 1 แถว · บรรทัดยัง RULE"),
  // ── H บิลพัก ──
  D("H1", "-", "[R9] พักลาเต้ระหว่าง happy hour (heldUnitPrices 5,900) → เก็บกติกา → recall → notice PRICE_CHANGED 5,900 → 7,500 · quote ปัจจุบัน BASE"),
  D("H2", "X2", "[R9 §9] held-cart.ts:292 probe: บิลพัก LINEMAN [ลาเต้ 7,600, อเมริกาโน่ 7,600, ครัวซองต์] → ปิดขายครัวซองต์ → recall → PRODUCT_UNAVAILABLE ที่บรรทัด 2 เท่านั้น · บรรทัดอื่นคิดราคา LINEMAN ไม่มี PRICE_CHANGED ปลอม · held-cart.ts ส่ง channelId ให้ probe (🔴 แดงบน 348c6d47 เพราะ probe ไม่พก channelId)"),
  // ── R คืนเงิน / ยกเลิก ──
  D("R1", "X4", "[R8] บิลลาเต้ ×3 ราคากติกา 5,900 → เก็บกติกา + ฐานเปลี่ยนเป็น 8,000 → คืน ⅓ = 5,900 · คืนที่เหลือ = 11,800 · บรรทัดใบคืน 3 คอลัมน์ null · บรรทัดบิลเดิมยัง RULE/ruleId/7,500"),
  D("R2", "X4", "[R8 CD9] GL ของบิลราคากติกา = บิล STORE รายการกำหนดเองเงินเท่ากัน (PAID · REFUNDED ×2 รูปตรงกัน) · ยกเลิกบิลราคากติกา → VOIDED · 3 คอลัมน์ไม่เปลี่ยน · รายการกลับรูปเดียวกับบิลควบคุมที่ยกเลิก"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวทั้งสองเหลือ 0 แถวทุกตารางที่มี tenantId (PosProductChannelPrice PosPriceRule PosSale/Line/Payment PosHeldCart SalesChannel OutboxEvent AuditLog AccountJournalEntry/Line …) + แถว Tenant ถูกลบ"),
  D("Z2", "-", "ไม่มีแถวของรอบนี้นอกร้านชั่วคราว (บิล/เครื่อง/กติกา/ราคา/audit/outbox) · ลายนิ้วมือ PosProductChannelPrice + PosPriceRule ของร้านที่ไม่ใช่ร้านชั่วคราว P2.2 ก่อน = หลัง"),
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
  const full = id.startsWith("P2.2-") ? id : `P2.2-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${(TITLE.get(full) ?? "").slice(0, 140)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
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
/** คำปฏิเสธแบบข้อมูล (คืนค่า ไม่ throw) */
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.threw;
/** คำปฏิเสธแบบใดก็ได้ (คืนค่า หรือ throw error ที่มี .code — แบบ CatalogError ของแคตตาล็อก) */
const codeIs = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.missing;
/** สำเร็จ = ไม่ใช่คำปฏิเสธ/ไม่ throw (แคตตาล็อกคืนค่าเปล่าได้) */
const okish = (r: Any) => r !== null && r !== undefined && r.ok !== false;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/โมเดล";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
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
/** ครึ่งขึ้นของ a×b/c (จำนวนเต็มไม่ติดลบ) — ตัวอ้างอิงของข้อสอบเอง */
const halfUp = (a: number, b: number, c: number) => (c > 0 ? Math.floor((2 * a * b + c) / (2 * c)) : 0);
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pad2 = (n: number) => String(n).padStart(2, "0");
const P8 = (p: string[]) => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "");

// ── ซอร์ส (สถิต) ──
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
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
const enumValues = (block: string): string[] =>
  block
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l));
/** ช่วงของ const/ออบเจกต์ที่เริ่มด้วย marker (ถึงวงเล็บปิดคู่แรก) */
function constBody(src: string, marker: string): string {
  const i0 = src.indexOf(marker);
  if (i0 < 0) return "";
  const eq = src.indexOf("=", i0);
  if (eq < 0) return "";
  const i = eq + 1;
  const open = src.slice(i).search(/[[{]/);
  if (open < 0) return "";
  const start = i + open;
  const o = src[start]!;
  const c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === o) depth++;
    else if (src[j] === c && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}

// ═════════════════════════ ชื่อที่ข้อสอบ "ตั้ง" (ตารางชื่อในโน้ต = สัญญาของผู้สร้าง) ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const F = {
  shared: `${POS_DIR}/price-shared.ts`,
  price: `${POS_DIR}/price.ts`,
  rule: `${POS_DIR}/price-rule.ts`,
  act: `${POS_DIR}/price-rule-actions.ts`,
  catalog: `${POS_DIR}/catalog.ts`,
  index: `${POS_DIR}/index.ts`,
  register: `${POS_DIR}/register.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  held: `${POS_DIR}/held-cart.ts`,
  service: `${POS_DIR}/service.ts`,
  integ: "src/lib/pos-integrations.ts",
  perms: "src/lib/core/permissions.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const SHARED_FNS = ["resolveUnitPrice", "channelMarkupPrice"] as const;
const RULE_FNS = ["listPriceRules", "savePriceRule", "archivePriceRule"] as const;
const CATALOG_FNS = ["setChannelPrices", "bulkChannelMarkup"] as const;
const ACTIONS: [string, string][] = [["listPriceRulesAction", "listPriceRules"], ["savePriceRuleAction", "savePriceRule"], ["archivePriceRuleAction", "archivePriceRule"]];
const PERM_RULE = "pos.price.rule";
const PERM_RULE_LABEL = "ตั้งโปรราคาและ happy hour";
const AUDIT = { channelPrice: "pos.product.channelPrice", created: "pos.priceRule.created", updated: "pos.priceRule.updated", archived: "pos.priceRule.archived" } as const;
const NEW_CODES = ["CHANNEL_NOT_SOLD", "PRICE_RULE_NOT_FOUND", "PRICE_RULE_LIMIT"];
const PRICE_SOURCES = ["BASE", "BRANCH", "CHANNEL", "RULE", "OPEN", "CUSTOM", "WEIGHED"];
const CP_COLS = ["id", "tenantId", "systemId", "productId", "channelCode", "unitId", "priceSatang", "notSold", "updatedByUserId", "createdAt", "updatedAt"] as const;
const PR_COLS = ["id", "tenantId", "systemId", "name", "kind", "active", "priority", "productIds", "categoryIds", "channelCodes", "unitIds", "adjust", "valueSatang", "valueBp", "startsAt", "endsAt", "weekdays", "timeFrom", "timeTo", "archivedAt", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"] as const;
const LINE_COLS = ["priceSource", "priceRuleId", "listPriceSatang"] as const;
const MIGRATION = "20261204100000_pos_p22_prices";
const UNIQUE_IDX = "PosProductChannelPrice_product_code_unit_key";
/** คีย์ของกติกาในผล (save/archive/list) — 18 ตัวพอดี */
const RULE_ITEM_KEYS = ["id", "name", "kind", "active", "priority", "productIds", "categoryIds", "channelCodes", "unitIds", "adjust", "valueSatang", "valueBp", "startsAt", "endsAt", "weekdays", "timeFrom", "timeTo", "archived"];
/** คีย์ของแถว listForUnit.channelPrices */
const CP_VIEW_KEYS = ["channelId", "channelCode", "unitId", "priceSatang", "notSold"];
/** คีย์เดิมของบรรทัด quote (ก่อน P2.2) + คีย์ใหม่ที่อนุญาต (R5) */
const QUOTE_LINE_OLD_KEYS = ["productId", "unitPriceSatang", "grossSatang", "discountSatang", "lineTotalSatang", "optionsSatang", "options", "weightGrams"];
const QUOTE_LINE_NEW_KEYS = ["priceSource", "listPriceSatang", "priceRule"];
const PRICE_MAX = 2_147_483_647;

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "S3"].map((x) => `P2.2-${x}`);
const PURE_IDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7"].map((x) => `P2.2-${x}`);
const skipReasons: string[] = [];
for (const f of [F.shared, F.price, F.rule, F.act]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const n of SHARED_FNS) if (!exportsFn(srcOf(F.shared), n)) skipReasons.push(`ยังไม่มี export ${n} (price-shared.ts)`);
for (const n of RULE_FNS) if (!exportsFn(srcOf(F.rule), n)) skipReasons.push(`ยังไม่มี export ${n} (price-rule.ts)`);
for (const n of CATALOG_FNS) if (!exportsFn(srcOf(F.catalog), n)) skipReasons.push(`ยังไม่มี export ${n} (catalog.ts)`);
if (!exportsFn(srcOf(F.price), "resolvePrices")) skipReasons.push("ยังไม่มี export resolvePrices (price.ts)");

/** ไฟล์ "shared" ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const reexports = [...s.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...reexports, ...dyn].some((p) =>
    /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/core\/(rbac|context|audit)|@\/lib\/modules\/(?!pos\/(pricing|register|channel)-shared)|^\.\/(price|price-rule|catalog|channel|receipt|register|service|bills|refund|shift|reports|held-cart|account-bridge|access)$/.test(p),
  );
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
/** แฮชฐานของสัญญา F15.2 ที่ 348c6d47 (session/pos + P2.1 + P1.18U) — functions + MemberSaleChoices + SaleResult + ฟิลด์เดิม 45 ตัวของ CreateSaleInput */
const CONTRACT_BASE_HASH = "773a37ae7f05e813";
const CONTRACT_BASE_KEYS = 45;
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : isRecord(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
function contractBaseHash(j: Any, baseKeys: string[]): string {
  const cs = isRecord(j?.types?.CreateSaleInput) ? j.types.CreateSaleInput : {};
  const picked = Object.fromEntries(baseKeys.map((k) => [k, cs[k] ?? null]));
  const body = { functions: j?.functions ?? null, MemberSaleChoices: j?.types?.MemberSaleChoices ?? null, SaleResult: j?.types?.SaleResult ?? null, CreateSaleInput: picked };
  return createHash("sha256").update(JSON.stringify(canon(body))).digest("hex").slice(0, 16);
}
const CONTRACT_BASE_FIELDS = ["tenantId", "unitId", "systemId", "pointSystemId", "memberId", "memberSystemId", "memberChoices", "sourceModule", "sourceId", "idempotencyKey", "lines", "lines[].name", "lines[].qty", "lines[].unitPriceSatang", "lines[].discountSatang", "lines[].itemId", "lines[].serviceId", "billDiscountSatang", "couponSystemId", "couponCode", "payMethods", "payMethods[].type", "payMethods[].amountSatang", "payMethods[].refSaleId", "lines[].productId", "lines[].note", "payMethods[].cashTenderedSatang", "payMethods[].reference", "note", "serviceChargeSatang", "tipSatang", "lines[].options", "lines[].components", "lines[].weightGrams", "shiftId", "soldByUserId", "taxInvoice", "memberSnapshot", "memberSnapshot.name", "memberSnapshot.memberCode", "memberSnapshot.phoneMasked", "memberSnapshot.tierKey", "memberSnapshot.tierName", "channelId", "channelRef"];
const NEW_CONTRACT_FIELDS = ["lines[].listPriceSatang", "lines[].priceRuleId", "lines[].priceSource"];
/** SQL → ตัวเล็ก ไม่มีวงเล็บ ช่องว่างเดียว (เทียบเงื่อนไข CHECK/INDEX แบบไม่สนรูปแบบการเขียน) */
const normSql = (s: string) => s.toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaRaw = walk("prisma/schema", [], /\.prisma$/).map((f) => rd(f)).join("\n");
  const schemaSrc = stripPrismaComments(schemaRaw);
  // ST1 schema + migration
  {
    const p: string[] = [];
    const typ = (blk: string, f: string) => fieldLine(blk, f).split(/\s+/)[1] ?? "";
    const cp = prismaBlock(schemaSrc, "model", "PosProductChannelPrice");
    if (!cp) p.push("ไม่มี model PosProductChannelPrice");
    else {
      const miss = CP_COLS.filter((c) => !fieldLine(cp, c));
      if (miss.length) p.push(`PosProductChannelPrice ขาด ${miss.join(",")}`);
      for (const [f, t] of [["productId", "String"], ["channelCode", "String?"], ["unitId", "String?"], ["priceSatang", "Int?"], ["notSold", "Boolean"]] as const)
        if (fieldLine(cp, f) && typ(cp, f) !== t) p.push(`PosProductChannelPrice.${f} ชนิด ${typ(cp, f)} (คาด ${t})`);
      if (fieldLine(cp, "notSold") && !/@default\(false\)/.test(fieldLine(cp, "notSold"))) p.push("notSold ไม่ใช่ @default(false)");
      if (!/@@index\(\s*\[\s*tenantId\s*,\s*systemId\s*,\s*productId\s*\]/.test(cp)) p.push("PosProductChannelPrice ไม่มี @@index([tenantId, systemId, productId])");
      if (/@relation\b/.test(cp)) p.push("PosProductChannelPrice มี @relation (บรีฟ: ไม่มี FK · id หลวม)");
    }
    const pr = prismaBlock(schemaSrc, "model", "PosPriceRule");
    if (!pr) p.push("ไม่มี model PosPriceRule");
    else {
      const miss = PR_COLS.filter((c) => !fieldLine(pr, c));
      if (miss.length) p.push(`PosPriceRule ขาด ${miss.join(",")}`);
      for (const [f, t] of [["kind", "PosPriceRuleKind"], ["adjust", "PosPriceRuleAdjust"], ["active", "Boolean"], ["priority", "Int"], ["productIds", "String[]"], ["categoryIds", "String[]"], ["channelCodes", "String[]"], ["unitIds", "String[]"], ["weekdays", "Int[]"], ["valueSatang", "Int?"], ["valueBp", "Int?"], ["startsAt", "DateTime?"], ["endsAt", "DateTime?"], ["timeFrom", "String?"], ["timeTo", "String?"], ["archivedAt", "DateTime?"]] as const)
        if (fieldLine(pr, f) && typ(pr, f) !== t) p.push(`PosPriceRule.${f} ชนิด ${typ(pr, f)} (คาด ${t})`);
      if (!/@@index\(\s*\[\s*tenantId\s*,\s*systemId\s*,\s*archivedAt\s*\]/.test(pr)) p.push("PosPriceRule ไม่มี @@index([tenantId, systemId, archivedAt])");
    }
    for (const [e, vals] of [["PosPriceSource", PRICE_SOURCES], ["PosPriceRuleKind", ["HAPPY_HOUR", "PROMO"]], ["PosPriceRuleAdjust", ["PRICE", "PERCENT_OFF", "AMOUNT_OFF"]]] as const) {
      const b = prismaBlock(schemaSrc, "enum", e);
      if (!b) p.push(`ไม่มี enum ${e}`);
      else if (short(enumValues(b).sort()) !== short([...vals].sort())) p.push(`enum ${e} = ${enumValues(b).join(",")}`);
    }
    const sl = prismaBlock(schemaSrc, "model", "PosSaleLine");
    for (const [f, re, lbl] of [["priceSource", /^priceSource\s+PosPriceSource\?(\s|$)/, "PosPriceSource?"], ["priceRuleId", /^priceRuleId\s+String\?(\s|$)/, "String?"], ["listPriceSatang", /^listPriceSatang\s+Int\?(\s|$)/, "Int?"]] as const) {
      const l = fieldLine(sl, f);
      if (!l) p.push(`PosSaleLine ไม่มี ${f}`);
      else if (!re.test(l)) p.push(`PosSaleLine.${f} ไม่ใช่ ${lbl}`);
    }
    // คำเตือน "ห้ามลบ" ของ index มือ (แบบ PosCategory M5)
    const at = schemaRaw.indexOf(UNIQUE_IDX);
    if (at < 0) p.push(`schema ไม่มีคำอธิบาย index มือ ${UNIQUE_IDX} (แบบ PosCategory M5)`);
    else if (!/ห้ามลบ|do not remove/i.test(schemaRaw.slice(Math.max(0, at - 600), at + 600))) p.push(`schema: ${UNIQUE_IDX} ไม่มีคำเตือน "ห้ามลบ"`);
    // migration
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosProductChannelPrice"|"PosPriceRule"|"listPriceSatang"|"PosPriceSource"/.test(rd(f)));
    if (files.length !== 1) p.push(`migration ที่แตะ PosProductChannelPrice/PosPriceRule/listPriceSatang = ${files.length} ไฟล์ (คาด 1)`);
    for (const f of files) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (name !== MIGRATION) p.push(`ชื่อ migration ${name} (คาด ${MIGRATION})`);
      let sql = rd(f).replace(/--.*$/gm, "");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks)
        if (!/CREATE\s+TYPE\s+"PosPrice(Source|RuleKind|RuleAdjust)"|ALTER\s+TABLE\s+"PosProductChannelPrice"\s+ADD\s+CONSTRAINT/i.test(b) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE)\b/i.test(b)) p.push(`DO block ไม่ใช่ CREATE TYPE/ADD CONSTRAINT ล้วน (${short(b, 60)})`);
      const inDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ok = (s: string) =>
        /^(SET|RESET) lock_timeout\b/i.test(s) ||
        /^CREATE TYPE "PosPrice(Source|RuleKind|RuleAdjust)" AS ENUM \(/i.test(s) ||
        /^CREATE TABLE IF NOT EXISTS "(PosProductChannelPrice|PosPriceRule)" \(/i.test(s) ||
        /^CREATE (UNIQUE )?INDEX IF NOT EXISTS "[^"]+" ON "(PosProductChannelPrice|PosPriceRule)"/i.test(s) ||
        /^ALTER TABLE "PosProductChannelPrice" ADD CONSTRAINT "[^"]+" CHECK\b/i.test(s) ||
        (/^ALTER TABLE "PosSaleLine" ADD COLUMN /i.test(s) && s.replace(/^ALTER TABLE "PosSaleLine" /i, "").split(/,\s*(?=ADD\b)/i).every((c) => /^ADD COLUMN IF NOT EXISTS /i.test(c.trim())));
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|ALTER COLUMN|SET NOT NULL)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งที่ไม่อยู่ในรายการอนุญาต/ไม่มี IF NOT EXISTS (${short(bad[0], 90)})`);
      const all = stmts.join(";\n") + "\n" + inDo;
      for (const e of ["PosPriceSource", "PosPriceRuleKind", "PosPriceRuleAdjust"]) if (!new RegExp(`CREATE\\s+TYPE\\s+"${e}"`, "i").test(all)) p.push(`ไม่มี CREATE TYPE "${e}"`);
      for (const [tb, cols] of [["PosProductChannelPrice", CP_COLS], ["PosPriceRule", PR_COLS]] as const) {
        const ct = stmts.find((s) => new RegExp(`^CREATE TABLE IF NOT EXISTS "${tb}" \\(`, "i").test(s)) ?? "";
        if (!ct) p.push(`ไม่มี CREATE TABLE IF NOT EXISTS "${tb}"`);
        else {
          const miss = cols.filter((c) => !new RegExp(`"${c}"`).test(ct));
          if (miss.length) p.push(`CREATE TABLE ${tb} ขาด ${miss.join(",")}`);
          if (/REFERENCES/i.test(ct)) p.push(`CREATE TABLE ${tb} มี FK (บรีฟ: ไม่มี FK)`);
        }
      }
      const cpSql = normSql([...stmts.filter((s) => /"PosProductChannelPrice"/.test(s)), inDo].join(" ; "));
      for (const [lbl, needle] of [["(code ∨ unit)", '"channelcode" is not null or "unitid" is not null'], ["notSold ⇒ ราคา null", 'not "notsold" or "pricesatang" is null'], ["¬notSold ⇒ มีราคา", '"notsold" or "pricesatang" is not null']] as const)
        if (!cpSql.includes(needle)) p.push(`CHECK ขาดเงื่อนไข ${lbl}`);
      const uq = new RegExp(`create unique index (if not exists )?"${UNIQUE_IDX.toLowerCase()}" on "posproductchannelprice" ?("productid" ?, ?"channelcode" ?, ?"unitid" ?nulls not distinct|.*coalesce)`);
      if (!uq.test(cpSql)) p.push(`ไม่มี unique "${UNIQUE_IDX}" ("productId","channelCode","unitId") NULLS NOT DISTINCT (หรือ coalesce)`);
      if (!/create index (if not exists )?"[^"]+" on "posproductchannelprice" ?"tenantid" ?, ?"systemid" ?, ?"productid"/.test(cpSql)) p.push('ไม่มี index PosProductChannelPrice("tenantId","systemId","productId")');
      if (!/create index (if not exists )?"[^"]+" on "pospricerule" ?\(? ?"tenantid" ?, ?"systemid" ?, ?"archivedat"/.test(normSql(stmts.filter((s) => /ON "PosPriceRule"/.test(s)).join(" ; ")))) p.push('ไม่มี index PosPriceRule("tenantId","systemId","archivedAt")');
      const added = stmts
        .filter((s) => /^ALTER TABLE "PosSaleLine" ADD COLUMN/i.test(s))
        .flatMap((s) => [...s.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"(\w+)"\s+([^,]+)/gi)].map((m) => [m[1]!, m[2]!.trim()] as const));
      const names = added.map(([n]) => n).sort();
      if (short(names) !== short([...LINE_COLS].sort())) p.push(`PosSaleLine ADD COLUMN = ${names.join(",") || "—"} (คาด 3 ตัวของบรีฟ)`);
      for (const [n, def] of added) {
        if (/NOT NULL/i.test(def)) p.push(`${n} ${def} (คาด nullable)`);
        if (n === "priceSource" && !/^"PosPriceSource"$/i.test(def)) p.push(`priceSource ${def}`);
        if (n === "priceRuleId" && !/^TEXT$/i.test(def)) p.push(`priceRuleId ${def}`);
        if (n === "listPriceSatang" && !/^INTEGER$/i.test(def)) p.push(`listPriceSatang ${def}`);
      }
    }
    chk("ST1", p.length === 0, "2 ตาราง + 3 enum + PosSaleLine 3 คอลัมน์ + migration เดียวเพิ่มล้วน (CHECK + unique มือ)", P8(p) || `ครบ (${files[0] ?? "—"})`);
  }
  // ST2 ลงทะเบียน
  {
    const p: string[] = [];
    const scope = srcOf(F.scope);
    for (const m of ["PosProductChannelPrice", "PosPriceRule"]) if (!new RegExp(`\\b${m}\\s*:\\s*sys\\(\\)`).test(scope)) p.push(`scope.ts ไม่มี ${m}: sys()`);
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposProductChannelPrice\s*:\s*\{[^}]*model:\s*"PosProductChannelPrice"/.test(pm)) p.push('pos-qc-env POS_MODELS ไม่มี posProductChannelPrice {model: "PosProductChannelPrice"}');
    if (!/\bposPriceRule\s*:\s*\{[^}]*model:\s*"PosPriceRule"/.test(pm)) p.push('pos-qc-env POS_MODELS ไม่มี posPriceRule {model: "PosPriceRule"}');
    if (/"PosProductChannelPrice"/.test(constBody(env, "export const POS_FUTURE_MODELS"))) p.push("PosProductChannelPrice ยังอยู่ใน POS_FUTURE_MODELS");
    const perms = srcOf(F.perms);
    const pk = new RegExp(`["']${PERM_RULE.replace(/\./g, "\\.")}["']\\s*:\\s*["']([^"']+)["']`).exec(perms);
    if (!pk) p.push(`permissions.ts ไม่มีคีย์ "${PERM_RULE}"`);
    else if (!pk[1]!.includes(PERM_RULE_LABEL)) p.push(`ป้าย ${PERM_RULE} = ${short(pk[1], 60)}`);
    const rs = srcOf(F.regShared);
    const ru = rs.slice(rs.indexOf("export type RegisterRefusalCode"), rs.indexOf("export type RegisterRefusal ="));
    const rk = constBody(rs, "const REFUSAL_KEY");
    for (const c of NEW_CODES) {
      if (!new RegExp(`["']${c}["']`).test(ru)) p.push(`RegisterRefusalCode ไม่มี ${c}`);
      if (!new RegExp(`\\b${c}\\s*:\\s*["']errors\\.${camel(c)}["']`).test(rk)) p.push(`REFUSAL_KEY ไม่มี ${c} → errors.${camel(c)}`);
    }
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const errs = j?.register?.errors;
      const miss = NEW_CODES.map(camel).filter((k) => typeof errs?.[k] !== "string" || !String(errs[k]).trim());
      if (miss.length) p.push(`${lang}: register.errors ขาด ${miss.join(",")}`);
      if (lang === "th") {
        const notThai = NEW_CODES.map(camel).filter((k) => typeof errs?.[k] === "string" && !THAI.test(errs[k]));
        if (notThai.length) p.push(`th: register.errors ไม่ใช่ไทย ${notThai.join(",")}`);
      }
      const leaves = (o: unknown): string[] => (typeof o === "string" ? [o] : isRecord(o) ? Object.values(o).flatMap(leaves) : []);
      if (!isRecord(j?.price) || leaves(j.price).length === 0) p.push(`${lang}: ไม่มีก้อนข้อความ price.*`);
      else if (lang === "th" && !leaves(j.price).some((s) => THAI.test(s))) p.push("th: price.* ไม่มีข้อความไทย");
    }
    chk("ST2", p.length === 0, "scope · pos-qc-env · สิทธิ์ pos.price.rule · รหัสปฏิเสธ 3 · ข้อความ th/en", P8(p) || "ครบ");
  }
  // ST3 โมดูล · ผู้เขียนเดียว · รอยต่อ · ค่าคงที่ของ Q8
  {
    const p: string[] = [];
    const sh = srcOf(F.shared);
    if (!sh) p.push(`ไม่มี ${F.shared}`);
    else {
      for (const n of [...SHARED_FNS, "PRICE_SOURCES"]) if (!exportsFn(sh, n)) p.push(`price-shared.ts ไม่ export ${n}`);
      if (!purePath(F.shared)) p.push("price-shared.ts import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ต้องบริสุทธิ์ · จอ import ได้)");
    }
    if (!exportsFn(srcOf(F.price), "resolvePrices")) p.push("price.ts ไม่ export resolvePrices");
    const idx = srcOf(F.index);
    for (const n of ["resolvePrices", "setChannelPrices", "bulkChannelMarkup"]) if (!new RegExp(`\\b${n}\\b`).test(idx)) p.push(`pos/index.ts ไม่ส่งออก ${n}`);
    for (const n of RULE_FNS) if (!exportsFn(srcOf(F.rule), n)) p.push(`price-rule.ts ไม่ export ${n}`);
    for (const n of CATALOG_FNS) if (!exportsFn(srcOf(F.catalog), n)) p.push(`catalog.ts ไม่ export ${n}`);
    // ผู้เขียนเดียว (COMMON 3 · hard rules)
    const writers = (delegate: string, table: string) =>
      walk("src")
        .filter((f) => new RegExp(`\\.${delegate}\\s*\\.\\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\\b|(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"${table}"`).test(srcOf(f)))
        .map((f) => f.split("/").pop() ?? f);
    const cpw = writers("posProductChannelPrice", "PosProductChannelPrice");
    if (!cpw.includes("catalog.ts")) p.push("catalog.ts ไม่เขียน PosProductChannelPrice");
    if (cpw.some((f) => f !== "catalog.ts")) p.push(`เขียน PosProductChannelPrice นอก catalog.ts: ${cpw.filter((f) => f !== "catalog.ts").join(",")}`);
    const prw = writers("posPriceRule", "PosPriceRule");
    if (!prw.includes("price-rule.ts")) p.push("price-rule.ts ไม่เขียน PosPriceRule");
    if (prw.some((f) => f !== "price-rule.ts")) p.push(`เขียน PosPriceRule นอก price-rule.ts: ${prw.filter((f) => f !== "price-rule.ts").join(",")}`);
    const reg = rd(F.register);
    if (!/P2\.2\s*▸\s*channel price here/.test(reg)) p.push("register.ts ไม่มีรอยต่อ // P2.2 ▸ channel price here ◂ (Q8: คงข้อความ · qc-pos-p2.1 ST3)");
    if (!/from\s+["']\.\/price(-shared)?["']/.test(stripComments(reg))) p.push("register.ts ไม่ import ตัวแก้ราคา (./price-shared หรือ ./price)");
    if (!/\[\s*"happyHourPricing"\s*,\s*false\s*,\s*"P2\.2"\s*\]/.test(srcOf(F.integ))) p.push('pos-integrations MARKETING.happyHourPricing ไม่ใช่ ["happyHourPricing", false, "P2.2"] (Q8: S คงไว้ · P2.2U พลิก)');
    if (/channelPrices\s*:\s*\[\s*\]/.test(srcOf(F.catalog))) p.push("catalog.ts ยังคืน channelPrices: [] ตายตัว (R6)");
    chk("ST3", p.length === 0, "price-shared บริสุทธิ์ · price/price-rule/catalog export ครบ · facade · ผู้เขียนเดียว · รอยต่อ P2.1 คงอยู่ · happyHourPricing false", P8(p) || "ครบ");
  }
  // ST4 "use server"
  {
    const p: string[] = [];
    const files = walk(POS_DIR).filter((f) => /^["']use server["']/.test(rd(f).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart()));
    for (const f of files) {
      const s = srcOf(f);
      const bad = [...s.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    const raw = rd(F.act);
    if (!raw) p.push(`ไม่มี ${F.act}`);
    else {
      const first = raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use server["']/.test(first)) p.push('price-rule-actions.ts: "use server" ไม่ใช่คำสั่งแรก');
      const s = stripComments(raw);
      if (!/requireTenant\s*\(/.test(s)) p.push("price-rule-actions.ts ไม่เรียก requireTenant");
      const starts = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (const [act, fn] of ACTIONS) {
        const i = starts.findIndex((x) => x.name === act);
        if (i < 0) {
          p.push(`ไม่มี ${act}`);
          continue;
        }
        const body = s.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : s.length);
        if (!new RegExp(`\\b${fn}\\s*\\(`).test(body)) p.push(`${act} ไม่เรียก ${fn}`);
        if (!/\bcatch\b/.test(body)) p.push(`${act} ไม่มี catch`);
      }
    }
    chk("ST4", p.length === 0, "use server = async function ล้วน · 3 actions ของกติการาคา", p.slice(0, 8).join(" · ") || `ครบ (${files.length} ไฟล์ use server)`);
  }
  // S3 สัญญา createSale
  {
    const p: string[] = [];
    let j: Any = null;
    try {
      j = JSON.parse(rd(F.contract) || "null");
    } catch (e) {
      p.push(`อ่าน ${F.contract} ไม่ได้: ${(e as Error).message.slice(0, 50)}`);
    }
    if (CONTRACT_BASE_FIELDS.length !== CONTRACT_BASE_KEYS) p.push(`(ข้อสอบ) ฐาน ${CONTRACT_BASE_FIELDS.length} ฟิลด์ ≠ ${CONTRACT_BASE_KEYS}`);
    const h = contractBaseHash(j, CONTRACT_BASE_FIELDS);
    if (h !== CONTRACT_BASE_HASH) p.push(`ของเดิมเปลี่ยน (แฮช ${h} ≠ ฐาน ${CONTRACT_BASE_HASH})`);
    const cs = isRecord(j?.types?.CreateSaleInput) ? j.types.CreateSaleInput : {};
    const extra = Object.keys(cs).filter((k) => !CONTRACT_BASE_FIELDS.includes(k)).sort();
    if (short(extra) !== short(NEW_CONTRACT_FIELDS)) p.push(`ฟิลด์ใหม่ = ${extra.join(",") || "—"} (คาด ${NEW_CONTRACT_FIELDS.join(",")})`);
    for (const k of NEW_CONTRACT_FIELDS) {
      const f = cs[k];
      if (!f) continue;
      if (f.optional !== true) p.push(`${k} ไม่ใช่ optional`);
      if (k === "lines[].priceRuleId" && f.type !== "string") p.push(`${k} ชนิด ${short(f.type, 40)} (คาด string)`);
      if (k === "lines[].listPriceSatang" && f.type !== "number") p.push(`${k} ชนิด ${short(f.type, 40)} (คาด number)`);
      if (k === "lines[].priceSource" && !(PRICE_SOURCES.every((x) => String(f.type).includes(`"${x}"`)) || /^[A-Z]\w*$/.test(String(f.type)))) p.push(`${k} ชนิด ${short(f.type, 80)} (คาดยูเนียน 7 ค่า หรือชื่อชนิด)`);
    }
    chk("S3", p.length === 0, "ของเดิมตรงฐาน · เพิ่ม lines[].priceSource? priceRuleId? listPriceSatang? พอดี", p.join(" · ") || `ครบ (${Object.keys(cs).length} ฟิลด์)`);
  }
}

// ═════════════════════════ 1b. ตัวแก้ราคาบริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
// อินพุตของ resolveUnitPrice (ตารางชื่อ §B ในโน้ต):
//   { product: {id, basePriceSatang, categoryId, parentId, soldByWeight?}, parent?: {id, basePriceSatang, categoryId} | null,
//     channelCode, unitId, rows: ChannelPriceRow[], rules: PriceRuleLike[], at: Date,
//     override?: {source: "OPEN"|"CUSTOM"|"WEIGHED", priceSatang}, optionDeltaSatang? }
// ผล: {ok:true, source, priceSatang (ก่อนตัวเลือก), unitPriceSatang (+ตัวเลือก), listPriceSatang, ruleId, ruleName} | {ok:false, code: PRICE_NOT_SET|CHANNEL_NOT_SOLD}
const UA = "u-A";
const UB = "u-B";
const LAT = "p-latte";
const CAT = "c-coffee";
const PAR = "p-parent";
const KID = "p-kid";
const AT0 = new Date("2026-10-09T07:30:00.000Z"); // ศุกร์ 14:30 เวลาไทย
type Row = { productId: string; channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean };
const prow = (productId: string, channelCode: string | null, unitId: string | null, priceSatang: number | null, notSold = false): Row => ({ productId, channelCode, unitId, priceSatang, notSold });
const prule = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "r-1",
  name: "โปรทดสอบ",
  kind: "HAPPY_HOUR",
  active: true,
  archivedAt: null,
  priority: 0,
  productIds: [LAT],
  categoryIds: [],
  channelCodes: [],
  unitIds: [],
  adjust: "PRICE",
  valueSatang: 5900,
  valueBp: null,
  startsAt: null,
  endsAt: null,
  weekdays: [],
  timeFrom: null,
  timeTo: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  ...o,
});
type Exp = { src: string; unit: number; list?: number | null; rule?: string | null; price?: number } | { code: string };
function pureCase(shared: Any, lbl: string, input: Record<string, unknown>, want: Exp, p: string[]): void {
  const base = { product: { id: LAT, basePriceSatang: 7500, categoryId: CAT, parentId: null, soldByWeight: false }, parent: null, channelCode: "LINEMAN", unitId: UA, rows: [], rules: [], at: AT0 };
  const r = callSync(shared, "resolveUnitPrice", { ...base, ...input });
  if ("code" in want) {
    if (!(r?.ok === false && r.code === want.code && !r.threw)) p.push(`${lbl} → ${codeOf(r)}${r?.ok === true ? ` ${r.source} ${r.unitPriceSatang}` : ""} (คาด ${want.code})`);
    return;
  }
  if (r?.ok !== true) {
    p.push(`${lbl} → ${codeOf(r)} ${short(r?.message ?? "", 40)}`);
    return;
  }
  const bad: string[] = [];
  if (r.source !== want.src) bad.push(`source ${r.source}`);
  if (r.unitPriceSatang !== want.unit) bad.push(`unit ${r.unitPriceSatang}`);
  if (want.price !== undefined && r.priceSatang !== want.price) bad.push(`price ${r.priceSatang}`);
  if (want.list !== undefined && r.listPriceSatang !== want.list) bad.push(`list ${r.listPriceSatang}`);
  if (want.rule !== undefined && (r.ruleId ?? null) !== want.rule) bad.push(`ruleId ${r.ruleId}`);
  if (bad.length) p.push(`${lbl}: ${bad.join(" ")} (คาด ${want.src} ${want.unit}${want.list !== undefined ? ` list ${want.list}` : ""}${want.rule !== undefined ? ` rule ${want.rule}` : ""})`);
}

async function runPure(shared: Any): Promise<void> {
  console.log("\n── B ตัวแก้ราคาบริสุทธิ์ ──");
  const NS = (fn: string) => (shared && typeof shared[fn] === "function" ? "" : `${MISSING} ${fn} (price-shared.ts) · `);
  // B1 ตารางลำดับ 16 แถว
  {
    const p: string[] = [];
    let n = 0;
    for (let m = 0; m < 16; m++) {
      const br = !!(m & 1);
      const all = !!(m & 2);
      const unit = !!(m & 4);
      const rl = !!(m & 8);
      const rows: Row[] = [];
      if (br) rows.push(prow(LAT, null, UA, 7000));
      if (all) rows.push(prow(LAT, "LINEMAN", null, 9500));
      if (unit) rows.push(prow(LAT, "LINEMAN", UA, 9000));
      const step4 = unit ? 9000 : all ? 9500 : br ? 7000 : 7500;
      const src4 = unit || all ? "CHANNEL" : br ? "BRANCH" : "BASE";
      const rules = rl ? [prule({ adjust: "PERCENT_OFF", valueSatang: null, valueBp: 1000 })] : [];
      const want: Exp = rl ? { src: "RULE", unit: step4 - halfUp(step4, 1000, 10_000), list: 7500, rule: "r-1" } : { src: src4, unit: step4, list: 7500, rule: null };
      pureCase(shared, `#${m} ${[br && "สาขา", all && "ช่องทาง", unit && "ช่องทาง+สาขา", rl && "กติกา"].filter(Boolean).join("+") || "ฐาน"}`, { rows, rules }, want, p);
      n++;
    }
    // ① ไม่โดนแถว/กติกา
    const loaded = { rows: [prow(LAT, "LINEMAN", null, 9500), prow(LAT, null, UA, 7000)], rules: [prule()] };
    pureCase(shared, "OPEN", { ...loaded, override: { source: "OPEN", priceSatang: 4000 } }, { src: "OPEN", unit: 4000, rule: null }, p);
    pureCase(shared, "CUSTOM", { ...loaded, override: { source: "CUSTOM", priceSatang: 1234 } }, { src: "CUSTOM", unit: 1234, rule: null }, p);
    pureCase(shared, "WEIGHED", { ...loaded, product: { id: LAT, basePriceSatang: 120_000, categoryId: CAT, parentId: null, soldByWeight: true }, override: { source: "WEIGHED", priceSatang: 60_000 } }, { src: "WEIGHED", unit: 60_000, rule: null }, p);
    pureCase(shared, "ฐาน null + กติกา", { product: { id: LAT, basePriceSatang: null, categoryId: CAT, parentId: null }, rules: [prule()], rows: [prow(LAT, "LINEMAN", null, 9500)] }, { code: "PRICE_NOT_SET" }, p);
    pureCase(shared, "ฐาน 0 (ฟรี) = BASE 0", { product: { id: LAT, basePriceSatang: 0, categoryId: CAT, parentId: null } }, { src: "BASE", unit: 0, list: 0, rule: null }, p);
    chk("B1", NS("resolveUnitPrice") === "" && p.length === 0, `${n} แถวลำดับ + ① 3 แบบ + PRICE_NOT_SET`, NS("resolveUnitPrice") + (P8(p) || "ครบ"));
  }
  // B2 ตัวแปร
  {
    const p: string[] = [];
    const kid = { id: KID, basePriceSatang: null, categoryId: null, parentId: PAR, soldByWeight: false };
    const parent = { id: PAR, basePriceSatang: 7500, categoryId: CAT };
    const V = (o: Record<string, unknown>) => ({ product: kid, parent, ...o });
    pureCase(shared, "ลูกไม่มีแถว", V({}), { src: "BASE", unit: 7500, list: 7500, rule: null }, p);
    pureCase(shared, "แถวช่องทางของแม่", V({ rows: [prow(PAR, "LINEMAN", null, 9500)] }), { src: "CHANNEL", unit: 9500, list: 7500 }, p);
    pureCase(shared, "แถวสาขาของแม่", V({ rows: [prow(PAR, null, UA, 7000)] }), { src: "BRANCH", unit: 7000, list: 7500 }, p);
    pureCase(shared, "ลูกชนะแม่ (ช่องทางทุกสาขา)", V({ rows: [prow(PAR, "LINEMAN", null, 9500), prow(KID, "LINEMAN", null, 9000)] }), { src: "CHANNEL", unit: 9000 }, p);
    pureCase(shared, "ลูกชนะแม่ (สาขา)", V({ channelCode: "STORE", rows: [prow(PAR, null, UA, 7000), prow(KID, null, UA, 6800)] }), { src: "BRANCH", unit: 6800 }, p);
    pureCase(shared, "กติกาที่ระบุ id แม่", V({ channelCode: "STORE", rules: [prule({ productIds: [PAR] })] }), { src: "RULE", unit: 5900, list: 7500, rule: "r-1" }, p);
    pureCase(shared, "กติกาตามหมวดของแม่", V({ channelCode: "STORE", rules: [prule({ productIds: [], categoryIds: [CAT] })] }), { src: "RULE", unit: 5900, rule: "r-1" }, p);
    pureCase(shared, "แถวของสินค้าอื่นไม่นับ", V({ rows: [prow("p-other", "LINEMAN", null, 1)] }), { src: "BASE", unit: 7500 }, p);
    pureCase(shared, "แม่+ลูกไม่มีราคา", { product: kid, parent: { ...parent, basePriceSatang: null }, rules: [prule({ productIds: [PAR, KID] })] }, { code: "PRICE_NOT_SET" }, p);
    pureCase(shared, "ลูกตั้งราคาเอง", { product: { ...kid, basePriceSatang: 8000 }, parent, channelCode: "STORE" }, { src: "BASE", unit: 8000, list: 8000 }, p);
    chk("B2", NS("resolveUnitPrice") === "" && p.length === 0, "ตัวแปรสืบราคา/แถว/กติกาของแม่ · แถวลูกชนะ", NS("resolveUnitPrice") + (P8(p) || "ครบ"));
  }
  // B3 คณิตกติกา
  {
    const p: string[] = [];
    const S = (rule: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ channelCode: "STORE", rules: [prule(rule)], ...extra });
    const pct = (bp: number) => ({ adjust: "PERCENT_OFF", valueSatang: null, valueBp: bp });
    const amt = (v: number) => ({ adjust: "AMOUNT_OFF", valueSatang: v, valueBp: null });
    const P0 = (b: number) => ({ product: { id: LAT, basePriceSatang: b, categoryId: CAT, parentId: null } });
    const cases: [string, Record<string, unknown>, number][] = [
      ["7500×20%", S(pct(2000)), 6000],
      ["7550×15% (.5 ขึ้น)", S(pct(1500), P0(7550)), 6417],
      ["1×50%", S(pct(5000), P0(1)), 0],
      ["3×50%", S(pct(5000), P0(3)), 1],
      ["100%", S(pct(10_000)), 0],
      ["AMOUNT 1000", S(amt(1000)), 6500],
      ["AMOUNT 9000 clamp", S(amt(9000)), 0],
      ["PRICE 5900", S({}), 5900],
      ["PRICE 0", S({ valueSatang: 0 }), 0],
      ["PRICE 9900 > ฐาน", S({ valueSatang: 9900 }), 9900],
      ["% บนช่องทาง 9500", { channelCode: "LINEMAN", rows: [prow(LAT, "LINEMAN", null, 9500)], rules: [prule(pct(2000))] }, 7600],
      ["AMOUNT บนสาขา 7000", { channelCode: "STORE", rows: [prow(LAT, null, UA, 7000)], rules: [prule(amt(500))] }, 6500],
    ];
    for (const [lbl, inp, want] of cases) pureCase(shared, lbl, inp, { src: "RULE", unit: want, price: want, rule: "r-1" }, p);
    pureCase(shared, "ตัวเลือก +1000 หลังกติกา", { ...S({}), optionDeltaSatang: 1000 }, { src: "RULE", unit: 6900, price: 5900, list: 7500, rule: "r-1" }, p);
    pureCase(shared, "ตัวเลือก +1000 บนช่องทาง", { channelCode: "LINEMAN", rows: [prow(LAT, "LINEMAN", null, 9500)], optionDeltaSatang: 1000 }, { src: "CHANNEL", unit: 10_500, price: 9500, list: 7500 }, p);
    // ตัวอ้างอิงของข้อสอบเอง (บรีฟ R4)
    if (7550 - halfUp(7550, 1500, 10_000) !== 6417 || 7500 - halfUp(7500, 2000, 10_000) !== 6000) p.push("(ข้อสอบ) ตัวอ้างอิงครึ่งขึ้นผิด");
    chk("B3", NS("resolveUnitPrice") === "" && p.length === 0, "PERCENT/AMOUNT/PRICE · ครึ่งขึ้น · clamp 0 · ตัวเลือกบวกหลัง", NS("resolveUnitPrice") + (P8(p) || "ครบ"));
  }
  // B4 หน้าต่างเวลาไทย
  {
    const p: string[] = [];
    const W = (at: string, r: Record<string, unknown>) => ({ channelCode: "STORE", at: new Date(at), rules: [prule(r)] });
    const IN = { src: "RULE", unit: 5900 } as const;
    const OUT = { src: "BASE", unit: 7500 } as const;
    const t = { timeFrom: "14:00", timeTo: "16:00" };
    const cases: [string, string, Record<string, unknown>, Exp][] = [
      ["13:59:59.999", "2026-10-09T06:59:59.999Z", t, OUT],
      ["14:00:00.000", "2026-10-09T07:00:00.000Z", t, IN],
      ["15:59:59.999", "2026-10-09T08:59:59.999Z", t, IN],
      ["16:00:00.000", "2026-10-09T09:00:00.000Z", t, OUT],
      ["ศุกร์ 00:00 ไทย (17:00Z พฤหัส)", "2026-10-08T17:00:00.000Z", { weekdays: [5] }, IN],
      ["พฤหัส 23:59:59.999 ไทย", "2026-10-08T16:59:59.999Z", { weekdays: [5] }, OUT],
      ["17:00Z ไม่ใช่วันพฤหัส (UTC)", "2026-10-08T17:00:00.000Z", { weekdays: [4] }, OUT],
      ["หลายวัน [0,5,6] วันศุกร์", "2026-10-09T07:30:00.000Z", { weekdays: [0, 5, 6] }, IN],
      ["startsAt พอดี", "2026-10-09T00:00:00.000Z", { startsAt: new Date("2026-10-09T00:00:00.000Z"), endsAt: new Date("2026-10-10T00:00:00.000Z") }, IN],
      ["ก่อน startsAt 1ms", "2026-10-08T23:59:59.999Z", { startsAt: new Date("2026-10-09T00:00:00.000Z"), endsAt: new Date("2026-10-10T00:00:00.000Z") }, OUT],
      ["ก่อน endsAt 1ms", "2026-10-09T23:59:59.999Z", { startsAt: new Date("2026-10-09T00:00:00.000Z"), endsAt: new Date("2026-10-10T00:00:00.000Z") }, IN],
      ["endsAt พอดี", "2026-10-10T00:00:00.000Z", { startsAt: new Date("2026-10-09T00:00:00.000Z"), endsAt: new Date("2026-10-10T00:00:00.000Z") }, OUT],
      ["startsAt null · endsAt อนาคต", "2026-10-09T07:30:00.000Z", { endsAt: new Date("2026-10-10T00:00:00.000Z") }, IN],
      ["00:00–23:59 ที่ 23:59:30 ไทย", "2026-10-09T16:59:30.000Z", { timeFrom: "00:00", timeTo: "23:59" }, OUT],
      ["00:00–23:59 ที่ 00:00 ไทย", "2026-10-08T17:00:00.000Z", { timeFrom: "00:00", timeTo: "23:59" }, IN],
      ["เวลา + วัน + ช่วงวันที่ ครบทุกเงื่อนไข", "2026-10-09T07:30:00.000Z", { ...t, weekdays: [5], startsAt: new Date("2026-10-01T00:00:00.000Z"), endsAt: new Date("2026-11-01T00:00:00.000Z") }, IN],
      ["เวลาตรงแต่วันไม่ตรง", "2026-10-09T07:30:00.000Z", { ...t, weekdays: [1, 2, 3] }, OUT],
    ];
    // ตัวอ้างอิง: วันในสัปดาห์ของเวลาไทย (ข้อสอบคิดเอง)
    const bkkDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).getUTCDay();
    if (bkkDay("2026-10-08T17:00:00.000Z") !== 5 || bkkDay("2026-10-08T16:59:59.999Z") !== 4) p.push("(ข้อสอบ) ตัวอ้างอิงวันในสัปดาห์ผิด");
    for (const [lbl, at, r, want] of cases) pureCase(shared, lbl, W(at, r), want, p);
    chk("B4", NS("resolveUnitPrice") === "" && p.length === 0, `${cases.length} ขอบเวลา/วัน/ช่วงวันที่ (เวลาไทย +7 · [from, to))`, NS("resolveUnitPrice") + (P8(p) || "ครบ"));
  }
  // B5 ตัดสินกติกาชน + ขอบเขต
  {
    const p: string[] = [];
    const both = (lbl: string, a: Record<string, unknown>, b: Record<string, unknown>, want: Exp) => {
      pureCase(shared, `${lbl} (a,b)`, { channelCode: "STORE", rules: [prule(a), prule(b)] }, want, p);
      pureCase(shared, `${lbl} (b,a)`, { channelCode: "STORE", rules: [prule(b), prule(a)] }, want, p);
    };
    both("priority", { id: "r-a", priority: 5, valueSatang: 7000 }, { id: "r-b", priority: 1, valueSatang: 5000 }, { src: "RULE", unit: 7000, rule: "r-a" });
    both("ราคาต่ำ", { id: "r-a", priority: 3, valueSatang: 6000 }, { id: "r-b", priority: 3, adjust: "PERCENT_OFF", valueSatang: null, valueBp: 1000 }, { src: "RULE", unit: 6000, rule: "r-a" });
    both("createdAt เก่า", { id: "r-a", priority: 3, valueSatang: 6000, createdAt: new Date("2026-10-02T00:00:00.000Z") }, { id: "r-b", priority: 3, adjust: "AMOUNT_OFF", valueSatang: 1500, createdAt: new Date("2026-10-01T00:00:00.000Z") }, { src: "RULE", unit: 6000, rule: "r-b" });
    both("id น้อย", { id: "r-b", priority: 3, valueSatang: 6000 }, { id: "r-a", priority: 3, valueSatang: 6000 }, { src: "RULE", unit: 6000, rule: "r-a" });
    const ignore: [string, Record<string, unknown>][] = [
      ["สาขาอื่น", { unitIds: [UB] }],
      ["ช่องทางอื่น", { channelCodes: ["LINEMAN"] }],
      ["เก็บถาวร", { archivedAt: new Date("2026-10-05T00:00:00.000Z") }],
      ["active false", { active: false }],
      ["สินค้าอื่น", { productIds: ["p-other"] }],
      ["หมวดอื่น", { productIds: [], categoryIds: ["c-other"] }],
    ];
    for (const [lbl, r] of ignore) pureCase(shared, `ไม่นับ: ${lbl}`, { channelCode: "STORE", rules: [prule(r)] }, { src: "BASE", unit: 7500, rule: null }, p);
    const apply: [string, Record<string, unknown>][] = [
      ["หมวดตรง", { productIds: [], categoryIds: [CAT] }],
      ["สาขา+ช่องทางตรง", { unitIds: [UA], channelCodes: ["STORE", "LINEMAN"] }],
    ];
    for (const [lbl, r] of apply) pureCase(shared, `นับ: ${lbl}`, { channelCode: "STORE", rules: [prule(r)] }, { src: "RULE", unit: 5900, rule: "r-1" }, p);
    pureCase(shared, "ตัวที่ใช้ไม่ได้ไม่ชนะตัวที่ใช้ได้", { channelCode: "STORE", rules: [prule({ id: "r-x", priority: 99, valueSatang: 100, active: false }), prule({ id: "r-y", priority: 0 })] }, { src: "RULE", unit: 5900, rule: "r-y" }, p);
    chk("B5", NS("resolveUnitPrice") === "" && p.length === 0, "priority → ราคาต่ำ → createdAt → id · ไม่ขึ้นกับลำดับ · ขอบเขต", NS("resolveUnitPrice") + (P8(p) || "ครบ"));
  }
  // B6 notSold ต่อระดับ
  {
    const p: string[] = [];
    const NSOLD = { code: "CHANNEL_NOT_SOLD" } as const;
    pureCase(shared, "(code,unit) notSold ชนะ (code,all)", { rows: [prow(LAT, "LINEMAN", UA, null, true), prow(LAT, "LINEMAN", null, 9500)] }, NSOLD, p);
    pureCase(shared, "(code,all) notSold แต่ (code,unit) มีราคา", { rows: [prow(LAT, "LINEMAN", null, null, true), prow(LAT, "LINEMAN", UA, 9000)] }, { src: "CHANNEL", unit: 9000 }, p);
    pureCase(shared, "(code,all) notSold ล้วน", { rows: [prow(LAT, "LINEMAN", null, null, true)] }, NSOLD, p);
    pureCase(shared, "(all,unit) notSold ไม่มีแถวช่องทาง", { rows: [prow(LAT, null, UA, null, true)] }, NSOLD, p);
    pureCase(shared, "(all,unit) notSold + แถวช่องทาง", { rows: [prow(LAT, null, UA, null, true), prow(LAT, "LINEMAN", null, 9500)] }, { src: "CHANNEL", unit: 9500 }, p);
    pureCase(shared, "notSold + กติกา", { rows: [prow(LAT, "LINEMAN", null, null, true)], rules: [prule()] }, NSOLD, p);
    pureCase(shared, "STORE ไม่สน notSold ของ LINEMAN", { channelCode: "STORE", rows: [prow(LAT, "LINEMAN", null, null, true)] }, { src: "BASE", unit: 7500 }, p);
    pureCase(shared, "notSold สาขา B ไม่กระทบสาขา A", { rows: [prow(LAT, "LINEMAN", UB, null, true)] }, { src: "BASE", unit: 7500 }, p);
    pureCase(
      shared,
      "ลูกมีราคาเองชนะ notSold ของแม่",
      { product: { id: KID, basePriceSatang: null, categoryId: null, parentId: PAR }, parent: { id: PAR, basePriceSatang: 7500, categoryId: CAT }, rows: [prow(PAR, "LINEMAN", null, null, true), prow(KID, "LINEMAN", null, 9000)] },
      { src: "CHANNEL", unit: 9000 },
      p,
    );
    pureCase(shared, "notSold ของแม่ใช้กับลูก", { product: { id: KID, basePriceSatang: null, categoryId: null, parentId: PAR }, parent: { id: PAR, basePriceSatang: 7500, categoryId: CAT }, rows: [prow(PAR, "LINEMAN", null, null, true)] }, NSOLD, p);
    chk("B6", NS("resolveUnitPrice") === "" && p.length === 0, "notSold ที่ระดับที่ชนะ = CHANNEL_NOT_SOLD · ระดับที่แพ้ไม่นับ", NS("resolveUnitPrice") + (P8(p) || "ครบ"));
  }
  // B7 ปัดราคาเพิ่มเป็น % + ค่าคงที่
  {
    const p: string[] = [];
    const ref = (base: number, bp: number, to: number) => to * halfUp(base, 10_000 + bp, 10_000 * to);
    const cases: [number, number, number, number][] = [
      [7500, 2700, 100, 9500],
      [7500, 2700, 1, 9525],
      [6000, 2700, 100, 7600],
      [115, 3000, 100, 100],
      [7550, 1500, 1, 8683],
      [1, 1, 1, 1],
      [8900, 20_000, 100, 26_700],
    ];
    for (const [b, bp, to, want] of cases) {
      if (ref(b, bp, to) !== want) p.push(`(ข้อสอบ) ตัวอ้างอิง ${b}×${bp}/${to} = ${ref(b, bp, to)}`);
      const r = callSync(shared, "channelMarkupPrice", b, bp, to);
      if (r !== want) p.push(`${b}×${bp}bp ปัด ${to} → ${short(r?.code ?? r, 30)} (คาด ${want})`);
    }
    if (short(shared?.PRICE_SOURCES) !== short(PRICE_SOURCES)) p.push(`PRICE_SOURCES ${short(shared?.PRICE_SOURCES, 90)}`);
    for (const [k, v] of [["PRICE_RULE_LIMIT", 100], ["CHANNEL_PRICE_ROWS_MAX", 60], ["BULK_MARKUP_BP_MAX", 20_000], ["PRICE_RULE_PRODUCTS_MAX", 500], ["PRICE_RULE_CATEGORIES_MAX", 50]] as const)
      if (shared?.[k] !== v) p.push(`${k} = ${short(shared?.[k], 10)} (คาด ${v})`);
    chk("B7", NS("channelMarkupPrice") === "" && p.length === 0, "ปัดครั้งเดียวครึ่งขึ้น 7 กรณี · ค่าคงที่ 6 ตัว", NS("channelMarkupPrice") + (P8(p) || "ครบ"));
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + ตัวแก้ราคาบริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    const ok = existsSync(join(ROOT, F.shared)) && purePath(F.shared);
    if (existsSync(join(ROOT, F.shared)) && !ok) console.log("  ⚠️  price-shared.ts ไม่บริสุทธิ์ — --no-db ไม่โหลด (B แดง)");
    await runPure(ok ? await tryImport("@/lib/modules/pos/price-shared") : null);
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
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
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

// ═════════════════════════ 3. ด่าน SKIP + ด่านหน้าต่างเวลา ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
let seedOk = false;
try {
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน (ใช้ userId เจ้าของ/แคชเชียร์)");
if (typeof P.posProductChannelPrice?.findMany !== "function") skipReasons.push("Prisma client ยังไม่มี delegate posProductChannelPrice (R1)");
if (typeof P.posPriceRule?.findMany !== "function") skipReasons.push("Prisma client ยังไม่มี delegate posPriceRule (R3)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSaleLine','PosProductChannelPrice','PosPriceRule')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = { line: LINE_COLS.every((c) => dbCols.has(`PosSaleLine.${c}`)), cp: dbCols.has("PosProductChannelPrice.productId"), pr: dbCols.has("PosPriceRule.productIds") };
if (!COL.line) skipReasons.push(`ฐาน QC4 ยังไม่มีคอลัมน์ PosSaleLine.${LINE_COLS.filter((c) => !dbCols.has(`PosSaleLine.${c}`)).join("/")}`);
if (!COL.cp) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosProductChannelPrice");
if (!COL.pr) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosPriceRule");

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.2 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// หน้าต่างกติกาเวลาจริง (CD10): เวลาไทยตอนนี้ ±60 นาที ตัดที่ 00:00/23:59 (ไม่ข้ามเที่ยงคืน CD8) — ใกล้ขอบ = ไม่รัน
const BKK_MS = 7 * 3_600_000;
const NOW0 = Date.now();
const bkkMin = Math.floor(((NOW0 + BKK_MS) % 86_400_000) / 60_000);
const hhmm = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const WIN = { from: Math.max(0, bkkMin - 60), to: Math.min(23 * 60 + 59, bkkMin + 60) };
const WIN_HEAD = 2;
const WIN_TAIL = 20; // รอบเต็มใช้หลายนาที — ปลายหน้าต่างต้องเหลือพอให้กติกายังอยู่ในหน้าต่างจนจบ
const TODAY_BKK = new Date(NOW0 + BKK_MS).getUTCDay();
const BKK_MIDNIGHT_UTC = NOW0 - ((NOW0 + BKK_MS) % 86_400_000); // เที่ยงคืนไทยของวันนี้ (ms UTC)
const WIN_END_UTC = BKK_MIDNIGHT_UTC + WIN.to * 60_000;
if (bkkMin - WIN.from < WIN_HEAD || WIN.to - bkkMin < WIN_TAIL) {
  const why = `เวลาไทย ${hhmm(bkkMin)} ใกล้ขอบวัน — หน้าต่าง ${hhmm(WIN.from)}–${hhmm(WIN.to)} เหลือหัว ${bkkMin - WIN.from} นาที / ท้าย ${WIN.to - bkkMin} นาที (ต้อง ≥ ${WIN_HEAD}/${WIN_TAIL}) · รันใหม่หลัง 00:${pad2(WIN_HEAD)} เวลาไทย`;
  console.log(`⏭️  SKIPPED — ${SUITE}: ${why} (ยังไม่ได้เขียนอะไร)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: [why], registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
/** หน้าต่างเวลาที่ "ไม่" ครอบตอนนี้ (P5 นอกเวลา) — ฝั่งที่ยังอยู่ในวันเดียวกัน */
const OFF = bkkMin + 120 <= 23 * 60 + 59 ? { from: bkkMin + 90, to: bkkMin + 120 } : { from: bkkMin - 120, to: bkkMin - 90 };

const COUNT_MODELS = ["posSale", "posSaleLine", "posPayment", "posHeldCart", "outboxEvent", "auditLog", "accountJournalEntry", "salesChannel"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS)
    for (const m of COUNT_MODELS) {
      const d = P[m];
      out[`${tid}.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: tid } }).catch((e: Error) => `err:${e.message.slice(0, 30)}`) : "absent";
    }
  return out;
}
const countsBefore = await snapshotCounts();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const sharedMod = ex(F.shared) ? await tryImport("@/lib/modules/pos/price-shared") : null;
const priceMod = ex(F.price) ? await tryImport("@/lib/modules/pos/price") : null;
const ruleMod = ex(F.rule) ? await tryImport("@/lib/modules/pos/price-rule") : null;
const catalogMod = await tryImport("@/lib/modules/pos/catalog");
const posIndex = await tryImport("@/lib/modules/pos");
const svc = await tryImport("@/lib/modules/pos/service");
const register = await tryImport("@/lib/modules/pos/register");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const couponMod = await tryImport("@/lib/modules/coupon/service");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.2-${RAND}`;
const T_SLUG = `posqc-p22-${RAND}`;
const T2_SLUG = `posqc-p22-${RAND}-t2`;
const KEY_PREFIX = `qc22-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;

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

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !PURE_IDS.includes(id) && id !== "P2.2-Z1" && id !== "P2.2-Z2");
const dataRefusals: [string, Any][] = [];
const keep = (label: string, r: Any) => {
  if (r?.ok === false && !r.missing) dataRefusals.push([label, r]);
  return r;
};

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} · หน้าต่างกติกา ${hhmm(WIN.from)}–${hhmm(WIN.to)} วัน ${TODAY_BKK} (เวลาไทยตอนนี้ ${hhmm(bkkMin)}) ──`);
  console.log("   POS ผูกสมุดจด VAT · สาขา A (สมาชิก+คูปอง+คลัง) + B · ร้าน T2 สาขา X · ผู้ใช้ เจ้าของ / ผู้จัดการสาขา A / พนักงาน");
  let fx = "";
  const notes: string[] = [];
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const mgrId: string = PQC.coffee.users.cashier.userId;
  const staffId: string = PQC.resto.users.cashier.userId;
  const step = async (label: string, fn: () => unknown): Promise<Any> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.2 ราคาตามช่องทาง ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.2 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    for (const k of ["A", "B"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", "POS QC P2.2")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี VAT QC P2.2")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P2.2")).id;
    S.CPN = (await sysSvc.createSystem(T, "COUPON", "คูปอง QC P2.2")).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", "คลัง QC P2.2")).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", "POS ร้าน T2")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านราคาคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    for (const k of ["A", "B"]) await sysSvc.linkUnit(T, S.POS, U[k]);
    for (const sys of [S.MEM, S.CPN, S.INV]) await sysSvc.linkUnit(T, sys, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    // สมาชิกภาพในร้านชั่วคราว (แคตตาล็อกอ่านสิทธิ์จาก Membership ของ actorUserId)
    await P.membership.create({ data: { userId: ownerId, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: mgrId, tenantId: T, role: "MANAGER", unitAccess: [U.A], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: staffId, tenantId: T, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true }, acceptedAt: new Date() } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  // ─── ผู้กระทำ (หน้าขาย/กติกา = ออบเจกต์ของ session · แคตตาล็อก = userId ที่มี Membership) ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const manager = { userId: mgrId, role: "MANAGER", unitAccess: [U.A], permissions: {} };
  const staff = { userId: staffId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true } };
  const nobody = { userId: staffId, role: "STAFF", unitAccess: [U.A], permissions: {} };
  const staffKeyAll = { userId: staffId, role: "STAFF", unitAccess: [U.A, U.B], permissions: { "pos.sale.create": true, [PERM_RULE]: true } };
  const staffKeyA = { userId: staffId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true, [PERM_RULE]: true } };
  const sysOf = (k: string) => (k === "X" ? S.POSX : S.POS);
  const tenOf = (k: string) => (k === "X" ? T2 : T);
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: tenOf(k), systemId: sysOf(k), unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const SYSTEM_ACTOR: unknown = catalogMod?.CATALOG_SYSTEM_ACTOR ?? ownerId;
  const cctxSys: Any = { tenantId: T, systemId: S.POS, actorUserId: SYSTEM_ACTOR };
  const cctxOf = (userId: string): Any => ({ tenantId: T, systemId: S.POS, actorUserId: userId });
  const unitKey = (id: string | null) => (id === null ? "*" : (Object.entries(U).find(([, v]) => v === id)?.[0] ?? `?${String(id).slice(-4)}`));

  // ─── เครื่อง + กะ (สาขา A) ───
  const DEV1 = `qc22${RAND}d1`;
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC P2.2", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC P2.2", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
  }

  // ─── ช่องทาง (P2.1): builtins A/B · LINEMAN ที่ A · ช่องทางที่เก็บถาวร ───
  const CH: Record<string, string> = {};
  if (!fx) {
    for (const k of ["A", "B"]) {
      const r = await call(chMod, "listChannels", ctxOf(k), owner, {});
      CH[`STORE_${k}`] = String((r?.items ?? []).find((i: Any) => i?.code === "STORE")?.id ?? "");
    }
    const lm = await call(chMod, "saveChannel", ctxOf("A"), owner, { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 });
    CH.LM_A = String(lm?.channel?.id ?? "");
    const old = await call(chMod, "saveChannel", ctxOf("A"), owner, { code: "CUSTOM_OLD", name: `เลิกใช้ ${RAND}`, payout: "DIRECT" });
    if (old?.channel?.id) await call(chMod, "archiveChannel", ctxOf("A"), owner, { id: old.channel.id });
    if (!CH.LM_A || !CH.STORE_A || !CH.STORE_B) notes.push(`ช่องทาง: LM_A ${CH.LM_A ? "มี" : codeOf(lm)} · STORE_A ${CH.STORE_A ? "มี" : "ไม่มี"} · STORE_B ${CH.STORE_B ? "มี" : "ไม่มี"}`);
  }

  // ─── แคตตาล็อก (ผู้กระทำระดับระบบ) ───
  const PR: Record<string, string> = {};
  const NM: Record<string, string> = {
    latte: `ลาเต้ ${RAND}`,
    americano: `อเมริกาโน่ ${RAND}`,
    espresso: `เอสเพรสโซ่ ${RAND}`,
    matcha: `มัทฉะ ${RAND}`,
    greentea: `ชาเขียว ${RAND}`,
    croissant: `ครัวซองต์ ${RAND}`,
    mocha: `ม็อคค่า ${RAND}`,
    mochaKid: `ม็อคค่าเย็น ${RAND}`,
    tea: `ชาไทย ${RAND}`,
    tea2: `ชามะนาว ${RAND}`,
    unpriced: `ขนมไม่ตั้งราคา ${RAND}`,
    weighed: `เมล็ดกาแฟชั่ง ${RAND}`,
    t2: `ลาเต้ร้าน T2 ${RAND}`,
  };
  let CAT_ID = "";
  let CHOICE_M = "";
  const mkProd = async (key: string, input: Any, c: Any = cctxSys): Promise<void> => {
    const r = await step(`สินค้า ${key}`, () => catalogMod.createProduct(c, { name: NM[key], ...input }));
    const id = typeof r?.id === "string" ? r.id : "";
    if (id) PR[key] = id;
  };
  if (!fx) {
    const cat = await step("หมวดกาแฟ", () => catalogMod.createCategory(cctxSys, { name: `กาแฟ ${RAND}` }));
    CAT_ID = String(cat?.id ?? "");
    await mkProd("latte", { basePriceSatang: 7500, categoryId: CAT_ID || null });
    await mkProd("americano", { basePriceSatang: 6000, categoryId: CAT_ID || null });
    await mkProd("unpriced", { categoryId: CAT_ID || null });
    for (const [k, v] of [["espresso", 5000], ["matcha", 6500], ["greentea", 5500], ["croissant", 4500], ["mocha", 6500], ["tea", 4000], ["tea2", 4200]] as const) await mkProd(k, { basePriceSatang: v });
    if (PR.mocha) await mkProd("mochaKid", { parentId: PR.mocha });
    await mkProd("weighed", { kind: "PRODUCT", basePriceSatang: 120_000, soldByWeight: true, scalePlu: String(10_000 + Math.floor(Math.random() * 89_999)) });
    await mkProd("t2", { basePriceSatang: 7500 }, { tenantId: T2, systemId: S.POSX, actorUserId: SYSTEM_ACTOR });
    const g = await step("กลุ่มตัวเลือกขนาด", () =>
      catalogMod.createOptionGroup(cctxSys, { unitId: U.A, name: `ขนาด ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "S", priceDelta: 0 }, { name: "M", priceDelta: 1000 }] }),
    );
    if (g?.id && PR.latte) {
      await step("ผูกตัวเลือกกับลาเต้", () => catalogMod.setProductOptionGroups(cctxSys, PR.latte, [g.id]));
      CHOICE_M = String((await P.menuOptionChoice.findFirst({ where: { tenantId: T, groupId: g.id, name: "M" }, select: { id: true } }).catch(() => null))?.id ?? "");
    }
    const miss = Object.keys(NM).filter((k) => !PR[k]);
    if (miss.length || !CAT_ID || !CHOICE_M) notes.push(`แคตตาล็อกขาด ${[...miss, !CAT_ID ? "หมวด" : "", !CHOICE_M ? "ตัวเลือก M" : ""].filter(Boolean).join(",")}`);
  }
  // สินค้าที่ผูกคลัง + บัญชี (C4 — ราคาช่องทางห้ามเขียนกลับ AccountProduct)
  let AP_ID = "";
  let INV_ID = "";
  if (!fx) {
    const ap = await step("AccountProduct", () => P.accountProduct.create({ data: { tenantId: T, systemId: S.ACC, name: `มอคค่าบัญชี ${RAND}`, salePrice: 8800 } }));
    AP_ID = String(ap?.id ?? "");
    const ictx = { tenantId: T, systemId: S.INV, actorUserId: ownerId };
    const it = await step("InvItem", () => invSvc.createItem(ictx, { sku: `${TAG}-inv`, name: `มอคค่าบัญชี ${RAND}`, costSatang: 100, priceSatang: 8800 }));
    INV_ID = String(it?.id ?? "");
    if (INV_ID && AP_ID) await step("ผูก InvItem ↔ AccountProduct", () => invSvc.linkAccountProduct(ictx, INV_ID, AP_ID));
    const row = INV_ID ? await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: INV_ID }, select: { id: true } }).catch(() => null) : null;
    if (row?.id) PR.inv = row.id;
    else notes.push("สินค้าที่ผูกคลังไม่มีแถว PosProduct (ensureForInvItem)");
  }
  // สมาชิก Gold 5% cap ฿100 + คูปอง PCT10 (สาขา A)
  let MEMBER_X = "";
  if (!fx) {
    const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: ownerId };
    await step("ระดับ silver", () => tierMod.createTierDef(ctxM, owner, { key: "silver", name: "Silver", color: "SLATE", isDefault: true, legacyTier: "SILVER" }));
    const gold = await step("ระดับ gold", () => tierMod.createTierDef(ctxM, owner, { key: "gold", name: "Gold", color: "AMBER", legacyTier: "GOLD" }));
    if (gold) await step("สิทธิ์ gold 5% cap ฿100", () => tierMod.setBenefits(ctxM, owner, gold.id, [{ type: "DISCOUNT_PCT", config: { pct: 5, maxSatang: 10_000 } }]));
    const phone = `0895${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
    const m = await step("สมาชิก X", () => memMod.createMember(ctxM, owner, { phone, name: `สมาชิกราคา ${RAND}`, source: "WALK_IN", homeUnitId: U.A }));
    MEMBER_X = String(m?.customerId ?? "");
    if (MEMBER_X && gold) await step("X → Gold", () => tierMod.applyTierChange(ctxM, MEMBER_X, gold.id, "MANUAL", { qc: TAG }, { byUserId: ownerId }));
    await step("คูปอง PCT10", () => couponMod.createCoupon({ tenantId: T, systemId: S.CPN, code: "PCT10", name: "ลด 10%", type: "PERCENT", percent: 10, maxDiscountSatang: 10_000 }));
    await drain();
  }
  console.log(`   สินค้า ${Object.keys(PR).length} · ช่องทาง ${Object.keys(CH).filter((k) => CH[k]).join(",")} · สมาชิก ${MEMBER_X ? "มี" : "ไม่มี"} · ตัวเลือก M ${CHOICE_M ? "มี" : "ไม่มี"}${notes.length ? ` · ⚠️ ${notes.length} รายการ fixture` : ""}`);
  const NOTE = () => (notes.length ? `fixture(${notes.length}): ${short(notes[0], 80)} · ` : "");

  // ─── ตัวอ่าน ───
  const NCP = () => (!COL.cp ? `${MISSING} ตาราง PosProductChannelPrice · ` : "");
  const NPR = () => (!COL.pr ? `${MISSING} ตาราง PosPriceRule · ` : "");
  const NLINE = () => (!COL.line ? `${MISSING} คอลัมน์ PosSaleLine.priceSource/priceRuleId/listPriceSatang · ` : "");
  const cpRows = async (productId: string, tenantId = T): Promise<Any[]> =>
    COL.cp && productId
      ? ((await P.$queryRawUnsafe(`SELECT "channelCode", "unitId", "priceSatang", "notSold", "updatedByUserId" FROM "PosProductChannelPrice" WHERE "tenantId" = $1 AND "productId" = $2`, tenantId, productId).catch(() => [])) as Any[])
      : [];
  const sigOf = (rows: Any[]) => rows.map((r: Any) => `${r.channelCode ?? "*"}|${unitKey(r.unitId ?? null)}|${r.notSold ? "X" : r.priceSatang}`).sort().join(",");
  const cpSig = async (productId: string) => sigOf(await cpRows(productId));
  const ruleCount = async (): Promise<number> => (COL.pr ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosPriceRule" WHERE "tenantId" = $1`, T).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1) : -1);
  const ruleRow = async (id: string): Promise<Any> => (COL.pr && id ? (((await P.$queryRawUnsafe(`SELECT * FROM "PosPriceRule" WHERE id = $1`, id).catch(() => [])) as Any[])[0] ?? null) : null);
  type LineSnap = { productId: string | null; name: string; unitPriceSatang: number; priceSource: string | null; priceRuleId: string | null; listPriceSatang: number | null };
  const lineSnaps = async (saleId: string): Promise<LineSnap[]> =>
    saleId && COL.line
      ? ((await P.$queryRawUnsafe(`SELECT "productId", name, "unitPriceSatang", "priceSource"::text AS "priceSource", "priceRuleId", "listPriceSatang" FROM "PosSaleLine" WHERE "saleId" = $1 ORDER BY id`, saleId).catch(() => [])) as LineSnap[])
      : [];
  const audits = async (action: string): Promise<Any[]> => ((await P.auditLog.findMany({ where: { tenantId: { in: [T, T2].filter(Boolean) }, action }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]);
  const mentions = (a: Any, id: string) => !!id && (a.targetId === id || short([a.after, a.before], 20_000).includes(id));
  const events = async (type: string, pred: (p: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => pred(e.payload ?? {}));
  const counts = async (): Promise<Record<string, number>> => ({
    sale: Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)),
    pay: Number(await P.posPayment.count({ where: { tenantId: T } }).catch(() => -1)),
    outbox: Number(await P.outboxEvent.count({ where: { tenantId: T, type: { startsWith: "pos.sale." } } }).catch(() => -1)),
    seq: Number((await P.posReceiptCounter.aggregate({ where: { tenantId: T }, _sum: { seq: true } }).catch(() => null))?._sum?.seq ?? 0),
  });
  const sameCounts = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}→${b[k]}`);
  const keyCount = async (key: string) => Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: key } }).catch(() => -1));
  type Line = { code: string; debit: number; credit: number };
  type Entry = { id: string; key: string; status: string; reversalOfId: string | null; lines: Line[] };
  const jv = async (refIds: string[]): Promise<Entry[]> => {
    const ids = refIds.filter(Boolean);
    if (!ids.length || !T) return [];
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: { in: ids } }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
    return es.map((e: Any) => ({ id: e.id, key: String(e.idempotencyKey ?? ""), status: String(e.status), reversalOfId: e.reversalOfId ?? null, lines: (e.lines ?? []).map((l: Any) => ({ code: String(l.account?.code ?? "?"), debit: l.debit, credit: l.credit })) }));
  };
  const shape = (e: Entry | undefined): string => {
    if (!e) return "—";
    const m = new Map<string, [number, number]>();
    for (const l of e.lines) {
      const a = m.get(l.code) ?? [0, 0];
      m.set(l.code, [a[0] + l.debit, a[1] + l.credit]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, [d, k]]) => `${c}:${d}/${k}`).join(" ");
  };
  const K = (id: string, ev: string) => `PosSale#${id}#${ev}`;

  // ─── ตัวเรียก ───
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const setCP = (userId: string, productId: string, rows: Any, label: string, extra: Record<string, unknown> = {}) =>
    fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "setChannelPrices", cctxOf(userId), { productId, rows, ...extra }).then((r) => keep(label, r));
  const bulk = (userId: string, input: Any, label: string) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "bulkChannelMarkup", cctxOf(userId), input).then((r) => keep(label, r)));
  const cprow = (channelCode: string | null, unitId: string | null, priceSatang: number | null, notSold?: boolean) => ({ channelCode, unitId, priceSatang, ...(notSold !== undefined ? { notSold } : {}) });
  const pl = (productId: string, qty = 1, extra: Record<string, unknown> = {}) => ({ productId, qty, ...extra });
  const quote = (k: string, cart: Any, actor: Any = owner, label = "quote") => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(register, "quoteRegisterCart", ctxOf(k), actor, cart).then((r) => keep(`${label} ${k}`, r)));
  const submit = (cart: Any, expected: number, pays: [string, number][], key?: string, actor: Any = owner) =>
    fx
      ? Promise.resolve({ ok: false, code: "FIXTURE" })
      : call(register, "submitRegisterSale", ctxOf("A", DEV1), actor, {
          ...cart,
          idempotencyKey: key ?? newKey("reg"),
          expectedGrandTotalSatang: expected,
          payMethods: pays.map(([type, amountSatang]) => ({ type, amountSatang })),
          ...(pays.some(([t]) => t === "CASH") ? { cashReceivedSatang: sum(pays.filter(([t]) => t === "CASH").map(([, a]) => a)) } : {}),
        }).then((r) => keep("submit", r));
  const rctx = (k = "A"): Any => ({ tenantId: tenOf(k), systemId: sysOf(k), unitId: U[k] });
  const iso = (ms: number) => new Date(ms).toISOString();
  const ruleIn = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: `โปร ${RAND}`,
    kind: "PROMO",
    active: true,
    priority: 0,
    productIds: [PR.greentea ?? "none"],
    categoryIds: [],
    channelCodes: [],
    unitIds: [],
    adjust: "PRICE",
    valueSatang: 1000,
    startsAt: null,
    endsAt: null,
    weekdays: [],
    timeFrom: null,
    timeTo: null,
    ...o,
  });
  const nowWindow = { startsAt: iso(NOW0 - 86_400_000), endsAt: iso(NOW0 + 86_400_000), weekdays: [TODAY_BKK], timeFrom: hhmm(WIN.from), timeTo: hhmm(WIN.to) };
  /** ตัดคีย์ที่ค่าเป็น undefined (อินพุตคีย์ตรงตัว — ไม่ส่งคีย์ที่ไม่ใช้) */
  const strip = (o: Any): Any => (isRecord(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) : o);
  const saveRule = (input: Any, actor: Any = owner, k = "A", label = "saveRule") => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(ruleMod, "savePriceRule", rctx(k), actor, strip(input)).then((r) => keep(label, r)));
  const archiveRule = (id: string, actor: Any = owner, k = "A", label = "archiveRule") => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(ruleMod, "archivePriceRule", rctx(k), actor, { id }).then((r) => keep(label, r)));
  const listRules = (actor: Any = owner, input: Any = {}, k = "A") => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(ruleMod, "listPriceRules", rctx(k), actor, input).then((r) => keep("listRules", r)));
  const ridOf = (r: Any) => (r?.ok === true && typeof r.rule?.id === "string" ? String(r.rule.id) : "");
  const madeRules: string[] = [];
  const archiveAll = async () => {
    for (const id of madeRules.splice(0)) await archiveRule(id, owner, "A", "cleanup");
  };
  /** บรรทัด quote → ลายเซ็นราคา (ราคา · ที่มา · list · กติกา) */
  const qsig = (l: Any) => `${l?.unitPriceSatang}|${l?.priceSource ?? "∅"}|${l?.listPriceSatang === undefined ? "∅" : l.listPriceSatang}|${l?.priceRule === undefined ? "∅" : (l.priceRule?.id ?? null)}`;

  // ════════ C ราคาช่องทาง/สาขา ════════
  // C1 ตั้ง/แทน/ล้าง + แถวของ fixture
  {
    const p: string[] = [];
    const a = await setCP(ownerId, PR.tea ?? "", [cprow("LINEMAN", null, 4800), cprow(null, U.A, 3900), cprow("LINEMAN", U.A, 5000)], "C1 set");
    if (!okish(a)) p.push(`ตั้ง 3 แถว → ${codeOf(a)} ${short(a?.message ?? "", 60)}`);
    const s1 = await cpRows(PR.tea ?? "");
    if (sigOf(s1) !== "*|A|3900,LINEMAN|*|4800,LINEMAN|A|5000") p.push(`หลังตั้ง ${sigOf(s1) || "—"}`);
    if (s1.length && s1.some((r: Any) => r.updatedByUserId !== ownerId)) p.push(`updatedByUserId ${short(s1.map((r: Any) => r.updatedByUserId), 60)}`);
    const b = await setCP(ownerId, PR.tea ?? "", [cprow("LINEMAN", null, 4900)], "C1 replace");
    if (!okish(b)) p.push(`แทน → ${codeOf(b)}`);
    if ((await cpSig(PR.tea ?? "")) !== "LINEMAN|*|4900") p.push(`หลังแทน ${await cpSig(PR.tea ?? "")}`);
    const c = await setCP(ownerId, PR.tea ?? "", [cprow("QR_TABLE", null, 4100), cprow("WEB", U.B, 4200)], "C1 builtin");
    if (!okish(c) || (await cpSig(PR.tea ?? "")) !== "QR_TABLE|*|4100,WEB|B|4200") p.push(`รหัส builtin → ${codeOf(c)} ${await cpSig(PR.tea ?? "")}`);
    const d = await setCP(ownerId, PR.tea ?? "", [], "C1 clear");
    if (!okish(d) || (await cpRows(PR.tea ?? "")).length !== 0) p.push(`ล้าง → ${codeOf(d)} เหลือ ${(await cpRows(PR.tea ?? "")).length}`);
    // แถวของ fixture (ใช้ทั้งชุด Q/S/H)
    const fixtures: [string, Any[], string][] = [
      ["latte", [cprow("LINEMAN", null, 9400)], "LINEMAN|*|9400"], // C6 ปรับเป็น 9,500
      ["mocha", [cprow("LINEMAN", null, 8500)], "LINEMAN|*|8500"],
      ["matcha", [cprow("LINEMAN", null, null, true)], "LINEMAN|*|X"],
      ["americano", [cprow(null, U.A, 5500)], "*|A|5500"],
    ];
    for (const [k, rows, want] of fixtures) {
      const r = await setCP(ownerId, PR[k] ?? "", rows, `C1 ${k}`);
      if (!okish(r) || (await cpSig(PR[k] ?? "")) !== want) p.push(`${k} → ${codeOf(r)} ${await cpSig(PR[k] ?? "")} (คาด ${want})`);
    }
    const ns = (await cpRows(PR.matcha ?? ""))[0];
    if (ns && (ns.priceSatang !== null || ns.notSold !== true)) p.push(`notSold แถว priceSatang ${ns.priceSatang} notSold ${ns.notSold}`);
    chk("C1", NCP() === "" && p.length === 0, "ตั้ง/แทน/ล้าง/builtin · notSold ราคา null · แถว fixture", FX(NCP() + NOTE() + (P8(p) || "ครบ")));
  }
  // C2 VALIDATION ไม่เขียนอะไร
  {
    const p: string[] = [];
    const before = await cpSig(PR.latte ?? "");
    const many = Array.from({ length: 61 }, (_, i) => cprow(`CUSTOM_Z${pad2(i)}`, null, 1000 + i));
    const cases: [string, Any, Record<string, unknown>?][] = [
      ["(code,unit) ซ้ำ", [cprow("LINEMAN", null, 9500), cprow("LINEMAN", null, 9600)]],
      ["(null,null)", [cprow(null, null, 7000)]],
      ["คีย์แปลกในแถว", [{ ...cprow("LINEMAN", null, 9500), foo: 1 }]],
      ["คีย์แปลกบนสุด", [cprow("LINEMAN", null, 9500)], { foo: 1 }],
      ["notSold + ราคา", [cprow("LINEMAN", null, 9500, true)]],
      ["ไม่ notSold + ไม่มีราคา", [cprow("LINEMAN", null, null, false)]],
      ["ราคา −1", [cprow("LINEMAN", null, -1)]],
      ["ราคา 1.5", [cprow("LINEMAN", null, 1.5)]],
      ["ราคาสตริง", [cprow("LINEMAN", null, "9500" as unknown as number)]],
      ["ราคาเกิน PRICE_MAX", [cprow("LINEMAN", null, PRICE_MAX + 1)]],
      ["รหัสที่ระบบไม่มี GRAB", [cprow("GRAB", null, 9500)]],
      ["รหัสตัวเล็ก", [cprow("lineman", null, 9500)]],
      ["ช่องทางเก็บถาวร CUSTOM_OLD", [cprow("CUSTOM_OLD", null, 9500)]],
      ["61 แถว", many],
      ["rows ไม่ใช่อาร์เรย์", { channelCode: "LINEMAN" }],
    ];
    for (const [lbl, rows, extra] of cases) {
      const r = await setCP(ownerId, PR.latte ?? "", rows, `C2 ${lbl}`, extra ?? {});
      if (!codeIs(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const after = await cpSig(PR.latte ?? "");
    if (after !== before || after !== "LINEMAN|*|9400") p.push(`แถวลาเต้เปลี่ยน ${before} → ${after}`);
    const w = await setCP(ownerId, PR.weighed ?? "", [cprow("LINEMAN", null, 150_000)], "C2 weighed");
    if (!codeIs(w, "VALIDATION")) p.push(`สินค้าชั่ง → ${codeOf(w)} (CD7)`);
    if ((await cpRows(PR.weighed ?? "")).length !== 0) p.push("สินค้าชั่งมีแถว");
    chk("C2", NCP() === "" && p.length === 0, `${cases.length + 1} แบบ VALIDATION · ไม่มีแถวเปลี่ยน`, FX(NCP() + (P8(p) || "ครบ")));
  }
  // C3 สิทธิ์ + ข้ามร้าน
  {
    const p: string[] = [];
    const m1 = await setCP(mgrId, PR.tea2 ?? "", [cprow(null, U.A, 4000), cprow("LINEMAN", U.A, 4600)], "C3 manager A");
    if (!okish(m1)) p.push(`ผู้จัดการ A แถวสาขา A → ${codeOf(m1)} ${short(m1?.message ?? "", 50)}`);
    const want = "*|A|4000,LINEMAN|A|4600";
    if ((await cpSig(PR.tea2 ?? "")) !== want) p.push(`tea2 ${await cpSig(PR.tea2 ?? "")} (คาด ${want})`);
    const m2 = await setCP(mgrId, PR.tea2 ?? "", [cprow("LINEMAN", null, 4700)], "C3 manager all");
    if (!codeIs(m2, "PERMISSION_DENIED")) p.push(`ผู้จัดการ A แถวทุกสาขา → ${codeOf(m2)}`);
    const s1 = await setCP(staffId, PR.tea2 ?? "", [cprow(null, U.A, 1)], "C3 staff");
    if (!codeIs(s1, "PERMISSION_DENIED")) p.push(`พนักงาน → ${codeOf(s1)}`);
    if ((await cpSig(PR.tea2 ?? "")) !== want) p.push(`tea2 เปลี่ยนหลังคำปฏิเสธ ${await cpSig(PR.tea2 ?? "")}`);
    const t2 = await setCP(ownerId, PR.t2 ?? "nope", [cprow("LINEMAN", null, 1)], "C3 T2");
    if (!codeIs(t2, "PRODUCT_NOT_FOUND")) p.push(`สินค้าร้าน T2 → ${codeOf(t2)} (คาด PRODUCT_NOT_FOUND)`);
    const nf = await setCP(ownerId, `nope${RAND}`, [cprow("LINEMAN", null, 1)], "C3 nope");
    if (!codeIs(nf, "PRODUCT_NOT_FOUND")) p.push(`id มั่ว → ${codeOf(nf)}`);
    if ((await cpRows(PR.t2 ?? "", T2)).length !== 0) p.push("สินค้าร้าน T2 มีแถว");
    chk("C3", NCP() === "" && p.length === 0, "ผู้จัดการ A ได้เฉพาะแถว A · ทุกสาขา/พนักงาน DENIED · ร้านอื่น PRODUCT_NOT_FOUND", FX(NCP() + (P8(p) || "ครบ")));
  }
  // C4 audit + ไม่เขียนกลับบัญชี
  {
    const p: string[] = [];
    const au = await audits(AUDIT.channelPrice);
    const forLatte = au.filter((a) => mentions(a, PR.latte ?? "-"));
    if (forLatte.length !== 1) p.push(`audit ลาเต้ ${forLatte.length} แถว (คาด 1 — ตั้งครั้งเดียว · คำปฏิเสธ C2 ไม่มี audit)`);
    else {
      const a = forLatte[0]!;
      if (a.actorId !== ownerId) p.push(`ลาเต้ actorId ${short(a.actorId, 30)}`);
      if (!short(a.after, 4000).includes("9400")) p.push("ลาเต้ audit ไม่มีราคาใหม่ (9400) ใน after");
    }
    const forTea2 = au.filter((a) => mentions(a, PR.tea2 ?? "-"));
    if (forTea2.length !== 1 || forTea2[0]?.actorId !== mgrId) p.push(`tea2 audit ${forTea2.length} แถว actor ${short(forTea2[0]?.actorId, 30)} (คาด 1 · ผู้จัดการ)`);
    const forTea = au.filter((a) => mentions(a, PR.tea ?? "-"));
    if (forTea.length !== 4) p.push(`tea audit ${forTea.length} (คาด 4 = ตั้ง/แทน/builtin/ล้าง)`);
    const clear = forTea[3];
    if (clear && !/\[\s*\]/.test(short(clear.after, 4000))) p.push(`audit ล้างไม่มี after [] (${short(clear.after, 60)})`);
    if (au.some((a) => !a.actorId)) p.push("มี audit ไม่มี actorId");
    // AccountProduct / InvItem ไม่เปลี่ยน
    if (!PR.inv || !AP_ID || !INV_ID) p.push("fixture สินค้าผูกบัญชีไม่ครบ");
    else {
      const ap0 = await P.accountProduct.findUnique({ where: { id: AP_ID }, select: { salePrice: true } }).catch(() => null);
      const iv0 = await P.invItem.findUnique({ where: { id: INV_ID }, select: { priceSatang: true } }).catch(() => null);
      const r = await setCP(ownerId, PR.inv, [cprow("LINEMAN", null, 9900), cprow(null, U.A, 8500)], "C4 inv");
      if (!okish(r)) p.push(`ตั้งราคาช่องทางสินค้าผูกบัญชี → ${codeOf(r)}`);
      const ap1 = await P.accountProduct.findUnique({ where: { id: AP_ID }, select: { salePrice: true } }).catch(() => null);
      const iv1 = await P.invItem.findUnique({ where: { id: INV_ID }, select: { priceSatang: true } }).catch(() => null);
      if (ap0?.salePrice !== ap1?.salePrice) p.push(`AccountProduct.salePrice ${ap0?.salePrice} → ${ap1?.salePrice}`);
      if (iv0?.priceSatang !== iv1?.priceSatang) p.push(`InvItem.priceSatang ${iv0?.priceSatang} → ${iv1?.priceSatang}`);
      const base = await P.posProduct.findUnique({ where: { id: PR.inv }, select: { basePriceSatang: true } }).catch(() => null);
      console.log(`   (ข้อมูล C4) สินค้าผูกบัญชี: ฐาน ${base?.basePriceSatang} · AccountProduct ${ap1?.salePrice} · InvItem ${iv1?.priceSatang}`);
    }
    chk("C4", NCP() === "" && p.length === 0, "audit ต่อการเขียน actorId จริง · คำปฏิเสธไม่มี audit · บัญชี/คลังไม่เปลี่ยน", FX(NCP() + (P8(p) || `ครบ (${au.length} audit)`)));
  }
  // C6 ปรับราคาทั้งหมวด (รันก่อน C5 — C5 อ่านแถวที่ C6 เขียน)
  {
    const p: string[] = [];
    const au0 = (await audits(AUDIT.channelPrice)).length;
    const r = await bulk(ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 100, categoryId: CAT_ID }, "C6 owner");
    if (!okish(r)) p.push(`เจ้าของทั้งหมวด → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const exp: [string, string][] = [
      ["latte", "LINEMAN|*|9500"],
      ["americano", "*|A|5500,LINEMAN|*|7600"],
      ["unpriced", ""],
      ["espresso", ""],
      ["matcha", "LINEMAN|*|X"],
    ];
    for (const [k, want] of exp) if ((await cpSig(PR[k] ?? "")) !== want) p.push(`${k} ${(await cpSig(PR[k] ?? "")) || "—"} (คาด ${want || "—"})`);
    const auNew = (await audits(AUDIT.channelPrice)).slice(au0);
    const auOf = (k: string) => auNew.filter((a) => mentions(a, PR[k] ?? "-") && a.actorId === ownerId).length;
    if (auNew.length !== 2 || auOf("latte") !== 1 || auOf("americano") !== 1) p.push(`audit ใหม่ ${auNew.length} (ลาเต้ ${auOf("latte")} · อเมริกาโน่ ${auOf("americano")} · คาด 1 ต่อสินค้าที่เขียน)`);
    const m = await bulk(mgrId, { channelCode: "LINEMAN", unitId: U.A, markupBp: 2700, roundTo: 100, productIds: [PR.tea2 ?? "none"] }, "C6 manager A");
    if (!okish(m)) p.push(`ผู้จัดการ A (LINEMAN, A) → ${codeOf(m)}`);
    const t2want = "*|A|4000,LINEMAN|A|5300";
    if ((await cpSig(PR.tea2 ?? "")) !== t2want) p.push(`tea2 ${await cpSig(PR.tea2 ?? "")} (คาด ${t2want} · 4,200×1.27 = 5,334 → 5,300)`);
    const refusals: [string, string, Any, string][] = [
      ["ผู้จัดการ ทุกสาขา", mgrId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 100, productIds: [PR.tea2 ?? "none"] }, "PERMISSION_DENIED"],
      ["พนักงาน", staffId, { channelCode: "LINEMAN", unitId: U.A, markupBp: 2700, roundTo: 100, productIds: [PR.tea2 ?? "none"] }, "PERMISSION_DENIED"],
      ["bp 0", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 0, roundTo: 100, productIds: [PR.tea2 ?? "none"] }, "VALIDATION"],
      ["bp 20001", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 20_001, roundTo: 100, productIds: [PR.tea2 ?? "none"] }, "VALIDATION"],
      ["roundTo 10", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 10, productIds: [PR.tea2 ?? "none"] }, "VALIDATION"],
      ["ทั้ง productIds + categoryId", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 100, productIds: [PR.tea2 ?? "none"], categoryId: CAT_ID }, "VALIDATION"],
      ["ไม่มีทั้งคู่", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 100 }, "VALIDATION"],
      ["คีย์แปลก", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 100, categoryId: CAT_ID, foo: 1 }, "VALIDATION"],
      ["รหัส GRAB", ownerId, { channelCode: "GRAB", unitId: null, markupBp: 2700, roundTo: 100, categoryId: CAT_ID }, "VALIDATION"],
      ["สินค้า 501", ownerId, { channelCode: "LINEMAN", unitId: null, markupBp: 2700, roundTo: 100, productIds: Array.from({ length: 501 }, (_, i) => `p${i}`) }, "VALIDATION"],
    ];
    const snap0 = [await cpSig(PR.tea2 ?? ""), await cpSig(PR.latte ?? ""), await cpSig(PR.americano ?? "")].join(" ; ");
    for (const [lbl, who, input, code] of refusals) {
      const x = await bulk(who, input, `C6 ${lbl}`);
      if (!codeIs(x, code)) p.push(`${lbl} → ${codeOf(x)} (คาด ${code})`);
    }
    const snap1 = [await cpSig(PR.tea2 ?? ""), await cpSig(PR.latte ?? ""), await cpSig(PR.americano ?? "")].join(" ; ");
    if (snap0 !== snap1) p.push(`คำปฏิเสธเขียนแถว ${snap0} → ${snap1}`);
    chk("C6", NCP() === "" && p.length === 0, "ราคาตายตัว 9,500/7,600 · ข้ามไม่มีราคา · (LINEMAN,A) ของผู้จัดการ · 10 คำปฏิเสธไม่เขียน", FX(NCP() + (P8(p) || "ครบ")));
  }
  // C5 listForUnit.channelPrices
  {
    const p: string[] = [];
    const view = async (unit: string, key: string): Promise<Any> => {
      const r = fx ? null : await call(catalogMod, "listForUnit", cctxOf(ownerId), U[unit], { q: NM[key] });
      if (!r || r.ok === false) {
        p.push(`listForUnit ${unit} ${key} → ${codeOf(r)}`);
        return null;
      }
      return (r.items ?? []).find((i: Any) => i?.id === PR[key]) ?? null;
    };
    const cpView = (v: Any) =>
      (Array.isArray(v?.channelPrices) ? v.channelPrices : [])
        .map((c: Any) => `${c.channelCode ?? "*"}|${unitKey(c.unitId ?? null)}|${c.notSold ? "X" : c.priceSatang}|${c.channelId === null ? "null" : c.channelId === CH.LM_A ? "LM_A" : short(c.channelId, 12)}`)
        .sort()
        .join(",");
    const aA = await view("A", "americano");
    const wantA = `*|A|5500|null,LINEMAN|*|7600|LM_A`;
    if (aA && cpView(aA) !== wantA) p.push(`อเมริกาโน่ A ${cpView(aA) || "—"} (คาด ${wantA})`);
    for (const c of Array.isArray(aA?.channelPrices) ? aA.channelPrices : []) {
      const keys = Object.keys(c).sort();
      if (short(keys) !== short([...CP_VIEW_KEYS].sort())) {
        p.push(`คีย์ ${keys.join(",")}`);
        break;
      }
    }
    const aB = await view("B", "americano");
    if (aB && cpView(aB) !== "LINEMAN|*|7600|null") p.push(`อเมริกาโน่ B ${cpView(aB) || "—"} (คาด LINEMAN|*|7600|null — สาขา B ไม่มี LINEMAN · ไม่เห็นแถวสาขา A)`);
    const mA = await view("A", "matcha");
    if (mA && cpView(mA) !== "LINEMAN|*|X|LM_A") p.push(`มัทฉะ A ${cpView(mA) || "—"} (คาด notSold)`);
    const eA = await view("A", "espresso");
    if (eA && cpView(eA) !== "") p.push(`เอสเพรสโซ่ ${cpView(eA)} (คาด [])`);
    chk("C5", NCP() === "" && p.length === 0, "channelPrices ต่อสาขา · channelId ของสาขา/null · คีย์ตรง", FX(NCP() + (P8(p) || "ครบ")));
  }

  // ════════ Q หน้าขาย (ก่อนมีกติกา) ════════
  // Q1 PAR
  {
    const p: string[] = [];
    const disc = { discount: { type: "AMOUNT", value: 500 } };
    const bill = { billDiscount: { type: "PERCENT", value: 1000 } };
    const a = await quote("A", { lines: [pl(PR.espresso ?? "none", 2, disc)], ...bill }, owner, "Q1 espresso");
    const c = await quote("A", { lines: [{ name: `ควบคุม PAR ${RAND}`, qty: 2, unitPriceSatang: 5000, ...disc }], ...bill }, owner, "Q1 control");
    if (a?.ok !== true || c?.ok !== true) p.push(`quote ${codeOf(a)} / ควบคุม ${codeOf(c)}`);
    else {
      const ka = Object.keys(a).sort();
      const kc = Object.keys(c).sort();
      if (short(ka) !== short(kc)) p.push(`คีย์บนสุด ${ka.join(",")} ≠ ควบคุม ${kc.join(",")}`);
      for (const k of kc.filter((k) => k !== "lines")) if (short(a[k], 2000) !== short(c[k], 2000)) p.push(`${k} ${short(a[k], 40)} ≠ ${short(c[k], 40)}`);
      const la = a.lines?.[0] ?? {};
      const lc = c.lines?.[0] ?? {};
      for (const k of QUOTE_LINE_OLD_KEYS.filter((k) => k !== "productId")) if (short(la[k]) !== short(lc[k])) p.push(`line.${k} ${short(la[k], 30)} ≠ ${short(lc[k], 30)}`);
      if (la.productId !== PR.espresso) p.push(`line.productId ${short(la.productId, 20)}`);
      const extra = Object.keys(la).filter((k) => !QUOTE_LINE_OLD_KEYS.includes(k));
      const bad = extra.filter((k) => !QUOTE_LINE_NEW_KEYS.includes(k));
      if (bad.length) p.push(`บรรทัดมีคีย์นอกสัญญา ${bad.join(",")}`);
      if (extra.includes("priceSource") && la.priceSource !== "BASE") p.push(`priceSource ${la.priceSource}`);
      if (extra.includes("listPriceSatang") && la.listPriceSatang !== 5000) p.push(`listPriceSatang ${la.listPriceSatang}`);
      if (extra.includes("priceRule") && la.priceRule !== null) p.push(`priceRule ${short(la.priceRule, 40)}`);
      if (a.grandTotalSatang !== 8550) p.push(`grand ${a.grandTotalSatang} (คาด (10,000 − 500) × 90% = 8,550)`);
    }
    chk("Q1", p.length === 0, "STORE ไม่มีแถว/กติกา = ตะกร้าควบคุมทุกไบต์ (PAR)", FX(P8(p) || "ครบ"));
  }
  // Q2 LINEMAN + ตัวแปร + resolvePrices
  {
    const p: string[] = [];
    const lm = await quote("A", { channelId: CH.LM_A, lines: [pl(PR.latte ?? "none"), pl(PR.mochaKid ?? "none")] }, owner, "Q2 LINEMAN");
    if (lm?.ok !== true) p.push(`LINEMAN → ${codeOf(lm)} ${short(lm?.message ?? "", 50)}`);
    else {
      if (qsig(lm.lines?.[0]) !== "9500|CHANNEL|7500|null") p.push(`ลาเต้ ${qsig(lm.lines?.[0])} (คาด 9500|CHANNEL|7500|null)`);
      if (qsig(lm.lines?.[1]) !== "8500|CHANNEL|6500|null") p.push(`ลูกม็อคค่า ${qsig(lm.lines?.[1])} (คาด 8500|CHANNEL|6500|null · แถวของแม่)`);
      if (lm.grandTotalSatang !== 18_000) p.push(`grand ${lm.grandTotalSatang} (คาด 18,000)`);
    }
    const st = await quote("A", { lines: [pl(PR.latte ?? "none"), pl(PR.mochaKid ?? "none")] }, owner, "Q2 STORE");
    if (st?.ok !== true || qsig(st.lines?.[0]) !== "7500|BASE|7500|null" || qsig(st.lines?.[1]) !== "6500|BASE|6500|null") p.push(`STORE ${codeOf(st)} ${qsig(st?.lines?.[0])} / ${qsig(st?.lines?.[1])}`);
    const sc = { tenantId: T, systemId: S.POS, unitId: U.A };
    const items = [{ productId: PR.latte ?? "none" }, { productId: PR.latte ?? "none", optionDeltaSatang: 1000 }];
    for (const [lbl, by] of [["channelId", { channelId: CH.LM_A }], ["channelCode", { channelCode: "LINEMAN" }]] as const) {
      const r = fx ? null : await call(priceMod, "resolvePrices", P, sc, { ...by, at: new Date(), items });
      const it = r?.ok === true ? r.items : null;
      const sg = (x: Any) => `${x?.unitPriceSatang}|${x?.source}|${x?.listPriceSatang}|${x?.ruleId ?? null}`;
      if (!Array.isArray(it) || sg(it[0]) !== "9500|CHANNEL|7500|null" || sg(it[1]) !== "10500|CHANNEL|7500|null") p.push(`resolvePrices(${lbl}) → ${codeOf(r)} ${short(it?.map(sg), 80)}`);
    }
    if (typeof posIndex?.resolvePrices !== "function") p.push("pos facade ไม่ส่งออก resolvePrices");
    if (typeof posIndex?.catalog?.setChannelPrices !== "function" || typeof posIndex?.catalog?.bulkChannelMarkup !== "function") p.push("pos facade catalog ไม่มี setChannelPrices/bulkChannelMarkup");
    chk("Q2", p.length === 0, "LINEMAN 9,500 CHANNEL · ลูกใช้แถวแม่ 8,500 · STORE BASE · resolvePrices ตรง", FX(NCP() + (P8(p) || "ครบ")));
  }
  // Q3 แถวสาขา
  {
    const p: string[] = [];
    const a = await quote("A", { lines: [pl(PR.americano ?? "none")] }, owner, "Q3 A");
    const b = await quote("B", { lines: [pl(PR.americano ?? "none")] }, owner, "Q3 B");
    const l = await quote("A", { channelId: CH.LM_A, lines: [pl(PR.americano ?? "none")] }, owner, "Q3 LM");
    if (qsig(a?.lines?.[0]) !== "5500|BRANCH|6000|null") p.push(`STORE A ${codeOf(a)} ${qsig(a?.lines?.[0])} (คาด 5500|BRANCH|6000|null)`);
    if (qsig(b?.lines?.[0]) !== "6000|BASE|6000|null") p.push(`STORE B ${codeOf(b)} ${qsig(b?.lines?.[0])} (คาด 6000|BASE|6000|null)`);
    if (qsig(l?.lines?.[0]) !== "7600|CHANNEL|6000|null") p.push(`LINEMAN A ${codeOf(l)} ${qsig(l?.lines?.[0])} (คาด 7600|CHANNEL|6000|null)`);
    chk("Q3", p.length === 0, "สาขา A 5,500 BRANCH · B 6,000 BASE · LINEMAN 7,600 ชนะสาขา", FX(NCP() + (P8(p) || "ครบ")));
  }
  // Q8 ไม่ขายในช่องทางนี้
  {
    const p: string[] = [];
    const cart = { lines: [pl(PR.espresso ?? "none"), pl(PR.matcha ?? "none")] };
    const r = await quote("A", { channelId: CH.LM_A, ...cart }, owner, "Q8 LINEMAN");
    if (!refused(r, "CHANNEL_NOT_SOLD") || r.lineIndex !== 1) p.push(`LINEMAN → ${codeOf(r)} lineIndex ${short(r?.lineIndex, 5)} (คาด CHANNEL_NOT_SOLD @1)`);
    else if (!/ไม่ขายในช่องทางนี้/.test(String(r.message ?? ""))) p.push(`ข้อความ ${short(r.message, 60)}`);
    const s = await quote("A", cart, owner, "Q8 STORE");
    if (s?.ok !== true || s.grandTotalSatang !== 11_500) p.push(`STORE (ตัวควบคุม) → ${codeOf(s)} ${s?.grandTotalSatang}`);
    const c0 = await counts();
    const key = newKey("q8");
    const sb = await submit({ channelId: CH.LM_A, ...cart }, 11_500, [["PLATFORM", 11_500]], key);
    if (!refused(sb, "CHANNEL_NOT_SOLD")) p.push(`submit LINEMAN → ${codeOf(sb)}`);
    const d = sameCounts(c0, await counts());
    if (d.length || (await keyCount(key)) !== 0) p.push(`มีแถวเพิ่ม ${d.join(", ")}`);
    chk("Q8", p.length === 0, "CHANNEL_NOT_SOLD @1 ข้อความไทย · STORE ผ่าน · submit ไม่มีบิล", FX(NCP() + (P8(p) || "ครบ")));
  }

  // ════════ P กติการาคา ════════
  // P1 CRUD + ขอบ + VALIDATION
  {
    const p: string[] = [];
    const r1 = await saveRule(ruleIn({ name: `โปรชาเขียว ${RAND}`, priority: 5, adjust: "AMOUNT_OFF", valueSatang: 500 }), owner, "A", "P1 create");
    const id1 = ridOf(r1);
    if (!id1) p.push(`สร้าง → ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    else {
      madeRules.push(id1);
      const it = r1.rule;
      const keys = Object.keys(it).sort();
      if (short(keys) !== short([...RULE_ITEM_KEYS].sort())) p.push(`คีย์ผล ${keys.join(",")}`);
      const want: Record<string, unknown> = { name: `โปรชาเขียว ${RAND}`, kind: "PROMO", active: true, priority: 5, productIds: [PR.greentea], categoryIds: [], channelCodes: [], unitIds: [], adjust: "AMOUNT_OFF", valueSatang: 500, valueBp: null, startsAt: null, endsAt: null, weekdays: [], timeFrom: null, timeTo: null, archived: false };
      for (const [k, v] of Object.entries(want)) if (short(it[k]) !== short(v)) p.push(`${k} ${short(it[k], 30)} (คาด ${short(v, 30)})`);
      const n0 = await ruleCount();
      const u = await saveRule({ ...ruleIn({ name: `โปรชาเขียว แก้ ${RAND}`, priority: 5, adjust: "AMOUNT_OFF", valueSatang: 500, active: false }), id: id1 }, owner, "A", "P1 update");
      if (ridOf(u) !== id1 || u.rule?.name !== `โปรชาเขียว แก้ ${RAND}` || u.rule?.active !== false) p.push(`แก้ → ${codeOf(u)} ${short(u?.rule && { id: u.rule.id === id1, name: u.rule.name, active: u.rule.active }, 80)}`);
      if ((await ruleCount()) !== n0) p.push("แก้แล้วแถวเพิ่ม");
      const l = await listRules(owner, {});
      if (l?.ok !== true || !(l.items ?? []).some((x: Any) => x.id === id1 && x.name === `โปรชาเขียว แก้ ${RAND}`)) p.push(`list → ${codeOf(l)} ไม่มีกติกาที่แก้`);
    }
    // ขอบที่ผ่าน (active false ทั้งหมด — ไม่กระทบราคา)
    const oks: [string, Record<string, unknown>][] = [
      ["priority 0", { priority: 0 }],
      ["priority 100", { priority: 100 }],
      ["PERCENT 1bp", { adjust: "PERCENT_OFF", valueSatang: undefined, valueBp: 1 }],
      ["PERCENT 10000bp", { adjust: "PERCENT_OFF", valueSatang: undefined, valueBp: 10_000 }],
      ["PRICE 0", { valueSatang: 0 }],
      ["ชื่อ 60 ตัว", { name: `ช${"า".repeat(59)}` }],
      ["00:00–23:59", { timeFrom: "00:00", timeTo: "23:59" }],
      ["หมวดล้วน", { productIds: [], categoryIds: [CAT_ID || "none"] }],
      ["สาขา A,B", { unitIds: [U.A, U.B] }],
      ["ช่องทาง STORE,LINEMAN", { channelCodes: ["STORE", "LINEMAN"] }],
      ["วัน 0–6", { weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      ["ช่วงวันที่", { startsAt: iso(NOW0), endsAt: iso(NOW0 + 3_600_000) }],
      ["HAPPY_HOUR", { kind: "HAPPY_HOUR" }],
    ];
    for (const [lbl, o] of oks) {
      const input = ruleIn({ name: `ขอบ ${lbl} ${RAND}`.slice(0, 60), active: false, ...o });
      for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];
      const r = await saveRule(input, owner, "A", `P1 ok ${lbl}`);
      if (ridOf(r)) madeRules.push(ridOf(r));
      else p.push(`ขอบ ${lbl} → ${codeOf(r)} ${short(r?.message ?? "", 40)}`);
    }
    const n1 = await ruleCount();
    const bads: [string, Record<string, unknown>][] = [
      ["ชื่อว่าง", { name: "   " }],
      ["ชื่อ 61", { name: `ช${"า".repeat(60)}` }],
      ["priority −1", { priority: -1 }],
      ["priority 101", { priority: 101 }],
      ["PERCENT 0", { adjust: "PERCENT_OFF", valueSatang: undefined, valueBp: 0 }],
      ["PERCENT 10001", { adjust: "PERCENT_OFF", valueSatang: undefined, valueBp: 10_001 }],
      ["AMOUNT 0", { adjust: "AMOUNT_OFF", valueSatang: 0 }],
      ["PRICE −1", { valueSatang: -1 }],
      ["PRICE เกิน MAX", { valueSatang: PRICE_MAX + 1 }],
      ["ไม่มีสินค้า+หมวด", { productIds: [], categoryIds: [] }],
      ["เวลาข้างเดียว", { timeFrom: "14:00", timeTo: null }],
      ["from = to", { timeFrom: "14:00", timeTo: "14:00" }],
      ["ข้ามเที่ยงคืน 22:00–02:00", { timeFrom: "22:00", timeTo: "02:00" }],
      ["start ≥ end", { startsAt: iso(NOW0 + 3_600_000), endsAt: iso(NOW0) }],
      ["วัน 7", { weekdays: [7] }],
      ["25:00", { timeFrom: "13:00", timeTo: "25:00" }],
      ["kind แปลก", { kind: "FLASH" }],
      ["adjust แปลก", { adjust: "DOUBLE" }],
      ["คีย์แปลก", { foo: 1 }],
      ["สินค้า 501", { productIds: Array.from({ length: 501 }, (_, i) => `p${i}`) }],
      ["หมวด 51", { productIds: [], categoryIds: Array.from({ length: 51 }, (_, i) => `c${i}`) }],
      ["ช่องทางตัวเล็ก", { channelCodes: ["lineman"] }],
    ];
    for (const [lbl, o] of bads) {
      const input = ruleIn({ name: `ผิด ${lbl} ${RAND}`.slice(0, 60), active: false, ...o });
      for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];
      const r = await saveRule(input, owner, "A", `P1 bad ${lbl}`);
      if (ridOf(r)) madeRules.push(ridOf(r));
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if ((await ruleCount()) !== n1) p.push(`คำปฏิเสธเขียนแถว ${n1} → ${await ruleCount()}`);
    // archive + list
    if (id1) {
      const ar = await archiveRule(id1, owner, "A", "P1 archive");
      if (ar?.ok !== true || ar.rule?.archived !== true) p.push(`archive → ${codeOf(ar)} archived ${short(ar?.rule?.archived, 6)}`);
      else madeRules.splice(madeRules.indexOf(id1), 1);
      const l1 = await listRules(owner, {});
      const l2 = await listRules(owner, { includeArchived: true });
      if (l1?.ok !== true || (l1.items ?? []).some((x: Any) => x.id === id1)) p.push(`list ปกติยังเห็นกติกาที่เก็บ (${codeOf(l1)})`);
      if (!(l2?.items ?? []).some((x: Any) => x.id === id1 && x.archived === true)) p.push(`includeArchived ไม่เห็น archived:true (${codeOf(l2)})`);
    }
    chk("P1", NPR() === "" && p.length === 0, `CRUD · ขอบผ่าน ${oks.length} · ผิด ${bads.length} แบบ VALIDATION`, FX(NPR() + (P8(p) || "ครบ")));
  }
  // P2 เพดาน 100
  {
    const p: string[] = [];
    const l0 = await listRules(owner, {});
    const live0 = l0?.ok === true ? (l0.items ?? []).length : -1;
    let filled = 0;
    if (live0 >= 0 && !fx)
      for (let i = live0; i < 100; i++) {
        const r = await saveRule(ruleIn({ name: `เติม ${i} ${RAND}`, active: false }), owner, "A", "P2 fill");
        if (ridOf(r)) {
          madeRules.push(ridOf(r));
          filled++;
        } else {
          p.push(`เติมลำดับ ${i + 1} → ${codeOf(r)}`);
          break;
        }
      }
    const n0 = await ruleCount();
    const over = await saveRule(ruleIn({ name: `เกิน ${RAND}`, active: false }), owner, "A", "P2 101");
    if (!refused(over, "PRICE_RULE_LIMIT")) p.push(`ลำดับ 101 → ${codeOf(over)} (มีอยู่ ${live0} เติม ${filled})`);
    if (ridOf(over)) madeRules.push(ridOf(over));
    if ((await ruleCount()) !== n0) p.push("ลำดับ 101 เขียนแถว");
    const one = madeRules[madeRules.length - 1];
    if (one) {
      const a = await archiveRule(one, owner, "A", "P2 archive one");
      if (a?.ok === true) madeRules.pop();
      const again = await saveRule(ruleIn({ name: `หลังเก็บ ${RAND}`, active: false }), owner, "A", "P2 again");
      if (ridOf(again)) madeRules.push(ridOf(again));
      else p.push(`หลังเก็บถาวร 1 ตัว → ${codeOf(again)} (คาด สร้างได้)`);
    }
    await archiveAll();
    const l1 = await listRules(owner, {});
    if (l1?.ok === true && (l1.items ?? []).length !== 0) p.push(`หลังเก็บทั้งหมดเหลือ ${(l1.items ?? []).length}`);
    chk("P2", NPR() === "" && p.length === 0, "100 ตัว → ตัวที่ 101 PRICE_RULE_LIMIT · เก็บถาวรแล้วสร้างได้", FX(NPR() + (P8(p) || `ครบ (เติม ${filled})`)));
  }
  // P3 สิทธิ์
  {
    const p: string[] = [];
    const ls = await listRules(staff, {});
    if (ls?.ok !== true) p.push(`พนักงาน list → ${codeOf(ls)}`);
    const ss = await saveRule(ruleIn({ name: `พนักงานสร้าง ${RAND}`, active: false }), staff, "A", "P3 staff");
    if (ridOf(ss)) madeRules.push(ridOf(ss));
    if (!refused(ss, "PERMISSION_DENIED")) p.push(`พนักงาน save → ${codeOf(ss)}`);
    const ln = await listRules(nobody, {});
    if (!refused(ln, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ POS list → ${codeOf(ln)}`);
    const mA = await saveRule(ruleIn({ name: `ผู้จัดการ A ${RAND}`, active: false, unitIds: [U.A] }), manager, "A", "P3 manager A");
    const mAid = ridOf(mA);
    if (!mAid) p.push(`ผู้จัดการ unitIds [A] → ${codeOf(mA)}`);
    const mAll = await saveRule(ruleIn({ name: `ผู้จัดการทุกสาขา ${RAND}`, active: false, unitIds: [] }), manager, "A", "P3 manager all");
    if (ridOf(mAll)) madeRules.push(ridOf(mAll));
    if (!refused(mAll, "PERMISSION_DENIED")) p.push(`ผู้จัดการ unitIds [] → ${codeOf(mAll)}`);
    const oAll = await saveRule(ruleIn({ name: `เจ้าของทุกสาขา ${RAND}`, active: false }), owner, "A", "P3 owner all");
    const oAllId = ridOf(oAll);
    if (oAllId) madeRules.push(oAllId);
    const ma = oAllId ? await archiveRule(oAllId, manager, "A", "P3 manager archive all") : null;
    if (!refused(ma, "PERMISSION_DENIED")) p.push(`ผู้จัดการ archive กติกาทุกสาขา → ${codeOf(ma)}`);
    if (mAid) {
      const am = await archiveRule(mAid, manager, "A", "P3 manager archive A");
      if (am?.ok !== true) {
        p.push(`ผู้จัดการ archive กติกาสาขา A → ${codeOf(am)}`);
        madeRules.push(mAid);
      }
    }
    const k1 = await saveRule(ruleIn({ name: `พนักงานมีคีย์ ${RAND}`, active: false }), staffKeyAll, "A", "P3 staff key all");
    if (ridOf(k1)) madeRules.push(ridOf(k1));
    else p.push(`พนักงานมี ${PERM_RULE} ทุกสาขา unitIds [] → ${codeOf(k1)} (ตัวควบคุมบวก)`);
    const k2 = await saveRule(ruleIn({ name: `พนักงานมีคีย์ A ${RAND}`, active: false }), staffKeyA, "A", "P3 staff key A");
    if (ridOf(k2)) madeRules.push(ridOf(k2));
    if (!refused(k2, "PERMISSION_DENIED")) p.push(`พนักงานมีคีย์เฉพาะ A unitIds [] → ${codeOf(k2)}`);
    chk("P3", NPR() === "" && p.length === 0, "พนักงาน list ได้ save ไม่ได้ · ผู้จัดการเฉพาะ [A] · ทุกสาขาต้องครบทุกสาขา · ชื่อคีย์ pos.price.rule", FX(NPR() + (P8(p) || "ครบ")));
  }
  // P4 ข้ามร้าน
  {
    const p: string[] = [];
    const t2 = fx ? null : await call(ruleMod, "savePriceRule", rctx("X"), owner, ruleIn({ name: `กติการ้าน T2 ${RAND}`, productIds: [PR.t2 ?? "none"] }));
    const t2id = ridOf(t2);
    if (!t2id) p.push(`(ตั้งต้น) กติการ้าน T2 → ${codeOf(t2)} ${short(t2?.message ?? "", 50)}`);
    const before = await ruleRow(t2id);
    const cases: [string, () => Promise<Any>][] = [
      ["save id ร้าน T2", () => saveRule({ ...ruleIn({ name: `แฮก ${RAND}` }), id: t2id || "none" }, owner, "A", "P4 save t2")],
      ["archive id ร้าน T2", () => archiveRule(t2id || "none", owner, "A", "P4 archive t2")],
      ["save id มั่ว", () => saveRule({ ...ruleIn({ name: `มั่ว ${RAND}` }), id: `nope${RAND}` }, owner, "A", "P4 save nope")],
      ["archive id มั่ว", () => archiveRule(`nope${RAND}`, owner, "A", "P4 archive nope")],
    ];
    for (const [lbl, f] of cases) {
      const r = await f();
      if (ridOf(r) && ridOf(r) !== t2id) madeRules.push(ridOf(r));
      if (!refused(r, "PRICE_RULE_NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const after = await ruleRow(t2id);
    if (!before || short(before) !== short(after)) p.push("แถวกติการ้าน T2 เปลี่ยน/ไม่มี");
    const l = await listRules(owner, { includeArchived: true });
    if ((l?.items ?? []).some((x: Any) => x.id === t2id)) p.push("list ของร้านนี้เห็นกติการ้าน T2");
    chk("P4", NPR() === "" && p.length === 0, "PRICE_RULE_NOT_FOUND 4 ทาง · แถว T2 ไม่เปลี่ยน", FX(NPR() + (P8(p) || "ครบ")));
  }
  // P5 กติกาที่ใช้ไม่ได้ถูกเมิน + audit
  {
    const p: string[] = [];
    const gt = (k: string) => quote(k, { lines: [pl(PR.greentea ?? "none")] }, owner, `P5 ${k}`);
    const other = (TODAY_BKK + 3) % 7;
    const ignored: [string, Record<string, unknown>][] = [
      ["active false", { active: false }],
      ["นอกช่วงวันที่", { startsAt: iso(NOW0 - 2 * 86_400_000), endsAt: iso(NOW0 - 86_400_000) }],
      ["ยังไม่เริ่ม", { startsAt: iso(NOW0 + 86_400_000), endsAt: iso(NOW0 + 2 * 86_400_000) }],
      ["นอกเวลา", { timeFrom: hhmm(OFF.from), timeTo: hhmm(OFF.to) }],
      ["วันอื่น", { weekdays: [other] }],
      ["สาขา B", { unitIds: [U.B] }],
      ["ช่องทาง LINEMAN", { channelCodes: ["LINEMAN"] }],
    ];
    const ign: Record<string, string> = {};
    for (const [lbl, o] of ignored) {
      const r = await saveRule(ruleIn({ name: `เมิน ${lbl} ${RAND}`.slice(0, 60), valueSatang: 2000, ...o }), owner, "A", `P5 ${lbl}`);
      ign[lbl] = ridOf(r);
      if (ridOf(r)) madeRules.push(ridOf(r));
      else p.push(`(ตั้งต้น) ${lbl} → ${codeOf(r)}`);
    }
    const q0 = await gt("A");
    if (qsig(q0?.lines?.[0]) !== "5500|BASE|5500|null") p.push(`สาขา A กติกาใช้ไม่ได้ทั้งหมด → ${codeOf(q0)} ${qsig(q0?.lines?.[0])} (คาด 5500|BASE)`);
    const qb = await gt("B");
    const ruleB = ign["สาขา B"] ?? "";
    if (qsig(qb?.lines?.[0]) !== `2000|RULE|5500|${ruleB}`) p.push(`สาขา B (ตัวควบคุม) → ${codeOf(qb)} ${qsig(qb?.lines?.[0])}`);
    const act = await saveRule(ruleIn({ name: `ใช้ได้ ${RAND}`, valueSatang: 2000, ...nowWindow }), owner, "A", "P5 active");
    const actId = ridOf(act);
    const q1 = await gt("A");
    if (!actId || qsig(q1?.lines?.[0]) !== `2000|RULE|5500|${actId}`) p.push(`ใช้ได้ (ตัวควบคุมบวก) → ${codeOf(q1)} ${qsig(q1?.lines?.[0])}`);
    if (q1?.ok === true && (q1.lines?.[0]?.priceRule?.name ?? "") !== `ใช้ได้ ${RAND}`) p.push(`priceRule.name ${short(q1.lines?.[0]?.priceRule, 60)}`);
    if (actId) await archiveRule(actId, owner, "A", "P5 archive active");
    const q2 = await gt("A");
    if (qsig(q2?.lines?.[0]) !== "5500|BASE|5500|null") p.push(`หลังเก็บถาวร → ${codeOf(q2)} ${qsig(q2?.lines?.[0])}`);
    await archiveAll();
    // audit
    const cr = await audits(AUDIT.created);
    const up = await audits(AUDIT.updated);
    const ar = await audits(AUDIT.archived);
    const all = [...cr, ...up, ...ar];
    if (!actId || !cr.some((a) => mentions(a, actId) && a.actorId === ownerId)) p.push(`${AUDIT.created} (เจ้าของ) ไม่พบ (${cr.length})`);
    if (!actId || !ar.some((a) => mentions(a, actId) && a.actorId === ownerId)) p.push(`${AUDIT.archived} (เจ้าของ) ไม่พบ (${ar.length})`);
    if (!up.some((a) => a.actorId === ownerId && short([a.after, a.before], 8000).includes(`โปรชาเขียว แก้ ${RAND}`))) p.push(`${AUDIT.updated} ของ P1 ไม่พบ (${up.length})`);
    if (!cr.some((a) => a.actorId === mgrId && short(a.after, 8000).includes(`ผู้จัดการ A ${RAND}`))) p.push(`${AUDIT.created} (ผู้จัดการ) ไม่พบ`);
    if (all.some((a) => short([a.after, a.before], 8000).includes(`พนักงานสร้าง ${RAND}`) || short([a.after, a.before], 8000).includes(`ผู้จัดการทุกสาขา ${RAND}`))) p.push("มี audit ของคำขอที่ถูกปฏิเสธ");
    if (all.some((a) => !a.actorId)) p.push("มี audit ไม่มี actorId");
    chk("P5", NPR() === "" && p.length === 0, "7 แบบถูกเมิน · ตัวควบคุมบวก RULE · เก็บถาวรแล้วกลับ BASE · audit 3 ชนิด", FX(NPR() + (P8(p) || `ครบ (${all.length} audit)`)));
  }

  // ════════ Q หน้าขาย (มีกติกา) ════════
  const HH_NAME = `บ่ายชิล ${RAND}`;
  const PCT_NAME = `ลด 20% ทุกช่องทาง ${RAND}`;
  let R_HH = "";
  let R_PCT = "";
  const latte1 = { lines: [pl(PR.latte ?? "none")] };
  // Q4 happy hour + แคตตาล็อก
  {
    const p: string[] = [];
    const r = await saveRule(ruleIn({ name: HH_NAME, kind: "HAPPY_HOUR", priority: 10, productIds: [PR.latte ?? "none"], channelCodes: ["STORE"], adjust: "PRICE", valueSatang: 5900, ...nowWindow }), owner, "A", "Q4 happy hour");
    R_HH = ridOf(r);
    if (!R_HH) p.push(`สร้าง happy hour → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const q = await quote("A", latte1, owner, "Q4 STORE");
    if (qsig(q?.lines?.[0]) !== `5900|RULE|7500|${R_HH || "?"}`) p.push(`quote ${codeOf(q)} ${qsig(q?.lines?.[0])} (คาด 5900|RULE|7500|R_HH)`);
    const pr = q?.lines?.[0]?.priceRule;
    if (q?.ok === true && (!isRecord(pr) || pr.name !== HH_NAME)) p.push(`priceRule ${short(pr, 80)} (คาด {id, name})`);
    if (q?.ok === true && q.grandTotalSatang !== 5900) p.push(`grand ${q.grandTotalSatang}`);
    const cat = fx ? null : await call(register, "registerCatalog", ctxOf("A"), owner, { q: NM.latte });
    const tile = cat?.ok === true ? (cat.products ?? []).find((x: Any) => x?.id === PR.latte) : null;
    if (!tile) p.push(`registerCatalog → ${codeOf(cat)} ไม่มีลาเต้`);
    else {
      const sg = `${tile.priceSatang}|${tile.priceSource}|${tile.listPriceSatang}|${tile.priceRule?.id ?? null}`;
      if (sg !== `5900|RULE|7500|${R_HH || "?"}`) p.push(`ไทล์ ${sg} (คาด 5900|RULE|7500|R_HH)`);
    }
    const pvu = cat?.ok === true ? cat.priceValidUntil : undefined;
    const pvMs = pvu === null || pvu === undefined ? NaN : new Date(pvu as string).getTime();
    if (!Number.isFinite(pvMs) || pvMs <= Date.now() || pvMs > WIN_END_UTC + MIN) p.push(`priceValidUntil ${short(pvu, 40)} (คาด อนาคต ≤ ${new Date(WIN_END_UTC).toISOString()})`);
    chk("Q4", NPR() === "" && p.length === 0, "5,900 RULE list 7,500 · ไทล์ราคากติกา · priceValidUntil", FX(NPR() + (P8(p) || "ครบ")));
  }
  // Q5 STORE-only ไม่โดน LINEMAN · % ทุกช่องทางบน 9,500
  {
    const p: string[] = [];
    const lm0 = await quote("A", { channelId: CH.LM_A, ...latte1 }, owner, "Q5 LINEMAN ก่อน");
    if (qsig(lm0?.lines?.[0]) !== "9500|CHANNEL|7500|null") p.push(`LINEMAN ก่อน ${codeOf(lm0)} ${qsig(lm0?.lines?.[0])} (กติกา STORE ต้องไม่โดน)`);
    const r = await saveRule(ruleIn({ name: PCT_NAME, priority: 0, productIds: [PR.latte ?? "none"], adjust: "PERCENT_OFF", valueSatang: undefined, valueBp: 2000, ...nowWindow }), owner, "A", "Q5 pct");
    R_PCT = ridOf(r);
    if (!R_PCT) p.push(`สร้าง % → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const lm1 = await quote("A", { channelId: CH.LM_A, ...latte1 }, owner, "Q5 LINEMAN หลัง");
    if (qsig(lm1?.lines?.[0]) !== `7600|RULE|7500|${R_PCT || "?"}`) p.push(`LINEMAN หลัง ${codeOf(lm1)} ${qsig(lm1?.lines?.[0])} (คาด 7600|RULE|7500|R_PCT)`);
    const st = await quote("A", latte1, owner, "Q5 STORE");
    if (qsig(st?.lines?.[0]) !== `5900|RULE|7500|${R_HH || "?"}`) p.push(`STORE ${codeOf(st)} ${qsig(st?.lines?.[0])} (คาด R_HH priority 10)`);
    chk("Q5", NPR() === "" && p.length === 0, "STORE-only ไม่โดน LINEMAN · 20% บน 9,500 = 7,600 · priority 10 ชนะบน STORE", FX(NPR() + (P8(p) || "ครบ")));
  }
  // Q6 ตัวเลือกบวกหลังกติกา
  {
    const p: string[] = [];
    const cart = { lines: [pl(PR.latte ?? "none", 1, { options: [{ choiceId: CHOICE_M || "none" }] })] };
    const s = await quote("A", cart, owner, "Q6 STORE");
    const l = await quote("A", { channelId: CH.LM_A, ...cart }, owner, "Q6 LINEMAN");
    const sg = (q: Any) => `${q?.lines?.[0]?.unitPriceSatang}|${q?.lines?.[0]?.optionsSatang}|${q?.lines?.[0]?.priceSource}|${q?.lines?.[0]?.listPriceSatang}`;
    if (sg(s) !== "6900|1000|RULE|7500") p.push(`STORE ${codeOf(s)} ${sg(s)} (คาด 6900|1000|RULE|7500)`);
    if (sg(l) !== "8600|1000|RULE|7500") p.push(`LINEMAN ${codeOf(l)} ${sg(l)} (คาด 8600|1000|RULE|7500)`);
    chk("Q6", p.length === 0, "6,900 / 8,600 · optionsSatang 1,000 · list ไม่รวมตัวเลือก", FX(NPR() + (P8(p) || "ครบ")));
  }
  // Q7 ① ไม่โดนชั้นราคา
  {
    const p: string[] = [];
    const open = { lines: [pl(PR.latte ?? "none", 1, { openPrice: true, unitPriceSatang: 4000 })] };
    const o1 = await quote("A", open, owner, "Q7 open STORE");
    const o2 = await quote("A", { channelId: CH.LM_A, ...open }, owner, "Q7 open LINEMAN");
    const cu = await quote("A", { lines: [{ name: `ค่าห่อ ${RAND}`, qty: 1, unitPriceSatang: 500 }] }, owner, "Q7 custom");
    const wg = await quote("A", { lines: [pl(PR.weighed ?? "none", 1, { weightGrams: 500 })] }, owner, "Q7 weighed");
    const want: [string, Any, string][] = [
      ["ราคาเปิด STORE", o1, "4000|OPEN|null|null"],
      ["ราคาเปิด LINEMAN", o2, "4000|OPEN|null|null"],
      ["กำหนดเอง", cu, "500|CUSTOM|null|null"],
      ["สินค้าชั่ง 500 g", wg, "60000|WEIGHED|null|null"],
    ];
    for (const [lbl, q, w] of want) if (qsig(q?.lines?.[0]) !== w) p.push(`${lbl} ${codeOf(q)} ${qsig(q?.lines?.[0])} (คาด ${w})`);
    chk("Q7", p.length === 0, "OPEN/CUSTOM/WEIGHED ไม่โดนแถว/กติกา · priceRule null", FX(NPR() + (P8(p) || "ครบ")));
  }
  // Q9 สมาชิก + คูปอง + เพดานพนักงาน บนราคากติกา
  {
    const p: string[] = [];
    if (!MEMBER_X) p.push("fixture: ไม่มีสมาชิก X");
    const mem = { memberId: MEMBER_X || "none", couponCode: "PCT10" };
    const a = await quote("A", { lines: [pl(PR.latte ?? "none", 2)], ...mem }, owner, "Q9 rule");
    const c = await quote("A", { lines: [{ name: `ควบคุม 5900 ${RAND}`, qty: 2, unitPriceSatang: 5900 }], ...mem }, owner, "Q9 control 5900");
    const d = await quote("A", { lines: [{ name: `ควบคุม 7500 ${RAND}`, qty: 2, unitPriceSatang: 7500 }], ...mem }, owner, "Q9 control 7500");
    const F9 = ["subtotalSatang", "couponDiscountSatang", "tierDiscountSatang", "memberDiscountSatang", "netSatang", "vatSatang", "grandTotalSatang", "pointsToEarn"];
    const sg = (q: Any) => F9.map((k) => `${k.replace("Satang", "")}=${q?.[k]}`).join(" ");
    if (a?.ok !== true || c?.ok !== true || d?.ok !== true) p.push(`quote ${codeOf(a)}/${codeOf(c)}/${codeOf(d)}`);
    else {
      if (a.lines?.[0]?.priceSource !== "RULE" || a.lines?.[0]?.unitPriceSatang !== 5900) p.push(`บรรทัด ${qsig(a.lines?.[0])} (คาด 5900 RULE)`);
      if (sg(a) !== sg(c)) p.push(`ราคากติกา ${sg(a)} ≠ ควบคุม ${sg(c)}`);
      if (a.couponDiscountSatang !== 1180) p.push(`คูปอง ${a.couponDiscountSatang} (คาด 1,180 = 10% ของ 11,800)`);
      if (!(Number(a.tierDiscountSatang) > 0)) p.push(`tier ${a.tierDiscountSatang} (คาด > 0 · Gold 5%)`);
      if (a.grandTotalSatang === d.grandTotalSatang || a.couponDiscountSatang === d.couponDiscountSatang) p.push(`ไม่ต่างจากตะกร้า 7,500 (${sg(d)}) — ค่าไม่ได้คิดบนราคากติกา`);
      if ((a.memberConflicts ?? []).length) p.push(`memberConflicts ${short(a.memberConflicts, 80)}`);
    }
    const s0 = await quote("A", latte1, staff, "Q9 staff 0");
    const s1 = await quote("A", { lines: [pl(PR.latte ?? "none", 1, { discount: { type: "PERCENT", value: 1000 } })] }, staff, "Q9 staff 10%");
    const s2 = await quote("A", { lines: [pl(PR.latte ?? "none", 1, { discount: { type: "PERCENT", value: 1001 } })] }, staff, "Q9 staff 10.01%");
    if (s0?.ok !== true || s0.grandTotalSatang !== 5900) p.push(`พนักงานไม่มีส่วนลด → ${codeOf(s0)} ${s0?.grandTotalSatang} (กติกาไม่ใช่ส่วนลด)`);
    if (s1?.ok !== true || s1.lineDiscountSatang !== 590 || s1.grandTotalSatang !== 5310) p.push(`พนักงาน 10% → ${codeOf(s1)} ลด ${s1?.lineDiscountSatang} ยอด ${s1?.grandTotalSatang} (คาด 590/5,310)`);
    if (!refused(s2, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`พนักงาน 10.01% → ${codeOf(s2)} (ตัวควบคุม)`);
    chk("Q9", p.length === 0, "tier + คูปองบน 5,900 = ตะกร้าควบคุม · ≠ 7,500 · เพดาน 10% บน 5,900", FX(NPR() + (P8(p) || "ครบ")));
  }

  // ════════ S บิล ════════
  // S1 submit → snapshot บรรทัด + billDetail
  {
    const p: string[] = [];
    const cart = { lines: [pl(PR.latte ?? "none"), pl(PR.americano ?? "none"), pl(PR.espresso ?? "none"), { name: `ค่าห่อ S1 ${RAND}`, qty: 1, unitPriceSatang: 500 }] };
    const q = await quote("A", cart, owner, "S1 quote");
    const g = q?.ok === true ? Number(q.grandTotalSatang) : 16_900;
    if (q?.ok === true && g !== 16_900) p.push(`quote ${g} (คาด 5,900 + 5,500 + 5,000 + 500 = 16,900)`);
    const s = await submit(cart, g, [["CASH", g]]);
    const sid = s?.ok === true ? String(s.saleId) : "";
    if (!sid) p.push(`submit STORE → ${codeOf(s)} ${short(s?.message ?? "", 60)}`);
    const ls = await lineSnaps(sid);
    const byP = (pid: string | null) => ls.find((l) => (l.productId ?? null) === pid);
    const sg = (l: LineSnap | undefined) => (l ? `${l.unitPriceSatang}|${l.priceSource}|${l.priceRuleId}|${l.listPriceSatang}` : "—");
    const want: [string, string | null, string][] = [
      ["ลาเต้", PR.latte ?? "?", `5900|RULE|${R_HH || "?"}|7500`],
      ["อเมริกาโน่", PR.americano ?? "?", "5500|BRANCH|null|6000"],
      ["เอสเพรสโซ่", PR.espresso ?? "?", "5000|BASE|null|5000"],
      ["กำหนดเอง", null, "500|CUSTOM|null|null"],
    ];
    if (sid) for (const [lbl, pid, w] of want) if (sg(byP(pid)) !== w) p.push(`${lbl} ${sg(byP(pid))} (คาด ${w})`);
    if (sid) {
      const row = await P.posSale.findUnique({ where: { id: sid }, include: { lines: true } }).catch(() => null);
      const lt = sum((row?.lines ?? []).map((l: Any) => Number(l.lineTotalSatang)));
      if (row?.grandTotalSatang !== g || lt !== g) p.push(`ยอดบิล ${row?.grandTotalSatang} Σ บรรทัด ${lt} quote ${g}`);
      const bd = await call(billsMod, "billDetail", ctxOf("A"), owner, { unitId: U.A, saleId: sid });
      const bl = bd?.ok === true ? (bd.bill?.lines ?? []) : null;
      if (!bl) p.push(`billDetail → ${codeOf(bd)}`);
      else {
        const bsg = (nm: string) => {
          const l = bl.find((x: Any) => x.name === nm);
          return l ? `${l.priceSource}|${l.priceRuleName}|${l.listPriceSatang}` : "—";
        };
        if (bsg(NM.latte ?? "") !== `RULE|${HH_NAME}|7500`) p.push(`billDetail ลาเต้ ${bsg(NM.latte ?? "")}`);
        if (bsg(NM.americano ?? "") !== "BRANCH|null|6000") p.push(`billDetail อเมริกาโน่ ${bsg(NM.americano ?? "")}`);
      }
    }
    const lq = await quote("A", { channelId: CH.LM_A, ...latte1 }, owner, "S1 LINEMAN quote");
    const lg = lq?.ok === true ? Number(lq.grandTotalSatang) : 7600;
    const lsb = await submit({ channelId: CH.LM_A, ...latte1 }, lg, [["PLATFORM", lg]]);
    const lid = lsb?.ok === true ? String(lsb.saleId) : "";
    if (!lid) p.push(`submit LINEMAN → ${codeOf(lsb)} ${short(lsb?.message ?? "", 60)}`);
    else if (sg((await lineSnaps(lid))[0]) !== `7600|RULE|${R_PCT || "?"}|7500`) p.push(`LINEMAN บรรทัด ${sg((await lineSnaps(lid))[0])} (คาด 7600|RULE|R_PCT|7500)`);
    chk("S1", NLINE() === "" && p.length === 0, "snapshot 3 คอลัมน์ต่อบรรทัด · Σ = ยอด = quote · billDetail", FX(NLINE() + NPR() + (P8(p) || "ครบ")));
  }
  // S2 createSale ตรง
  {
    const p: string[] = [];
    const cs = (lines: Any[], key: string) =>
      fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(svc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: key, lines, payMethods: [{ type: "CASH", amountSatang: sum(lines.map((l: Any) => l.unitPriceSatang * l.qty)) }] });
    const sidOf = (r: Any) => (r && typeof r.saleId === "string" ? r.saleId : "");
    const leg = await cs([{ name: `เดิม ${RAND}`, qty: 1, unitPriceSatang: 3000 }], newKey("legacy"));
    const legSnap = (await lineSnaps(sidOf(leg)))[0];
    if (!sidOf(leg)) p.push(`ผู้เรียกเดิม → ${codeOf(leg)}`);
    else if (!legSnap || legSnap.priceSource !== null || legSnap.priceRuleId !== null || legSnap.listPriceSatang !== null) p.push(`ผู้เรียกเดิม ${short(legSnap, 100)} (คาด null ทั้ง 3)`);
    const kFull = newKey("full");
    const full = await cs([{ name: `ส่งครบ ${RAND}`, qty: 1, unitPriceSatang: 999, priceSource: "RULE", priceRuleId: "rule-xyz", listPriceSatang: 1234 }], kFull);
    const fs = (await lineSnaps(sidOf(full)))[0];
    if (!sidOf(full)) p.push(`ส่งครบ → ${codeOf(full)} ${short(full?.message ?? "", 50)}`);
    else if (!fs || fs.unitPriceSatang !== 999 || fs.priceSource !== "RULE" || fs.priceRuleId !== "rule-xyz" || fs.listPriceSatang !== 1234) p.push(`ส่งครบ ${short(fs, 120)} (คาด 999 RULE rule-xyz 1234 · ไม่คิดราคาเอง)`);
    const bads: [string, Record<string, unknown>][] = [
      ["priceSource แปลก", { priceSource: "XYZ" }],
      ["priceRuleId 41", { priceRuleId: "R".repeat(41) }],
      ["listPriceSatang −1", { listPriceSatang: -1 }],
      ["listPriceSatang 1.5", { listPriceSatang: 1.5 }],
    ];
    for (const [lbl, o] of bads) {
      const k = newKey("bad");
      const r = await cs([{ name: `ผิด ${RAND}`, qty: 1, unitPriceSatang: 1000, ...o }], k);
      if (!codeIs(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
      if ((await keyCount(k)) !== 0) p.push(`${lbl} มีบิล`);
    }
    const rep = await cs([{ name: `ส่งครบ ${RAND}`, qty: 1, unitPriceSatang: 999, priceSource: "BASE" }], kFull);
    if (sidOf(full) && sidOf(rep) !== sidOf(full)) p.push(`คีย์ซ้ำ + snapshot ต่าง → ${codeOf(rep)} ${sidOf(rep)} (คาด บิลเดิม · ไม่อยู่ใน samePayload)`);
    chk("S2", NLINE() === "" && p.length === 0, "เดิม null · ส่งครบเขียนตามส่ง · 4 แบบ VALIDATION · ไม่อยู่ใน samePayload", FX(NLINE() + (P8(p) || "ครบ")));
  }

  // ════════ ก่อนพลิก (กติกายังอยู่): S4 · H1 · Q10 · H2 · R ════════
  const K1 = newKey("s4");
  const s4a = await submit(latte1, 5900, [["CASH", 5900]], K1);
  const s4id = s4a?.ok === true ? String(s4a.saleId) : "";
  const h1 = fx ? null : await call(heldMod, "holdRegisterCart", ctxOf("A", DEV1), owner, { cart: latte1, label: `พัก H1 ${RAND}` });
  const h1id = h1?.ok === true ? String(h1.heldCart?.id ?? "") : "";
  const q10a = await quote("A", latte1, owner, "Q10 ก่อน");
  // H2 (ทำครบก่อนพลิก)
  {
    const p: string[] = [];
    const heldSrc = stripComments(rd(F.held));
    if (!/\bchannelId\b/.test(heldSrc)) p.push("held-cart.ts ไม่ส่ง channelId ให้ probe (บั๊ก :292 — probe คิดราคา STORE)");
    const cart = { channelId: CH.LM_A, lines: [pl(PR.latte ?? "none"), pl(PR.americano ?? "none"), pl(PR.croissant ?? "none")] };
    const h = fx ? null : await call(heldMod, "holdRegisterCart", ctxOf("A", DEV1), owner, { cart, label: `พัก H2 ${RAND}` });
    const hid = h?.ok === true ? String(h.heldCart?.id ?? "") : "";
    if (!hid) p.push(`hold → ${codeOf(h)} ${short(h?.message ?? "", 60)}`);
    else {
      const row = await P.posHeldCart.findUnique({ where: { id: hid }, select: { cartJson: true } }).catch(() => null);
      const held = (row?.cartJson as Any)?.heldUnitPrices;
      if (short(held) !== short([7600, 7600, 4500])) p.push(`heldUnitPrices ${short(held, 40)} (คาด [7600,7600,4500] = LINEMAN + กติกา %)`);
      const off = await step("ปิดขายครัวซองต์ที่ A", () => catalogMod.updateProduct(cctxSys, PR.croissant, { availability: { [U.A]: false } }));
      if (!off) p.push("fixture: ปิดขายครัวซองต์ไม่สำเร็จ");
      const rc = await call(heldMod, "recallHeldCart", ctxOf("A", DEV1), owner, { id: hid });
      if (rc?.ok !== true) p.push(`recall → ${codeOf(rc)}`);
      else {
        const ns = (rc.notices ?? []).map((n: Any) => `${n.lineIndex}:${n.code}${n.code === "PRICE_CHANGED" ? `(${n.heldUnitPriceSatang}→${n.unitPriceSatang})` : ""}`);
        if (short(ns) !== short(["2:PRODUCT_UNAVAILABLE"])) p.push(`notices ${short(ns, 120)} (คาด เฉพาะ 2:PRODUCT_UNAVAILABLE — ไม่มี PRICE_CHANGED ปลอม)`);
        if (rc.cart?.channelId !== CH.LM_A) p.push(`cart.channelId ${short(rc.cart?.channelId, 20)}`);
      }
    }
    chk("H2", NCP() === "" && p.length === 0, "probe คิดราคา LINEMAN · ไม่มี PRICE_CHANGED ปลอม · held-cart.ts พก channelId", FX(NCP() + NPR() + (P8(p) || "ครบ")));
  }
  // R: บิลราคากติกา + บิลควบคุม (เงินเท่ากัน)
  const rSale = await submit({ lines: [pl(PR.latte ?? "none", 3)] }, 17_700, [["CASH", 17_700]]);
  const rCtl = await submit({ lines: [{ name: `ลาเต้ควบคุม ${RAND}`, qty: 3, unitPriceSatang: 5900 }] }, 17_700, [["CASH", 17_700]]);
  const vSale = await submit(latte1, 5900, [["CASH", 5900]]);
  const vCtl = await submit({ lines: [{ name: `ลาเต้ควบคุมยกเลิก ${RAND}`, qty: 1, unitPriceSatang: 5900 }] }, 5900, [["CASH", 5900]]);
  const sidOf = (r: Any) => (r?.ok === true && typeof r.saleId === "string" ? String(r.saleId) : "");
  for (const [lbl, r] of [["s4a", s4a], ["rSale", rSale], ["rCtl", rCtl], ["vSale", vSale], ["vCtl", vCtl]] as const) if (!sidOf(r)) console.log(`  ⚠️  บิล ${lbl}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
  await drain();

  // ════════ พลิก: เก็บกติกาทั้งสอง ════════
  for (const id of [R_HH, R_PCT]) if (id) await archiveRule(id, owner, "A", "flip");
  // S4 เล่นซ้ำคีย์เดิม
  {
    const p: string[] = [];
    const again = await submit(latte1, 5900, [["CASH", 5900]], K1);
    if (!s4id) p.push(`ครั้งแรก → ${codeOf(s4a)}`);
    else {
      if (again?.ok !== true || again.saleId !== s4id || again.duplicated !== true) p.push(`ซ้ำ → ${codeOf(again)} ${short(again?.saleId, 20)} duplicated ${short(again?.duplicated, 6)} (คาด บิลเดิม)`);
      const ev = await events("pos.sale.paid", (pl0) => pl0.saleId === s4id);
      if (ev.length !== 1) p.push(`outbox pos.sale.paid ${ev.length} แถว (คาด 1)`);
      const l = (await lineSnaps(s4id))[0];
      if (!l || l.priceSource !== "RULE" || l.priceRuleId !== R_HH || l.unitPriceSatang !== 5900) p.push(`บรรทัด ${short(l, 100)} (คาด RULE R_HH 5,900)`);
    }
    chk("S4", NLINE() === "" && p.length === 0, "คีย์ซ้ำหลังเก็บกติกา = บิลเดิม · outbox 1", FX(NLINE() + NPR() + (P8(p) || "ครบ")));
  }
  // Q10 PRICE_CHANGED → 0 แถว → สำเร็จ
  {
    const p: string[] = [];
    if (q10a?.ok !== true || q10a.grandTotalSatang !== 5900) p.push(`quote ก่อนพลิก ${codeOf(q10a)} ${q10a?.grandTotalSatang} (คาด 5,900)`);
    const c0 = await counts();
    const k = newKey("q10");
    const r = await submit(latte1, 5900, [["CASH", 5900]], k);
    if (!refused(r, "PRICE_CHANGED") || r.grandTotalSatang !== 7500) p.push(`ยอดเก่า → ${codeOf(r)} grand ${short(r?.grandTotalSatang, 10)} (คาด PRICE_CHANGED 7,500)`);
    else if (r.lines?.[0]?.priceSource !== "BASE") p.push(`ยอดสดบรรทัด ${qsig(r.lines?.[0])} (คาด BASE)`);
    const d = sameCounts(c0, await counts());
    if (d.length || (await keyCount(k)) !== 0) p.push(`PRICE_CHANGED เขียนแถว ${d.join(", ")}`);
    const ok = await submit(latte1, 7500, [["CASH", 7500]], k);
    const sid = sidOf(ok);
    if (!sid) p.push(`ส่งใหม่ 7,500 → ${codeOf(ok)}`);
    else {
      const l = (await lineSnaps(sid))[0];
      if (!l || l.priceSource !== "BASE" || l.priceRuleId !== null || l.listPriceSatang !== 7500 || l.unitPriceSatang !== 7500) p.push(`บรรทัด ${short(l, 100)} (คาด 7,500 BASE)`);
    }
    chk("Q10", NLINE() === "" && p.length === 0, "PRICE_CHANGED ยอดสด 7,500 · ไม่เขียน · ส่งใหม่สำเร็จ BASE", FX(NLINE() + NPR() + (P8(p) || "ครบ")));
  }
  // H1 เรียกคืนหลังกติกาหมด
  {
    const p: string[] = [];
    if (!h1id) p.push(`hold → ${codeOf(h1)} ${short(h1?.message ?? "", 60)}`);
    else {
      const row = await P.posHeldCart.findUnique({ where: { id: h1id }, select: { cartJson: true } }).catch(() => null);
      if (short((row?.cartJson as Any)?.heldUnitPrices) !== short([5900])) p.push(`heldUnitPrices ${short((row?.cartJson as Any)?.heldUnitPrices, 30)} (คาด [5900])`);
      const rc = await call(heldMod, "recallHeldCart", ctxOf("A", DEV1), owner, { id: h1id });
      if (rc?.ok !== true) p.push(`recall → ${codeOf(rc)}`);
      else {
        const n = (rc.notices ?? []).find((x: Any) => x.code === "PRICE_CHANGED" && x.lineIndex === 0);
        if (!n || n.heldUnitPriceSatang !== 5900 || n.unitPriceSatang !== 7500) p.push(`notices ${short(rc.notices, 120)} (คาด PRICE_CHANGED 5,900 → 7,500)`);
        if (rc.quote?.ok !== true || rc.quote.lines?.[0]?.priceSource !== "BASE") p.push(`quote ปัจจุบัน ${codeOf(rc.quote)} ${qsig(rc.quote?.lines?.[0])}`);
      }
    }
    chk("H1", NPR() === "" && p.length === 0, "PRICE_CHANGED 5,900 → 7,500 · quote BASE", FX(NPR() + (P8(p) || "ครบ")));
  }

  // ════════ R คืนเงิน / ยกเลิก (หลังเก็บกติกา + ฐานเปลี่ยน) ════════
  const sp = fx || !PR.latte ? null : await call(catalogMod, "setPrice", cctxOf(ownerId), PR.latte, 8000);
  if (!okish(sp)) notes.push(`setPrice ลาเต้ 8,000: ${codeOf(sp)}`);
  const refundOf = async (sid: string, qty: number, amount: number): Promise<Any> => {
    if (!sid) return { ok: false, code: "NO_SALE" };
    const line = await P.posSaleLine.findFirst({ where: { saleId: sid }, select: { id: true } }).catch(() => null);
    return call(refundMod, "refundSale", ctxOf("A", DEV1), owner, { saleId: sid, lines: [{ lineId: String(line?.id ?? ""), qty }], payMethods: [{ type: "CASH", amountSatang: amount }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("rf") });
  };
  const rfId = (r: Any) => (r?.ok === true ? String(r.refund?.id ?? "") : "");
  const r1a = await refundOf(sidOf(rSale), 1, 5900);
  const r1b = await refundOf(sidOf(rSale), 2, 11_800);
  const c1a = await refundOf(sidOf(rCtl), 1, 5900);
  const c1b = await refundOf(sidOf(rCtl), 2, 11_800);
  await drain();
  // R1
  {
    const p: string[] = [];
    if ((await P.posProduct.findUnique({ where: { id: PR.latte ?? "-" }, select: { basePriceSatang: true } }).catch(() => null))?.basePriceSatang !== 8000) p.push(`ฐานลาเต้ไม่เป็น 8,000 (${codeOf(sp)})`);
    for (const [lbl, r, amt] of [["คืน ⅓", r1a, 5900], ["คืนที่เหลือ", r1b, 11_800]] as const) {
      if (r?.ok !== true) p.push(`${lbl} → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      else if (r.refund?.grandTotalSatang !== amt) p.push(`${lbl} ${r.refund?.grandTotalSatang} (คาด ${amt} = ราคาเดิม)`);
      const ls = await lineSnaps(rfId(r));
      if (rfId(r) && (!ls.length || ls.some((l) => l.priceSource !== null || l.priceRuleId !== null || l.listPriceSatang !== null))) p.push(`${lbl} บรรทัดใบคืน ${short(ls, 100)} (คาด null ทั้ง 3)`);
    }
    const o = (await lineSnaps(sidOf(rSale)))[0];
    if (!o || o.priceSource !== "RULE" || o.priceRuleId !== R_HH || o.listPriceSatang !== 7500 || o.unitPriceSatang !== 5900) p.push(`บรรทัดบิลเดิม ${short(o, 100)} (คาด RULE R_HH 7,500 / 5,900)`);
    chk("R1", NLINE() === "" && p.length === 0, "คืน 5,900 + 11,800 ตามราคาเดิม · ใบคืน null · บิลเดิมคง snapshot", FX(NLINE() + NPR() + NOTE() + (P8(p) || "ครบ")));
  }
  // R2 GL รูปเดียวกับบิลควบคุม + ยกเลิก
  {
    const p: string[] = [];
    const pair = async (lbl: string, a: string, b: string, ev: string) => {
      const ea = (await jv([a])).find((e) => e.key === K(a, ev));
      const eb = (await jv([b])).find((e) => e.key === K(b, ev));
      if (!ea || !eb || shape(ea) !== shape(eb)) p.push(`${lbl} ${shape(ea)} ≠ ควบคุม ${shape(eb)}`);
    };
    await pair("PAID", sidOf(rSale), sidOf(rCtl), "PAID");
    await pair("REFUNDED ⅓", rfId(r1a), rfId(c1a), "REFUNDED");
    await pair("REFUNDED ที่เหลือ", rfId(r1b), rfId(c1b), "REFUNDED");
    const before = await lineSnaps(sidOf(vSale));
    for (const sid of [sidOf(vSale), sidOf(vCtl)]) {
      if (!sid) continue;
      const v = await call(svc, "voidSale", T, U.A, sid);
      if (v?.ok === false) p.push(`voidSale → ${codeOf(v)} ${short(v.message, 50)}`);
    }
    await drain();
    const st = await P.posSale.findUnique({ where: { id: sidOf(vSale) || "-" }, select: { status: true } }).catch(() => null);
    if (st?.status !== "VOIDED") p.push(`สถานะบิลกติกา ${st?.status ?? "—"} (คาด VOIDED)`);
    const after = await lineSnaps(sidOf(vSale));
    if (!before.length || short(before) !== short(after) || before[0]?.priceSource !== "RULE") p.push(`snapshot หลังยกเลิก ${short(before, 60)} → ${short(after, 60)}`);
    const rev = async (sid: string) => (await jv([sid])).filter((e) => e.reversalOfId).map(shape).sort().join(" ; ");
    const ra = await rev(sidOf(vSale));
    const rb = await rev(sidOf(vCtl));
    if (!ra || ra !== rb) p.push(`รายการกลับ ${ra || "—"} ≠ ควบคุม ${rb || "—"}`);
    chk("R2", NLINE() === "" && p.length === 0, "PAID/REFUNDED/รายการกลับรูปเดียวกับบิลควบคุม · VOIDED คง snapshot", FX(NLINE() + NPR() + (P8(p) || "ครบ")));
  }
  await drain();
  if (notes.length) console.log(`  ℹ️  fixture ${notes.length} รายการ: ${notes.slice(0, 6).join(" | ")}`);
  console.log(`  ℹ️  คำปฏิเสธแบบข้อมูลที่เก็บได้ ${dataRefusals.length} รายการ`);
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน ═════════════════════════
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
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
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
/** ลายนิ้วมือของตารางใหม่ของร้านที่ไม่ใช่ร้านชั่วคราว P2.2 (ทุกรอบ · ทุกเลน) */
async function newTablesFingerprint(): Promise<string> {
  const one = async (tb: string, has: boolean) => {
    if (!has) return `${tb}:ไม่มีตาราง`;
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(max(x."updatedAt")::text, '-') AS m FROM "${tb}" x WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = x."tenantId" AND t.slug LIKE 'posqc-p22-%')`,
      )) as Any[];
      return `${tb}:${r[0]?.n ?? "?"}@${r[0]?.m ?? "?"}`;
    } catch (e) {
      return `${tb}:err ${(e as Error).message.slice(0, 40)}`;
    }
  };
  return `${await one("PosProductChannelPrice", COL.cp)} · ${await one("PosPriceRule", COL.pr)}`;
}

// ═════════════════════════ 7. รัน ═════════════════════════
const fpBefore = await newTablesFingerprint();
let crashed = "";
const wipes: WipeReport[] = [];
try {
  await runStatic();
  await runPure(sharedMod);
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await drain();
    await sleep(300);
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = sum(wipes.map((w) => w.tenantLeft));
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
// ตารางที่ต้องอยู่ในรายการลบ (ตารางใหม่ของ P2.2 + รายการของ P2.1) — มีตารางจริงแต่ไม่ถูกนับ = ผิด
const mustTables = ["PosSale", "PosSaleLine", "PosPayment", "PosHeldCart", "SalesChannel", "OutboxEvent", "AuditLog", "AccountJournalEntry", "AccountJournalLine", ...(COL.cp ? ["PosProductChannelPrice"] : []), ...(COL.pr ? ["PosPriceRule"] : [])];
let tenantTables: string[] = [];
try {
  tenantTables = ((await P.$queryRawUnsafe(`SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenantId'`)) as Any[]).map((r: Any) => String(r.t));
} catch {
  /* ข้อมูล */
}
const notCovered = mustTables.filter((t) => !tenantTables.includes(t));
chk(
  "Z1",
  tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && notCovered.length === 0,
  "ร้านชั่วคราว 2 ร้าน 0 แถว (รวม PosProductChannelPrice/PosPriceRule) · Tenant ถูกลบ",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipes.map((w) => w.tables).join("/")} ตาราง)`, tenantLeft ? "แถว Tenant ยังอยู่" : "", wipeErr, notCovered.length ? `ตารางไม่มี tenantId: ${notCovered.join(",")}` : ""].filter(Boolean).join(" · "),
);
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
if (drift.length) console.log(`  ℹ️  ร้าน QC seed นับก่อน/หลังต่างกัน (ข้อมูล · อาจเป็น lane อื่น): ${drift.join(", ")}`);
const fpAfter = await newTablesFingerprint();
/** แถวของรอบนี้ที่หลุดออกนอกร้านชั่วคราว (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
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
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } }));
  await n("posDevice", () => P.posDevice.count({ where: { deviceCode: { contains: `qc22${RAND}` } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND } } }));
  if (COL.pr) await n("posPriceRule", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosPriceRule" WHERE name LIKE $1`, like)) as Any[])[0]?.n);
  if (COL.cp) await n("posProductChannelPrice", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosProductChannelPrice" x WHERE "createdAt" >= $1 AND NOT EXISTS (SELECT 1 FROM "PosProduct" p WHERE p.id = x."productId")`, since)) as Any[])[0]?.n);
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND "payload"::text LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("membership", () => P.membership.count({ where: { tenantId: { in: [T, T2].filter(Boolean) } } }));
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
chk(
  "Z2",
  leaks.length === 0 && fpBefore === fpAfter,
  "ไม่มีแถวของรอบนี้นอกร้านชั่วคราว · ลายนิ้วมือตารางใหม่ของร้านอื่นก่อน = หลัง",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีแถวของรอบนี้หลุด", `ตารางใหม่ร้านอื่น ${fpBefore} → ${fpAfter}`, drift.length ? `(ข้อมูล) ร้าน seed นับต่าง ${drift.length} รายการ` : "ร้าน seed นับเท่าเดิม"].join(" · "),
);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, leaks, drift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.2 (S): จอ 06/10/14 (P2.2U — visual ของผู้คุมงาน) · กติกาจากระบบการตลาด/campaignId (P3 · CD1) · ราคาของร้านอาหาร/เว็บ/QR/แชท
//   (P2.4/P2.7/P2.8 เรียก resolvePrices) · คัดลอกราคาข้ามสาขา/รายงานตามที่มาราคา (P2.11/P2.12) · ใบเสร็จไม่เปลี่ยน (CD9 — ตรวจโดยชุด P1.10/P1.11 เดิม) ·
//   MARKETING.happyHourPricing พลิกใน P2.2U (ORACLE-EDIT qc-pos-p1.18:319) · ชุดเงิน COMMON §7 รันโดยผู้สร้างก่อน/หลัง (ผลต้องเท่าเดิม)
