import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { listContacts } from "@/lib/modules/account/service";
import {
  listProducts,
  listGoodsMovements,
  qtyText,
} from "@/lib/modules/account/product";
import GoodsIssueEditor from "@/lib/modules/account/GoodsIssueEditor";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import DataList from "@/components/ui/DataList";
import EmptyState from "@/components/ui/EmptyState";

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
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="เบิก/คืนสินค้า"
        back={{ href: base, label: "ระบบบัญชี" }}
        desc="ตัดหรือคืนจำนวนสต็อกของสินค้า (ยังไม่ลงบัญชีมูลค่าคลัง — จะทำในเฟสถัดไป)"
        actions={
          <Link href={`${base}/products`} className="text-sm text-[color:var(--color-muted)] underline">
            จัดการสินค้า →
          </Link>
        }
      />

      {ok && <p className="text-sm text-[color:var(--color-ink)]">บันทึกแล้ว: {ok}</p>}
      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}

      <GoodsIssueEditor systemId={systemId} products={goods} contacts={contacts.map((c) => ({ id: c.id, name: c.name }))} />

      {/* สต็อกคงเหลือ + ความเคลื่อนไหวต่อสินค้า */}
      <Section title="สต็อกคงเหลือ (สินค้า)">
        {goods.length === 0 ? (
          <EmptyState text="ยังไม่มีสินค้าประเภท “สินค้า” — เพิ่มสินค้าในหน้าจัดการสินค้าก่อน" action={{ href: `${base}/products`, label: "จัดการสินค้า" }} />
        ) : (
          <div className="flex flex-col gap-2">
            {goods.map((p) => {
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
            })}
          </div>
        )}
      </Section>

      {/* เอกสารเบิก/คืนล่าสุด */}
      <Section title="เอกสารล่าสุด">
        <DataList
          items={movements.map((d) => ({
            key: d.id,
            primary: `${d.docNo ?? "—"} · ${d.docType === "GOODS_ISSUE" ? "ใบเบิกสินค้า" : "ใบส่งคืน"}`,
            secondary: `${d.contact?.name ? `${d.contact.name} · ` : ""}${d.lines
              .map((l) => `${l.product?.name ?? l.description} ×${qtyText(l.qty)}`)
              .join(", ")}`,
            trailing: <span className="text-xs text-[color:var(--color-muted)]">{fmt(d.issueDate)}</span>,
          }))}
          empty="ยังไม่มีเอกสารเบิก/คืน — บันทึกการเบิกออกด้านบนเพื่อเริ่ม"
        />
      </Section>
    </div>
  );
}
