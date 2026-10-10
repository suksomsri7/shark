// held-cart.ts — พักบิล / เรียกคืน ของหน้าขายใหม่ (POS P1.5 · มติ H1–H7 + มติผู้คุมงาน 4 ต.ค.)
//
// 🔴 ผู้เขียนตาราง PosHeldCart ที่เดียว · ไม่ใช่ไฟล์ "use server" (action อยู่ที่ register-actions.ts)
// 🔴 ทุกฟังก์ชัน "คืน" คำปฏิเสธ {ok:false, code, message} — ไม่ throw (ขัดข้องที่ไม่คาดคิด = INTERNAL)
// 🔴 ขอบเขต: ด่านเดียวกับหน้าขาย (registerScopeCheck: ร้าน · ระบบ POS · สาขา · เข้าสาขาได้ · pos.sale.create) แล้วกรองแถวด้วย
//    tenantId + systemId + unitId ทุกคำสั่ง ⇒ ร้านอื่น/สาขาอื่น = NOT_FOUND (ไม่บอกว่ามีอยู่)
// 🔴 ราคาในบิลพักไม่ถูกเชื่อ: ตะกร้าผ่านตัวตรวจเดียวกับ quote (registerCanonicalCart) ตอนพัก และตอนเรียกคืน (cartJson อาจถูกแก้) ·
//    ยอด/ราคาจริงมาจาก quoteRegisterCart ด้วยราคาปัจจุบันเสมอ (H3) · heldUnitPrices ใช้แค่บอก PRICE_CHANGED
// 🔴 เรียกคืน = UPDATE … WHERE id AND status='HELD' AND ยังไม่หมดอายุ — count===1 คือผู้ชนะคนเดียว (H2) · ที่เหลือ ALREADY_RECALLED
// หมดอายุ (มติ 1): HELD ที่ createdAt เก่ากว่า N×24 ชม. ⇒ DISCARDED ตอน listHeldCarts (ขี้เกียจ · ไม่มี cron) · เรียกคืนบิลหมดอายุ = NOT_FOUND
// ทิ้ง (มติ 3): สิทธิ์เดียวกับล้างบิล (pos.sale.create ที่สาขานี้) · บันทึก AuditLog ว่าใครทิ้ง (ธุรกรรมเดียวกับการเปลี่ยนสถานะ)

import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { quoteRegisterCart, quoteRegisterCartWithCap, registerCanonicalCart, registerProductsByIds, registerRefuse, registerScopeCheck, registerTableChannelId } from "./register";
import { posDeviceRevoked } from "./device"; // POS P1.10 ▸ การ์ดเครื่องที่ถูกเพิกถอน ◂
import { staffActorFromToken } from "./staff-pin"; // POS P1.15 ▸ R3 โทเคนผู้ขาย ◂
import { approvedDiscountOf } from "./pos-approval"; // POS P1.15U ▸ มติ 5 เรียกคืนบิลที่อนุมัติส่วนลดแล้ว ◂
import { REGISTER_NOTE_MAX } from "./register-shared"; // POS P2.4 ▸ หมายเหตุบรรทัดของรอบร่าง (ไปถึงครัว) ◂
import {
  HELD_CART_LABEL_MAX,
  posHeldCartExpireDays,
  type DiscardHeldCartResult,
  type HeldCartNotice,
  type HeldCartSummary,
  type HoldRegisterCartResult,
  type ListHeldCartsResult,
  type RecallHeldCartResult,
  type RegisterActor,
  type RegisterCtx,
  type RegisterQuoteInput,
  type RegisterRefusal,
  type RegisterRefusalCode,
} from "./register-shared";

type Db = PrismaClient;
type Scoped = { ctx: RegisterCtx; actor: RegisterActor };

const DAY_MS = 86_400_000;
/** รายการในลิ้นชักสูงสุด (ใหม่สุดก่อน) */
const LIST_MAX = 100;
const PREVIEW_MAX = 120;

const MSG: Partial<Record<RegisterRefusalCode, string>> = {
  NOT_FOUND: "ไม่พบบิลที่พักนี้ (อาจถูกทิ้ง หมดอายุ หรือเป็นของสาขาอื่น)",
  VALIDATION: "ข้อมูลบิลที่พักไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  ALREADY_RECALLED: "บิลที่พักนี้ถูกเรียกคืนไปแล้ว (อาจจากอีกเครื่อง)",
  INTERNAL: "ระบบพักบิลขัดข้องชั่วคราว — ลองอีกครั้ง",
  DEVICE_REVOKED: "เครื่องนี้ถูกเพิกถอนแล้ว — พัก/เรียกคืนบิลไม่ได้ ติดต่อผู้จัดการ",
  STAFF_TOKEN_INVALID: "การเข้าใช้งานของพนักงานบนเครื่องนี้หมดอายุหรือไม่ถูกต้อง — ใส่ PIN อีกครั้ง",
};
const refuse = (code: RegisterRefusalCode, message?: string): RegisterRefusal => ({ ok: false, code, message: message ?? MSG[code] ?? "ทำรายการไม่ได้" });
const isRefusal = (v: unknown): v is RegisterRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/held-cart] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

