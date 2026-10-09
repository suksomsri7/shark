// pos-qc-env.mts — ตัวโหลด env + ค่าคงที่ + id ตายตัว ของชุดข้อมูล QC "POS ใหม่" (RUN POS · ใบ P0.1)
//
// ใช้คู่กับ `scripts/seed-pos-qc.mts` (ผู้สร้าง) · ข้อสอบ `scripts/qc-pos-p*.mts` · `scripts/visual-pos.mts`
// แบบอย่าง: `crm-qc-env.mts` / `member-qc-env.mts` — แต่ต่างกัน 2 เรื่องโดยตั้งใจ:
//   1) ร้าน QC ของ POS **แยกจากร้าน QC สมาชิก/CRM** (`siam-dive-member-qc`) — seed นี้ไม่แตะร้านนั้นเลย
//      (บทเรียน reference_shark_qc_member_seed_wipes_crm: seed ที่ลบแล้วสร้างใหม่ทำข้อมูลระบบอื่นหายทั้งชุด)
//   2) id ของ ร้าน/สาขา/ระบบ/ผู้ใช้/membership **ตายตัว** (ไม่ใช่ cuid สุ่ม) ⇒ seed เป็นแบบ find-or-create ล้วน
//      รันซ้ำกี่รอบ id ก็เดิม · ไม่มีการลบแถวใด ๆ · ข้อสอบ/ภาพอ้าง id จากไฟล์นี้ได้ตรง ๆ ไม่ต้องรอเฉลย
//
// 🔴 ไฟล์นี้ไม่ import prisma และไม่ import `@/…` — ผู้เรียกส่ง PrismaClient เข้ามาเอง (import ได้จาก fitness/ที่ไม่มี env)
// 🔴 ฐานข้อมูล: ระหว่างที่ CRM RUN ยังวิ่ง POS ใช้ **QC4 เท่านั้น** (`scripts/qc4.sh` · host ep-frosty-lab)
//    `loadPosQcEnv()` ปฏิเสธ production + QC1–QC3 ของ CRM เสมอ (ไม่มีทางปลด) และปฏิเสธ host อื่นที่ไม่ใช่ QC4
//    เว้นแต่ตั้ง POS_QC_ALLOW_HOST=<ส่วนของ host> โดยตั้งใจ (exit 4 ทุกกรณีที่ปฏิเสธ)
// 🔴 เงิน = สตางค์ (Int) ทุกตัวในไฟล์นี้

import { isProdDbUrl, PROD_HOST_MARK } from "./qc-env-guard.mjs";

// ═══════════════════ 1. env + ด่านกันฐานผิด ═══════════════════

/** host ของ QC1/QC2/QC3 ที่ CRM RUN ถืออยู่ (ดู scripts/qc4.sh) — POS ห้ามเขียน */
export const CRM_QC_HOST_MARKS = ["ep-plain-art", "ep-cool-shadow", "ep-weathered-river"] as const;
/** host ของ QC4 (`wo-pos-qc4`) — ฐานส่วนตัวของ POS */
export const POS_QC_HOST_MARK = "ep-frosty-lab";

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^.*@/, "").split("/")[0] ?? "(อ่าน host ไม่ได้)";
  }
}

/**
 * โหลด env ของชุด QC POS แล้วตรวจว่า "ไม่ใช่ฐานที่ห้ามแตะ" ก่อนคืนค่า — เรียกบรรทัดแรกของทุกสคริปต์ที่แตะ DB
 *  - `QC_ENV_FILE` (ปริยาย `.env.qc` — ใน worktree ของ POS ชี้ QC4) · env ที่ export มาก่อนชนะไฟล์เสมอ (qc4.sh export ให้แล้ว)
 *  - production / QC1–QC3 ของ CRM → exit 4 เสมอ · host อื่นที่ไม่ใช่ QC4 → exit 4 เว้นแต่ POS_QC_ALLOW_HOST
 *  - APP_ENV=production → ตาย · ไม่ตั้ง → development
 * @returns host ที่ใช้จริง (พิมพ์ออกจอแล้ว)
 */
