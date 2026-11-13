// HR H2.10 ▸ "เงินเดือน": สลิปของตัวเอง (รอบที่อนุมัติ/จ่ายแล้ว · ลิงก์ไปหน้าสลิปเดิม) · เบิกล่วงหน้า · ช่องหนังสือรับรอง (H3.8) ◂
import { requireTenant } from "@/lib/core/context";
import { myDocuments, mySelf, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfPay } from "@/lib/modules/hr/self-ui";
import { MyTaxCertCard } from "@/lib/modules/hr/filings/ui"; // HR H3.6 ▸ หนังสือรับรอง 50 ทวิ ของตัวเอง ◂
import { MySalaryCertCard, MySlipYears } from "@/lib/modules/hr/payslip-ui"; // HR H3.8 ▸ สลิปแยกตามปีภาษี + หนังสือรับรองเงินเดือนของฉัน ◂

export default async function MeHrPayPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) { // HR H3.8 ▸ ?sc=<รหัสผล> (allowlist ใน payslip-ui) ◂
  const sp = await searchParams; // HR H3.8 ◂
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const [self, docs] = await Promise.all([mySelf(a), myDocuments(a)]);
  if (!self.ok || !docs.ok) return <SelfEmpty />;
  return (
    <>
      <SelfPay docs={docs} canWrite={self.active} />
      <MySlipYears /> {/* HR H3.8 ◂ */}
      <MySalaryCertCard canWrite={self.active} sc={typeof sp.sc === "string" ? sp.sc : undefined} /> {/* HR H3.8 ◂ */}
      <MyTaxCertCard /> {/* HR H3.6 ◂ */}
    </>
  ); // HR H3.6 ◂
}