async function scope(db: Db, ctx: RegisterCtx, actor: RegisterActor): Promise<Scoped | RegisterRefusal> {
  const s = await registerScopeCheck(ctx, actor, db);
  return s.ok ? { ctx: s.ctx, actor: s.actor } : s;
}
/** POS P1.10 ▸ R2: ctx.deviceId (ดิบ — registerScopeCheck ไม่ส่งต่อ) เป็นเครื่องที่ถูกเพิกถอนของสาขานี้ = DEVICE_REVOKED · ไม่ส่ง/ไม่ลงทะเบียน = ผ่าน ◂ */
async function revokedDevice(db: Db, ctx: unknown, s: Scoped): Promise<RegisterRefusal | null> {
  const code = isRecord(ctx) ? ctx.deviceId : undefined;
  return (await posDeviceRevoked(db, s.ctx.tenantId, s.ctx.unitId, code)) ? refuse("DEVICE_REVOKED") : null;
}
const rowWhere = (s: Scoped) => ({ tenantId: s.ctx.tenantId, systemId: s.ctx.systemId, unitId: s.ctx.unitId });
/**
 * POS P1.15 ▸ R3: staffToken (ไม่ส่ง = ผู้ใช้ session เดิม) → ขอบเขตของคนในโทเคน (heldBy/recalledBy + เพดานส่วนลดของเขา) ·
 * ผิด/หมดอายุ/เครื่องอื่น/ถูกถอดสิทธิ์ = STAFF_TOKEN_INVALID (ไม่ถอยไปใช้ session เงียบ ๆ) ◂
 */
async function tokenScope(db: Db, ctx: unknown, s: Scoped, token: unknown): Promise<Scoped | RegisterRefusal> {
  if (token === undefined || token === null) return s;
  const deviceId = isRecord(ctx) ? ctx.deviceId : undefined;
  const a = await staffActorFromToken({ tenantId: s.ctx.tenantId, unitId: s.ctx.unitId, deviceId }, token, db);
  const t = a ? await scope(db, s.ctx, a) : null;
  return t && !isRefusal(t) ? t : refuse("STAFF_TOKEN_INVALID");
}

/** N วันของระบบ POS นี้ (settings.pos.heldCart.expireDays · จำนวนเต็ม 1–365) — ไม่ตั้ง/ผิดรูป = HELD_CART_EXPIRE_DAYS */
async function expireCutoff(db: Db, s: Scoped): Promise<Date> {
  return (await expireOf(db, s)).cutoff;
}
async function expireOf(db: Db, s: Scoped): Promise<{ days: number; cutoff: Date }> {
  const sys = await db.appSystem.findFirst({ where: { id: s.ctx.systemId, tenantId: s.ctx.tenantId }, select: { settings: true } });
  const days = posHeldCartExpireDays(sys?.settings); // POS P1.18 ▸ R3 ตัวอ่านเดียว (register-shared) ◂
  return { days, cutoff: new Date(Date.now() - days * DAY_MS) };
}

/** ป้าย: undefined/null/ว่าง = null · ไม่ใช่สตริง / เกิน 60 ตัวอักษร / มี NUL หรือ surrogate เดี่ยว = undefined (VALIDATION) */
function cleanLabel(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  if (/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t) || [...t].length > HELD_CART_LABEL_MAX) return undefined;
  return t;
}

/** สิ่งที่เก็บใน cartJson — cart = รูปมาตรฐานที่ตรวจแล้ว · heldUnitPrices = ราคาต่อหน่วยจาก quote ตอนพัก (ไว้เทียบเท่านั้น) */
type Stored = { cart: RegisterQuoteInput; heldUnitPrices: number[]; preview: string };

type Row = { id: string; label: string | null; lineCount: number; approxTotalSatang: number; heldByUserId: string; createdAt: Date; cartJson: Prisma.JsonValue };
async function summaries(db: Db, rows: Row[]): Promise<HeldCartSummary[]> {
  const ids = [...new Set(rows.map((r) => r.heldByUserId))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const j = r.cartJson as { preview?: unknown } | null;
    return {
      id: r.id,
      label: r.label,
      lineCount: r.lineCount,
      approxTotalSatang: r.approxTotalSatang,
      heldByUserId: r.heldByUserId,
      heldByName: nameOf.get(r.heldByUserId) ?? null,
      preview: typeof j?.preview === "string" ? j.preview.slice(0, PREVIEW_MAX) : "",
      createdAt: r.createdAt.toISOString(),
    };
  });
}
const ROW_SELECT = { id: true, label: true, lineCount: true, approxTotalSatang: true, heldByUserId: true, createdAt: true, cartJson: true } as const;

// ═══════════════════ พักบิล ═══════════════════
// POS P2.4 ▸ tableSessionId (พี่น้องของ cart · CONTROLLER-DECISION 6) = รอบร่างของโต๊ะ (holdTableDraft) · ไม่ส่ง = บิลพักปกติเหมือนเดิมทุกไบต์ ·
//   คีย์อื่นที่ไม่รู้จักของ input ยังถูกเมินเหมือนเดิม (drift ของ P1.5 · โน้ต P2.4) ◂
export async function holdRegisterCart(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { cart: RegisterQuoteInput; label?: string | null; staffToken?: string | null; tableSessionId?: string | null; expectedVersion?: number | null; heldCartId?: string | null; newDraft?: boolean | null },
  client?: Db,
): Promise<HoldRegisterCartResult> {
  return guard("holdRegisterCart", async (): Promise<HoldRegisterCartResult> => {
    const db: Db = client ?? prisma;
    const s0 = await scope(db, ctx, actor);
    if (isRefusal(s0)) return s0;
    const revoked = await revokedDevice(db, ctx, s0);
    if (revoked) return revoked;
    if (!isRecord(input)) return refuse("VALIDATION");
    const s = await tokenScope(db, ctx, s0, input.staffToken);
    if (isRefusal(s)) return s;
    const label = cleanLabel(input.label);
    if (label === undefined) return refuse("VALIDATION", `ป้ายบิลต้องเป็นข้อความไม่เกิน ${HELD_CART_LABEL_MAX} ตัวอักษร`);
    // POS P2.4 ▸ รอบร่างของโต๊ะ ◂
    if (input.tableSessionId !== undefined && input.tableSessionId !== null) return holdTableDraft(db, s, input.cart, input.tableSessionId, label, input);
    const row = await holdCore(db, s, input.cart, label, undefined);
    if (isRefusal(row)) return row;
    const [heldCart] = await summaries(db, [row]);
    return { ok: true, heldCart: heldCart! };
  });
}