export function loadPosQcEnv(label: string): { host: string; envFile: string; isQc4: boolean } {
  const envFile = process.env.QC_ENV_FILE || ".env.qc";
  if (envFile === ".env") {
    console.error(`🔴 ${label}: QC_ENV_FILE=.env คือ production — ห้าม (ใช้ .env.qc / .env.qc4 ผ่าน scripts/qc4.sh)`);
    process.exit(4);
  }
  const preDb = process.env.DATABASE_URL ?? "";
  const preDirect = process.env.DIRECT_URL ?? "";
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* ไม่มีไฟล์ — ต้อง export DATABASE_URL/DIRECT_URL มาครบแล้ว (ตรวจด้านล่าง) */
  }
  // env ที่ export มาก่อนชนะไฟล์ — คืนทั้งคู่ (คืนตัวเดียว = อ่าน QC แต่ DIRECT ชี้ที่อื่น อันตรายกว่าเดิม)
  if (preDb) process.env.DATABASE_URL = preDb;
  if (preDirect) process.env.DIRECT_URL = preDirect;
  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  if (!db) {
    console.error(`❌ ${label}: ไม่มี DATABASE_URL (ไฟล์ ${envFile} ไม่มี และไม่ได้ export มา) — รันผ่าน: bash scripts/iso.sh bash scripts/qc4.sh …`);
    process.exit(4);
  }
  // ด่าน host (ทั้ง DATABASE_URL และ DIRECT_URL):
  //  1) production → ตายเสมอ (ไม่มีทางปลด) · 2) QC1–QC3 ของ CRM → ตายเสมอ (ไม่มีทางปลด — มติผู้คุมงาน รอบ 2)
  //  3) ไม่ใช่ QC4 → ตาย เว้นแต่ตั้ง POS_QC_ALLOW_HOST=<ส่วนหนึ่งของ host ≥6 ตัว> ที่ตรงกับ host นั้นจริง (ตั้งใจเปลี่ยนฐานเท่านั้น)
  const allowHost = (process.env.POS_QC_ALLOW_HOST ?? "").trim();
  for (const [name, url] of [["DATABASE_URL", db], ["DIRECT_URL", direct]] as const) {
    if (!url) continue;
    if (isProdDbUrl(url)) {
      console.error(`🔴 หยุด! ${label}: ${name} ชี้ production (${PROD_HOST_MARK}…) — ชุด QC ของ POS ห้ามแตะ prod (ปลดไม่ได้)`);
      process.exit(4);
    }
    const crm = CRM_QC_HOST_MARKS.find((m) => url.includes(m));
    if (crm) {
      console.error(
        `🔴 หยุด! ${label}: ${name} ชี้ฐาน QC ของ CRM RUN (${crm}) — POS ใช้ QC4 เท่านั้น (ปลดไม่ได้)\n` +
          `   รัน: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`,
      );
      process.exit(4);
    }
    if (!url.includes(POS_QC_HOST_MARK) && !(allowHost.length >= 6 && safeHost(url).includes(allowHost))) {
      console.error(
        `🔴 หยุด! ${label}: ${name} host ${safeHost(url)} ไม่ใช่ QC4 (${POS_QC_HOST_MARK}) — รันผ่าน scripts/qc4.sh\n` +
          `   ถ้าตั้งใจใช้ฐานอื่นจริง: POS_QC_ALLOW_HOST=<ส่วนของ host ≥6 ตัวอักษร> (prod/QC1–3 ถูกปฏิเสธก่อนถึงตรงนี้)`,
      );
      process.exit(4);
    }
  }
  if (process.env.APP_ENV === "production") {
    console.error(`🔴 หยุด! ${label}: APP_ENV=production`);
    process.exit(4);
  }
  process.env.APP_ENV ??= "development";
  const host = safeHost(db);
  const isQc4 = db.includes(POS_QC_HOST_MARK);
  console.log(`[env] ${label} · ไฟล์ ${envFile} · DB ${host}${isQc4 ? " (QC4)" : ` (อนุญาตด้วย POS_QC_ALLOW_HOST=${allowHost})`}`);
  return { host, envFile, isQc4 };
}

