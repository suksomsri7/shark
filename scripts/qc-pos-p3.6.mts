// QC — POS RUN ใบ P3.6 (S): CRM — ลูกค้าองค์กรบนบิล · เครดิตเทอม (ON_ACCOUNT → ใบแจ้งหนี้ AR) · ดีลบนหน้าขายใหม่ · สมาชิกบนบิลออเดอร์
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P3.6 S · ฐาน session/pos 72669941 (ต้นไม้ผลิตภัณฑ์ c5fc223b)
// requires: (ไม่ต้อง seed — ร้านชั่วคราวของข้อสอบเอง `posqc-p36-<rand>` + `-t2` · CRM/สมุดบัญชี/สมาชิกสร้างในรอบ · ไม่เรียก seed-crm*/seed-member-qc)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.6.md ⚠️1–8 · §0 · §1 · §2 R1–R15 · §3 · §4 · §5 · **§10 มติผู้คุมงาน 1–12 (ผูกมัด · ชนะ §2/§4)** ·
//   ตารางชื่อเต็ม + drift + ORACLE-EDIT + CONTROLLER-DECISION = ledger/wo-notes/pos-P3.6-oracle.md
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง — ย่อ · ตารางเต็มในโน้ต):
//   CRM (ไฟล์ของ CRM ที่เลนนี้เขียน · R1): src/lib/modules/crm/pos-seam.ts export
//     companiesForPos({tenantId, q?, partyIds?, limit?}) → [{partyId, companyId, systemId, name, taxId, branchCode}] (ไม่เก็บ/ไม่ถูกรวม · ทุกระบบ CRM · ≤ 20)
//     companiesOfParty({tenantId, partyId}) → แถวรูปเดียวกัน (CrmContact ของ party → CrmCompanyContact ที่ endedAt ว่าง)
//     linkPosSaleSystem(ctx{tenantId, systemId}, {dealId, saleId}) · onPosSaleRefunded(ctx, {saleId, refundSaleId, satang})
//     + บล็อกเดียว `// POS P3.6 ▸ … ◂` ท้าย crm/index.ts (re-export จาก "./pos-seam" ล้วน) · บล็อกมีเครื่องหมายใน crm/payments.ts
//   POS: pos/crm-link.ts (ทางเดียวไป @/lib/modules/crm) export registerCompanySearch(ctx, actor, {q}) · registerMemberCompanies(ctx, actor, {memberId}) →
//          {ok:true, items: CompanyOption[]} · registerDealOptions(ctx, actor, {memberId?, customerPartyId?}) → {ok:true, items: PosDealOption[]} ·
//          sweepDealIntents({tenantId?, now?, deadline?}) (งานรายชั่วโมง · หน้าต่าง 7 วัน)
//        pos/credit.ts (ตัวเขียนเดียวของ PosCreditAccount) export saveCreditAccount(ctx{tenantId, systemId}, actor, {partyId, limitSatang, termDays?, active?, note?}) ·
//          listCreditAccounts(ctx, actor) · registerCreditStatus(ctx, actor, {customerPartyId, amountSatang?}) →
//          {ok:true, enabled, allowed, sufficient, termDays, dueDate} (+ limitSatang exposureSatang remainingSatang เฉพาะผู้ถือ pos.credit.manage)
//        pos/credit-shared.ts (บริสุทธิ์) export creditDueDate(paidAt: Date, termDays) → "YYYY-MM-DD" (วันไทย + วัน) · resolveCreditTermDays(account, contact, bookDefault)
//        pos/credit-actions.ts ("use server" · async ล้วน · assertCan) export saveCreditAccountAction · listCreditAccountsAction · registerCreditStatusAction
//        service.ts CreateSaleInput += customerPartyId? crmDealId? memberAttachOnly? creditOverrideByUserId? · payMethods[].type ON_ACCOUNT ·
//          PosSaleErrorCode += CREDIT_DISABLED CREDIT_NOT_ALLOWED CREDIT_TERM_ZERO CREDIT_LIMIT_EXCEEDED CREDIT_INVOICE_PAID CUSTOMER_INVALID ·
//          CREDIT_LIMIT_EXCEEDED พก .limitSatang .exposureSatang (แบบ giftCardRow) · PosSale.customerPartyId/crmDealId/creditTerms {termDays, dueDate, limitSatang, exposureSatang, overrideBy?}
//        register-shared: RegisterSubmitInput += customerPartyId? crmDealId? creditOverride?: {managerUserId, managerPin} · REGISTER_PAY_TYPES += ON_ACCOUNT ·
//          RegisterRefusalCode += 7 รหัส R15 (+ DEAL_INVALID) · refusalMessageKey ไม่ใช่ errors.unknown · refund-shared REFUND_PAY_TYPES += ON_ACCOUNT
//        settings-shared: posCreditSettings(settings) → {enabled false, requireBuyer true} · posOrderMemberOnBill(settings) → boolean (ปริยาย true)
//        reports.ts: REPORT_KINDS ต่อท้าย "credit" + CSV_HEADERS.credit + export reportCredit · permissions "pos.credit.manage" · scope PosCreditAccount: sys() · POS_MODELS posCreditAccount
//        account/index.ts applyExternalSale input onAccount?: {partyId, dueDate, termDays} + ช่อง "ON_ACCOUNT" (ขาย + คืน) · account-bridge channelOf case ON_ACCOUNT
//        audit: pos.credit.account_updated · pos.credit.override (มติ 2 — ไม่ใช่ pos.credit.over_limit ของ R6) · ป้าย th "วางบิล (เครดิตเทอม)" / en "On account"
//        facts: CRM corporateCredit true · bigBillDeal false (มติ 7)
//   ⇒ ฝั่ง U (ชิปบริษัท · แผ่นเลือก · ไทล์เครดิต · แผ่น PIN · เลือกดีล · การ์ดตั้งค่า · แท็บ 08 · บรรทัดครบกำหนด) = ใบ P3.6U + visual — ไม่อยู่ในข้อสอบนี้
//
// 🔴 กติกาข้อสอบ: SKIP เมื่อไฟล์ใหม่ของ P3.6 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · Z เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB ไม่ import อะไร · --no-db = ข้อสถิต ST1–ST4 แบบอ่านไฟล์ (ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราวลบทั้งร้านใน finally · globalThis.fetch = ตัวกั้น (503 + นับ) · ไม่ apply migration · ไม่ reseed
//    ระบาย outbox เฉพาะแถวของร้านชั่วคราว (pump ต่อ tenant แบบ qc-crm-c2.7) · เล่น event ซ้ำด้วยตัวรับตรง (replay)
//    CM1–CM2 พึ่ง P3.5 (pos/staff-commission.ts) — ไม่มีไฟล์ = SKIP-with-reason (ไม่นับแดง) · มีแล้ว = ตรวจจริง
//    SQL ดิบ/prisma ตรงเฉพาะฟิกซ์เจอร์ของร้านชั่วคราว (Party · CrmCompany/Contact/Deal/Pipeline · ผู้ติดต่อสมุด creditTermDays · ค่าตั้ง) — ไม่เขียน PosCreditAccount/AccountDocument/CrmDealPayment เอง
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p3.6";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** หมุดของเลน (มติ 10 12): ต้นไม้ที่ข้อสอบนี้เขียนเทียบ — ST1 สัญญา · ST4 ไฟล์ห้ามแตะ */
const PIN = process.env.P36_PIN || "54913c60"; // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-RP9 · merge P3.6 f6ae3054: หมุดใบ = ฐานก่อน merge 72669941 → 54913c60) ◂
const LANE_PIN = process.env.P36_LANE_PIN || "f6ae3054"; // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-RP9 · หมุดเลน = merge commit) · // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-O1: หมุดเลนแยกจากหมุดใบ — ข้อ "ไฟล์ห้ามแตะ" (ST4) เทียบ LANE_PIN · หลัง merge ผู้คุม re-pin เฉพาะ LANE_PIN (บทเรียน CD-RP4 17 ต.ค.) ◂

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต/ความเป็นส่วนตัว · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P3.6-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── CP แผ่นเลือกบริษัท (seam) ──
  D("CP1", "X2", "[R1 R14] companiesForPos ค้นด้วยชื่อ → CO1 CO2 CO4 (ไม่มี CO3 ที่เก็บแล้ว · ไม่มีบริษัทของร้าน T2) · ค้นด้วยเลขภาษี CO1 → CO1 · partyIds [P2] → CO2 เท่านั้น · limit 2 → ≤ 2 แถว"),
  D("CP2", "X2", "[R1 R14] คีย์ทุกแถว ⊆ {partyId companyId systemId name taxId branchCode} (seam + registerCompanySearch + registerMemberCompanies) · ไม่มีเบอร์/อีเมล/ผู้ติดต่อ/เงินของบริษัท"),
  D("CP3", "-", "[R1] companiesOfParty(party ของ M1) = [CO1] (ลิงก์ CO4 ที่ endedAt แล้ว = ไม่นับ) · registerMemberCompanies(M1) = [CO1]"),
  D("CP4", "X3", "[R1 ⚠️6] แคชเชียร์ไม่มีคีย์ CRM (pos.sale.create อย่างเดียว) registerCompanySearch → ได้ CO1 · ผู้ไม่มีสิทธิ์ POS → PERMISSION_DENIED · ร้าน T2 ค้นชื่อเดียวกัน → ไม่มีบริษัทของ T"),
  // ── CR เครดิตเทอม ──
  D("CR1", "X4", "[R5 R6 Q6] createSale ON_ACCOUNT ฿4,000 ของ P1 (+ crmDealId D3 + ผู้ซื้อ) → PAID · PosPayment ON_ACCOUNT แถวเดียว = ยอด · customerPartyId/crmDealId บนบิล · creditTerms {termDays 30 (ผู้ติดต่อสมุด), dueDate = วันไทยของ paidAt + 30, limitSatang 1,000,000, exposureSatang 0} · creditDueDate บริสุทธิ์ (17:30Z = วันถัดไปของไทย)"),
  D("CR2", "-", "[R4 Q6 มติ 6] ลำดับเทอม: P2 termDays 15 → +15 · P4 (ไม่มีเทอม · ไม่มีผู้ติดต่อสมุด) → ค่าปริยายสมุด 45 · P4 หลังระบาย (ผู้ติดต่อถูกสร้าง creditTermDays 0) → ยัง 45 (CD-3) · P6 termDays 0 → CREDIT_TERM_ZERO ไม่มีบิล"),
  D("CR3", "X2", "[R5] ON_ACCOUNT ไม่มี customerPartyId · Party บุคคล (M1) · Party ของร้าน T2 · id มั่ว → CUSTOMER_INVALID · บิลเงินสดที่ customerPartyId เป็นบุคคล → CUSTOMER_INVALID · ไม่มีบิล/คีย์/outbox เพิ่ม"),
  D("CR4", "X3", "[R4 R6] P3 (ไม่มีบัญชีเครดิต) · P7 (active false) → CREDIT_NOT_ALLOWED · saveCreditAccount: แคชเชียร์ → PERMISSION_DENIED · ผู้จัดการ (ปริยาย pos.credit.manage) → ok · limit 0 / termDays 366 → VALIDATION · audit pos.credit.account_updated มีครบ"),
  D("CR5", "X4", "[R6] ON_ACCOUNT ผสมเงินสด · ไม่เต็มยอด · มีทิป · มี cashTendered · sourceModule POS_DEPOSIT · ไม่มีผู้ซื้อเมื่อ requireBuyer → ปฏิเสธทุกทาง ไม่มีบิล · ตัวควบคุม: requireBuyer false → ไม่มีผู้ซื้อผ่าน"),
  D("CR6", "-", "[R3 มติ 9] posCreditSettings(undefined/{}) = {enabled false, requireBuyer true} · ค่าเพี้ยน → ปริยาย · ปิด → createSale + register ON_ACCOUNT = CREDIT_DISABLED ไม่มีบิล · registerCreditStatus.enabled false · เปิดคืน"),
  D("CR7", "X4", "[R6] วงเงิน: P1 ฿7,000 หลังบิล ฿4,000 ระบายแล้ว → CREDIT_LIMIT_EXCEEDED {limitSatang 1,000,000 · exposureSatang 400,000} ทั้ง createSale และ register (ผู้จัดการ) · ไม่มีบิล"),
  D("CR8", "X3", "[R6 มติ 2] override: createSale creditOverrideByUserId = MGR → PAID + audit pos.credit.override {saleId partyId byUserId overSatang 100,000} · = แคชเชียร์ (ไม่มี pos.credit.manage) → ยัง LIMIT · register PIN ผิด → PIN_INVALID failedCount MGR +1 ไม่มีบิล · PIN ถูก → บิล creditTerms.overrideBy = MGR"),
  D("CR9", "X4", "[R6 hunter] P5 วงเงิน ฿10,000: บิล ฿6,000 สองใบพร้อมกัน (คีย์ต่างกัน) → PAID 1 ใบพอดี · อีกใบ CREDIT_LIMIT_EXCEEDED exposureSatang 600,000 (นับบิลที่ยังไม่มีเอกสาร)"),
  // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-F1 · R1 F1 High): ผู้ติดต่อเดิมเลขภาษีเดียวกันแต่ partyId อื่นห้ามรับใบแจ้งหนี้ + ภาพหนี้ต้องนับบิล ◂
  D("CR10", "X5", "[R6 R7 CD-P36-F1] บริษัท P8 ที่สมุดมีผู้ติดต่อเดิมเลขภาษีเดียวกันของ Party อื่น (C_old) → บิลวางบิล ฿4,000 ระบาย → ใบแจ้งหนี้ผูกผู้ติดต่อของ P8 (ไม่ใช่ C_old · C_old partyId เดิม) · exposure ของ P8 = 400,000"),
  // ── AR บัญชีลูกหนี้ ──
  D("AR1", "X5", "[R7 Q4] ระบาย → เอกสารของบิล 1 ใบ = INVOICE AWAITING_PAYMENT · contactId = ผู้ติดต่อสมุดของ CO1 (partyId P1) · grandTotal = บิล · dueDate = creditTerms.dueDate · ไม่มี ABB/TAX_INVOICE ของบิล"),
  D("AR2", "X1", "[R7] JV เดียว (PosSale#id#PAID) Dr 1100 = grand ผูกผู้ติดต่อ CO1 · Cr 2200 = VAT ของ splitIncludedVat(grand, 700) · Cr รายได้ = ฐาน · ไม่มีขาเงินสด/ธนาคาร · เล่น pos.sale.paid ซ้ำ ×2 → เอกสาร/JV เท่าเดิม"),
  D("AR3", "X4", "[R7 R9] agingReport(OUT, ผู้ติดต่อ CO1) notDue = 400,000 · total = 400,000 (มีเฉพาะบิล CR1)"),
  D("AR4", "X4", "[R7] recordPayment เต็มยอด → PAID · JV AccountDocumentPayment#…#PAYMENT Dr เงิน (10xx) = grand / Cr 1100 = grand ผู้ติดต่อ CO1"),
  D("AR5", "X1", "[R7] recordPayment คีย์เดิมซ้ำ → paymentId เดิม · payment 1 แถว · JV รับเงิน 1 ใบ"),
  D("AR6", "X4", "[R7 R10 Q5] ดีล D3 (บิลเครดิต CR1) หลังรับเงิน + ระบาย: CrmDealPayment ของ D3 = POS_SALE COUNTED 400,000 แถวเดียว · ไม่มีแถว PAYMENT ของใบแจ้งหนี้ · paidSatang 400,000"),
  // ── VR void/คืนเงิน ──
  D("VR1", "X5", "[R7 R8] void บิลเครดิต P4 ที่ยังไม่รับเงิน → VOIDED · ระบาย → INVOICE VOIDED · JV ของบิลสุทธิ 1100 = 0 · exposure ของ P4 ลดเท่าบิล"),
  D("VR2", "X4", "[R8] void บิล CR1 ที่รับเงินแล้ว → CREDIT_INVOICE_PAID · บิลยัง PAID · เอกสารยัง PAID · JV/outbox pos.sale.voided ไม่เพิ่ม"),
  D("VR3", "X5", "[R7 R8] คืนบางส่วนบิล override ฿7,000 (บรรทัด ฿3,000) ด้วย ON_ACCOUNT → ใบคืน · แถวคืน ON_ACCOUNT ฿3,000 · ระบาย → CREDIT_NOTE sourceDocId = INVOICE ยอด 300,000 · ค้างของ CO1 ลด 300,000"),
  D("VR4", "X4", "[R8] คืนเงินสด/โอนบนบิลเครดิต → REFUND_METHOD_INVALID (หรือ REFUND_TENDER_MISMATCH · CD-6) · คืน ON_ACCOUNT บนบิลเงินสด → ปฏิเสธ · ไม่มีใบคืน"),
  D("VR5", "X4", "[R6 R8 ⚠️5] exposure หลังคืน: registerCreditStatus(P1) ของผู้จัดการ exposureSatang ลด 300,000 (ใบลดหนี้ถูกนับ — outstandingByContacts ไม่นับ CN)"),
  D("VR6", "X4", "[R9] กะ: บิลเครดิตบนกะ (register) → expectedCashSatang · cashSalesSatang ไม่เปลี่ยน · byMethod มี ON_ACCOUNT +1 ใบ +ยอด"),
  // ── DL ดีลบนหน้าขายใหม่ ──
  D("DL1", "X5", "[R10 Q5] submitRegisterSale ของ SALES1 + crmDealId D1 → PosSale.crmDealId = D1 · ระบาย → CrmDealPayment POS_SALE COUNTED = grand แถวเดียว · paidSatang +grand"),
  D("DL2", "X1", "[R10 X4] เล่น pos.sale.paid ของบิล DL1 ซ้ำ ×2 → ยัง 1 แถว · paidSatang เท่าเดิม"),
  D("DL3", "X2", "[R10] crmDealId = D2 (Party อื่น) · D4 (ปิดแล้ว) · id มั่ว → DEAL_INVALID · ไม่มีบิล/คีย์/outbox เพิ่ม"),
  D("DL4", "X3", "[R10 ⚠️6] registerDealOptions: แคชเชียร์ไม่มี crm.deal.update → [] · SALES1 + P1 → D1 D3 ไม่มี D2 D4 · SALES1 + M1 → มี D1 · คีย์แถว ⊆ {id systemId title valueSatang stageName}"),
  D("DL5", "X1", "[R11] คืนบางส่วนบิล DL1 → แถว POS_REFUND −ส่วน (refId = ใบคืน) · คืนที่เหลือ → Σ แถวของบิล = 0 · paidSatang กลับเท่าก่อน DL1 · เล่น pos.sale.refunded ซ้ำ → ไม่มีแถวเพิ่ม"),
  D("DL6", "X5", "[R10] สะพาน CRM ปิดตอนระบายบิลที่มี crmDealId → ไม่มีแถว · เปิดคืน + sweepDealIntents({tenantId, now}) → COUNTED 1 แถว · เรียกซ้ำ → ยัง 1"),
  // ── CM ค่าคอมฯ ไม่ซ้อน ──
  D("CM1", "X4", "[R12 มติ 10] บิลดีล DL1 (ผู้ขาย SALES1 · ค่าคอมฯ พนักงานเปิด) → PosStaffCommission ACCRUE ของบิล 0 แถว · CrmCommission ของ D1 ≥ 1 แถว (ผู้รับ SALES1) · posStaffCommission ปริยาย skipDealBills true — SKIP-with-reason จนกว่า P3.5 มี"),
  D("CM2", "X4", "[R12] บิลไม่มีดีลของ SALES1 → ACCRUE ≥ 1 (P3.5 เดิม) · skipDealBills false → บิลดีลใหม่ได้ ACCRUE — SKIP-with-reason จนกว่า P3.5 มี"),
  // ── MB สมาชิกบนบิลออเดอร์ ──
  D("MB1", "X4", "[R13 Q8] ออเดอร์ CHAT (จ่ายหน้าร้าน) + LINEMAN (PLATFORM) ของ M1 → บิล memberId M1 · tierDiscount 0 · memberBenefits null · grand = ยอดออเดอร์ · memberSnapshot.memberCode · memberOnBill false → บิลไม่มีสมาชิก · posOrderMemberOnBill ปริยาย true"),
  D("MB2", "X1", "[R13] ระบาย → แต้มของบิล (pointLedger PosSale) 1 รายการ > 0 ต่อบิล · ยอดสะสม M1 + Σ grand · เล่น pos.sale.paid ซ้ำ → เท่าเดิม"),
  D("MB3", "X4", "[R13] createSale memberAttachOnly + memberChoices · + STORE_CREDIT · ไม่มี memberId → VALIDATION ไม่มีบิล · attach-only ปกติ → tierDiscount 0 (M1 Gold 10%)"),
  D("MB4", "X5", "[R13] void บิลออเดอร์ CHAT → ระบาย → แต้มของ M1 ลดเท่าที่ได้จากบิลนั้น · ยอดสะสมกลับ"),
  D("MB5", "-", "[R13] หน้าขาย (register) ของ M1 → ส่วนลดระดับยังอยู่ (tierDiscountSatang > 0 · memberBenefits ไม่ null) — ไม่เปลี่ยน"),
  // ── PV ความเป็นส่วนตัว ──
  D("PV1", "X2", "[R14] receiptPayload / publicReceipt / billDetail ของบิลเครดิต + บิลดีล: ไม่มีเบอร์/อีเมลของ CO1 และ CT1 · ไม่มีมูลค่าดีล · ตัวควบคุม: เซนทิเนลจับแถว CrmCompany/CrmContact/CrmDeal ได้"),
  D("PV2", "X3", "[R14] registerCreditStatus แคชเชียร์ → sufficient (ไม่มี limit/exposure/remaining) · ผู้จัดการ → มีตัวเลข · register CREDIT_LIMIT_EXCEEDED ของแคชเชียร์ไม่พกตัวเลข · listCreditAccounts แคชเชียร์ → PERMISSION_DENIED"),
  D("PV3", "X2", "[R14 CRM X8] audit pos.credit.* + outbox ของร้านชั่วคราว: ไม่มีชื่อบริษัท/เบอร์/อีเมล · คีย์ after ไม่ใช่ name/phone/email/address/note/taxId"),
  // ── ST สถิต ──
  D("ST1", "S", "[R5 F15.2 R15 · ตารางชื่อ] สัญญา pos-sale-contract.json เทียบหมุด = เพิ่มอย่างเดียว + CreateSaleInput 4 ฟิลด์ optional · export ของ seam/crm-link/credit*/settings-shared/reports · RegisterSubmitInput/REGISTER_PAY_TYPES/REFUND_PAY_TYPES/รหัส+refusalMessageKey · permission · scope · POS_MODELS · account facade onAccount · ข้อความ th/en · facts"),
  D("ST2", "S", "[§3 มติ 9] migration P3.6 = 2 โฟลเดอร์ (…_pos_p36_credit_enum: ADD VALUE ON_ACCOUNT อย่างเดียว · …_pos_p36_credit: ADD COLUMN nullable 3 + CREATE TABLE PosCreditAccount + unique(systemId, partyId)) · ไม่มี DROP/UPDATE/DELETE/NOT NULL · schema เพิ่มอย่างเดียว + ฟิลด์ครบ"),
  D("ST3", "S", "[R2 R7 hard rules] POS → CRM/บัญชี ผ่าน facade เท่านั้น · crm/pos-seam.ts ไม่มี raw SQL/คำสั่งเขียน · ไฟล์ที่เปลี่ยนนอกโมดูลบัญชีไม่เขียน AccountDocument/JV · นอก CRM ไม่เขียน CrmDealPayment/CrmCommission · PosCreditAccount เขียนที่ credit.ts เท่านั้น · credit-actions \"use server\" async ล้วน + assertCan · credit-shared ไม่แตะ prisma"),
  D("ST4", "S", "[R2 S5.12 hard rule] register-ui.tsx และ shift.ts ไบต์เท่าหมุด"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) 0 แถวทุกตารางที่มี tenantId (PosSale/Payment · PosCreditAccount · AccountDocument/Payment/JV · CrmDealPayment · CrmCommission · OutboxEvent · AuditLog …) + Tenant + User ของรอบ"),
  D("Z2", "-", "ลายนิ้วมือนอกร้านชั่วคราว (แถวที่มีก่อนรอบ · id:status ของ PosSale AccountDocument AccountJournalEntry CrmDealPayment CrmCommission PosCreditAccount) เท่าเดิม"),
  // ORACLE-EDIT ผู้สร้าง P3.6U (B) 22 ต.ค. (CD-P36U-2: ตัวเขียนเดียวของ settings.pos.credit + settings.pos.orders.memberOnBill = pos/credit-settings.ts ·
  //   updatePosCreditSettings(ctx{tenantId, systemId}, actor, patch{credit?: {enabled?, requireBuyer?}, memberOnBill?}) · เจ้าของร้านเท่านั้น · ไม่ใช่ข้อยกเว้น (ข้อใหม่ล้วน — ไม่มี probe ลบ)) ◂
  D("CS1", "X5", "[CD-P36U-2] OWNER updatePosCreditSettings {credit {enabled false, requireBuyer false}, memberOnBill false} → ok + ผล = ตัวอ่าน · DB posCreditSettings/posOrderMemberOnBill ตรง · คีย์อื่นของ settings (รวม pos.orders.* อื่น) ไบต์เท่าเดิม · audit pos.settings.updated {section credit} ค่าเป็นจริง/เท็จล้วน · ตั้งคืน → ok"),
  D("CS2", "X3", "[CD-P36U-2] MANAGER (ถือ pos.credit.manage) · STAFF → PERMISSION_DENIED · settings ไม่เปลี่ยน · ไม่มี audit เพิ่ม"),
  D("CS3", "X4", "[CD-P36U-2] แพตช์ขยะ: คีย์แปลกบนสุด · credit.x · credit.enabled ไม่ใช่ boolean · memberOnBill ไม่ใช่ boolean · credit ไม่ใช่ออบเจกต์ · แพตช์ว่าง/ไม่ใช่ออบเจกต์ → VALIDATION + field (ยกเว้นไม่ใช่ออบเจกต์) · settings ไม่เปลี่ยน"),
  D("CS4", "X1", "[CD-P36U-2] แพตช์ที่ไม่เปลี่ยนอะไร (ค่าปัจจุบัน) → ok · ไม่เขียน (settings + updatedAt เท่าเดิม) · ไม่มี audit"),
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
const POS_DIR = "src/lib/modules/pos";
const F = {
  seam: "src/lib/modules/crm/pos-seam.ts",
  crmIndex: "src/lib/modules/crm/index.ts",
  crmPayments: "src/lib/modules/crm/payments.ts",
  crmLink: `${POS_DIR}/crm-link.ts`,
  credit: `${POS_DIR}/credit.ts`,
  creditShared: `${POS_DIR}/credit-shared.ts`,
  creditActions: `${POS_DIR}/credit-actions.ts`,
  service: `${POS_DIR}/service.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  refundShared: `${POS_DIR}/refund-shared.ts`,
  setShared: `${POS_DIR}/settings-shared.ts`,
  reports: `${POS_DIR}/reports.ts`,
  accBridge: `${POS_DIR}/account-bridge.ts`,
  regUi: `${POS_DIR}/register-ui.tsx`,
  shift: `${POS_DIR}/shift.ts`,
  staffComm: `${POS_DIR}/staff-commission.ts`,
  accIndex: "src/lib/modules/account/index.ts",
  perms: "src/lib/core/permissions.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  facts: "src/lib/pos-integrations.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  migDir: "prisma/migrations",
  schemaDir: "prisma/schema",
  posPrisma: "prisma/schema/pos.prisma",
};
const SEAM_EXPORTS = ["companiesForPos", "companiesOfParty", "linkPosSaleSystem", "onPosSaleRefunded"];
const CRM_LINK_EXPORTS = ["registerCompanySearch", "registerMemberCompanies", "registerDealOptions", "sweepDealIntents"];
const CREDIT_EXPORTS = ["saveCreditAccount", "listCreditAccounts", "registerCreditStatus"];
const CREDIT_SHARED_EXPORTS = ["creditDueDate", "resolveCreditTermDays"];
const CREDIT_ACTION_EXPORTS = ["saveCreditAccountAction", "listCreditAccountsAction", "registerCreditStatusAction"];
const CREATE_SALE_NEW = ["customerPartyId", "crmDealId", "memberAttachOnly", "creditOverrideByUserId"];
const SUBMIT_NEW = ["customerPartyId", "crmDealId", "creditOverride"];
const CREDIT_CODES = ["CREDIT_DISABLED", "CREDIT_NOT_ALLOWED", "CREDIT_TERM_ZERO", "CREDIT_LIMIT_EXCEEDED", "CREDIT_INVOICE_PAID", "CUSTOMER_INVALID"];
const REG_CODES = [...CREDIT_CODES, "DEAL_INVALID"];
const COMPANY_KEYS = ["partyId", "companyId", "systemId", "name", "taxId", "branchCode"];
const DEAL_OPTION_KEYS = ["id", "systemId", "title", "valueSatang", "stageName"];
const CREDIT_NUMBER_KEYS = ["limitSatang", "exposureSatang", "remainingSatang"];
const LABEL_TH = "วางบิล (เครดิตเทอม)";
const LABEL_PATHS = [["shift", "method"], ["report", "closeDay", "method"], ["receipt", "public", "pay"]];
const AUDIT_UPDATED = "pos.credit.account_updated";
const AUDIT_OVERRIDE = "pos.credit.override"; // มติ 2 (§10 ชนะ R6 "pos.credit.over_limit")
const PII_KEY_RE = /name|phone|email|address|note|taxId/i;

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string; skipped?: boolean }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P3.6-") ? id : `P3.6-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  if (results.has(full)) console.log(`  (ซ้ำ) ${full} ถูกบันทึกแล้ว — ใช้ผลล่าสุด`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** SKIP-with-reason (ไม่นับแดง · รายงานใน JSON_SUMMARY.skippedIds) — ใช้เฉพาะ CM1–CM2 ที่พึ่ง P3.5 */
function skipChk(id: string, reason: string): void {
  const full = `P3.6-${id}`;
  results.set(full, { ok: true, expected: "-", actual: reason, skipped: true });
  console.log(`  ⏭️  [${full}] SKIP-with-reason: ${reason}`);
}
const rd = (p: string) => {
  const abs = p.startsWith("/") ? p : join(ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
};
const ex = (p: string) => existsSync(join(ROOT, p));
const short = (v: unknown, n = 160) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const J = (v: unknown) => short(v, 100_000);
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
const exportsName = (src: string, n: string) =>
  new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
/** ตัวของ const/type ที่ประกาศ (ถึง `;` แรกที่ระดับบนสุดโดยประมาณ — พอสำหรับตรวจชื่อ) */
function declBody(src: string, head: RegExp, max = 6000): string {
  const m = head.exec(src);
  if (!m) return "";
  const rest = src.slice(m.index, m.index + max);
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === ";" && depth <= 0) return rest.slice(0, i);
  }
  return rest;
}
/** ไฟล์ที่เปลี่ยน/เพิ่มเทียบหมุด (รวม untracked) */
function changedSincePin(): string[] | null {
  const changed = gitStr(["diff", "--name-only", PIN]);
  if (changed === null) return null;
  const untracked = gitStr(["ls-files", "--others", "--exclude-standard"]) ?? "";
  return [...new Set([...changed.split("\n"), ...untracked.split("\n")].map((x) => x.trim()).filter(Boolean))];
}
/** // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-O1 · กัน W21): hunk ของไฟล์ร้อนเทียบหมุด แยกเป็น "ของใบนี้" (ทุกบรรทัดที่เพิ่มอยู่ในบล็อก `POS P3.6 ▸ … ◂` หรือมีเครื่องหมายนั้น) ·
 *  "ของใบอื่น" (ทุกบรรทัดที่เพิ่มอยู่ในบล็อก `POS P<อื่น> ▸ … ◂` ของใบที่ merge ก่อน/หลัง — ไม่นับ ไม่ตรวจ · oracle ของใบนั้นตรวจเอง) · "หลงทาง" (บรรทัดไม่ว่างที่ไม่อยู่ในบล็อกใด = แดง) ·
 *  บรรทัดที่ถูกลบนับเฉพาะใน hunk ของใบนี้ · probe ลบ: บรรทัดไม่ marked นอกบล็อกต้องทำให้ stray > 0 ◂ */
function ownHunks(file: string): { own: { added: string[]; removed: string[] }[]; other: number; stray: number } | null {
  const d = gitStr(["diff", "-U0", PIN, "--", file]);
  if (d === null) return null;
  const OWN = /POS P3\.6 ▸/;
  const ANY = /POS (P\d+(?:\.\d+)?U?|HF-[A-Z0-9]+|P\d+-[A-Z]+) ▸/;
  const res = { own: [] as { added: string[]; removed: string[] }[], other: 0, stray: 0 };
  let cur: { added: string[]; removed: string[]; ownL: number; otherL: number; strayL: number } | null = null;
  let inOwn = false;
  let inOther = false;
  const flush = () => {
    if (!cur) return;
    if (cur.strayL > 0) res.stray += cur.strayL;
    else if (cur.ownL > 0) res.own.push({ added: cur.added, removed: cur.removed });
    else if (cur.otherL > 0) res.other++;
    else if (cur.removed.some((l) => l.trim())) res.stray++; // hunk ที่มีแต่บรรทัดถูกลบ ไม่มีเครื่องหมายใด = หลงทาง
    cur = null;
  };
  for (const l of d.split("\n")) {
    if (l.startsWith("@@")) { flush(); cur = { added: [], removed: [], ownL: 0, otherL: 0, strayL: 0 }; continue; }
    if (!cur || l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("-")) { cur.removed.push(l.slice(1)); continue; }
    if (!l.startsWith("+")) continue;
    const b = l.slice(1);
    cur.added.push(b);
    const isOwn = OWN.test(b);
    const isAny = ANY.test(b);
    const opens0 = b.includes("▸") && !b.includes("◂"); // ▸ ไม่มี ◂ = เปิดบล็อกหลายบรรทัด · เครื่องหมายบรรทัดเดียว (▸ … ◂) ไม่เปลี่ยนสถานะ
    if (isOwn && opens0) inOwn = true;
    else if (isAny && opens0) inOther = true;
    if (b.trim() !== "") {
      if (inOwn || isOwn) cur.ownL++;
      else if (inOther || isAny) cur.otherL++;
      else cur.strayL++;
    }
    if (b.includes("◂") && !b.includes("▸")) { inOwn = false; inOther = false; } // ◂ ไม่มี ▸ = ปิดบล็อกหลายบรรทัด
  }
  flush();
  return res;
}
const getPath = (o: Any, path: string[]): Any => path.reduce((a, k) => (isRecord(a) ? a[k] : undefined), o);
const hasThai = (s: string) => /[฀-๿]/.test(s);
/** เลขผู้เสียภาษีไทยที่ checksum ถูก (12 หลัก + หลักตรวจ) */
function taxIdOf(first12: string): string {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (s % 11)) % 10);
}
const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
const DAY_MS = 86_400_000;
const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** dueDate ของเอกสาร (DateTime) เทียบวันไทย — เก็บได้ทั้ง "เที่ยงคืนไทย" หรือ "เที่ยงคืน UTC ของวันนั้น" */
const sameDay = (d: unknown, ymd: string) => {
  if (!d) return false;
  const t = new Date(d as string);
  return bkkYmd(t) === ymd || t.toISOString().slice(0, 10) === ymd;
};

