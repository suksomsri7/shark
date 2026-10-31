"use server";
// SVC B.17 ▸ action สาธารณะของหน้าจอง: เข้า/ออก waitlist "แจ้งฉันถ้ามีคิวว่าง" — ลิงก์ตัวตน LINE (who) = สิทธิ์ (ตรวจใน joinWaitlistOnline/leaveWaitlistOnline) ·
//   rate limit ต่อ IP จาก x-forwarded-for · ผลแสดงผ่านหน้าจองเดิม (redirect กลับพร้อม wl=<รหัส>) · ไม่มีชื่อ/เบอร์ใน URL ◂
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { joinWaitlistOnline, leaveWaitlistOnline } from "@/lib/modules/booking/waitlist";

const field = (fd: FormData, k: string, max: number): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
};

const SLUG_RE = /^[A-Za-z0-9_-]{1,120}$/;

async function clientIp(): Promise<string> {
  return ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

function backTo(tenantSlug: string, unitSlug: string, q: Record<string, string>): never {
  const ok = SLUG_RE.test(tenantSlug) && SLUG_RE.test(unitSlug);
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => !!v));
  redirect(ok ? `/s/${tenantSlug}/${unitSlug}${qs.size ? `?${qs.toString()}` : ""}` : "/");
}

export async function joinWaitlistAction(tenantSlug: string, unitSlug: string, fd: FormData) {
  const serviceId = field(fd, "serviceId", 100);
  const staffRaw = field(fd, "staffId", 100);
  const dateStr = field(fd, "dateStr", 10);
  const who = field(fd, "who", 4096);
  const r = await joinWaitlistOnline(
    { tenantSlug, unitSlug },
    { serviceId, staffId: staffRaw ? staffRaw : null, dateStr, who },
    { ip: await clientIp() },
  );
  backTo(tenantSlug, unitSlug, { svc: serviceId, staff: staffRaw || "any", date: dateStr, who, wl: r.ok ? "joined" : r.code });
}

export async function leaveWaitlistAction(tenantSlug: string, unitSlug: string, fd: FormData) {
  const entryId = field(fd, "entryId", 200);
  const who = field(fd, "who", 4096);
  const r = await leaveWaitlistOnline({ tenantSlug, unitSlug }, { entryId, who }, { ip: await clientIp() });
  backTo(tenantSlug, unitSlug, { who, wl: r.ok ? "left" : r.code });
}