// ═══════════════════ 2. ชื่อตารางจริงที่ POS ใช้วันนี้ (ตรวจกับไฟล์ .prisma ใน prisma/schema 1 ต.ค. 2569 · P1.11: ห้ามมีทับตามด้วยดาวในบรรทัดนี้ — ตัวตัดคอมเมนต์ของข้อสอบสถิตจะกินทะเบียนข้างล่างทั้งก้อน) ═══════════════════
// key = ชื่อ delegate ของ Prisma (camelCase) · value = { model ตรงตัว · ไฟล์ schema · บทบาทใน POS }
// 🔴 ตารางของ P1.1a (PosProduct · PosCategory · PosVariant · RecipeLine · PosShift · PosDevice · PosHeldCart ·
//    PosPaymentIntent · PosReceiptToken · PosStockCount · PosStaffPin · SalesChannel · ExternalOrder …) **ยังไม่มีจริง**
//    ห้ามเติมที่นี่จนกว่า migration ของใบนั้นจะลง — ใบที่สร้างตารางเป็นคนเติม (ข้อสอบใช้ POS_FUTURE_MODELS เช็ก "ยังไม่มี")
export const POS_MODELS = {
  // ── แกนเงินของ POS (prisma/schema/pos.prisma) ──
  posSale: { model: "PosSale", file: "pos.prisma", role: "บิลขาย (จุดตัดเงินกลาง · createSale/voidSale)" },
  posSaleLine: { model: "PosSaleLine", file: "pos.prisma", role: "บรรทัดบิล (itemId=InvItem · serviceId)" },
  posPayment: { model: "PosPayment", file: "pos.prisma", role: "วิธีชำระต่อบิล (enum PosPayType)" },
  posReceiptCounter: { model: "PosReceiptCounter", file: "pos.prisma", role: "เลขใบเสร็จต่อสาขา/เดือน (YYYYMM)" },
  // ── แคตตาล็อกวันนี้: 3 ต้นฉบับ (เป้าหมาย F15.1/P1.1 = ยุบเหลือ PosProduct) ──
  invItem: { model: "InvItem", file: "inventory.prisma", role: "สินค้า/บริการกลาง (kind PRODUCT|SERVICE · barcode · onHand cache)" },
  invCategory: { model: "InvCategory", file: "inventory.prisma", role: "หมวดสินค้าคลัง" },
  invMovement: { model: "InvMovement", file: "inventory.prisma", role: "สมุดเคลื่อนไหวสต็อก (ต้นฉบับของ onHand)" },
  invLocationStock: { model: "InvLocationStock", file: "inventory.prisma", role: "onHand ต่อคลัง (cache)" },
  invSettings: { model: "InvSettings", file: "inventory.prisma", role: "ตั้งค่าคลัง" },
  accountProduct: { model: "AccountProduct", file: "account_gl.prisma", role: "ราคาขาย POS วันนี้ = salePrice · vatRateBp ต่อสินค้า" },
  accountSystemLink: { model: "AccountSystemLink", file: "account_gl.prisma", role: "ผูก POS ↔ ระบบบัญชี (posAccountSystemId)" },
  menuCategory: { model: "MenuCategory", file: "restaurant.prisma", role: "หมวดเมนูร้านอาหาร" },
  menuItem: { model: "MenuItem", file: "restaurant.prisma", role: "เมนูร้านอาหาร (ต้นฉบับที่ 2 · basePrice · stockQty/86)" },
  menuOptionGroup: { model: "MenuOptionGroup", file: "restaurant.prisma", role: "กลุ่มตัวเลือกเมนู" },
  menuOptionChoice: { model: "MenuOptionChoice", file: "restaurant.prisma", role: "ตัวเลือกเมนู" },
  menuItemOptionGroup: { model: "MenuItemOptionGroup", file: "restaurant.prisma", role: "ผูกเมนู↔กลุ่มตัวเลือก" },
  kdsStation: { model: "KdsStation", file: "restaurant.prisma", role: "สถานีครัว (KDS)" },
  restaurantSetting: { model: "RestaurantSetting", file: "restaurant.prisma", role: "ตั้งค่าร้านอาหารต่อสาขา" },
  restaurantOrder: { model: "RestaurantOrder", file: "restaurant.prisma", role: "ออเดอร์โต๊ะ → checkout = createSale" },
  restaurantOrderItem: { model: "RestaurantOrderItem", file: "restaurant.prisma", role: "บรรทัดออเดอร์ (menuItemId)" },
  shopProduct: { model: "ShopProduct", file: "ecommerce.prisma", role: "สินค้าเว็บร้าน (ต้นฉบับที่ 3 · priceSatang)" },
  shopOrder: { model: "ShopOrder", file: "ecommerce.prisma", role: "ออเดอร์เว็บร้าน → createSale ตอนยืนยันเงิน" },
  shopOrderLine: { model: "ShopOrderLine", file: "ecommerce.prisma", role: "บรรทัดออเดอร์เว็บ (productId=ShopProduct)" },
  bookingService: { model: "BookingService", file: "booking.prisma", role: "บริการ (ทางสำรองของหน้าขาย)" },
  // ── ส่วนลด/สิทธิ์ที่ createSale แตะใน tx ──
  coupon: { model: "Coupon", file: "coupon.prisma", role: "คูปอง (couponSystemId + couponCode)" },
  couponRedemption: { model: "CouponRedemption", file: "coupon.prisma", role: "การใช้คูปอง (void คืนสิทธิ์)" },
  customer: { model: "Customer", file: "member.prisma", role: "สมาชิก (PosSale.memberId)" },
  memberAttribution: { model: "MemberAttribution", file: "member.prisma", role: "ที่มาของสมาชิก (PosSale.attributionId)" },
  pointLedger: { model: "PointLedger", file: "point.prisma", role: "แต้มเข้า/ออก" },
  pointBalance: { model: "PointBalance", file: "point.prisma", role: "ยอดแต้มคงเหลือ" },
  pointSettings: { model: "PointSettings", file: "point.prisma", role: "อัตราแต้ม" },
  voucher: { model: "Voucher", file: "voucher.prisma", role: "ว่อชเชอร์ (PosSale.voucherUseIds)" },
  giftCard: { model: "GiftCard", file: "giftcard.prisma", role: "บัตรของขวัญ (PosSale.giftCardId)" },
  giftCardTxn: { model: "GiftCardTxn", file: "giftcard.prisma", role: "ตัดยอดบัตร (PosSale.giftCardTxnId)" },
  stampCard: { model: "StampCard", file: "stamp.prisma", role: "บัตรสะสมดวง (PosSale.stampEventIds)" },
  // ── แกนกลางที่หน้าขายต้องมี ──
  appSystem: { model: "AppSystem", file: "app_system.prisma", role: "ระบบ (type POS/INVENTORY/ACCOUNT/MEMBER/POINT/COUPON)" },
  appSystemUnit: { model: "AppSystemUnit", file: "app_system.prisma", role: "ผูกระบบ↔สาขา (1 สาขา/1 ระบบ/ประเภท)" },
  businessUnit: { model: "BusinessUnit", file: "core.prisma", role: "สาขา/หน้าร้าน (UnitType SHOP|RESTAURANT|…)" },
  paymentProfile: { model: "PaymentProfile", file: "payment.prisma", role: "PromptPay ID ของร้าน (หน้าขายแสดง QR)" },
  outboxEvent: { model: "OutboxEvent", file: "outbox.prisma", role: "คิว pos.sale.paid / pos.sale.voided" },
  // ── P1.1a แคตตาล็อกเดียว (migration 20261120000000_pos_v2_a) — ผู้เขียนเดียว pos/catalog.ts ──
  posProduct: { model: "PosProduct", file: "pos.prisma", role: "สินค้าชั้นขาย (systemId POS · unitId? · invItemId? · kind PRODUCT/SERVICE/MENU/BUNDLE)" },
  posCategory: { model: "PosCategory", file: "pos.prisma", role: "หมวดของแคตตาล็อกขาย (backfill จาก MenuCategory)" },
  posProductOptionGroup: { model: "PosProductOptionGroup", file: "pos.prisma", role: "ผูกสินค้า↔MenuOptionGroup เดิม" },
  recipeLine: { model: "RecipeLine", file: "pos.prisma", role: "สูตร/BOM (P1.1a: เมนูที่มี MenuItem.invItemId → 1 แถว qty 1)" },
  posHeldCart: { model: "PosHeldCart", file: "pos.prisma", role: "บิลที่พักไว้ (P1.5 · HELD/RECALLED/DISCARDED · ต่อสาขา)" },
  posDocCounter: { model: "PosDocCounter", file: "pos.prisma", role: "เลขใบคืนเงิน CN${YYYYMM}-NNNN ต่อสาขา/ชนิด/เดือน (P1.8)" },
  posDevice: { model: "PosDevice", file: "pos.prisma", role: "ทะเบียนเครื่องขาย (P1.10 · ACTIVE/REVOKED · deviceCode = รหัสเครื่องของ P1.9 · printerConfig)" },
  // ── P1.11 ใบเสร็จออนไลน์ (migration 20261129000000_pos_p111_online_receipt) ──
  posReceiptIssue: { model: "PosReceiptIssue", file: "pos.prisma", role: "ลูกค้าแจ้งปัญหาบิลจาก /r/<token> (OPEN/RESOLVED · kanbanCardId · 3 ครั้ง/บิล/24 ชม.)" },
  posTaxInvoiceRequest: { model: "PosTaxInvoiceRequest", file: "pos.prisma", role: "คำขอใบกำกับภาษีเต็มรูปจาก /r/<token> (REQUESTED/ISSUED/REJECTED · P1.13 ออกเอกสาร)" },
  posPaymentIntent: { model: "PosPaymentIntent", file: "pos.prisma", role: "ใบขอรับเงิน PromptPay/Beam/บัตร (P1.7 · PENDING→PAID→CONSUMED · id pi_…)" },
  posStaffPin: { model: "PosStaffPin", file: "pos.prisma", role: "PIN พนักงานต่อสาขา (P1.15 · scrypt salt:hash · ล็อก 5 ครั้ง/15 นาที)" },
  posApprovalPayload: { model: "PosApprovalPayload", file: "pos.prisma", role: "snapshot คำขออนุมัติ POS_VOID/POS_REFUND/POS_DISCOUNT_OVER (P1.15 · requestId = ApprovalRequest.id)" },
} as const;
export type PosModelKey = keyof typeof POS_MODELS;

