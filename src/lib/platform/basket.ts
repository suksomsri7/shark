// ─────────────────────────────────────────────────────────────
// platform/basket.ts — ตะกร้าขายกลาง (CC §A.1 :45 · §C กติกา 4) · RUN TRIPS T0.6
// ใบสั่ง ledger/trips-briefs/T0.6.md §5.6: รุ่นนี้ = ตัวกระจาย "ชนิดเดียว" — ตรวจชนิดทุกบรรทัดด้วย sellableFor ก่อนแตะฐาน
//   ไม่ใช่ TRIP (หรือชนิดยังไม่มี sellable) ⇒ KIND_NOT_SUPPORTED ไม่เขียนอะไร · ชนิดเดียวทั้งตะกร้า ⇒ ส่งต่อ sellable.hold/confirm ของชนิดนั้น
//   ทางสองเฟสข้ามชนิด (TRIP+TICKET) = K1.1 (มติ §16 ข้อ 9)
// ─────────────────────────────────────────────────────────────
import type { BookingRef, ConfirmRequest, Hold, HoldRequest, SellCtx, SellResult } from "@/lib/core/sellable";
import { sellableFor } from "./sellables";

// ── T0.6 booking ──
const notSupported = (): SellResult<never> => ({ ok: false, code: "KIND_NOT_SUPPORTED", messageTh: "ยังไม่รองรับรายการชนิดนี้ในตะกร้าเดียวกัน", retryable: false });
const invalid = (): SellResult<never> => ({ ok: false, code: "VALIDATION", messageTh: "ข้อมูลไม่ถูกต้อง", retryable: false });

/** ชนิดของทุกบรรทัด (req.quote.lines[].productKind) — รูปผิด ⇒ null */
function kindsOf(req: unknown): string[] | null {
  if (typeof req !== "object" || req === null) return null;
  const quote = (req as { quote?: unknown }).quote;
  const lines = typeof quote === "object" && quote !== null ? (quote as { lines?: unknown }).lines : undefined;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const kinds = lines.map((l) => (typeof l === "object" && l !== null ? (l as { productKind?: unknown }).productKind : undefined));
  return kinds.every((k): k is string => typeof k === "string") ? kinds : null;
}
/** ชนิดเดียวที่ทุกบรรทัดใช้ได้ (ตรวจกับทะเบียนก่อนแตะฐาน) */
async function singleKind(req: unknown): Promise<SellResult<string>> {
  const kinds = kindsOf(req);
  if (!kinds) return invalid();
  for (const k of new Set(kinds)) {
    const s = await sellableFor(k);
    if (!s.ok) return notSupported();
  }
  if (new Set(kinds).size !== 1) return notSupported();
  return { ok: true, value: kinds[0] };
}

/** ถือที่ของตะกร้า (ชั้น 0 = SellBasket ในบริการของชนิดนั้น) */
export async function basketHold(ctx: SellCtx, req: unknown): Promise<SellResult<Hold>> {
  const k = await singleKind(req);
  if (!k.ok) return k;
  const s = await sellableFor(k.value);
  if (!s.ok) return notSupported();
  return s.value.hold(ctx, req as HoldRequest);
}
/** ยืนยันตะกร้า (ธุรกรรมเดียวในบริการของชนิดนั้น · rollback ทั้งตะกร้า) */
export async function basketConfirm(ctx: SellCtx, req: unknown): Promise<SellResult<BookingRef[]>> {
  const k = await singleKind(req);
  if (!k.ok) return k;
  const s = await sellableFor(k.value);
  if (!s.ok) return notSupported();
  return s.value.confirm(ctx, req as ConfirmRequest);
}
// ── /T0.6 booking ──