/**
 * POS P1.15 ▸ R4/R5: พักบิลส่วนลดเกินสิทธิ์ไว้รออนุมัติ POS_DISCOUNT_OVER (ภายในเท่านั้น — ผู้เรียก: register.ts#submitRegisterSale) ·
 * ตรวจครบแบบ quote ยกเว้นเพดานส่วนลด (คำขออนุมัติคือการขอเกินเพดาน) · heldBy = ผู้ขาย ◂
 */
export async function holdCartForApproval(ctx: RegisterCtx, actor: RegisterActor, cartRaw: unknown, client?: Db, opts?: { id?: string }): Promise<{ ok: true; id: string } | RegisterRefusal> {
  return guard("holdCartForApproval", async (): Promise<{ ok: true; id: string } | RegisterRefusal> => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor);
    if (isRefusal(s)) return s;
    // POS P1.18 ▸ K3 (F5 ที่เหลือ): ผู้เรียกส่ง id ที่คิดจากคีย์ส่งบิล ⇒ ส่งพร้อมกันคีย์เดียว = แถวเดียว (ตัวที่ชนคีย์หลักใช้แถวของผู้ชนะ) ◂
    try {
      const row = await holdCore(db, s, cartRaw, "รออนุมัติส่วนลด", null, opts?.id);
      return isRefusal(row) ? row : { ok: true, id: row.id };
    } catch (e) {
      if (!opts?.id || (e as { code?: unknown } | null)?.code !== "P2002") throw e;
      // POS P1.18 ▸ F9: ใช้แถวของผู้ชนะได้เฉพาะที่ยัง HELD และยังไม่หมดอายุ — ถูกทิ้ง/เรียกคืน/หมดอายุแล้ว (ส่งซ้ำคีย์เดิมทีหลัง)
      //   = ปฏิเสธแบบบิลที่ไม่มีอยู่ (NOT_FOUND) ไม่ผูกคำขออนุมัติใหม่กับบิลที่ตายแล้ว ◂
      const cutoff = await expireCutoff(db, s);
      const won = await db.posHeldCart.findFirst({ where: { id: opts.id, ...rowWhere(s), status: "HELD", createdAt: { gte: cutoff } }, select: { id: true } });
      if (!won) return refuse("NOT_FOUND");
      return { ok: true, id: won.id };
    }
  });
}

/**
 * POS P1.15 ▸ R6: ตัวรับคิวผูกคำขอ POS_DISCOUNT_OVER ที่อนุมัติแล้วกับบิลพัก — เขียนครั้งเดียว (approvedRequestId ยังว่าง) ⇒ เล่นซ้ำไม่เปิดสิทธิ์ใหม่ ◂
 */
export async function armHeldCartApproval(tenantId: string, heldCartId: string, requestId: string, client?: Db): Promise<boolean> {
  const db: Db = client ?? prisma;
  const r = await db.posHeldCart.updateMany({ where: { id: heldCartId, tenantId, approvedRequestId: null }, data: { approvedRequestId: requestId } });
  return r.count === 1;
}

/** ตะกร้า → แถวบิลพัก (ตัวตรวจเดียวกับ quote) · maxDiscountBp: undefined = เพดานของผู้ขาย · null = ไม่จำกัด (รออนุมัติ) */
async function holdCore(db: Db, s: Scoped, cartRaw: unknown, label: string | null, maxDiscountBp: null | undefined, id?: string): Promise<Row | RegisterRefusal> {
  const cart = registerCanonicalCart(cartRaw);
  if (isRefusal(cart)) return cart;
  if (!cart.lines.length) return refuse("VALIDATION", "ตะกร้าว่าง — ไม่มีอะไรให้พัก");
  // ตรวจครบแบบ quote (สินค้าขายได้ที่สาขานี้ · สิทธิ์ราคาเอง · เพดานส่วนลด · สมาชิก) — ยอดที่เก็บ = ยอดของเซิร์ฟเวอร์
  const q = maxDiscountBp === undefined ? await quoteRegisterCart(s.ctx, s.actor, cart, db) : await quoteRegisterCartWithCap(s.ctx, s.actor, cart, maxDiscountBp, db);
  if (!q.ok) return q;
  const productIds = [...new Set(cart.lines.flatMap((l) => ("productId" in l && typeof l.productId === "string" ? [l.productId] : [])))];
  const names = new Map(
    productIds.length ? (await db.posProduct.findMany({ where: { id: { in: productIds }, tenantId: s.ctx.tenantId }, select: { id: true, name: true } })).map((p) => [p.id, p.name]) : [],
  );
  const preview = cart.lines
    .map((l) => {
      const nm = "productId" in l && typeof l.productId === "string" ? (names.get(l.productId) ?? "-") : (l as { name: string }).name;
      return l.qty > 1 ? `${nm} ×${l.qty}` : nm;
    })
    .join(" · ")
    .slice(0, PREVIEW_MAX);
  const stored: Stored = { cart, heldUnitPrices: q.lines.map((l) => l.unitPriceSatang), preview };
  return db.posHeldCart.create({
    data: {
      ...(id ? { id } : {}), // POS P1.18 ▸ K3 ◂
      ...rowWhere(s),
      label,
      cartJson: stored as unknown as Prisma.InputJsonValue,
      lineCount: cart.lines.length,
      approxTotalSatang: q.grandTotalSatang,
      heldByUserId: s.actor.userId,
    },
    select: ROW_SELECT,
  });
}

