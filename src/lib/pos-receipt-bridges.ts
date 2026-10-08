// pos-receipt-bridges.ts — composition root ของใบเสร็จออนไลน์ POS (P1.11 · มติผู้คุมงาน 1 · CD2)
//
// 🔴 ทำไมอยู่นอก `src/lib/modules/pos/`: งานนี้ต้องแตะแชท (ตอบรับทาง LINE) และบอร์ดงาน (การ์ดเรื่องจากลูกค้า) —
//    เส้น pos→chat / pos→kanban ไม่อยู่ใน allowlist ของ fitness F2 (ตั้งใจให้ POS ไม่รู้จักทั้งสองโมดูล)
//    ⇒ ต่อสายที่นี่แบบเดียวกับ `member-journey-senders.ts` (ไม่เพิ่มเส้น fitness)
// 🔴 บอร์ดงาน: ประตูเดียว `kanban/links.createCardFromExternal` (sourceType AUTOMATION · sourceKey "pos-receipt-issue:<issueId>" กันซ้ำ)
//    บอร์ดมาจาก AppSystem(POS).settings.pos.receipt.issueBoardId เท่านั้น — ไม่มี fallback ไป "บอร์ดแรกของร้าน" (มติ 5)
//    ไม่มีบอร์ด/บอร์ดถูกเก็บ = {posted:false, reason:"no-board"} ไม่ throw
// 🔴 idempotent ต่อ issueId: PosReceiptIssue.kanbanCardId มีแล้ว = {posted:false, reason:"already-posted"} (ไม่เปิดการ์ด/ไม่ตอบรับซ้ำ)
// 🔴 ตอบรับทาง LINE (sendLineToParty) เมื่อบิลมีสมาชิกที่มี Party — ok:false ถูกเพิกเฉย · ไม่ throw ไม่ว่ากรณีใด
// 🔴 PDPA: ไม่พิมพ์ข้อความลูกค้า/ช่องทางติดต่อลง log
import { prisma } from "@/lib/core/db";
import type { OutboxHandler } from "@/lib/core/outbox";
import { sendLineToParty } from "@/lib/modules/chat";
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import { receiptSettingsOf } from "@/lib/modules/pos/receipt-settings";
import type { ReceiptLineSender } from "@/lib/modules/pos/receipt-send";

type IssueEvt = Parameters<OutboxHandler>[0];
export type ReceiptIssueBridgeResult = { posted: true; cardId: string } | { posted: false; reason: "no-board" | "already-posted" | "not-found" };

/** ตัวส่ง LINE จริงของ sendReceipt (sendReceiptAction ฉีดตัวนี้ · ไม่ฉีด = sendReceipt โหลดตัวนี้เอง) */
export const posReceiptLineSender: ReceiptLineSender = (ctx, input) => sendLineToParty(ctx, input);

/**
 * consumer ของ outbox `pos.receipt.issue_reported` (R4) — การ์ดบนบอร์ดรับเรื่อง + ตอบรับลูกค้าทาง LINE
 * คืนผล (ข้อสอบเรียกตรง) · ห่อด้วย withAutomation ใน outbox-consumers.ts
 */
export async function onReceiptIssueReported(evt: IssueEvt): Promise<ReceiptIssueBridgeResult> {
  const p = (evt?.payload ?? {}) as { issueId?: unknown };
  const issueId = typeof p.issueId === "string" ? p.issueId : "";
  const tenantId = String(evt?.tenantId ?? "");
  const issue = issueId && tenantId ? await prisma.posReceiptIssue.findFirst({ where: { id: issueId, tenantId } }) : null;
  if (!issue) return { posted: false, reason: "not-found" };
  if (issue.kanbanCardId) return { posted: false, reason: "already-posted" };
  const sale = await prisma.posSale.findFirst({ where: { id: issue.saleId, tenantId }, select: { systemId: true, receiptNo: true, memberId: true } });
  if (!sale) return { posted: false, reason: "not-found" };
  const receiptNo = sale.receiptNo ?? "";

  // ── การ์ดบนบอร์ดที่ร้านตั้งไว้ (ไม่มี = ข้ามอย่างสุภาพ) ──
  let result: ReceiptIssueBridgeResult = { posted: false, reason: "no-board" };
  const pos = await prisma.appSystem.findFirst({ where: { id: sale.systemId, tenantId, type: "POS" }, select: { settings: true } });
  const boardId = pos ? receiptSettingsOf(pos.settings).issueBoardId : null;
  const board = boardId ? await prisma.kanbanBoard.findFirst({ where: { id: boardId, tenantId, status: "ACTIVE" }, select: { id: true, systemId: true } }) : null;
  if (board) {
    const description = [`ลูกค้าแจ้งปัญหาจากหน้าใบเสร็จออนไลน์ (บิล ${receiptNo})`, "", issue.message, ...(issue.contact ? ["", `ติดต่อกลับ: ${issue.contact}`] : [])].join("\n");
    const card = await createCardFromExternal(
      { tenantId, systemId: board.systemId, actorUserId: null },
      { boardId: board.id, title: `แจ้งปัญหาบิล ${receiptNo}`, description, sourceType: "AUTOMATION", sourceKey: `pos-receipt-issue:${issue.id}` },
    );
    // เขียนครั้งเดียว (kanbanCardId IS NULL) — เล่นซ้ำพร้อมกันได้การ์ดเดิม (sourceKey) และ id เดิม
    await prisma.posReceiptIssue.updateMany({ where: { id: issue.id, tenantId, kanbanCardId: null }, data: { kanbanCardId: card.cardId } });
    result = { posted: true, cardId: card.cardId };
  }

  // ── ตอบรับทาง LINE (สมาชิกที่มี Party เท่านั้น · ผลไม่สำเร็จถูกเพิกเฉย) ──
  try {
    const member = sale.memberId ? await prisma.customer.findFirst({ where: { id: sale.memberId, tenantId }, select: { partyId: true } }) : null;
    if (member?.partyId) {
      await sendLineToParty({ tenantId }, { partyId: member.partyId, text: `ร้านได้รับเรื่องที่แจ้งเกี่ยวกับบิล ${receiptNo} แล้ว — เจ้าหน้าที่จะติดต่อกลับโดยเร็ว ขอบคุณค่ะ` });
    }
  } catch {
    /* ไม่ throw — การ์ด/แถวสำคัญกว่าการตอบรับ */
  }
  return result;
}
