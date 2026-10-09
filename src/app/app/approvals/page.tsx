import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { listPending, listMyRequests, listPolicies } from "@/lib/modules/approval/service";
import { cancelMyRequestAction } from "@/lib/modules/approval/actions";
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

  // ── POS P1.15U ▸ การ์ด 21A: ชื่อ = payload.title · "<ผู้ขอ> · <เครื่อง> · <n> นาทีที่แล้ว" · เหตุผล · ชิปเกินเพดาน (ถ้า snapshot มีเพดาน) ·
  //    รายละเอียด ผู้ขอ/เครื่อง/เวลา/เหตุผล/ถ้าอนุมัติ · บรรทัดนโยบาย (ชื่อกติกา) — คำขออื่นแสดงเหมือนเดิม ◂
  const posIds = [...pending, ...myRequests].filter((r) => r.entityType.startsWith("POS_")).map((r) => r.id);
  const [cards, policies, tp, tr] = await Promise.all([
    posApprovalCards(auth.active.tenantId, posIds),
    posIds.length ? listPolicies({ tenantId: auth.active.tenantId }) : Promise.resolve([]),
    getTranslations("pos.register.approval.card"),
    getTranslations("pos.register"),
  ]);
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
              return c
                ? { id: r.id, ...posCard(r, c) }
                : {
                    id: r.id,
                    label: `${entityLabel(r.entityType)}${r.amountSatang != null ? ` · ${formatBaht(r.amountSatang)}` : ""}`,
                    meta: `ขั้นที่ ${r.currentStepOrder} · ยื่นเมื่อ ${r.createdAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`,
                  };
            })}
          />
        )}
      </Section>

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
                      {cards.get(r.id)?.title ?? entityLabel(r.entityType)}
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
                {r.status === "PENDING" && (
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