// ═══════════════════ POS P2.4 ▸ รอบร่างของโต๊ะ (R4 · CD6) ═══════════════════
// รอบร่าง = บิลพักที่ผูก TableSession (HELD ≤ 1 แถวต่อ session = partial unique) · พักซ้ำ = แก้แถวเดิม (version + 1) ·
// ตะกร้า = บรรทัดสินค้า/รายการกำหนดเองเท่านั้น (คูปอง · สิทธิ์ที่เลือก · ส่วนลดท้ายบิล/บรรทัด · สมาชิก · ช่องทาง · สินค้าชั่ง = VALIDATION) ·
// หมายเหตุบรรทัดถูกเก็บ (ไปถึงครัวตอนส่งรอบ) · ลำดับปฏิเสธ: ขอบเขต (TABLE_NOT_FOUND) → รูปตะกร้า (VALIDATION) → session ไม่ OPEN (TABLE_SESSION_CLOSED)
// ปฏิเสธ = ไม่เขียนอะไร · ราคาที่เก็บ = quote ของเซิร์ฟเวอร์บนช่องทางของโต๊ะ (แสดงอย่างเดียว · ราคาจริงคิดตอนส่งครัว)
/** POS P2.4 ▸ fix 3 N1: ข้อความของ VALIDATION เมื่อไม่ระบุร่าง (จอใช้ pos.tables.errors.draftModeRequired) ◂ */
const DRAFT_MODE_REQUIRED = "ต้องระบุร่างและรุ่นของร่าง";
const DRAFT_FORBIDDEN_KEYS = ["couponCode", "memberChoices", "billDiscount", "memberId", "channelId", "tableSessionId"] as const;
async function holdTableDraft(
  db: Db,
  s: Scoped,
  cartRaw: unknown,
  tableSessionIdRaw: unknown,
  label: string | null,
  opt: { expectedVersion?: unknown; heldCartId?: unknown; newDraft?: unknown },
): Promise<HoldRegisterCartResult> {
  if (typeof tableSessionIdRaw !== "string" || !tableSessionIdRaw || tableSessionIdRaw.length > 200) return refuse("VALIDATION", "รหัสโต๊ะไม่ถูกต้อง");
  // POS P2.4 ▸ fix 2 F1: โหมดของการพัก — newDraft:true = สร้างรอบร่างใหม่ (ต้องไม่มี HELD อยู่) · heldCartId/expectedVersion = แก้รอบร่างเดิมแบบมีเงื่อนไข
  //   (ไม่ตรง/ถูกส่งครัว/ถูกทิ้ง = VERSION_CHANGED · ไม่มีวันสร้างแถวใหม่) ◂
  // POS P2.4 ▸ fix 3 N1 N2: ต้องระบุโหมดเสมอ — ไม่ส่ง newDraft และไม่ส่ง heldCartId+expectedVersion = VALIDATION · heldCartId ต้องคู่ expectedVersion
  //   (ทาง "แก้หรือสร้าง" แบบไม่ระบุร่างของ fix 1 ถูกลบ: เขียนทับร่างของอีกเครื่อง / สร้างร่างซ้ำหลังส่งครัว) ◂
  const ev = opt.expectedVersion;
  const hid = opt.heldCartId;
  const nd = opt.newDraft;
  if (ev !== undefined && ev !== null && !(typeof ev === "number" && Number.isInteger(ev) && ev >= 1)) return refuse("VALIDATION", "เวอร์ชันของรอบร่างไม่ถูกต้อง");
  if (hid !== undefined && hid !== null && !(typeof hid === "string" && hid.length > 0 && hid.length <= 200)) return refuse("VALIDATION", "รหัสรอบร่างไม่ถูกต้อง");
  if (nd !== undefined && nd !== null && typeof nd !== "boolean") return refuse("VALIDATION");
  const expectVersion = typeof ev === "number" ? ev : null;
  const draftId = typeof hid === "string" ? hid : null;
  const newDraft = nd === true;
  if (newDraft && (expectVersion !== null || draftId !== null)) return refuse("VALIDATION", "สร้างรอบร่างใหม่ไม่ต้องส่งรหัส/เวอร์ชันของรอบร่างเดิม");
  const rest = await import("@/lib/modules/restaurant");
  const sess = await rest.tableSessionForPos(db, { tenantId: s.ctx.tenantId, unitId: s.ctx.unitId, sessionId: tableSessionIdRaw });
  if (!sess) return registerRefuse("TABLE_NOT_FOUND");
  if (!isRecord(cartRaw)) return refuse("VALIDATION");
  if (!newDraft && (draftId === null || expectVersion === null)) return registerRefuse("VALIDATION", DRAFT_MODE_REQUIRED); // POS P2.4 ▸ fix 3 N1 N2 ◂
  for (const k of DRAFT_FORBIDDEN_KEYS) if (cartRaw[k] !== undefined && cartRaw[k] !== null) return refuse("VALIDATION", "รอบร่างของโต๊ะเก็บได้เฉพาะรายการ — ส่วนลด คูปอง สมาชิก ใส่ตอนเช็คบิล");
  const rawLines = Array.isArray(cartRaw.lines) ? (cartRaw.lines as unknown[]) : null;
  if (!rawLines) return refuse("VALIDATION");
  for (const l of rawLines) {
    if (!isRecord(l)) return refuse("VALIDATION");
    if ((l.discount !== undefined && l.discount !== null) || (l.weighedBarcode !== undefined && l.weighedBarcode !== null) || (l.weightGrams !== undefined && l.weightGrams !== null)) {
      return refuse("VALIDATION", "รอบร่างของโต๊ะใส่ส่วนลดรายการหรือสินค้าชั่งไม่ได้");
    }
  }
  const canon = registerCanonicalCart({ lines: rawLines });
  if (isRefusal(canon)) return canon;
  if (!canon.lines.length) return refuse("VALIDATION", "ตะกร้าว่าง — ไม่มีอะไรให้พัก");
  // หมายเหตุบรรทัด (ตรวจรูปแล้วโดย registerCanonicalCart → regParseCart) ไปกับรอบร่าง
  const cart: RegisterQuoteInput = {
    lines: canon.lines.map((l, i) => {
      const n = (rawLines[i] as Record<string, unknown>).note;
      return typeof n === "string" && n.trim() && n.length <= REGISTER_NOTE_MAX ? { ...l, note: n } : l;
    }),
  };
  if (sess.status !== "OPEN") return registerRefuse("TABLE_SESSION_CLOSED");
  const channelId = await registerTableChannelId(db, s.ctx, sess.openedByUserId === null);
  const q = await quoteRegisterCart(s.ctx, s.actor, { ...cart, ...(channelId ? { channelId } : {}) }, db);
  if (!q.ok) return q;
  const productIds = [...new Set(cart.lines.flatMap((l) => ("productId" in l && typeof l.productId === "string" ? [l.productId] : [])))];
  const names = new Map(
    productIds.length ? (await db.posProduct.findMany({ where: { id: { in: productIds }, tenantId: s.ctx.tenantId }, select: { id: true, name: true } })).map((p) => [p.id, p.name]) : [],
  );
  const preview = cart.lines
    .map((l) => {
      const nm = "productId" in l && typeof l.productId === "string" ? (names.get(l.productId) ?? "-") : (l as { name: string }).name;
      return l.qty > 1 ? `${nm} ×${l.qty}` : nm;
    })
    .join(" · ")
    .slice(0, PREVIEW_MAX);
  const stored: Stored = { cart, heldUnitPrices: q.lines.map((l) => l.unitPriceSatang), preview };
  const data = { cartJson: stored as unknown as Prisma.InputJsonValue, lineCount: cart.lines.length, approxTotalSatang: q.grandTotalSatang, label };
  const where = { ...rowWhere(s), tableSessionId: sess.id, status: "HELD" as const };
  // POS P2.4 ▸ fix 2 F1 ◂
  const done = async (id: string): Promise<HoldRegisterCartResult> => {
    const row = await db.posHeldCart.findFirst({ where: { ...rowWhere(s), id }, select: { ...ROW_SELECT, version: true } });
    if (!row) return registerRefuse("VERSION_CHANGED");
    const { version, ...rest } = row;
    const [heldCart] = await summaries(db, [rest]);
    return { ok: true, heldCart: heldCart!, draftVersion: version };
  };
  if (newDraft) {
    if (await db.posHeldCart.findFirst({ where, select: { id: true } })) return registerRefuse("VERSION_CHANGED");
    try {
      const c = await db.posHeldCart.create({ data: { ...rowWhere(s), ...data, tableSessionId: sess.id, heldByUserId: s.actor.userId }, select: { id: true } });
      return done(c.id);
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code === "P2002") return registerRefuse("VERSION_CHANGED"); // อีกเครื่องสร้างพร้อมกัน
      throw e;
    }
  }
  // แก้ร่างเดิม: ต้องตรงทั้ง id และเวอร์ชัน (updateMany แบบมีเงื่อนไข — สองเครื่องเวอร์ชันเดียวกัน = ผู้ชนะคนเดียว)
  const cond = { ...where, id: draftId as string, version: expectVersion as number };
  const upd = await db.posHeldCart.updateMany({ where: cond, data: { ...data, heldByUserId: s.actor.userId, version: { increment: 1 } } });
  if (upd.count !== 1) return registerRefuse("VERSION_CHANGED");
  return done(draftId as string);
}