/** ตารางที่แผน POS จะสร้าง (POS-MIGRATION-PLAN §1) — **ยังไม่มี** ณ P0.1 · ใบที่สร้างย้ายเข้า POS_MODELS */
export const POS_FUTURE_MODELS = [
  "PosVariant", "SalesChannel", "PosProductChannelPrice", // P1.10 ย้าย PosDevice ไป POS_MODELS แล้ว · P1.1a ย้าย PosProduct/PosCategory/RecipeLine/PosProductOptionGroup ไป POS_MODELS แล้ว
  "ExternalOrder", "ExternalOrderEvent", "PosShift", "PosReceiptToken", // P1.7 ย้าย PosPaymentIntent ไป POS_MODELS แล้ว
  "PosStockCount", "PosStockCountLine", // P1.8 ย้าย PosDocCounter ไป POS_MODELS แล้ว · P1.15 ย้าย PosStaffPin ไป POS_MODELS แล้ว
] as const;

// ═══════════════════ 3. สัญญาชุดข้อมูล (seed-pos-qc ต้องสร้างให้ตรงนี้) ═══════════════════
// id ตายตัว: ขึ้นต้น `posqc` (ไม่ชนรูปแบบ cuid) · slug/อีเมลขึ้นต้น `pos-qc-`
// 🔴 ห้ามเปลี่ยน id ที่ seed ไปแล้ว — ถ้าต้องเปลี่ยน ให้เพิ่มตัวใหม่ (seed ไม่ลบของเก่า)

