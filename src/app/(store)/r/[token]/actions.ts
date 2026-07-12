"use server";

import { redirect } from "next/navigation";
import { issuePublicTaxInvoice } from "@/lib/modules/account/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function requestTaxInvoiceAction(fd: FormData) {
  const token = str(fd, "token");
  const res = await issuePublicTaxInvoice(token, {
    name: str(fd, "name"),
    taxId: str(fd, "taxId"),
    branchCode: str(fd, "branchCode") || null,
    address: str(fd, "address") || null,
    phone: str(fd, "phone") || null,
    email: str(fd, "email") || null,
  });
  if (!res.ok) redirect(`/r/${encodeURIComponent(token)}?err=${encodeURIComponent(res.reason)}`);
  // R-D: บันทึกเป็นคำขอ (staff อนุมัติก่อนออกเลข) — ถ้าออกใบไปแล้วโชว์เลขเดิม
  if (res.docNo) redirect(`/r/${encodeURIComponent(token)}?issued=${encodeURIComponent(res.docNo)}`);
  redirect(`/r/${encodeURIComponent(token)}?requested=1`);
}