/**
 * POS P2.4 ▸ R5: ยึดรอบร่างเพื่อส่งครัว (ในธุรกรรมของผู้ส่ง — ยึด + สร้างออเดอร์ = ธุรกรรมเดียว): HELD → RECALLED ผู้ชนะคนเดียว ·
 * expectVersion ≠ ปัจจุบัน (ถูกพักซ้ำระหว่างคิดราคา) = VERSION_CHANGED (ผู้เรียกคิดราคาใหม่) · RECALLED = ALREADY_RECALLED · ไม่พบ/ทิ้งแล้ว/โต๊ะอื่น = NOT_FOUND ◂
 */
export async function claimTableDraftInTx(
  tx: Prisma.TransactionClient,
  s: { tenantId: string; systemId: string; unitId: string; tableSessionId: string; heldCartId: string; userId: string; expectVersion: number },
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "ALREADY_RECALLED" | "VERSION_CHANGED" }> {
  const where = { id: s.heldCartId, tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: s.tableSessionId };
  const won = await tx.posHeldCart.updateMany({
    where: { ...where, status: "HELD", version: s.expectVersion },
    data: { status: "RECALLED", recalledAt: new Date(), recalledByUserId: s.userId, version: { increment: 1 } },
  });
  if (won.count === 1) return { ok: true };
  const now = await tx.posHeldCart.findFirst({ where, select: { status: true } });
  if (!now || now.status === "DISCARDED") return { ok: false, code: "NOT_FOUND" };
  return { ok: false, code: now.status === "RECALLED" ? "ALREADY_RECALLED" : "VERSION_CHANGED" };
}