export const PQC_TAG = "pos-qc";

export const PQC = {
  tag: PQC_TAG,
  expectedPath: "scripts/pos-expected.json",
  shotsDir: ".qc-shots/pos",
  /** วันอ้างอิงของชุดข้อมูล (ข้อสอบห้ามผูก "วันที่ N" — X7 · ใช้เพื่อ label เท่านั้น) */
  today: "2026-10-01",
  oracleValidUntil: "2026-12-31",
  coffee: {
    tenantId: "posqc-coffee-tenant",
    name: "ร้านกาแฟคิวซี (POS QC)",
    slug: "pos-qc-coffee",
    promptpayId: "0899000000", // เบอร์ปลอมรูปแบบถูก (หน้าขายแสดง QR ได้)
    units: {
      silom: { id: "posqc-coffee-unit-silom", name: "สาขาสีลม", slug: "pos-qc-coffee-silom", type: "SHOP" },
      ari: { id: "posqc-coffee-unit-ari", name: "สาขาอารีย์", slug: "pos-qc-coffee-ari", type: "SHOP" },
    },
    /** ระบบของร้าน (1 ตัวต่อประเภท · ผูกทั้ง 2 สาขา) */
    systems: {
      POS: { id: "posqc-coffee-sys-pos", name: "ขายหน้าร้าน · POS QC" },
      INVENTORY: { id: "posqc-coffee-sys-inv", name: "สินค้า/คลัง · POS QC" },
      ACCOUNT: { id: "posqc-coffee-sys-acc", name: "บัญชี · POS QC" },
      MEMBER: { id: "posqc-coffee-sys-member", name: "สมาชิก · POS QC" },
      POINT: { id: "posqc-coffee-sys-point", name: "แต้ม · POS QC" },
    },
    users: {
      owner: { userId: "posqc-coffee-user-owner", membershipId: "posqc-coffee-mb-owner", email: "pos-qc-coffee-owner@shark.local", name: "เจ้าของร้านกาแฟ (POS QC)", role: "OWNER", units: ["*"] },
      cashier: { userId: "posqc-coffee-user-cashier", membershipId: "posqc-coffee-mb-cashier", email: "pos-qc-coffee-cashier@shark.local", name: "แคชเชียร์สีลม (POS QC)", role: "STAFF", units: ["silom"] },
    },
    member: { phone: "0899000001", name: "สมใจ ลูกค้าประจำ (POS QC)" },
  },
  resto: {
    tenantId: "posqc-resto-tenant",
    name: "ครัวคุณยายคิวซี (POS QC)",
    slug: "pos-qc-resto",
    promptpayId: null,
    units: {
      main: { id: "posqc-resto-unit-main", name: "สาขาสุขุมวิท", slug: "pos-qc-resto-main", type: "RESTAURANT" },
    },
    systems: {
      POS: { id: "posqc-resto-sys-pos", name: "ขายหน้าร้าน · POS QC" },
      INVENTORY: { id: "posqc-resto-sys-inv", name: "สินค้า/คลัง · POS QC" },
      ACCOUNT: { id: "posqc-resto-sys-acc", name: "บัญชี · POS QC" },
    },
    users: {
      owner: { userId: "posqc-resto-user-owner", membershipId: "posqc-resto-mb-owner", email: "pos-qc-resto-owner@shark.local", name: "เจ้าของครัวคุณยาย (POS QC)", role: "OWNER", units: ["*"] },
      cashier: { userId: "posqc-resto-user-cashier", membershipId: "posqc-resto-mb-cashier", email: "pos-qc-resto-cashier@shark.local", name: "แคชเชียร์ครัวคุณยาย (POS QC)", role: "STAFF", units: ["main"] },
    },
  },
  /** สิทธิ์ของแคชเชียร์ (STAFF) — ขายได้ ดูสมาชิกได้ · ไม่มี void/ตั้งราคา (ใช้ทดสอบ X3 ในใบหลัง) */
  cashierPermissions: { "pos.sale.create": true, "member.customer.read": true } as Record<string, boolean>,
} as const;

