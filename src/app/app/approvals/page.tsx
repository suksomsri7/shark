import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { listPending, listMyRequests, listPolicies } from "@/lib/modules/approval/service";
import { cancelMyRequestAction } from "@/lib/modules/approval/actions";
import { cancelLeaveAction } from "@/lib/modules/hr/actions"; // HR H0.7 ▸ R5 ยกเลิกใบลาของตัวเอง (ใบลา + คำขอพร้อมกัน) ◂
import { entityLabel } from "@/lib/modules/approval/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatBaht } from "@/lib/ui/money";
import BulkApprovals from "./BulkApprovals";
// POS P1.15U ▸ ภาพ 21A: คำขอ POS_* แสดงชื่อ/บรรทัดรองที่ประกอบตอนแสดง (snapshot ของ POS + ชื่อผู้ขอ/เครื่องอ่านสด · ร้านเดียวกัน) ◂
import { posApprovalCards, type PosApprovalCard } from "@/lib/modules/pos/pos-approval";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { formatThaiTime } from "@/lib/ui/date";
// SVC R0.4 ▸ คำขอ settings.legal_override แสดงสรุปข้อเสนอ (ค่าก่อน/หลัง/เหตุผล) แทนป้ายกลาง ◂
import { LEGAL_OVERRIDE_ENTITY, legalOverrideSummaries } from "@/lib/core/settings";
// HR H2.3 ▸ คำขอสลับกะ: เพื่อนตอบรับ/ไม่รับ · ผู้ขอยกเลิก (ยังไม่เข้าสาย = ส่วนคำขอสลับกะ · อยู่ในสาย = แถว "คำขอของฉัน") — DTO จาก listMySwaps เท่านั้น
import { employeeOfUser } from "@/lib/modules/hr/service";
import { listMySwaps, SWAP_ENTITY, type SwapItem, type SwapSide } from "@/lib/modules/hr/swap";
import { cancelSwapAction, respondSwapAction } from "@/lib/modules/hr/swap-actions";
const SWAP_STATUS_MAP = { AWAITING_PEER: "รอเพื่อนตอบรับ", PENDING: "รอผู้จัดการ", APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", CANCELLED: "ยกเลิก" };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const sideText = (x: SwapSide | null) =>
  x ? `${new Date(`${x.date}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${x.shiftName} ${hhmm(x.startMin)}–${hhmm(x.endMin)}` : "-";
const swapTitle = (x: SwapItem) => (x.shape === "SWAP" ? `สลับกะ ${x.requester.name} ↔ ${x.target.name}` : `ยกกะ ${x.requester.name} → ${x.target.name}`);
// ◂ HR H2.3

const STATUS_MAP = { PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", CANCELLED: "ยกเลิก" };
const statusTone = (s: string): "muted" | "strong" | "danger" =>
  s === "APPROVED" ? "strong" : s === "REJECTED" || s === "CANCELLED" ? "danger" : "muted";

// รออนุมัติของฉัน (WO-0049): คำขอที่รอผู้ใช้คนนี้ตัดสิน (ตาม role/step) + ปุ่มอนุมัติ/ไม่อนุมัติ
export default async function ApprovalsPage() {
  const auth = await requireTenant();
  const m = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const pending = await listPending({ tenantId: auth.active.tenantId }, m);
  const myRequests = await listMyRequests({ tenantId: auth.active.tenantId }, auth.active.userId);
  // HR H2.3 ▸ คำขอสลับกะของฉัน (ผู้ขอ/ผู้รับ) — ระบบ HR ของพนักงานที่ผูกบัญชีนี้ · ไม่มีพนักงาน = ไม่มีส่วนนี้
  const meEmp = await employeeOfUser(auth.active.tenantId, auth.active.userId);
  const mySwapsRes = meEmp ? await listMySwaps({ tenantId: auth.active.tenantId, systemId: meEmp.systemId }, m) : null;
  const swapSystemId = meEmp?.systemId ?? "";
  const inChainSwap = new Set(myRequests.filter((r) => r.entityType === SWAP_ENTITY && r.status === "PENDING").map((r) => r.entityId));
  const openSwaps = (mySwapsRes?.ok ? mySwapsRes.items : []).filter((x) => x.canRespond || (x.canCancel && !inChainSwap.has(x.id)) || !!x.outcome);
  // ◂ HR H2.3

  // ── POS P1.15U ▸ การ์ด 21A: ชื่อ = payload.title · "<ผู้ขอ> · <เครื่อง> · <n> นาทีที่แล้ว" · เหตุผล · ชิปเกินเพดาน (ถ้า snapshot มีเพดาน) ·
  //    รายละเอียด ผู้ขอ/เครื่อง/เวลา/เหตุผล/ถ้าอนุมัติ · บรรทัดนโยบาย (ชื่อกติกา) — คำขออื่นแสดงเหมือนเดิม ◂
  const posIds = [...pending, ...myRequests].filter((r) => r.entityType.startsWith("POS_")).map((r) => r.id);
  const [cards, policies, tp, tr] = await Promise.all([
    posApprovalCards(auth.active.tenantId, posIds),
    posIds.length ? listPolicies({ tenantId: auth.active.tenantId }) : Promise.resolve([]),
    getTranslations("pos.register.approval.card"),
    getTranslations("pos.register"),
  ]);
  const legalIds = [...pending, ...myRequests].filter((r) => r.entityType === LEGAL_OVERRIDE_ENTITY).map((r) => r.id);
  const legalSummaries = legalIds.length ? await legalOverrideSummaries({ tenantId: auth.active.tenantId }, legalIds, m) : new Map();
  const policyName = new Map(policies.map((p) => [p.id, p.name]));
  const now = Date.now();
  const roleText = (r: string | null) => (r === "OWNER" ? tr("roles.owner") : r === "MANAGER" ? tr("roles.manager") : r ? tr("roles.cashier") : "");
  const pct = (bp: number) => String(Number((bp / 100).toFixed(2)));
  const posCard = (r: { id: string; createdAt: Date; amountSatang: number | null; policyId: string }, c: PosApprovalCard) => {
    const ago = tp("minutesAgo", { n: Math.max(0, Math.floor((now - r.createdAt.getTime()) / 60_000)) });
    const amount = r.amountSatang ?? 0;
    const title = c.kind === "POS_REFUND" && c.receiptNo ? `${c.title ?? ""} · ${c.receiptNo}` : (c.title ?? "");
    const ifApproved =
      c.kind === "POS_VOID"
        ? tp("ifVoid", { amount: moneyText(amount) })
        : c.kind === "POS_REFUND"
          ? tp("ifRefund", { amount: moneyText(amount), lines: c.refundLines.join(", ") || "-" })
          : tp("ifDiscount", { pct: pct(c.discountBp ?? 0), amount: moneyText(c.discountSatang ?? amount) });
    return {
      label: title,
      meta: [c.requesterName ?? "-", c.deviceName, ago].filter(Boolean).join(" · "),
      pos: {
        amount: c.kind === "POS_DISCOUNT_OVER" ? `−${moneyText(c.discountSatang ?? amount)}` : moneyText(amount),
        reason: c.reason ? tp("reason", { reason: c.reason }) : null,
        chip: c.kind === "POS_DISCOUNT_OVER" && c.capBp !== null ? tp("overCap", { cap: pct(c.capBp), role: roleText(c.requesterRole) }) : null,
        rows: [
          [tp("rowRequester"), [c.requesterName ?? "-", roleText(c.requesterRole)].filter(Boolean).join(" · ")],
          [tp("rowDevice"), c.deviceName ?? "-"],
          [tp("rowTime"), `${formatThaiTime(r.createdAt)} (${ago})`],
          [tp("rowReason"), c.reason ?? "-"],
          [tp("rowIfApproved"), ifApproved],
        ] as [string, string][],
        policy: policyName.get(r.policyId) ? tp("policy", { name: policyName.get(r.policyId)! }) : null,
        detailLabel: tp("details"),
      },
    };
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="อนุมัติ"
        desc="คำขอที่รอให้คุณตัดสิน และสถานะคำขอที่คุณยื่นเข้าสายอนุมัติ"
      />

      <Section title={`คำขอรอตัดสิน (${pending.length})`} card>
        {pending.length === 0 ? (
          <EmptyState text="ไม่มีคำขอที่รอคุณตัดสินตอนนี้" />
        ) : (
          <BulkApprovals
            items={pending.map((r) => {
              const c = cards.get(r.id);
              const lg = legalSummaries.get(r.id);
              return c
                ? { id: r.id, ...posCard(r, c) }
                : lg
                  ? {
                      id: r.id,
                      label: lg.titleTh,
                      meta: `ขั้นที่ ${r.currentStepOrder} · ยื่นเมื่อ ${r.createdAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`,
                      legal: { codes: lg.codes, lines: lg.lines },
                    }
                  : {
                    id: r.id,
                    label: `${entityLabel(r.entityType)}${r.amountSatang != null ? ` · ${formatBaht(r.amountSatang)}` : ""}`,
                    meta: `ขั้นที่ ${r.currentStepOrder} · ยื่นเมื่อ ${r.createdAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`,
                  };
            })}
          />
        )}
      </Section>

      {/* HR H2.3 ▸ คำขอสลับกะถึงคุณ + คำขอของคุณที่ยังไม่เข้าสายอนุมัติ ◂ */}
      {openSwaps.length > 0 && (
        <Section title={`คำขอสลับกะ (${openSwaps.length})`} card>
          <div className="flex flex-col gap-2">
            {openSwaps.map((x) => (
              <div key={x.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{swapTitle(x)}</span>
                    <StatusChip value={x.status} map={SWAP_STATUS_MAP} tone={statusTone(x.status)} />
                  </div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {sideText(x.from)}
                    {x.to ? ` ↔ ${sideText(x.to)}` : ""}
                  </div>
                  {x.reason ? <div className="text-xs text-[color:var(--color-muted)]">เหตุผล: {x.reason}</div> : null}
                  {x.outcome ? <div className="text-xs text-[color:var(--color-danger)]">{x.outcome}</div> : null}
                </div>
                {x.canRespond && (
                  <div className="flex shrink-0 items-center gap-2" data-testid={`hr-swap-respond-${x.id}`}>
                    <ConfirmDialog
                      triggerLabel="รับกะนี้"
                      triggerClassName="btn-sm min-h-11"
                      title="รับคำขอสลับกะนี้?"
                      detail="ตอบรับแล้วคำขอจะไปรอผู้จัดการอนุมัติ — ตารางกะเปลี่ยนเมื่ออนุมัติแล้วเท่านั้น"
                      confirmLabel="ยืนยันรับ"
                      action={respondSwapAction}
                      fields={{ systemId: swapSystemId, swapId: x.id, accept: "1" }}
                      testId={`hr-swap-respond-${x.id}-accept`}
                    />
                    <ConfirmDialog
                      triggerLabel="ไม่รับ"
                      triggerClassName="btn-sm min-h-11"
                      title="ไม่รับคำขอสลับกะนี้?"
                      detail="คำขอจะถูกปิด — เพื่อนต้องยื่นคำขอใหม่ถ้ายังต้องการสลับ"
                      confirmLabel="ยืนยันไม่รับ"
                      danger
                      action={respondSwapAction}
                      fields={{ systemId: swapSystemId, swapId: x.id, accept: "0" }}
                      testId={`hr-swap-respond-${x.id}-decline`}
                    />
                  </div>
                )}
                {x.canCancel && !inChainSwap.has(x.id) && (
                  <div className="flex shrink-0 items-center gap-2" data-testid={`hr-swap-cancel-${x.id}`}>
                    <ConfirmDialog
                      triggerLabel="ยกเลิกคำขอสลับกะ"
                      triggerClassName="btn-sm min-h-11"
                      title="ยกเลิกคำขอสลับกะนี้?"
                      detail="คำขอจะถูกยกเลิก — ตารางกะไม่เปลี่ยน"
                      confirmLabel="ยืนยันยกเลิก"
                      danger
                      action={cancelSwapAction}
                      fields={{ systemId: swapSystemId, swapId: x.id }}
                      testId={`hr-swap-cancel-${x.id}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`คำขอของฉัน (${myRequests.length})`} card>
        {myRequests.length === 0 ? (
          <EmptyState text="คุณยังไม่มีคำขอที่ยื่นเข้าสายอนุมัติ" />
        ) : (
          <div className="flex flex-col gap-2">
            {myRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {cards.get(r.id)?.title ?? legalSummaries.get(r.id)?.titleTh ?? entityLabel(r.entityType)}
                      {r.amountSatang != null ? ` · ${formatBaht(r.amountSatang)}` : ""}
                    </span>
                    <StatusChip value={r.status} map={STATUS_MAP} tone={statusTone(r.status)} />
                  </div>
                  <div className="truncate text-xs text-[color:var(--color-muted)]">
                    {r.policyName ? `${r.policyName} · ` : ""}
                    {r.status === "PENDING" && r.totalSteps > 0
                      ? `ขั้นที่ ${r.currentStepOrder}/${r.totalSteps} · `
                      : ""}
                    ยื่นเมื่อ{" "}
                    {r.createdAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                  </div>
                </div>
                {/* HR H0.7 ▸ R5: คำขอที่เป็นใบลา → ยกเลิกทั้งใบลา + คำขอผ่าน cancelLeaveAction (เดิมยกเลิกแค่คำขอ ใบลาค้าง "รออนุมัติ") ◂ */}
                {r.status === "PENDING" && r.entityType === "HrLeave" && r.systemId && (
                  <div className="flex shrink-0 items-center gap-2" data-testid={`hr-leave-cancel-${r.entityId}`}>
                    <ConfirmDialog
                      triggerLabel="ยกเลิกใบลา"
                      triggerClassName="btn-sm min-h-11"
                      title="ยกเลิกใบลานี้?"
                      detail="ใบลาจะถูกยกเลิกและออกจากสายอนุมัติ — ถ้ายังต้องลา ให้ยื่นใบใหม่"
                      confirmLabel="ยืนยันยกเลิกใบลา"
                      danger
                      action={cancelLeaveAction}
                      fields={{ systemId: r.systemId, leaveId: r.entityId }}
                      testId={`hr-leave-cancel-${r.entityId}`}
                    />
                  </div>
                )}
                {/* HR H2.3 ▸ คำขอสลับกะในสาย → ยกเลิกทั้งคำขอสลับ + คำขออนุมัติผ่าน cancelSwapAction (ใต้ล็อกต่อคำขอ) ◂ */}
                {r.status === "PENDING" && r.entityType === SWAP_ENTITY && r.systemId && (
                  <div className="flex shrink-0 items-center gap-2" data-testid={`hr-swap-cancel-${r.entityId}`}>
                    <ConfirmDialog
                      triggerLabel="ยกเลิกคำขอสลับกะ"
                      triggerClassName="btn-sm min-h-11"
                      title="ยกเลิกคำขอสลับกะนี้?"
                      detail="คำขอจะถูกยกเลิกและออกจากสายอนุมัติ — ตารางกะไม่เปลี่ยน"
                      confirmLabel="ยืนยันยกเลิก"
                      danger
                      action={cancelSwapAction}
                      fields={{ systemId: r.systemId, swapId: r.entityId }}
                      testId={`hr-swap-cancel-${r.entityId}`}
                    />
                  </div>
                )}
                {r.status === "PENDING" && r.entityType !== "HrLeave" && r.entityType !== SWAP_ENTITY /* HR H2.3 */ && (
                  <div className="flex shrink-0 items-center gap-2">
                    <ConfirmDialog
                      triggerLabel="ยกเลิกคำขอ"
                      triggerClassName="btn-sm"
                      title="ยกเลิกคำขอนี้?"
                      detail={`${entityLabel(r.entityType)}${r.amountSatang != null ? ` · ${formatBaht(r.amountSatang)}` : ""} — คำขอจะถูกยกเลิกและออกจากสายอนุมัติ`}
                      confirmLabel="ยืนยันยกเลิก"
                      danger
                      action={cancelMyRequestAction}
                      fields={{ requestId: r.id }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
