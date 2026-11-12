// HR H2.10 ▸ โครงหน้า "ของฉัน" (/app/me/hr) — แถบแท็บ 5 ช่องเฉพาะบัญชีที่ผูกกับพนักงาน · พ้นสภาพ = แถบแจ้ง (อ่านประวัติได้ ยื่นใหม่ไม่ได้)
//   ตัวตนจากเซสชันเท่านั้น (hr/self.ts) · layout ไม่รับ searchParams (Next 16) ◂
import { requireTenant } from "@/lib/core/context";
import { mySelf, selfActorOf } from "@/lib/modules/hr/self";
import { SelfShell } from "@/lib/modules/hr/self-ui";

export default async function MeHrLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireTenant();
  const me = await mySelf(selfActorOf(auth));
  return (
    <SelfShell linked={me.ok} ended={me.ok && !me.active}>
      {children}
    </SelfShell>
  );
}
