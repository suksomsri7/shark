// receipt-send.ts — ส่งใบเสร็จให้ลูกค้าทาง LINE / อีเมล (POS P1.11 · R7 · CD4 · มติผู้คุมงาน 1 2 3 10)
//
// 🔴 สิทธิ์ pos.sale.read (pos.sale.create ได้โดยนัย · ตัวเดียวกับ receiptPayload) + บิลต้องอยู่ในขอบเขตสาขาของผู้เรียก ·
//    ไม่มีสิทธิ์ = PERMISSION_DENIED · บิลนอกขอบเขต/id มั่ว = SALE_NOT_FOUND · บิลยกเลิก = SALE_VOIDED
// 🔴 เพดาน 5 ครั้ง/บิล/24 ชม. นับจาก AuditLog pos.receipt.sent (CD4 — ไม่มีตารางตัวนับ) ใต้ล็อกแถวบิล (F6a) · audit เขียนเฉพาะที่ส่งสำเร็จ (ใน tx เดียวกับการนับ) ·
//    ที่อยู่ปลายทางใน audit ถูกปิดบัง (ไม่มีชื่อ/เบอร์/อีเมลดิบ/LINE id)
// 🔴 LINE: โมดูล POS ไม่รู้จักแชท (fitness F2) ⇒ ตัวส่งจริงอยู่ที่ composition root `src/lib/pos-receipt-bridges.ts`
//    (ฉีดผ่าน opts.deps.line โดย sendReceiptAction · ไม่ฉีด = โหลดตัวเดียวกันแบบ dynamic import) · ข้อสอบฉีดตัวปลอม
// 🔴 EMAIL: core/email.sendEmailRich (โหลดตอนใช้ — lib/env ตรวจ env ตอน import) · deps.fetch ฉีดแทน fetch ได้ (ข้อสอบไม่แตะเครือข่าย)
// 🔴 ปฏิเสธเป็นข้อมูลภาษาไทย ไม่ throw
import { posSaleWhere } from "./access";
import { prisma } from "./db";
import { eReceiptUrl, receiptActorOf, receiptForSale, receiptReadScope, type ReceiptCtx } from "./receipt";
import { renderReceiptHtml } from "./receipt-render";
import { moneyText, type RegisterActor } from "./register-shared";
import {
  RECEIPT_EMAIL_RE,
  RECEIPT_ONLINE_MESSAGES,
  RECEIPT_SEND_LIMIT_PER_DAY,
  type ReceiptRefusal,
  type SendReceiptRefusalCode,
  type SendReceiptResult,
  type SendReceiptVia,
} from "./receipt-public-shared";

/** ตัวส่ง LINE (รูปเดียวกับ chat.sendLineToParty — โมดูล POS ไม่ import แชท) */
export type ReceiptLineSender = (
  ctx: { tenantId: string; systemId?: string | null; actorUserId?: string | null },
  input: { partyId: string; text: string },
) => Promise<{ ok: boolean; reason?: string; code?: string; externalMessageId?: string }>;
export type SendReceiptDeps = { line?: ReceiptLineSender; fetch?: typeof fetch };

