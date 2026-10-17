"use server";
// actions.ts — server actions of the public QR pages (/q/**) · POS P2.7 S
// No session: the capability is the token in the URL. Every write goes through pos/qr-order (rate limits, refusals, single writers live there).
// Client IP = first x-forwarded-for hop (same as the /d display actions) — used only for the per-IP submit limit.
// Form actions (…FormAction) redirect back to the page with ?e=<messageKey> on refusal so the pages work without client JavaScript.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  claimPaid,
  orderStatus,
  placePreorder,
  placeTableRound,
  quotePreorderCart,
  quoteTableCart,
  tableBill,
  tableNotifyPaid,
  tablePoll,
  tableServiceRequest,
} from "@/lib/modules/pos/qr-order";
import type {
  QrOkResult,
  QrOrderStatusResult,
  QrPlacePreorderResult,
  QrPlaceRoundResult,
  QrPreorderInput,
  QrQuoteResult,
  QrTableBillResult,
  QrTablePollResult,
  QrTableRoundInput,
} from "@/lib/modules/pos/qr-order-shared";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}
const str = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v : "");
const back = (path: string, lang: string, key?: string): never =>
  redirect(`${path}?${new URLSearchParams({ ...(lang === "en" || lang === "th" ? { lang } : {}), ...(key ? { e: key } : {}) }).toString()}`);

/** cart lines of a form: q:<productId> = qty (0 = skip) · o:<productId> = chosen choice ids (checkbox/radio, repeated) · n:<productId> = note */
function linesOf(fd: FormData): { productId: string; qty: number; choiceIds?: string[]; note?: string }[] {
  const out: { productId: string; qty: number; choiceIds?: string[]; note?: string }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("q:") || typeof v !== "string") continue;
    const qty = Number(v);
    if (!Number.isInteger(qty) || qty <= 0) continue;
    const productId = k.slice(2);
    const choiceIds = fd.getAll(`o:${productId}`).filter((x): x is string => typeof x === "string" && !!x);
    const note = str(fd.get(`n:${productId}`)).trim();
    out.push({ productId, qty, ...(choiceIds.length ? { choiceIds } : {}), ...(note ? { note } : {}) });
  }
  return out;
}

// ── table (/q/t/<qrToken>) ──
export async function tablePollAction(qrToken: string, sinceVer?: string): Promise<QrTablePollResult> {
  return tablePoll(qrToken, typeof sinceVer === "string" ? { sinceVer } : {});
}
export async function quoteTableCartAction(qrToken: string, lines: unknown): Promise<QrQuoteResult> {
  return quoteTableCart(qrToken, { lines });
}
export async function placeTableRoundAction(qrToken: string, input: QrTableRoundInput): Promise<QrPlaceRoundResult> {
  return placeTableRound(qrToken, input, { ip: await clientIp() });
}
export async function tableServiceRequestAction(qrToken: string, kind: "CALL_STAFF" | "REQUEST_BILL"): Promise<QrOkResult> {
  return tableServiceRequest(qrToken, { kind }, { ip: await clientIp() });
}
// POS P2.7U ▸ bill of the table for the client island (read-only · same door as the SSR page) ◂
export async function tableBillAction(qrToken: string): Promise<QrTableBillResult> {
  return tableBill(qrToken);
}
export async function tableNotifyPaidAction(qrToken: string): Promise<QrOkResult> {
  return tableNotifyPaid(qrToken, { ip: await clientIp() });
}
/** form: send the chosen items as one round (expected session = the one the page rendered) */
export async function tableRoundFormAction(qrToken: string, fd: FormData): Promise<void> {
  const sid = str(fd.get("sessionId"));
  const lang = str(fd.get("lang"));
  const r = await placeTableRound(qrToken, { lines: linesOf(fd), expectedSessionId: sid || null, ...(str(fd.get("guestToken")) ? { guestToken: str(fd.get("guestToken")) } : {}) }, { ip: await clientIp() });
  back(`/q/t/${encodeURIComponent(qrToken)}`, lang, r.ok ? "qr.table.sent" : r.messageKey);
}
export async function tableRequestFormAction(qrToken: string, fd: FormData): Promise<void> {
  const kind = str(fd.get("kind"));
  const lang = str(fd.get("lang"));
  const r = kind === "PAY_PROMPTPAY" ? await tableNotifyPaid(qrToken, { ip: await clientIp() }) : await tableServiceRequest(qrToken, { kind: kind === "REQUEST_BILL" ? "REQUEST_BILL" : "CALL_STAFF" }, { ip: await clientIp() });
  back(`/q/t/${encodeURIComponent(qrToken)}`, lang, r.ok ? (kind === "PAY_PROMPTPAY" ? "qr.table.notified" : "qr.table.requested") : r.messageKey);
}

// ── pre-order (/q/<linkToken>) ──
export async function quotePreorderCartAction(linkToken: string, lines: unknown): Promise<QrQuoteResult> {
  return quotePreorderCart(linkToken, { lines });
}
export async function placePreorderAction(linkToken: string, input: QrPreorderInput): Promise<QrPlacePreorderResult> {
  return placePreorder(linkToken, input, { ip: await clientIp() });
}
// POS P3.7 ▸ R8 door B: the page binds the chat tag from ?c= (invalid/expired tag = order placed unlinked, never refused) ◂
export async function placeTaggedPreorderAction(chatTag: string, linkToken: string, input: QrPreorderInput): Promise<QrPlacePreorderResult> {
  return placePreorder(linkToken, { ...input, chatTag }, { ip: await clientIp() }); // POS P3.7 ▸ R8 ◂
}
/** form: place the pre-order and go to its status page (/q/o/<orderToken>) */
export async function preorderFormAction(linkToken: string, fd: FormData): Promise<void> {
  const lang = str(fd.get("lang"));
  const note = str(fd.get("note")).trim();
  const r = await placePreorder(
    linkToken,
    { lines: linesOf(fd), customer: { name: str(fd.get("name")), phone: str(fd.get("phone")) }, idempotencyKey: str(fd.get("key")), ...(note ? { note } : {}) },
    { ip: await clientIp() },
  );
  if (r.ok) back(`/q/o/${r.orderToken}`, lang);
  else back(`/q/${encodeURIComponent(linkToken)}`, lang, r.messageKey);
}

// ── order status (/q/o/<orderToken>) ──
export async function orderStatusAction(orderToken: string, sinceVer?: string): Promise<QrOrderStatusResult> {
  return orderStatus(orderToken, typeof sinceVer === "string" ? { sinceVer } : {});
}
export async function claimPaidAction(orderToken: string): Promise<QrOkResult> {
  return claimPaid(orderToken, { ip: await clientIp() });
}
export async function claimPaidFormAction(orderToken: string, fd: FormData): Promise<void> {
  const r = await claimPaid(orderToken, { ip: await clientIp() });
  back(`/q/o/${encodeURIComponent(orderToken)}`, str(fd.get("lang")), r.ok ? "qr.status.claimed" : r.messageKey);
}
