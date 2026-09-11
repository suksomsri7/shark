// /m/[slug] — ทางเข้าหลักของหน้าลูกค้า (ลิงก์ LIFF / QR ของร้านชี้มาที่นี่)
// ล็อกอินแล้ว → บัตรสมาชิก · ยังไม่ล็อกอิน → `requireCustomer` พาไปหน้าเข้าสู่ระบบเอง
// M3.11 — ยังไม่ล็อกอิน + มากับลิงก์ที่มา `?src=` (ลิงก์/QR จากหน้าตั้งค่าที่มา = `/m/<slug>?src=<code>`) หรือ `?ref=`
//         → หน้าสมัคร 3 ขั้นพร้อมพารามิเตอร์เดิม (คนที่สแกน QR สมัครสมาชิกต้องเจอหน้าสมัคร ไม่ใช่หน้าเข้าสู่ระบบ
//         และที่มา/ผู้แนะนำต้องไม่หลุดระหว่างทาง) · สมาชิกที่ล็อกอินอยู่แล้วยังไปบัตรเหมือนเดิม
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { customerCookieName, getCustomerSession, requireCustomer } from "@/lib/modules/member/customer-session";
import { resolveJoinTarget } from "@/lib/modules/member/join";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim().slice(0, 40) : "";
}

export default async function MemberHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const src = one(sp.src);
  const ref = one(sp.ref);
  if (src || ref) {
    const jar = await cookies();
    const token = jar.get(customerCookieName())?.value ?? "";
    const [session, target] = await Promise.all([
      token ? getCustomerSession(token) : Promise.resolve(null),
      resolveJoinTarget(slug).catch(() => null),
    ]);
    // session ของร้านอื่น = เหมือนไม่มี session (ลิงก์ข้ามร้านต้องไม่พาข้อมูลข้ามไปด้วย)
    if (target && (!session || session.tenantId !== target.tenantId)) {
      const q = new URLSearchParams();
      if (src) q.set("src", src);
      if (ref) q.set("ref", ref);
      redirect(`/m/${encodeURIComponent(slug)}/join?${q.toString()}`);
    }
  }
  await requireCustomer(slug);
  redirect(`/m/${slug}/card`);
}
