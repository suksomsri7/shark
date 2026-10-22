// QC — POS RUN ใบ P3-SKEL (S): โครง + ปิดสุภาพของใบที่รอของจากเจ้าของ (W4/W5) — P3.1 LINE MAN · P3.2 Grab · P3.3 Shopee/Lazada/TikTok ·
//   P3.10 สลิปโอน + ตรวจสลิป + กระทบยอด Beam · P3.11 e-Tax seam + ตัวช่วยพิมพ์ LAN (relay + agent)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3-SKEL.md §1 (นิยามโครง K1 K2) · §2 R1–R13 · §3 migration (4 ตาราง CREATE เท่านั้น) · §4 แผนข้อสอบ (id ตรงตัว) ·
//        §5 หมุด · §10 มติผู้คุม 1–11 (ผูกมัด: S หนึ่งใบ + U · ไฟล์ส่วนตัว 5 ปี/ขั้นต่ำ 90 วัน · ผู้จัดการยืนยัน ไม่ใช่ผู้อัป (OWNER ยกเว้น) ·
//        Beam ของ SHARK เอง lib/payment/beam.ts ไม่แตะ · e-Tax ใน src/lib/platform/etax/ · relay + LAN agent · marketplace→สมาชิก OUT ·
//        env POS_CREDENTIALS_KEY · facts คง false · route ขาเข้าอยู่นอก /api/v1/pos)
//        ต่อยอด: qc-pos-p2.8 (ทะเบียน adapter · A8 adapterConfig ห้ามความลับ — คงเดิม) · qc-pos-p1.7/p2.9 (ใบขอรับเงิน · ลายเซ็น webhook ด้วยกุญแจทดสอบ) ·
//        qc-pos-p1.13 (ใบกำกับเต็มรูปตอนชำระ) · qc-pos-p1.10 (เครื่อง/เครื่องพิมพ์) · chat/crypto.ts (รูป iv.tag.cipher) · qc-pos-p3.7 (โครงข้อสอบ)
//        โน้ต: ledger/wo-notes/pos-P3-SKEL-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · ORACLE-EDIT · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P3-SKEL (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   pos/secret-box.ts: sealPosSecret(obj, deps?{key}) · openPosSecret(box, deps?{key}) (AES-256-GCM · กุญแจ = SHA-256("pos-credentials:" + key) · "b64(iv).b64(tag).b64(cipher)")
//   pos/integration-creds.ts: saveIntegrationCredentials · readIntegrationCredentials · testIntegrationConnection (ทุกตัว (ctx, actor, input, deps?{key, now}))
//   pos/platform/{types,registry,lineman,grab,marketplace,dispatch}.ts: PLATFORM_ADAPTERS · platformAdapter · platformDispatch + บรรทัด `API: platformDispatch` ใน order-adapters.ts
//   src/app/api/pos/platform/[provider]/[channelId]/route.ts (POST · 413 / 404 / 503 NOT_CONFIGURED / 401 / 503 ADAPTER_PENDING · หัวลายเซ็น x-shark-signature)
//   pos/payment-slip.ts: attachSlip · confirmSlip · rejectSlip · slipViewerUrl · purgeExpiredSlips (+ payment-slip-actions.ts "use server") · pos/slip-verify.ts
//   pos/payment-reconcile.ts: reportIntentReconcile · reportIntentReconcileCsv · importBeamSettlement
//   src/lib/platform/etax/{types,render,provider}.ts: normalizeEtaxDocument · renderEtaxXml · ETAX_PROVIDERS · pos/etax-link.ts: etaxPreview · requestEtax
//   pos/print-relay.ts: registerPrintAgent · revokePrintAgent · listPrintAgents · enqueuePrintJob · claimPrintJobs · ackPrintJob · expirePrintJobs
//   src/app/api/pos/print-agent/jobs/route.ts (GET) · src/app/api/pos/print-agent/jobs/[id]/ack/route.ts (POST) · tools/pos-print-agent/agent.mjs (pollOnce)
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p3.7): SKIP เมื่อของ P3-SKEL ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST3 + บริสุทธิ์ SK1 SK2 ET1 (ไม่โหลด prisma · โมดูลบริสุทธิ์ถูกตรวจ import ก่อนโหลด · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p3s-<rand>` + `-t2` + ผู้ใช้ `posqc-p3s-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ทุกข้อห่อ try/catch · โมดูล/ฟังก์ชัน/ตารางที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` · P[model] อาจไม่มี)
//    — next build ตรวจชนิด scripts/*.mts
//    🔴 ไม่มีเครือข่ายเลย: globalThis.fetch = ตัวกั้น (503 + บันทึก host) ตลอดช่วง DB · storage put/del ฉีดผ่าน deps · กุญแจ POS_CREDENTIALS_KEY = ค่าสุ่มของรอบ
//       (ฉีดผ่าน deps.key ทุกตัวเขียน + ตั้งใน process.env ของรอบนี้เท่านั้นเพราะ route อ่าน env) · Beam ฉีด {enabled: () => false} · นาฬิกาฉีดผ่าน deps.now ·
//       เครื่องพิมพ์ปลอม = net.createServer ที่ 127.0.0.1 พอร์ตสุ่ม ภายในข้อสอบ · agent.mjs ได้ fetch ที่ฉีด (เรียก route handler ในโปรเซส)
//    fixture ผ่านฟังก์ชันของโมดูล (system/pos/account) · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership + AccountSystemLink (แบบ qc-pos-p1.13) +
//    ค่าตั้ง settings.pos.payment ของระบบ POS (พร้อมเพย์ · Beam ปิด · slipRetentionDays) + ใบขอรับเงินสำหรับรายงานกระทบยอด RC (แถวตรง · ข้อมูลอ่านอย่างเดียว) ·
//    SQL ดิบ = อ่านแถวดิบ (ค้นข้อความลับ) / ลายนิ้วมือ / ลบร้านชั่วคราว
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SUITE = "qc-pos-p3-skel";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
const PFX = "P3-SKEL";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต/ความเป็นส่วนตัว/ความลับ · X3 สิทธิ์ · X4 เงิน (ไม่มีผล) · X5 ไม่เขียน/ไม่ส่ง/ปิดสุภาพ · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`${PFX}-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── SK กล่องความลับ (K1) ──
  D("SK1", "P", "[K1] sealPosSecret(obj, {key}) → \"b64(iv 12).b64(tag 16).b64(cipher)\" · ไม่มีค่าลับ/ base64 ของ JSON ในกล่อง · ปิด 2 ครั้งได้กล่องต่างกัน (iv สุ่ม) · openPosSecret(box, {key}) = obj ตรงทุกคีย์ · ข้อสอบเปิดเองด้วย AES-256-GCM กุญแจ SHA-256(\"pos-credentials:\" + key) ได้ obj (รูปแบบ K1 ตรงตัว)"),
  D("SK2", "X2", "[K1] เปิดด้วยกุญแจผิด / กล่องถูกแก้ 1 ตัวอักษร / ขยะ (\"\" · \"a.b\" · null · 42 · {}) → ไม่ throw · ผลไม่มีค่าลับ · แยกโดเมน: chat decryptCreds(กล่อง POS) ด้วย CHAT_CREDENTIALS_KEY = กุญแจเดียวกัน → ไม่ได้ค่าลับ · กล่องรูปแบบแชท (sha256(key) ไม่มีป้าย) เปิดด้วย openPosSecret ไม่ได้"),
  D("SK3", "X5", "[K1 §10-8] ไม่มีกุญแจ: saveIntegrationCredentials(…, deps {key:null}) → NOT_CONFIGURED (ข้อความมี POS_CREDENTIALS_KEY) ไม่มีแถว · ลบ env POS_CREDENTIALS_KEY + NODE_ENV=production (ไม่ฉีด) → NOT_CONFIGURED ไม่มีแถว · readIntegrationCredentials ตอนไม่มีกุญแจ → ok · keyConfigured false · ready false"),
  D("SK4", "X2", "[K1 K2] แถวดิบ PosIntegrationCredential (row_to_json) ไม่มีค่าลับใดเลย · secretBox เปิดด้วยกุญแจของรอบได้ค่าลับครบ (ถูกปิดจริง ไม่ใช่ทิ้ง/แฮช) · AuditLog/OpsEvent ของร้าน + ผลคืนทุกตัวของ CR ไม่มีค่าลับ"),
  // ── CR ที่เก็บ credentials (K2) ──
  D("CR1", "X3", "[K2 §10-8] OWNER บันทึก (PLATFORM · LINEMAN · ช่องทาง API) ok · MANAGER → PERMISSION_DENIED (ไม่เขียน) · STAFF มี pos.channel.manage อ่าน (masked) ok · STAFF ไม่มีสิทธิ์อ่าน → PERMISSION_DENIED · ร้าน T2 อ่าน/บันทึกช่องทางของ T → NOT_FOUND · provider ไม่ตรงรหัสช่องทาง / provider มั่ว / ชื่อฟิลด์แปลก → VALIDATION"),
  D("CR2", "X2", "[K2 R3] ตัวอ่าน: fields ครอบทุกชื่อใน requiredFields [{name, required, secret, filled, masked}] · ฟิลด์ลับที่กรอก masked = \"••••\"+4 ตัวท้าย (ไม่เคยเต็ม) · ready false · keyConfigured true · webhookUrl ลงท้าย /api/pos/platform/LINEMAN/<channelId> · AuditLog pos.integration.credentials after.fields = ชื่อเท่านั้น (ไม่มีค่า)"),
  D("CR3", "-", "[K2 §1(b)] บันทึกบางฟิลด์ → status DRAFT · บันทึกฟิลด์ที่เหลือ (รวมของเดิม) → COMPLETE · ทุกฟิลด์ filled · แถว DB status COMPLETE · updatedByUserId = OWNER"),
  D("CR4", "X5", "[§1(b)] testIntegrationConnection: DRAFT (GRAB บางฟิลด์) → NOT_CONFIGURED · COMPLETE (LINEMAN) → NOT_CONFIGURED/ADAPTER_PENDING (ไม่เคย ok) · ไม่ยิงเครือข่าย · แถวไม่เปลี่ยน (updatedAt)"),
  // ── AD adapter (R1 R4) ──
  D("AD1", "X5", "[R1 R4 §1(a)] PLATFORM_ADAPTERS = LINEMAN GRAB SHOPEE LAZADA TIKTOK ตรงตัว · platform = คีย์ · ready false · code API · requiredFields ไม่ว่าง (LINEMAN/GRAB มีฟิลด์ลับ webhookSecret) · accept/reject/setReady/syncMenu/setAvailability/setStoreStatus/parseInbound → {ok:false, code NOT_CONFIGURED, reason} · testConnection → NOT_CONFIGURED/ADAPTER_PENDING · verifyInbound(ลายเซ็นถูก) true · (ผิด) false"),
  D("AD2", "X5", "[R1 §1(a)] fuzz ทุกเมธอดของทั้ง 5 (undefined · null · {} · \"x\" · 42 · {orderId:5} · สตริง 1 MB · อ็อบเจกต์วนรอบ) → ไม่ throw · ไม่เคย ok:true · verifyInbound(ขยะ/ไม่มี creds/ไม่มีหัว) → false"),
  D("AD3", "X1", "[R1 §1(d)] ช่องทาง LINEMAN adapter API: รับ ×2 · ปฏิเสธ · พร้อม · 86 ×2 · พัก/เปิด · syncMenu ×2 → ทุกคำสั่ง ok ไม่ throw · OpsEvent INFO pos.platform.not_configured ของร้าน: 1 แถวต่อ (ช่องทาง, kind) ใน 1 ชม. (accept reject setReady setAvailability setStoreStatus syncMenu) · ช่องทาง GRAB API ได้ setAvailability 1 ของตัวเอง · ช่องทางที่เก็บแล้วไม่ได้"),
  D("AD4", "-", "[R1 C-7] ORDER_ADAPTERS = {MANUAL WEB CHAT QR API} (ทะเบียนต่าง = +API เท่านั้น) · MANUAL/WEB/CHAT/QR code เดิม · ทุกเมธอดคืน undefined (no-op) · ไม่เขียน OpsEvent · API.code API มีครบ 6 เมธอด"),
  // ── WH route ขาเข้า (R2) ──
  D("WH1", "X5", "[R2] ไม่มีความลับ: ช่องทาง GRAB API ที่ creds ยังไม่มี webhookSecret · ช่องทาง GRAB API ของร้าน T2 ที่ไม่มี creds → 503 {code NOT_CONFIGURED} · ไม่สะท้อนเนื้อคำขอ"),
  D("WH2", "X2", "[R2] LINEMAN มีความลับ + ลายเซ็นผิด / ไม่มีหัว → 401 · OpsEvent WARN ≥ 1 ในช่วงนั้น · ไม่มี OpsEvent ใดมีข้อความเครื่องหมายในเนื้อคำขอ · คำตอบไม่สะท้อนเนื้อคำขอ"),
  D("WH3", "X5", "[R2] LINEMAN ลายเซ็นถูก (x-shark-signature = hex HMAC-SHA256(raw, webhookSecret)) → 503 {code ADAPTER_PENDING} · ไม่มีอะไรถูกเขียน"),
  D("WH4", "X2", "[R2] 404 {error:\"not_found\"}: provider ไม่ตรงช่องทาง · ช่องทางที่เก็บแล้ว (มี creds) · ช่องทาง adapter MANUAL · id ไม่มีจริง · id รูปผิด · provider มั่ว · ข้ามร้าน: ช่องทาง T2 ลงลายเซ็นด้วยความลับของ T → ไม่ใช่ 2xx/ADAPTER_PENDING (404 หรือ 503 NOT_CONFIGURED)"),
  D("WH5", "X5", "[R2] เนื้อคำขอ 300 KB (ลายเซ็นถูก) → 413 · GET → 405 (ไม่ export GET = Next ตอบ 405 · export = ต้องคืน 405)"),
  D("WH6", "X5", "[R2] ตลอด WH1–WH5: PosOrder · PosOrderLine · PosOrderEvent · OutboxEvent · PosSale ของ T/T2 จำนวนเท่าเดิม · แถว creds ไม่เปลี่ยน"),
  // ── SL สลิป (R6 R7 R8 R10) ──
  D("SL1", "-", "[R6 R10] attachSlip(STAFF, {saleId, paymentId TRANSFER, file jpeg, idempotencyKey}, {put}) → ok · แถว UPLOADED (saleId paymentId unitId fileId createdByUserId · verifiedVia null) · purgeAfter ≈ createdAt + 1 825 วัน · FileAsset path t/<tenant>/private/ · cdnUrl private:// · put 1 ครั้ง bytes เดิม · ผลคืนไม่มี path/URL ถาวร · png ถึงใบขอรับเงิน PROMPTPAY_STATIC PENDING (ไม่มี saleId) ok · billDetail.bill.slips = [{id, status, thumbUrl}] (thumbUrl null หรือ /api/files/ ที่ลงนาม)"),
  D("SL2", "X5", "[R6] VALIDATION ไม่มีแถว/ไม่อัป: application/pdf · image/gif · 6 MB · สลิปใบที่ 4 ของแถวชำระเดียว · แถวชำระ CASH · ใบขอรับเงินที่ยกเลิกแล้ว · ทั้ง paymentId และ intentId · คีย์แปลก"),
  D("SL3", "X3", "[R6] บิลของสาขาอื่น (ผู้ใช้สาขา B) / ร้าน T2 / id มั่ว → SALE_NOT_FOUND · storage ปิด (ไม่มี env + ไม่ฉีด put) → STORAGE_NOT_CONFIGURED · หลัง paidAt 24 ชม. (deps.now): CASHIER (sale.create) → PERMISSION_DENIED · MANAGER ok · ไม่มีสิทธิ์ → PERMISSION_DENIED"),
  D("SL4", "X1", "[R6] เล่นซ้ำคีย์เดิม ×2 → สลิปเดิม · FileAsset +1 · put 1 ครั้ง · คีย์ใหม่พร้อมกัน 2 → id เดียวกัน · แถวเพิ่ม 1"),
  D("SL5", "X3", "[R7 §10-3] confirmSlip: ผู้อัปเอง (มี pos.shift.manage) → ปฏิเสธ (PERMISSION_DENIED/SLIP_SELF_CONFIRM) · CASHIER → PERMISSION_DENIED · MANAGER → CONFIRMED verifiedVia MANUAL confirmedByUserId confirmedAt + AuditLog pos.slip.confirmed 1 (ยืนยันซ้ำ audit ยัง 1) · rejectSlip เหตุผล → REJECTED rejectReason + AuditLog pos.slip.rejected · OWNER ยืนยันสลิปของตัวเอง ok · สลิปของใบขอรับเงินถูกยืนยัน → ใบยัง PENDING (ไม่มีผลเงิน)"),
  D("SL6", "X2", "[R6 R7 R8] transRef ซ้ำในร้าน → SLIP_DUPLICATE ไม่มีแถว · slipViewerUrl (pos.sale.read): /api/files/<fileId>?exp&sig · อายุ ≤ 300 วิ · ลายเซ็นผูกผู้ดู STAFF:<userId> · ไม่มีสิทธิ์ → PERMISSION_DENIED · สาขาอื่น/ร้าน T2 → ปฏิเสธ · verifySlip → NOT_CONFIGURED · SLIP_VERIFY_PROVIDERS ทุกตัว verify → NOT_CONFIGURED · สลิปไม่เปลี่ยน"),
  D("SL7", "X4", "[R7 R10 hard rules] ลายนิ้วมือ PosSale · PosPayment · ใบขอรับเงิน · AccountJournalEntry ของร้านเท่าเดิมตลอด SL1–SL6 + รอบลบ · slipRetentionDays 30 → ตัดเป็น 90 วัน · purgeExpiredSlips({tenantId, now +91 วัน, deps}) → ลบไฟล์ (deps.del) + fileId null · แถวคงอยู่ สถานะเดิม · ใบ 5 ปีไม่ถูกแตะ · รันซ้ำ = 0 · ลิงก์ดูของใบที่ลบแล้ว → ปฏิเสธ"),
  // ── RC กระทบยอด (R9) ──
  D("RC1", "-", "[R9] reportIntentReconcile(ctx A, MANAGER, {from D1, to D2}) → days ต่อ (วันไทย, kind) {webhookPaid manualPaid lateWebhook paidNotConsumed consumed amountSatang} ตรงตัว · rows 4 ใบ (PAID/CONSUMED เท่านั้น · สาขา A เท่านั้น) flag W OK · M NEEDS_CHECK · L LATE · N REFUND_NEEDED · receiptNo ของ W = บิล · CASHIER → PERMISSION_DENIED · ช่วงกลับหัว → VALIDATION · ร้าน T2 ไม่เห็นแถวของ T"),
  D("RC2", "X2", "[R9] reportIntentReconcileCsv → {ok, csv, filename *.csv} · หัวตรงตัว date,intentId,kind,status,confirmedVia,lateWebhook,amountSatang,receiptNo,beamChargeId,slipStatus,flag · 4 แถวข้อมูล · ไม่มีชื่อ/เบอร์ลูกค้า"),
  D("RC3", "X5", "[R9 §10-9] importBeamSettlement(OWNER, {csv}) → NOT_CONFIGURED · ใบขอรับเงินของร้านไม่เปลี่ยน · fact [\"promptpayReconcile\", false, \"W4\"] ยังเดิม (CD-P312-K1 · เดิม \"P3.10\")"),
  // ── ET e-Tax (R11 R12) ──
  D("ET1", "P", "[R11] normalizeEtaxDocument: เอกสารตัวอย่าง → ok · เลขภาษีผิด/ net+vat ≠ grand / Σ บรรทัด ≠ grand / typeCode แปลก / ไม่มีผู้ขาย → VALIDATION ไม่ throw · renderEtaxXml: <?xml … UTF-8 · ราก TaxInvoice_CrossIndustryInvoice · ExchangedDocument ID/TypeCode 388/IssueDateTime · ผู้ขาย/ผู้ซื้อ (escape & < >) · ไทย UTF-8 ไม่ใช้ &# · บรรทัด 2 · GrandTotalAmount 170.00 · TaxTotalAmount 11.12 · TaxBasisTotalAmount 158.88 · กำหนดได้ (2 ครั้งเท่ากัน) · ยอดเปลี่ยน → ผลเปลี่ยน · แฮชตรึง (ORACLE-EDIT หลังเขียวแรก)"),
  D("ET2", "X3", "[R11] etaxPreview: บิลไม่มี taxInvoiceDocId → NOT_ELIGIBLE · มีใบกำกับแต่ไม่มีอีเมล → NOT_ELIGIBLE · มีใบกำกับ + อีเมล → {ok:true, xml (เลขผู้ซื้อ · ยอดบิล), provider null, state NOT_CONFIGURED} · CASHIER → PERMISSION_DENIED · ร้าน T2 → ปฏิเสธ"),
  D("ET3", "X5", "[R11 §10-5] requestEtax → NOT_CONFIGURED · AccountDocument.etaxStatus/etaxMeta ของร้านไม่เปลี่ยน · ETAX_PROVIDERS ทุกตัว send/status → NOT_CONFIGURED · ไม่ยิงเครือข่าย"),
  // ── LP ตัวช่วยพิมพ์ LAN (R13) ──
  D("LP1", "X2", "[R13] registerPrintAgent(MANAGER, {name, printers [{name kitchen, host 127.0.0.1, port}]}) → ok + token (≥ 32 ตัว) ครั้งเดียว · tokenHash ≠ token · แถวดิบ/AuditLog/OpsEvent/listPrintAgents ไม่มี token · CASHIER (ไม่มี pos.device.manage) → PERMISSION_DENIED · port 0 / 70000 → VALIDATION"),
  D("LP2", "X1", "[R13] enqueuePrintJob(CASHIER) → QUEUED · เล่นซ้ำคีย์ = งานเดิม · ไม่มีสิทธิ์ → PERMISSION_DENIED · agent ของ T2 → ปฏิเสธ · > 256 KB / base64 ผิด / target แปลก → VALIDATION · GET /api/pos/print-agent/jobs?wait=0 (Bearer A) พร้อมกัน 2 → งานถูกแจกครั้งเดียว · agent B → [] · แถว SENT attempts 1"),
  D("LP3", "X1", "[R13] ack {ok:true} → DONE · ack {ok:false, error} → FAILED + error · agent B ack งานของ A → ไม่ใช่ 200 สถานะเดิม · งานหมดอายุ (deps.now −11 นาที) ไม่ถูกแจก · expirePrintJobs → EXPIRED · ack งาน EXPIRED → ไม่ใช่ 200"),
  D("LP4", "X3", "[R13] revokePrintAgent → revokedAt · GET ด้วย token ที่ถูกเพิกถอน / token มั่ว / ไม่มีหัว / Bearer ว่าง → 401 · ack ด้วย token ที่ถูกเพิกถอน → 401"),
  D("LP5", "-", "[R13 Q6] tools/pos-print-agent/agent.mjs (import เฉพาะ node: · import แล้วไม่รันเอง) pollOnce({baseUrl, token, fetch ที่ฉีด}) → ส่งไบต์ถึงเครื่องพิมพ์ปลอม 127.0.0.1 ตรงทุกไบต์ (sha256) · งาน DONE"),
  // ── ST สถิต ──
  D("ST1", "S", "[R2 §10-9] ไม่มี REST op ใหม่: src/lib/modules/pos/api/** + src/app/api/v1/pos/** ตรงฐาน (48 op ของ qc-pos-p2.13) · route ใหม่อยู่ใต้ src/app/api/pos/ (platform + print-agent) · ไม่มีไฟล์ใหม่ใต้ src/app/api/v1/"),
  D("ST2", "S", "[ตารางชื่อ §1 §2 §3 §5] ไฟล์ + export ตามโน้ต · order-adapters.ts API: platformDispatch · device-shared escpos-lan · minute-jobs pos.slip.purge · scope.ts + POS_MODELS 4 ตาราง · schema 4 model + migration 20261218100000_pos_p3skel (CREATE เท่านั้น) · docs/pos/PLATFORM-SETUP.md · ข้อความ th/en (รอ credentials จากเจ้าของ · ยังไม่ตั้งกุญแจ) · pos-gates.json มี qc-pos-p3-skel"),
  D("ST3", "S", "[§5 hard rules §10-4 §10-9] หมุด: register*.ts service.ts tender*.ts refund*.ts payment-intent.ts outbox-consumers.ts channel.ts order.ts kds.ts pos-sale-contract.json lib/payment/beam.ts modules/account/** ตรงฐาน · order-adapters/device-shared/minute-jobs/scope เพิ่มเฉพาะบรรทัดในรอยต่อ POS P3-SKEL · prisma/schema เพิ่มอย่างเดียว · \"use server\" async ล้วน · 'use client' import pos เฉพาะ *-shared · pos/** ไม่ import แชท · fact promptpayReconcile false"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T T2 เหลือ 0 แถวทุกตารางที่มี tenantId (4 ตารางใหม่ · FileAsset · AuditLog · OutboxEvent · OpsEvent · PosSale* · Account* …) · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (4 ตารางใหม่ที่มีรหัสรอบ · AuditLog/OutboxEvent/OpsEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (FileAsset ส่วนตัว · PosPaymentIntent · 4 ตารางใหม่) ก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith(`${PFX}-`) ? id : `${PFX}-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** ห่อข้อสอบหนึ่งข้อ — throw = แดงพร้อมเหตุผล (ไม่ล้มทั้งชุด) */
async function step(id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ไม่ throw", `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const ex = (p: string) => existsSync(join(ROOT, p));
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const js = (v: unknown): string => {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(v);
  }
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "VALUE");
const refused = (r: Any, ...codes: string[]) => r?.ok === false && codes.includes(String(r.code));
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
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { __missing: true, code: `MISSING:${name}` };
  try {
    return fn(...args);
  } catch (e) {
    return { __threw: true, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200) };
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
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8;
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
const why = (p: string[], pre = "") => pre + (P8(p) || "ครบ");
const sha256 = (b: string | Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");
const hmacHex = (raw: string | Buffer, secret: string) => createHmac("sha256", secret).update(raw).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const MIN = 60_000;
const HOUR = 3_600_000;
/** วันไทย YYYY-MM-DD */
const thDate = (d: Date | number) => new Date(new Date(d).getTime() + 7 * HOUR).toISOString().slice(0, 10);
const THAI = /[ก-๛]/;

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
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
const firstStatement = (raw: string) => raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
const isUseServer = (raw: string) => /^["']use server["']/.test(firstStatement(raw));
const isUseClient = (raw: string) => /^["']use client["']/.test(firstStatement(raw));
/** โมดูลที่ไฟล์ import เป็นค่า (ไม่นับ import type) — static + dynamic + re-export */
const valueImportsOf = (src: string): string[] => {
  const s = stripComments(src);
  const out: string[] = [];
  for (const m of s.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[^"'`;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/(?:^|\n)\s*export\s+(?!type\b)[^"'`;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/import\(\s*["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
};
const importsOf = (src: string): string[] => {
  const s = stripComments(src);
  const out: string[] = [];
  for (const m of s.matchAll(/(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/import\(\s*["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
};
const MARK = "POS P3-SKEL";
/** เลขบรรทัด (0-based) ที่อยู่ในรอยต่อ `// POS P3-SKEL ▸ … ◂` (บรรทัดเดียวหรือหลายบรรทัด) */
function markedLines(raw: string, tag = MARK): Set<number> {
  const out = new Set<number>();
  const lines = raw.split("\n");
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const starts = l.includes(`${tag} ▸`);
    if (starts) open = true;
    if (open || l.includes(tag)) out.add(i);
    if (open && l.includes("◂") && (!starts || l.lastIndexOf("◂") > l.indexOf(`${tag} ▸`))) open = false;
  }
  return out;
}
function flatKeys(o: unknown, pre = "", out = new Map<string, string>()): Map<string, string> {
  if (isRecord(o)) for (const [k, v] of Object.entries(o)) flatKeys(v, pre ? `${pre}.${k}` : k, out);
  else out.set(pre, String(o ?? ""));
  return out;
}

// ── git — // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: หมุดคงที่ env-override แทน 72669941 + ฐานร่วมของ session/pos ที่คำนวณตอนรัน (บทเรียน p2.14 K3) ·
//   PIN = ปลายสินค้าที่ผู้สร้างแตกกิ่ง (session/pos หลัง merge P3.4U + P3.6 S) — ข้อ "ใบนี้ต้องเพิ่ม …" (ไฟล์ที่ใบนี้เปลี่ยน → "use server"/'use client') ·
//   LANE_PIN = หมุดเลน — ข้อ "ไฟล์ห้ามแตะ / ตรงฐาน / ไม่มี hunk นอกรอยต่อ" (ST1 REST · ST3 หมุด · account/** · รอยต่อ · schema เพิ่มอย่างเดียว) ·
//   หลัง merge ผู้คุม re-pin เฉพาะ LANE_PIN (บทเรียน CD-RP4) · 72669941 (ฐานออกแบบเดิม) ไม่มีข้อใดต้องใช้ ⇒ ตัดออก ◂
const PIN = process.env.PSK_PIN || "959b257a"; // ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 · merge P3-SKEL 80314e00: หมุดใบ = ฐานก่อน merge 71c49221 → 959b257a) · ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1 · override ด้วย PSK_PIN) ◂
const LANE_PIN = process.env.PSK_LANE_PIN || "50019b25"; // ORACLE-EDIT ผู้คุม 22.10 (CD-RP17 · merge P3-SKEL U · re-pin 2d0acc1b → 50019b25) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP12b · merge P3.7U · re-pin 85c366dd → 2d0acc1b) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP11 · merge P3.9U · re-pin 80314e00 → 85c366dd) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 · หมุดเลน = merge commit) · // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: หมุดเลนแยกจากหมุดใบ · override ด้วย PSK_LANE_PIN) ◂
const BASE_REV = LANE_PIN; // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: ชื่อเดิมคงไว้ให้ข้อความ chk · = หมุดเลน) ◂
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
const gitStr = (args: string[]) => gitBuf(args)?.toString("utf8") ?? null;
/** หมุดอ่านได้จริง (commit มีในทรี) — // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: แทน bases() หลายฐาน) ◂ */
const revOk = (rev: string) => !!(gitStr(["rev-parse", "--verify", "-q", `${rev}^{commit}`]) ?? "").trim();
const baseOk = () => revOk(PIN) && revOk(LANE_PIN);
/** ไฟล์ที่เปลี่ยน (เทียบหมุด · รวมยังไม่ commit) + ไฟล์ใหม่ที่ยังไม่ track ใต้ path */
function changedFiles(path: string, rev: string): string[] {
  const a = (gitStr(["diff", "--name-only", rev, "--", path]) ?? "").split("\n").filter(Boolean);
  const b = (gitStr(["ls-files", "--others", "--exclude-standard", "--", path]) ?? "").split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
}
type Hunk = { oldStart: number; removed: { line: number; text: string }[]; added: { line: number; text: string }[] };
function hunksOf(path: string, rev: string): Hunk[] | null {
  const d = gitStr(["diff", "-U0", rev, "--", path]);
  if (d === null) return null;
  const out: Hunk[] = [];
  let cur: Hunk | null = null;
  let newLine = 0;
  let oldLine = 0;
  for (const l of d.split("\n")) {
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      cur = { oldStart: Number(h[1]), removed: [], added: [] };
      out.push(cur);
      oldLine = Number(h[1]) - (h[2] === "0" ? 0 : 1);
      newLine = Number(h[3]) - 1;
      continue;
    }
    if (!cur || l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("-")) cur.removed.push({ line: oldLine++, text: l.slice(1) });
    else if (l.startsWith("+")) cur.added.push({ line: newLine++, text: l.slice(1) });
  }
  return out;
}
/** // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1 · กัน W21 · พอร์ตจาก ownHunks() ของ qc-pos-p3.6 CD-P36-O1): เลขบรรทัด (0-based) ในรอยต่อของใบอื่น
 *  `POS P<x> ▸ … ◂` / `POS HF-… ▸ … ◂` (บรรทัดเดียว หรือ ▸ ไม่มี ◂ = เปิดบล็อกจนบรรทัดที่มี ◂) — รอยต่อของใบนี้ (POS P3-SKEL) ไม่นับเป็น "ใบอื่น" ◂ */
const OWN = /POS P3-SKEL ▸/;
const ANY = /POS (P\d+(?:\.\d+)?[a-z]?U?|HF-[A-Z0-9]+|P\d+-[A-Z]+) ▸/;
function otherMarkedLines(raw: string): Set<number> {
  const out = new Set<number>();
  const lines = raw.split("\n");
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const m = ANY.exec(l);
    if (m && !OWN.test(l) && !l.includes(MARK)) {
      out.add(i);
      if (!l.slice(m.index + m[0].length).includes("◂")) open = true;
      continue;
    }
    if (open) {
      out.add(i);
      if (l.includes("◂")) open = false;
    }
  }
  return out;
}
/** // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1): แยก hunk ของไฟล์ร้อนเทียบหมุด rev เป็น
 *  own = มีบรรทัดในรอยต่อ POS P3-SKEL (markedLines ของไฟล์ปัจจุบัน — บล็อกที่เปิดก่อน hunk ก็นับ) ·
 *  other = ทุกบรรทัดไม่ว่างที่เพิ่ม/ลบอยู่ในรอยต่อของใบอื่น (ไม่นับ ไม่ตรวจ · oracle ของใบนั้นตรวจเอง) ·
 *  stray = บรรทัดไม่ว่างที่เพิ่ม (หรือถูกลบ ใน hunk ที่ไม่มีบรรทัดเพิ่มที่ marked) นอกรอยต่อใดเลย = แดง · blank = hunk ที่มีแต่บรรทัดว่าง ·
 *  probe ลบ (A–C) ดูโน้ต §ORACLE-EDIT CD-SKEL-O1: (A) บรรทัดไม่ marked ⇒ stray · (B) บล็อกใบอื่นอย่างเดียว ⇒ other (ไม่แดง) · (C) บล็อกตัวเอง + บรรทัดหลง ⇒ stray ◂ */
// ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1 · ผล delete-probe 21 ต.ค. บนทรี e (แก้ working tree ชั่วคราว · คืนด้วย git checkout · ไม่ commit) ·
//   PSK_PIN=ea14ad29 (= HEAD ⇒ ไฟล์สินค้าตรงหมุด · baseline ST3 ✅) · ไฟล์ร้อน order.ts (ห้ามแตะ) · order-adapters.ts (รอยต่อ) · api/dispatch.ts (ST1)):
//   (A) บรรทัดไม่ marked ⇒ ST3 แดง "order.ts … นอกรอยต่อ 1 บรรทัด" + "order-adapters.ts: บรรทัดใหม่นอกรอยต่อ" · ST1 แดง api/dispatch.ts ✔
//   (B) บล็อก `POS P3.9 ▸ … ◂` + บรรทัดเดียว `POS HF-FU2 ▸ … ◂` อย่างเดียว ⇒ ST3 ✅ · ST1 ไม่นับ api/dispatch.ts · ST2 ยังแดง "ไม่มีบรรทัด API: platformDispatch ในรอยต่อ POS P3-SKEL" (ข้อความขาดบล็อกตัวเอง) ✔
//   (C) บล็อก `POS P3-SKEL ▸ … ◂` + บรรทัดหลง ⇒ ST3 แดง ทั้งสองไฟล์ (stray = __probeStray) ✔ ·
//   (C0 ตัวควบคุม) บล็อกตัวเองอย่างเดียว ⇒ order-adapters ไม่แดง + ST2 พบ API: platformDispatch · order.ts แดง "hunk ในรอยต่อ POS P3-SKEL — ไฟล์ห้ามแตะ" ✔ ◂
type HunkClass = { own: Hunk[]; other: number; stray: number; straySample: string; blank: number; isNew: boolean; isGone: boolean };
function ownHunks(path: string, rev: string): HunkClass | null {
  const hk = hunksOf(path, rev);
  if (!hk) return null;
  const nowRaw = ex(path) ? rd(path) : "";
  const oldRaw = gitStr(["show", `${rev}:${path}`]);
  const res: HunkClass = { own: [], other: 0, stray: 0, straySample: "", blank: 0, isNew: oldRaw === null && ex(path), isGone: oldRaw !== null && !ex(path) };
  const ownNow = markedLines(nowRaw);
  const othNow = otherMarkedLines(nowRaw);
  const ownOld = markedLines(oldRaw ?? "");
  const othOld = otherMarkedLines(oldRaw ?? "");
  for (const h of hk) {
    const add = h.added.filter((a) => a.text.trim() !== "");
    const rm = h.removed.filter((r) => r.text.trim() !== "");
    if (!add.length && !rm.length) {
      if (h.added.length || h.removed.length) res.blank++;
      continue;
    }
    const strayAdd = add.filter((a) => !ownNow.has(a.line) && !othNow.has(a.line));
    const strayRm = add.length ? [] : rm.filter((r) => !ownOld.has(r.line) && !othOld.has(r.line));
    if (strayAdd.length || strayRm.length) {
      res.stray += strayAdd.length + strayRm.length;
      if (!res.straySample) res.straySample = (strayAdd[0]?.text ?? `ลบ: ${strayRm[0]!.text}`).trim();
      continue;
    }
    if (add.some((a) => ownNow.has(a.line)) || rm.some((r) => ownOld.has(r.line))) res.own.push(h);
    else res.other++;
  }
  return res;
}
/** ไฟล์ห้ามแตะ (LANE_PIN) — null = ตรงหมุดทุกไบต์ หรือต่างเฉพาะรอยต่อของใบอื่น · ไม่งั้นเหตุผล
 *  // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: แทน sameAsBase หลายฐาน · hunk ของใบนี้/หลงทาง/บรรทัดว่าง = แดงเหมือนเดิม) ◂ */
function sameAsBase(path: string, rev = LANE_PIN): string | null {
  const raw = ex(path) ? readFileSync(join(ROOT, path)) : null;
  const b = gitBuf(["show", `${rev}:${path}`]);
  if (!raw && !b) return null;
  if (raw && b && sha256(raw) === sha256(b)) return null;
  const name = path.split("/").slice(-2).join("/");
  if (!raw) return `${path} ถูกลบ`;
  if (!b) return `${path} เป็นไฟล์ใหม่ (หมุด ${rev.slice(0, 8)} ไม่มี)`;
  const c = ownHunks(path, rev);
  if (!c) return `${name}: git diff ไม่ได้`;
  if (c.own.length) return `${name} ต่างจากหมุด ${rev.slice(0, 8)} (hunk ในรอยต่อ ${MARK} ${c.own.length} — ไฟล์ห้ามแตะ)`;
  if (c.stray) return `${name} ต่างจากหมุด ${rev.slice(0, 8)} (นอกรอยต่อ ${c.stray} บรรทัด: ${short(c.straySample, 60)})`;
  if (c.blank) return `${name} ต่างจากหมุด ${rev.slice(0, 8)} (บรรทัดว่าง ${c.blank} hunk)`;
  return null; // ต่างเฉพาะรอยต่อของใบอื่น
}
/** ไฟล์ "รอยต่อ" (LANE_PIN) — ผ่านเมื่อ: ไม่มีบรรทัดเดิมถูกลบ/แก้ใน hunk ของใบนี้ · ไม่มีบรรทัดที่เพิ่มนอกรอยต่อ POS P3-SKEL (รอยต่อของใบอื่นไม่นับ)
 *  // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: ownHunks — hunk ของใบอื่นข้าม · บรรทัดหลงทาง = แดง) ◂ */
function markedOnly(path: string, rev = LANE_PIN): string | null {
  if (!ex(path)) return `${path} ไม่มี`;
  const c = ownHunks(path, rev);
  if (!c) return `${path}: ไม่มีหมุด ${rev.slice(0, 8)}`;
  const v: string[] = [];
  if (c.isNew) v.push(`เป็นไฟล์ใหม่ (หมุด ${rev.slice(0, 8)} ไม่มี)`);
  for (const h of c.own) {
    const rm = h.removed.filter((l) => l.text.trim() !== "");
    if (rm.length) v.push(`ลบ/แก้บรรทัดเดิม: ${short(rm[0]!.text.trim(), 60)}`);
  }
  if (c.stray) v.push(`บรรทัดใหม่นอกรอยต่อ ${MARK}: ${short(c.straySample, 60)}`);
  return v.length ? `${path.split("/").pop()}: ${v.slice(0, 2).join(" · ")}` : null;
}
/** ไฟล์ใต้ path ที่ใบนี้แตะเทียบ LANE_PIN (ข้ามไฟล์ที่ต่างเฉพาะรอยต่อของใบอื่น) — // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1) ◂ */
function touchedFiles(path: string, rev = LANE_PIN): string[] {
  return changedFiles(path, rev).filter((f) => sameAsBase(f, rev) !== null);
}

// ═════════════════════════ ค่าคงที่ของสัญญา (ตารางชื่อ — ledger/wo-notes/pos-P3-SKEL-oracle.md) ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const PLAT_DIR = `${POS_DIR}/platform`;
const ETAX_DIR = "src/lib/platform/etax";
const F = {
  secretBox: `${POS_DIR}/secret-box.ts`,
  creds: `${POS_DIR}/integration-creds.ts`,
  credsActions: `${POS_DIR}/integration-creds-actions.ts`,
  types: `${PLAT_DIR}/types.ts`,
  registry: `${PLAT_DIR}/registry.ts`,
  lineman: `${PLAT_DIR}/lineman.ts`,
  grab: `${PLAT_DIR}/grab.ts`,
  marketplace: `${PLAT_DIR}/marketplace.ts`,
  dispatch: `${PLAT_DIR}/dispatch.ts`,
  orderAdapters: `${POS_DIR}/order-adapters.ts`,
  platformRoute: "src/app/api/pos/platform/[provider]/[channelId]/route.ts",
  slip: `${POS_DIR}/payment-slip.ts`,
  slipActions: `${POS_DIR}/payment-slip-actions.ts`,
  slipVerify: `${POS_DIR}/slip-verify.ts`,
  reconcile: `${POS_DIR}/payment-reconcile.ts`,
  etaxTypes: `${ETAX_DIR}/types.ts`,
  etaxRender: `${ETAX_DIR}/render.ts`,
  etaxProvider: `${ETAX_DIR}/provider.ts`,
  etaxLink: `${POS_DIR}/etax-link.ts`,
  relay: `${POS_DIR}/print-relay.ts`,
  jobsRoute: "src/app/api/pos/print-agent/jobs/route.ts",
  ackRoute: "src/app/api/pos/print-agent/jobs/[id]/ack/route.ts",
  agent: "tools/pos-print-agent/agent.mjs",
  deviceShared: `${POS_DIR}/device-shared.ts`,
  minuteJobs: "src/lib/platform/minute-jobs.ts",
  scope: "src/lib/core/scope.ts",
  posQcEnv: "scripts/pos-qc-env.mts",
  gates: "scripts/pos-gates.json",
  integrations: "src/lib/pos-integrations.ts",
  setupDoc: "docs/pos/PLATFORM-SETUP.md",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  beam: "src/lib/payment/beam.ts",
  contract: "scripts/pos-sale-contract.json",
  consumers: "src/lib/outbox-consumers.ts",
};
const MIGRATION = "20261218100000_pos_p3skel";
const NEW_MODELS = ["PosIntegrationCredential", "PosPaymentSlip", "PosPrintAgent", "PosPrintJob"] as const;
const NEW_ACCESSORS = ["posIntegrationCredential", "posPaymentSlip", "posPrintAgent", "posPrintJob"] as const;
const PROVIDERS = ["LINEMAN", "GRAB", "SHOPEE", "LAZADA", "TIKTOK"] as const;
const ADAPTER_METHODS = ["accept", "reject", "setReady", "syncMenu", "setAvailability", "setStoreStatus"] as const;
const OPS_KEY = "pos.platform.not_configured";
const SIG_HEADER = "x-shark-signature";
const WEBHOOK_SECRET_FIELD = "webhookSecret";
const CSV_HEADER = "date,intentId,kind,status,confirmedVia,lateWebhook,amountSatang,receiptNo,beamChargeId,slipStatus,flag";
const SLIP_RETENTION_DEFAULT_D = 1825;
const SLIP_RETENTION_MIN_D = 90;
const PRINT_MAX_BYTES = 256 * 1024;
const PROMPTPAY_FACT = '["promptpayReconcile", false, "W4"]'; // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-K1 · ป้ายเฟสปิดแล้ว P3 → "P4+" · promptpayReconcile → "W4" · old '["promptpayReconcile", false, "P3.10"]' · fact ยังคง false ตาม §10-9 · revert: คืนตัวอักษรเดิมพร้อมคืนป้ายใน src/lib/pos-integrations.ts)
const TEXT_AWAIT_TH = "รอ credentials จากเจ้าของ";
const TEXT_NOKEY_TH = "ยังไม่ตั้งกุญแจ";
/** ไฟล์ที่ต้องมี + export (ST2) */
const NAMES: readonly [string, readonly string[]][] = [
  [F.secretBox, ["sealPosSecret", "openPosSecret"]],
  [F.creds, ["saveIntegrationCredentials", "readIntegrationCredentials", "testIntegrationConnection"]],
  [F.types, []],
  [F.registry, ["PLATFORM_ADAPTERS", "platformAdapter"]],
  [F.lineman, []],
  [F.grab, []],
  [F.marketplace, []],
  [F.dispatch, ["platformDispatch"]],
  [F.platformRoute, ["POST"]],
  [F.slip, ["attachSlip", "confirmSlip", "rejectSlip", "slipViewerUrl", "purgeExpiredSlips"]],
  [F.slipActions, []],
  [F.slipVerify, ["SLIP_VERIFY_PROVIDERS", "verifySlip"]],
  [F.reconcile, ["reportIntentReconcile", "reportIntentReconcileCsv", "importBeamSettlement"]],
  [F.etaxTypes, []],
  [F.etaxRender, ["normalizeEtaxDocument", "renderEtaxXml"]],
  [F.etaxProvider, ["ETAX_PROVIDERS"]],
  [F.etaxLink, ["etaxPreview", "requestEtax"]],
  [F.relay, ["registerPrintAgent", "revokePrintAgent", "listPrintAgents", "enqueuePrintJob", "claimPrintJobs", "ackPrintJob", "expirePrintJobs"]],
  [F.jobsRoute, ["GET"]],
  [F.ackRoute, ["POST"]],
];
/** ไฟล์ที่ต้องตรงฐานทุกไบต์ (ST3) — ชื่อไฟล์ใน pos/ ตามรูปแบบ + ไฟล์ตายตัว */
const PIN_FIXED = [`${POS_DIR}/service.ts`, `${POS_DIR}/payment-intent.ts`, `${POS_DIR}/channel.ts`, `${POS_DIR}/order.ts`, `${POS_DIR}/kds.ts`, F.consumers, F.contract, F.beam];
const PIN_RE = /^(register|tender|refund)[\w-]*\.tsx?$/;

// ── ตัวตรวจของข้อสอบเอง ──
const thaiTaxIdOk = (id: unknown): boolean => {
  if (typeof id !== "string" || !/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
};
const withCheck = (d12: string): string => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (13 - i);
  return `${d12}${(11 - (s % 11)) % 10}`;
};
/** เปิดกล่องรูปแบบ K1 เอง (ตัวตรวจอิสระของข้อสอบ) */
function oracleOpen(box: string, key: string): unknown {
  const [iv, tag, data] = box.split(".");
  const k = createHash("sha256").update(`pos-credentials:${key}`).digest();
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv!, "base64"));
  d.setAuthTag(Buffer.from(tag!, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data!, "base64")), d.final()]).toString("utf8"));
}
/** กล่องรูปแบบแชท (sha256(key) ไม่มีป้าย) — ใช้พิสูจน์การแยกโดเมน */
function chatStyleBox(obj: unknown, key: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), "utf8")), c.final()]);
  return `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}
/** ผลมีค่าลับข้อใดไหม */
const leaks = (v: unknown, secrets: string[]): string | null => {
  const s = js(v);
  return secrets.find((x) => x && x.length >= 6 && s.includes(x)) ?? null;
};
/** ตรวจ import ของโมดูลบริสุทธิ์ก่อนโหลด (--no-db ห้ามโหลด prisma) — "" = บริสุทธิ์ · relative ตามไปในโฟลเดอร์เดียวกัน */
function impureChain(path: string, allow: RegExp, seen = new Set<string>()): string {
  if (seen.has(path)) return "";
  seen.add(path);
  const raw = rd(path);
  if (!raw) return `ไม่มี ${path}`;
  const dir = path.split("/").slice(0, -1).join("/");
  for (const m of valueImportsOf(raw)) {
    if (m.startsWith("./")) {
      const rel = `${dir}/${m.slice(2)}`;
      const cand = [`${rel}.ts`, rel, `${rel}/index.ts`].find((c) => ex(c) && statSync(join(ROOT, c)).isFile());
      if (!cand) return `${path.split("/").pop()} import ${m} (หาไฟล์ไม่เจอ)`;
      const r = impureChain(cand, allow, seen);
      if (r) return r;
      continue;
    }
    if (!allow.test(m)) return `${path.split("/").pop()} import ${m}`;
  }
  return "";
}
const PURE_NODE = /^node:(crypto|buffer|util)$/;

// ═════════════════════════ ข้อมูลตัวอย่างของ e-Tax (ET1) ═════════════════════════
const SELLER_TAX = "0105561177639";
const BUYER_TAX = withCheck("010555123456");
const ETAX_DOC = {
  seller: { name: "บริษัท ร้านคิวซี & ลูกค้า จำกัด", taxId: SELLER_TAX, branch: "00000", address: "99/9 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200" },
  buyer: { kind: "JURISTIC", name: "บริษัท ผู้ซื้อ <ทดสอบ> จำกัด", taxId: BUYER_TAX, branchCode: "00001", address: "1/1 ถ.สีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", email: "etax-buyer@example.com" },
  doc: { typeCode: "388", number: "TX2610-0001", issueDate: "2026-10-16" },
  lines: [
    { name: "กาแฟเย็น", qty: 2, unitPriceSatang: 5000, amountSatang: 10000 },
    { name: "ขนมปังสังขยา", qty: 1, unitPriceSatang: 7000, amountSatang: 7000 },
  ],
  totals: { netSatang: 15888, vatSatang: 1112, grandSatang: 17000 },
  vat: { rateBp: 700, inclusive: true },
};
/** แฮชตรึงของ renderEtaxXml(ETAX_DOC) — ว่าง = รอผู้คุมตรึงหลังเขียวแรก (ORACLE-EDIT · โน้ต §ORACLE-EDIT) */
const ET1_GOLDEN_SHA256: string = "e538a07652145299acb586d9f5366610d28dcd68adbe3f10e34d58f82538c22e"; // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-B3: ตรึงแฮช e-Tax golden หลังเขียวแรก 41/41 @e05a7cec) ◂
/** ค่าในแท็กแรกที่ชื่อท้าย (ไม่สน prefix) ลงท้ายด้วย local */
const tagVals = (xml: string, local: string): string[] => [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${local}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${local}>`, "g"))].map((m) => m[1]!.trim());
const blockOf = (xml: string, local: string): string => new RegExp(`<(?:[\\w-]+:)?${local}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w-]+:)?${local}>`).exec(xml)?.[0] ?? "";
const countTag = (xml: string, local: string) => (xml.match(new RegExp(`<(?:[\\w-]+:)?${local}(?:\\s[^>]*)?>`, "g")) ?? []).length;