/**
 * แคตตาล็อก QC (ของวันนี้ = InvItem + AccountProduct.salePrice · เมนูร้านอาหาร = MenuItem)
 * sku = กุญแจธรรมชาติ (seed หาเจอด้วย sku แล้วไม่สร้างซ้ำ) · ราคา = สตางค์ · vatBp 0 = สินค้าไม่มี VAT
 * stock = จำนวนรับเข้าครั้งแรก (idempotencyKey ตายตัว `pos-qc-recv-<sku>`) · null = ไม่นับสต็อก
 */
export type PqcItem = {
  sku: string; name: string; kind: "PRODUCT" | "SERVICE"; priceSatang: number; costSatang: number;
  vatBp: number; barcode?: string; stock?: number | null; unitLabel?: string; note: string;
};
export const PQC_COFFEE_ITEMS: readonly PqcItem[] = [
  { sku: "PQC-CF-AMER", name: "อเมริกาโน่เย็น", kind: "PRODUCT", priceSatang: 6500, costSatang: 1800, vatBp: 700, unitLabel: "แก้ว", note: "มี VAT · ไม่นับสต็อก" },
  { sku: "PQC-CF-LATTE", name: "ลาเต้ร้อน", kind: "PRODUCT", priceSatang: 6000, costSatang: 2000, vatBp: 700, unitLabel: "แก้ว", note: "มี VAT · ไม่นับสต็อก" },
  { sku: "PQC-CF-CROIS", name: "ครัวซองต์เนยสด", kind: "PRODUCT", priceSatang: 5500, costSatang: 2500, vatBp: 700, stock: 20, unitLabel: "ชิ้น", note: "สต็อกผูกคลัง (รับเข้า 20)" },
  { sku: "PQC-CF-WATER", name: "น้ำดื่ม 600 มล.", kind: "PRODUCT", priceSatang: 1000, costSatang: 450, vatBp: 700, barcode: "8850999000015", stock: 48, unitLabel: "ขวด", note: "บาร์โค้ด EAN-13 + สต็อก" },
  { sku: "PQC-CF-EGG", name: "ไข่ไก่สด (แพ็ก 4 ฟอง)", kind: "PRODUCT", priceSatang: 2500, costSatang: 1600, vatBp: 0, unitLabel: "แพ็ก", note: "สินค้าไม่มี VAT (vatRateBp 0)" },
  { sku: "PQC-CF-FREE", name: "น้ำเปล่า (แจกฟรี)", kind: "PRODUCT", priceSatang: 0, costSatang: 0, vatBp: 700, unitLabel: "แก้ว", note: "ราคา 0 บาท" },
  { sku: "PQC-CF-GIFT", name: "ค่าบริการจัดกระเช้า", kind: "SERVICE", priceSatang: 15000, costSatang: 0, vatBp: 700, note: "บริการ (InvItem kind SERVICE · ไม่ตัดสต็อก)" },
];
export const PQC_RESTO_ITEMS: readonly PqcItem[] = [
  { sku: "PQC-RS-COKE", name: "โค้ก 325 มล.", kind: "PRODUCT", priceSatang: 2000, costSatang: 1100, vatBp: 700, barcode: "8851959132012", stock: 24, unitLabel: "กระป๋อง", note: "บาร์โค้ด + สต็อก" },
  { sku: "PQC-RS-ICE", name: "น้ำแข็งเปล่า", kind: "PRODUCT", priceSatang: 0, costSatang: 0, vatBp: 700, unitLabel: "แก้ว", note: "ราคา 0 บาท" },
];
/** เมนูร้านอาหาร (MenuItem ผ่าน `restaurant/menu.ts` · กุญแจธรรมชาติ = ชื่อในหมวด) */
export const PQC_RESTO_MENU = {
  categories: [
    { key: "single", name: "อาหารจานเดียว", nameEn: "Single dishes" },
    { key: "soup", name: "ต้ม/แกง", nameEn: "Soups & curries" },
    { key: "drink", name: "เครื่องดื่ม", nameEn: "Drinks" },
  ],
  /** station: ชื่อสถานีจาก ensureDefaultStations ("ครัว" | "เครื่องดื่ม") */
  items: [
    { category: "single", station: "ครัว", name: "ข้าวกะเพราหมูสับไข่ดาว", nameEn: "Basil pork with fried egg", basePrice: 6500, stockQty: null },
    { category: "single", station: "ครัว", name: "ผัดไทยกุ้งสด", nameEn: "Pad Thai with prawns", basePrice: 8500, stockQty: null },
    { category: "soup", station: "ครัว", name: "ต้มยำกุ้งน้ำข้น", nameEn: "Creamy tom yum goong", basePrice: 15000, stockQty: 20 },
    { category: "drink", station: "เครื่องดื่ม", name: "ชาไทยเย็น", nameEn: "Thai iced tea", basePrice: 4500, stockQty: null },
  ],
} as const;

