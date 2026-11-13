// HR H3.8 ▸ สลิปของฉัน (ภาพ 07c) — พนักงานจากเซสชันเท่านั้น (resolveSelf ผ่าน mySelf/mySlip) · เฉพาะสลิปที่ออกแล้ว (อื่น ๆ = 404) ·
//   PDF = <a download> ไปเส้นทาง GET · ย้อนหลัง = สลิปที่ออกแล้วของฉันรอบอื่น · แถบแท็บ "เงินเดือน" มาจาก layout ของ /app/me/hr ◂
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { mySelf, selfActorOf } from "@/lib/modules/hr/self";
import { mySlip } from "@/lib/modules/hr/payslip";
import { SlipCard, SlipDataNotice, mySlipHistory, mySlipPdfHref } from "@/lib/modules/hr/payslip-ui";

export default async function MeHrSlipPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const self = await mySelf(a);
  if (!self.ok) notFound();
  const d = await mySlip(a, { runId });
  if (!d.ok) {
    if (d.code === "SLIP_DATA") return <SlipDataNotice />;
    notFound();
  }
  const history = await mySlipHistory(d.runId);
  return <SlipCard d={d} backHref="/app/me/hr/pay" pdfHref={mySlipPdfHref(d.runId)} certHref="/app/me/hr/pay#hr-salarycert-mine" history={history} />;
}