const DAY_MS = 86_400_000;
const EMAIL_MAX = 254;
const INPUT_KEYS = new Set(["saleId", "via", "email"]);
const refuse = (code: SendReceiptRefusalCode, message?: string): ReceiptRefusal<SendReceiptRefusalCode> => ({ ok: false, code, message: message ?? RECEIPT_ONLINE_MESSAGES[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");

/** อีเมลแบบปิดบังสำหรับ audit: "s***@example.com" */
function maskEmail(addr: string): string {
  const at = addr.lastIndexOf("@");
  return at > 0 ? `${addr[0]}***@${addr.slice(at + 1)}` : "***";
}

/** ข้อความ LINE (R7) — ยอดสุทธิ = ยอดบิล − ยอดที่คืนแล้ว */
export function receiptLineText(receiptNo: string, netSatang: number, url: string): string {
  return `ใบเสร็จ ${receiptNo} · ยอด ${moneyText(netSatang)} — ดูใบเสร็จ: ${url}`;
}

/** ลิงก์ใบเสร็จออนไลน์ต่อท้ายอีเมล (escape เอง — ไม่พึ่งตัวเรนเดอร์) */
function withLink(html: string, url: string): string {
  const safe = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const block = `<p style="font-family:system-ui,sans-serif;font-size:13px;text-align:center;margin:12px 0"><a href="${safe}">ดูใบเสร็จออนไลน์ / View e-receipt</a><br><span style="font-size:11px;color:#555">${safe}</span></p>`;
  return html.includes("</body>") ? html.replace("</body>", `${block}</body>`) : `${html}${block}`;
}

/**
 * ส่งใบเสร็จของบิลให้ลูกค้า (R7) — ctx = {tenantId (session), systemId (ระบบ POS ของบิล)} · actor = ผู้ใช้หน้าขาย
 * input = {saleId, via:"LINE"|"EMAIL", email?} · opts.deps = ตัวส่งที่ฉีด (มติ 2) · คืน {ok:true, via} | ปฏิเสธเป็นข้อมูล
 */
export async function sendReceipt(ctx: ReceiptCtx, actor: RegisterActor, input: unknown, opts?: { deps?: SendReceiptDeps }): Promise<SendReceiptResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId)) return refuse("SALE_NOT_FOUND");
    const a = receiptActorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const scope = receiptReadScope(a);
    if (!scope) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || Object.keys(input).some((k) => !INPUT_KEYS.has(k) && input[k] !== undefined)) return refuse("VALIDATION");
    const via = input.via;
    if (via !== "LINE" && via !== "EMAIL") return refuse("VALIDATION");
    let givenEmail: string | null = null;
    if (input.email !== undefined && input.email !== null) {
      if (typeof input.email !== "string") return refuse("VALIDATION");
      const e = input.email.trim();
      if (e && (via !== "EMAIL" || e.length > EMAIL_MAX || !RECEIPT_EMAIL_RE.test(e))) return refuse("VALIDATION");
      givenEmail = e || null;
    }
    if (!isId(input.saleId)) return refuse("SALE_NOT_FOUND");
    const { tenantId, systemId } = ctx;

    const sale = await prisma.posSale.findFirst({
      where: { id: input.saleId, ...posSaleWhere(tenantId, systemId, scope) },
      select: { id: true, status: true, receiptNo: true, memberId: true, grandTotalSatang: true, refundedSatang: true, publicToken: true },
    });
    if (!sale) return refuse("SALE_NOT_FOUND");
    if (sale.status === "VOIDED") return refuse("SALE_VOIDED");
    const customer = sale.memberId ? await prisma.customer.findFirst({ where: { id: sale.memberId, tenantId }, select: { partyId: true, email: true } }) : null;
    const receiptNo = sale.receiptNo ?? "";
    // โทเคน/URL ก่อนเข้า tx (บิลเก่าได้โทเคนตอนนี้ — ห้ามเขียนแถวบิลจากอีก connection ระหว่างถือล็อก FOR UPDATE)
    const url = await eReceiptUrl(prisma, tenantId, sale);
    if (!url) return refuse("SALE_NOT_FOUND");

    // ── เตรียมการส่ง (ยังไม่แตะเครือข่าย) ──
    type Prepared = { to: string; send: () => Promise<ReceiptRefusal<SendReceiptRefusalCode> | null> };
    let prepared: Prepared;
    if (via === "LINE") {
      // ไม่มีสมาชิก / สมาชิกไม่มีตัวตนกลาง (Party) = ไม่มีไลน์ให้ส่ง (ไม่เรียกตัวส่ง)
      if (!customer?.partyId) return refuse("NO_LINE_IDENTITY");
      const partyId = customer.partyId;
      // POS P1.11 ▸ composition-root link (controller-accepted F4)
      const line = opts?.deps?.line ?? (await import("@/lib/pos-receipt-bridges")).posReceiptLineSender;
      prepared = {
        to: "LINE:member",
        send: async () => {
          const r = await line({ tenantId, actorUserId: a.userId }, { partyId, text: receiptLineText(receiptNo, sale.grandTotalSatang - sale.refundedSatang, url) });
          if (r.ok) return null;
          return r.code === "NO_LINE_IDENTITY" ? refuse("NO_LINE_IDENTITY") : refuse("SEND_FAILED", r.reason ? `ส่งทางไลน์ไม่สำเร็จ — ${r.reason}` : undefined);
        },
      };
    } else {
      const addr = givenEmail ?? (customer?.email?.trim() || null);
      if (!addr) return refuse("NO_EMAIL");
      if (addr.length > EMAIL_MAX || !RECEIPT_EMAIL_RE.test(addr)) return refuse(givenEmail ? "VALIDATION" : "NO_EMAIL");
      // ใบเสร็จฉบับอีเมล = ต้นฉบับดิจิทัล (ไม่ใช่การพิมพ์ซ้ำ ⇒ ไม่ประทับสำเนา ไม่มี audit reprint) · สูตรเดียวกับใบที่พิมพ์
      const built = await receiptForSale(tenantId, systemId, sale.id, { copy: false });
      if (!built) return refuse("SALE_NOT_FOUND");
      // F6b: อีเมลที่แคชเชียร์พิมพ์เอง (อาจไม่ใช่สมาชิก) = ไม่ใส่ส่วนสมาชิก/แต้มในใบ
      const payload = givenEmail ? { ...built.payload, member: undefined } : built.payload;
      const html = withLink(renderReceiptHtml(payload, { paper: "80", locale: "th" }), url);
      const subject = `ใบเสร็จ ${receiptNo} · ${built.payload.shop.name}`;
      const { sendEmailRich } = await import("@/lib/core/email");
      prepared = {
        to: maskEmail(addr),
        send: async () => ((await sendEmailRich({ to: [addr], subject, html }, opts?.deps?.fetch ? { fetch: opts.deps.fetch } : undefined)).ok ? null : refuse("SEND_FAILED")),
      };
    }

    // ── F6a: นับ + ส่ง + audit ใต้ล็อกแถวบิล (FOR UPDATE) ⇒ ส่งพร้อมกันไม่ทะลุ 5/24 ชม. · นับเฉพาะที่ส่งสำเร็จ (แถว audit) ──
    return await prisma.$transaction(
      async (tx): Promise<SendReceiptResult> => {
        await tx.$queryRaw`SELECT id FROM "PosSale" WHERE id = ${sale.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const sent = await tx.auditLog.count({ where: { tenantId, action: "pos.receipt.sent", targetType: "PosSale", targetId: sale.id, createdAt: { gt: new Date(Date.now() - DAY_MS) } } });
        if (sent >= RECEIPT_SEND_LIMIT_PER_DAY) return refuse("RATE_LIMITED");
        const failed = await prepared.send();
        if (failed) return failed;
        await tx.auditLog.create({
          data: {
            tenantId,
            actorType: "USER",
            actorId: a.userId,
            action: "pos.receipt.sent",
            targetType: "PosSale",
            targetId: sale.id,
            after: { via: via satisfies SendReceiptVia, to: prepared.to, receiptNo },
          },
        });
        return { ok: true, via };
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    console.error("[pos/receipt-send] INTERNAL", e instanceof Error ? e.name : "Error");
    return refuse("INTERNAL");
  }
}
