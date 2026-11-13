"use server";

import { redirect } from "next/navigation";
import { issuePublicTaxInvoice } from "@/lib/modules/account/service";
import { accountRateGuard, publicClientIp } from "@/lib/modules/account/rate-limit";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function requestTaxInvoiceAction(fd: FormData) {
  const token = str(fd, "token");
  // WO 9.2 ข้อ 4/11 — ฟอร์มสาธารณะ ไม่ต้องล็อกอิน ⇒ ต้องมีเพดานต่อ IP
  const rate = await accountRateGuard("publicSubmit", await publicClientIp());
  if (!rate.ok) redirect(`/r/${encodeURIComponent(token)}?err=${encodeURIComponent(rate.reason)}`);
  const res = await issuePublicTaxInvoice(token, {
    name: str(fd, "name"),
    taxId: str(fd, "taxId"),
    branchCode: str(fd, "branchCode") || null,
    address: str(fd, "address") || null,
    phone: str(fd, "phone") || null,
    email: str(fd, "email") || null,
    // ACC T3 (A5) ▸ ประเภทผู้ซื้อที่ลูกค้าเลือก ◂
    legalType: str(fd, "legalType") === "COMPANY" ? "COMPANY" : str(fd, "legalType") === "PERSON" ? "PERSON" : null,
  });
  if (!res.ok) redirect(`/r/${encodeURIComponent(token)}?err=${encodeURIComponent(res.reason)}`);
  // R-D: บันทึกเป็นคำขอ (staff อนุมัติก่อนออกเลข) — ถ้าออกใบไปแล้วโชว์เลขเดิม
  if (res.docNo) redirect(`/r/${encodeURIComponent(token)}?issued=${encodeURIComponent(res.docNo)}`);
  redirect(`/r/${encodeURIComponent(token)}?requested=1`);
}