/** POS P2.4 ▸ รอบร่างของโต๊ะ (อ่าน): แถว HELD ของ session — cart = ตะกร้าที่ตรวจแล้วตอนพัก (ผู้ใช้ต้องผ่านตัวตรวจอีกรอบก่อนใช้) ◂ */
export async function tableDraftOf(
  client: Db | Prisma.TransactionClient,
  s: { tenantId: string; systemId: string; unitId: string; tableSessionId: string; heldCartId?: string },
): Promise<{ id: string; version: number; lineCount: number; approxTotalSatang: number; cart: unknown; heldByUserId: string; createdAt: Date; status: "HELD" | "RECALLED" | "DISCARDED" } | null> {
  const r = await client.posHeldCart.findFirst({
    where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: s.tableSessionId, ...(s.heldCartId ? { id: s.heldCartId } : { status: "HELD" }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, version: true, lineCount: true, approxTotalSatang: true, cartJson: true, heldByUserId: true, createdAt: true, status: true },
  });
  if (!r) return null;
  const j = r.cartJson as { cart?: unknown } | null;
  return { id: r.id, version: r.version, lineCount: r.lineCount, approxTotalSatang: r.approxTotalSatang, cart: j?.cart ?? null, heldByUserId: r.heldByUserId, createdAt: r.createdAt, status: r.status };
}

/** POS P2.4 ▸ R9 (CONTROLLER-DECISION 8): ปิดโต๊ะ ⇒ รอบร่าง HELD ของ session = DISCARDED + audit pos.heldCart.discard (ธุรกรรมเดียวกับการปิดโต๊ะ) ◂ */
export async function discardTableDraftsInTx(
  tx: Prisma.TransactionClient,
  s: { tenantId: string; systemId: string; unitId: string; tableSessionId: string; actorUserId: string },
): Promise<number> {
  const where = { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, tableSessionId: s.tableSessionId, status: "HELD" as const };
  const rows = await tx.posHeldCart.findMany({ where, select: { id: true, label: true, heldByUserId: true, lineCount: true, approxTotalSatang: true } });
  let n = 0;
  for (const r of rows) {
    const u = await tx.posHeldCart.updateMany({ where: { ...where, id: r.id }, data: { status: "DISCARDED", version: { increment: 1 } } });
    if (u.count !== 1) continue;
    n++;
    const { id, ...before } = r;
    await tx.auditLog.create({
      data: {
        tenantId: s.tenantId,
        unitId: s.unitId,
        actorType: "USER",
        actorId: s.actorUserId,
        action: "pos.heldCart.discard",
        targetType: "PosHeldCart",
        targetId: id,
        before: { status: "HELD", ...before } as Prisma.InputJsonValue,
        after: { status: "DISCARDED", via: "table_closed", tableSessionId: s.tableSessionId } as Prisma.InputJsonValue,
      },
    });
  }
  return n;
}

/** POS P2.4 ▸ R2: จำนวนบรรทัดของรอบร่าง HELD ต่อ session (การ์ด "ยังไม่ส่งครัว N รายการ") ◂ */
export async function tableDraftLineCounts(client: Db, s: { tenantId: string; systemId: string; unitId: string; sessionIds: string[] }): Promise<Map<string, number>> {
  if (!s.sessionIds.length) return new Map();
  const rows = await client.posHeldCart.findMany({
    where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, status: "HELD", tableSessionId: { in: s.sessionIds } },
    select: { tableSessionId: true, lineCount: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r.tableSessionId) out.set(r.tableSessionId, (out.get(r.tableSessionId) ?? 0) + r.lineCount);
  return out;
}

// ═══════════════════ รายการ (+ หมดอายุแบบขี้เกียจ) ═══════════════════
export async function listHeldCarts(ctx: RegisterCtx, actor: RegisterActor, client?: Db): Promise<ListHeldCartsResult> {
  return guard("listHeldCarts", async (): Promise<ListHeldCartsResult> => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor);
    if (isRefusal(s)) return s;
    const { days, cutoff } = await expireOf(db, s);
    // POS P2.4 ▸ รอบร่างของโต๊ะ (tableSessionId) ไม่อยู่ในลิ้นชัก และไม่หมดอายุแบบบิลพัก (อยู่กับโต๊ะจนส่งครัว/ปิดโต๊ะ) ◂
    await db.posHeldCart.updateMany({
      where: { ...rowWhere(s), status: "HELD", createdAt: { lt: cutoff }, tableSessionId: null },
      data: { status: "DISCARDED", version: { increment: 1 } },
    });
    const rows = await db.posHeldCart.findMany({
      where: { ...rowWhere(s), status: "HELD", createdAt: { gte: cutoff }, tableSessionId: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIST_MAX,
      select: ROW_SELECT,
    });
    const items = await summaries(db, rows);
    return { ok: true, items, count: items.length, expireDays: days };
  });
}

// ═══════════════════ เรียกคืน (ผู้ชนะคนเดียว + ราคาปัจจุบัน) ═══════════════════
const idOf = (input: unknown): string | null => {
  const id = isRecord(input) ? input.id : undefined;
  return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
};