// ═════════════════════════ 1. ข้อสถิต + บริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
const STATIC_IDS = ["ST1", "ST2", "ST3", "SK1", "SK2", "ET1"].map((x) => `${PFX}-${x}`);
const skipReasons: string[] = [];

async function runStatic(): Promise<void> {
  const haveGit = baseOk();
  // ST1 ไม่มี REST op ใหม่
  await step("ST1", () => {
    const p: string[] = [];
    if (!haveGit) {
      chk("ST1", false, `อ่าน git ${BASE_REV} ได้`, "ไม่มี commit ฐาน");
      return;
    }
    // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: ไฟล์ห้ามแตะ → LANE_PIN · ไฟล์ร้อน api/** ต่างเฉพาะรอยต่อของใบอื่น = ไม่นับ · hunk ของใบนี้/หลงทาง = แดง (touchedFiles → sameAsBase → ownHunks) ◂
    const bestApi = [...touchedFiles(`${POS_DIR}/api`), ...touchedFiles("src/app/api/v1/pos")];
    if (bestApi.length) p.push(`ไฟล์ REST ของ POS เปลี่ยน: ${bestApi.slice(0, 3).join(",")}`);
    const v1New = (gitStr(["ls-files", "--others", "--exclude-standard", "--", "src/app/api/v1"]) ?? "").split("\n").filter(Boolean);
    const v1Add = (gitStr(["diff", "--name-only", "--diff-filter=A", LANE_PIN, "--", "src/app/api/v1"]) ?? "").split("\n").filter(Boolean); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: LANE_PIN) ◂
    if ([...v1New, ...v1Add].length) p.push(`ไฟล์ใหม่ใต้ src/app/api/v1/: ${[...v1New, ...v1Add].slice(0, 3).join(",")}`);
    for (const f of [F.platformRoute, F.jobsRoute, F.ackRoute]) if (!ex(f)) p.push(`${MISSING} ${f}`);
    chk("ST1", p.length === 0, "REST 48 op ตรงฐาน · route ใหม่ใต้ src/app/api/pos/", why(p));
  });

  // ST2 ตารางชื่อ
  await step("ST2", () => {
    const p: string[] = [];
    for (const [f, names] of NAMES) {
      if (!ex(f)) {
        p.push(`${MISSING} ${f}`);
        continue;
      }
      const s = stripComments(rd(f));
      for (const n of names) if (!exportsFn(s, n)) p.push(`${f.split("/").slice(-2).join("/")} ไม่ export ${n}`);
    }
    const sb = rd(F.secretBox);
    if (sb && (!sb.includes("pos-credentials:") || !sb.includes("POS_CREDENTIALS_KEY"))) p.push("secret-box ไม่มีป้าย pos-credentials: / POS_CREDENTIALS_KEY");
    if (sb && /CHAT_CREDENTIALS_KEY|SESSION_SECRET/.test(stripComments(sb))) p.push("secret-box ใช้กุญแจของโดเมนอื่น");
    if (ex(F.creds) && !rd(F.creds).includes("pos.integration.credentials")) p.push("integration-creds ไม่มี audit pos.integration.credentials");
    const dsp = [rd(F.dispatch), rd(F.registry)].join("\n");
    if (ex(F.dispatch) && !dsp.includes(OPS_KEY)) p.push(`dispatch ไม่มี ops ${OPS_KEY}`);
    if (ex(F.slipActions)) {
      const raw = rd(F.slipActions);
      if (!isUseServer(raw)) p.push("payment-slip-actions.ts ไม่ขึ้นต้น \"use server\"");
    }
    const sl = rd(F.slip);
    for (const a of ["pos.slip.confirmed", "pos.slip.rejected"]) if (sl && !sl.includes(a)) p.push(`payment-slip ไม่มี audit ${a}`);
    // order-adapters
    const oa = rd(F.orderAdapters);
    const oaMk = markedLines(oa);
    const apiLine = oa.split("\n").findIndex((l, i) => oaMk.has(i) && /\bAPI\s*:\s*platformDispatch\b/.test(l));
    if (apiLine < 0) p.push("order-adapters.ts ไม่มีบรรทัด `API: platformDispatch` ในรอยต่อ POS P3-SKEL");
    // device-shared
    const ds = rd(F.deviceShared);
    const dsMk = markedLines(ds);
    if (!ds.split("\n").some((l, i) => dsMk.has(i) && l.includes("escpos-lan"))) p.push("device-shared.ts ไม่มี escpos-lan ในรอยต่อ");
    // minute-jobs
    const mj = rd(F.minuteJobs);
    const mjMk = markedLines(mj);
    const mjMarked = mj.split("\n").filter((_, i) => mjMk.has(i)).join("\n");
    if (!/pos\.slip\.purge/.test(mjMarked) || !/purgeExpiredSlips/.test(mjMarked)) p.push("minute-jobs.ts ไม่มีงาน pos.slip.purge (purgeExpiredSlips) ในรอยต่อ");
    // scope + POS_MODELS
    const sc = rd(F.scope);
    const scMk = markedLines(sc);
    const scMarked = sc.split("\n").filter((_, i) => scMk.has(i)).join("\n");
    for (const m of NEW_MODELS) if (!new RegExp(`\\b${m}\\s*:`).test(scMarked)) p.push(`scope.ts ไม่มี ${m} ในรอยต่อ`);
    const qe = rd(F.posQcEnv);
    for (const m of NEW_MODELS) if (!new RegExp(`model:\\s*"${m}"`).test(qe)) p.push(`POS_MODELS ไม่มี ${m}`);
    // schema + migration
    const schema = walk("prisma/schema", [], /\.prisma$/).map((f) => rd(f)).join("\n");
    for (const m of NEW_MODELS) if (!new RegExp(`\\bmodel\\s+${m}\\s*\\{`).test(schema)) p.push(`schema ไม่มี model ${m}`);
    const migSql = rd(`prisma/migrations/${MIGRATION}/migration.sql`);
    if (!migSql) p.push(`ไม่มี prisma/migrations/${MIGRATION}/migration.sql`);
    else {
      for (const m of NEW_MODELS) if (!new RegExp(`CREATE TABLE\\s+"${m}"`).test(migSql)) p.push(`migration ไม่ CREATE TABLE "${m}"`);
      const bad = migSql.split("\n").filter((l) => /^\s*(DROP|ALTER\s+TABLE|ALTER\s+TYPE|UPDATE|DELETE|TRUNCATE)\b/i.test(l) && !NEW_MODELS.some((m) => l.includes(`"${m}"`)));
      if (bad.length) p.push(`migration แตะตารางเดิม: ${short(bad[0]!.trim(), 60)}`);
      if (!/"transRef"/.test(migSql)) p.push("migration ไม่มีคอลัมน์ transRef (unique ต่อร้าน)");
      if (!/"tokenHash"/.test(migSql)) p.push("migration ไม่มีคอลัมน์ tokenHash");
    }
    // docs + ข้อความ + gates
    const doc = rd(F.setupDoc);
    if (!doc) p.push(`${MISSING} ${F.setupDoc}`);
    else for (const k of ["LINE MAN", "Grab", "Shopee", "Beam", "e-Tax", "POS_CREDENTIALS_KEY", "agent"]) if (!doc.includes(k)) p.push(`PLATFORM-SETUP.md ไม่มีหัวข้อ ${k}`);
    let th: Any = null;
    let en: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh) || "null");
      en = JSON.parse(rd(F.msgEn) || "null");
    } catch {
      p.push("pos.json อ่านไม่ได้");
    }
    if (th && en) {
      const thVals = [...flatKeys(th).values()];
      for (const t of [TEXT_AWAIT_TH, TEXT_NOKEY_TH]) if (!thVals.some((v) => v.includes(t))) p.push(`th/pos.json ไม่มี "${t}"`);
      const thK = new Set(flatKeys(th).keys());
      const enK = new Set(flatKeys(en).keys());
      const thOnly = [...thK].filter((k) => !enK.has(k) && [...flatKeys(th).entries()].some(([kk, v]) => kk === k && (v.includes(TEXT_AWAIT_TH) || v.includes(TEXT_NOKEY_TH))));
      if (thOnly.length) p.push(`ข้อความโครงไม่มีคู่ en: ${thOnly.slice(0, 2).join(",")}`);
    }
    if (!rd(F.gates).includes('"qc-pos-p3-skel"')) p.push("pos-gates.json ไม่มี qc-pos-p3-skel (ORACLE-EDIT ของผู้สร้าง · test commit)");
    // agent
    const ag = rd(F.agent);
    if (!ag) p.push(`${MISSING} ${F.agent}`);
    else {
      const bad = valueImportsOf(ag).filter((m) => !/^node:/.test(m));
      if (bad.length) p.push(`agent.mjs import ที่ไม่ใช่ node: ${bad.slice(0, 3).join(",")}`);
      if (!/export\s+(async\s+)?function\s+pollOnce\b|export\s*\{[^}]*\bpollOnce\b/.test(stripComments(ag))) p.push("agent.mjs ไม่ export pollOnce");
    }
    chk("ST2", p.length === 0, "ตารางชื่อครบตามโน้ต", why(p));
  });

  // ST3 หมุด
  await step("ST3", () => {
    const p: string[] = [];
    if (!baseOk()) {
      chk("ST3", false, `อ่าน git ${BASE_REV} ได้`, "ไม่มี commit ฐาน");
      return;
    }
    const posBase = (gitStr(["ls-tree", "--name-only", `${LANE_PIN}:${POS_DIR}/`]) ?? "").split("\n").filter(Boolean); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: ไฟล์ห้ามแตะเทียบ LANE_PIN ฐานเดียว) ◂
    const posNow = existsSync(join(ROOT, POS_DIR)) ? readdirSync(join(ROOT, POS_DIR)) : [];
    const pinned = [...new Set([...posBase, ...posNow])].filter((f) => PIN_RE.test(f)).map((f) => `${POS_DIR}/${f}`);
    for (const f of [...pinned, ...PIN_FIXED]) {
      const r = sameAsBase(f); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: LANE_PIN · order.ts/outbox-consumers.ts ฯลฯ ต่างเฉพาะรอยต่อของใบอื่น = ไม่นับ · ของใบนี้/หลงทาง/บรรทัดว่าง = แดง) ◂
      if (r) p.push(r);
    }
    const accBest = touchedFiles("src/lib/modules/account"); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: LANE_PIN + ownHunks (account/index.ts ไฟล์ร้อน) ◂
    if (accBest.length) p.push(`modules/account/** เปลี่ยน: ${accBest.slice(0, 2).join(",")}`);
    for (const f of [F.orderAdapters, F.deviceShared, F.minuteJobs, F.scope]) {
      const r = markedOnly(f); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: LANE_PIN · รอยต่อของใบอื่นข้าม · บรรทัดหลงทาง = แดง) ◂
      if (r) p.push(r);
    }
    // prisma/schema เพิ่มอย่างเดียว
    for (const f of walk("prisma/schema", [], /\.prisma$/)) {
      const hk = hunksOf(f, LANE_PIN); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: LANE_PIN ฐานเดียว · เพิ่มอย่างเดียว = ไม่มีบรรทัดไม่ว่างถูกลบ (เดิม)) ◂
      const ok = !!hk && !hk.some((h) => h.removed.some((l) => l.text.trim() !== ""));
      if (!ok) p.push(`${f.split("/").pop()} ลบ/แก้บรรทัดเดิม (schema ต้องเพิ่มอย่างเดียว)`);
    }
    // "use server" / 'use client'
    // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-O1: ไฟล์ที่ "ใบนี้" เปลี่ยน → PIN (ไม่ย้ายตามหมุดเลน)) ◂
    // ORACLE-EDIT ผู้คุม 21.10 (CD-RP11b): หลัง merge ไฟล์ที่เปลี่ยนตั้งแต่หมุดใบรวมไฟล์ของใบหลัง (P3.9U 'use client' import *-actions = ถูกกติกา S5.17) — สแกนเฉพาะไฟล์ที่เปลี่ยนจากหมุดเลน · ไฟล์ของใบนี้ตรวจแล้ว 41/41 ก่อน merge ◂
    const changed = changedFiles("src", LANE_PIN).filter((f) => /\.(ts|tsx)$/.test(f) && ex(f));
    for (const f of changed) {
      const raw = rd(f);
      if (isUseServer(raw)) {
        const s = stripComments(raw);
        const nonAsync = [...s.matchAll(/export\s+(?!async\s+function)(const|let|var|function|class|default|type\b|interface\b|enum\b|\{|\*)/g)].length;
        if (nonAsync) p.push(`${f.split("/").pop()} ("use server") export ที่ไม่ใช่ async function ${nonAsync}`);
      }
      if (isUseClient(raw)) {
        // ORACLE-EDIT ผู้คุม 22.10 (CD-SKEL-O3: ตรวจเฉพาะ import ที่เพิ่มใหม่หลังหมุดเลน — import เดิมของไฟล์ที่ใบหลังแค่แตะ (เช่น ShiftsClient → device-id) ไม่ใช่ของใบนี้ · ไฟล์ใหม่ = ตรวจทุก import) ◂
        const prevImports = new Set(valueImportsOf(gitStr(["show", `${LANE_PIN}:${f}`]) ?? ""));
        const bad = valueImportsOf(raw).filter((m) => !prevImports.has(m)).filter((m) => /^@\/lib\/modules\/pos\/(?![\w-]+-(shared|actions)$)/.test(m) || /^@\/lib\/platform\/etax/.test(m)); // ORACLE-EDIT ผู้คุม 22.10 (CD-SKEL-O2: 'use client' import *-actions ถูกต้องตาม S5.17 เช่นเดียวกับ *-shared — เดิมแดงทุกใบ U ที่แตะไฟล์ client)
        if (bad.length) p.push(`${f.split("/").pop()} ('use client') import ${bad[0]}`);
      }
    }
    for (const f of walk(POS_DIR)) {
      if (importsOf(rd(f)).some((m) => /^@\/lib\/modules\/chat(\/|$)|^\.\.\/chat(\/|$)/.test(m))) p.push(`${f.split("/").pop()} import แชท`);
      if (/CHAT_CREDENTIALS_KEY/.test(stripComments(rd(f)))) p.push(`${f.split("/").pop()} ใช้ CHAT_CREDENTIALS_KEY`);
    }
    if (!rd(F.integrations).includes(PROMPTPAY_FACT)) p.push(`fact ${PROMPTPAY_FACT} เปลี่ยน (§10-9 facts คง false)`);
    chk("ST3", p.length === 0, `หมุดเทียบ LANE_PIN ${LANE_PIN} (ใบ PIN ${PIN}) ครบ`, why(p, "ครบ "));
  });

  // SK1 SK2 บริสุทธิ์ (secret-box import ได้เฉพาะ node:crypto)
  const sbImp = ex(F.secretBox) ? impureChain(F.secretBox, PURE_NODE) : `${MISSING} ${F.secretBox}`;
  const sb = sbImp ? null : await tryImport("@/lib/modules/pos/secret-box");
  const KEY = randomBytes(32).toString("hex");
  const OBJ = { client_id: `qc-cid-${randomBytes(4).toString("hex")}`, client_secret: `qc-sec-${randomBytes(12).toString("hex")}-ABCD`, [WEBHOOK_SECRET_FIELD]: `qc-whs-${randomBytes(12).toString("hex")}-WXYZ` };
  const SECRETS = Object.values(OBJ);
  await step("SK1", () => {
    const p: string[] = [];
    if (sbImp) {
      chk("SK1", false, "secret-box บริสุทธิ์ + มี", sbImp);
      return;
    }
    const box = callSync(sb, "sealPosSecret", OBJ, { key: KEY });
    if (typeof box !== "string") p.push(`sealPosSecret → ${short(box, 80)} (คาดสตริง)`);
    else {
      const parts = box.split(".");
      if (parts.length !== 3 || parts.some((x: string) => !/^[A-Za-z0-9+/]+={0,2}$/.test(x))) p.push(`รูปกล่อง ${short(box, 40)} (คาด b64.b64.b64)`);
      else {
        if (Buffer.from(parts[0]!, "base64").length !== 12) p.push("iv ไม่ใช่ 12 ไบต์");
        if (Buffer.from(parts[1]!, "base64").length !== 16) p.push("tag ไม่ใช่ 16 ไบต์");
      }
      const plainB64 = Buffer.from(JSON.stringify(OBJ)).toString("base64");
      if (leaks(box, SECRETS) || box.includes(plainB64.slice(0, 24))) p.push("กล่องมีค่าลับ/ base64 ของค่าลับ");
      const box2 = callSync(sb, "sealPosSecret", OBJ, { key: KEY });
      if (box2 === box) p.push("ปิด 2 ครั้งได้กล่องเดียวกัน (iv ไม่สุ่ม)");
      const opened = callSync(sb, "openPosSecret", box, { key: KEY });
      if (js(opened) !== js(OBJ) && !(isRecord(opened) && Object.entries(OBJ).every(([k, v]) => opened[k] === v))) p.push(`openPosSecret → ${short(opened?.__missing ? opened.code : "ไม่ตรง", 60)}`);
      try {
        const mine = oracleOpen(box, KEY) as Any;
        if (!isRecord(mine) || Object.entries(OBJ).some(([k, v]) => mine[k] !== v)) p.push("ข้อสอบเปิดเองได้แต่ค่าไม่ตรง");
      } catch (e) {
        p.push(`ข้อสอบเปิดด้วย SHA-256("pos-credentials:"+key) ไม่ได้ (${(e as Error).message.slice(0, 40)}) — กุญแจ/รูปแบบไม่ตรง K1`);
      }
    }
    chk("SK1", p.length === 0, "กล่อง K1 ตรงรูปแบบ · ปิด/เปิดกลับได้", why(p));
  });
  await step("SK2", async () => {
    const p: string[] = [];
    if (sbImp) {
      chk("SK2", false, "secret-box บริสุทธิ์ + มี", sbImp);
      return;
    }
    const box = callSync(sb, "sealPosSecret", OBJ, { key: KEY });
    const bad = (lbl: string, r: Any) => {
      if (r?.__threw) p.push(`${lbl} throw ${short(r.message, 40)}`);
      else if (r?.__missing) p.push(`${lbl} ${MISSING}`);
      else if (leaks(r, SECRETS)) p.push(`${lbl} ได้ค่าลับ`);
    };
    bad("กุญแจผิด", callSync(sb, "openPosSecret", box, { key: `${KEY}x` }));
    if (typeof box === "string") {
      const i = box.length - 3;
      const flip = box.slice(0, i) + (box[i] === "A" ? "B" : "A") + box.slice(i + 1);
      bad("กล่องถูกแก้", callSync(sb, "openPosSecret", flip, { key: KEY }));
    }
    for (const g of ["", "a.b", null, 42, {}, "x.y.z", undefined]) bad(`ขยะ ${short(g, 10)}`, callSync(sb, "openPosSecret", g, { key: KEY }));
    // แยกโดเมน
    const chat = await tryImport("@/lib/modules/chat/crypto");
    const prev = process.env.CHAT_CREDENTIALS_KEY;
    try {
      process.env.CHAT_CREDENTIALS_KEY = KEY;
      if (chat && typeof box === "string") {
        const r = callSync(chat, "decryptCreds", box);
        if (leaks(r, SECRETS)) p.push("chat decryptCreds เปิดกล่อง POS ได้ (ไม่แยกโดเมน)");
      }
    } finally {
      if (prev === undefined) delete process.env.CHAT_CREDENTIALS_KEY;
      else process.env.CHAT_CREDENTIALS_KEY = prev;
    }
    bad("กล่องรูปแบบแชท", callSync(sb, "openPosSecret", chatStyleBox(OBJ, KEY), { key: KEY }));
    chk("SK2", p.length === 0, "เปิดไม่ได้ = ไม่มีค่าลับ ไม่ throw · แยกโดเมนจากแชท", why(p));
  });

  // ET1 บริสุทธิ์ (render/types import ได้เฉพาะ node: + ไฟล์ในโฟลเดอร์ etax)
  await step("ET1", async () => {
    const p: string[] = [];
    const imp = ex(F.etaxRender) ? impureChain(F.etaxRender, /^node:(crypto|buffer|util)$|^@\/lib\/platform\/etax\/[\w-]+$/) : `${MISSING} ${F.etaxRender}`;
    if (imp) {
      chk("ET1", false, "render.ts บริสุทธิ์ + มี", imp);
      return;
    }
    const m = await tryImport("@/lib/platform/etax/render");
    const n0 = callSync(m, "normalizeEtaxDocument", structuredClone(ETAX_DOC));
    if (n0?.ok !== true || !isRecord(n0.doc)) p.push(`normalize(ตัวอย่าง) → ${codeOf(n0)} ${short(n0?.message ?? n0?.code, 60)}`);
    const bad: [string, Any][] = [
      ["เลขภาษีผิด", { ...ETAX_DOC, buyer: { ...ETAX_DOC.buyer, taxId: `${BUYER_TAX.slice(0, 12)}${(Number(BUYER_TAX[12]) + 1) % 10}` } }],
      ["net+vat≠grand", { ...ETAX_DOC, totals: { ...ETAX_DOC.totals, vatSatang: 1113 } }],
      ["Σบรรทัด≠grand", { ...ETAX_DOC, lines: [ETAX_DOC.lines[0]] }],
      ["typeCode แปลก", { ...ETAX_DOC, doc: { ...ETAX_DOC.doc, typeCode: "999" } }],
      ["ไม่มีผู้ขาย", { ...ETAX_DOC, seller: undefined }],
      ["null", null],
    ];
    for (const [lbl, v] of bad) {
      const r = callSync(m, "normalizeEtaxDocument", v);
      if (r?.__threw) p.push(`${lbl} throw`);
      else if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)} (คาด VALIDATION)`);
    }
    const doc = n0?.ok === true ? n0.doc : structuredClone(ETAX_DOC);
    const x1 = callSync(m, "renderEtaxXml", doc);
    if (typeof x1 !== "string") p.push(`renderEtaxXml → ${short(x1?.code ?? x1, 60)}`);
    else {
      if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(x1)) p.push("ไม่ขึ้นต้น <?xml version=\"1.0\" encoding=\"UTF-8\"?>");
      const root = /<\?xml[^>]*>\s*<(?:([\w-]+):)?([\w-]+)/.exec(x1)?.[2];
      if (root !== "TaxInvoice_CrossIndustryInvoice") p.push(`ราก ${root} (คาด TaxInvoice_CrossIndustryInvoice)`);
      const exd = blockOf(x1, "ExchangedDocument");
      if (!exd) p.push("ไม่มี ExchangedDocument");
      else {
        if (!tagVals(exd, "ID").includes(ETAX_DOC.doc.number)) p.push("ExchangedDocument/ID ≠ เลขเอกสาร");
        if (!tagVals(exd, "TypeCode").includes("388")) p.push("TypeCode ≠ 388");
        const idt = blockOf(exd, "IssueDateTime");
        if (!idt.includes(ETAX_DOC.doc.issueDate)) p.push("IssueDateTime ไม่มีวันที่ออก");
      }
      const seller = blockOf(x1, "SellerTradeParty");
      if (!seller.includes("บริษัท ร้านคิวซี &amp; ลูกค้า จำกัด")) p.push("ผู้ขาย: ชื่อ (escape &) ไม่ตรง");
      if (!seller.includes(SELLER_TAX)) p.push("ผู้ขาย: ไม่มีเลขภาษี");
      const buyer = blockOf(x1, "BuyerTradeParty");
      if (!buyer.includes("บริษัท ผู้ซื้อ &lt;ทดสอบ&gt; จำกัด")) p.push("ผู้ซื้อ: ชื่อ (escape < >) ไม่ตรง");
      if (!buyer.includes(BUYER_TAX)) p.push("ผู้ซื้อ: ไม่มีเลขภาษี");
      if (!x1.includes("กาแฟเย็น") || /&#\d+;|&#x[0-9a-f]+;/i.test(x1)) p.push("ไทยไม่ใช่ UTF-8 ตรง (มี &# หรือหาย)");
      if (countTag(x1, "IncludedSupplyChainTradeLineItem") !== 2) p.push(`บรรทัด ${countTag(x1, "IncludedSupplyChainTradeLineItem")} (คาด 2)`);
      for (const [t, v] of [["GrandTotalAmount", "170.00"], ["TaxTotalAmount", "11.12"], ["TaxBasisTotalAmount", "158.88"]] as const) if (!tagVals(x1, t).includes(v)) p.push(`${t} ${short(tagVals(x1, t), 30)} (คาด ${v})`);
      await sleep(5);
      const x2 = callSync(m, "renderEtaxXml", doc);
      if (x2 !== x1) p.push("render 2 ครั้งไม่เท่ากัน (ไม่กำหนดได้)");
      const x3 = callSync(m, "renderEtaxXml", { ...doc, totals: { ...doc.totals, grandSatang: 17001, netSatang: 15889 } });
      if (x3 === x1) p.push("ยอดเปลี่ยนแต่ XML เท่าเดิม");
      const h = sha256(x1);
      if (ET1_GOLDEN_SHA256 && h !== ET1_GOLDEN_SHA256) p.push(`แฮช ${h.slice(0, 16)} ≠ ตรึง ${ET1_GOLDEN_SHA256.slice(0, 16)}`);
      if (!ET1_GOLDEN_SHA256) console.log(`  ℹ️  ET1 แฮชที่ได้ ${h} (ยังไม่ตรึง — ORACLE-EDIT หลังเขียวแรก)`);
    }
    chk("ET1", p.length === 0, "normalize + render ตามโครง ขมธอ.3-2560 · กำหนดได้", why(p));
  });
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length })}`);
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
for (const [f, label] of [
  [F.secretBox, "pos/secret-box.ts (K1)"],
  [F.creds, "pos/integration-creds.ts (K2)"],
  [F.registry, "pos/platform/registry.ts (R1 R4)"],
  [F.platformRoute, "route /api/pos/platform/[provider]/[channelId] (R2)"],
  [F.slip, "pos/payment-slip.ts (R6 R7 R10)"],
  [F.reconcile, "pos/payment-reconcile.ts (R9)"],
  [F.etaxLink, "pos/etax-link.ts (R11)"],
  [F.relay, "pos/print-relay.ts (R13)"],
  [F.agent, "tools/pos-print-agent/agent.mjs (R13)"],
] as const) if (!ex(f)) skipReasons.push(`ยังไม่มี ${label}`);
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const MODEL = (acc: string): Any => (P?.[acc] && typeof P[acc].findMany === "function" ? P[acc] : null);
const missingModels = NEW_ACCESSORS.filter((a) => !MODEL(a));
if (missingModels.length) skipReasons.push(`Prisma client ยังไม่มีตาราง ${missingModels.join(", ")} (migration ${MIGRATION} ยังไม่ลง/ยังไม่ generate)`);
/** ตารางมีจริงใน DB ไหม (อ่านอย่างเดียว) */
async function tableExists(model: string): Promise<boolean> {
  try {
    const r = (await P.$queryRawUnsafe(`SELECT to_regclass($1) IS NOT NULL AS ok`, `"${model}"`)) as Any[];
    return !!r[0]?.ok;
  } catch {
    return false;
  }
}
const TABLES: Record<string, boolean> = {};
for (const m of NEW_MODELS) TABLES[m] = await tableExists(m);
const TEMP_SQL = `(SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p3s-%')`;
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราว (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const sqls: [string, string][] = [
    ["FileAssetPrivate", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id, ',' ORDER BY x.id)), '-') AS h FROM "FileAsset" x WHERE x.path LIKE 't/%/private/%' AND NOT (x."tenantId" IN ${TEMP_SQL})`],
    ["PosPaymentIntent", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.status, ',' ORDER BY x.id)), '-') AS h FROM "PosPaymentIntent" x WHERE NOT (x."tenantId" IN ${TEMP_SQL})`],
    ...NEW_MODELS.filter((m) => TABLES[m]).map((m): [string, string] => [m, `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id, ',' ORDER BY x.id)), '-') AS h FROM "${m}" x WHERE NOT (x."tenantId" IN ${TEMP_SQL})`]),
  ];
  const out: Record<string, string> = {};
  for (const [k, sql] of sqls) {
    try {
      const r = (await P.$queryRawUnsafe(sql)) as Any[];
      out[k] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[k] = `อ่านไม่ได้:${(e as Error).message.slice(0, 30)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3-SKEL ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons.slice(0, 12)) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล ไม่ crash)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ld = async (f: string, spec: string): Promise<Any> => (ex(f) ? tryImport(spec) : null);
const secretBox = await ld(F.secretBox, "@/lib/modules/pos/secret-box");
const credsMod = await ld(F.creds, "@/lib/modules/pos/integration-creds");
const registry = await ld(F.registry, "@/lib/modules/pos/platform/registry");
const platRoute = await ld(F.platformRoute, "@/app/api/pos/platform/[provider]/[channelId]/route");
const slipMod = await ld(F.slip, "@/lib/modules/pos/payment-slip");
const verifyMod = await ld(F.slipVerify, "@/lib/modules/pos/slip-verify");
const recMod = await ld(F.reconcile, "@/lib/modules/pos/payment-reconcile");
const etaxLink = await ld(F.etaxLink, "@/lib/modules/pos/etax-link");
const etaxProv = await ld(F.etaxProvider, "@/lib/platform/etax/provider");
const relay = await ld(F.relay, "@/lib/modules/pos/print-relay");
const jobsRoute = await ld(F.jobsRoute, "@/app/api/pos/print-agent/jobs/route");
const ackRoute = await ld(F.ackRoute, "@/app/api/pos/print-agent/jobs/[id]/ack/route");
const oaMod = await tryImport("@/lib/modules/pos/order-adapters");
const ord = await tryImport("@/lib/modules/pos/order");
const kdsMod = await tryImport("@/lib/modules/pos/kds");
const intentMod = await tryImport("@/lib/modules/pos/payment-intent");
const register = await tryImport("@/lib/modules/pos/register");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const catalogMod = await tryImport("@/lib/modules/pos/catalog");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");
const linksMod = await tryImport("@/lib/storage/private-links");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p3s-${RAND}`;
const T_SLUG = `posqc-p3s-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc3s-${RAND}`;
const RUN_KEY = randomBytes(32).toString("hex");
let T = "";
let T2 = "";
const RUN_START = Date.now();
const PPID = "0105561177639";
const BASE_URL = "https://qc.invalid";

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: { host: string }[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push({ host });
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
async function settle(maxMs = 15_000): Promise<void> {
  await drain();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const ids = [T, T2].filter(Boolean);
    const n = ids.length ? Number(await P.outboxEvent.count({ where: { tenantId: { in: ids }, status: "PENDING", availableAt: { lte: new Date() } } }).catch(() => 0)) : 0;
    if (!n) return;
    await sleep(250);
    await drain();
  }
}
/** env ของรอบ (คืนค่าเดิมใน finally) */
const ENV_KEYS = ["POS_CREDENTIALS_KEY", "SESSION_SECRET", "NODE_ENV", "CHAT_CREDENTIALS_KEY", "SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"] as const;
const ENV_SAVED: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const envSet = (k: string, v: string | undefined) => {
  if (v === undefined) delete (process.env as Any)[k];
  else (process.env as Any)[k] = v;
};
const envRestore = () => {
  for (const k of ENV_KEYS) envSet(k, ENV_SAVED[k]);
};

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  envSet("POS_CREDENTIALS_KEY", RUN_KEY);
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    envSet("SESSION_SECRET", `qc-p3s-session-${randomBytes(24).toString("hex")}`);
    console.log("  ℹ️  SESSION_SECRET ไม่มีใน env ของรอบ — ตั้งค่าสุ่มในโปรเซสนี้เท่านั้น (ลิงก์ไฟล์ส่วนตัว SL6)");
  }
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ -t2) · DB ${HOST} · ตาราง ${NEW_MODELS.map((m) => `${m}:${TABLES[m] ? "มี" : "ไม่มี"}`).join(" ")} ──`);
  console.log("   สาขา A (POS ผูกบัญชี VAT · พร้อมเพย์ · LINEMAN/GRAB/SHOPEE API · TIKTOK MANUAL) · B (POS) · T2 X (POS · GRAB API)");
  let fx = "";
  const soft: string[] = [];
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  let PRD = "";
  try {
    T = (await P.tenant.create({ data: { name: `QC P3-SKEL โครง ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P3-SKEL ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    for (const [k, tid, slug] of [["A", T, `${T_SLUG}-a`], ["B", T, `${T_SLUG}-b`], ["X", T2, `${T2_SLUG}-x`]] as const) U[k] = (await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} สาขา${k}`, slug } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านโครงคิวซี ${RAND} จำกัด`, taxId: SELLER_TAX, vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const spec: [string, () => string, string, () => string[], Record<string, boolean>][] = [
    ["OWNER", () => T, "OWNER", () => ["*"], {}],
    ["MGR", () => T, "MANAGER", () => [U.A ?? "-", U.B ?? "-"], {}],
    ["STAFF", () => T, "STAFF", () => [U.A ?? "-"], { "pos.sale.create": true, "pos.sale.read": true, "pos.channel.manage": true, "pos.order.accept": true, "pos.order.reject": true, "pos.shift.manage": true }],
    ["CASHIER", () => T, "STAFF", () => [U.A ?? "-"], { "pos.sale.create": true, "pos.sale.read": true }],
    ["CASHB", () => T, "STAFF", () => [U.B ?? "-"], { "pos.sale.create": true, "pos.sale.read": true, "pos.sale.manage": true }],
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
  const DEV1 = `qc3s${RAND}d1`;
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const posSettings = async (sysId: string): Promise<Any> => {
    const sys = await P.appSystem.findUnique({ where: { id: sysId }, select: { settings: true } });
    return isRecord(sys?.settings) ? sys.settings : {};
  };
  const patchPos = async (sysId: string, key: string, patch: Any): Promise<void> => {
    const base = await posSettings(sysId);
    const pos = isRecord(base.pos) ? { ...base.pos } : {};
    const cur = { ...(isRecord(pos[key]) ? pos[key] : {}), ...patch };
    for (const [k, v] of Object.entries(cur)) if (v === undefined) delete cur[k];
    pos[key] = cur;
    await P.appSystem.update({ where: { id: sysId }, data: { settings: { ...base, pos } } });
  };
  if (!fx) {
    try {
      await patchPos(S.POS, "payment", { qrExpiryMinutes: 20, beam: { enabled: false }, manualConfirmRequiresManager: false, promptpayIdByUnit: { [U.A!]: PPID } });
      await patchPos(S.POSX, "payment", { qrExpiryMinutes: 20, beam: { enabled: false } });
    } catch (e) {
      fx = `ค่าตั้ง POS:${(e as Error).message.slice(0, 120)}`;
    }
  }
  // ─── ช่องทาง + สินค้า ───
  if (!fx) {
    try {
      for (const u of ["A", "X"]) {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: u === "X" ? T2 : T, systemId: u === "X" ? S.POSX : S.POS, unitId: U[u] });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${u}: ${codeOf(r)}`);
      }
      const mk = async (u: string, actor: string, code: string, adapter: string) => String(must(`saveChannel ${code}`, await call(chMod, "saveChannel", ctxU(u), A(actor), { code, name: `${code} ${RAND}`, adapter })).channel?.id ?? "");
      CH.LM = await mk("A", "OWNER", "LINEMAN", "API");
      CH.GR = await mk("A", "OWNER", "GRAB", "API");
      CH.SH = await mk("A", "OWNER", "SHOPEE", "API");
      CH.TT = await mk("A", "OWNER", "TIKTOK", "MANUAL");
      CH.GX = await mk("X", "OWNER2", "GRAB", "API");
      const lm = await P.salesChannel.findUnique({ where: { id: CH.LM } });
      if (lm?.adapter !== "API") soft.push(`(fixture) LINEMAN adapter ${lm?.adapter}`);
      PRD = String((await call(catalogMod, "createProduct", cc("OWNER"), { name: `ข้าวผัด ${RAND}`, kind: "MENU", basePriceSatang: 8000 }))?.id ?? "");
      if (!PRD) throw new Error("createProduct ไม่ได้ id");
    } catch (e) {
      fx = `ช่องทาง/สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เครื่อง + กะ (สาขา A) ───
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: "เคาน์เตอร์ QC P3-SKEL", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o = await call(shiftMod, "openShift", ctxU("A", DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC P3-SKEL", floatSatang: 0 });
    if (o?.ok !== true) fx = `เปิดกะ: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
  }
  // ─── บิล (โอน ×4 · เงินสด · ใบกำกับเต็มรูปตอนชำระ ×2) ───
  type Bill = { id: string; receiptNo: string; grand: number; paymentId: string; paidAt: Date | null; err: string };
  const NOBILL: Bill = { id: "", receiptNo: "", grand: 0, paymentId: "", paidAt: null, err: "fixture" };
  const BUY = { kind: "JURISTIC", name: `บริษัท ผู้ซื้อโครง ${RAND} จำกัด`, taxId: withCheck(`010${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`), branchCode: "00000", address: "1/1 ถ.สีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500", email: `qcp3s${RAND}@example.com` };
  const BUY2 = { kind: "PERSON", name: `นายผู้ซื้อไม่มีอีเมล ${RAND}`, taxId: withCheck(`010${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`), branchCode: "00000", address: "3/3 ต.ช้างคลาน อ.เมือง จ.เชียงใหม่ 50100", email: null };
  const sell = async (label: string, type: "CASH" | "TRANSFER", price: number, taxInvoice?: Any): Promise<Bill> => {
    if (fx) return NOBILL;
    const c = ctxU("A", DEV1);
    const cart: Any = { lines: [{ name: `ของ ${label} ${RAND}`, qty: 1, unitPriceSatang: price }] };
    const q = await call(register, "quoteRegisterCart", c, A("OWNER"), cart);
    if (q?.ok !== true) return { ...NOBILL, err: `quote ${codeOf(q)} ${short(q?.message ?? "", 60)}` };
    const grand = Number(q.grandTotalSatang);
    const pm: Any = type === "CASH" ? { type, amountSatang: grand } : { type, amountSatang: grand, reference: `QC-TR-${RAND}-${label}` };
    const input: Any = { ...cart, idempotencyKey: newKey(`s-${label}`), expectedGrandTotalSatang: grand, payMethods: [pm], ...(type === "CASH" ? { cashReceivedSatang: grand } : {}), ...(taxInvoice ? { taxInvoice } : {}) };
    const r = await call(register, "submitRegisterSale", c, A("OWNER"), input);
    if (r?.ok !== true) return { ...NOBILL, grand, err: `submit ${codeOf(r)} ${short(r?.message ?? "", 60)}` };
    const id = String(r.saleId);
    const row = (await P.posSale.findUnique({ where: { id } }).catch(() => null)) as Any;
    const pay = (await P.posPayment.findFirst({ where: { saleId: id, type } }).catch(() => null)) as Any;
    return { id, receiptNo: String(row?.receiptNo ?? r.receiptNo ?? ""), grand, paymentId: String(pay?.id ?? ""), paidAt: (row?.paidAt ?? row?.createdAt ?? null) as Date | null, err: "" };
  };
  const B: Record<string, Bill> = {};
  for (const [k, t, pr, ti] of [["ST", "TRANSFER", 5000, null], ["ST2", "TRANSFER", 6000, null], ["ST3", "TRANSFER", 7000, null], ["ST4", "TRANSFER", 8000, null], ["SC", "CASH", 3000, null], ["TI", "CASH", 10700, BUY], ["TI2", "CASH", 5350, BUY2]] as const) {
    B[k] = await sell(k, t as "CASH" | "TRANSFER", pr, ti ?? undefined);
    if (B[k]!.err && B[k]!.err !== "fixture") soft.push(`บิล ${k}: ${B[k]!.err}`);
  }
  if (!fx) await settle();
  // ─── ใบขอรับเงิน PROMPTPAY_STATIC: PI (PENDING) · PI2 (ยกเลิก) ───
  const noBeam = { beam: { enabled: () => false, createCharge: async () => ({ ok: false, error: "qc: ไม่มี Beam" }) } };
  let PI = "";
  let PI2 = "";
  if (!fx) {
    const r1 = await call(intentMod, "createPaymentIntent", ctxU("A", DEV1), A("OWNER"), { method: "PROMPTPAY", amountSatang: 4200, idempotencyKey: newKey("pi"), deviceId: DEV1 }, noBeam);
    PI = r1?.ok === true ? String(r1.intent?.id ?? "") : "";
    const r2 = await call(intentMod, "createPaymentIntent", ctxU("A", DEV1), A("OWNER"), { method: "PROMPTPAY", amountSatang: 4300, idempotencyKey: newKey("pi2"), deviceId: DEV1 }, noBeam);
    PI2 = r2?.ok === true ? String(r2.intent?.id ?? "") : "";
    if (PI2) await call(intentMod, "cancelPaymentIntent", ctxU("A", DEV1), A("OWNER"), { intentId: PI2 });
    if (!PI || !PI2) soft.push(`(fixture) ใบขอรับเงิน: ${codeOf(r1)} / ${codeOf(r2)}`);
  }
  if (soft.length) console.log(`  ℹ️  fixture อ่อน: ${soft.join(" · ")}`);
  const FX = (s = "") => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l}`);
  const NT = (...ms: string[]) => ms.filter((m) => !MODEL(m.charAt(0).toLowerCase() + m.slice(1))).map((m) => `ไม่มีตาราง ${m} (migration)`);

  // ─── สเปกฟิลด์ของ adapter (จาก requiredFields) + ค่าทดสอบ ───
  type FieldSpec = { name: string; secret: boolean; required: boolean };
  const fieldSpec = (prov: string): FieldSpec[] => {
    const rf = registry?.PLATFORM_ADAPTERS?.[prov]?.requiredFields;
    const looksSecret = (n: string) => /secret|key|token|password/i.test(n);
    if (!Array.isArray(rf) || !rf.length) return [{ name: "client_id", secret: false, required: true }, { name: "client_secret", secret: true, required: true }, { name: WEBHOOK_SECRET_FIELD, secret: true, required: true }];
    return rf.map((f: Any) => (typeof f === "string" ? { name: f, secret: looksSecret(f), required: true } : { name: String(f?.name ?? ""), secret: f?.secret === true || looksSecret(String(f?.name ?? "")), required: f?.required !== false }));
  };
  let vN = 0;
  const VAL: Record<string, Record<string, string>> = {};
  const valuesFor = (prov: string): Record<string, string> => {
    if (!VAL[prov]) VAL[prov] = Object.fromEntries(fieldSpec(prov).map((f) => [f.name, `qc3s-${prov.toLowerCase()}-${f.name}-${randomBytes(9).toString("hex")}-${String(++vN).padStart(2, "0")}Q${RAND.slice(0, 1)}`]));
    return VAL[prov]!;
  };
  const SECRET_VALUES = (): string[] => Object.entries(VAL).flatMap(([prov, vs]) => fieldSpec(prov).filter((f) => f.secret).map((f) => vs[f.name]!).filter(Boolean));
  const credIn = (prov: string, channelId: string, fields: Record<string, string>): Any => ({ kind: "PLATFORM", provider: prov, channelId, fields });
  const save = (u: string, actor: string, input: Any, deps: Any = { key: RUN_KEY }) => call(credsMod, "saveIntegrationCredentials", ctxU(u), A(actor), input, deps);
  const readC = (u: string, actor: string, input: Any, deps: Any = { key: RUN_KEY }) => call(credsMod, "readIntegrationCredentials", ctxU(u), A(actor), input, deps);
  const RESULTS_SEEN: unknown[] = [];
  const keep = <X,>(r: X): X => {
    RESULTS_SEEN.push(r);
    return r;
  };
  const credRows = async (tid: string): Promise<Any[]> => (MODEL("posIntegrationCredential") ? ((await MODEL("posIntegrationCredential").findMany({ where: { tenantId: tid } }).catch(() => [])) as Any[]) : []);

  // ════════ SK3 ไม่มีกุญแจ ════════
  await step("SK3", async () => {
    const p: string[] = [...NEED([credsMod, "integration-creds.ts"]), ...NT("PosIntegrationCredential")];
    const lmF = fieldSpec("LINEMAN");
    const part = { [lmF[0]!.name]: valuesFor("LINEMAN")[lmF[0]!.name]! };
    const r1 = keep(await save("A", "OWNER", credIn("LINEMAN", CH.LM ?? "none", part), { key: null }));
    if (!refused(r1, "NOT_CONFIGURED")) p.push(`deps.key null → ${codeOf(r1)} (คาด NOT_CONFIGURED)`);
    else if (!String(r1.message ?? r1.reason ?? "").includes("POS_CREDENTIALS_KEY")) p.push("ข้อความไม่บอก POS_CREDENTIALS_KEY");
    envSet("POS_CREDENTIALS_KEY", undefined);
    envSet("NODE_ENV", "production");
    let r2: Any = null;
    let rd0: Any = null;
    try {
      r2 = keep(await save("A", "OWNER", credIn("LINEMAN", CH.LM ?? "none", part), {})); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-B1 fix1 F1: undefined → {} — ค่าปริยายของ save ฉีด RUN_KEY ทั้งที่ข้อนี้ "ไม่ฉีด") ◂
      rd0 = keep(await readC("A", "OWNER", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }, {})); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-SKEL-B1 fix1 F1: undefined → {}) ◂
    } finally {
      envSet("NODE_ENV", ENV_SAVED.NODE_ENV);
      envSet("POS_CREDENTIALS_KEY", RUN_KEY);
    }
    if (!refused(r2, "NOT_CONFIGURED")) p.push(`env ไม่มีกุญแจ + production → ${codeOf(r2)} (คาด NOT_CONFIGURED · ไม่มีกุญแจสำรอง)`);
    if (rd0?.ok !== true || rd0.keyConfigured !== false || rd0.ready !== false) p.push(`อ่านตอนไม่มีกุญแจ → ${codeOf(rd0)} keyConfigured ${short(rd0?.keyConfigured, 10)} ready ${short(rd0?.ready, 10)}`);
    const n = (await credRows(T)).length;
    if (n) p.push(`มีแถว creds ${n} (คาด 0)`);
    chk("SK3", !fx && p.length === 0, "ไม่มีกุญแจ = ปฏิเสธบันทึก · ตัวอ่านบอก keyConfigured false", why(p, FX()));
  });

  // ════════ CR ที่เก็บ credentials ════════
  const lmSpec = fieldSpec("LINEMAN");
  const lmVals = valuesFor("LINEMAN");
  const lmFirst = lmSpec[0]?.name ?? "client_id";
  const lmRest = Object.fromEntries(lmSpec.slice(1).map((f) => [f.name, lmVals[f.name]!]));
  let CR_SAVE1: Any = null;
  await step("CR1", async () => {
    const p: string[] = [...NEED([credsMod, "integration-creds.ts"]), ...NT("PosIntegrationCredential")];
    CR_SAVE1 = keep(await save("A", "OWNER", credIn("LINEMAN", CH.LM ?? "none", { [lmFirst]: lmVals[lmFirst]! })));
    if (CR_SAVE1?.ok !== true) p.push(`OWNER บันทึก → ${codeOf(CR_SAVE1)} ${short(CR_SAVE1?.message ?? "", 60)}`);
    const before = js((await credRows(T)).map((r) => [r.id, r.status, String(r.updatedAt)]));
    const m = keep(await save("A", "MGR", credIn("LINEMAN", CH.LM ?? "none", lmVals)));
    if (!refused(m, "PERMISSION_DENIED")) p.push(`MANAGER บันทึก → ${codeOf(m)} (คาด PERMISSION_DENIED · OWNER เท่านั้น)`);
    if (js((await credRows(T)).map((r) => [r.id, r.status, String(r.updatedAt)])) !== before) p.push("MANAGER ทำให้แถวเปลี่ยน");
    const rs = keep(await readC("A", "STAFF", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }));
    if (rs?.ok !== true) p.push(`STAFF (pos.channel.manage) อ่าน → ${codeOf(rs)}`);
    const rc = keep(await readC("A", "CASHIER", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }));
    if (!refused(rc, "PERMISSION_DENIED")) p.push(`CASHIER อ่าน → ${codeOf(rc)} (คาด PERMISSION_DENIED)`);
    const x1 = keep(await readC("X", "OWNER2", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }));
    if (!refused(x1, "NOT_FOUND")) p.push(`T2 อ่านช่องทาง T → ${codeOf(x1)} (คาด NOT_FOUND)`);
    const x2 = keep(await save("X", "OWNER2", credIn("LINEMAN", CH.LM ?? "none", lmVals)));
    if (!refused(x2, "NOT_FOUND")) p.push(`T2 บันทึกช่องทาง T → ${codeOf(x2)} (คาด NOT_FOUND)`);
    if ((await credRows(T2)).length) p.push("ร้าน T2 มีแถว creds");
    for (const [lbl, inp] of [
      ["provider ≠ รหัสช่องทาง", credIn("GRAB", CH.LM ?? "none", { [lmFirst]: "x" })],
      ["provider มั่ว", credIn("FOO", CH.LM ?? "none", { [lmFirst]: "x" })],
      ["ฟิลด์แปลก", credIn("LINEMAN", CH.LM ?? "none", { bogusField: "x" })],
      ["kind มั่ว", { kind: "BOGUS", provider: "LINEMAN", channelId: CH.LM, fields: {} }],
    ] as const) {
      const r = keep(await save("A", "OWNER", inp));
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)} (คาด VALIDATION)`);
    }
    chk("CR1", !fx && p.length === 0, "OWNER เท่านั้นที่บันทึก · อ่าน masked ตามสิทธิ์ · ข้ามร้าน NOT_FOUND · ข้อมูลผิด VALIDATION", why(p, FX()));
  });
  await step("CR3", async () => {
    const p: string[] = [...NEED([credsMod, "integration-creds.ts"]), ...NT("PosIntegrationCredential")];
    const st1 = CR_SAVE1?.status ?? CR_SAVE1?.credential?.status;
    const r1 = keep(await readC("A", "OWNER", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }));
    if (lmSpec.length > 1 && (r1?.status ?? st1) !== "DRAFT") p.push(`บางฟิลด์ → status ${short(r1?.status ?? st1, 20)} (คาด DRAFT)`);
    const s2 = keep(await save("A", "OWNER", credIn("LINEMAN", CH.LM ?? "none", lmRest)));
    if (s2?.ok !== true) p.push(`บันทึกที่เหลือ → ${codeOf(s2)} ${short(s2?.message ?? "", 60)}`);
    const r2 = keep(await readC("A", "OWNER", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }));
    if (r2?.status !== "COMPLETE") p.push(`ครบทุกฟิลด์ → status ${short(r2?.status, 20)} (คาด COMPLETE)`);
    const fl: Any[] = Array.isArray(r2?.fields) ? r2.fields : [];
    const notFilled = lmSpec.filter((f) => f.required && !fl.some((x) => x?.name === f.name && x?.filled === true));
    if (notFilled.length) p.push(`ยังไม่ filled: ${notFilled.map((f) => f.name).join(",")} (ฟิลด์เดิมต้องคงอยู่เมื่อบันทึกบางส่วน)`);
    const row = (await credRows(T)).find((r) => r.provider === "LINEMAN" && r.channelId === CH.LM);
    if (!row) p.push("ไม่มีแถว LINEMAN");
    else {
      if (row.status !== "COMPLETE") p.push(`แถว status ${row.status}`);
      if (row.updatedByUserId !== uid("OWNER")) p.push("updatedByUserId ≠ OWNER");
      if (row.kind !== "PLATFORM") p.push(`kind ${row.kind}`);
    }
    chk("CR3", !fx && p.length === 0, "DRAFT → COMPLETE (รวมฟิลด์เดิม)", why(p, FX()));
  });
  await step("CR2", async () => {
    const p: string[] = [...NEED([credsMod, "integration-creds.ts"])];
    const r = keep(await readC("A", "STAFF", { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }));
    if (r?.ok !== true) p.push(`อ่าน → ${codeOf(r)}`);
    else {
      const fl: Any[] = Array.isArray(r.fields) ? r.fields : [];
      for (const f of lmSpec) {
        const x = fl.find((y) => y?.name === f.name);
        if (!x) {
          p.push(`fields ไม่มี ${f.name}`);
          continue;
        }
        for (const k of ["required", "secret", "filled"]) if (typeof x[k] !== "boolean") p.push(`${f.name}.${k} ไม่ใช่ boolean`);
        if (f.secret) {
          const v = lmVals[f.name]!;
          if (typeof x.masked !== "string" || !/^•{2,}.{0,4}$/.test(x.masked) || !x.masked.endsWith(v.slice(-4)) || x.masked.includes(v.slice(0, 8))) p.push(`${f.name}.masked ${short(x.masked, 20)} (คาด ••••${v.slice(-4)})`);
        }
      }
      if (r.ready !== false) p.push(`ready ${short(r.ready, 10)} (คาด false)`);
      if (r.keyConfigured !== true) p.push(`keyConfigured ${short(r.keyConfigured, 10)} (คาด true)`);
      if (typeof r.webhookUrl !== "string" || !r.webhookUrl.endsWith(`/api/pos/platform/LINEMAN/${CH.LM}`)) p.push(`webhookUrl ${short(r.webhookUrl, 80)}`);
    }
    const hit = leaks(RESULTS_SEEN, SECRET_VALUES());
    if (hit) p.push(`ผลคืนของ CR/SK มีค่าลับ (${hit.slice(0, 10)}…)`);
    const aud = (await P.auditLog.findMany({ where: { tenantId: T, action: "pos.integration.credentials" } }).catch(() => [])) as Any[];
    if (aud.length < 2) p.push(`audit pos.integration.credentials ${aud.length} (คาด ≥ 2)`);
    for (const a of aud) {
      const f = a.after?.fields;
      if (!Array.isArray(f) || f.some((n: unknown) => typeof n !== "string" || !lmSpec.some((s) => s.name === n))) p.push(`audit after.fields ${short(f, 60)} (คาดรายชื่อฟิลด์)`);
      if (leaks([a.before, a.after], SECRET_VALUES())) p.push("audit มีค่าลับ");
    }
    chk("CR2", !fx && p.length === 0, "อ่าน masked ครบ · audit ชื่อเท่านั้น", why(p, FX()));
  });
  // GRAB บางฟิลด์ (ไม่มี webhookSecret) · SHOPEE ครบแล้วเก็บช่องทาง (WH4)
  const grSpec = fieldSpec("GRAB");
  const grPart = grSpec.find((f) => f.name !== WEBHOOK_SECRET_FIELD) ?? grSpec[0]!;
  if (!fx && credsMod) {
    keep(await save("A", "OWNER", credIn("GRAB", CH.GR ?? "none", { [grPart.name]: valuesFor("GRAB")[grPart.name]! })));
    keep(await save("A", "OWNER", credIn("SHOPEE", CH.SH ?? "none", valuesFor("SHOPEE"))));
    const ar = await call(chMod, "archiveChannel", ctxU("A"), A("OWNER"), { id: CH.SH });
    if (ar?.ok !== true) console.log(`  ⚠️  archiveChannel SHOPEE: ${codeOf(ar)}`);
  }
  await step("CR4", async () => {
    const p: string[] = [...NEED([credsMod, "integration-creds.ts"])];
    const g0 = guardHits.length;
    const before = js((await credRows(T)).map((r) => [r.id, String(r.updatedAt)]));
    const t1 = keep(await call(credsMod, "testIntegrationConnection", ctxU("A"), A("OWNER"), { kind: "PLATFORM", provider: "GRAB", channelId: CH.GR }, { key: RUN_KEY }));
    if (!refused(t1, "NOT_CONFIGURED")) p.push(`ทดสอบ DRAFT → ${codeOf(t1)} (คาด NOT_CONFIGURED)`);
    const t2 = keep(await call(credsMod, "testIntegrationConnection", ctxU("A"), A("OWNER"), { kind: "PLATFORM", provider: "LINEMAN", channelId: CH.LM }, { key: RUN_KEY }));
    if (!refused(t2, "NOT_CONFIGURED", "ADAPTER_PENDING")) p.push(`ทดสอบ COMPLETE → ${codeOf(t2)} (คาด NOT_CONFIGURED/ADAPTER_PENDING)`);
    if (guardHits.length !== g0) p.push(`ยิงเครือข่าย ${guardHits.length - g0} ครั้ง`);
    if (js((await credRows(T)).map((r) => [r.id, String(r.updatedAt)])) !== before) p.push("ทดสอบทำให้แถวเปลี่ยน");
    chk("CR4", !fx && p.length === 0, "ทดสอบ = ปิดสุภาพ ไม่ยิงเครือข่าย ไม่เขียน", why(p, FX()));
  });
  await step("SK4", async () => {
    const p: string[] = [...NT("PosIntegrationCredential")];
    const raw = TABLES.PosIntegrationCredential ? ((await P.$queryRawUnsafe(`SELECT row_to_json(x)::text AS j FROM "PosIntegrationCredential" x WHERE x."tenantId" = $1`, T).catch(() => [])) as Any[]) : [];
    if (!raw.length) p.push("ไม่มีแถวดิบให้ตรวจ (ตัวควบคุมบวก)");
    const secrets = SECRET_VALUES();
    for (const r of raw) if (leaks(r.j, secrets)) p.push("แถวดิบมีค่าลับ");
    const lm = (await credRows(T)).find((r) => r.provider === "LINEMAN" && r.channelId === CH.LM);
    if (lm) {
      try {
        const opened = oracleOpen(String(lm.secretBox ?? ""), RUN_KEY) as Any;
        const want = lmSpec.filter((f) => f.secret).map((f) => f.name);
        const miss = want.filter((n) => opened?.[n] !== lmVals[n]);
        if (miss.length) p.push(`secretBox เปิดได้แต่ขาด ${miss.join(",")}`);
      } catch (e) {
        p.push(`secretBox เปิดด้วยกุญแจของรอบไม่ได้ (${(e as Error).message.slice(0, 40)})`);
      }
    }
    const aud = (await P.auditLog.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[];
    const ops = (await P.opsEvent.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[];
    if (leaks(aud.map((a) => [a.before, a.after]), secrets)) p.push("AuditLog มีค่าลับ");
    if (leaks(ops.map((o) => [o.message, o.detail]), secrets)) p.push("OpsEvent มีค่าลับ");
    if (leaks(RESULTS_SEEN, secrets)) p.push("ผลคืนมีค่าลับ");
    chk("SK4", !fx && p.length === 0, "ไม่มีค่าลับในแถว/บันทึก/ผลคืน · กล่องเปิดได้ด้วยกุญแจรอบ", why(p, FX(`แถว ${raw.length} · `)));
  });

  // ════════ AD adapter ════════
  const PA: Any = registry?.PLATFORM_ADAPTERS ?? null;
  const normal: Record<string, Any> = {
    accept: { orderId: "ckqcorder000000000000000", externalRef: "LM-1", prepMinutes: 15 },
    reject: { orderId: "ckqcorder000000000000000", externalRef: "LM-1", reasonCode: "TOO_BUSY" },
    setReady: { orderId: "ckqcorder000000000000000", externalRef: "LM-1" },
    syncMenu: { channelId: "ckqcchannel0000000000000" },
    setAvailability: { channelId: "ckqcchannel0000000000000", productId: "ckqcproduct0000000000000", available: false },
    setStoreStatus: { channelId: "ckqcchannel0000000000000", open: false },
  };
  const sigFor = (raw: string, secret: string) => new Headers({ [SIG_HEADER]: hmacHex(raw, secret), "content-type": "application/json" });
  await step("AD1", async () => {
    const p: string[] = [...NEED([PA, "PLATFORM_ADAPTERS"])];
    if (PA) {
      const keys = Object.keys(PA).sort().join(",");
      if (keys !== [...PROVIDERS].sort().join(",")) p.push(`คีย์ ${keys} (คาด ${[...PROVIDERS].sort().join(",")})`);
      for (const prov of PROVIDERS) {
        const ad = PA[prov];
        if (!ad) continue;
        if (ad.platform !== prov) p.push(`${prov}.platform ${ad.platform}`);
        if (ad.ready !== false) p.push(`${prov}.ready ${short(ad.ready, 8)}`);
        if (ad.code !== "API") p.push(`${prov}.code ${ad.code}`);
        if (!Array.isArray(ad.requiredFields) || !ad.requiredFields.length) p.push(`${prov}.requiredFields ว่าง`);
        if ((prov === "LINEMAN" || prov === "GRAB") && !fieldSpec(prov).some((f) => f.name === WEBHOOK_SECRET_FIELD && f.secret)) p.push(`${prov} ไม่มีฟิลด์ลับ ${WEBHOOK_SECRET_FIELD}`);
        if (typeof registry?.platformAdapter === "function" && registry.platformAdapter(prov) !== ad) p.push(`platformAdapter(${prov}) ≠ ทะเบียน`);
        for (const mth of ADAPTER_METHODS) {
          const r = await call(ad, mth, normal[mth]);
          if (!refused(r, "NOT_CONFIGURED") || typeof r?.reason !== "string" || !r.reason.trim()) p.push(`${prov}.${mth} → ${codeOf(r)} reason ${short(r?.reason, 20)} (คาด NOT_CONFIGURED + reason)`);
        }
        const pi = await call(ad, "parseInbound", "{}", {});
        if (!refused(pi, "NOT_CONFIGURED")) p.push(`${prov}.parseInbound → ${codeOf(pi)}`);
        const tc = await call(ad, "testConnection", {});
        if (!refused(tc, "NOT_CONFIGURED", "ADAPTER_PENDING")) p.push(`${prov}.testConnection → ${codeOf(tc)}`);
        if (prov === "LINEMAN" || prov === "GRAB") {
          const raw = JSON.stringify({ qc: RAND, n: 1 });
          const good = await call(ad, "verifyInbound", raw, sigFor(raw, "qc-wh-secret-1"), { [WEBHOOK_SECRET_FIELD]: "qc-wh-secret-1" });
          const bad = await call(ad, "verifyInbound", raw, sigFor(raw, "qc-wh-secret-2"), { [WEBHOOK_SECRET_FIELD]: "qc-wh-secret-1" });
          if (good !== true) p.push(`${prov}.verifyInbound(ถูก) → ${short(good, 30)}`);
          if (bad !== false) p.push(`${prov}.verifyInbound(ผิด) → ${short(bad, 30)}`);
        }
      }
    }
    chk("AD1", p.length === 0, "5 adapter ปิดสุภาพทุกเมธอด · ตรวจลายเซ็นได้", why(p));
  });
  await step("AD2", async () => {
    const p: string[] = [...NEED([PA, "PLATFORM_ADAPTERS"])];
    const circ: Any = { a: 1 };
    circ.self = circ;
    const garbage: unknown[] = [undefined, null, {}, "x", 42, { orderId: 5 }, "z".repeat(1 << 20), circ];
    if (PA)
      for (const prov of PROVIDERS) {
        const ad = PA[prov];
        if (!ad) continue;
        for (const mth of [...ADAPTER_METHODS, "parseInbound", "testConnection"]) {
          for (const g of garbage) {
            let r: Any;
            try {
              r = await Promise.resolve().then(() => ad[mth]?.(g, g));
            } catch (e) {
              p.push(`${prov}.${mth}(${short(g, 8)}) throw ${short((e as Error).message, 30)}`);
              continue;
            }
            if (r?.ok === true) p.push(`${prov}.${mth}(${short(g, 8)}) ok:true`);
          }
        }
        for (const args of [[undefined, undefined, undefined], ["x", new Headers(), {}], ["x", new Headers({ [SIG_HEADER]: "zz" }), { [WEBHOOK_SECRET_FIELD]: "" }], [Buffer.from("x"), {}, null], ["x", null, { [WEBHOOK_SECRET_FIELD]: "s" }], [circ, circ, circ]] as unknown[][]) {
          let r: Any;
          try {
            r = await Promise.resolve().then(() => ad.verifyInbound?.(...args));
          } catch (e) {
            p.push(`${prov}.verifyInbound(ขยะ) throw ${short((e as Error).message, 30)}`);
            continue;
          }
          if (r !== false) p.push(`${prov}.verifyInbound(ขยะ) → ${short(r, 20)} (คาด false)`);
        }
      }
    chk("AD2", p.length === 0, "fuzz ไม่ throw · ไม่ ok · verifyInbound ขยะ = false", why(p));
  });
  const platOps = async (since: Date): Promise<Any[]> => ((await P.opsEvent.findMany({ where: { tenantId: { in: [T, T2].filter(Boolean) }, createdAt: { gte: since } } }).catch(() => [])) as Any[]).filter((o) => [o.source, o.message, o.detail].join(" ").includes(OPS_KEY));
  const kindRows = (rows: Any[], ch: string, kind: string) => rows.filter((o) => {
    const t = [o.source, o.message, o.detail].join(" ");
    return t.includes(ch) && new RegExp(`\\b${kind}\\b`).test(t);
  });
  await step("AD4", async () => {
    const p: string[] = [...NEED([oaMod?.ORDER_ADAPTERS, "ORDER_ADAPTERS"])];
    const OA: Any = oaMod?.ORDER_ADAPTERS ?? {};
    const keys = Object.keys(OA).sort().join(",");
    if (keys !== "API,CHAT,MANUAL,QR,WEB") p.push(`ORDER_ADAPTERS คีย์ ${keys} (คาด API,CHAT,MANUAL,QR,WEB)`);
    const t0 = new Date();
    for (const k of ["MANUAL", "WEB", "CHAT", "QR"]) {
      const ad = OA[k];
      if (!ad) continue;
      if (ad.code !== k) p.push(`${k}.code ${ad.code}`);
      for (const mth of ADAPTER_METHODS) {
        const r = await call(ad, mth, normal[mth]);
        if (r !== undefined) p.push(`${k}.${mth} → ${short(r, 30)} (คาด undefined)`);
      }
    }
    if ((await platOps(t0)).length) p.push("adapter เดิมเขียน ops");
    const api = OA.API;
    if (!api) p.push("ไม่มี API");
    else {
      if (api.code !== "API") p.push(`API.code ${api.code}`);
      for (const mth of ADAPTER_METHODS) if (typeof api[mth] !== "function") p.push(`API ไม่มี ${mth}`);
    }
    chk("AD4", p.length === 0, "ทะเบียนเดิมคงเดิม + API", why(p));
  });

  // ════════ WH route ขาเข้า ════════
  const wh = async (provider: string, channelId: string, body: string, headers: Record<string, string> = {}, method = "POST"): Promise<{ status: number; text: string; json: Any; missing?: boolean }> => {
    const fn = platRoute?.[method];
    if (typeof fn !== "function") return { status: method === "GET" && typeof platRoute?.POST === "function" ? 405 : -1, text: "", json: null, missing: true };
    const url = `${BASE_URL}/api/pos/platform/${encodeURIComponent(provider)}/${encodeURIComponent(channelId)}`;
    const req = new Request(url, { method, ...(method === "GET" ? {} : { body }), headers: { "content-type": "application/json", ...headers } });
    try {
      const res: Response = await fn(req, { params: Promise.resolve({ provider, channelId }) });
      const text = await res.text();
      let json: Any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* ไม่ใช่ JSON */
      }
      return { status: res.status, text, json };
    } catch (e) {
      return { status: -2, text: `throw ${(e as Error).message.slice(0, 80)}`, json: null };
    }
  };
  const lmSecret = lmVals[WEBHOOK_SECRET_FIELD] ?? "";
  const MARKER = `QCBODY${RAND}MARK`;
  const bodyOf = (n = 1) => JSON.stringify({ orderId: `LM-${RAND}-${n}`, note: MARKER, items: [{ name: "ข้าวผัด", qty: 1 }] });
  const sigH = (raw: string, secret: string) => ({ [SIG_HEADER]: hmacHex(raw, secret) });
  const whCounts = async (): Promise<string> => {
    const ids = [T, T2].filter(Boolean);
    const n = async (m: string) => Number(await P[m]?.count?.({ where: { tenantId: { in: ids } } }).catch(() => -1));
    return js({ o: await n("posOrder"), ol: await n("posOrderLine"), oe: await n("posOrderEvent"), ob: await n("outboxEvent"), s: await n("posSale"), c: js((await credRows(T)).map((r) => [r.id, String(r.updatedAt)])) });
  };
  if (!fx) await settle();
  const WH_BEFORE = await whCounts();
  const WH_T0 = new Date();
  await step("WH1", async () => {
    const p: string[] = [...NEED([platRoute, "route platform"])];
    for (const [lbl, prov, ch] of [["GRAB ยังไม่มี webhookSecret", "GRAB", CH.GR], ["GRAB ร้าน T2 ไม่มี creds", "GRAB", CH.GX]] as const) {
      const raw = bodyOf(1);
      const r = await wh(prov, ch ?? "none", raw, sigH(raw, lmSecret || "x"));
      if (r.status !== 503 || r.json?.code !== "NOT_CONFIGURED") p.push(`${lbl} → ${r.status} ${short(r.json ?? r.text, 50)} (คาด 503 NOT_CONFIGURED)`);
      if (r.text.includes(MARKER)) p.push(`${lbl} สะท้อนเนื้อคำขอ`);
    }
    chk("WH1", !fx && p.length === 0, "ไม่มีความลับ = 503 NOT_CONFIGURED", why(p, FX()));
  });
  await step("WH2", async () => {
    const p: string[] = [...NEED([platRoute, "route platform"])];
    if (!lmSecret) p.push("(fixture) ไม่มี webhookSecret ของ LINEMAN");
    const t0 = new Date();
    const raw = bodyOf(2);
    const r1 = await wh("LINEMAN", CH.LM ?? "none", raw, sigH(raw, `${lmSecret}-ผิด`));
    const r2 = await wh("LINEMAN", CH.LM ?? "none", raw, {});
    for (const [lbl, r] of [["ลายเซ็นผิด", r1], ["ไม่มีหัว", r2]] as const) {
      if (r.status !== 401) p.push(`${lbl} → ${r.status} ${short(r.json ?? r.text, 40)} (คาด 401)`);
      if (r.text.includes(MARKER)) p.push(`${lbl} สะท้อนเนื้อคำขอ`);
    }
    await sleep(200);
    const ops = (await P.opsEvent.findMany({ where: { createdAt: { gte: t0 } } }).catch(() => [])) as Any[];
    if (ops.some((o) => [o.message, o.detail].join(" ").includes(MARKER))) p.push("OpsEvent มีเนื้อคำขอ");
    const warn = ops.filter((o) => o.level === "WARN" && /platform/i.test([o.source, o.message, o.detail].join(" ")));
    if (!warn.length) p.push("ไม่มี OpsEvent WARN (platform) ตอนลายเซ็นผิด");
    chk("WH2", !fx && p.length === 0, "ลายเซ็นผิด 401 · log ขนาด/ลายนิ้วมือ ไม่มีเนื้อ", why(p, FX()));
  });
  await step("WH3", async () => {
    const p: string[] = [...NEED([platRoute, "route platform"])];
    const raw = bodyOf(3);
    const r = await wh("LINEMAN", CH.LM ?? "none", raw, sigH(raw, lmSecret));
    if (r.status !== 503 || r.json?.code !== "ADAPTER_PENDING") p.push(`ลายเซ็นถูก → ${r.status} ${short(r.json ?? r.text, 50)} (คาด 503 ADAPTER_PENDING)`);
    if (r.text.includes(MARKER)) p.push("สะท้อนเนื้อคำขอ");
    chk("WH3", !fx && p.length === 0, "ลายเซ็นถูก = 503 ADAPTER_PENDING (ยังไม่เขียน)", why(p, FX()));
  });
  await step("WH4", async () => {
    const p: string[] = [...NEED([platRoute, "route platform"])];
    const raw = bodyOf(4);
    const sg = sigH(raw, lmSecret);
    for (const [lbl, prov, ch] of [
      ["provider ไม่ตรง", "GRAB", CH.LM],
      ["ช่องทางเก็บแล้ว", "SHOPEE", CH.SH],
      ["adapter MANUAL", "TIKTOK", CH.TT],
      ["id ไม่มีจริง", "LINEMAN", "ckqcnotachannel000000000"],
      ["id รูปผิด", "LINEMAN", "../../etc"],
      ["provider มั่ว", "FOO", CH.LM],
    ] as const) {
      const r = await wh(prov, ch ?? "none", raw, sg);
      if (r.status !== 404 || r.json?.error !== "not_found") p.push(`${lbl} → ${r.status} ${short(r.json ?? r.text, 40)} (คาด 404 not_found)`);
    }
    const x = await wh("GRAB", CH.GX ?? "none", raw, sg);
    if (!(x.status === 404 || (x.status === 503 && x.json?.code === "NOT_CONFIGURED"))) p.push(`ข้ามร้าน → ${x.status} ${short(x.json ?? x.text, 40)} (คาด 404 หรือ 503 NOT_CONFIGURED)`);
    chk("WH4", !fx && p.length === 0, "ไม่พบ = 404 · ความลับร้านหนึ่งใช้กับอีกร้านไม่ได้", why(p, FX()));
  });
  await step("WH5", async () => {
    const p: string[] = [...NEED([platRoute, "route platform"])];
    const big = JSON.stringify({ pad: "x".repeat(300 * 1024), note: MARKER });
    const r = await wh("LINEMAN", CH.LM ?? "none", big, sigH(big, lmSecret));
    if (r.status !== 413) p.push(`300 KB → ${r.status} (คาด 413)`);
    const g = await wh("LINEMAN", CH.LM ?? "none", "", {}, "GET");
    if (g.status !== 405) p.push(`GET → ${g.status} (คาด 405)`);
    chk("WH5", !fx && p.length === 0, "เกิน 256 KB = 413 · GET = 405", why(p, FX()));
  });
  await step("WH6", async () => {
    const p: string[] = [...NEED([platRoute, "route platform"])];
    const after = await whCounts();
    if (after !== WH_BEFORE) p.push(`จำนวนแถวเปลี่ยน ${short(WH_BEFORE, 90)} → ${short(after, 90)}`);
    chk("WH6", !fx && p.length === 0, "route ไม่เขียนอะไร", why(p, FX(`ตั้งแต่ ${WH_T0.toISOString().slice(11, 19)} · `)));
  });

  // ════════ AD3 วงจรออเดอร์บนช่องทาง API ════════
  await step("AD3", async () => {
    const p: string[] = [];
    const t0 = new Date();
    const keyOrder = async (n: number): Promise<string> => {
      const r = await call(ord, "ingestOrder", ctxU("A", DEV1), A("OWNER"), { channelId: CH.LM, externalRef: `LM-${RAND}-ad${n}`, idempotencyKey: newKey("o"), lines: [{ productId: PRD, qty: 1 }], customer: { name: `ลูกค้า ${RAND}` }, fulfilment: "PICKUP", startStatus: "NEW" });
      if (r?.ok !== true) p.push(`(fixture) ingestOrder ${n} → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      return r?.ok === true ? String(r.orderId) : "";
    };
    const o1 = fx ? "" : await keyOrder(1);
    const o2 = fx ? "" : await keyOrder(2);
    const o3 = fx ? "" : await keyOrder(3);
    const act = async (lbl: string, f: () => Promise<Any>) => {
      const r = await f();
      if (r?.ok === false || r?.threw) p.push(`${lbl} → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    };
    if (o1 && o2 && o3) {
      await act("รับ o1", () => call(ord, "acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: o1 }));
      await act("รับ o2", () => call(ord, "acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: o2 }));
      await act("ปฏิเสธ o3", () => call(ord, "rejectOrder", ctxU("A", DEV1), A("OWNER"), { id: o3, reasonCode: "TOO_BUSY" }));
      await act("เตรียม o1", () => call(ord, "markPreparing", ctxU("A", DEV1), A("OWNER"), { id: o1 }));
      await act("พร้อม o1", () => call(ord, "markReady", ctxU("A", DEV1), A("OWNER"), { id: o1 }));
    }
    for (let i = 0; i < 2; i++) {
      try {
        await kdsMod?.onAvailabilityEvent?.(T, { productId: PRD, unitId: U.A, available: false });
      } catch (e) {
        p.push(`86 throw ${short((e as Error).message, 40)}`);
      }
    }
    await act("พัก", () => call(ord, "setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: CH.LM, pausedUntil: new Date(Date.now() + HOUR) }));
    await act("เปิด", () => call(ord, "setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: CH.LM, pausedUntil: null }));
    for (let i = 0; i < 2; i++) {
      try {
        await oaMod?.ORDER_ADAPTERS?.API?.syncMenu?.({ channelId: CH.LM });
      } catch (e) {
        p.push(`syncMenu throw ${short((e as Error).message, 40)}`);
      }
    }
    await sleep(300);
    const rows = await platOps(t0);
    for (const k of ADAPTER_METHODS) {
      const n = kindRows(rows, CH.LM ?? "-", k).length;
      if (n !== 1) p.push(`LINEMAN ${k} ops ${n} (คาด 1)`);
    }
    if (rows.some((o) => o.level !== "INFO")) p.push(`ops ไม่ใช่ INFO: ${[...new Set(rows.map((o) => o.level))].join(",")}`);
    if (kindRows(rows, CH.GR ?? "-", "setAvailability").length !== 1) p.push(`GRAB setAvailability ops ${kindRows(rows, CH.GR ?? "-", "setAvailability").length} (คาด 1)`);
    if (rows.some((o) => [o.message, o.detail].join(" ").includes(CH.SH ?? "-"))) p.push("ช่องทางที่เก็บแล้วได้ ops");
    chk("AD3", !fx && p.length === 0, "ทุกคำสั่งไม่ throw · ops 1 แถวต่อ (ช่องทาง, kind)/ชม.", why(p, FX(`ops ${rows.length} · `)));
  });

  // ════════ SL สลิป ════════
  const puts: { path: string; len: number; type: string; sha: string }[] = [];
  const put = async (path: string, data: Uint8Array, contentType: string) => {
    puts.push({ path, len: data.length, type: contentType, sha: sha256(Buffer.from(data)) });
  };
  const dels: string[] = [];
  const delDeps = { del: async (path: string) => (dels.push(path), 200), purge: async () => {} };
  const img = (kind: "jpeg" | "png" | "webp" | "pdf" | "gif", size = 2048): Buffer => {
    const head: Record<string, Buffer> = {
      jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
      png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      webp: Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]),
      pdf: Buffer.from("%PDF-1.4\n"),
      gif: Buffer.from("GIF89a"),
    };
    return Buffer.concat([head[kind]!, randomBytes(Math.max(0, size - head[kind]!.length))]);
  };
  const CT: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", gif: "image/gif" };
  const file = (kind: "jpeg" | "png" | "webp" | "pdf" | "gif", size?: number) => ({ contentType: CT[kind]!, bytes: img(kind, size) });
  const attach = (u: string, actor: string, input: Any, deps: Any = { put }) => call(slipMod, "attachSlip", ctxU(u), A(actor), { idempotencyKey: newKey("slip"), ...input }, deps);
  const slipRow = async (id: string): Promise<Any> => (id && MODEL("posPaymentSlip") ? MODEL("posPaymentSlip").findUnique({ where: { id } }).catch(() => null) : null);
  const slipsOf = async (where: Any): Promise<Any[]> => (MODEL("posPaymentSlip") ? ((await MODEL("posPaymentSlip").findMany({ where: { tenantId: T, ...where } }).catch(() => [])) as Any[]) : []);
  const slipIdOf = (r: Any): string => String(r?.slip?.id ?? r?.slipId ?? r?.id ?? "");
  const fileCount = async () => Number(await P.fileAsset.count({ where: { tenantId: T } }).catch(() => -1));
  const SL_NEED = () => [...NEED([slipMod, "payment-slip.ts"]), ...NT("PosPaymentSlip")];
  /** ลายนิ้วมือเงิน (SL7) */
  const fpMoney = async (): Promise<string> => {
    const ids = Object.values(B).map((b) => b.id).filter(Boolean);
    const q = async (sql: string, ...a: unknown[]) => js(((await P.$queryRawUnsafe(sql, ...a).catch((e: Error) => [{ e: e.message.slice(0, 40) }])) as Any[]).map((r) => r.j ?? r));
    return [
      await q(`SELECT row_to_json(x)::text AS j FROM "PosSale" x WHERE x.id = ANY($1::text[]) ORDER BY x.id`, ids),
      await q(`SELECT row_to_json(x)::text AS j FROM "PosPayment" x WHERE x."saleId" = ANY($1::text[]) ORDER BY x.id`, ids),
      await q(`SELECT row_to_json(x)::text AS j FROM "PosPaymentIntent" x WHERE x.id = ANY($1::text[]) ORDER BY x.id`, [PI, PI2].filter(Boolean)),
      await q(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id, ',' ORDER BY x.id)), '-') AS h FROM "AccountJournalEntry" x WHERE x."tenantId" = $1`, T),
    ].join("|");
  };
  if (!fx) await settle();
  const FP_SL0 = await fpMoney();
  const SID: Record<string, string> = {};
  await step("SL1", async () => {
    const p: string[] = [...SL_NEED()];
    const st = B.ST!;
    if (!st.paymentId) p.push("(fixture) บิล ST ไม่มีแถว TRANSFER");
    const f0 = await fileCount();
    const p0 = puts.length;
    const fj = file("jpeg");
    const r = await attach("A", "STAFF", { saleId: st.id, paymentId: st.paymentId, file: fj });
    SID.s1 = slipIdOf(r);
    if (r?.ok !== true || !SID.s1) p.push(`แนบ jpeg → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const row = await slipRow(SID.s1);
    if (!row) p.push("ไม่มีแถวสลิป");
    else {
      for (const [k, v] of [["status", "UPLOADED"], ["saleId", st.id], ["paymentId", st.paymentId], ["unitId", U.A], ["createdByUserId", uid("STAFF")], ["tenantId", T]] as const) if (row[k] !== v) p.push(`${k} ${short(row[k], 30)} (คาด ${short(v, 30)})`);
      if (row.verifiedVia !== null && row.verifiedVia !== undefined) p.push(`verifiedVia ${row.verifiedVia}`);
      if (!row.fileId) p.push("ไม่มี fileId");
      const dd = new Date(row.purgeAfter).getTime() - new Date(row.createdAt).getTime();
      if (!(Math.abs(dd - SLIP_RETENTION_DEFAULT_D * DAY) <= 2 * MIN)) p.push(`purgeAfter − createdAt = ${(dd / DAY).toFixed(2)} วัน (คาด ${SLIP_RETENTION_DEFAULT_D})`);
      const fa = row.fileId ? ((await P.fileAsset.findUnique({ where: { id: row.fileId } }).catch(() => null)) as Any) : null;
      if (!fa) p.push("ไม่มี FileAsset");
      else {
        if (!String(fa.path).startsWith(`t/${T}/private/`)) p.push(`path ${short(fa.path, 40)} (คาด t/<tenant>/private/)`);
        if (!String(fa.cdnUrl).startsWith("private://")) p.push("cdnUrl ไม่ใช่ private://");
        const pu = puts.slice(p0);
        if (pu.length !== 1 || pu[0]!.path !== fa.path || pu[0]!.sha !== sha256(fj.bytes)) p.push(`put ${pu.length} ครั้ง ${short(pu.map((x) => x.path.slice(-12)), 40)}`);
      }
    }
    if ((await fileCount()) !== f0 + 1) p.push(`FileAsset +${(await fileCount()) - f0} (คาด +1)`);
    if (/private\/|private:\/\/|b-cdn|bunny/i.test(js(r))) p.push("ผลคืนมี path/URL ถาวร");
    const ri = await attach("A", "STAFF", { intentId: PI, file: file("png") });
    SID.si = slipIdOf(ri);
    if (ri?.ok !== true) p.push(`แนบใบขอรับเงิน → ${codeOf(ri)} ${short(ri?.message ?? "", 50)}`);
    else {
      const rr = await slipRow(SID.si);
      if (rr?.intentId !== PI || rr?.saleId) p.push(`แถวสลิปใบขอรับเงิน intentId ${short(rr?.intentId, 20)} saleId ${short(rr?.saleId, 20)}`);
    }
    const bd = await call(billsMod, "billDetail", { tenantId: T, systemId: S.POS }, A("OWNER"), { unitId: U.A, saleId: st.id });
    const sl: Any[] = Array.isArray(bd?.bill?.slips) ? bd.bill.slips : [];
    const mine = sl.find((x) => x?.id === SID.s1);
    if (!mine) p.push(`billDetail.bill.slips ${short(bd?.bill?.slips ?? codeOf(bd), 60)} (ไม่มีสลิปนี้)`);
    else {
      if (mine.status !== "UPLOADED") p.push(`slips[].status ${mine.status}`);
      if (!(mine.thumbUrl === null || (typeof mine.thumbUrl === "string" && mine.thumbUrl.startsWith("/api/files/") && /[?&]sig=[0-9a-f]{64}/.test(mine.thumbUrl)))) p.push(`thumbUrl ${short(mine.thumbUrl, 40)}`);
    }
    chk("SL1", !fx && p.length === 0, "แนบสลิป = ไฟล์ส่วนตัว + แถว UPLOADED · บิลแสดงสลิป", why(p, FX()));
  });
  await step("SL2", async () => {
    const p: string[] = [...SL_NEED()];
    const st = B.ST!;
    for (const [k, kind] of [["s2", "png"], ["s3", "webp"]] as const) {
      const r = await attach("A", "STAFF", { saleId: st.id, paymentId: st.paymentId, file: file(kind) });
      SID[k] = slipIdOf(r);
      if (r?.ok !== true) p.push(`(fixture) สลิป ${k} → ${codeOf(r)}`);
    }
    const n0 = (await slipsOf({})).length;
    const p0 = puts.length;
    const cashPay = B.SC!.paymentId;
    const st2 = B.ST2!;
    for (const [lbl, u, input] of [
      ["pdf", "A", { saleId: st2.id, paymentId: st2.paymentId, file: file("pdf") }],
      ["gif", "A", { saleId: st2.id, paymentId: st2.paymentId, file: file("gif") }],
      ["6 MB", "A", { saleId: st2.id, paymentId: st2.paymentId, file: file("jpeg", 6 * 1024 * 1024) }],
      ["ใบที่ 4", "A", { saleId: st.id, paymentId: st.paymentId, file: file("jpeg") }],
      ["แถว CASH", "A", { saleId: B.SC!.id, paymentId: cashPay, file: file("jpeg") }],
      ["ใบขอรับเงินยกเลิก", "A", { intentId: PI2, file: file("jpeg") }],
      ["ทั้ง paymentId + intentId", "A", { saleId: st2.id, paymentId: st2.paymentId, intentId: PI, file: file("jpeg") }],
      ["คีย์แปลก", "A", { saleId: st2.id, paymentId: st2.paymentId, file: file("jpeg"), bogus: 1 }],
    ] as const) {
      const r = await attach(u, "STAFF", input);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)} (คาด VALIDATION)`);
    }
    if ((await slipsOf({})).length !== n0) p.push(`แถวสลิป +${(await slipsOf({})).length - n0}`);
    if (puts.length !== p0) p.push(`put ${puts.length - p0} ครั้ง (คาด 0)`);
    chk("SL2", !fx && p.length === 0, "ชนิด/ขนาด/จำนวน/เป้าหมายผิด = VALIDATION ไม่อัป", why(p, FX()));
  });
  await step("SL3", async () => {
    const p: string[] = [...SL_NEED()];
    const st = B.ST!;
    const st2 = B.ST2!;
    const n0 = (await slipsOf({})).length;
    for (const [lbl, u, actor, input] of [
      ["ผู้ใช้สาขา B", "B", "CASHB", { saleId: st.id, paymentId: st.paymentId, file: file("jpeg") }],
      ["ร้าน T2", "X", "OWNER2", { saleId: st.id, paymentId: st.paymentId, file: file("jpeg") }],
      ["id มั่ว", "A", "STAFF", { saleId: "ckqcnotasale000000000000", paymentId: st.paymentId, file: file("jpeg") }],
    ] as const) {
      const r = await attach(u, actor, input);
      if (!refused(r, "SALE_NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)} (คาด SALE_NOT_FOUND)`);
    }
    for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) envSet(k, undefined);
    let off: Any;
    try {
      off = await attach("A", "STAFF", { saleId: st2.id, paymentId: st2.paymentId, file: file("jpeg") }, {});
    } finally {
      for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) envSet(k, ENV_SAVED[k]);
    }
    if (!refused(off, "STORAGE_NOT_CONFIGURED")) p.push(`storage ปิด → ${codeOf(off)} (คาด STORAGE_NOT_CONFIGURED)`);
    const late = new Date(new Date(st2.paidAt ?? Date.now()).getTime() + 25 * HOUR);
    const c1 = await attach("A", "CASHIER", { saleId: st2.id, paymentId: st2.paymentId, file: file("jpeg") }, { put, now: late });
    if (!refused(c1, "PERMISSION_DENIED")) p.push(`CASHIER หลัง 24 ชม. → ${codeOf(c1)} (คาด PERMISSION_DENIED)`);
    const m1 = await attach("A", "MGR", { saleId: st2.id, paymentId: st2.paymentId, file: file("jpeg") }, { put, now: late });
    SID.sm = slipIdOf(m1);
    if (m1?.ok !== true) p.push(`MANAGER หลัง 24 ชม. → ${codeOf(m1)} (คาด ok)`);
    const np = await attach("A", "NOPERM", { saleId: st2.id, paymentId: st2.paymentId, file: file("jpeg") });
    if (!refused(np, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(np)} (คาด PERMISSION_DENIED)`);
    const n1 = (await slipsOf({})).length;
    if (n1 !== n0 + (m1?.ok === true ? 1 : 0)) p.push(`แถวสลิป +${n1 - n0} (คาด +1 ของ MANAGER)`);
    chk("SL3", !fx && p.length === 0, "ขอบเขตสาขา/ร้าน · storage ปิดสุภาพ · หน้าต่าง 24 ชม.", why(p, FX()));
  });
  await step("SL4", async () => {
    const p: string[] = [...SL_NEED()];
    const st3 = B.ST3!;
    const k4 = newKey("rep");
    const f0 = await fileCount();
    const p0 = puts.length;
    const fj = file("jpeg");
    const a = await attach("A", "STAFF", { saleId: st3.id, paymentId: st3.paymentId, file: fj, idempotencyKey: k4 });
    const b = await attach("A", "STAFF", { saleId: st3.id, paymentId: st3.paymentId, file: fj, idempotencyKey: k4 });
    SID.sk4 = slipIdOf(a);
    if (a?.ok !== true || b?.ok !== true || slipIdOf(b) !== SID.sk4) p.push(`เล่นซ้ำ → ${codeOf(a)}/${codeOf(b)} id ${slipIdOf(a).slice(-6)}/${slipIdOf(b).slice(-6)}`);
    if ((await fileCount()) !== f0 + 1) p.push(`FileAsset +${(await fileCount()) - f0} (คาด +1)`);
    if (puts.length !== p0 + 1) p.push(`put ${puts.length - p0} ครั้ง (คาด 1)`);
    const n0 = (await slipsOf({ paymentId: st3.paymentId })).length;
    const k5 = newKey("par");
    const [c, d] = await Promise.all([1, 2].map(() => attach("A", "STAFF", { saleId: st3.id, paymentId: st3.paymentId, file: file("png"), idempotencyKey: k5 })));
    if (c?.ok !== true || d?.ok !== true || slipIdOf(c) !== slipIdOf(d)) p.push(`พร้อมกัน → ${codeOf(c)}/${codeOf(d)} id ${slipIdOf(c).slice(-6)}/${slipIdOf(d).slice(-6)}`);
    if ((await slipsOf({ paymentId: st3.paymentId })).length !== n0 + 1) p.push(`พร้อมกันได้แถว +${(await slipsOf({ paymentId: st3.paymentId })).length - n0} (คาด +1)`);
    chk("SL4", !fx && p.length === 0, "คีย์เดิม = สลิปเดิม (ไม่อัปซ้ำ)", why(p, FX()));
  });
  await step("SL5", async () => {
    const p: string[] = [...SL_NEED()];
    const conf = (actor: string, slipId: string) => call(slipMod, "confirmSlip", ctxU("A"), A(actor), { slipId });
    const rej = (actor: string, slipId: string, reason: string) => call(slipMod, "rejectSlip", ctxU("A"), A(actor), { slipId, reason });
    const auditN = async (action: string, id: string) => ((await P.auditLog.findMany({ where: { tenantId: T, action } }).catch(() => [])) as Any[]).filter((a) => a.targetId === id || js([a.before, a.after]).includes(id)).length;
    const s1 = SID.s1 ?? "";
    const r0 = await conf("STAFF", s1);
    if (!refused(r0, "PERMISSION_DENIED", "SLIP_SELF_CONFIRM")) p.push(`ผู้อัปยืนยันเอง → ${codeOf(r0)} (คาด PERMISSION_DENIED/SLIP_SELF_CONFIRM)`);
    const r1 = await conf("CASHIER", s1);
    if (!refused(r1, "PERMISSION_DENIED")) p.push(`CASHIER ยืนยัน → ${codeOf(r1)} (คาด PERMISSION_DENIED)`);
    if ((await slipRow(s1))?.status !== "UPLOADED") p.push("ถูกปฏิเสธแล้วสถานะเปลี่ยน");
    const r2 = await conf("MGR", s1);
    if (r2?.ok !== true) p.push(`MANAGER ยืนยัน → ${codeOf(r2)} ${short(r2?.message ?? "", 40)}`);
    const row = await slipRow(s1);
    if (row?.status !== "CONFIRMED" || row?.verifiedVia !== "MANUAL" || row?.confirmedByUserId !== uid("MGR") || !row?.confirmedAt) p.push(`แถวหลังยืนยัน ${short({ s: row?.status, v: row?.verifiedVia, by: row?.confirmedByUserId === uid("MGR"), at: !!row?.confirmedAt }, 80)}`);
    await conf("MGR", s1);
    if ((await auditN("pos.slip.confirmed", s1)) !== 1) p.push(`audit pos.slip.confirmed ${await auditN("pos.slip.confirmed", s1)} (คาด 1 แม้ยืนยันซ้ำ)`);
    const s2 = SID.s2 ?? "";
    const r3 = await rej("MGR", s2, "ยอดไม่ตรงกับบิล");
    const row2 = await slipRow(s2);
    if (r3?.ok !== true || row2?.status !== "REJECTED" || !String(row2?.rejectReason ?? "").includes("ยอดไม่ตรง")) p.push(`ปฏิเสธ → ${codeOf(r3)} ${short({ s: row2?.status, r: row2?.rejectReason }, 60)}`);
    if ((await auditN("pos.slip.rejected", s2)) !== 1) p.push(`audit pos.slip.rejected ${await auditN("pos.slip.rejected", s2)} (คาด 1)`);
    const so = await attach("A", "OWNER", { saleId: B.ST4!.id, paymentId: B.ST4!.paymentId, file: file("jpeg") });
    SID.so = slipIdOf(so);
    const r4 = await conf("OWNER", SID.so);
    if (r4?.ok !== true) p.push(`OWNER ยืนยันของตัวเอง → ${codeOf(r4)} (คาด ok · OWNER ยกเว้น)`);
    const r5 = await conf("MGR", SID.si ?? "");
    if (r5?.ok !== true) p.push(`ยืนยันสลิปใบขอรับเงิน → ${codeOf(r5)}`);
    const pi = (await P.posPaymentIntent.findUnique({ where: { id: PI || "none" } }).catch(() => null)) as Any;
    if (pi?.status !== "PENDING" || pi?.confirmedVia) p.push(`ใบขอรับเงินหลังยืนยันสลิป ${short({ s: pi?.status, v: pi?.confirmedVia }, 40)} (คาด PENDING · ไม่มีผลเงิน)`);
    chk("SL5", !fx && p.length === 0, "4-eyes · audit · ไม่มีผลเงิน", why(p, FX()));
  });
  await step("SL6", async () => {
    const p: string[] = [...SL_NEED()];
    const TR = `QCTR${RAND}${randomBytes(3).toString("hex")}`;
    const a = await attach("A", "STAFF", { saleId: B.ST2!.id, paymentId: B.ST2!.paymentId, file: file("jpeg"), transRef: TR });
    SID.st1 = slipIdOf(a);
    if (a?.ok !== true || (await slipRow(SID.st1))?.transRef !== TR) p.push(`แนบพร้อม transRef → ${codeOf(a)}`);
    const n0 = (await slipsOf({ paymentId: B.ST3!.paymentId })).length;
    const d = await attach("A", "STAFF", { saleId: B.ST3!.id, paymentId: B.ST3!.paymentId, file: file("jpeg"), transRef: TR });
    if (!refused(d, "SLIP_DUPLICATE")) p.push(`transRef ซ้ำ → ${codeOf(d)} (คาด SLIP_DUPLICATE)`);
    if ((await slipsOf({ paymentId: B.ST3!.paymentId })).length !== n0) p.push("transRef ซ้ำยังได้แถว");
    const s1 = SID.s1 ?? "";
    const row = await slipRow(s1);
    const v = await call(slipMod, "slipViewerUrl", ctxU("A"), A("CASHIER"), { slipId: s1 });
    const url = String(v?.url ?? "");
    const m = /^\/api\/files\/([^?]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/.exec(url);
    if (v?.ok !== true || !m) p.push(`slipViewerUrl → ${codeOf(v)} ${short(url, 60)} (คาด /api/files/<id>?exp=&sig=)`);
    else {
      const exp = Number(m[2]);
      const left = exp - Math.floor(Date.now() / 1000);
      if (!(left > 0 && left <= 300)) p.push(`อายุลิงก์ ${left} วิ (คาด ≤ 300)`);
      if (decodeURIComponent(m[1]!) !== row?.fileId) p.push("ลิงก์ชี้ไฟล์อื่น");
      const ok = linksMod?.privateFileSignatureOk?.(decodeURIComponent(m[1]!), m[2], m[3], { kind: "STAFF", id: uid("CASHIER") });
      if (ok !== true) p.push("ลายเซ็นไม่ผูกผู้ดู STAFF:<userId>");
    }
    const np = await call(slipMod, "slipViewerUrl", ctxU("A"), A("NOPERM"), { slipId: s1 });
    if (!refused(np, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ดู → ${codeOf(np)}`);
    for (const [lbl, u, actor] of [["สาขา B", "B", "CASHB"], ["ร้าน T2", "X", "OWNER2"]] as const) {
      const r = await call(slipMod, "slipViewerUrl", ctxU(u), A(actor), { slipId: s1 });
      if (r?.ok !== false || r?.missing) p.push(`${lbl} ดู → ${codeOf(r)} (คาดปฏิเสธ)`);
    }
    const before = js(await slipRow(s1));
    const vr = await call(verifyMod, "verifySlip", ctxU("A"), A("MGR"), { slipId: s1 });
    if (!refused(vr, "NOT_CONFIGURED")) p.push(`verifySlip → ${codeOf(vr)} (คาด NOT_CONFIGURED)`);
    const reg: Any = verifyMod?.SLIP_VERIFY_PROVIDERS;
    const provs: Any[] = Array.isArray(reg) ? reg : isRecord(reg) ? Object.values(reg) : [];
    if (!provs.length) p.push("SLIP_VERIFY_PROVIDERS ว่าง/ไม่มี");
    for (const pv of provs) {
      const r = await call(pv, "verify", { id: s1, transRef: TR, amountSatang: 100 }, {});
      if (!refused(r, "NOT_CONFIGURED")) p.push(`${short(pv?.code ?? pv?.provider ?? "?", 12)}.verify → ${codeOf(r)}`);
    }
    if (js(await slipRow(s1)) !== before) p.push("verify ทำให้สลิปเปลี่ยน");
    chk("SL6", !fx && p.length === 0, "transRef ไม่ซ้ำ · ลิงก์ดูหลังตรวจสิทธิ์ ≤ 300 วิ · ตรวจอัตโนมัติ = โครง", why(p, FX()));
  });
  await step("SL7", async () => {
    const p: string[] = [...SL_NEED()];
    await patchPos(S.POS ?? "none", "payment", { slipRetentionDays: 30 });
    let sr = "";
    try {
      const r = await attach("A", "STAFF", { saleId: B.ST2!.id, paymentId: B.ST2!.paymentId, file: file("jpeg") });
      sr = slipIdOf(r);
      if (r?.ok !== true) p.push(`แนบสลิปเก็บสั้น → ${codeOf(r)}`);
    } finally {
      await patchPos(S.POS ?? "none", "payment", { slipRetentionDays: undefined });
    }
    const row = await slipRow(sr);
    const fa = row?.fileId ? ((await P.fileAsset.findUnique({ where: { id: row.fileId } }).catch(() => null)) as Any) : null;
    if (row) {
      const dd = new Date(row.purgeAfter).getTime() - new Date(row.createdAt).getTime();
      if (!(Math.abs(dd - SLIP_RETENTION_MIN_D * DAY) <= 2 * MIN)) p.push(`slipRetentionDays 30 → ${(dd / DAY).toFixed(2)} วัน (คาดตัดเป็น ${SLIP_RETENTION_MIN_D})`);
    }
    const s1Before = await slipRow(SID.s1 ?? "");
    const d0 = dels.length;
    const pr = await call(slipMod, "purgeExpiredSlips", { tenantId: T, now: new Date(Date.now() + (SLIP_RETENTION_MIN_D + 1) * DAY), deps: delDeps });
    const purged = Number(pr?.purged ?? -1);
    if (pr?.ok === false || purged < 1) p.push(`purgeExpiredSlips → ${codeOf(pr)} purged ${short(pr?.purged, 8)} (คาด ≥ 1)`);
    const after = await slipRow(sr);
    if (!after) p.push("แถวสลิปถูกลบ (ต้องคงไว้เป็น audit)");
    else {
      if (after.fileId) p.push("fileId ยังไม่ null");
      if (after.status !== row?.status) p.push(`สถานะเปลี่ยน ${row?.status}→${after.status}`);
    }
    if (fa && (await P.fileAsset.findUnique({ where: { id: fa.id } }).catch(() => null))) p.push("FileAsset ยังอยู่");
    if (fa && !dels.slice(d0).includes(fa.path)) p.push(`deps.del ไม่ได้รับ path ของไฟล์ (${dels.length - d0} ครั้ง)`);
    const s1After = await slipRow(SID.s1 ?? "");
    if (s1Before?.fileId && s1After?.fileId !== s1Before.fileId) p.push("สลิป 5 ปีถูกแตะ");
    const pr2 = await call(slipMod, "purgeExpiredSlips", { tenantId: T, now: new Date(Date.now() + (SLIP_RETENTION_MIN_D + 1) * DAY), deps: delDeps });
    if (Number(pr2?.purged ?? -1) !== 0) p.push(`รอบสอง purged ${short(pr2?.purged, 8)} (คาด 0)`);
    const v = await call(slipMod, "slipViewerUrl", ctxU("A"), A("OWNER"), { slipId: sr });
    if (v?.ok !== false || v?.missing) p.push(`ลิงก์ดูของที่ลบแล้ว → ${codeOf(v)} (คาดปฏิเสธ)`);
    if (!fx) await settle();
    const fp1 = await fpMoney();
    if (fp1 !== FP_SL0) p.push(`ลายนิ้วมือเงินเปลี่ยน (บิล/ชำระ/ใบขอรับเงิน/สมุดรายวัน) ${short(FP_SL0.length, 6)}→${short(fp1.length, 6)} ตัวอักษร`);
    chk("SL7", !fx && p.length === 0, "สลิปไม่มีผลเงิน · ลบตามอายุเก็บ (คงแถว)", why(p, FX()));
  });

  // ════════ RC กระทบยอด ════════
  const at12 = (daysAgo: number) => {
    const t = new Date(Date.now() - daysAgo * DAY);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 5, 0, 0));
  };
  const D1 = at12(3);
  const D2 = at12(2);
  const RCI: Record<string, Any> = {};
  if (!fx) {
    try {
      const mkI = async (k: string, d: Any) => {
        const id = `pi_qc3s${RAND}${k}`;
        RCI[k] = await P.posPaymentIntent.create({ data: { id, tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: `${KEY_PREFIX}-rc-${k}`, expiresAt: new Date(d.createdAt.getTime() + 15 * MIN), lateWebhook: false, ...d } });
      };
      await mkI("w", { kind: "PROMPTPAY_BEAM", amountSatang: 1111, status: "CONSUMED", confirmedVia: "WEBHOOK", paidAt: D1, saleId: B.ST!.id, beamChargeId: `ch_qc${RAND}w`, beamRef: `ch_qc${RAND}w`, createdAt: D1 });
      await mkI("m", { kind: "PROMPTPAY_STATIC", amountSatang: 2222, status: "CONSUMED", confirmedVia: "MANUAL", confirmedByUserId: uid("OWNER"), paidAt: D1, saleId: B.ST2!.id, createdAt: D1 });
      await mkI("l", { kind: "CARD_BEAM", amountSatang: 3333, status: "CONSUMED", confirmedVia: "WEBHOOK", lateWebhook: true, paidAt: D2, saleId: B.ST3!.id, beamChargeId: `ch_qc${RAND}l`, createdAt: D2 });
      await mkI("n", { kind: "PROMPTPAY_BEAM", amountSatang: 4444, status: "PAID", confirmedVia: "WEBHOOK", paidAt: D2, beamChargeId: `ch_qc${RAND}n`, createdAt: D2 });
      await mkI("e", { kind: "PROMPTPAY_STATIC", amountSatang: 5555, status: "EXPIRED", createdAt: D2 });
      await mkI("c", { kind: "PROMPTPAY_STATIC", amountSatang: 6666, status: "CANCELLED", createdAt: D2 });
      await mkI("x", { kind: "PROMPTPAY_STATIC", amountSatang: 7777, status: "PENDING", createdAt: D2 });
      const id = `pi_qc3s${RAND}b`;
      RCI.b = await P.posPaymentIntent.create({ data: { id, tenantId: T, unitId: U.B, systemId: S.POS, idempotencyKey: `${KEY_PREFIX}-rc-b`, kind: "PROMPTPAY_BEAM", amountSatang: 8888, status: "PAID", confirmedVia: "WEBHOOK", paidAt: D1, createdAt: D1, expiresAt: new Date(D1.getTime() + 15 * MIN) } });
      // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (fix1 H1: หลักฐานสลิปต้องผูกใบขอรับเงินเดียวกัน + ยอดตรง — สลิป CONFIRMED ยอดไม่ตรงบนใบ m + สลิป CONFIRMED บนแถวชำระของบิล ST2 (ไม่ผูกใบ) ⇒ m ยังต้องตรวจ) ◂
      if (MODEL("posPaymentSlip")) {
        const slipFx = (k: string, d: Any) => MODEL("posPaymentSlip").create({ data: { tenantId: T, systemId: S.POS, unitId: U.A, status: "CONFIRMED", verifiedVia: "MANUAL", idempotencyKey: `${KEY_PREFIX}-rcs-${k}`, createdByUserId: uid("STAFF"), confirmedByUserId: uid("MGR"), confirmedAt: D1, purgeAfter: new Date(Date.now() + 1825 * DAY), ...d } });
        await slipFx("m-amt", { intentId: RCI.m.id, amountSatang: 100 });
        await slipFx("m-sale", { saleId: B.ST2!.id, paymentId: B.ST2!.paymentId, amountSatang: 2222 });
      }
    } catch (e) {
      console.log(`  ⚠️  (fixture) ใบขอรับเงินของรายงาน: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  const RANGE = { from: thDate(D1), to: thDate(D2) };
  const EXP_DAYS: Record<string, Record<string, number>> = {
    [`${thDate(D1)}|PROMPTPAY_BEAM`]: { webhookPaid: 1, manualPaid: 0, lateWebhook: 0, paidNotConsumed: 0, consumed: 1, amountSatang: 1111 },
    [`${thDate(D1)}|PROMPTPAY_STATIC`]: { webhookPaid: 0, manualPaid: 1, lateWebhook: 0, paidNotConsumed: 0, consumed: 1, amountSatang: 2222 },
    [`${thDate(D2)}|CARD_BEAM`]: { webhookPaid: 1, manualPaid: 0, lateWebhook: 1, paidNotConsumed: 0, consumed: 1, amountSatang: 3333 },
    [`${thDate(D2)}|PROMPTPAY_BEAM`]: { webhookPaid: 1, manualPaid: 0, lateWebhook: 0, paidNotConsumed: 1, consumed: 0, amountSatang: 4444 },
  };
  const EXP_FLAG: Record<string, string> = { w: "OK", m: "NEEDS_CHECK", l: "LATE", n: "REFUND_NEEDED" };
  const intentFp = async () => js(((await P.$queryRawUnsafe(`SELECT row_to_json(x)::text AS j FROM "PosPaymentIntent" x WHERE x."tenantId" = $1 ORDER BY x.id`, T).catch(() => [])) as Any[]).map((r) => r.j));
  await step("RC1", async () => {
    const p: string[] = [...NEED([recMod, "payment-reconcile.ts"])];
    if (Object.keys(RCI).length !== 8) p.push(`(fixture) ใบขอรับเงิน ${Object.keys(RCI).length}/8`);
    const r = await call(recMod, "reportIntentReconcile", ctxU("A"), A("MGR"), RANGE);
    if (r?.ok !== true) p.push(`→ ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const days: Any[] = Array.isArray(r.days) ? r.days : [];
      if (days.length !== 4) p.push(`days ${days.length} แถว (คาด 4)`);
      for (const [key, want] of Object.entries(EXP_DAYS)) {
        const [date, kind] = key.split("|");
        const d = days.find((x) => x?.date === date && x?.kind === kind);
        if (!d) {
          p.push(`ไม่มี day ${key}`);
          continue;
        }
        for (const [k, v] of Object.entries(want)) if (d[k] !== v) p.push(`${key}.${k} ${short(d[k], 8)} (คาด ${v})`);
      }
      const rows: Any[] = Array.isArray(r.rows) ? r.rows : [];
      if (rows.length !== 4) p.push(`rows ${rows.length} (คาด 4 · PAID/CONSUMED ของสาขา A)`);
      for (const [k, flag] of Object.entries(EXP_FLAG)) {
        const row = rows.find((x) => x?.intentId === RCI[k]?.id);
        if (!row) {
          p.push(`ไม่มีแถว ${k}`);
          continue;
        }
        if (row.flag !== flag && !(k === "m" && row.flag === "AMOUNT_MISMATCH")) p.push(`${k}.flag ${row.flag} (คาด ${flag})`); // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (fix1 H1: m = NEEDS_CHECK หรือ AMOUNT_MISMATCH) ◂
        if (row.amountSatang !== RCI[k].amountSatang) p.push(`${k}.amountSatang ${row.amountSatang}`);
        for (const key of ["date", "kind", "status", "confirmedVia", "lateWebhook", "saleId", "receiptNo", "beamChargeId", "slipStatus"]) if (!(key in row)) p.push(`${k} ไม่มีคีย์ ${key}`);
      }
      const w = rows.find((x) => x?.intentId === RCI.w?.id);
      if (w && w.receiptNo !== B.ST!.receiptNo) p.push(`w.receiptNo ${short(w.receiptNo, 20)} (คาด ${B.ST!.receiptNo})`);
      if (rows.some((x) => ["e", "c", "x", "b"].some((k) => x?.intentId === RCI[k]?.id))) p.push("มีแถวที่ไม่ควรอยู่ (EXPIRED/CANCELLED/PENDING/สาขา B)");
    }
    const c = await call(recMod, "reportIntentReconcile", ctxU("A"), A("CASHIER"), RANGE);
    if (!refused(c, "PERMISSION_DENIED")) p.push(`CASHIER → ${codeOf(c)} (คาด PERMISSION_DENIED)`);
    const bad = await call(recMod, "reportIntentReconcile", ctxU("A"), A("MGR"), { from: RANGE.to, to: RANGE.from === RANGE.to ? "2000-01-01" : RANGE.from });
    if (!refused(bad, "VALIDATION")) p.push(`ช่วงกลับหัว → ${codeOf(bad)} (คาด VALIDATION)`);
    const x = await call(recMod, "reportIntentReconcile", ctxU("X"), A("OWNER2"), RANGE);
    if (x?.missing || (x?.ok === true && js(x).includes(`pi_qc3s${RAND}`))) p.push(`ร้าน T2 → ${codeOf(x)} เห็นแถวของ T`);
    chk("RC1", !fx && p.length === 0, "นับตรงตัวต่อวัน/ชนิด · flag ตามกติกา", why(p, FX()));
  });
  await step("RC2", async () => {
    const p: string[] = [...NEED([recMod, "payment-reconcile.ts"])];
    const r = await call(recMod, "reportIntentReconcileCsv", ctxU("A"), A("MGR"), RANGE);
    if (r?.ok !== true || typeof r.csv !== "string") p.push(`→ ${codeOf(r)}`);
    else {
      const lines = r.csv.replace(/^﻿/, "").split(/\r?\n/).filter((l: string) => l.trim() !== "");
      if (lines[0] !== CSV_HEADER) p.push(`หัว ${short(lines[0], 80)}`);
      if (lines.length !== 5) p.push(`แถวข้อมูล ${lines.length - 1} (คาด 4)`);
      for (const k of ["w", "m", "l", "n"]) if (!lines.some((l: string) => l.includes(String(RCI[k]?.id ?? "-")))) p.push(`ไม่มีแถว ${k}`);
      if (typeof r.filename !== "string" || !/\.csv$/.test(r.filename)) p.push(`filename ${short(r.filename, 40)}`);
      if (/คุณลูกค้า|@example\.com|08\d{8}/.test(r.csv)) p.push("CSV มีข้อมูลลูกค้า");
    }
    chk("RC2", !fx && p.length === 0, "CSV หัวตรึง · 4 แถว · ไม่มีข้อมูลส่วนตัว", why(p, FX()));
  });
  await step("RC3", async () => {
    const p: string[] = [...NEED([recMod, "payment-reconcile.ts"])];
    const f0 = await intentFp();
    const r = await call(recMod, "importBeamSettlement", ctxU("A"), A("OWNER"), { csv: `chargeId,amount,fee,net\nch_qc${RAND}w,11.11,0.30,10.81\n` });
    if (!refused(r, "NOT_CONFIGURED")) p.push(`importBeamSettlement → ${codeOf(r)} (คาด NOT_CONFIGURED)`);
    if ((await intentFp()) !== f0) p.push("ใบขอรับเงินเปลี่ยน");
    if (!rd(F.integrations).includes(PROMPTPAY_FACT)) p.push(`fact ${PROMPTPAY_FACT} เปลี่ยน`);
    chk("RC3", !fx && p.length === 0, "นำเข้า settlement = โครง · fact คง false", why(p, FX()));
  });

  // ════════ ET e-Tax (DB) ════════
  const accDocFp = async () => js(((await P.$queryRawUnsafe(`SELECT x.id, coalesce(x."etaxStatus"::text, '-') AS s, coalesce(x."etaxMeta"::text, '-') AS m FROM "AccountDocument" x WHERE x."tenantId" = $1 ORDER BY x.id`, T).catch((e: Error) => [{ e: e.message.slice(0, 40) }])) as Any[]));
  const ACC0 = await accDocFp();
  await step("ET2", async () => {
    const p: string[] = [...NEED([etaxLink, "etax-link.ts"])];
    const ti = (await P.posSale.findUnique({ where: { id: B.TI!.id || "none" } }).catch(() => null)) as Any;
    if (!ti?.taxInvoiceDocId) p.push(`(fixture) บิล TI ไม่มี taxInvoiceDocId (${B.TI!.err || "ไม่ได้ออกตอนชำระ"})`);
    const pv = (actor: string, saleId: string, u = "A") => call(etaxLink, "etaxPreview", ctxU(u), A(actor), { saleId });
    const r0 = await pv("OWNER", B.SC!.id);
    if (!refused(r0, "NOT_ELIGIBLE")) p.push(`บิลไม่มีใบกำกับ → ${codeOf(r0)} (คาด NOT_ELIGIBLE)`);
    const r1 = await pv("OWNER", B.TI2!.id);
    if (!refused(r1, "NOT_ELIGIBLE")) p.push(`ใบกำกับไม่มีอีเมล → ${codeOf(r1)} (คาด NOT_ELIGIBLE)`);
    const r2 = await pv("OWNER", B.TI!.id);
    if (r2?.ok !== true || typeof r2.xml !== "string") p.push(`ใบกำกับ + อีเมล → ${codeOf(r2)} ${short(r2?.message ?? "", 50)}`);
    else {
      if (r2.provider !== null) p.push(`provider ${short(r2.provider, 20)} (คาด null)`);
      if (r2.state !== "NOT_CONFIGURED") p.push(`state ${r2.state}`);
      if (!r2.xml.includes(BUY.taxId)) p.push("xml ไม่มีเลขผู้ซื้อ");
      const g = (Number(ti?.grandTotalSatang ?? B.TI!.grand) / 100).toFixed(2);
      if (!tagVals(r2.xml, "GrandTotalAmount").includes(g)) p.push(`GrandTotalAmount ${short(tagVals(r2.xml, "GrandTotalAmount"), 20)} (คาด ${g})`);
    }
    const c = await pv("CASHIER", B.TI!.id);
    if (!refused(c, "PERMISSION_DENIED")) p.push(`CASHIER → ${codeOf(c)} (คาด PERMISSION_DENIED)`);
    const x = await pv("OWNER2", B.TI!.id, "X");
    if (x?.ok !== false || x?.missing) p.push(`ร้าน T2 → ${codeOf(x)} (คาดปฏิเสธ)`);
    chk("ET2", !fx && p.length === 0, "ตัวอย่าง XML เฉพาะบิลที่มีใบกำกับ + อีเมล", why(p, FX()));
  });
  await step("ET3", async () => {
    const p: string[] = [...NEED([etaxLink, "etax-link.ts"], [etaxProv?.ETAX_PROVIDERS, "ETAX_PROVIDERS"])];
    const g0 = guardHits.length;
    const r = await call(etaxLink, "requestEtax", ctxU("A"), A("OWNER"), { saleId: B.TI!.id });
    if (!refused(r, "NOT_CONFIGURED")) p.push(`requestEtax → ${codeOf(r)} (คาด NOT_CONFIGURED)`);
    const reg: Any = etaxProv?.ETAX_PROVIDERS;
    const provs: Any[] = Array.isArray(reg) ? reg : isRecord(reg) ? Object.values(reg) : [];
    if (etaxProv && !provs.length) p.push("ETAX_PROVIDERS ว่าง");
    for (const pv of provs) {
      const s = await call(pv, "send", ETAX_DOC, "<xml/>", {});
      const st = await call(pv, "status", "qc-ref");
      if (!refused(s, "NOT_CONFIGURED") || !refused(st, "NOT_CONFIGURED")) p.push(`${short(pv?.code ?? "?", 12)} send/status → ${codeOf(s)}/${codeOf(st)}`);
    }
    if (guardHits.length !== g0) p.push(`ยิงเครือข่าย ${guardHits.length - g0}`);
    const acc1 = await accDocFp();
    if (acc1 !== ACC0) p.push("AccountDocument.etaxStatus/etaxMeta เปลี่ยน");
    if (/"s":"(PENDING|SENT|FAILED)"/.test(acc1)) p.push("มีเอกสาร etaxStatus ไม่ใช่ NOT_SENT");
    chk("ET3", !fx && p.length === 0, "ส่ง e-Tax = โครง · ไม่แตะเอกสารบัญชี", why(p, FX()));
  });

  // ════════ LP ตัวช่วยพิมพ์ LAN ════════
  const conns: Buffer[][] = [];
  const srv = createServer((s: Socket) => {
    const chunks: Buffer[] = [];
    conns.push(chunks);
    s.on("data", (c: Buffer) => chunks.push(c));
    s.on("error", () => {});
  });
  let PORT = 0;
  // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (fix1 H7: server + agent รับเฉพาะพอร์ตเครื่องพิมพ์ 9100–9102/515 ⇒ เครื่องพิมพ์ปลอมฟังที่พอร์ตว่างตัวแรกของ 9100–9102 แทนพอร์ตสุ่ม) ◂
  for (const port of [9100, 9101, 9102]) {
    try {
      await new Promise<void>((res, rej) => {
        srv.once("error", rej);
        srv.listen(port, "127.0.0.1", () => res());
      });
      srv.removeAllListeners("error");
      PORT = (srv.address() as AddressInfo).port;
      break;
    } catch (e) {
      srv.removeAllListeners("error");
      console.log(`  ⚠️  เครื่องพิมพ์ปลอมเปิดพอร์ต ${port} ไม่ได้: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  const LP_NEED = () => [...NEED([relay, "print-relay.ts"]), ...NT("PosPrintAgent", "PosPrintJob")];
  const AG: Record<string, { id: string; token: string }> = {};
  const jobRow = async (id: string): Promise<Any> => (id && MODEL("posPrintJob") ? MODEL("posPrintJob").findUnique({ where: { id } }).catch(() => null) : null);
  const jobIdOf = (r: Any): string => String(r?.job?.id ?? r?.jobId ?? r?.id ?? "");
  const jobsGet = async (auth?: string): Promise<{ status: number; json: Any }> => {
    const fn = jobsRoute?.GET;
    if (typeof fn !== "function") return { status: -1, json: null };
    const req = new Request(`${BASE_URL}/api/pos/print-agent/jobs?wait=0`, { headers: auth === undefined ? {} : { authorization: auth } });
    try {
      const res: Response = await fn(req);
      const t = await res.text();
      let j: Any = null;
      try {
        j = JSON.parse(t);
      } catch {
        /* ไม่ใช่ JSON */
      }
      return { status: res.status, json: j };
    } catch (e) {
      return { status: -2, json: { throw: (e as Error).message.slice(0, 60) } };
    }
  };
  const ackPost = async (auth: string | undefined, jobId: string, body: Any): Promise<number> => {
    const fn = ackRoute?.POST;
    if (typeof fn !== "function") return -1;
    const req = new Request(`${BASE_URL}/api/pos/print-agent/jobs/${encodeURIComponent(jobId)}/ack`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(auth === undefined ? {} : { authorization: auth }) } });
    try {
      return ((await fn(req, { params: Promise.resolve({ id: jobId }) })) as Response).status;
    } catch {
      return -2;
    }
  };
  const bearer = (k: string) => `Bearer ${AG[k]?.token ?? "none"}`;
  const enqueue = (actor: string, input: Any, deps?: Any) => call(relay, "enqueuePrintJob", ctxU("A", DEV1), A(actor), { deviceCode: DEV1, target: "kitchen", agentId: AG.A?.id, idempotencyKey: newKey("pj"), ...input }, deps);
  const jobIds = (j: Any): string[] => (Array.isArray(j?.jobs) ? j.jobs.map((x: Any) => String(x?.id ?? "")) : []);
  await step("LP1", async () => {
    const p: string[] = [...LP_NEED()];
    if (!PORT) p.push("(fixture) ไม่มีเครื่องพิมพ์ปลอม");
    const reg = async (k: string, u: string, actor: string, name: string, printers: Any[]) => {
      const r = await call(relay, "registerPrintAgent", ctxU(u), A(actor), { name, printers });
      if (r?.ok === true) AG[k] = { id: String(r.agent?.id ?? r.agentId ?? ""), token: String(r.token ?? "") };
      return r;
    };
    const ra = await reg("A", "A", "MGR", "ครัว QC", [{ name: "kitchen", host: "127.0.0.1", port: PORT }]);
    if (ra?.ok !== true) p.push(`ลงทะเบียน agent A → ${codeOf(ra)} ${short(ra?.message ?? "", 50)}`);
    await reg("B", "A", "MGR", "บาร์ QC", [{ name: "bar", host: "127.0.0.1", port: PORT }]);
    await reg("X", "X", "OWNER2", "ครัว T2", [{ name: "kitchen", host: "127.0.0.1", port: PORT }]);
    const tok = AG.A?.token ?? "";
    if (tok.length < 32) p.push(`token ยาว ${tok.length} (คาด ≥ 32)`);
    const row = AG.A ? ((await MODEL("posPrintAgent")?.findUnique({ where: { id: AG.A.id } }).catch(() => null)) as Any) : null;
    if (!row) p.push("ไม่มีแถว agent");
    else if (!row.tokenHash || row.tokenHash === tok) p.push("tokenHash ว่าง/เท่ากับ token");
    const raw = TABLES.PosPrintAgent ? ((await P.$queryRawUnsafe(`SELECT row_to_json(x)::text AS j FROM "PosPrintAgent" x WHERE x."tenantId" = $1`, T).catch(() => [])) as Any[]) : [];
    if (tok && raw.some((r) => String(r.j).includes(tok))) p.push("แถวดิบมี token");
    const ls = await call(relay, "listPrintAgents", ctxU("A"), A("MGR"));
    if (ls?.ok !== true) p.push(`listPrintAgents → ${codeOf(ls)}`);
    if (tok && js(ls).includes(tok)) p.push("listPrintAgents คืน token");
    if (row?.tokenHash && js(ls).includes(String(row.tokenHash))) p.push("listPrintAgents คืน tokenHash");
    const aud = (await P.auditLog.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[];
    const ops = (await P.opsEvent.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[];
    if (tok && (js(aud.map((a) => [a.before, a.after])).includes(tok) || js(ops.map((o) => [o.message, o.detail])).includes(tok))) p.push("audit/ops มี token");
    const c = await call(relay, "registerPrintAgent", ctxU("A"), A("CASHIER"), { name: "ไม่มีสิทธิ์", printers: [{ name: "k", host: "127.0.0.1", port: 9100 }] });
    if (!refused(c, "PERMISSION_DENIED")) p.push(`CASHIER ลงทะเบียน → ${codeOf(c)} (คาด PERMISSION_DENIED)`);
    for (const port of [0, 70000]) {
      const r = await call(relay, "registerPrintAgent", ctxU("A"), A("MGR"), { name: "พอร์ตผิด", printers: [{ name: "k", host: "192.168.1.50", port }] });
      if (!refused(r, "VALIDATION")) p.push(`port ${port} → ${codeOf(r)} (คาด VALIDATION)`);
    }
    chk("LP1", !fx && p.length === 0, "token ครั้งเดียว · เก็บแฮช · ไม่รั่ว", why(p, FX()));
  });
  const JOB: Record<string, string> = {};
  await step("LP2", async () => {
    const p: string[] = [...LP_NEED()];
    const b64 = randomBytes(512).toString("base64");
    const k = newKey("pj1");
    const r = await enqueue("CASHIER", { bytesB64: b64, idempotencyKey: k });
    JOB.j1 = jobIdOf(r);
    if (r?.ok !== true || !JOB.j1) p.push(`enqueue → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    if ((await jobRow(JOB.j1))?.status !== "QUEUED") p.push(`สถานะ ${(await jobRow(JOB.j1))?.status} (คาด QUEUED)`);
    const r2 = await enqueue("CASHIER", { bytesB64: b64, idempotencyKey: k });
    if (jobIdOf(r2) !== JOB.j1) p.push(`เล่นซ้ำคีย์ → ${codeOf(r2)} id ${jobIdOf(r2).slice(-6)}`);
    const np = await enqueue("NOPERM", { bytesB64: b64 });
    if (!refused(np, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(np)}`);
    const ax = await enqueue("CASHIER", { bytesB64: b64, agentId: AG.X?.id ?? "none" });
    if (ax?.ok !== false || ax?.missing) p.push(`agent ร้าน T2 → ${codeOf(ax)} (คาดปฏิเสธ)`);
    for (const [lbl, inp] of [["> 256 KB", { bytesB64: randomBytes(PRINT_MAX_BYTES + 1).toString("base64") }], ["base64 ผิด", { bytesB64: "@@@ไม่ใช่###" }], ["target แปลก", { bytesB64: b64, target: "bogus" }]] as const) {
      const x = await enqueue("CASHIER", inp);
      if (!refused(x, "VALIDATION")) p.push(`${lbl} → ${codeOf(x)} (คาด VALIDATION)`);
    }
    const [g1, g2] = await Promise.all([jobsGet(bearer("A")), jobsGet(bearer("A"))]);
    if (g1.status !== 200 || g2.status !== 200) p.push(`GET A → ${g1.status}/${g2.status}`);
    const got = [...jobIds(g1.json), ...jobIds(g2.json)].filter((x) => x === JOB.j1).length;
    if (got !== 1) p.push(`งาน j1 ถูกแจก ${got} ครั้ง (คาด 1)`);
    const gb = await jobsGet(bearer("B"));
    if (gb.status !== 200 || jobIds(gb.json).length !== 0) p.push(`GET B → ${gb.status} ${jobIds(gb.json).length} งาน (คาด 200 · [])`);
    const row = await jobRow(JOB.j1);
    if (row?.status !== "SENT" || row?.attempts !== 1) p.push(`หลังแจก ${short({ s: row?.status, a: row?.attempts }, 40)} (คาด SENT · 1)`);
    chk("LP2", !fx && p.length === 0, "คิวงาน · แจกครั้งเดียว · ขอบเขต agent", why(p, FX()));
  });
  await step("LP3", async () => {
    const p: string[] = [...LP_NEED()];
    const a1 = await ackPost(bearer("A"), JOB.j1 ?? "none", { ok: true });
    if (a1 !== 200 || (await jobRow(JOB.j1 ?? ""))?.status !== "DONE") p.push(`ack ok → ${a1} ${(await jobRow(JOB.j1 ?? ""))?.status}`);
    const r2 = await enqueue("CASHIER", { bytesB64: randomBytes(64).toString("base64") });
    JOB.j2 = jobIdOf(r2);
    await jobsGet(bearer("A"));
    const a2 = await ackPost(bearer("A"), JOB.j2, { ok: false, error: "paper out" });
    const row2 = await jobRow(JOB.j2);
    if (a2 !== 200 || row2?.status !== "FAILED" || !String(row2?.error ?? "").includes("paper out")) p.push(`ack ล้ม → ${a2} ${short({ s: row2?.status, e: row2?.error }, 50)}`);
    const r3 = await enqueue("CASHIER", { bytesB64: randomBytes(64).toString("base64") });
    JOB.j3 = jobIdOf(r3);
    await jobsGet(bearer("A"));
    const a3 = await ackPost(bearer("B"), JOB.j3, { ok: true });
    if (a3 === 200 || (await jobRow(JOB.j3))?.status !== "SENT") p.push(`agent B ack งานของ A → ${a3} ${(await jobRow(JOB.j3))?.status} (คาดไม่ใช่ 200 · SENT)`);
    await ackPost(bearer("A"), JOB.j3, { ok: true });
    const r4 = await enqueue("CASHIER", { bytesB64: randomBytes(64).toString("base64") }, { now: new Date(Date.now() - 11 * MIN) });
    JOB.j4 = jobIdOf(r4);
    if (r4?.ok !== true) p.push(`(fixture) enqueue ย้อนเวลา → ${codeOf(r4)}`);
    const g = await jobsGet(bearer("A"));
    if (jobIds(g.json).includes(JOB.j4)) p.push("งานหมดอายุถูกแจก");
    const ex1 = await call(relay, "expirePrintJobs", { tenantId: T, now: new Date() });
    if (ex1?.ok === false || !(Number(ex1?.expired ?? 0) >= 1)) p.push(`expirePrintJobs → ${codeOf(ex1)} expired ${short(ex1?.expired, 6)}`);
    if ((await jobRow(JOB.j4))?.status !== "EXPIRED") p.push(`งาน j4 ${(await jobRow(JOB.j4))?.status} (คาด EXPIRED)`);
    const a4 = await ackPost(bearer("A"), JOB.j4, { ok: true });
    if (a4 === 200 || (await jobRow(JOB.j4))?.status !== "EXPIRED") p.push(`ack งาน EXPIRED → ${a4}`);
    chk("LP3", !fx && p.length === 0, "ack DONE/FAILED · ข้าม agent ไม่ได้ · หมดอายุ", why(p, FX()));
  });
  await step("LP4", async () => {
    const p: string[] = [...LP_NEED()];
    const r = await call(relay, "revokePrintAgent", ctxU("A"), A("MGR"), { agentId: AG.B?.id ?? "none" });
    if (r?.ok !== true) p.push(`revoke → ${codeOf(r)}`);
    const row = AG.B ? ((await MODEL("posPrintAgent")?.findUnique({ where: { id: AG.B.id } }).catch(() => null)) as Any) : null;
    if (!row?.revokedAt) p.push("ไม่มี revokedAt");
    for (const [lbl, auth] of [["token เพิกถอน", bearer("B")], ["token มั่ว", `Bearer qc-${randomBytes(24).toString("hex")}`], ["ไม่มีหัว", undefined], ["Bearer ว่าง", "Bearer "]] as const) {
      const g = await jobsGet(auth);
      if (g.status !== 401) p.push(`${lbl} → ${g.status} (คาด 401)`);
    }
    const a = await ackPost(bearer("B"), JOB.j2 ?? "none", { ok: true });
    if (a !== 401) p.push(`ack ด้วย token เพิกถอน → ${a} (คาด 401)`);
    chk("LP4", !fx && p.length === 0, "เพิกถอน/ไม่มี token = 401", why(p, FX()));
  });
  await step("LP5", async () => {
    const p: string[] = [...LP_NEED()];
    const abs = join(ROOT, F.agent);
    if (!existsSync(abs)) p.push(`${MISSING} ${F.agent}`);
    else {
      const bad = valueImportsOf(rd(F.agent)).filter((m) => !/^node:/.test(m));
      if (bad.length) p.push(`agent.mjs import ${bad.join(",")}`);
      const g0 = guardHits.length;
      const c0 = conns.length;
      const ag = await tryImport(pathToFileURL(abs).href);
      await sleep(300);
      if (guardHits.length !== g0 || conns.length !== c0) p.push("import agent.mjs แล้วรันเอง (เรียกเครือข่าย/ต่อเครื่องพิมพ์)");
      const bytes = Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from("ใบครัว QC ", "utf8"), randomBytes(2048), Buffer.from([0x1d, 0x56, 0x00])]);
      const r = await enqueue("CASHIER", { bytesB64: bytes.toString("base64") });
      JOB.j5 = jobIdOf(r);
      if (r?.ok !== true) p.push(`(fixture) enqueue → ${codeOf(r)}`);
      const fakeFetch = async (input: Any, init?: Any): Promise<Response> => {
        const req: Request = input instanceof Request ? input : new Request(String(input), init);
        const u = new URL(req.url);
        if (u.pathname === "/api/pos/print-agent/jobs" && typeof jobsRoute?.GET === "function") return jobsRoute.GET(req);
        const m = /^\/api\/pos\/print-agent\/jobs\/([^/]+)\/ack$/.exec(u.pathname);
        if (m && typeof ackRoute?.POST === "function") return ackRoute.POST(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]!) }) });
        return new Response("not found", { status: 404 });
      };
      if (typeof ag?.pollOnce !== "function") p.push("agent.mjs ไม่มี pollOnce");
      else {
        try {
          await Promise.race([ag.pollOnce({ baseUrl: BASE_URL, token: AG.A?.token ?? "", fetch: fakeFetch }), sleep(15_000).then(() => {
            throw new Error("pollOnce เกิน 15 วิ");
          })]);
        } catch (e) {
          p.push(`pollOnce throw ${short((e as Error).message, 60)}`);
        }
        const t0 = Date.now();
        const want = sha256(bytes);
        let hit = false;
        while (Date.now() - t0 < 3000 && !hit) {
          hit = conns.some((c) => sha256(Buffer.concat(c)) === want);
          if (!hit) await sleep(100);
        }
        if (!hit) p.push(`เครื่องพิมพ์ปลอมไม่ได้ไบต์ตรง (การเชื่อมต่อ ${conns.length} · ยาว ${conns.map((c) => Buffer.concat(c).length).join("/")} คาด ${bytes.length})`);
        const row = await jobRow(JOB.j5);
        if (row?.status !== "DONE") p.push(`งาน ${row?.status} (คาด DONE)`);
      }
    }
    chk("LP5", !fx && p.length === 0, "agent.mjs ส่งไบต์ถึงเครื่องพิมพ์ปลอมตรงทุกไบต์", why(p, FX()));
  });
  await new Promise<void>((res) => srv.close(() => res()));
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสอง + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  const targets = ([[T, T_SLUG, "T"], [T2, T2_SLUG, "T2"]] as [string, string, string][]).filter(([id]) => !!id);
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
    for (const [id, slug, lbl] of targets) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
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
          if (n) rep.left[`${lbl}.${tb}`] = n;
        } catch {
          rep.left[`${lbl}.${tb}`] = -1;
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
    envRestore();
  }
}
if (guardHits.length) console.log(`  ℹ️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits.map((h) => h.host))].join(", ")}`);
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
  for (const m of NEW_MODELS) if (TABLES[m]) await n(m, async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${m}" x WHERE row_to_json(x)::text LIKE $1`, like)) as Any[])[0]?.n);
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  await n("posOrder", () => P.posOrder.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  await n("posPaymentIntent", () => P.posPaymentIntent.count({ where: { OR: [{ idempotencyKey: { contains: KEY_PREFIX } }, { id: { contains: RAND } }] } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND ("payload"::text LIKE $2 OR "idempotencyKey" LIKE $2)`, since, like)) as Any[])[0]?.n);
  await n("opsEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE "createdAt" >= $1 AND (coalesce("message",'') || coalesce("detail",'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaksOut = await leaksOutside();
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", leaksOut.length === 0, "ไม่มีรอยของรอบนี้นอกร้านชั่วคราว (ลายนิ้วมือ = ข้อมูล)",
  [leaksOut.length ? `หลุด ${leaksOut.join(", ")}` : "ไม่มีรอย", fpDrift.length ? `(ข้อมูล · lane อื่นอาจเขียน) ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือร้านอื่นเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, crashed: crashed || null, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks: leaksOut, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3-SKEL S: การ์ดตั้งค่าในลิ้นชักช่องทาง (ฟิลด์ · masked · ปุ่มทดสอบ · URL webhook — จอ 10) · การ์ดสลิป/อายุเก็บในตั้งค่ารับเงิน ·
//   ปุ่ม "แนบสลิป" บน PayDone/บิล + แผ่นยืนยันของผู้จัดการ (02/12) · บรรทัด e-Tax ใต้ช่องอีเมล (15A) · การ์ด LAN agent + radio LAN (17B) = P3-SKEL U ·
//   adapter จริง LINE MAN/Grab/marketplace · OAuth อนุญาตร้าน · สมาชิกจาก marketplace (มติ 7) · ผู้ให้บริการตรวจสลิปจริง → markIntentPaid (ใบแยก + hunter) ·
//   นำเข้า settlement Beam จริง · ผู้ให้บริการ e-Tax จริง + etaxStatus (เจ้าของโมดูลบัญชี) · เครื่องพิมพ์จริง ตัด/ลิ้นชัก/โค้ดเพจไทย (W5)
//   ชุด regression (§4): qc-pos-p2.8 (A8) p2.7 p2.6 p1.7 p1.13 p1.10 p1.18 p2.13 p2.14 G1 · qc-hf-pos-page-authz · ชุดเงิน (COMMON §7) · fitness ±env ·
//   fitness-pos · gen-pos-api-docs --check · typecheck 8192
