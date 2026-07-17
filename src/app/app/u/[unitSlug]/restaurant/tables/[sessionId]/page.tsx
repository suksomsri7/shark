import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getSession, floorPlan } from "@/lib/modules/restaurant/table";
import {
  closeSessionAction,
  moveSessionAction,
  mergeSessionAction,
  cancelOrderItemAction,
  rushOrderAction,
  voidCheckoutAction,
} from "@/lib/actions/restaurant";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBaht } from "@/lib/ui/money";

const KDS_LABEL: Record<string, string> = {
  NEW: "รอครัว",
  COOKING: "กำลังทำ",
  READY: "เสร็จแล้ว",
  SERVED: "เสิร์ฟแล้ว",
  CANCELLED: "ยกเลิก",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ unitSlug: string; sessionId: string }>;
}) {
  const { unitSlug, sessionId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  const session = await getSession(tenantId, unit.id, sessionId);
  if (!session) notFound();
  const tables = await floorPlan(tenantId, unit.id);
  const freeTables = tables.filter((t) => !t.sessionId && t.status === "ACTIVE" && t.id !== session.tableId);
  const otherOpen = tables.filter((t) => t.sessionId && t.sessionId !== sessionId);
  const hasPaidItems = session.orders.some((o) => o.items.some((it) => it.saleId));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={`โต๊ะ ${session.table.name}`}
        desc={session.status === "OPEN" ? "กำลังใช้งาน" : "ปิดแล้ว"}
        back={{ href: `/app/u/${unitSlug}/restaurant`, label: "ร้านอาหาร · หน้างาน" }}
      />

      {/* สรุปยอด */}
      <section className="card flex items-center justify-between">
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">ยอดรวม / ค้างชำระ</div>
          <div className="text-xl font-semibold">
            {formatBaht(session.totalSatang)}{" "}
            <span className="text-sm font-normal text-[color:var(--color-muted)]">ค้าง {formatBaht(session.unpaidSatang)}</span>
          </div>
          {session.memberId && <div className="text-xs text-[color:var(--color-muted)]">สะสมแต้ม: ผูกสมาชิกแล้ว</div>}
        </div>
        <div className="flex flex-col gap-2">
          <Link href={`/app/u/${unitSlug}/restaurant/order?sessionId=${sessionId}`} className="btn btn-ghost text-sm">
            + สั่งเพิ่ม
          </Link>
          {session.unpaidSatang > 0 && (
            <Link href={`/app/u/${unitSlug}/restaurant/checkout/${sessionId}`} className="btn btn-primary text-sm">
              เช็คบิล
            </Link>
          )}
        </div>
      </section>

      {/* รายการ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">รายการอาหาร</h2>
        {session.orders.length === 0 ? (
          <EmptyState text="ยังไม่มีออเดอร์ — กด “สั่งเพิ่ม” เพื่อคีย์รายการอาหาร" />
        ) : (
          session.orders.map((o) => (
            <div key={o.id} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--color-muted)]">
                <span>
                  ออเดอร์ #{String(o.dailyNo).padStart(4, "0")}
                  {o.isRush ? " · เร่ง" : ""}
                </span>
                {!o.isRush && (
                  <form action={rushOrderAction.bind(null, unitSlug)}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button className="btn-sm">เร่ง</button>
                  </form>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {o.items.map((it) => (
                  <div key={it.id} className="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <div className={it.kdsStatus === "CANCELLED" ? "line-through opacity-50" : ""}>
                        {it.qty}× {it.nameSnapshot}
                        {it.options.length > 0 && (
                          <span className="text-xs text-[color:var(--color-muted)]"> ({it.options.map((op) => op.choiceSnapshot).join(", ")})</span>
                        )}
                      </div>
                      <div className="text-xs text-[color:var(--color-muted)]">
                        {KDS_LABEL[it.kdsStatus]} · {formatBaht(it.lineTotal)}
                        {it.saleId ? " · ชำระแล้ว" : ""}
                        {it.note ? ` · ${it.note}` : ""}
                      </div>
                    </div>
                    {!it.saleId && it.kdsStatus !== "CANCELLED" && it.kdsStatus !== "SERVED" && (
                      <ConfirmDialog
                        triggerLabel="ยกเลิก"
                        triggerClassName="btn-sm text-[color:var(--color-danger)]"
                        title="ยกเลิกรายการนี้?"
                        detail="รายการอาหารนี้จะถูกยกเลิกออกจากบิล"
                        confirmLabel="ยืนยันยกเลิก"
                        danger
                        action={cancelOrderItemAction.bind(null, unitSlug)}
                        fields={{ itemId: it.id }}
                        reasonField={{ name: "reason", label: "เหตุผล (ไม่บังคับ)" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* จัดการโต๊ะ */}
      {session.status === "OPEN" && (
        <section className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">จัดการโต๊ะ</h2>
          {freeTables.length > 0 && (
            <form action={moveSessionAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="sessionId" value={sessionId} />
              <span>ย้ายไปโต๊ะ</span>
              <select name="toTableId" className="rounded-lg border px-2 py-2 text-sm">
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button className="btn-sm">ย้าย</button>
            </form>
          )}
          {otherOpen.length > 0 && (
            <form action={mergeSessionAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="intoSessionId" value={sessionId} />
              <span>รวมโต๊ะ (ดึงเข้าโต๊ะนี้)</span>
              <select name="fromSessionId" className="rounded-lg border px-2 py-2 text-sm">
                {otherOpen.map((t) => (
                  <option key={t.sessionId} value={t.sessionId!}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button className="btn-sm">รวม</button>
            </form>
          )}
          {session.unpaidSatang === 0 && (
            <ConfirmDialog
              triggerLabel="ปิดโต๊ะ"
              triggerClassName="btn-sm"
              title="ปิดโต๊ะนี้?"
              detail="โต๊ะจะถูกปิดและว่างพร้อมรับลูกค้าใหม่"
              confirmLabel="ยืนยันปิดโต๊ะ"
              action={closeSessionAction.bind(null, unitSlug)}
              fields={{ sessionId }}
            />
          )}
        </section>
      )}

      {/* ยกเลิกบิล/คืนเงิน — โผล่เมื่อมีรายการที่ชำระแล้ว (รวมโต๊ะที่ปิดแล้ว) */}
      {hasPaidItems && (
        <section className="card flex flex-col gap-2">
          <h2 className="text-sm font-medium">บิลที่ชำระแล้ว</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            ถ้ากดเช็คบิลผิดหรือต้องคืนเงิน — ยกเลิกบิลเพื่อคืนเงินเข้าบัญชี รายการจะกลับมาแก้ไข/คิดใหม่ได้
          </p>
          <ConfirmDialog
            triggerLabel="ยกเลิกบิล/คืนเงิน"
            triggerClassName="btn-sm text-[color:var(--color-danger)]"
            title={`ยกเลิกบิลโต๊ะ ${session.table.name}?`}
            detail="เงินจะถูกคืนเข้าบัญชี รายการอาหารกลับมาแก้ไข/คิดเงินใหม่ได้ และโต๊ะจะเปิดกลับมา"
            confirmLabel="ยืนยันยกเลิกบิล"
            danger
            action={voidCheckoutAction.bind(null, unitSlug)}
            fields={{ sessionId }}
          />
        </section>
      )}
    </div>
  );
}
