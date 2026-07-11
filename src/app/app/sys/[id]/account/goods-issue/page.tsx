import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { listContacts } from "@/lib/modules/account/service";
import {
  listProducts,
  listGoodsMovements,
  qtyText,
} from "@/lib/modules/account/product";
import GoodsIssueEditor from "@/lib/modules/account/GoodsIssueEditor";

const fmt = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

export default async function GoodsIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { id } = await params;
  const { ok, err } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;

  const [allProducts, contacts, movements] = await Promise.all([
    listProducts(tenantId, systemId, { type: "GOODS" }),
    listContacts(tenantId, systemId),
    listGoodsMovements(tenantId, systemId, { take: 100 }),
  ]);
  const goods = allProducts.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    qtyOnHand: Number(p.qtyOnHand),
  }));

  // จัดกลุ่มความเคลื่อนไหวต่อสินค้า (จาก feed เดียว ไม่ N+1)
  type Move = { docNo: string | null; docType: string; issueDate: Date; delta: number };
  const perProduct = new Map<string, Move[]>();
  for (const d of movements) {
    for (const l of d.lines) {
      if (!l.productId) continue;
      const delta = (d.docType === "GOODS_ISSUE" ? -1 : 1) * Number(l.qty);
      const arr = perProduct.get(l.productId) ?? [];
      arr.push({ docNo: d.docNo, docType: d.docType, issueDate: d.issueDate, delta });
      perProduct.set(l.productId, arr);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">เบิก/คืนสินค้า</h1>
        <p className="text-xs text-[color:var(--color-muted)]">
          ตัด/คืนจำนวนสต็อก (qtyOnHand) ของสินค้า — ไม่ลงบัญชี GL (มูลค่าคลังสินค้าจะทำในเฟสถัดไป)
        </p>
        <Link href={`${base}/products`} className="text-xs text-[color:var(--color-muted)] underline">จัดการสินค้า →</Link>
      </div>

      {ok && <p className="text-sm text-[color:var(--color-ink)]">บันทึกแล้ว: {ok}</p>}
      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      <GoodsIssueEditor systemId={systemId} products={goods} contacts={contacts.map((c) => ({ id: c.id, name: c.name }))} />

      {/* สต็อกคงเหลือ + ความเคลื่อนไหวต่อสินค้า */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">สต็อกคงเหลือ (สินค้า)</h2>
        {goods.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินค้าประเภท “สินค้า”</p>
        ) : (
          goods.map((p) => {
            const moves = perProduct.get(p.id) ?? [];
            return (
              <details key={p.id} className="rounded-lg border px-3 py-2 text-sm">
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="font-medium">
                    {p.name}
                    {p.sku && <span className="ml-1 text-xs text-[color:var(--color-muted)]">({p.sku})</span>}
                  </span>
                  <span>คงเหลือ {qtyText(p.qtyOnHand)}</span>
                </summary>
                <div className="mt-2 flex flex-col gap-1">
                  {moves.length === 0 ? (
                    <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีความเคลื่อนไหว</p>
                  ) : (
                    moves.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-[color:var(--color-muted)]">
                          {m.docNo ?? "—"} · {m.docType === "GOODS_ISSUE" ? "เบิกออก" : "ส่งคืน"} · {fmt(m.issueDate)}
                        </span>
                        <span style={{ color: m.delta < 0 ? "var(--color-danger)" : "var(--color-ink)" }}>
                          {m.delta > 0 ? "+" : ""}{qtyText(m.delta)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </details>
            );
          })
        )}
      </section>

      {/* เอกสารเบิก/คืนล่าสุด */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">เอกสารล่าสุด</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสารเบิก/คืน</p>
        ) : (
          movements.map((d) => (
            <div key={d.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {d.docNo ?? "—"} · {d.docType === "GOODS_ISSUE" ? "ใบเบิกสินค้า" : "ใบส่งคืน"}
                </span>
                <span className="text-xs text-[color:var(--color-muted)]">{fmt(d.issueDate)}</span>
              </div>
              <div className="text-xs text-[color:var(--color-muted)]">
                {d.contact?.name ? `${d.contact.name} · ` : ""}
                {d.lines.map((l) => `${l.product?.name ?? l.description} ×${qtyText(l.qty)}`).join(", ")}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