const skipReasons: string[] = [];
for (const f of [F.seam, F.crmLink, F.credit, F.creditShared, F.creditActions]) if (!ex(f)) skipReasons.push(`${f} ยังไม่มี`);
const P35_MISSING = !ex(F.staffComm) ? `${F.staffComm} (P3.5 S) ยังไม่มี — R12 skipDealBills ตรวจหลัง P3.5 merge (มติ 10)` : "";

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
const stNotes: Record<string, string[]> = {};
function runStatic(): void {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · หมุด ${PIN}) ──`);
  // ── ST1 สัญญา + ตารางชื่อ ──
  {
    const p: string[] = [];
    // a) pos-sale-contract.json: ของเดิมทุกคีย์คงเดิม · ของใหม่ optional · CreateSaleInput มี 4 ฟิลด์
    const pinRaw = gitStr(["show", `${PIN}:${F.contract}`]);
    let cPin: Any = null;
    let cNow: Any = null;
    try {
      cPin = JSON.parse(pinRaw ?? "");
      cNow = JSON.parse(rd(F.contract));
    } catch {
      p.push("อ่าน pos-sale-contract.json (หมุด/ปัจจุบัน) ไม่ได้");
    }
    if (cPin && cNow) {
      for (const fn of Object.keys(cPin.functions ?? {})) if (J(cPin.functions[fn]) !== J(cNow.functions?.[fn])) p.push(`สัญญาฟังก์ชัน ${fn} เปลี่ยน`);
      for (const ty of Object.keys(cPin.types ?? {})) {
        const a = cPin.types[ty] ?? {};
        const b = cNow.types?.[ty] ?? {};
        for (const k of Object.keys(a)) if (J(a[k]) !== J(b[k])) p.push(`${ty}.${k} เปลี่ยน/หาย`);
        for (const k of Object.keys(b)) if (!(k in a) && b[k]?.optional !== true) p.push(`${ty}.${k} ใหม่แต่ไม่ optional`);
      }
      const csi = cNow.types?.CreateSaleInput ?? {};
      for (const k of CREATE_SALE_NEW) if (csi[k]?.optional !== true) p.push(`สัญญา CreateSaleInput.${k} ไม่มี/ไม่ optional`);
    }
    // b) service.ts: ชนิด input + รหัส
    const svc = srcOf(F.service);
    const csiBody = declBody(svc, /export\s+type\s+CreateSaleInput\s*=/, 20_000);
    for (const k of CREATE_SALE_NEW) if (!new RegExp(`\\b${k}\\?\\s*:`).test(csiBody)) p.push(`CreateSaleInput ไม่มี ${k}?`);
    if (!/["']ON_ACCOUNT["']/.test(declBody(svc, /export\s+const\s+PAY_TYPE_ORDER\b[^=]*=/))) p.push("PAY_TYPE_ORDER ไม่มี ON_ACCOUNT");
    const lbl = /\bON_ACCOUNT\s*:\s*["']([^"']*)["']/.exec(declBody(svc, /export\s+const\s+PAY_TYPE_LABEL_TH\b[^=]*=/))?.[1];
    if (lbl !== LABEL_TH) p.push(`PAY_TYPE_LABEL_TH.ON_ACCOUNT = ${short(lbl ?? "ไม่มี", 30)} (คาด "${LABEL_TH}")`);
    const errBody = declBody(svc, /export\s+type\s+PosSaleErrorCode\s*=/);
    for (const c of CREDIT_CODES) if (!new RegExp(`["']${c}["']`).test(errBody)) p.push(`PosSaleErrorCode ไม่มี ${c}`);
    // c) register-shared
    const rs = srcOf(F.regShared);
    const subBody = declBody(rs, /export\s+type\s+RegisterSubmitInput\s*=/);
    for (const k of SUBMIT_NEW) if (!new RegExp(`\\b${k}\\?\\s*:`).test(subBody)) p.push(`RegisterSubmitInput ไม่มี ${k}?`);
    if (!/["']ON_ACCOUNT["']/.test(declBody(rs, /export\s+const\s+REGISTER_PAY_TYPES\s*=/))) p.push("REGISTER_PAY_TYPES ไม่มี ON_ACCOUNT");
    const rcBody = declBody(rs, /export\s+type\s+RegisterRefusalCode\s*=/);
    const keyBody = declBody(rs, /const\s+REFUSAL_KEY\b[^=]*=/, 12_000);
    for (const c of REG_CODES) {
      if (!new RegExp(`["']${c}["']`).test(rcBody)) p.push(`RegisterRefusalCode ไม่มี ${c}`);
      if (!new RegExp(`\\b${c}\\s*:`).test(keyBody)) p.push(`REFUSAL_KEY ไม่มี ${c}`);
    }
    if (!/["']ON_ACCOUNT["']/.test(declBody(srcOf(F.refundShared), /export\s+const\s+REFUND_PAY_TYPES\s*=/))) p.push("REFUND_PAY_TYPES ไม่มี ON_ACCOUNT");
    // d) ไฟล์ใหม่ + export
    const need = (file: string, names: string[]) => {
      const s = srcOf(file);
      if (!s) return p.push(`ไม่มี ${file}`);
      for (const n of names) if (!exportsName(s, n)) p.push(`${file.split("/").pop()} ไม่ export ${n}`);
    };
    need(F.seam, SEAM_EXPORTS);
    need(F.crmLink, CRM_LINK_EXPORTS);
    need(F.credit, CREDIT_EXPORTS);
    need(F.creditShared, CREDIT_SHARED_EXPORTS);
    need(F.creditActions, CREDIT_ACTION_EXPORTS);
    const ss = srcOf(F.setShared);
    for (const n of ["posCreditSettings", "posOrderMemberOnBill"]) if (!exportsName(ss, n)) p.push(`settings-shared ไม่ export ${n}`);
    // e) crm/index.ts: บล็อกเดียว POS P3.6 ท้ายไฟล์ · re-export ./pos-seam ล้วน · ไม่มีบรรทัดถูกลบ
    {
      const oh = ownHunks(F.crmIndex); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-O1: เทียบ hunk ของใบนี้เท่านั้น · hunk ในบล็อกของใบอื่นไม่นับ · บรรทัดนอกบล็อก = แดง ◂
      const ar = oh ? { added: oh.own.flatMap((h) => h.added), removed: oh.own.flatMap((h) => h.removed), hunks: oh.own.length } : null;
      if (!oh || !ar) p.push("git diff crm/index.ts ไม่ได้");
      else if (oh.stray) p.push(`crm/index.ts มีบรรทัดเปลี่ยนนอกบล็อกที่มีเครื่องหมาย ${oh.stray} จุด`);
      else if (!ar.added.length) p.push("crm/index.ts ยังไม่มีบล็อก POS P3.6");
      else {
        if (ar.removed.length) p.push(`crm/index.ts ลบบรรทัดเดิม ${ar.removed.length}`);
        if (ar.hunks !== 1) p.push(`crm/index.ts hunk ของใบนี้ ${ar.hunks} (คาด 1 บล็อก)`);
        if (!ar.added.some((l) => /POS P3\.6 ▸/.test(l)) || !ar.added.some((l) => /◂/.test(l))) p.push("crm/index.ts ไม่มีเครื่องหมาย // POS P3.6 ▸ … ◂");
        const code = stripComments(ar.added.join("\n")).split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
        const stmts = code.split(";").map((s) => s.trim()).filter(Boolean);
        const bad = stmts.filter((s) => !/^export\s+(type\s+)?(\*\s+as\s+\w+|\{[^}]*\})\s+from\s+["']\.\/pos-seam["']$/.test(s));
        if (bad.length) p.push(`crm/index.ts บล็อกไม่ใช่ re-export ./pos-seam: ${short(bad[0], 70)}`);
        const tail = stripComments(rd(F.crmIndex)).trimEnd().split("\n").slice(-3).join(" ");
        if (!/pos-seam/.test(tail)) p.push("บล็อก POS P3.6 ไม่อยู่ท้าย crm/index.ts");
      }
    }
    // f) payments.ts: บล็อกมีเครื่องหมาย (ไม่มีบรรทัดถูกลบ)
    {
      const oh = ownHunks(F.crmPayments); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-O1 ◂
      const ar = oh ? { added: oh.own.flatMap((h) => h.added), removed: oh.own.flatMap((h) => h.removed) } : null;
      if (oh && oh.stray) p.push(`crm/payments.ts มีบรรทัดเปลี่ยนนอกบล็อกที่มีเครื่องหมาย ${oh.stray} จุด`);
      if (ar && ar.added.length && (!ar.added.some((l) => /POS P3\.6 ▸/.test(l)) || ar.removed.filter((l) => l.trim()).length)) p.push("crm/payments.ts แก้นอกบล็อก // POS P3.6 ▸ … ◂ (มีบรรทัดถูกลบ/ไม่มีเครื่องหมาย)");
    }
    // g) reports · permission · scope · POS_MODELS
    const rep = srcOf(F.reports);
    const kinds = declBody(rep, /export\s+const\s+REPORT_KINDS\s*=/);
    const kindList = [...kinds.matchAll(/["']([a-z]+)["']/g)].map((m) => m[1]!);
    if (kindList[kindList.length - 1] !== "credit") p.push(`REPORT_KINDS ไม่ได้ต่อท้าย "credit" (${kindList.slice(-2).join(",")})`);
    if (!/\bcredit\s*:/.test(declBody(rep, /export\s+const\s+CSV_HEADERS\b[^=]*=/, 20_000))) p.push("CSV_HEADERS ไม่มี credit");
    if (!exportsName(rep, "reportCredit")) p.push("reports.ts ไม่ export reportCredit");
    if (!/["']pos\.credit\.manage["']\s*:\s*["'][^"']*[฀-๿]/.test(srcOf(F.perms))) p.push("permissions.ts ไม่มี pos.credit.manage (ป้ายไทย)");
    if (!/\bPosCreditAccount\s*:\s*sys\(\)/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosCreditAccount: sys()");
    if (!/\bposCreditAccount\s*:\s*\{\s*model\s*:\s*["']PosCreditAccount["']/.test(rd(F.qcEnv))) p.push("pos-qc-env POS_MODELS ไม่มี posCreditAccount");
    // h) บัญชี: onAccount + ช่อง ON_ACCOUNT (ขาย + คืน) · channelOf
    const acc = srcOf(F.accIndex);
    if (!/\bonAccount\?\s*:/.test(declBody(acc, /export\s+async\s+function\s+applyExternalSale\s*\(/, 12_000))) p.push("applyExternalSale ไม่มี onAccount?");
    if ((acc.match(/["']ON_ACCOUNT["']/g) ?? []).length < 2) p.push("account/index.ts ไม่มีช่อง \"ON_ACCOUNT\" (ขาย + คืน)");
    if (!/case\s+["']ON_ACCOUNT["']/.test(srcOf(F.accBridge))) p.push("account-bridge channelOf ไม่มี case ON_ACCOUNT");
    // i) ข้อความ th/en
    for (const [file, th] of [[F.msgTh, true], [F.msgEn, false]] as const) {
      let m: Any = null;
      try {
        m = JSON.parse(rd(file));
      } catch {
        p.push(`อ่าน ${file} ไม่ได้`);
        continue;
      }
      const pos = isRecord(m?.pos) ? m.pos : m;
      for (const path of [["register", "credit"], ["register", "deal"], ["settings", "credit"]]) {
        const v = getPath(pos, path);
        if (!isRecord(v) || !Object.keys(v).length) p.push(`${th ? "th" : "en"} ไม่มี pos.${path.join(".")}.*`);
      }
      if (!isRecord(getPath(pos, ["report", "credit"])) && !isRecord(getPath(pos, ["reports", "credit"]))) p.push(`${th ? "th" : "en"} ไม่มี pos.report(s).credit.*`);
      for (const path of LABEL_PATHS) {
        const v = getPath(pos, [...path, "ON_ACCOUNT"]);
        if (typeof v !== "string") p.push(`${th ? "th" : "en"} ไม่มี pos.${path.join(".")}.ON_ACCOUNT`);
        else if (th && (!v.includes("วางบิล") || v.includes("เครดิตร้าน"))) p.push(`th ${path.join(".")}.ON_ACCOUNT = "${v}" (คาด "${LABEL_TH}" · ห้าม "เครดิตร้าน")`);
        else if (!th && (!/on account/i.test(v) || hasThai(v))) p.push(`en ${path.join(".")}.ON_ACCOUNT = "${v}" (คาด "On account")`);
      }
      for (const k of ["credit", "deal"]) {
        const blk = getPath(pos, ["register", k]);
        if (isRecord(blk) && !th && hasThai(JSON.stringify(blk))) p.push(`en pos.register.${k} มีอักษรไทย`);
        if (isRecord(blk) && th && !hasThai(JSON.stringify(blk))) p.push(`th pos.register.${k} ไม่มีอักษรไทย`);
      }
    }
    // j) facts
    const facts = srcOf(F.facts);
    const crmRow = /CRM\s*:\s*\[([^\n]*)\]\s*,?/.exec(facts)?.[1] ?? "";
    if (!/\[\s*["']corporateCredit["']\s*,\s*true\s*,\s*null\s*\]/.test(crmRow)) p.push("facts CRM corporateCredit ยังไม่ true/null");
    if (!/\[\s*["']bigBillDeal["']\s*,\s*false\s*,/.test(crmRow)) p.push("facts CRM bigBillDeal ต้องคง false (มติ 7)");
    stNotes.ST1 = p;
  }
  // ── ST2 migration + schema ──
  {
    const p: string[] = [];
    const dirs = existsSync(join(ROOT, F.migDir)) ? readdirSync(join(ROOT, F.migDir)) : [];
    const p36 = dirs.filter((d) => /_pos_p36_/.test(d)).sort();
    const enumDir = p36.find((d) => /^\d{14}_pos_p36_credit_enum$/.test(d));
    const tableDir = p36.find((d) => /^\d{14}_pos_p36_credit$/.test(d));
    if (!enumDir) p.push("ไม่มีโฟลเดอร์ …_pos_p36_credit_enum");
    if (!tableDir) p.push("ไม่มีโฟลเดอร์ …_pos_p36_credit");
    const extra = p36.filter((d) => d !== enumDir && d !== tableDir);
    if (extra.length) p.push(`migration P3.6 เกิน: ${extra.join(",")}`);
    if (enumDir && tableDir && enumDir.slice(0, 14) >= tableDir.slice(0, 14)) p.push("ADD VALUE ต้องมาก่อนตาราง (timestamp)");
    const stmts = (dir: string) =>
      stripComments(rd(`${F.migDir}/${dir}/migration.sql`).replace(/--[^\n]*/g, ""))
        .split(";")
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    const BAN = /\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME|ALTER\s+COLUMN|SET\s+NOT\s+NULL)\b/i;
    if (enumDir) {
      const s = stmts(enumDir);
      if (!s.some((x) => /^ALTER TYPE "PosPayType" ADD VALUE (IF NOT EXISTS )?'ON_ACCOUNT'$/i.test(x))) p.push("enum migration ไม่มี ALTER TYPE \"PosPayType\" ADD VALUE 'ON_ACCOUNT'");
      const other = s.filter((x) => !/^ALTER TYPE "PosPayType" ADD VALUE (IF NOT EXISTS )?'ON_ACCOUNT'$/i.test(x) && !/^SET lock_timeout/i.test(x));
      if (other.length) p.push(`enum migration มีคำสั่งอื่น: ${short(other[0], 70)}`);
    }
    if (tableDir) {
      const s = stmts(tableDir);
      const bad = s.filter((x) => BAN.test(x) || /ON_ACCOUNT/.test(x));
      if (bad.length) p.push(`table migration มีคำสั่งต้องห้าม: ${short(bad[0], 70)}`);
      const alter = s.filter((x) => /^ALTER TABLE "PosSale"/i.test(x));
      const cols = alter.flatMap((x) => [...x.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"(\w+)" ([A-Z]+)([^,]*)/gi)].map((m) => [m[1]!, m[2]!.toUpperCase(), m[3]!] as const));
      const want: Record<string, string> = { customerPartyId: "TEXT", crmDealId: "TEXT", creditTerms: "JSONB" };
      for (const [c, t] of Object.entries(want)) {
        const hit = cols.find((x) => x[0] === c);
        if (!hit) p.push(`ไม่มี ADD COLUMN "${c}"`);
        else if (hit[1] !== t || /NOT NULL|DEFAULT/i.test(hit[2])) p.push(`"${c}" ${hit[1]}${hit[2]} (คาด ${t} nullable ไม่มี DEFAULT)`);
      }
      const extraCols = cols.filter((x) => !(x[0] in want));
      if (extraCols.length) p.push(`PosSale คอลัมน์เกิน: ${extraCols.map((x) => x[0]).join(",")}`);
      if (!s.some((x) => /^CREATE TABLE (IF NOT EXISTS )?"PosCreditAccount"/i.test(x))) p.push("ไม่มี CREATE TABLE \"PosCreditAccount\"");
      if (!s.some((x) => /^CREATE UNIQUE INDEX .* ON "PosCreditAccount" ?\( ?"systemId", ?"partyId" ?\)$/i.test(x))) p.push("ไม่มี UNIQUE (systemId, partyId) ของ PosCreditAccount");
      const unknown = s.filter((x) => !/^(SET lock_timeout|ALTER TABLE "PosSale" ADD COLUMN|CREATE TABLE (IF NOT EXISTS )?"PosCreditAccount"|CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?"?\w+"? ON "PosCreditAccount")/i.test(x));
      if (unknown.length) p.push(`table migration คำสั่งนอกแผน: ${short(unknown[0], 70)}`);
    }
    // migration อื่นหลังหมุดที่แตะของ P3.6 = ผิดที่
    const pinDirs = new Set((gitStr(["ls-tree", "--name-only", `${PIN}:${F.migDir}`]) ?? "").split("\n").map((x) => x.trim()).filter(Boolean));
    for (const d of dirs.filter((x) => !pinDirs.has(x) && !p36.includes(x))) {
      const sql = rd(`${F.migDir}/${d}/migration.sql`);
      if (/PosCreditAccount|'ON_ACCOUNT'|"customerPartyId"|"crmDealId"|"creditTerms"/.test(sql)) p.push(`${d} แตะของ P3.6 (ต้องอยู่ในโฟลเดอร์ p36)`);
    }
    // schema: เพิ่มอย่างเดียว + ฟิลด์ครบ
    const d = gitStr(["diff", "-U0", PIN, "--", F.schemaDir]);
    if (d === null) p.push("git diff prisma/schema ไม่ได้");
    else {
      const removed = d.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim() && !/^\s*\/\//.test(l.slice(1)));
      if (removed.length) p.push(`schema ลบ/แก้บรรทัดเดิม ${removed.length}: ${short(removed[0], 60)}`);
    }
    const pp = rd(F.posPrisma);
    if (!/enum\s+PosPayType\s*\{[^}]*\bON_ACCOUNT\b/.test(pp)) p.push("enum PosPayType ไม่มี ON_ACCOUNT");
    const model = /model\s+PosCreditAccount\s*\{([^}]*)\}/.exec(pp)?.[1] ?? "";
    if (!model) p.push("ไม่มี model PosCreditAccount");
    else {
      const fields: [string, RegExp][] = [
        ["tenantId", /\btenantId\s+String\b(?!\?)/],
        ["systemId", /\bsystemId\s+String\b(?!\?)/],
        ["partyId", /\bpartyId\s+String\b(?!\?)/],
        ["limitSatang", /\blimitSatang\s+Int\b(?!\?)/],
        ["termDays", /\btermDays\s+Int\?/],
        ["active", /\bactive\s+Boolean\b/],
        ["note", /\bnote\s+String\?/],
        ["updatedById", /\bupdatedById\s+String\b/],
        ["updatedAt", /\bupdatedAt\s+DateTime\b/],
        ["@@unique([systemId, partyId])", /@@unique\(\s*\[\s*systemId\s*,\s*partyId\s*\]\s*\)/],
      ];
      for (const [n, re] of fields) if (!re.test(model)) p.push(`PosCreditAccount ไม่มี ${n}`);
    }
    const sale = /model\s+PosSale\s*\{([\s\S]*?)\n\}/.exec(pp)?.[1] ?? "";
    for (const [n, re] of [["customerPartyId String?", /\bcustomerPartyId\s+String\?/], ["crmDealId String?", /\bcrmDealId\s+String\?/], ["creditTerms Json?", /\bcreditTerms\s+Json\?/]] as const)
      if (!re.test(sale)) p.push(`PosSale ไม่มี ${n}`);
    stNotes.ST2 = p;
  }
  // ── ST3 เส้นข้ามโมดูล + ผู้เขียนเดียว ──
  {
    const p: string[] = [];
    for (const f of walk(POS_DIR)) {
      const c = srcOf(f);
      if (/["']@\/lib\/modules\/crm\//.test(c)) p.push(`${f.replace(`${POS_DIR}/`, "")} import CRM แบบ subpath`);
      if (/["']@\/lib\/modules\/account\//.test(c)) p.push(`${f.replace(`${POS_DIR}/`, "")} import บัญชีแบบ subpath`);
    }
    const link = srcOf(F.crmLink);
    if (link && !/["']@\/lib\/modules\/crm["']/.test(link)) p.push("crm-link.ts ไม่ได้เรียก CRM ผ่าน \"@/lib/modules/crm\"");
    const seam = srcOf(F.seam);
    if (seam) {
      if (/\$(executeRaw|queryRaw)/.test(seam)) p.push("pos-seam.ts มี raw SQL");
      if (/\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(seam)) p.push("pos-seam.ts เขียนตารางเอง (ต้องผ่านภายในของ CRM เดิม)");
      if (/["']@\/lib\/modules\/pos/.test(seam)) p.push("pos-seam.ts import โมดูล POS (ทิศกลับ)");
    }
    const changed = changedSincePin();
    if (!changed) p.push(`git diff ${PIN} ไม่ได้`);
    const WRITE = (model: string) => new RegExp(`\\.${model}\\s*\\.\\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\\s*\\(`);
    for (const f of (changed ?? []).filter((x) => /^src\/.*\.(ts|tsx)$/.test(x) && ex(x))) {
      const c = srcOf(f);
      if (!f.startsWith("src/lib/modules/account/")) {
        for (const m of ["accountDocument", "accountJournalEntry", "accountJournalLine", "accountDocumentPayment"]) if (WRITE(m).test(c)) p.push(`${f} เขียน ${m} (ต้องผ่านฟังก์ชันบัญชี)`);
        if (/(INSERT\s+INTO|UPDATE)\s+"Account(Document|JournalEntry|JournalLine)"/i.test(c)) p.push(`${f} เขียนตารางบัญชีด้วย SQL`);
      }
      if (!f.startsWith("src/lib/modules/crm/")) {
        for (const m of ["crmDealPayment", "crmCommission"]) if (WRITE(m).test(c)) p.push(`${f} เขียน ${m} (ต้องผ่านฟังก์ชัน CRM)`);
      }
    }
    for (const f of walk("src")) {
      if (f === F.credit) continue;
      const c = srcOf(f);
      if (WRITE("posCreditAccount").test(c) || /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"PosCreditAccount"/i.test(c)) p.push(`${f} เขียน PosCreditAccount (ผู้เขียนเดียว = credit.ts)`);
    }
    for (const f of [F.seam, F.crmLink, F.credit, F.creditShared, F.creditActions]) if (!ex(f)) p.push(`ไม่มี ${f.split("/").slice(-2).join("/")}`);
    const ca = rd(F.creditActions);
    if (ca) {
      const head = ca.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use server["']/.test(head)) p.push("credit-actions.ts ไม่ขึ้นต้น \"use server\"");
      const s = stripComments(ca);
      const nonAsync = [...s.matchAll(/^\s*export\s+(?!async\s+function)(\w+(?:\s+\w+)?)/gm)].map((m) => m[1]);
      if (nonAsync.length) p.push(`credit-actions.ts export ที่ไม่ใช่ async function: ${nonAsync.join(",")}`);
      if (!/\bassertCan\s*\(/.test(s)) p.push("credit-actions.ts ไม่มี assertCan");
    }
    const cs = srcOf(F.creditShared);
    if (cs && /["']@\/lib\/core\/db["']|\bprisma\b|["']server-only["']|["']@prisma\/client["']/.test(cs)) p.push("credit-shared.ts แตะ prisma/db/server-only");
    stNotes.ST3 = p;
  }
  // ── ST4 ไฟล์ห้ามแตะ ──
  {
    const p: string[] = [];
    for (const f of [F.regUi, F.shift]) {
      const d = gitStr(["diff", "--stat", LANE_PIN, "--", f]); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-O1: LANE_PIN ◂
      if (d === null) p.push(`git diff ${f} ไม่ได้`);
      else if (d.trim()) p.push(`${f} ถูกแก้ (${d.trim().split("\n").pop()})`);
      if (!ex(f)) p.push(`${f} หาย`);
    }
    stNotes.ST4 = p;
  }
}
function finishStatic(): void {
  for (const id of ["ST1", "ST2", "ST3", "ST4"]) {
    const p = stNotes[id] ?? ["ไม่ได้ตรวจ"];
    if (process.env.P36_ST_ALL === "1") for (const x of p) console.log(`     · ${id}: ${x}`);
    chk(id, p.length === 0, "ตามตารางชื่อ", joinP(p));
  }
}
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4"].map((x) => `P3.6-${x}`);

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
const RUN_START = new Date();
const FP_TABLES: [string, string][] = [["PosSale", "status"], ["AccountDocument", "status"], ["AccountJournalEntry", "status"], ["CrmDealPayment", "status"], ["CrmCommission", "status"], ["PosCreditAccount", "active"]];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE x."createdAt" < $2 AND NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE $1))`,
        TEMP_LIKE,
        RUN_START,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      const m = (e as Error).message;
      out[tb] = /does not exist|ไม่มี/i.test(m) ? "absent" : `err:${m.slice(0, 30)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3.6 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · Z เขียว)`);
const fpBefore = await fingerprint();
// โครงสร้าง DB ที่ migration ของ P3.6 ต้องมี (ข้อสอบไม่ apply migration — ไม่มี = แดงตามเหตุผล)
const dbHas = { enumOnAccount: false, creditTable: false, saleCols: false };
try {
  dbHas.enumOnAccount = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PosPayType' AND e.enumlabel = 'ON_ACCOUNT'`)) as Any[])[0]?.n ?? 0) > 0;
  dbHas.creditTable = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'PosCreditAccount'`)) as Any[])[0]?.n ?? 0) > 0;
  dbHas.saleCols =
    Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'PosSale' AND column_name IN ('customerPartyId', 'crmDealId', 'creditTerms')`)) as Any[])[0]?.n ?? 0) === 3;
} catch (e) {
  console.log(`  (อ่านโครงสร้าง DB ไม่ได้: ${(e as Error).message.slice(0, 80)})`);
}
const NDB = (): string =>
  [!dbHas.enumOnAccount ? "DB ไม่มี PosPayType.ON_ACCOUNT" : "", !dbHas.creditTable ? "DB ไม่มีตาราง PosCreditAccount" : "", !dbHas.saleCols ? "DB ไม่มีคอลัมน์ PosSale.customerPartyId/crmDealId/creditTerms" : ""]
    .filter(Boolean)
    .map((s) => `${s} · `)
    .join("");

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
    const o = e as Any;
    return { ok: false, code: errCode(e), message: String(o?.message ?? e).slice(0, 200), threw: true, limitSatang: o?.limitSatang, exposureSatang: o?.exposureSatang };
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
const codeOf = (r: Any): string =>
  r && r.ok === false ? String(r.code ?? "NO_CODE") : r && (r.ok === true || (r.ok === undefined && typeof r.saleId === "string")) ? "OK" : r === undefined ? "undefined" : r === null ? "null" : "UNKNOWN";
const refused = (r: Any, ...codes: string[]) => r?.ok === false && (codes.length === 0 || codes.includes(String(r.code)));
const itemsOf = (r: Any): Any[] => (Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : []);

const seam = ex(F.seam) ? await tryImport("@/lib/modules/crm/pos-seam") : null;
const crmLink = ex(F.crmLink) ? await tryImport("@/lib/modules/pos/crm-link") : null;
const creditMod = ex(F.credit) ? await tryImport("@/lib/modules/pos/credit") : null;
const creditShared = ex(F.creditShared) ? await tryImport("@/lib/modules/pos/credit-shared") : null;
const creditSettingsMod = ex(`${POS_DIR}/credit-settings.ts`) ? await tryImport("@/lib/modules/pos/credit-settings") : null; // ORACLE-EDIT ผู้สร้าง P3.6U (B) 22 ต.ค. (CD-P36U-2) ◂
const setShared = await tryImport("@/lib/modules/pos/settings-shared");
const regFacade = await tryImport("@/lib/modules/pos/register");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const posSvc = await tryImport("@/lib/modules/pos/service");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const pinMod = await tryImport("@/lib/modules/pos/staff-pin");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const chMod = await tryImport("@/lib/modules/pos/channel");
const ordMod = await tryImport("@/lib/modules/pos/order");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const pubMod = await tryImport("@/lib/modules/pos/public-receipt");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const accReports = await tryImport("@/lib/modules/account/reports");
const glMod = await tryImport("@/lib/modules/account/gl");
const finMod = await tryImport("@/lib/modules/account/finance");
const crmMod = await tryImport("@/lib/modules/crm");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const pointMod = await tryImport("@/lib/modules/point");
const vatMod = await tryImport("@/lib/money/vat");
const OBX = await tryImport("@/lib/outbox-consumers");
const CONS: Any = OBX?.consumers ?? {};

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p36-${RAND}`;
const T_SLUG = `posqc-p36-${RAND}`;
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

// ── outbox: ระบายเฉพาะร้านชั่วคราว (แบบ qc-crm-c2.7) · เล่นซ้ำด้วยตัวรับตรง ──
const pumpErr: string[] = [];
const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
async function pump(rounds = 30): Promise<boolean> {
  await sleep(300); // ให้ drain ของผลิตภัณฑ์ (หลัง commit) จบก่อน
  for (let i = 0; i < rounds; i++) {
    const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: [T, T2].filter(Boolean) }, status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200 }).catch(() => [])) as Any[];
    if (!rows.length) {
      await sleep(150);
      return true;
    }
    for (const row of rows) {
      const h = CONS[row.type];
      if (typeof h === "function") {
        try {
          await h(evtOf(row));
        } catch (e) {
          const o = e as Any;
          pumpErr.push(`${row.type}: ${String(o?.code ?? o?.name ?? "")} ${String(o?.message ?? e).slice(0, 100)} @${String(o?.stack ?? "").split("\n")[1]?.trim().slice(0, 90) ?? ""}`);
        }
      }
      await P.outboxEvent.update({ where: { id: row.id }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
    }
  }
  return false;
}
async function replay(type: string, saleId: string, times = 1): Promise<string> {
  const rows = ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((r) => r.payload?.saleId === saleId);
  if (!rows.length) return `ไม่มี event ${type} ของบิล`;
  for (let i = 0; i < times; i++)
    for (const row of rows) {
      try {
        await CONS[type]?.(evtOf(row));
      } catch (e) {
        return `replay ${type} โยน: ${String((e as Error)?.message ?? e).slice(0, 80)}`;
      }
    }
  return "";
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const outputsForPrivacy: string[] = [];
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  let fx = "";
  const notes: string[] = [];
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; tid: string }> = {};
  const PR: Record<string, string> = {};
  const CH: Record<string, string> = {};
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
  /** ห่อข้อ DB หนึ่งข้อ — โยนกลางทาง = แดงตามเหตุผล ไม่ crash */
  const blk = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      chk(id, false, "ไม่โยน", `💥 ${String((e as Error)?.message ?? e).slice(0, 160)}`);
    }
  };
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };

  // ─── ร้าน · สาขา · ระบบ ───
  try {
    T = (await P.tenant.create({ data: { name: `QC P3.6 CRM เครดิต ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P3.6 ร้านอื่น ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS คิวซี ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.CRM = (await sysSvc.createSystem(T, "CRM", `CRM ${RAND}`)).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${RAND}`)).id;
    S.PTS = (await sysSvc.createSystem(T, "POINT", `แต้ม ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    S.CRMX = (await sysSvc.createSystem(T2, "CRM", `CRM T2 ${RAND}`)).id;
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    await sysSvc.linkUnit(T, S.PTS, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านเครดิตคิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true, defaultDueDays: 45 });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.$executeRawUnsafe(`UPDATE "AccountSettings" SET "defaultDueDays" = 45 WHERE "systemId" = $1 AND "tenantId" = $2`, S.ACC, T).catch(() => null);
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "CRM", linkedId: S.CRM } }).catch(() => null);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ─── ผู้ใช้ + Membership ───
  const SALES_PERMS = { "pos.sale.create": true, "crm.deal.read": true, "crm.deal.update": true, "crm.contact.read": true };
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of [
        ["OWNER", T, "OWNER", ["*"], {}],
        ["MGR", T, "MANAGER", [U.A!], {}],
        ["CASH", T, "STAFF", [U.A!], { "pos.sale.create": true }],
        ["SALES1", T, "STAFF", [U.A!], SALES_PERMS],
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
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const pctx = (): Any => ({ tenantId: T, systemId: S.POS ?? "none" });
  const cc = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid("OWNER") });
  const bookCtx = (): Any => ({ tenantId: T, systemId: S.ACC ?? "none" });
  const crmCtx = (): Any => ({ tenantId: T, systemId: S.CRM ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `qc36${RAND}${pfx}${++keyN}`;
  const patchPos = async (fn: (pos: Record<string, Any>) => void) => {
    const s0 = (await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
    const s = isRecord(s0) ? JSON.parse(JSON.stringify(s0)) : {};
    const pos = isRecord(s.pos) ? s.pos : {};
    fn(pos);
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s, pos } } });
  };
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj),
      sysId,
    );
  const CREDIT_ON = { enabled: true, requireBuyer: true };
  if (!fx) {
    await step("ค่าตั้ง POS", () =>
      patchPos((pos) => {
        pos.shift = { ...(isRecord(pos.shift) ? pos.shift : {}), required: { register: false, otherSources: false } };
        pos.credit = { ...CREDIT_ON };
      }),
    );
    await step("CRM v2", async () => {
      await setCrm(S.CRM!, { uiVersion: 2, bridgesEnabled: true });
      await setCrm(S.CRMX!, { uiVersion: 2, bridgesEnabled: true });
    });
  }

  // ─── เครื่อง + กะ + PIN ผู้จัดการ ───
  const DEV = `qc36${RAND}dev`;
  let SHIFT = "";
  const MGR_PIN = "4826";
  if (!fx) {
    await step("เครื่อง/กะ", async () => {
      must("registerDevice", await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เคาน์เตอร์ ${RAND}`, deviceCode: DEV }));
      const o = must("openShift", await call(shiftMod, "openShift", ctxU("A", DEV), A("OWNER"), { deviceId: DEV, deviceLabel: `เคาน์เตอร์ ${RAND}`, floatSatang: 0 }));
      SHIFT = String(o.shift?.id ?? o.shiftId ?? "");
    });
    await step("PIN ผู้จัดการ", async () => must("setStaffPin MGR", await call(pinMod, "setStaffPin", ctxU("A"), A("OWNER"), { userId: uid("MGR"), pin: MGR_PIN })));
  }
  // ─── สินค้า ───
  if (!fx) {
    await step("สินค้า", async () => {
      const mk = async (key: string, name: string, price: number) => {
        PR[key] = String(must(`createProduct ${key}`, await call(catalog, "createProduct", cc(), { name: `${name} ${RAND}`, kind: "PRODUCT", basePriceSatang: price }))?.id ?? "");
      };
      await mk("a", "สินค้า ก", 30_000);
      await mk("b", "สินค้า ข", 20_000);
      await mk("c", "สินค้า ค", 10_000);
    });
  }
  // ─── ช่องทาง (CHAT builtin + LINEMAN) ───
  if (!fx) {
    await step("ช่องทาง", async () => {
      const r = await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: U.A });
      for (const c of Array.isArray(r) ? r : []) CH[c.code] = c.id;
      CH.LM = String(must("saveChannel LINEMAN", await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 1000 }))?.channel?.id ?? "");
    });
  }

  // ─── บัญชีเงิน (รับชำระ) ───
  let FIN = "";
  if (!fx) {
    await step("บัญชีธนาคาร", async () => {
      const r = await finMod.createFinanceAccount({ tenantId: T, systemId: S.ACC, type: "BANK", name: `ธนาคาร ${RAND}` });
      FIN = String(r?.id ?? "");
      if (!FIN) throw new Error(`createFinanceAccount ${short(r, 80)}`);
    });
  }

  // ─── สมาชิก M1 (Gold 10%) ───
  let M1 = "";
  let M1P = "";
  let M1CODE = "";
  const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") };
  if (!fx) {
    await step("สมาชิก", async () => {
      await pointMod.setPointSettings({ tenantId: T }, { satangPerPoint: 1000, burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50, earnBase: "NET", excludeVoucher: true, excludeGiftCard: true });
      await tierMod.createTierDef(ctxM, A("OWNER"), { key: "silver", name: "Silver", color: "SLATE", isDefault: true, legacyTier: "SILVER" });
      const gold = await tierMod.createTierDef(ctxM, A("OWNER"), { key: "gold", name: "Gold", color: "AMBER", legacyTier: "GOLD" });
      await tierMod.setBenefits(ctxM, A("OWNER"), gold.id, [{ type: "DISCOUNT_PCT", config: { pct: 10, maxSatang: 10_000_000 } }]);
      const r = await memMod.createMember(ctxM, A("OWNER"), { phone: `0897${rnd(6)}`, name: `สมาชิกองค์กร ${RAND}`, source: "WALK_IN", homeUnitId: U.A });
      M1 = String(r?.customerId ?? "");
      if (!M1) throw new Error(`createMember ${short(r, 80)}`);
      await tierMod.applyTierChange(ctxM, M1, gold.id, "MANUAL", { qc: TAG }, { byUserId: uid("OWNER") });
      let c = await P.customer.findUnique({ where: { id: M1 }, select: { partyId: true, memberCode: true } });
      if (!c?.partyId) {
        const party = await P.party.create({ data: { tenantId: T, name: `สมาชิกองค์กร ${RAND}`, kind: "PERSON" } });
        await P.customer.update({ where: { id: M1 }, data: { partyId: party.id } });
        c = await P.customer.findUnique({ where: { id: M1 }, select: { partyId: true, memberCode: true } });
      }
      M1P = String(c?.partyId ?? "");
      M1CODE = String(c?.memberCode ?? "");
    });
  }

  // ─── CRM: บริษัท CO1–CO7 + COX (T2) · ผู้ติดต่อ CT1 (= party ของ M1) CT2 · ดีล D1–D4 ───
  type Co = { id: string; partyId: string; name: string; taxId: string; phone: string; email: string };
  const CO: Record<string, Co> = {};
  const NAME_Q = `QC36${RAND}`;
  const PH = { CO1: `0291${rnd(6)}`, CT1: `0861${rnd(6)}` };
  const EM = { CO1: `co1-${RAND}@corp-p36.qc.invalid`, CT1: `ct1-${RAND}@person-p36.qc.invalid` };
  const DEAL_VALUE = 98_765_432;
  let AC1 = "";
  let CT1 = "";
  const DL: Record<string, string> = {};
  if (!fx) {
    await step("CRM บริษัท", async () => {
      const mkCo = async (key: string, tid: string, sys: string, label: string, extra: Any = {}) => {
        const name = `${NAME_Q} ${label} จำกัด`;
        const taxId = taxIdOf(`0105${rnd(8)}`);
        const party = await P.party.create({ data: { tenantId: tid, name, kind: "COMPANY" } });
        const phone = key === "CO1" ? PH.CO1 : `0292${rnd(6)}`;
        const email = key === "CO1" ? EM.CO1 : `${key.toLowerCase()}-${RAND}@corp-p36.qc.invalid`;
        const row = await P.crmCompany.create({ data: { tenantId: tid, systemId: sys, partyId: party.id, name, taxId, branchCode: "00000", phone, email, ownerUserId: uid("SALES1"), ...extra } });
        CO[key] = { id: row.id, partyId: party.id, name, taxId, phone, email };
      };
      await mkCo("CO1", T, S.CRM!, "หนึ่ง");
      await mkCo("CO2", T, S.CRM!, "สอง");
      await mkCo("CO3", T, S.CRM!, "สาม (เก็บแล้ว)", { archivedAt: new Date() });
      await mkCo("CO4", T, S.CRM!, "สี่");
      await mkCo("CO5", T, S.CRM!, "ห้า");
      await mkCo("CO6", T, S.CRM!, "หก");
      await mkCo("CO7", T, S.CRM!, "เจ็ด");
      await mkCo("COX", T2, S.CRMX!, "ร้านอื่น");
      // ผู้ติดต่อสมุดของ CO1 (partyId P1 · เทอม 30 วัน) — CO2/CO4–CO7 ไม่มี
      const c = await accSvc.findOrCreateCustomerContact(bookCtx(), { name: CO.CO1!.name, taxId: CO.CO1!.taxId, branchCode: "00000", partyId: CO.CO1!.partyId });
      AC1 = String(typeof c === "string" ? c : c?.id ?? c?.contactId ?? "");
      if (!AC1) throw new Error(`findOrCreateCustomerContact ${short(c, 60)}`);
      await P.accountContact.update({ where: { id: AC1 }, data: { creditTermDays: 30 } });
      await P.crmCompany.update({ where: { id: CO.CO1!.id }, data: { accountContactId: AC1 } });
    });
    await step("CRM ผู้ติดต่อ/ดีล", async () => {
      const ct1 = await P.crmContact.create({ data: { tenantId: T, systemId: S.CRM, name: `คุณติดต่อ ${RAND}`, firstName: `คุณติดต่อ ${RAND}`, phone: PH.CT1, email: EM.CT1, partyId: M1P || null, ownerUserId: uid("SALES1") } });
      CT1 = ct1.id;
      await P.crmCompanyContact.create({ data: { tenantId: T, companyId: CO.CO1!.id, contactId: CT1, role: "OTHER", isPrimary: true } });
      await P.crmCompanyContact.create({ data: { tenantId: T, companyId: CO.CO4!.id, contactId: CT1, role: "OTHER", endedAt: new Date(Date.now() - DAY_MS) } });
      const p2 = await P.party.create({ data: { tenantId: T, name: `บุคคลอื่น ${RAND}`, kind: "PERSON" } });
      const ct2 = await P.crmContact.create({ data: { tenantId: T, systemId: S.CRM, name: `บุคคลอื่น ${RAND}`, firstName: `บุคคลอื่น ${RAND}`, partyId: p2.id, ownerUserId: uid("SALES1") } });
      const STD = [
        { name: "ผู้สนใจ", kind: "OPEN", probability: 10 },
        { name: "ต่อรอง", kind: "OPEN", probability: 50 },
        { name: "ชนะ", kind: "WON", probability: 100 },
        { name: "แพ้", kind: "LOST", probability: 0 },
      ];
      const pipe = (await P.crmPipeline.create({ data: { tenantId: T, systemId: S.CRM, name: `ขายองค์กร ${RAND}`, stages: { create: STD.map((s, i) => ({ tenantId: T, systemId: S.CRM, sortOrder: i, ...s })) } }, include: { stages: true } })) as Any;
      const st = [...(pipe.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
      const mkDeal = async (key: string, contactId: string, companyId: string | null, title: string, stage: number, kind: string, value: number) => {
        const row = await P.crmDeal.create({ data: { tenantId: T, systemId: S.CRM, contactId, ...(companyId ? { companyId } : {}), pipelineId: pipe.id, stageId: st[stage], kind, title: `${title} ${RAND}`, valueSatang: value, ownerUserId: uid("SALES1") } });
        DL[key] = row.id;
      };
      await mkDeal("D1", CT1, CO.CO1!.id, "ดีลหลัก", 1, "OPEN", DEAL_VALUE);
      await mkDeal("D2", ct2.id, null, "ดีลคนอื่น", 0, "OPEN", 500_000);
      await mkDeal("D3", CT1, CO.CO1!.id, "ดีลเครดิต", 0, "OPEN", 400_000);
      await mkDeal("D4", CT1, CO.CO1!.id, "ดีลปิดแล้ว", 2, "WON", 100_000);
      // กติกาค่าคอมฯ CRM (PCT 5% ฐาน PAID) — CM1
      await call(crmMod?.commissions, "createRule", crmCtx(), A("OWNER"), { name: `ค่าคอมฯ องค์กร ${RAND}`, basis: "PAID", kind: "PCT", config: { pctBp: 500 } }).then((r: Any) => {
        if (r?.ok === false) notes.push(`createRule CRM ${codeOf(r)} ${short(r.message, 60)}`);
      });
    });
  }
  const P1 = CO.CO1?.partyId ?? "none-P1";
  const PP = (k: string) => CO[k]?.partyId ?? `none-${k}`;

  // ─── บัญชีเครดิต (ผ่านตัวเขียนจริง credit.saveCreditAccount) ───
  const ACCT: Record<string, Any> = {};
  if (!fx) {
    for (const [k, limit, termDays, active] of [
      ["CO1", 1_000_000, null, true],
      ["CO2", 100_000, 15, true],
      ["CO4", 1_000_000, null, true],
      ["CO5", 1_000_000, 7, true],
      ["CO6", 1_000_000, 0, true],
      ["CO7", 1_000_000, null, false],
    ] as const) {
      const r = await call(creditMod, "saveCreditAccount", pctx(), A("OWNER"), { partyId: PP(k), limitSatang: limit, termDays, active, note: `บันทึกลับ ${k} ${RAND}` });
      if (r?.ok !== true) notes.push(`saveCreditAccount ${k}: ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      ACCT[k] = r;
    }
  }
  const NO = () => FXB(NDB() + (creditMod ? "" : "ไม่มี pos/credit.ts · "));

  // ─── ตัวช่วยขาย ───
  const buyerSnap = (k: string): Any => ({ kind: "JURISTIC", name: CO[k]?.name ?? "x", taxId: CO[k]?.taxId ?? "0000000000000", branchCode: "00000", address: `99 ถนนคิวซี เขตทดสอบ กรุงเทพฯ 10110`, email: null, source: "MANUAL", requestedAt: new Date().toISOString() });
  const buyerIn = (k: string): Any => ({ kind: "JURISTIC", name: CO[k]?.name ?? "x", taxId: CO[k]?.taxId ?? "0000000000000", branchCode: "00000", address: `99 ถนนคิวซี เขตทดสอบ กรุงเทพฯ 10110` });
  type Sold = { ok: boolean; saleId: string; grand: number; code: string; r: Any; key: string };
  /** createSale ตรง (ผู้เรียกฝั่งเซิร์ฟเวอร์) — lines อิสระ */
  const cs = async (label: string, over: Any, lines: Any[] = [{ name: `รายการ ${label}`, qty: 1, unitPriceSatang: 100_000 }]): Promise<Sold> => {
    const grand = lines.reduce((n: number, l: Any) => n + l.qty * l.unitPriceSatang - (l.discountSatang ?? 0), 0);
    const input = { tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: newKey(label), lines, payMethods: [{ type: "ON_ACCOUNT", amountSatang: grand }], ...over };
    const r = fx ? { ok: false, code: "FIXTURE" } : await call(posSvc, "createSale", input);
    const ok = !!r && r.ok !== false && typeof r.saleId === "string";
    return { ok, saleId: ok ? r.saleId : "", grand, code: ok ? "OK" : codeOf(r), r, key: input.idempotencyKey };
  };
  /** หน้าขายใหม่: quote → submit (ยอดจาก quote) */
  const reg = async (label: string, actorK: string, lines: Any[], pays: (g: number) => Any[], extra: Any = {}, dev: string | undefined = DEV): Promise<Sold & { q: Any }> => {
    const quoteIn = { lines, ...(extra.memberId ? { memberId: extra.memberId } : {}) };
    const q = fx ? null : await call(regFacade, "quoteRegisterCart", ctxU("A", dev), A(actorK), quoteIn);
    const g = q?.ok === true ? Number(q.grandTotalSatang) : NaN;
    if (!Number.isFinite(g)) return { ok: false, saleId: "", grand: NaN, code: `QUOTE:${codeOf(q)}`, r: q, key: "", q };
    const input = { ...quoteIn, ...extra, payMethods: pays(g), expectedGrandTotalSatang: g, idempotencyKey: newKey(label) };
    const r = await call(regFacade, "submitRegisterSale", ctxU("A", dev), A(actorK), input);
    const ok = r?.ok === true && !!r.saleId;
    return { ok, saleId: ok ? String(r.saleId) : "", grand: g, code: codeOf(r), r, key: input.idempotencyKey, q };
  };
  const cash = (g: number) => [{ type: "CASH", amountSatang: g }];
  const onAcc = (g: number) => [{ type: "ON_ACCOUNT", amountSatang: g }];
  const pl = (key: string, qty = 1) => ({ productId: PR[key] ?? `none-${key}`, qty });
  const saleRow = async (id: string): Promise<Any> => (id ? await P.posSale.findUnique({ where: { id }, include: { payments: true, lines: true } }).catch(() => null) : null);
  const saleRaw = async (id: string): Promise<Any> => {
    if (!id || !dbHas.saleCols) return null;
    const r = (await P.$queryRawUnsafe(`SELECT "customerPartyId", "crmDealId", "creditTerms" FROM "PosSale" WHERE id = $1`, id).catch(() => [])) as Any[];
    return r[0] ?? null;
  };
  const counts = async (): Promise<string> =>
    J([
      await P.posSale.count({ where: { tenantId: T } }).catch(() => -1),
      await P.posPayment.count({ where: { tenantId: T } }).catch(() => -1),
      await P.outboxEvent.count({ where: { tenantId: T, type: { startsWith: "pos.sale." } } }).catch(() => -1),
    ]);
  const docsOf = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.accountDocument.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  type Line = { code: string; debit: number; credit: number; contactId: string | null };
  type Entry = { id: string; key: string; status: string; reversalOfId: string | null; lines: Line[] };
  const jvWhere = async (where: Any): Promise<Entry[]> => {
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, ...where }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
    return es.map((e: Any) => ({
      id: e.id,
      key: String(e.idempotencyKey ?? ""),
      status: String(e.status),
      reversalOfId: e.reversalOfId ?? null,
      lines: (e.lines ?? []).map((l: Any) => ({ code: String(l.account?.code ?? "?"), debit: Number(l.debit), credit: Number(l.credit), contactId: l.contactId ?? null })),
    }));
  };
  const net = (es: Entry[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const l of es.flatMap((e) => e.lines)) m[l.code] = (m[l.code] ?? 0) + l.debit - l.credit;
    return m;
  };
  const aging = async (contactId: string): Promise<Any> => {
    const r = await call(accReports, "agingReport", bookCtx(), { direction: "OUT", contactId });
    return Array.isArray(r?.rows) ? r.rows.find((x: Any) => x.contactId === contactId) ?? { notDueSatang: 0, totalSatang: 0 } : null;
  };
  const dealPays = async (dealId: string): Promise<Any[]> => (dealId ? ((await P.crmDealPayment.findMany({ where: { dealId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const dealPaid = async (dealId: string): Promise<number> => Number((await P.crmDeal.findUnique({ where: { id: dealId || "-" }, select: { paidSatang: true } }).catch(() => null))?.paidSatang ?? NaN);
  const audits = async (action: string): Promise<Any[]> => (await P.auditLog.findMany({ where: { tenantId: T, action }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
  const status = (actorK: string, partyId: string, amountSatang?: number) => call(creditMod, "registerCreditStatus", ctxU("A"), A(actorK), { customerPartyId: partyId, ...(amountSatang !== undefined ? { amountSatang } : {}) });
  const vatSplit = (g: number): { baseSatang: number; vatSatang: number } => {
    const r = callSync(vatMod, "splitIncludedVat", g, 700);
    return r && typeof r.vatSatang === "number" ? r : { baseSatang: NaN, vatSatang: NaN };
  };

  // ════════ CP แผ่นเลือกบริษัท ════════
  const seamCo = (input: Any) => call(seam, "companiesForPos", { tenantId: T, ...input });
  await blk("CP1", async () => {
    const p: string[] = [];
    const r1 = await seamCo({ q: NAME_Q });
    const ids = itemsOf(r1).map((x: Any) => x.companyId);
    for (const k of ["CO1", "CO2", "CO4"]) if (!ids.includes(CO[k]?.id)) p.push(`ชื่อ: ไม่มี ${k} (${codeOf(r1)})`);
    if (ids.includes(CO.CO3?.id)) p.push("ชื่อ: มี CO3 ที่เก็บแล้ว");
    if (ids.includes(CO.COX?.id)) p.push("ชื่อ: มีบริษัทของร้าน T2");
    const r2 = await seamCo({ q: CO.CO1?.taxId });
    const i2 = itemsOf(r2).map((x: Any) => x.companyId);
    if (!i2.includes(CO.CO1?.id) || i2.length !== 1) p.push(`เลขภาษี CO1 → ${i2.length} แถว`);
    const r3 = await seamCo({ partyIds: [PP("CO2")] });
    const i3 = itemsOf(r3).map((x: Any) => x.companyId);
    if (J(i3) !== J([CO.CO2?.id])) p.push(`partyIds [P2] → ${short(i3, 60)}`);
    const r4 = await seamCo({ q: NAME_Q, limit: 2 });
    if (itemsOf(r4).length !== 2) p.push(`limit 2 → ${itemsOf(r4).length}`);
    const r5 = await seamCo({ q: NAME_Q, limit: 500 });
    if (itemsOf(r5).length > 20) p.push(`limit 500 → ${itemsOf(r5).length} (เพดาน 20)`);
    const row = itemsOf(r1).find((x: Any) => x.companyId === CO.CO1?.id);
    if (row && (row.partyId !== P1 || row.systemId !== S.CRM || row.name !== CO.CO1?.name || row.taxId !== CO.CO1?.taxId || row.branchCode !== "00000")) p.push(`แถว CO1 ${short(row, 120)}`);
    chk("CP1", p.length === 0, "CO1 CO2 CO4 · ไม่มี CO3/T2 · taxId · partyIds · limit", FXB(joinP(p)));
  });
  await blk("CP2", async () => {
    const p: string[] = [];
    const rows = [
      ...itemsOf(await seamCo({ q: NAME_Q })),
      ...itemsOf(await call(seam, "companiesOfParty", { tenantId: T, partyId: M1P })),
      ...itemsOf(await call(crmLink, "registerCompanySearch", ctxU("A"), A("CASH"), { q: NAME_Q })),
      ...itemsOf(await call(crmLink, "registerMemberCompanies", ctxU("A"), A("CASH"), { memberId: M1 })),
    ];
    if (!rows.length) p.push("ไม่มีแถวให้ตรวจ");
    for (const r of rows) {
      const extra = Object.keys(r).filter((k) => !COMPANY_KEYS.includes(k));
      if (extra.length) p.push(`คีย์เกิน ${extra.join(",")}`);
    }
    const raw = J(rows);
    for (const s of [PH.CO1, EM.CO1, PH.CT1, EM.CT1]) if (raw.includes(s)) p.push(`มีข้อมูลติดต่อ ${s.slice(0, 6)}…`);
    outputsForPrivacy.push(raw);
    chk("CP2", p.length === 0, `คีย์ ⊆ ${COMPANY_KEYS.join(",")}`, FXB(joinP([...new Set(p)])));
  });
  await blk("CP3", async () => {
    const p: string[] = [];
    const r = await call(seam, "companiesOfParty", { tenantId: T, partyId: M1P });
    const ids = itemsOf(r).map((x: Any) => x.companyId);
    if (J(ids) !== J([CO.CO1?.id])) p.push(`companiesOfParty → ${short(ids, 80)} (${codeOf(r)})`);
    const m = await call(crmLink, "registerMemberCompanies", ctxU("A"), A("CASH"), { memberId: M1 });
    const mi = itemsOf(m).map((x: Any) => x.companyId);
    if (J(mi) !== J([CO.CO1?.id])) p.push(`registerMemberCompanies → ${short(mi, 80)} (${codeOf(m)})`);
    chk("CP3", p.length === 0, "[CO1]", FXB(joinP(p)));
  });
  await blk("CP4", async () => {
    const p: string[] = [];
    const r = await call(crmLink, "registerCompanySearch", ctxU("A"), A("CASH"), { q: NAME_Q });
    if (r?.ok !== true || !itemsOf(r).some((x: Any) => x.companyId === CO.CO1?.id)) p.push(`แคชเชียร์ → ${codeOf(r)} ${itemsOf(r).length} แถว`);
    const n = await call(crmLink, "registerCompanySearch", ctxU("A"), A("NOPERM"), { q: NAME_Q });
    if (!refused(n, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ POS → ${codeOf(n)}`);
    const x = await call(crmLink, "registerCompanySearch", ctxU("X"), A("OWNER2"), { q: NAME_Q });
    const xi = itemsOf(x).map((i: Any) => i.companyId);
    if (xi.some((id: string) => Object.entries(CO).some(([k, c]) => k !== "COX" && c.id === id))) p.push("ร้าน T2 เห็นบริษัทของ T");
    if (x?.ok !== true) p.push(`T2 → ${codeOf(x)}`);
    chk("CP4", p.length === 0, "แคชเชียร์ได้ · ไม่มีสิทธิ์ = PERMISSION_DENIED · T2 แยก", FXB(joinP(p)));
  });

  // ════════ CR1 + AR1–AR3 ════════
  const CR1 = await cs("cr1", { customerPartyId: P1, crmDealId: DL.D3, taxInvoice: buyerSnap("CO1") }, [{ name: `บริการองค์กร ${RAND}`, qty: 1, unitPriceSatang: 400_000 }]);
  await blk("CR1", async () => {
    const p: string[] = [];
    if (!CR1.ok) p.push(`createSale → ${CR1.code} ${short(CR1.r?.message ?? "", 80)}`);
    const s = await saleRow(CR1.saleId);
    const raw = await saleRaw(CR1.saleId);
    if (CR1.ok) {
      if (s?.status !== "PAID") p.push(`status ${s?.status}`);
      const pays = (s?.payments ?? []) as Any[];
      if (pays.length !== 1 || pays[0]?.type !== "ON_ACCOUNT" || pays[0]?.amountSatang !== 400_000) p.push(`payments ${short(pays.map((x: Any) => [x.type, x.amountSatang]), 80)}`);
      if (raw?.customerPartyId !== P1) p.push(`customerPartyId ${short(raw?.customerPartyId, 30)}`);
      if (raw?.crmDealId !== DL.D3) p.push(`crmDealId ${short(raw?.crmDealId, 30)}`);
      const ct = raw?.creditTerms ?? {};
      const due = s?.paidAt ? addDays(bkkYmd(new Date(s.paidAt)), 30) : "?";
      if (ct.termDays !== 30 || ct.dueDate !== due || ct.limitSatang !== 1_000_000 || ct.exposureSatang !== 0) p.push(`creditTerms ${short(ct, 120)} (คาด 30 ${due} 1000000 0)`);
    }
    const pure = callSync(creditShared, "creditDueDate", new Date("2026-10-16T17:30:00Z"), 30);
    if (pure !== "2026-11-16") p.push(`creditDueDate(17:30Z, 30) = ${short(pure, 40)} (คาด 2026-11-16)`);
    const pure2 = callSync(creditShared, "creditDueDate", new Date("2026-10-16T16:59:00Z"), 15);
    if (pure2 !== "2026-10-31") p.push(`creditDueDate(16:59Z, 15) = ${short(pure2, 40)} (คาด 2026-10-31)`);
    const t1 = callSync(creditShared, "resolveCreditTermDays", null, 30, 45);
    const t2 = callSync(creditShared, "resolveCreditTermDays", 15, 30, 45);
    const t3 = callSync(creditShared, "resolveCreditTermDays", null, null, 45);
    if (t1 !== 30 || t2 !== 15 || t3 !== 45) p.push(`resolveCreditTermDays ${short([t1, t2, t3])} (คาด 30,15,45)`);
    chk("CR1", p.length === 0, "PAID · ON_ACCOUNT · creditTerms 30 วัน", NO() + joinP(p));
  });
  await pump();
  let INV1: Any = null;
  await blk("AR1", async () => {
    const p: string[] = [];
    const docs = await docsOf(CR1.saleId);
    const inv = docs.filter((d) => d.docType === "INVOICE");
    INV1 = inv[0] ?? null;
    if (docs.length !== 1 || inv.length !== 1) p.push(`เอกสาร ${docs.map((d) => `${d.docType}/${d.status}`).join(",") || "ไม่มี"} (คาด INVOICE 1 ใบ)`);
    if (INV1) {
      if (INV1.status !== "AWAITING_PAYMENT") p.push(`status ${INV1.status}`);
      if (INV1.contactId !== AC1) p.push(`contactId ${short(INV1.contactId, 30)} (คาด ผู้ติดต่อสมุด CO1)`);
      if (INV1.grandTotal !== 400_000) p.push(`grandTotal ${INV1.grandTotal}`);
      const ct = (await saleRaw(CR1.saleId))?.creditTerms ?? {};
      if (!sameDay(INV1.dueDate, String(ct.dueDate ?? "?"))) p.push(`dueDate ${short(INV1.dueDate, 30)} ≠ ${ct.dueDate}`);
    }
    if (pumpErr.length) p.push(`pump: ${pumpErr.slice(-1)[0]}`);
    chk("AR1", p.length === 0, "INVOICE AWAITING_PAYMENT 1 ใบ", NO() + joinP(p));
  });
  await blk("AR2", async () => {
    const p: string[] = [];
    const before = await jvWhere({ refType: "PosSale", refId: CR1.saleId || "-" });
    const v = vatSplit(400_000);
    const e = before.find((x) => x.key === `PosSale#${CR1.saleId}#PAID`);
    if (before.length !== 1 || !e) p.push(`JV ${before.length} ใบ (${before.map((x) => x.key).join(",")})`);
    if (e) {
      const ar = e.lines.filter((l) => l.code === "1100");
      if (ar.length !== 1 || ar[0]!.debit !== 400_000 || ar[0]!.contactId !== AC1) p.push(`Dr 1100 ${short(ar, 100)}`);
      const vat = e.lines.filter((l) => l.code === "2200").reduce((n, l) => n + l.credit - l.debit, 0);
      if (vat !== v.vatSatang) p.push(`VAT 2200 ${vat} (คาด ${v.vatSatang})`);
      const rev = e.lines.filter((l) => /^4/.test(l.code)).reduce((n, l) => n + l.credit - l.debit, 0);
      if (rev !== v.baseSatang) p.push(`รายได้ 4xxx ${rev} (คาด ${v.baseSatang})`);
      if (e.lines.some((l) => /^10[0-9]{2}$/.test(l.code))) p.push("มีขาเงินสด/ธนาคาร");
    }
    const docs0 = J((await docsOf(CR1.saleId)).map((d) => [d.id, d.status, d.grandTotal]));
    const rp = await replay("pos.sale.paid", CR1.saleId, 2);
    if (rp) p.push(rp);
    const after = await jvWhere({ refType: "PosSale", refId: CR1.saleId || "-" });
    if (J(after.map((x) => x.id)) !== J(before.map((x) => x.id))) p.push(`เล่นซ้ำ JV ${before.length}→${after.length}`);
    if (J((await docsOf(CR1.saleId)).map((d) => [d.id, d.status, d.grandTotal])) !== docs0) p.push("เล่นซ้ำ เอกสารเปลี่ยน");
    chk("AR2", p.length === 0, "JV เดียว Dr 1100 / Cr 4xxx + 2200 · เล่นซ้ำคงเดิม", NO() + joinP(p));
  });
  await blk("AR3", async () => {
    const p: string[] = [];
    const a = await aging(AC1);
    if (!a) p.push("agingReport ไม่ได้");
    else if (a.notDueSatang !== 400_000 || a.totalSatang !== 400_000) p.push(`notDue ${a.notDueSatang} total ${a.totalSatang}`);
    chk("AR3", p.length === 0, "notDue 400,000 · total 400,000", NO() + joinP(p));
  });

  // ════════ CR2 เทอม ════════
  await blk("CR2", async () => {
    const p: string[] = [];
    const s2 = await cs("cr2-p2", { customerPartyId: PP("CO2"), taxInvoice: buyerSnap("CO2") }, [{ name: "ของ P2", qty: 1, unitPriceSatang: 50_000 }]);
    const t2 = (await saleRaw(s2.saleId))?.creditTerms;
    const paid2 = (await saleRow(s2.saleId))?.paidAt;
    if (!s2.ok) p.push(`P2 → ${s2.code}`);
    else if (t2?.termDays !== 15 || t2?.dueDate !== addDays(bkkYmd(new Date(paid2)), 15)) p.push(`P2 ${short(t2, 80)}`);
    const s4 = await cs("cr2-p4a", { customerPartyId: PP("CO4"), taxInvoice: buyerSnap("CO4") }, [{ name: "ของ P4", qty: 1, unitPriceSatang: 50_000 }]);
    const t4 = (await saleRaw(s4.saleId))?.creditTerms;
    if (!s4.ok) p.push(`P4 → ${s4.code}`);
    else if (t4?.termDays !== 45) p.push(`P4 termDays ${short(t4?.termDays)} (คาด ค่าปริยายสมุด 45)`);
    await pump();
    const c4 = await P.accountContact.findFirst({ where: { tenantId: T, systemId: S.ACC, partyId: PP("CO4") }, select: { creditTermDays: true } }).catch(() => null);
    const s4b = await cs("cr2-p4b", { customerPartyId: PP("CO4"), taxInvoice: buyerSnap("CO4") }, [{ name: "ของ P4 รอบสอง", qty: 1, unitPriceSatang: 50_000 }]);
    const t4b = (await saleRaw(s4b.saleId))?.creditTerms;
    if (!s4b.ok) p.push(`P4 รอบสอง → ${s4b.code}`);
    else if (t4b?.termDays !== 45) p.push(`P4 หลังมีผู้ติดต่อ (creditTermDays ${short(c4?.creditTermDays)}) termDays ${short(t4b?.termDays)} (คาด 45 · CD-3)`);
    const c0 = await counts();
    const s6 = await cs("cr2-p6", { customerPartyId: PP("CO6"), taxInvoice: buyerSnap("CO6") });
    if (s6.code !== "CREDIT_TERM_ZERO") p.push(`P6 termDays 0 → ${s6.code}`);
    if ((await counts()) !== c0) p.push("P6 มีบิล/แถวเพิ่ม");
    chk("CR2", p.length === 0, "15 · 45 · 45 · CREDIT_TERM_ZERO", NO() + joinP(p));
  });

  // ════════ CR3 ลูกค้าไม่ถูกต้อง ════════
  await blk("CR3", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const cases: [string, Any][] = [
      ["ไม่มี customerPartyId", { taxInvoice: buyerSnap("CO1") }],
      ["Party บุคคล (M1)", { customerPartyId: M1P, taxInvoice: buyerSnap("CO1") }],
      ["Party ของ T2", { customerPartyId: PP("COX"), taxInvoice: buyerSnap("CO1") }],
      ["id มั่ว", { customerPartyId: `nope${RAND}`, taxInvoice: buyerSnap("CO1") }],
    ];
    for (const [lbl, over] of cases) {
      const r = await cs(`cr3-${lbl}`, over);
      if (r.code !== "CUSTOMER_INVALID") p.push(`${lbl} → ${r.code}`);
    }
    const g = 100_000;
    const rc = fx ? null : await call(posSvc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: newKey("cr3cash"), lines: [{ name: "เงินสด", qty: 1, unitPriceSatang: g }], payMethods: [{ type: "CASH", amountSatang: g }], customerPartyId: M1P });
    if (codeOf(rc) !== "CUSTOMER_INVALID") p.push(`บิลเงินสด + บุคคล → ${codeOf(rc)}`);
    if ((await counts()) !== c0) p.push(`แถวเพิ่ม ${c0}→${await counts()}`);
    chk("CR3", p.length === 0, "CUSTOMER_INVALID ×5 · ไม่มีบิล", NO() + joinP(p));
  });

  // ════════ CR4 บัญชีเครดิต ════════
  await blk("CR4", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const r3 = await cs("cr4-p3", { customerPartyId: PP("CO3"), taxInvoice: buyerSnap("CO3") });
    if (r3.code !== "CREDIT_NOT_ALLOWED") p.push(`P3 ไม่มีบัญชี → ${r3.code}`);
    const r7 = await cs("cr4-p7", { customerPartyId: PP("CO7"), taxInvoice: buyerSnap("CO7") });
    if (r7.code !== "CREDIT_NOT_ALLOWED") p.push(`P7 ปิดใช้ → ${r7.code}`);
    if ((await counts()) !== c0) p.push("มีบิลเพิ่ม");
    const sc = await call(creditMod, "saveCreditAccount", pctx(), A("CASH"), { partyId: PP("CO7"), limitSatang: 9_999_900, termDays: null, active: true });
    if (!refused(sc, "PERMISSION_DENIED")) p.push(`แคชเชียร์ save → ${codeOf(sc)}`);
    const sm = await call(creditMod, "saveCreditAccount", pctx(), A("MGR"), { partyId: PP("CO7"), limitSatang: 1_000_000, termDays: null, active: false, note: `ผู้จัดการแก้ ${RAND}` });
    if (sm?.ok !== true) p.push(`ผู้จัดการ save → ${codeOf(sm)} ${short(sm?.message ?? "", 50)}`);
    const v1 = await call(creditMod, "saveCreditAccount", pctx(), A("OWNER"), { partyId: PP("CO5"), limitSatang: 0, termDays: 7 });
    const v2 = await call(creditMod, "saveCreditAccount", pctx(), A("OWNER"), { partyId: PP("CO5"), limitSatang: 1_000_000, termDays: 366 });
    if (!refused(v1, "VALIDATION") || !refused(v2, "VALIDATION")) p.push(`limit 0 / termDays 366 → ${codeOf(v1)}/${codeOf(v2)}`);
    const row5 = dbHas.creditTable ? ((await P.$queryRawUnsafe(`SELECT "limitSatang", "termDays" FROM "PosCreditAccount" WHERE "systemId" = $1 AND "partyId" = $2`, S.POS, PP("CO5")).catch(() => [])) as Any[])[0] : null;
    if (row5 && (row5.limitSatang !== 1_000_000 || row5.termDays !== 7)) p.push(`P5 ถูกแก้ทั้งที่ VALIDATION ${short(row5)}`);
    const au = await audits(AUDIT_UPDATED);
    if (au.length < 7) p.push(`audit ${AUDIT_UPDATED} ${au.length} แถว (คาด ≥ 7: ตั้ง 6 + ผู้จัดการ 1)`);
    const bad = au.filter((a) => Object.keys(isRecord(a.after) ? a.after : {}).some((k) => PII_KEY_RE.test(k)) || J(a.after).includes(RAND));
    if (bad.length) p.push(`audit มีคีย์/ข้อความส่วนตัว ${short(bad[0]?.after, 80)}`);
    chk("CR4", p.length === 0, "CREDIT_NOT_ALLOWED ×2 · สิทธิ์ · VALIDATION · audit", NO() + joinP(p));
  });

  // ════════ CR5 รูปแบบวิธีชำระ ════════
  await blk("CR5", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const base = { customerPartyId: PP("CO4"), taxInvoice: buyerSnap("CO4") };
    const L = [{ name: "ของ", qty: 1, unitPriceSatang: 100_000 }];
    const cases: [string, Any][] = [
      ["ผสมเงินสด", { ...base, payMethods: [{ type: "ON_ACCOUNT", amountSatang: 50_000 }, { type: "CASH", amountSatang: 50_000 }] }],
      ["ไม่เต็มยอด", { ...base, payMethods: [{ type: "ON_ACCOUNT", amountSatang: 90_000 }] }],
      ["มีทิป", { ...base, tipSatang: 10_000, payMethods: [{ type: "ON_ACCOUNT", amountSatang: 110_000 }] }],
      ["cashTendered", { ...base, payMethods: [{ type: "ON_ACCOUNT", amountSatang: 100_000, cashTenderedSatang: 100_000 }] }],
      ["POS_DEPOSIT", { ...base, sourceModule: "POS_DEPOSIT" }],
      ["ไม่มีผู้ซื้อ", { customerPartyId: PP("CO4") }],
    ];
    const got: string[] = [];
    for (const [lbl, over] of cases) {
      const r = await cs(`cr5-${lbl}`, over, L);
      got.push(`${lbl}:${r.code}`);
      if (r.ok) p.push(`${lbl} → ผ่าน (คาด ปฏิเสธ)`);
    }
    if ((await counts()) !== c0) p.push("มีบิล/แถวเพิ่ม");
    await step("requireBuyer false", () => patchPos((pos) => (pos.credit = { enabled: true, requireBuyer: false })));
    const ok = await cs("cr5-nobuyer-ok", { customerPartyId: PP("CO4") }, L);
    if (!ok.ok) p.push(`requireBuyer false ไม่มีผู้ซื้อ → ${ok.code} (ตัวควบคุมบวก)`);
    await step("requireBuyer true", () => patchPos((pos) => (pos.credit = { ...CREDIT_ON })));
    chk("CR5", p.length === 0, "ปฏิเสธ 6 ทาง · ตัวควบคุมผ่าน", NO() + joinP(p, `ครบ (${got.join(" ")})`));
  });

  // ════════ CR6 สวิตช์ ════════
  await blk("CR6", async () => {
    const p: string[] = [];
    const want = { enabled: false, requireBuyer: true };
    for (const [lbl, arg] of [["undefined", undefined], ["{}", {}], ["เพี้ยน", { pos: { credit: { enabled: "yes", requireBuyer: 0, junk: 1 } } }]] as const) {
      const d = callSync(setShared, "posCreditSettings", arg);
      if (J(d) !== J(want) && !(lbl === "เพี้ยน" && d?.enabled === false && d?.requireBuyer === true && Object.keys(d).length === 2)) p.push(`posCreditSettings(${lbl}) ${short(d, 80)}`);
    }
    const on = callSync(setShared, "posCreditSettings", { pos: { credit: { enabled: true, requireBuyer: false } } });
    if (on?.enabled !== true || on?.requireBuyer !== false) p.push(`posCreditSettings(เปิด) ${short(on, 80)}`);
    await step("ปิดเครดิต", () => patchPos((pos) => (pos.credit = { enabled: false, requireBuyer: true })));
    const c0 = await counts();
    const r1 = await cs("cr6-off", { customerPartyId: PP("CO4"), taxInvoice: buyerSnap("CO4") });
    if (r1.code !== "CREDIT_DISABLED") p.push(`createSale ปิด → ${r1.code}`);
    const r2 = await reg("cr6-reg", "CASH", [pl("c")], onAcc, { customerPartyId: PP("CO4"), taxInvoice: buyerIn("CO4") });
    if (r2.code !== "CREDIT_DISABLED") p.push(`register ปิด → ${r2.code}`);
    if ((await counts()) !== c0) p.push("มีบิลเพิ่ม");
    const st = await status("MGR", PP("CO4"));
    if (st?.ok !== true || st.enabled !== false) p.push(`registerCreditStatus ปิด ${short(st, 80)}`);
    await step("เปิดเครดิต", () => patchPos((pos) => (pos.credit = { ...CREDIT_ON })));
    chk("CR6", p.length === 0, "ปริยายปิด · CREDIT_DISABLED ×2", NO() + joinP(p));
  });

  // ════════ CR7 วงเงิน ════════
  await blk("CR7", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const r = await cs("cr7", { customerPartyId: P1, taxInvoice: buyerSnap("CO1") }, [{ name: "ของใหญ่", qty: 1, unitPriceSatang: 700_000 }]);
    if (r.code !== "CREDIT_LIMIT_EXCEEDED") p.push(`createSale → ${r.code}`);
    else if (r.r?.limitSatang !== 1_000_000 || r.r?.exposureSatang !== 400_000) p.push(`ตัวเลข ${short({ l: r.r?.limitSatang, e: r.r?.exposureSatang })}`);
    const rr = await reg("cr7-reg", "MGR", [pl("a", 24)], onAcc, { customerPartyId: P1, taxInvoice: buyerIn("CO1") });
    if (rr.code !== "CREDIT_LIMIT_EXCEEDED") p.push(`register ผู้จัดการ → ${rr.code}`);
    else if (rr.r?.limitSatang !== 1_000_000 || rr.r?.exposureSatang !== 400_000) p.push(`register ตัวเลข ${short({ l: rr.r?.limitSatang, e: rr.r?.exposureSatang })}`);
    if ((await counts()) !== c0) p.push("มีบิลเพิ่ม");
    chk("CR7", p.length === 0, "CREDIT_LIMIT_EXCEEDED {1,000,000 · 400,000}", NO() + joinP(p));
  });

  // ════════ PV2 (ตัวเลขวงเงินตามสิทธิ์) — ก่อน override ════════
  await blk("PV2", async () => {
    const p: string[] = [];
    const sc = await status("CASH", P1, 100_000);
    if (sc?.ok !== true) p.push(`แคชเชียร์ → ${codeOf(sc)}`);
    else {
      if (typeof sc.sufficient !== "boolean") p.push("แคชเชียร์ไม่มี sufficient");
      const leak = CREDIT_NUMBER_KEYS.filter((k) => sc[k] !== undefined && sc[k] !== null);
      if (leak.length) p.push(`แคชเชียร์เห็น ${leak.join(",")}`);
    }
    const sm = await status("MGR", P1, 100_000);
    if (sm?.ok !== true || typeof sm.limitSatang !== "number" || typeof sm.remainingSatang !== "number" || typeof sm.exposureSatang !== "number") p.push(`ผู้จัดการ ${short(sm, 100)}`);
    else if (sm.limitSatang !== 1_000_000 || sm.exposureSatang !== 400_000 || sm.remainingSatang !== 600_000 || sm.sufficient !== true) p.push(`ผู้จัดการ ตัวเลข ${short({ l: sm.limitSatang, e: sm.exposureSatang, r: sm.remainingSatang, s: sm.sufficient })}`);
    const rr = await reg("pv2-reg", "CASH", [pl("a", 24)], onAcc, { customerPartyId: P1, taxInvoice: buyerIn("CO1") });
    if (rr.code !== "CREDIT_LIMIT_EXCEEDED") p.push(`register แคชเชียร์ → ${rr.code}`);
    else if (rr.r?.limitSatang !== undefined || rr.r?.exposureSatang !== undefined) p.push("register แคชเชียร์ พกตัวเลขวงเงิน");
    const ls = await call(creditMod, "listCreditAccounts", pctx(), A("CASH"));
    if (!refused(ls, "PERMISSION_DENIED")) p.push(`listCreditAccounts แคชเชียร์ → ${codeOf(ls)}`);
    const lo = await call(creditMod, "listCreditAccounts", pctx(), A("OWNER"));
    if (lo?.ok !== true || itemsOf(lo).length < 6) p.push(`listCreditAccounts เจ้าของ → ${codeOf(lo)} ${itemsOf(lo).length} (ตัวควบคุมบวก)`);
    outputsForPrivacy.push(J(sc), J(sm), J(itemsOf(lo)));
    chk("PV2", p.length === 0, "แคชเชียร์ไม่เห็นตัวเลข · ผู้จัดการเห็น", NO() + joinP(p));
  });

  // ════════ CR8 override + VR6 กะ ════════
  let CR8: Sold = { ok: false, saleId: "", grand: 0, code: "-", r: null, key: "" };
  let CR8REG: Sold = { ok: false, saleId: "", grand: 0, code: "-", r: null, key: "" };
  let x0: Any = null;
  await blk("CR8", async () => {
    const p: string[] = [];
    const L = [{ name: `ชุดใหญ่ ${RAND}`, qty: 1, unitPriceSatang: 400_000 }, { name: `ชุดเสริม ${RAND}`, qty: 1, unitPriceSatang: 300_000 }];
    const rc = await cs("cr8-cash", { customerPartyId: P1, taxInvoice: buyerSnap("CO1"), creditOverrideByUserId: uid("CASH") }, L);
    if (rc.code !== "CREDIT_LIMIT_EXCEEDED") p.push(`override โดยแคชเชียร์ → ${rc.code}`);
    CR8 = await cs("cr8-mgr", { customerPartyId: P1, taxInvoice: buyerSnap("CO1"), creditOverrideByUserId: uid("MGR") }, L);
    if (!CR8.ok) p.push(`override ผู้จัดการ → ${CR8.code}`);
    else {
      const ct = (await saleRaw(CR8.saleId))?.creditTerms ?? {};
      if (ct.overrideBy !== uid("MGR") || ct.exposureSatang !== 400_000) p.push(`creditTerms ${short(ct, 100)}`);
      const au = (await audits(AUDIT_OVERRIDE)).filter((a) => a.after?.saleId === CR8.saleId);
      const want = { saleId: CR8.saleId, partyId: P1, byUserId: uid("MGR"), overSatang: 100_000 };
      if (au.length !== 1) p.push(`audit ${AUDIT_OVERRIDE} ${au.length} แถว`);
      else for (const [k, v] of Object.entries(want)) if (au[0].after?.[k] !== v) p.push(`audit.${k} ${short(au[0].after?.[k], 30)}`);
    }
    // register: PIN ผิด → PIN_INVALID (นับบนแถวผู้จัดการ) · PIN ถูก → บิล
    const pinRow = async () => Number((await P.posStaffPin.findFirst({ where: { tenantId: T, unitId: U.A, userId: uid("MGR") }, select: { failedCount: true } }).catch(() => null))?.failedCount ?? NaN);
    const f0 = await pinRow();
    const c0 = await counts();
    const bad = await reg("cr8-badpin", "CASH", [pl("a")], onAcc, { customerPartyId: P1, taxInvoice: buyerIn("CO1"), creditOverride: { managerUserId: uid("MGR"), managerPin: "0000" } });
    if (bad.code !== "PIN_INVALID") p.push(`PIN ผิด → ${bad.code}`);
    if ((await pinRow()) !== f0 + 1) p.push(`failedCount ${f0}→${await pinRow()} (คาด +1)`);
    if ((await counts()) !== c0) p.push("PIN ผิด มีบิล");
    if (SHIFT) x0 = await call(shiftMod, "xReport", ctxU("A", DEV), A("OWNER"), { shiftId: SHIFT });
    CR8REG = await reg("cr8-goodpin", "CASH", [pl("a")], onAcc, { customerPartyId: P1, taxInvoice: buyerIn("CO1"), creditOverride: { managerUserId: uid("MGR"), managerPin: MGR_PIN } });
    if (!CR8REG.ok) p.push(`PIN ถูก → ${CR8REG.code} ${short(CR8REG.r?.message ?? "", 60)}`);
    else if ((await saleRaw(CR8REG.saleId))?.creditTerms?.overrideBy !== uid("MGR")) p.push("register creditTerms.overrideBy ไม่ใช่ MGR");
    chk("CR8", p.length === 0, "override ผู้จัดการ + audit · แคชเชียร์ไม่ได้ · PIN ผิด/ถูก", NO() + joinP(p));
  });
  await blk("VR6", async () => {
    const p: string[] = [];
    if (!SHIFT) p.push("ไม่มีกะ (ฟิกซ์เจอร์)");
    const x1 = SHIFT ? await call(shiftMod, "xReport", ctxU("A", DEV), A("OWNER"), { shiftId: SHIFT }) : null;
    const a = x0?.report;
    const b = x1?.report;
    if (!a || !b) p.push(`xReport ${codeOf(x0)}/${codeOf(x1)}`);
    else {
      if (a.expectedCashSatang !== b.expectedCashSatang) p.push(`expectedCash ${a.expectedCashSatang}→${b.expectedCashSatang}`);
      if (a.cashSalesSatang !== b.cashSalesSatang) p.push(`cashSales ${a.cashSalesSatang}→${b.cashSalesSatang}`);
      const m0 = (a.byMethod ?? []).find((m: Any) => m.type === "ON_ACCOUNT") ?? { count: 0, amountSatang: 0 };
      const m1 = (b.byMethod ?? []).find((m: Any) => m.type === "ON_ACCOUNT");
      if (!m1 || m1.count !== m0.count + 1 || m1.amountSatang !== m0.amountSatang + (CR8REG.grand || 0)) p.push(`byMethod ON_ACCOUNT ${short(m0)}→${short(m1)}`);
    }
    if (!CR8REG.ok) p.push(`บิลเครดิตบนกะไม่มี (${CR8REG.code})`);
    chk("VR6", p.length === 0, "เงินสดที่ควรมีคงเดิม · ON_ACCOUNT ในรายวิธี", NO() + joinP(p));
  });

  // ════════ CR9 พร้อมกัน ════════
  await blk("CR9", async () => {
    const p: string[] = [];
    const L = [{ name: "ของพร้อมกัน", qty: 1, unitPriceSatang: 600_000 }];
    const [a, b] = await Promise.all([cs("cr9a", { customerPartyId: PP("CO5"), taxInvoice: buyerSnap("CO5") }, L), cs("cr9b", { customerPartyId: PP("CO5"), taxInvoice: buyerSnap("CO5") }, L)]);
    const oks = [a, b].filter((x) => x.ok);
    const no = [a, b].filter((x) => !x.ok);
    if (oks.length !== 1) p.push(`ผ่าน ${oks.length} ใบ (${a.code}/${b.code})`);
    if (no.length === 1 && (no[0]!.code !== "CREDIT_LIMIT_EXCEEDED" || no[0]!.r?.exposureSatang !== 600_000)) p.push(`ใบที่แพ้ ${no[0]!.code} exposure ${short(no[0]!.r?.exposureSatang)}`);
    const n = await P.posSale.count({ where: { tenantId: T, idempotencyKey: { in: [a.key, b.key] } } }).catch(() => -1);
    if (n !== 1) p.push(`บิลในฐาน ${n}`);
    chk("CR9", p.length === 0, "1 ผ่าน · 1 CREDIT_LIMIT_EXCEEDED (exposure 600,000)", NO() + joinP(p));
  });
  await pump();

  // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-F1): ช่องโหว่วงเงิน — ผู้ติดต่อเดิมเลขภาษีเดียวกันของ Party อื่นดูดใบแจ้งหนี้ ⇒ exposure 0 · ก่อนแก้ (b6e9838c) แดง · หลัง ดู wo-notes §fix2 ◂
  await blk("CR10", async () => {
    const p: string[] = [];
    if (fx) {
      chk("CR10", false, "ใบแจ้งหนี้ผูก P8 · exposure 400,000", NO());
      return;
    }
    const tax8 = taxIdOf(`0105${rnd(8)}`);
    const p8 = await P.party.create({ data: { tenantId: T, name: `${NAME_Q} แปด จำกัด`, kind: "COMPANY" } });
    const pOld = await P.party.create({ data: { tenantId: T, name: `${NAME_Q} เดิม จำกัด`, kind: "COMPANY" } });
    const old = await accSvc.findOrCreateCustomerContact(bookCtx(), { name: `${NAME_Q} เดิม จำกัด`, taxId: tax8, branchCode: "00000", partyId: pOld.id });
    const cOld = String(old?.id ?? "");
    const sv = await call(creditMod, "saveCreditAccount", pctx(), A("OWNER"), { partyId: p8.id, limitSatang: 1_000_000, termDays: null, active: true });
    if (sv?.ok !== true) p.push(`saveCreditAccount P8 ${codeOf(sv)}`);
    const buyer = { kind: "JURISTIC", name: `${NAME_Q} แปด จำกัด`, taxId: tax8, branchCode: "00000", address: `99 ถนนคิวซี เขตทดสอบ กรุงเทพฯ 10110`, email: null, source: "MANUAL", requestedAt: new Date().toISOString() };
    const sale = await cs("cr10", { customerPartyId: p8.id, taxInvoice: buyer }, [{ name: "ของบริษัทแปด", qty: 1, unitPriceSatang: 400_000 }]);
    if (!sale.ok) p.push(`createSale → ${sale.code}`);
    await pump();
    const inv = (await docsOf(sale.saleId)).filter((d) => d.docType === "INVOICE");
    if (inv.length !== 1) p.push(`INVOICE ${inv.length} ใบ`);
    const ct = inv[0]?.contactId ? await P.accountContact.findUnique({ where: { id: inv[0].contactId }, select: { id: true, partyId: true } }).catch(() => null) : null;
    if (inv[0] && inv[0].contactId === cOld) p.push("ใบแจ้งหนี้ผูก C_old (ผู้ติดต่อเลขภาษีเดียวกันของ Party อื่น)");
    if (ct && ct.partyId !== p8.id) p.push(`ผู้ติดต่อของใบแจ้งหนี้ partyId ≠ P8`);
    const oldNow = cOld ? await P.accountContact.findUnique({ where: { id: cOld }, select: { partyId: true } }).catch(() => null) : null;
    if (oldNow?.partyId !== pOld.id) p.push("C_old ถูกเปลี่ยน partyId");
    const st = await status("MGR", p8.id, 0);
    if (st?.ok !== true || st.exposureSatang !== 400_000) p.push(`exposure P8 ${short(st?.exposureSatang)} (คาด 400,000)`);
    chk("CR10", p.length === 0, "ใบแจ้งหนี้ผูก P8 · exposure 400,000", NO() + joinP(p));
  });

  // ════════ AR4–AR6 รับเงิน ════════
  const PAY_KEY = newKey("pay");
  let PAYID = "";
  await blk("AR4", async () => {
    const p: string[] = [];
    if (!INV1) p.push("ไม่มี INVOICE ของ CR1");
    else {
      const r = await call(accSvc, "recordPayment", T, S.ACC, INV1.id, { amount: 400_000, channel: "TRANSFER", financeAccountId: FIN || null, idempotencyKey: PAY_KEY, createdById: uid("OWNER") });
      if (r?.ok !== true) p.push(`recordPayment → ${codeOf(r)} ${short(r?.reason ?? r?.message ?? "", 60)}`);
      PAYID = String(r?.paymentId ?? "");
      const d = await P.accountDocument.findUnique({ where: { id: INV1.id } }).catch(() => null);
      if (d?.status !== "PAID") p.push(`status ${d?.status}`);
      const e = (await jvWhere({ idempotencyKey: `AccountDocumentPayment#${PAYID}#PAYMENT` }))[0];
      if (!e) p.push("ไม่มี JV รับเงิน");
      else {
        const dr = e.lines.filter((l) => /^10/.test(l.code) && l.debit > 0).reduce((n, l) => n + l.debit, 0);
        const cr = e.lines.filter((l) => l.code === "1100");
        if (dr !== 400_000) p.push(`Dr เงิน ${dr}`);
        if (cr.length !== 1 || cr[0]!.credit !== 400_000 || cr[0]!.contactId !== AC1) p.push(`Cr 1100 ${short(cr, 80)}`);
      }
    }
    chk("AR4", p.length === 0, "PAID · Dr เงิน / Cr 1100", NO() + joinP(p));
  });
  await blk("AR5", async () => {
    const p: string[] = [];
    if (!INV1) p.push("ไม่มี INVOICE ของ CR1");
    else {
      const r = await call(accSvc, "recordPayment", T, S.ACC, INV1.id, { amount: 400_000, channel: "TRANSFER", financeAccountId: FIN || null, idempotencyKey: PAY_KEY, createdById: uid("OWNER") });
      if (r?.ok !== true || String(r.paymentId ?? "") !== PAYID) p.push(`ซ้ำ → ${codeOf(r)} ${short(r?.paymentId, 30)}`);
      const n = await P.accountDocumentPayment.count({ where: { documentId: INV1.id } }).catch(() => -1);
      if (n !== 1) p.push(`payment ${n} แถว`);
      const e2 = await jvWhere({ idempotencyKey: `AccountDocumentPayment#${PAYID}#PAYMENT` });
      if (e2.length !== 1) p.push(`JV รับเงิน ${e2.length}`);
    }
    chk("AR5", p.length === 0, "paymentId เดิม · 1 แถว · 1 JV", NO() + joinP(p));
  });
  await pump();
  await blk("AR6", async () => {
    const p: string[] = [];
    const rows = await dealPays(DL.D3 ?? "");
    const pos = rows.filter((r) => r.refType === "POS_SALE");
    const pay = rows.filter((r) => r.refType === "PAYMENT");
    if (pos.length !== 1 || pos[0]?.status !== "COUNTED" || Number(pos[0]?.satang) !== 400_000 || pos[0]?.refId !== CR1.saleId) p.push(`POS_SALE ${short(pos.map((r) => [r.status, Number(r.satang)]), 80)}`);
    if (pay.length) p.push(`มีแถว PAYMENT ${pay.length} (นับซ้ำ)`);
    if (rows.length !== pos.length + pay.length) p.push(`แถวอื่น ${rows.map((r) => r.refType).join(",")}`);
    const paid = await dealPaid(DL.D3 ?? "");
    if (paid !== 400_000) p.push(`paidSatang ${paid}`);
    chk("AR6", p.length === 0, "POS_SALE COUNTED 400,000 แถวเดียว", NO() + joinP(p));
  });

  // ════════ VR1–VR5 ════════
  await blk("VR1", async () => {
    const p: string[] = [];
    const s = await cs("vr1", { customerPartyId: PP("CO4"), taxInvoice: buyerSnap("CO4") }, [{ name: "ยกเลิกได้", qty: 1, unitPriceSatang: 100_000 }]);
    if (!s.ok) p.push(`ขาย → ${s.code}`);
    await pump();
    const e0 = (await status("MGR", PP("CO4")))?.exposureSatang;
    const v = s.ok ? await call(posSvc, "voidSale", T, U.A, s.saleId, { actorUserId: uid("OWNER"), reason: `ยกเลิกทดสอบ ${RAND}` }) : null;
    if (v?.ok === false) p.push(`voidSale → ${codeOf(v)}`);
    await pump();
    if ((await saleRow(s.saleId))?.status !== "VOIDED") p.push("บิลไม่ VOIDED");
    const inv = (await docsOf(s.saleId)).filter((d) => d.docType === "INVOICE");
    if (inv.length !== 1 || inv[0].status !== "VOIDED") p.push(`INVOICE ${inv.map((d) => d.status).join(",") || "ไม่มี"}`);
    const n = net(await jvWhere({ refType: "PosSale", refId: s.saleId || "-" }));
    if ((n["1100"] ?? 0) !== 0) p.push(`1100 สุทธิ ${n["1100"]}`);
    const e1 = (await status("MGR", PP("CO4")))?.exposureSatang;
    if (typeof e0 !== "number" || e1 !== e0 - 100_000) p.push(`exposure P4 ${short(e0)}→${short(e1)}`);
    chk("VR1", p.length === 0, "VOIDED · INVOICE VOIDED · JV กลับ · exposure −100,000", NO() + joinP(p));
  });
  await blk("VR2", async () => {
    const p: string[] = [];
    const jv0 = (await jvWhere({ refType: "PosSale", refId: CR1.saleId || "-" })).length;
    const ob0 = await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => -1);
    const v = CR1.ok ? await call(posSvc, "voidSale", T, U.A, CR1.saleId, { actorUserId: uid("OWNER"), reason: `ยกเลิกบิลที่รับเงินแล้ว ${RAND}` }) : { ok: false, code: "NO_SALE" };
    if (codeOf(v) !== "CREDIT_INVOICE_PAID") p.push(`voidSale → ${codeOf(v)}`);
    await pump();
    if ((await saleRow(CR1.saleId))?.status !== "PAID") p.push("บิลไม่คง PAID");
    if (INV1 && (await P.accountDocument.findUnique({ where: { id: INV1.id } }).catch(() => null))?.status !== "PAID") p.push("INVOICE ไม่คง PAID");
    if ((await jvWhere({ refType: "PosSale", refId: CR1.saleId || "-" })).length !== jv0) p.push("JV เพิ่ม");
    if ((await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => -1)) !== ob0) p.push("มี pos.sale.voided เพิ่ม");
    chk("VR2", p.length === 0, "CREDIT_INVOICE_PAID · ไม่มีอะไรเปลี่ยน", NO() + joinP(p));
  });
  let refundOk = false;
  let ex0: Any = null;
  await blk("VR3", async () => {
    const p: string[] = [];
    await pump();
    ex0 = (await status("MGR", P1))?.exposureSatang;
    const a0 = (await aging(AC1))?.totalSatang;
    const s = await saleRow(CR8.saleId);
    const line = (s?.lines ?? []).find((l: Any) => l.unitPriceSatang === 300_000);
    if (!line) p.push("ไม่มีบรรทัด ฿3,000 ของบิล override");
    const r = line ? await call(refundMod, "refundSale", ctxU("A", DEV), A("OWNER"), { saleId: CR8.saleId, lines: [{ lineId: line.id, qty: 1 }], payMethods: [{ type: "ON_ACCOUNT", amountSatang: 300_000 }], reasonCode: "DAMAGED", idempotencyKey: newKey("vr3") }) : null;
    if (r?.ok !== true) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    refundOk = r?.ok === true;
    const rid = String(r?.refund?.id ?? r?.refundSaleId ?? r?.saleId ?? "");
    const rpay = rid ? ((await P.posPayment.findMany({ where: { saleId: rid } }).catch(() => [])) as Any[]) : [];
    if (refundOk && (rpay.length !== 1 || rpay[0].type !== "ON_ACCOUNT" || Math.abs(rpay[0].amountSatang) !== 300_000)) p.push(`แถวคืน ${short(rpay.map((x) => [x.type, x.amountSatang]))}`);
    await pump();
    const inv = (await docsOf(CR8.saleId)).find((d) => d.docType === "INVOICE");
    const cn = inv ? ((await P.accountDocument.findMany({ where: { tenantId: T, docType: "CREDIT_NOTE", sourceDocId: inv.id } }).catch(() => [])) as Any[]) : [];
    if (!inv) p.push("บิล override ไม่มี INVOICE");
    if (cn.length !== 1 || cn[0]?.grandTotal !== 300_000) p.push(`CREDIT_NOTE ${short(cn.map((d) => [d.status, d.grandTotal]))}`);
    const a1 = (await aging(AC1))?.totalSatang;
    if (typeof a0 !== "number" || a1 !== a0 - 300_000) p.push(`ค้าง CO1 ${short(a0)}→${short(a1)} (คาด −300,000)`);
    chk("VR3", p.length === 0, "ใบคืน ON_ACCOUNT · CREDIT_NOTE → INVOICE · ค้าง −300,000", NO() + joinP(p));
  });
  await blk("VR4", async () => {
    const p: string[] = [];
    const s = await saleRow(CR8.saleId);
    const line = (s?.lines ?? []).find((l: Any) => l.unitPriceSatang === 400_000);
    const n0 = await P.posSale.count({ where: { tenantId: T, docType: "REFUND" } }).catch(() => -1);
    for (const t of ["CASH", "TRANSFER"]) {
      const r = line ? await call(refundMod, "refundSale", ctxU("A", DEV), A("OWNER"), { saleId: CR8.saleId, lines: [{ lineId: line.id, qty: 1 }], payMethods: [{ type: t, amountSatang: 400_000 }], reasonCode: "DAMAGED", idempotencyKey: newKey(`vr4${t}`) }) : null;
      if (!refused(r, "REFUND_METHOD_INVALID", "REFUND_TENDER_MISMATCH")) p.push(`${t} → ${codeOf(r)}`);
    }
    const cashBill = await reg("vr4-cash", "OWNER", [pl("c")], cash, { cashReceivedSatang: 10_000 });
    const cl = (await saleRow(cashBill.saleId))?.lines?.[0];
    const r2 = cl ? await call(refundMod, "refundSale", ctxU("A", DEV), A("OWNER"), { saleId: cashBill.saleId, lines: [{ lineId: cl.id, qty: 1 }], payMethods: [{ type: "ON_ACCOUNT", amountSatang: cashBill.grand }], reasonCode: "DAMAGED", idempotencyKey: newKey("vr4onacc") }) : { ok: false, code: `NO_BILL:${cashBill.code}` };
    if (r2?.ok !== false || String(r2.code).startsWith("NO_BILL")) p.push(`ON_ACCOUNT บนบิลเงินสด → ${codeOf(r2)}`);
    const n1 = await P.posSale.count({ where: { tenantId: T, docType: "REFUND" } }).catch(() => -1);
    if (n1 !== n0) p.push(`ใบคืนเพิ่ม ${n0}→${n1}`);
    chk("VR4", p.length === 0, "REFUND_METHOD_INVALID ×2 · ON_ACCOUNT บนบิลเงินสดปฏิเสธ", NO() + joinP(p));
  });
  await blk("VR5", async () => {
    const p: string[] = [];
    await pump();
    const e1 = (await status("MGR", P1))?.exposureSatang;
    if (!refundOk) p.push("ไม่มีการคืน (VR3)");
    if (typeof ex0 !== "number" || e1 !== ex0 - 300_000) p.push(`exposure P1 ${short(ex0)}→${short(e1)} (คาด −300,000)`);
    chk("VR5", p.length === 0, "exposure −300,000", NO() + joinP(p));
  });

  // ════════ DL ดีล ════════
  const P35 = !P35_MISSING;
  if (P35) {
    await step("ค่าคอมฯ พนักงาน (P3.5)", () => patchPos((pos) => (pos.staffCommission = { enabled: true, defaultBp: 300, byCategory: {}, byProduct: {}, sellerRoles: ["STAFF", "MANAGER"] })));
  }
  const paidD1before = await dealPaid(DL.D1 ?? "");
  let cm2DealGrand = 0;
  let DL1: Sold & { q?: Any } = { ok: false, saleId: "", grand: 0, code: "-", r: null, key: "" };
  await blk("DL1", async () => {
    const p: string[] = [];
    DL1 = await reg("dl1", "SALES1", [pl("a"), pl("b")], cash, { cashReceivedSatang: 50_000, customerPartyId: P1, crmDealId: DL.D1 });
    if (!DL1.ok) p.push(`submit → ${DL1.code} ${short(DL1.r?.message ?? "", 60)}`);
    if ((await saleRaw(DL1.saleId))?.crmDealId !== DL.D1) p.push("PosSale.crmDealId ไม่ใช่ D1");
    await pump();
    const rows = (await dealPays(DL.D1 ?? "")).filter((r) => r.refId === DL1.saleId);
    if (rows.length !== 1 || rows[0].refType !== "POS_SALE" || rows[0].status !== "COUNTED" || Number(rows[0].satang) !== DL1.grand) p.push(`แถว ${short(rows.map((r) => [r.refType, r.status, Number(r.satang)]))}`);
    const paid = await dealPaid(DL.D1 ?? "");
    if (paid !== paidD1before + (DL1.grand || 0)) p.push(`paidSatang ${paidD1before}→${paid}`);
    chk("DL1", p.length === 0, "crmDealId D1 · COUNTED = grand", NO() + joinP(p));
  });
  await blk("DL2", async () => {
    const p: string[] = [];
    const paid0 = await dealPaid(DL.D1 ?? "");
    const rp = await replay("pos.sale.paid", DL1.saleId, 2);
    if (rp) p.push(rp);
    const rows = (await dealPays(DL.D1 ?? "")).filter((r) => r.refId === DL1.saleId);
    if (rows.length !== 1) p.push(`แถว ${rows.length}`);
    if ((await dealPaid(DL.D1 ?? "")) !== paid0) p.push("paidSatang เปลี่ยน");
    chk("DL2", p.length === 0, "1 แถว · paid คงเดิม", NO() + joinP(p));
  });
  await blk("DL3", async () => {
    const p: string[] = [];
    const c0 = await counts();
    // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-B1 DL3): คีย์ idempotency ต้องผ่านสัญญาผลิตภัณฑ์ regIsIdemKey (/^[A-Za-z0-9_-]{8,100}$/ · register.ts:677) —
    //   คีย์ใช้ slug ASCII (newKey ต่อ RAND) · ป้ายไทยใช้เฉพาะข้อความตอนล้ม · เดิม `dl3-${lbl}` (ไทย+ช่องว่าง ⇒ VALIDATION ก่อนถึงตรวจดีล) · ก่อน 45/47 (DL3 PV3) → หลัง ดู wo-notes §fix1 ◂
    for (const [lbl, slug, id] of [["D2", "dl3-d2", DL.D2], ["D4 ปิดแล้ว", "dl3-d4-closed", DL.D4], ["id มั่ว", "dl3-nodeal", `nodeal${RAND}`]] as const) {
      const r = await reg(slug, "SALES1", [pl("c")], cash, { cashReceivedSatang: 10_000, customerPartyId: P1, crmDealId: id });
      if (r.code !== "DEAL_INVALID") p.push(`${lbl} → ${r.code}`);
    }
    if ((await counts()) !== c0) p.push("มีบิลเพิ่ม");
    chk("DL3", p.length === 0, "DEAL_INVALID ×3 · ไม่มีบิล", NO() + joinP(p));
  });
  await blk("DL4", async () => {
    const p: string[] = [];
    const ids = (r: Any) => itemsOf(r).map((x: Any) => x.id);
    const c = await call(crmLink, "registerDealOptions", ctxU("A"), A("CASH"), { customerPartyId: P1 });
    if (c?.ok === false || ids(c).length) p.push(`แคชเชียร์ → ${codeOf(c)} ${ids(c).length} แถว`);
    const s = await call(crmLink, "registerDealOptions", ctxU("A"), A("SALES1"), { customerPartyId: P1 });
    const si = ids(s);
    if (!si.includes(DL.D1) || !si.includes(DL.D3)) p.push(`SALES1+P1 ไม่มี D1/D3 (${codeOf(s)} ${si.length})`);
    if (si.includes(DL.D2) || si.includes(DL.D4)) p.push("SALES1+P1 มี D2/D4");
    const m = await call(crmLink, "registerDealOptions", ctxU("A"), A("SALES1"), { memberId: M1 });
    if (!ids(m).includes(DL.D1)) p.push(`SALES1+M1 ไม่มี D1 (${codeOf(m)})`);
    for (const r of [...itemsOf(s), ...itemsOf(m)]) {
      const extra = Object.keys(r).filter((k) => !DEAL_OPTION_KEYS.includes(k));
      if (extra.length) p.push(`คีย์เกิน ${extra.join(",")}`);
    }
    chk("DL4", p.length === 0, "แคชเชียร์ [] · SALES1 D1 D3", NO() + joinP([...new Set(p)]));
  });
  // CM1 (ต้องอยู่ก่อนคืนเงินของ DL5)
  await blk("CM1", async () => {
    if (!P35) return skipChk("CM1", P35_MISSING);
    const p: string[] = [];
    const acc = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosStaffCommission" WHERE "tenantId" = $1 AND "saleId" = $2 AND "kind"::text = 'ACCRUE'`, T, DL1.saleId || "-").catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    if (acc !== 0) p.push(`ACCRUE ของบิลดีล ${acc} แถว (คาด 0)`);
    const cm = (await P.crmCommission.findMany({ where: { tenantId: T, dealId: DL.D1 ?? "-" } }).catch(() => [])) as Any[];
    if (!cm.length || !cm.every((c) => c.userId === uid("SALES1"))) p.push(`CrmCommission ${cm.length} แถว ${short(cm.map((c) => c.userId === uid("SALES1")))}`);
    const d = callSync(setShared, "posStaffCommission", {});
    if (d?.skipDealBills !== true) p.push(`posStaffCommission({}).skipDealBills ${short(d?.skipDealBills)}`);
    chk("CM1", p.length === 0, "ACCRUE 0 · CrmCommission SALES1", NO() + joinP(p));
  });
  await blk("CM2", async () => {
    if (!P35) return skipChk("CM2", P35_MISSING);
    const p: string[] = [];
    const accOf = async (saleId: string) => Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosStaffCommission" WHERE "tenantId" = $1 AND "saleId" = $2 AND "kind"::text = 'ACCRUE'`, T, saleId || "-").catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    const plain = await reg("cm2-plain", "SALES1", [pl("b")], cash, { cashReceivedSatang: 20_000 });
    await pump();
    if ((await accOf(plain.saleId)) < 1) p.push(`บิลไม่มีดีล ACCRUE ${await accOf(plain.saleId)} (${plain.code})`);
    await step("skipDealBills false", () => patchPos((pos) => (pos.staffCommission = { ...(isRecord(pos.staffCommission) ? pos.staffCommission : {}), skipDealBills: false })));
    const deal = await reg("cm2-deal", "SALES1", [pl("c")], cash, { cashReceivedSatang: 10_000, customerPartyId: P1, crmDealId: DL.D1 });
    await pump();
    if (deal.ok) cm2DealGrand = deal.grand;
    if ((await accOf(deal.saleId)) < 1) p.push(`skipDealBills false บิลดีล ACCRUE ${await accOf(deal.saleId)} (${deal.code})`);
    await step("skipDealBills true", () => patchPos((pos) => (pos.staffCommission = { ...(isRecord(pos.staffCommission) ? pos.staffCommission : {}), skipDealBills: true })));
    chk("CM2", p.length === 0, "ไม่มีดีล ACCRUE ≥ 1 · สวิตช์ปิด = ACCRUE", NO() + joinP(p));
  });
  await blk("DL5", async () => {
    const p: string[] = [];
    const s = await saleRow(DL1.saleId);
    const la = (s?.lines ?? []).find((l: Any) => l.productId === PR.a);
    const lb = (s?.lines ?? []).find((l: Any) => l.productId === PR.b);
    if (!la || !lb) p.push("บิล DL1 ไม่มีบรรทัด ก/ข");
    const rf = async (line: Any, k: string) => (line ? await call(refundMod, "refundSale", ctxU("A", DEV), A("OWNER"), { saleId: DL1.saleId, lines: [{ lineId: line.id, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: line.lineTotalSatang }], reasonCode: "CHANGED_MIND", idempotencyKey: newKey(k) }) : null);
    const r1 = await rf(lb, "dl5a");
    if (r1?.ok !== true) p.push(`คืน ข → ${codeOf(r1)}`);
    const rid1 = String(r1?.refund?.id ?? r1?.refundSaleId ?? "");
    await pump();
    const rowsOf = async () => (await dealPays(DL.D1 ?? "")).filter((r) => r.refType === "POS_REFUND" || r.refId === DL1.saleId);
    const neg1 = (await rowsOf()).filter((r) => r.refType === "POS_REFUND");
    if (neg1.length !== 1 || Number(neg1[0].satang) !== -(lb?.lineTotalSatang ?? 0) || (rid1 && neg1[0].refId !== rid1)) p.push(`POS_REFUND หลังคืน ข ${short(neg1.map((r) => [r.refId === rid1, Number(r.satang)]))}`);
    const r2 = await rf(la, "dl5b");
    if (r2?.ok !== true) p.push(`คืน ก → ${codeOf(r2)}`);
    await pump();
    const all = await rowsOf();
    const sum = all.filter((r) => r.status !== "REVERSED").reduce((n, r) => n + Number(r.satang), 0);
    if (sum !== 0) p.push(`Σ แถวของบิล ${sum} (คาด 0)`);
    const paidNow = await dealPaid(DL.D1 ?? "");
    if (paidNow !== paidD1before + cm2DealGrand) p.push(`paidSatang ${paidD1before}→${paidNow} (คาด +${cm2DealGrand} ของบิลดีล CM2)`);
    const nAll = all.length;
    for (const rid of [rid1, String(r2?.refund?.id ?? r2?.refundSaleId ?? "")].filter(Boolean)) {
      const rows = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.refunded" } }).catch(() => [])) as Any[]).filter((e) => J(e.payload).includes(rid));
      for (const row of rows) {
        try {
          await CONS["pos.sale.refunded"]?.(evtOf(row));
        } catch (e) {
          p.push(`เล่นซ้ำ refunded โยน: ${String((e as Error)?.message ?? e).slice(0, 60)}`);
        }
      }
    }
    if ((await rowsOf()).length !== nAll) p.push(`เล่นซ้ำ แถว ${nAll}→${(await rowsOf()).length}`);
    chk("DL5", p.length === 0, "POS_REFUND −ส่วน · Σ 0 · เล่นซ้ำคงเดิม", NO() + joinP(p));
  });
  await blk("DL6", async () => {
    const p: string[] = [];
    await setCrm(S.CRM!, { bridgesEnabled: false });
    const s = await cs("dl6", { crmDealId: DL.D1, payMethods: [{ type: "CASH", amountSatang: 100_000 }] });
    if (!s.ok) p.push(`createSale → ${s.code}`);
    await pump();
    const n0 = (await dealPays(DL.D1 ?? "")).filter((r) => r.refId === s.saleId).length;
    if (n0 !== 0) p.push(`สะพานปิดแต่มีแถว ${n0}`);
    await setCrm(S.CRM!, { bridgesEnabled: true });
    const w = await call(crmLink, "sweepDealIntents", { tenantId: T, now: new Date() });
    if (w?.ok === false) p.push(`sweep → ${codeOf(w)}`);
    const rows = (await dealPays(DL.D1 ?? "")).filter((r) => r.refId === s.saleId);
    if (rows.length !== 1 || rows[0].status !== "COUNTED") p.push(`หลัง sweep ${short(rows.map((r) => r.status))}`);
    await call(crmLink, "sweepDealIntents", { tenantId: T, now: new Date() });
    if ((await dealPays(DL.D1 ?? "")).filter((r) => r.refId === s.saleId).length !== 1) p.push("sweep ซ้ำ แถวเพิ่ม");
    chk("DL6", p.length === 0, "ปิด = 0 · sweep = 1 · ซ้ำ = 1", NO() + joinP(p));
  });
  await setCrm(S.CRM!, { bridgesEnabled: true }).catch(() => null);

  // ════════ MB สมาชิกบนบิลออเดอร์ ════════
  const O = (fn: string, ...args: unknown[]) => call(ordMod, fn, ...args);
  const salesOfOrder = async (orderId: string): Promise<Any[]> => (orderId ? ((await P.posSale.findMany({ where: { tenantId: T, sourceModule: "POS", sourceId: orderId } }).catch(() => [])) as Any[]) : []);
  const spent = async () => Number((await P.customer.findUnique({ where: { id: M1 || "-" }, select: { totalSpentSatang: true } }).catch(() => null))?.totalSpentSatang ?? NaN);
  const ptsOf = async (saleId: string) => ((await P.pointLedger.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId || "-" } }).catch(() => [])) as Any[]);
  const ptsBalance = async () => Number((await P.pointLedger.aggregate({ where: { tenantId: T, customerId: M1 || "-" }, _sum: { delta: true } }).catch(() => null))?._sum?.delta ?? 0);
  const mkChat = async (label: string): Promise<{ orderId: string; sale: Any; code: string }> => {
    const r = await O("ingestOrder", ctxU("A", DEV), A("OWNER"), { channelId: CH.CHAT ?? "none", idempotencyKey: newKey(label), lines: [pl("a"), pl("b")], customer: { name: `คุณสมาชิก ${RAND}`, memberId: M1 }, fulfilment: "PICKUP", paymentState: "PAY_ON_PICKUP" });
    const id = r?.ok === true ? String(r.orderId ?? "") : "";
    if (!id) return { orderId: "", sale: null, code: `ingest:${codeOf(r)}` };
    for (const fn of ["acceptOrder", "markPreparing", "markReady"]) await O(fn, ctxU("A", DEV), A("OWNER"), { id });
    const o = await P.posOrder.findUnique({ where: { id } }).catch(() => null);
    const pay = await O("payOrder", ctxU("A", DEV), A("OWNER"), { id, idempotencyKey: newKey(`${label}pay`), payMethods: [{ type: "CASH", amountSatang: o?.totalSatang ?? 0 }], cashReceivedSatang: o?.totalSatang ?? 0 });
    return { orderId: id, sale: (await salesOfOrder(id))[0] ?? null, code: codeOf(pay) };
  };
  const mkLm = async (label: string): Promise<{ orderId: string; sale: Any; code: string }> => {
    const r = await O("ingestOrder", ctxU("A", DEV), A("OWNER"), { channelId: CH.LM ?? "none", externalRef: `LM-${RAND}-${label}`, idempotencyKey: newKey(label), lines: [pl("c", 2)], customer: { name: `คุณสมาชิก ${RAND}`, memberId: M1 }, fulfilment: "DELIVERY", address: "คอนโดคิวซี" });
    const id = r?.ok === true ? String(r.orderId ?? "") : "";
    if (!id) return { orderId: "", sale: null, code: `ingest:${codeOf(r)}` };
    if (!(await salesOfOrder(id)).length) await O("acceptOrder", ctxU("A", DEV), A("OWNER"), { id });
    return { orderId: id, sale: (await salesOfOrder(id))[0] ?? null, code: "OK" };
  };
  const spent0 = await spent();
  let chat: { orderId: string; sale: Any; code: string } = { orderId: "", sale: null, code: "-" };
  let lm: { orderId: string; sale: Any; code: string } = { orderId: "", sale: null, code: "-" };
  await blk("MB1", async () => {
    const p: string[] = [];
    const def = callSync(setShared, "posOrderMemberOnBill", undefined);
    if (def !== true) p.push(`posOrderMemberOnBill(undefined) ${short(def)}`);
    if (callSync(setShared, "posOrderMemberOnBill", { pos: { orders: { memberOnBill: false } } }) !== false) p.push("posOrderMemberOnBill(false) ไม่ false");
    chat = await mkChat("mb1chat");
    lm = await mkLm("mb1lm");
    for (const [lbl, x] of [["CHAT", chat], ["LINEMAN", lm]] as const) {
      const s = x.sale;
      if (!s) {
        p.push(`${lbl} ไม่มีบิล (${x.code})`);
        continue;
      }
      const o = await P.posOrder.findUnique({ where: { id: x.orderId } }).catch(() => null);
      if (s.memberId !== M1) p.push(`${lbl} memberId ${short(s.memberId, 20)}`);
      if (s.tierDiscountSatang !== 0) p.push(`${lbl} tierDiscount ${s.tierDiscountSatang}`);
      if (s.memberBenefits !== null) p.push(`${lbl} memberBenefits ไม่ null`);
      if (s.grandTotalSatang !== o?.totalSatang) p.push(`${lbl} grand ${s.grandTotalSatang} ≠ ออเดอร์ ${o?.totalSatang}`);
      if (s.memberSnapshot?.memberCode !== M1CODE) p.push(`${lbl} memberSnapshot ${short(s.memberSnapshot, 60)}`);
    }
    await step("memberOnBill false", () => patchPos((pos) => (pos.orders = { ...(isRecord(pos.orders) ? pos.orders : {}), memberOnBill: false })));
    const off = await mkChat("mb1off");
    if (!off.sale) p.push(`memberOnBill false ไม่มีบิล (${off.code})`);
    else if (off.sale.memberId !== null) p.push("memberOnBill false บิลยังมีสมาชิก");
    await step("memberOnBill true", () => patchPos((pos) => (pos.orders = { ...(isRecord(pos.orders) ? pos.orders : {}), memberOnBill: true })));
    chk("MB1", p.length === 0, "memberId M1 · tier 0 · benefits null · สวิตช์", FXB(joinP(p)));
  });
  await pump();
  let earnedChat = 0;
  await blk("MB2", async () => {
    const p: string[] = [];
    for (const [lbl, x] of [["CHAT", chat], ["LINEMAN", lm]] as const) {
      const rows = (await ptsOf(x.sale?.id ?? "")).filter((r) => r.delta > 0);
      if (rows.length !== 1) p.push(`${lbl} แต้ม ${rows.length} รายการ`);
      if (lbl === "CHAT") earnedChat = rows.reduce((n, r) => n + r.delta, 0);
    }
    const want = spent0 + (chat.sale?.grandTotalSatang ?? 0) + (lm.sale?.grandTotalSatang ?? 0);
    if ((await spent()) !== want) p.push(`ยอดสะสม ${spent0}→${await spent()} (คาด ${want})`);
    for (const x of [chat, lm]) if (x.sale?.id) await replay("pos.sale.paid", x.sale.id, 1);
    for (const [lbl, x] of [["CHAT", chat], ["LINEMAN", lm]] as const) if ((await ptsOf(x.sale?.id ?? "")).filter((r) => r.delta > 0).length !== 1) p.push(`${lbl} เล่นซ้ำ แต้มเพิ่ม`);
    if ((await spent()) !== want) p.push("เล่นซ้ำ ยอดสะสมเพิ่ม");
    chk("MB2", p.length === 0, "แต้ม 1 รายการ/บิล · ยอดสะสม + Σ grand", FXB(joinP(p)));
  });
  await blk("MB3", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const base = (over: Any) => ({ tenantId: T, unitId: U.A, systemId: S.POS, memberSystemId: S.MEM, idempotencyKey: newKey("mb3"), lines: [{ name: "ของ", qty: 1, unitPriceSatang: 50_000 }], payMethods: [{ type: "CASH", amountSatang: 50_000 }], ...over });
    for (const [lbl, over] of [
      ["memberChoices", { memberId: M1, memberAttachOnly: true, memberChoices: { voucherIds: [] } }],
      ["STORE_CREDIT", { memberId: M1, memberAttachOnly: true, payMethods: [{ type: "STORE_CREDIT", amountSatang: 50_000 }] }],
      ["ไม่มี memberId", { memberAttachOnly: true }],
    ] as const) {
      const r = fx ? null : await call(posSvc, "createSale", base(over));
      if (codeOf(r) !== "VALIDATION") p.push(`${lbl} → ${codeOf(r)}`);
    }
    if ((await counts()) !== c0) p.push("มีบิลเพิ่ม");
    const ok = fx ? null : await call(posSvc, "createSale", base({ memberId: M1, memberAttachOnly: true }));
    const s = ok?.saleId ? await saleRow(ok.saleId) : null;
    if (!s) p.push(`attach-only ปกติ → ${codeOf(ok)}`);
    else if (s.tierDiscountSatang !== 0 || s.grandTotalSatang !== 50_000 || s.memberId !== M1 || s.memberBenefits !== null) p.push(`attach-only ${short({ t: s.tierDiscountSatang, g: s.grandTotalSatang, m: s.memberId === M1, b: s.memberBenefits })}`);
    chk("MB3", p.length === 0, "VALIDATION ×3 · attach-only ไม่ลดราคา", FXB(joinP(p)));
  });
  await blk("MB4", async () => {
    const p: string[] = [];
    await pump();
    const b0 = await ptsBalance();
    const s0 = await spent();
    const v = chat.sale?.id ? await call(posSvc, "voidSale", T, U.A, chat.sale.id, { actorUserId: uid("OWNER"), reason: `ยกเลิกออเดอร์ ${RAND}` }) : { ok: false, code: "NO_SALE" };
    if (v?.ok === false) p.push(`voidSale → ${codeOf(v)}`);
    await pump();
    if (!earnedChat) p.push("บิล CHAT ไม่มีแต้มให้ย้อน");
    if ((await ptsBalance()) !== b0 - earnedChat) p.push(`แต้ม ${b0}→${await ptsBalance()} (คาด −${earnedChat})`);
    if ((await spent()) !== s0 - (chat.sale?.grandTotalSatang ?? 0)) p.push(`ยอดสะสม ${s0}→${await spent()}`);
    chk("MB4", p.length === 0, "แต้ม/ยอดสะสมย้อน", FXB(joinP(p)));
  });
  await blk("MB5", async () => {
    const p: string[] = [];
    const r = await reg("mb5", "OWNER", [pl("a")], cash, { cashReceivedSatang: 30_000, memberId: M1 });
    const s = await saleRow(r.saleId);
    if (!s) p.push(`register สมาชิก → ${r.code} ${short(r.r?.message ?? "", 60)}`);
    else if (!(s.tierDiscountSatang > 0) || s.memberBenefits === null || s.memberId !== M1) p.push(`tierDiscount ${s.tierDiscountSatang} benefits ${s.memberBenefits === null ? "null" : "มี"}`);
    chk("MB5", p.length === 0, "ส่วนลดระดับยังอยู่", FXB(joinP(p)));
  });

  // ════════ PV1 PV3 ════════
  await blk("PV1", async () => {
    const p: string[] = [];
    const PII = [PH.CO1, EM.CO1, PH.CT1, EM.CT1];
    const dealRe = /98765432|987,654\.32|987654\.32/;
    const ctrl = J([await P.crmCompany.findUnique({ where: { id: CO.CO1?.id ?? "-" } }).catch(() => null), await P.crmContact.findUnique({ where: { id: CT1 || "-" } }).catch(() => null), await P.crmDeal.findUnique({ where: { id: DL.D1 ?? "-" } }).catch(() => null)]);
    if (!PII.every((s) => ctrl.includes(s)) || !dealRe.test(ctrl)) p.push("(ตัวควบคุม) เซนทิเนลจับแถว CRM ไม่ได้");
    const outs: string[] = [];
    for (const id of [CR8.saleId, DL1.saleId, CR8REG.saleId].filter(Boolean)) {
      outs.push(J(await call(rcpMod, "receiptPayload", { tenantId: T, systemId: S.POS, unitId: U.A }, A("OWNER"), { saleId: id })));
      const tok = String(((await P.$queryRawUnsafe(`SELECT "publicToken" AS t FROM "PosSale" WHERE id = $1`, id).catch(() => [])) as Any[])[0]?.t ?? "");
      if (tok) outs.push(J(await call(pubMod, "publicReceipt", tok)));
      outs.push(J(await call(billsMod, "billDetail", ctxU("A"), A("OWNER"), { saleId: id })));
    }
    if (outs.length < 3) p.push(`(ตัวควบคุม) payload ${outs.length}`);
    for (const o of outs) {
      for (const s of PII) if (o.includes(s)) p.push(`พบข้อมูลติดต่อ ${s.slice(0, 6)}… ใน ${short(o, 40)}`);
      if (dealRe.test(o)) p.push(`พบมูลค่าดีลใน ${short(o, 40)}`);
    }
    outputsForPrivacy.push(...outs);
    chk("PV1", p.length === 0, "ไม่มีเบอร์/อีเมล/มูลค่าดีล", NO() + joinP([...new Set(p)]));
  });
  await blk("PV3", async () => {
    const p: string[] = [];
    const secrets = [PH.CO1, EM.CO1, PH.CT1, EM.CT1, CO.CO1?.name ?? "§", CO.CO2?.name ?? "§", `บันทึกลับ`];
    const au = ((await P.auditLog.findMany({ where: { tenantId: T, action: { startsWith: "pos.credit." } } }).catch(() => [])) as Any[]);
    if (!au.length) p.push("ไม่มี audit pos.credit.*");
    for (const a of au) {
      const s = J(a.after) + J(a.before);
      for (const x of secrets) if (s.includes(x)) p.push(`audit ${a.action} มี ${x.slice(0, 8)}…`);
      const keys = [...Object.keys(isRecord(a.after) ? a.after : {}), ...Object.keys(isRecord(a.before) ? a.before : {})];
      const bad = keys.filter((k) => PII_KEY_RE.test(k));
      if (bad.length) p.push(`audit ${a.action} คีย์ ${bad.join(",")}`);
    }
    const ob = ((await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: RUN_START } } }).catch(() => [])) as Any[]);
    if (!ob.length) p.push("(ตัวควบคุม) ไม่มี outbox");
    for (const e of ob) {
      // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-B2 PV3): ข้ามเฉพาะ event ที่ type ขึ้นต้น `account.contact.` — โมดูลบัญชีส่งชื่อผู้ติดต่อตามสัญญา webhook
      //   (contactPayload · fixture AC1 ของ CO1 ก็ปล่อยเอง) · event อื่นทุกชนิดยังสแกนเหมือนเดิม · delete-probe ดู wo-notes §fix1 · ก่อน 45/47 → หลัง ดู wo-notes ◂
      if (String(e.type ?? "").startsWith("account.contact.")) continue;
      const s = J(e.payload);
      for (const x of secrets) if (s.includes(x)) p.push(`outbox ${e.type} มี ${x.slice(0, 8)}…`);
    }
    chk("PV3", p.length === 0, "ไม่มีชื่อ/เบอร์/อีเมล", NO() + joinP([...new Set(p)]));
  });
  // ════════ CS1–CS4 ตัวเขียนค่าตั้งวางบิล/สมาชิกบนบิลออเดอร์ (ORACLE-EDIT ผู้สร้าง P3.6U (B) 22 ต.ค. · CD-P36U-2) ◂ ════════
  const csMissing = creditSettingsMod ? "" : "pos/credit-settings.ts ยังไม่มี · ";
  const sysRow = async (): Promise<{ settings: Any; updatedAt: number }> => {
    const r = await P.appSystem.findUnique({ where: { id: S.POS ?? "-" }, select: { settings: true, updatedAt: true } });
    return { settings: r?.settings ?? null, updatedAt: r?.updatedAt ? new Date(r.updatedAt).getTime() : -1 };
  };
  const canonCs = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canonCs).join(",")}]` : isRecord(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonCs(v[k])}`).join(",")}}` : JSON.stringify(v ?? null));
  /** settings โดยตัด pos.credit + pos.orders.memberOnBill ออก (ที่เหลือต้องไบต์เท่าเดิม) */
  const othersOf = (st: Any): string => {
    const c = isRecord(st) ? JSON.parse(JSON.stringify(st)) : {};
    if (isRecord(c.pos)) {
      delete c.pos.credit;
      if (isRecord(c.pos.orders)) delete c.pos.orders.memberOnBill;
    }
    return canonCs(c);
  };
  const csAudits = async (): Promise<Any[]> => (await P.auditLog.findMany({ where: { tenantId: T, action: "pos.settings.updated" }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
  const csCall = (k: string, patch: unknown) => call(creditSettingsMod, "updatePosCreditSettings", pctx(), A(k), patch);
  const leavesBool = (v: unknown): boolean => (isRecord(v) ? Object.entries(v).every(([k, x]) => (k === "section" ? x === "credit" : leavesBool(x))) : typeof v === "boolean");
  if (!fx) {
    await step("CS ค่าตั้งตั้งต้น", () =>
      patchPos((pos) => {
        pos.credit = { ...CREDIT_ON };
        pos.orders = { ...(isRecord(pos.orders) ? pos.orders : {}), memberOnBill: true, qcKeep: `keep-${RAND}` };
        pos.qcSentinel = { a: 1, b: [RAND, 2] };
      }),
    );
  }
  await blk("CS1", async () => {
    const p: string[] = [];
    const b0 = await sysRow();
    const a0 = (await csAudits()).length;
    const r = await csCall("OWNER", { credit: { enabled: false, requireBuyer: false }, memberOnBill: false });
    if (r?.ok !== true) p.push(`OWNER → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else if (canonCs(r.credit) !== canonCs({ enabled: false, requireBuyer: false }) || r.memberOnBill !== false) p.push(`ผล ${short({ credit: r.credit, memberOnBill: r.memberOnBill }, 80)}`);
    const b1 = await sysRow();
    const cs = callSync(setShared, "posCreditSettings", b1.settings);
    const mob = callSync(setShared, "posOrderMemberOnBill", b1.settings);
    if (canonCs(cs) !== canonCs({ enabled: false, requireBuyer: false }) || mob !== false) p.push(`DB credit ${short(cs, 60)} memberOnBill ${short(mob, 10)}`);
    if (othersOf(b0.settings) !== othersOf(b1.settings)) p.push(`คีย์อื่นเปลี่ยน ${short(othersOf(b1.settings), 120)}`);
    if (!(isRecord(b1.settings?.pos?.orders) && b1.settings.pos.orders.qcKeep === `keep-${RAND}`)) p.push("pos.orders.qcKeep หาย");
    const au = (await csAudits()).slice(a0);
    const mine = au.filter((a) => isRecord(a.after) && a.after.section === "credit");
    if (mine.length !== 1) p.push(`audit section credit ${mine.length} (คาด 1)`);
    else if (!leavesBool(mine[0].after) || !leavesBool(mine[0].before ?? {})) p.push(`audit ไม่ใช่ boolean ล้วน ${short(mine[0].after, 80)}`);
    const back = await csCall("OWNER", { credit: { enabled: true, requireBuyer: true }, memberOnBill: true });
    const b2 = await sysRow();
    if (back?.ok !== true || canonCs(callSync(setShared, "posCreditSettings", b2.settings)) !== canonCs(CREDIT_ON) || callSync(setShared, "posOrderMemberOnBill", b2.settings) !== true) p.push(`ตั้งคืน → ${codeOf(back)}`);
    if (othersOf(b0.settings) !== othersOf(b2.settings)) p.push("คีย์อื่นเปลี่ยนหลังตั้งคืน");
    chk("CS1", p.length === 0, "ok · ตัวอ่านตรง · คีย์อื่นเท่าเดิม · audit boolean", FXB(csMissing + joinP(p)));
  });
  await blk("CS2", async () => {
    const p: string[] = [];
    const b0 = await sysRow();
    const a0 = (await csAudits()).length;
    for (const k of ["MGR", "CASH"]) {
      const r = await csCall(k, { credit: { enabled: false }, memberOnBill: false });
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${k} → ${codeOf(r)}`);
    }
    const b1 = await sysRow();
    if (canonCs(b0.settings) !== canonCs(b1.settings)) p.push("settings เปลี่ยน");
    if ((await csAudits()).length !== a0) p.push("มี audit เพิ่ม");
    chk("CS2", p.length === 0, "PERMISSION_DENIED · ไม่เขียน", FXB(csMissing + joinP(p)));
  });
  await blk("CS3", async () => {
    const p: string[] = [];
    const b0 = await sysRow();
    const a0 = (await csAudits()).length;
    const cases: [unknown, string | null][] = [
      [{ foo: true }, "foo"],
      [{ credit: { x: true } }, "credit.x"],
      [{ credit: { enabled: "yes" } }, "credit.enabled"],
      [{ credit: { requireBuyer: 1 } }, "credit.requireBuyer"],
      [{ memberOnBill: 1 }, "memberOnBill"],
      [{ credit: true }, "credit"],
      [{}, null],
      ["junk", null],
    ];
    for (const [patch, field] of cases) {
      const r = await csCall("OWNER", patch);
      if (!refused(r, "VALIDATION")) p.push(`${short(patch, 40)} → ${codeOf(r)}`);
      else if (field && r.field !== field) p.push(`${short(patch, 40)} field ${short(r.field, 30)} (คาด ${field})`);
    }
    const b1 = await sysRow();
    if (canonCs(b0.settings) !== canonCs(b1.settings)) p.push("settings เปลี่ยน");
    if ((await csAudits()).length !== a0) p.push("มี audit เพิ่ม");
    chk("CS3", p.length === 0, "VALIDATION + field · ไม่เขียน", FXB(csMissing + joinP(p)));
  });
  await blk("CS4", async () => {
    const p: string[] = [];
    const b0 = await sysRow();
    const a0 = (await csAudits()).length;
    await sleep(30);
    const r = await csCall("OWNER", { credit: { enabled: true, requireBuyer: true }, memberOnBill: true });
    if (r?.ok !== true) p.push(`no-op → ${codeOf(r)}`);
    else if (canonCs(r.credit) !== canonCs(CREDIT_ON) || r.memberOnBill !== true) p.push(`ผล ${short({ credit: r.credit, memberOnBill: r.memberOnBill }, 80)}`);
    const r2 = await csCall("OWNER", { credit: {} });
    if (r2?.ok !== true) p.push(`credit {} → ${codeOf(r2)}`);
    const b1 = await sysRow();
    if (canonCs(b0.settings) !== canonCs(b1.settings) || b0.updatedAt !== b1.updatedAt) p.push(`เขียน (updatedAt ${b0.updatedAt}→${b1.updatedAt})`);
    if ((await csAudits()).length !== a0) p.push("มี audit เพิ่ม");
    chk("CS4", p.length === 0, "ok · ไม่เขียน · ไม่มี audit", FXB(csMissing + joinP(p)));
  });
  if (pumpErr.length) console.log(`  ⚠️  pump errors ${pumpErr.length}: ${[...new Set(pumpErr)].slice(0, 5).join(" | ")}`);
  if (notes.length) console.log(`  ⚠️  fixture notes ${notes.length}: ${notes.slice(0, 8).join(" | ")}`);
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
  await P.$executeRawUnsafe(`UPDATE "CrmCompany" SET "parentCompanyId" = NULL, "mergedIntoId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
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
    await sleep(800); // ให้ drain เบื้องหลังของผลิตภัณฑ์จบก่อนลบ
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
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
const skippedIds = [...results.entries()].filter(([, r]) => r.skipped).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${skippedIds.length ? ` (SKIP-with-reason ${skippedIds.length})` : ""}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(
  `JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skippedIds, skipped: false, forced: FORCE, missing: skipReasons, db: dbHas, pin: PIN, guardHits: guardHits.length, pumpErrors: pumpErr.length, residue: tempLeft.length + tenantLeft + Math.max(0, usersLeft) })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3.6 S: จอ 01/02 ชิปบริษัท + แผ่นเลือก · ไทล์ "วางบิล (เครดิตเทอม)" + แผ่น PIN · เลือกดีลบนหน้าขายใหม่ · การ์ดตั้งค่าลูกค้าเครดิต ·
//   แท็บ 08 "ลูกหนี้ลูกค้าองค์กร" · บรรทัดครบกำหนดบนใบเสร็จ (P3.6U · ภาพ) · ราคาตามสัญญาองค์กร · จ่ายบางส่วน + ที่เหลือวางบิล · ON_ACCOUNT ผ่าน REST/ออฟไลน์ ·
//   บิลใหญ่ → ดีล (มติ 7) · ใบวางบิลรวม · สายอนุมัติ POS_CREDIT_OVER (มติ 2) · รายงาน credit (R9) ตรวจแค่ชื่อในข้อสถิต (ตัวเลขผูก aging — ใบ U)
// งานของ hunter (มติ 11): วงเงินแข่ง (ล็อก + outbox lag) · เล่นซ้ำ · void แข่งกับรับเงิน · คืนเงินหักลบดีล · materialize ×2 · memberAttachOnly ทางเลี่ยง