/** หน้าที่มีอยู่จริงของ POS วันนี้ (src/app/app/sys/[id]/pos/*) — visual-pos ถ่ายชุดนี้ */
export const POS_PAGES = ["register", "sales", "products", "close", "reports", "stock", "shifts", "settings", "receipt-public"] as const; // POS P1.17 U ▸ + reports ◂ · POS P1.14 U ▸ + stock ◂ · POS P1.9 U ▸ + shifts ◂ · POS P1.10 U ▸ + settings ◂ · POS P1.11U ▸ + receipt-public (หน้าสาธารณะ /r/<token> · ไม่อยู่ใต้ /pos) ◂
export type PosPage = (typeof POS_PAGES)[number];

/** 3 ขนาดจอ (POS-MASTER-PLAN §1) */
export const POS_VIEWPORTS = [
  { name: "desktop", w: 1440, h: 900, mobile: false },
  { name: "ipad", w: 1024, h: 768, mobile: false }, // iPad แนวนอน — แตะได้ (hasTouch) แต่เลย์เอาต์เดสก์ท็อป
  { name: "mobile", w: 390, h: 844, mobile: true },
] as const;

export type PosQcTenantKey = "coffee" | "resto";
export const PQC_TENANT_IDS: readonly string[] = [PQC.coffee.tenantId, PQC.resto.tenantId];
export const PQC_EMAILS: readonly string[] = [
  ...Object.values(PQC.coffee.users).map((u) => u.email),
  ...Object.values(PQC.resto.users).map((u) => u.email),
];