export async function recallHeldCart(ctx: RegisterCtx, actor: RegisterActor, input: { id: string; staffToken?: string | null }, client?: Db): Promise<RecallHeldCartResult> {
  return guard("recallHeldCart", async (): Promise<RecallHeldCartResult> => {
    const db: Db = client ?? prisma;
    const s0 = await scope(db, ctx, actor);
    if (isRefusal(s0)) return s0;
    const revoked = await revokedDevice(db, ctx, s0);
    if (revoked) return revoked;
    const s = await tokenScope(db, ctx, s0, isRecord(input) ? input.staffToken : undefined);
    if (isRefusal(s)) return s;
    const id = idOf(input);
    if (!id) return refuse("NOT_FOUND");
    // POS P2.4 ▸ fix 2 F5: รอบร่างของโต๊ะเรียกคืนจากลิ้นชักไม่ได้ (NOT_FOUND · ทางของโต๊ะ = holdTableDraft/ส่งครัว) ◂
    const row = await db.posHeldCart.findFirst({ where: { id, ...rowWhere(s), tableSessionId: null }, select: { status: true, createdAt: true, cartJson: true, approvedRequestId: true } });
    if (!row || row.status === "DISCARDED") return refuse("NOT_FOUND");
    if (row.status === "RECALLED") return refuse("ALREADY_RECALLED");
    const cutoff = await expireCutoff(db, s);
    if (row.createdAt < cutoff) return refuse("NOT_FOUND");
    // cartJson อาจถูกแก้ใน DB — ผ่านตัวตรวจเดิมอีกรอบ (ราคาแคตตาล็อกถูกตัดทิ้ง) · พังจนอ่านไม่ได้ = VALIDATION ไม่เปลี่ยนสถานะ
    const j = row.cartJson as { cart?: unknown; heldUnitPrices?: unknown } | null;
    const cart = registerCanonicalCart(j?.cart);
    if (isRefusal(cart) || !cart.lines.length) return refuse("VALIDATION", "บิลที่พักนี้อ่านไม่ได้ — ทิ้งแล้วเปิดบิลใหม่");
    const held = Array.isArray(j?.heldUnitPrices) ? (j.heldUnitPrices as unknown[]) : [];

    // POS P1.15U ▸ มติ 5: ส่วนลดที่อนุมัติแล้ว (ยังไม่ถูกใช้) ⇒ quote ด้วยเพดานที่อนุมัติ + คืน approvedRequestId (จอส่ง heldCartId ตอนชำระ) ◂
    const ap = row.approvedRequestId ? await approvedDiscountOf(s.ctx.tenantId, row.approvedRequestId, "") : null;
    const quote = ap ? await quoteRegisterCartWithCap(s.ctx, s.actor, cart, ap.discountBp >= 10_000 ? null : ap.discountBp, db) : await quoteRegisterCart(s.ctx, s.actor, cart, db);
    const notices: HeldCartNotice[] = [];
    // ราคาปัจจุบันต่อบรรทัดสินค้าแคตตาล็อก (ไม่ใช่ราคาเปิด) — quote ทั้งบิลผ่าน = ใช้เลย · ไม่ผ่าน = ถามทีละบรรทัดที่เหลือ
    const catalogIdx = cart.lines.flatMap((l, i) => ("productId" in l && typeof l.productId === "string" && l.openPrice !== true ? [i] : []));
    const current = new Map<number, number>();
    if (quote.ok) {
      for (const i of catalogIdx) current.set(i, quote.lines[i]!.unitPriceSatang);
    } else {
      // ชุดตรวจ: เฉพาะบรรทัดแคตตาล็อก ไม่มีส่วนลด/สมาชิก ⇒ ปฏิเสธได้แค่เพราะ "สินค้าขายไม่ได้" รายบรรทัด · ตัดบรรทัดเสียทีละบรรทัด
      let probe = [...catalogIdx];
      for (let n = 0; probe.length && n <= catalogIdx.length; n++) {
        // POS P1.2: บรรทัดทดสอบพกตัวเลือก/ป้ายชั่ง/น้ำหนักเดิม (ไม่งั้นสินค้าที่มีกลุ่มบังคับ/สินค้าชั่งถูกตีว่า "ขายไม่ได้")
        const lines = probe.map((i) => {
          const l = cart.lines[i] as { productId: string; qty: number; options?: { choiceId: string }[]; weighedBarcode?: string; weightGrams?: number };
          return {
            productId: l.productId,
            qty: l.qty,
            ...(l.options ? { options: l.options } : {}),
            ...(l.weighedBarcode !== undefined ? { weighedBarcode: l.weighedBarcode } : {}),
            ...(l.weightGrams !== undefined ? { weightGrams: l.weightGrams } : {}),
          };
        });
        // POS P2.2 ▸ R9 (บั๊ก :292): ตะกร้าทดสอบพกช่องทางของบิลพัก (cart.channelId) — ไม่งั้นบิล LINE MAN ถูกคิดราคาหน้าร้าน = PRICE_CHANGED ปลอม ◂
        const q = await quoteRegisterCart(s.ctx, s.actor, { lines, ...(cart.channelId ? { channelId: cart.channelId } : {}) }, db);
        if (q.ok) {
          probe.forEach((i, k) => current.set(i, q.lines[k]!.unitPriceSatang));
          break;
        }
        const k = q.lineIndex;
        if (typeof k !== "number" || k < 0 || k >= probe.length) break;
        // P1.2 R2 F5: ปฏิเสธเพราะสิทธิ์ล้วน (น้ำหนักกรอกเอง) = "ต้องมีสิทธิ์" ไม่ใช่ "ขายไม่ได้แล้ว"
        notices.push({ lineIndex: probe[k]!, code: q.code === "PRODUCT_NOT_FOUND" ? "PRODUCT_NOT_FOUND" : q.code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : "PRODUCT_UNAVAILABLE" });
        probe = probe.filter((_, x) => x !== k);
      }
    }
    for (const i of catalogIdx) {
      const was = held[i];
      const now = current.get(i);
      if (typeof was === "number" && typeof now === "number" && was !== now) notices.push({ lineIndex: i, code: "PRICE_CHANGED", heldUnitPriceSatang: was, unitPriceSatang: now });
    }
    notices.sort((a, b) => a.lineIndex - b.lineIndex);
    const productIds = catalogIdx.map((i) => (cart.lines[i] as { productId: string }).productId);
    const products = await registerProductsByIds(s.ctx, s.actor, productIds, db);
    // ชื่อของทุกบรรทัดสินค้า (รวมที่เก็บถาวร/ปิดขาย) — จอแสดงชื่อบรรทัดที่ต้องเอาออกได้ · กรองร้านนี้เท่านั้น
    const nameRows = productIds.length ? await db.posProduct.findMany({ where: { id: { in: [...new Set(productIds)] }, tenantId: s.ctx.tenantId }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(nameRows.map((r) => [r.id, r.name]));
    const lineNames = cart.lines.map((l) => ("productId" in l && typeof l.productId === "string" ? (nameOf.get(l.productId) ?? null) : null));
    // R2: งานอ่านอย่างเดียวทั้งหมด (quote · probe · ชื่อสินค้า) ทำก่อน — UPDATE ผู้ชนะคนเดียวเป็นคำสั่งสุดท้าย
    //     อะไรข้างบนล้ม = แถวยัง HELD (ไม่มีบิลหายแบบ RECALLED ไร้เจ้าของ)
    const won = await db.posHeldCart.updateMany({
      where: { id, ...rowWhere(s), status: "HELD", createdAt: { gte: cutoff }, tableSessionId: null }, // POS P2.4 ▸ fix 2 F5 ◂
      data: { status: "RECALLED", recalledAt: new Date(), recalledByUserId: s.actor.userId, version: { increment: 1 } },
    });
    if (won.count !== 1) {
      const now = await db.posHeldCart.findFirst({ where: { id, ...rowWhere(s) }, select: { status: true } });
      return refuse(now?.status === "RECALLED" ? "ALREADY_RECALLED" : "NOT_FOUND");
    }
    return { ok: true, heldCartId: id, cart, quote, notices, products, lineNames, ...(ap ? { approvedRequestId: ap.requestId } : {}) };
  });
}

/**
 * POS P1.15U ▸ มติ 5: คำขอ POS_DISCOUNT_OVER ถูกปฏิเสธ ⇒ ทิ้งบิลพักที่รออนุมัติ (ตัวรับคิวเรียก · ไม่มี actor ของ session) ·
 * เฉพาะแถวที่ยัง HELD ⇒ เล่นซ้ำไม่มี audit ที่สอง · audit pos.heldCart.discard ผู้กระทำ = ผู้ตัดสิน (ไม่รู้ = SYSTEM) ◂
 */
export async function discardHeldCartRejected(tenantId: string, heldCartId: string, requestId: string, deciderId: string | null, client?: Db): Promise<boolean> {
  const db: Db = client ?? prisma;
  return db.$transaction(async (tx) => {
    const before = await tx.posHeldCart.findFirst({ where: { id: heldCartId, tenantId, status: "HELD" }, select: { unitId: true, label: true, heldByUserId: true, lineCount: true, approxTotalSatang: true } });
    if (!before) return false;
    const r = await tx.posHeldCart.updateMany({ where: { id: heldCartId, tenantId, status: "HELD" }, data: { status: "DISCARDED", version: { increment: 1 } } });
    if (r.count !== 1) return false;
    const { unitId, ...rest } = before;
    await tx.auditLog.create({
      data: {
        tenantId,
        unitId,
        actorType: deciderId ? "USER" : "SYSTEM",
        actorId: deciderId,
        action: "pos.heldCart.discard",
        targetType: "PosHeldCart",
        targetId: heldCartId,
        before: { status: "HELD", ...rest } as Prisma.InputJsonValue,
        after: { status: "DISCARDED", via: "approval_rejected", requestId } as Prisma.InputJsonValue,
      },
    });
    return true;
  });
}

// ═══════════════════ ทิ้ง ═══════════════════
export async function discardHeldCart(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }, client?: Db): Promise<DiscardHeldCartResult> {
  return guard("discardHeldCart", async (): Promise<DiscardHeldCartResult> => {
    const db: Db = client ?? prisma;
    const s = await scope(db, ctx, actor);
    if (isRefusal(s)) return s;
    const id = idOf(input);
    if (!id) return refuse("NOT_FOUND");
    const done = await db.$transaction(async (tx) => {
      // POS P2.4 ▸ fix 2 F5: ทิ้งจากลิ้นชักได้เฉพาะบิลพักปกติ (รอบร่างของโต๊ะทิ้งตอนปิดโต๊ะ) ◂
      const before = await tx.posHeldCart.findFirst({ where: { id, ...rowWhere(s), status: "HELD", tableSessionId: null }, select: { label: true, heldByUserId: true, lineCount: true, approxTotalSatang: true } });
      if (!before) return false;
      const r = await tx.posHeldCart.updateMany({ where: { id, ...rowWhere(s), status: "HELD", tableSessionId: null }, data: { status: "DISCARDED", version: { increment: 1 } } });
      if (r.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          tenantId: s.ctx.tenantId,
          unitId: s.ctx.unitId,
          actorType: "USER",
          actorId: s.actor.userId,
          action: "pos.heldCart.discard",
          targetType: "PosHeldCart",
          targetId: id,
          before: { status: "HELD", ...before } as Prisma.InputJsonValue,
          after: { status: "DISCARDED" } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
    return done ? { ok: true } : refuse("NOT_FOUND");
  });
}
