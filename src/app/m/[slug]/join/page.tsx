// /m/[slug]/join — สมัครสมาชิกผ่านลิงก์ของร้าน (LIFF · WebView แอป · เบราว์เซอร์ — M3.11 · ภาพ 29 ก/ข)
//
// หน้านี้ **ไม่ต้องล็อกอิน** (คนที่มาคือคนที่ยังไม่เป็นสมาชิก) — ทุกค่าที่วาดมาจากร้านจริง:
//   ชื่อร้าน/โลโก้ (ธีมกิจการ) · ฟอร์มที่ร้านตั้ง + ยินยอม 4 ช่อง + นโยบายฉบับปัจจุบัน + แต้มต้อนรับ (`joinForm`)
//   · ชื่อลิงก์ที่มาเมื่อ `?src=` ตรงลิงก์ของร้าน · โค้ดผู้แนะนำจาก `?ref=` (ตรวจจริงในหน้าจอ)
// 🔴 ไม่นับคนเปิดลิงก์ที่นี่ — `startJoin` นับให้ตอนขอรหัส (ข้อตัดสิน M3.10 ข้อ 7 · นับที่นี่ด้วย = นับ 2)
// 🔴 คนที่เป็นสมาชิกร้านนี้และล็อกอินอยู่แล้ว เปิดลิงก์สมัครซ้ำ → ขึ้น "คุณเป็นสมาชิกอยู่แล้ว" แทนฟอร์ม
// 🔴 `?line=` ที่ `loginWithLine` แนบมาเป็นค่าที่ **ยังไม่ได้ตรวจ** — ไม่ใช้ผูกอะไรทั้งนั้น (ผูก LINE ผ่านปุ่ม LINE เท่านั้น)
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getBrandingTokens } from "@/lib/branding/service";
import { joinForm, resolveJoinTarget, type JoinTarget } from "@/lib/modules/member/join";
import { listLinks } from "@/lib/modules/member/sources";
import { customerCookieName, getCustomerSession } from "@/lib/modules/member/customer-session";
import type { JoinFormView, JoinSourceView } from "@/lib/modules/member/join-shared";
import { JoinFlow, JoinUnavailable } from "@/components/member/JoinFlow";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim().slice(0, 40) : "";
}

export default async function MemberJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const src = one(sp.src);
  const ref = one(sp.ref).toUpperCase();

  let target: JoinTarget;
  try {
    target = await resolveJoinTarget(slug);
  } catch (e) {
    // ร้านไม่มีจริง = 404 · ร้านมีแต่ยังไม่เปิดระบบสมาชิก = หน้าแจ้งสุภาพ (ไม่ใช่หน้าพัง)
    const msg = e instanceof Error ? e.message : "";
    if (/ไม่พบร้าน/.test(msg)) notFound();
    return <JoinUnavailable message={msg || "ร้านนี้ยังไม่ได้เปิดรับสมัครสมาชิกออนไลน์ — สอบถามพนักงานที่ร้านได้เลย"} />;
  }

  // ร้าน 3 แหล่งไม่ขึ้นแก่กัน → ยิงพร้อมกัน (หน้านี้เปิดในไลน์ ต้องขึ้นไว)
  const jar = await cookies();
  const token = jar.get(customerCookieName())?.value ?? "";
  const [form, brand, links, session] = await Promise.all([
    joinForm(slug),
    getBrandingTokens(target.tenantId).catch(() => null),
    src ? listLinks(target).catch(() => []) : Promise.resolve([]),
    token ? getCustomerSession(token) : Promise.resolve(null),
  ]);

  const link = src ? links.find((l) => l.code === src && l.active) : undefined;
  const source: JoinSourceView | null = link ? { code: link.code, name: link.name } : null;
  const view: JoinFormView = {
    shopName: form.shopName,
    fields: form.fields,
    consents: form.consents,
    policyVersion: form.policyVersion,
    policyHtml: form.policyHtml,
    welcomePoints: form.welcomePoints,
    referralEnabled: form.referralEnabled,
  };
  const alreadyMember = !!session && session.tenantId === target.tenantId;
  const liffId = process.env.LINE_LIFF_ID ?? "";
  // ปุ่ม LINE ใช้ได้จริงต้องมีครบ 2 อย่าง: LIFF (ฝั่งหน้าจอ) + channel id (ฝั่ง server ตรวจ id_token)
  const lineReady = !!liffId && !!process.env.LINE_CHANNEL_ID;

  return (
    <JoinFlow
      slug={target.slug}
      form={view}
      logoUrl={brand?.logoUrl ?? null}
      displayName={brand?.displayName || form.shopName}
      source={source}
      srcCode={src || null}
      initialRef={ref || null}
      liffId={lineReady ? liffId : ""}
      alreadyMember={alreadyMember}
      // มาจากปุ่ม "เข้าสู่ระบบด้วย LINE" ที่ยังไม่ผูกสมาชิก → เริ่มขั้น LINE ให้เลย (ค่า `line` ใช้เป็นแค่สัญญาณ ไม่ใช้เป็นตัวตน)
      autoLine={!!one(sp.line)}
    />
  );
}