// ═══════════════════ 4. helper ═══════════════════

type MinimalPrisma = {
  tenant: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  appSystem: { findMany: (a: unknown) => Promise<{ id: string; type: string }[]> };
};
export type PosScope = { tenantId: string; posSystemId: string; systems: Record<string, string> };

/** คืน scope ของร้าน QC (null = ยังไม่ได้ seed-pos-qc) — ข้อสอบใช้เป็น SKIP guard */
export async function resolvePosScope(prisma: MinimalPrisma, key: PosQcTenantKey = "coffee"): Promise<PosScope | null> {
  const def = PQC[key];
  const t = await prisma.tenant.findFirst({ where: { id: def.tenantId, slug: def.slug }, select: { id: true } });
  if (!t) return null;
  const rows = await prisma.appSystem.findMany({ where: { tenantId: t.id }, select: { id: true, type: true } });
  const systems: Record<string, string> = {};
  for (const r of rows) systems[r.type] ??= r.id;
  if (systems.POS !== def.systems.POS.id) return null;
  return { tenantId: t.id, posSystemId: def.systems.POS.id, systems };
}

/** ผลตรวจหนึ่งข้อ (ทรงเดียวกับข้อสอบชุดอื่น) */
export type PosCheck = { id: string; title: string; ok: boolean; expected: string; actual: string };

/**
 * ตัวช่วย chk() + summary ทรงบ้าน (`chk(id, title, ok, expected, actual)` · บรรทัดท้าย `JSON_SUMMARY {...}`)
 * ใช้: const q = makeChecker("qc-pos-p1.1"); q.chk(...); q.finish();  (finish คืน exit code)
 */
export function makeChecker(suite: string) {
  const checks: PosCheck[] = [];
  let skipped: string | null = null;
  return {
    checks,
    chk(id: string, title: string, ok: boolean, expected: unknown, actual: unknown): boolean {
      const c = { id, title, ok, expected: String(expected), actual: String(actual) };
      checks.push(c);
      console.log(`  ${ok ? "✅" : "❌"} [${id}] ${title}${ok ? "" : ` — expected ${c.expected} | actual ${c.actual}`}`);
      return ok;
    },
    skip(reason: string) {
      skipped = reason;
      console.log(`⏭️  SKIPPED — ${reason}`);
    },
    /** พิมพ์สรุป + คืน exit code (SKIPPED = 0 · แดงข้อเดียว = 1) */
    finish(extra: Record<string, unknown> = {}): number {
      const failed = checks.filter((c) => !c.ok);
      console.log(`\n===== ${suite} ===== ผ่าน ${checks.length - failed.length}/${checks.length}${skipped ? " (SKIPPED)" : ""}`);
      console.log(
        "JSON_SUMMARY " +
          JSON.stringify({ suite, total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.id), skipped, ...extra }),
      );
      return failed.length > 0 ? 1 : 0;
    },
  };
}

/** บาท → ข้อความ (แสดงผลใน log เท่านั้น · คำนวณด้วยสตางค์เสมอ) */
export const bahtText = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });
