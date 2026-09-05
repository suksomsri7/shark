"use server";

// undo-stack.ts — soft-undo 5 นาที (WO 9.4 §0.3 ข้อ 8)
//
// ขอบเขต: เฉพาะการกระทำที่ **ไม่กินเลขที่เอกสาร/ไม่ลงเงิน** ตามใบสั่งงาน 9.4 — 11 อย่าง:
//   เก็บถาวรผู้ติดต่อ/สินค้า/ไฟล์แนบ · ลบแท็กเอกสาร · ข้ามคู่ซ้ำ (dismiss) · ทำเครื่องหมายไม่ใช่เอกสารบัญชี ·
//   ย้ายโฟลเดอร์ · เปลี่ยนประเภทที่แนะนำ · แยกไฟล์ออกจากเอกสาร · ยกเลิกร่าง (เฉพาะร่าง) · ปักหมุด (การเงิน/ผังบัญชี)
//
// สถาปัตยกรรม: แต่ละ "ทำ" (`*WithUndoAction`) เรียกฟังก์ชัน service เดิมที่ตรวจแล้ว (ไม่เขียน business logic
// ใหม่) แล้วสร้างแถว `AccountUndoToken` เก็บ "ข้อมูลย้อนกลับ" (payload) ที่พอให้ `undoAction()` คืนสภาพเดิมได้เอง
// — คนละหน้าที่กับ AuditLog (บันทึกประวัติเต็ม ไม่ใช่ตัวย้อนกลับ) ทั้งการทำและการเลิกทำ audit ทั้งคู่
//
// one-shot + หมดอายุ 5 นาที + ผูก tenant+system+user (คนอื่นแม้ในร้าน/ระบบเดียวกันก็เลิกทำแทนไม่ได้) — บังคับ
// ด้วย `updateMany({where:{id,usedAt:null}})` แบบ atomic กันกดเลิกทำพร้อมกัน 2 ครั้ง (เหมือน recordPayment WO 9.2)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tenantDb } from "@/lib/core/db";
import type { Prisma, AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan } from "./access";
import { writeAudit } from "./access";
import { archiveContact } from "./service";
import { archiveProduct } from "./product";
import { archiveAttachment, restoreAttachment, moveAttachment, setDocTypeHint, markNotAccounting, unlinkAttachment, linkAttachment } from "./attachment";
import { dismissMergeCandidate } from "./contact-merge";
import { setPinnedFinanceAccounts } from "./finance";
import { setPinnedLedgerAccounts } from "./coa";
import { voidDocument } from "./service";
import { editorDetailPath } from "./doc-editor-config";
import { safeReason, ERR } from "./errors";

const TTL_MS = 5 * 60 * 1000;

export type UndoKind =
  | "contact.archive"
  | "product.archive"
  | "attachment.archive"
  | "doc.tagRemove"
  | "merge.dismiss"
  | "attachment.notAccounting"
  | "attachment.moveFolder"
  | "attachment.docTypeHint"
  | "attachment.unlink"
  | "doc.cancelDraft"
  | "pin.finance"
  | "pin.ledger";

export type UndoResult = { ok: true; undoToken: string } | { ok: false; reason: string };

/**
 * สร้าง undo token — เอ็กซ์พอร์ตแยกจาก `*WithUndoAction` เพื่อให้ทดสอบ core lifecycle (สร้าง→เลิกทำ→คืนสภาพ ·
 * หมดอายุ · ใช้ซ้ำ · ข้าม user/tenant) ได้ตรง ๆ จาก QC script โดยไม่ต้องผ่าน `loadAccountSystem` (ต้องมี Next.js
 * request context — เรียกจากสคริปต์ธรรมดาไม่ได้ เหมือน `*Action` อื่นทั้งหมดในโมดูลนี้)
 * `ttlMs` เปิดให้ QC จำลอง "หมดอายุ" ได้ตรง ๆ (ส่งค่าติดลบ) แทนต้องรอจริง 5 นาที
 */
export async function createUndoToken(
  ctx: { tenantId: string; systemId: string; userId: string },
  kind: UndoKind,
  payload: Record<string, unknown>,
  ttlMs: number = TTL_MS,
): Promise<string> {
  const db = tenantDb(ctx);
  const row = await db.accountUndoToken.create({
    data: {
      userId: ctx.userId,
      kind,
      payload: payload as Prisma.InputJsonObject,
      expiresAt: new Date(Date.now() + ttlMs),
    } as Prisma.AccountUndoTokenUncheckedCreateInput,
    select: { id: true },
  });
  return row.id;
}
const createToken = createUndoToken;

// ─────────────────────────── ตัวย้อนกลับ ต่อ kind (เรียกจาก undoAction เท่านั้น) ───────────────────────────

async function restore(ctx: { tenantId: string; systemId: string }, kind: UndoKind, payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown>;
  const { tenantId, systemId } = ctx;
  const db = tenantDb(ctx);
  switch (kind) {
    case "contact.archive":
      await db.accountContact.updateMany({ where: { id: p.id as string }, data: { archivedAt: null } });
      return;
    case "product.archive":
      await archiveProduct(tenantId, systemId, p.id as string, false);
      return;
    case "attachment.archive":
      await restoreAttachment(tenantId, systemId, p.id as string, null);
      return;
    case "doc.tagRemove": {
      const doc = await db.accountDocument.findFirst({ where: { id: p.docId as string }, select: { id: true, tags: true } });
      if (!doc) return;
      if (!doc.tags.includes(p.tag as string)) {
        await db.accountDocument.update({ where: { id: doc.id }, data: { tags: { push: p.tag as string } } });
      }
      return;
    }
    case "merge.dismiss":
      // Party/PartyMergeCandidate เป็น tenant-scoped (ไม่มี systemId) — tenantDb ใช้แค่แกน tenant ให้เอง
      await db.partyMergeCandidate.updateMany({
        where: { partyAId: p.partyAId as string, partyBId: p.partyBId as string },
        data: { status: "OPEN" },
      });
      return;
    case "attachment.notAccounting":
      await db.accountAttachment.updateMany({
        where: { id: p.id as string },
        data: { status: (p.prevStatus as string) ?? "UNLINKED" },
      });
      return;
    case "attachment.moveFolder":
      await moveAttachment(tenantId, systemId, p.id as string, (p.prevFolder as string | null) ?? null);
      return;
    case "attachment.docTypeHint":
      await setDocTypeHint(tenantId, systemId, p.id as string, (p.prevHint as string | null) ?? null, null);
      return;
    case "attachment.unlink":
      if (p.prevDocumentId) await linkAttachment(tenantId, systemId, p.id as string, p.prevDocumentId as string, null);
      return;
    case "doc.cancelDraft":
      await db.accountDocument.updateMany({
        where: { id: p.id as string, status: "CANCELLED" },
        data: { status: "DRAFT", voidedAt: null, voidReason: null },
      });
      return;
    case "pin.finance":
      await setPinnedFinanceAccounts(tenantId, systemId, (p.ids as string[]) ?? []);
      return;
    case "pin.ledger":
      await setPinnedLedgerAccounts({ tenantId, systemId }, (p.ids as string[]) ?? []);
      return;
  }
}

/**
 * เลิกทำ (core) — one-shot: token ต้องยังไม่หมดอายุ ยังไม่ถูกใช้ และเป็นของ tenant+system+**user เดียวกัน**เท่านั้น
 * (คนอื่นในร้าน/ระบบเดียวกันเลิกทำแทนไม่ได้แม้มีสิทธิ์ระดับสูงกว่า — กันกดเลิกทำงานของเพื่อนร่วมงานผิดคน)
 * แยกจาก `undoAction` (ไม่มี `revalidatePath` — เรียกได้ตรงจาก QC script เพื่อทดสอบ lifecycle เต็มรูป)
 */
export async function consumeUndoToken(
  ctx: { tenantId: string; systemId: string; userId: string },
  tokenId: string,
): Promise<UndoResult> {
  const { tenantId, systemId, userId } = ctx;
  const db = tenantDb(ctx);
  const token = await db.accountUndoToken.findFirst({ where: { id: tokenId } });
  if (!token) return { ok: false, reason: ERR.UNDO_INVALID_TOKEN };
  if (token.userId !== userId) return { ok: false, reason: ERR.UNDO_NOT_ALLOWED };
  if (token.usedAt) return { ok: false, reason: ERR.UNDO_ALREADY_USED };
  if (token.expiresAt.getTime() < Date.now()) return { ok: false, reason: ERR.UNDO_EXPIRED };

  // อะตอมมิก: claim ก่อนทำจริง กันกดเลิกทำพร้อมกัน 2 ครั้ง (เช่น 2 แท็บ) แย่งกันย้อนสภาพซ้ำ
  const claim = await db.accountUndoToken.updateMany({ where: { id: tokenId, usedAt: null }, data: { usedAt: new Date() } });
  if (claim.count === 0) return { ok: false, reason: ERR.UNDO_ALREADY_USED };

  try {
    await restore({ tenantId, systemId }, token.kind as UndoKind, token.payload);
  } catch (e) {
    return { ok: false, reason: safeReason(e, ERR.GENERIC_ACTION_FAILED) };
  }
  await writeAudit({
    tenantId,
    actorId: userId,
    action: `account.undo.${token.kind}`,
    targetType: "AccountUndoToken",
    targetId: tokenId,
    after: token.payload as object,
  });
  return { ok: true, undoToken: tokenId };
}

/** เลิกทำ — เรียกจาก UI จริง (UndoToast.tsx) ผูก tenant/user จาก session ปัจจุบันเสมอ (ไม่รับ tenant/user จาก client) */
export async function undoAction(systemId: string, tokenId: string): Promise<UndoResult> {
  const { tenantId, userId } = await loadAccountSystem(systemId);
  const res = await consumeUndoToken({ tenantId, systemId, userId }, tokenId);
  if (res.ok) revalidatePath(`/app/sys/${systemId}/account`, "layout");
  return res;
}

// ─────────────────────────── "ทำ" — ต่อ kind (ผู้เรียก UI ใช้ตัวเหล่านี้แทนตัวเดิม) ───────────────────────────

export async function archiveContactWithUndoAction(systemId: string, id: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.manage");
  await archiveContact(tenantId, systemId, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.contact.manage", targetType: "AccountContact", targetId: id, after: { archived: true } });
  const undoToken = await createToken({ tenantId, systemId, userId }, "contact.archive", { id });
  revalidatePath(`/app/sys/${systemId}/account/contacts`);
  return { ok: true, undoToken };
}

export async function archiveProductWithUndoAction(systemId: string, id: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.product.manage");
  await archiveProduct(tenantId, systemId, id, true);
  await writeAudit({ tenantId, actorId: userId, action: "account.product.manage", targetType: "AccountProduct", targetId: id, after: { archived: true } });
  const undoToken = await createToken({ tenantId, systemId, userId }, "product.archive", { id });
  revalidatePath(`/app/sys/${systemId}/account/products`);
  return { ok: true, undoToken };
}

// ─────────────────────────── ตัวห่อรูปแบบฟอร์ม (server component เรียกไม่ได้ตรง ๆ — ผูก client action ไม่ได้ กัน RSC serialize) ───────────────────────────
// contacts-ui.tsx / products/page.tsx เป็น server component ⇒ ส่ง client closure ลงไปให้ RowActions ใช้ไม่ได้
// (React ผ่านได้เฉพาะ reference ของ "use server" action จริง ๆ ข้ามขอบเขตนี้) ⇒ ต้อง redirect กลับหน้าเดิมพร้อม
// `?undo=<token>` แทน (UndoToast.tsx อ่านจาก query แล้วเปิด toast — เฝ้าดู searchParams เปลี่ยนไม่ใช่แค่ mount)

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** ฟอร์ม "ปิดใช้งาน" ผู้ติดต่อ (แถวในหน้ารายการ — contacts-ui.tsx) */
export async function archiveContactFormAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const listPath = `/app/sys/${systemId}/account/contacts`;
  const res = await archiveContactWithUndoAction(systemId, id);
  redirect(res.ok ? `${listPath}?undo=${res.undoToken}` : `${listPath}?err=${encodeURIComponent(res.reason)}`);
}

/** ฟอร์ม "ปิดใช้งาน/เปิดใช้งาน" สินค้า (แถวในหน้ารายการ — products/page.tsx) — เลิกทำได้เฉพาะทิศ "ปิดใช้งาน" */
export async function archiveProductFormAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId");
  const id = str(formData, "id");
  const archived = str(formData, "archived") !== "0";
  const listPath = `/app/sys/${systemId}/account/products`;
  if (!archived) {
    // "เปิดใช้งาน" คือการเลิกทำด้วยมืออยู่แล้ว — ไม่ต้องสร้าง undo token ซ้อน
    const { auth, tenantId, userId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.product.manage");
    await archiveProduct(tenantId, systemId, id, false);
    await writeAudit({ tenantId, actorId: userId, action: "account.product.manage", targetType: "AccountProduct", targetId: id, after: { archived: false } });
    revalidatePath(listPath);
    redirect(listPath);
  }
  const res = await archiveProductWithUndoAction(systemId, id);
  redirect(res.ok ? `${listPath}?undo=${res.undoToken}` : `${listPath}?err=${encodeURIComponent(res.reason)}`);
}

export async function archiveAttachmentWithUndoAction(systemId: string, id: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const res = await archiveAttachment(tenantId, systemId, id, userId);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "attachment.archive", { id });
  revalidatePath(`/app/sys/${systemId}/account/documents`);
  return { ok: true, undoToken };
}

/** ลบแท็กออกจากเอกสาร 1 ใบ (ยังไม่เคยมี UI/action ก่อน WO 9.4 — `AccountDocument.tags` เป็น String[] อยู่แล้ว) */
export async function removeDocTagWithUndoAction(systemId: string, docId: string, tag: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.create");
  const doc = await tenantDb({ tenantId, systemId }).accountDocument.findFirst({ where: { id: docId }, select: { tags: true, docType: true } });
  if (!doc) return { ok: false, reason: ERR.DOC_NOT_FOUND };
  if (!doc.tags.includes(tag)) return { ok: false, reason: "เอกสารนี้ไม่มีแท็กนี้อยู่แล้ว" };
  await tenantDb({ tenantId, systemId }).accountDocument.update({ where: { id: docId }, data: { tags: doc.tags.filter((t) => t !== tag) } });
  await writeAudit({ tenantId, actorId: userId, action: "account.doc.create", targetType: "AccountDocument", targetId: docId, after: { removedTag: tag } });
  const undoToken = await createToken({ tenantId, systemId, userId }, "doc.tagRemove", { docId, tag });
  revalidatePath(`/app/sys/${systemId}/account/docs/${doc.docType}/${docId}`);
  return { ok: true, undoToken };
}

export async function dismissMergeCandidateWithUndoAction(systemId: string, aId: string, bId: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.contact.merge");
  const res = await dismissMergeCandidate({ tenantId, systemId }, aId, bId);
  if (!res.ok) return res;
  const rows = await tenantDb({ tenantId, systemId }).accountContact.findMany({ where: { id: { in: [aId, bId] } }, select: { partyId: true } });
  const partyIds = rows.map((r) => r.partyId).filter((x): x is string => !!x);
  await writeAudit({ tenantId, actorId: userId, action: "account.contact.merge", targetType: "AccountContact", targetId: aId, after: { dismissedWith: bId } });
  let undoToken = "";
  if (partyIds.length === 2) {
    const [partyAId, partyBId] = partyIds[0]! < partyIds[1]! ? [partyIds[0]!, partyIds[1]!] : [partyIds[1]!, partyIds[0]!];
    undoToken = await createToken({ tenantId, systemId, userId }, "merge.dismiss", { partyAId, partyBId });
  }
  revalidatePath(`/app/sys/${systemId}/account/contacts/merge`);
  return { ok: true, undoToken };
}

export async function markNotAccountingWithUndoAction(systemId: string, id: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const before = await tenantDb({ tenantId, systemId }).accountAttachment.findFirst({ where: { id }, select: { status: true } });
  const res = await markNotAccounting(tenantId, systemId, id, userId);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "attachment.notAccounting", { id, prevStatus: before?.status ?? "UNLINKED" });
  revalidatePath(`/app/sys/${systemId}/account/documents`);
  return { ok: true, undoToken };
}

export async function moveAttachmentWithUndoAction(systemId: string, id: string, folder: string | null): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const before = await tenantDb({ tenantId, systemId }).accountAttachment.findFirst({ where: { id }, select: { folder: true } });
  const res = await moveAttachment(tenantId, systemId, id, folder);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "attachment.moveFolder", { id, prevFolder: before?.folder ?? null });
  revalidatePath(`/app/sys/${systemId}/account/documents`);
  return { ok: true, undoToken };
}

export async function setDocTypeHintWithUndoAction(systemId: string, id: string, hint: string | null): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const before = await tenantDb({ tenantId, systemId }).accountAttachment.findFirst({ where: { id }, select: { docTypeHint: true } });
  const res = await setDocTypeHint(tenantId, systemId, id, hint, userId);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "attachment.docTypeHint", { id, prevHint: before?.docTypeHint ?? null });
  revalidatePath(`/app/sys/${systemId}/account/documents`);
  return { ok: true, undoToken };
}

export async function unlinkAttachmentWithUndoAction(systemId: string, id: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.document.manage");
  const before = await tenantDb({ tenantId, systemId }).accountAttachment.findFirst({ where: { id }, select: { documentId: true } });
  const res = await unlinkAttachment(tenantId, systemId, id, userId);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "attachment.unlink", { id, prevDocumentId: before?.documentId ?? null });
  revalidatePath(`/app/sys/${systemId}/account/documents`);
  return { ok: true, undoToken };
}

/** "ลบร่าง" (จริง ๆ คือยกเลิกร่าง — DRAFT ไม่เคยลง GL อยู่แล้วจึงย้อนกลับสะอาด 100%) — เฉพาะเอกสารที่ยังเป็น DRAFT */
export async function cancelDraftWithUndoAction(systemId: string, docId: string): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.doc.void");
  const doc = await tenantDb({ tenantId, systemId }).accountDocument.findFirst({ where: { id: docId }, select: { status: true, docType: true } });
  if (!doc) return { ok: false, reason: ERR.DOC_NOT_FOUND };
  if (doc.status !== "DRAFT") return { ok: false, reason: "ลบร่างได้เฉพาะเอกสารที่ยังเป็นร่างเท่านั้น — เอกสารนี้ออกไปแล้ว ใช้ปุ่มยกเลิกแทน" };
  const res = await voidDocument(tenantId, systemId, docId, "ลบร่าง");
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "doc.cancelDraft", { id: docId });
  const path = editorDetailPath(`/app/sys/${systemId}/account`, doc.docType, docId);
  revalidatePath(path);
  return { ok: true, undoToken };
}

/** ฟอร์ม "ลบร่าง" ของหน้าเอกสาร 1 ใบ (DocMoreMenu เป็น client แต่ตัวประกอบ danger prop มักอยู่ที่ DocDetailPage
 * ซึ่งเป็น server component — ให้ปลอดภัยไว้ก่อนด้วยแบบฟอร์ม redirect+`?undo=` เหมือนกัน) */
export async function cancelDraftFormAction(formData: FormData): Promise<void> {
  const systemId = str(formData, "systemId");
  const docId = str(formData, "id");
  const docType = str(formData, "docType");
  const path = editorDetailPath(`/app/sys/${systemId}/account`, docType as AccountDocType, docId);
  const res = await cancelDraftWithUndoAction(systemId, docId);
  redirect(res.ok ? `${path}?undo=${res.undoToken}` : `${path}?err=${encodeURIComponent(res.reason)}`);
}

export async function pinFinanceWithUndoAction(systemId: string, ids: string[]): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const before = await tenantDb({ tenantId, systemId }).accountFinance.findMany({ where: { pinned: true }, select: { id: true } });
  const res = await setPinnedFinanceAccounts(tenantId, systemId, ids);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "pin.finance", { ids: before.map((b) => b.id) });
  revalidatePath(`/app/sys/${systemId}/account`);
  return { ok: true, undoToken };
}

export async function pinLedgerWithUndoAction(systemId: string, ids: string[]): Promise<UndoResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.chart.manage");
  const before = await tenantDb({ tenantId, systemId }).accountLedger.findMany({ where: { pinned: true }, select: { id: true } });
  const res = await setPinnedLedgerAccounts({ tenantId, systemId }, ids);
  if (!res.ok) return res;
  const undoToken = await createToken({ tenantId, systemId, userId }, "pin.ledger", { ids: before.map((b) => b.id) });
  revalidatePath(`/app/sys/${systemId}/account`);
  return { ok: true, undoToken };
}
