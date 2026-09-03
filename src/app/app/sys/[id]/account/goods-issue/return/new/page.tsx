// WO 1.6 §5.2 J — ใบส่งคืนเบิกสินค้า (RPR) wizard 2 ขั้น: ① เลือก PRR (ใบเบิกที่อนุมัติแล้ว) → ② กรอกจำนวนที่คืน
import { notFound } from "next/navigation";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { listContacts, STATUS_LABEL } from "@/lib/modules/account/service";
import { presetRangeBkk } from "@/lib/modules/account/list-tabs";
import {
  listGoodsIssuePaged,
  getGoodsIssueDoc,
  returnableQtyForIssueNow,
  qtyText,
} from "@/lib/modules/account/product";
import { AdjustWizardStep1 } from "@/components/account-v2/AdjustWizardStep1";
import GoodsReturnEditor from "@/lib/modules/account/GoodsReturnEditor";
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ref?: string;
    preset?: string;
    from?: string;
    to?: string;
    contactId?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.product.manage");
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/goods-issue/return/new`;
  const goodsListHref = `${base}/goods-issue`;

  // ── ขั้น ② — เลือก PRR แล้ว (`?ref=`) ──
  if (sp.ref) {
    const prr = await getGoodsIssueDoc(tenantId, systemId, sp.ref);
    if (!prr || prr.status !== "ISSUED") notFound();
    const remaining = await returnableQtyForIssueNow(tenantId, systemId, prr.id);
    const lines = prr.lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId as string,
        name: l.product?.name ?? l.description,
        sku: l.product?.sku ?? null,
        issuedQty: Number(l.qty),
        remainingQty: remaining.get(l.productId as string) ?? 0,
      }));
    return (
      <GoodsReturnEditor
        systemId={systemId}
        prr={{ id: prr.id, docNo: prr.docNo, contactId: prr.contactId, contactName: prr.contact?.name ?? null }}
        lines={lines}
        cancelHref={goodsListHref}
        refChipHref={goodsListHref}
      />
    );
  }

  // ── ขั้น ① — เลือก PRR อ้างอิง ──
  const preset = (sp.preset as DateRangePreset | undefined) ?? "this_year";
  const range = preset === "custom" ? { from: sp.from, to: sp.to } : presetRangeBkk(preset);
  const [contacts, page] = await Promise.all([
    listContacts(tenantId, systemId),
    listGoodsIssuePaged(tenantId, systemId, {
      docType: "GOODS_ISSUE",
      status: "ISSUED",
      contactId: sp.contactId || undefined,
      from: range.from,
      to: range.to,
      q: sp.q || undefined,
      page: sp.page ? Number.parseInt(sp.page, 10) || 1 : 1,
      pageSize: 20,
    }),
  ]);

  return (
    <AdjustWizardStep1
      pathname={pathname}
      docLabel="ใบส่งคืนเบิกสินค้า"
      refTypeOptions={[{ value: "GOODS_ISSUE", label: "ใบเบิกสินค้า (PRR)" }]}
      refDocType="GOODS_ISSUE"
      contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
      filters={{ contactId: sp.contactId, preset, from: sp.from, to: sp.to, q: sp.q }}
      rows={page.rows.map((r) => ({
        id: r.id,
        docNo: r.docNo,
        issueDate: r.issueDate,
        amountText: qtyText(r.lines.reduce((s, l) => s + Number(l.qty), 0)),
        statusLabel: STATUS_LABEL[r.status] ?? r.status,
      }))}
      page={page.page}
      pageCount={page.pageCount}
      total={page.total}
      amountColLabel="จำนวนที่เบิก"
      showOutstanding={false}
      cancelHref={goodsListHref}
    />
  );
}
