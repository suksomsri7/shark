import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16: `proxy` แทน `middleware` (ดู AGENTS.md)
// หน้าที่ Stage A: resolve tenant จาก custom domain / subdomain → header ให้ app อ่าน
// + วาง security headers พื้นฐาน (SECURITY §8 ขยายต่อภายหลัง)
//
// ⚠️ ห้ามแตะ DB ที่นี่ — ตัดสินใจ WO-0025 (Custom Domain):
//   อ่าน node_modules/next/dist/docs/.../proxy.md แล้ว: Next 16 proxy default = Node.js runtime
//   *แต่* docs กำชับชัด "you should not attempt relying on shared modules or globals" และ
//   "Proxy is not intended for slow data fetching" → การ import prisma singleton + query DB ใน proxy
//   ผิดคำแนะนำ Next โดยตรง. ยิ่งกว่านั้น adapter จริงคือ PrismaPg (pg/TCP ดู core/db.ts) ซึ่ง
//   รันบน edge ไม่ได้ และ shark.in.th deploy บน Vercel (proxy runtime = platform-specific).
//   นอกจากนี้หน้าร้าน /s/<slug> ยังไม่ถูกสร้าง → ยังไม่มีปลายทางให้ rewrite.
//   → DEFER: คง proxy ให้ edge-safe (แค่ set header) — ตรรกะ host→tenant อยู่ที่ service แล้ว
//     (`resolveTenantByHost` ใน src/lib/domain/service.ts) ทดสอบผ่าน oracle เรียกได้จากชั้น app (Node RSC)
//
// TODO(WO-0025 ต่อ): เมื่อหน้าร้าน /s/<slug> พร้อม ให้ map host→ร้าน ด้วยหนึ่งใน 2 ทาง —
//   (ก) ชั้น app (RSC, Node เต็ม DB) อ่าน header `x-shark-host` แล้วเรียก resolveTenantByHost() เอง
//   (ข) หรือสลับ core/db.ts เป็น @prisma/adapter-neon (serverless HTTP) + ยืนยัน Node runtime บน Vercel
//       ก่อน ค่อยย้าย rewrite ไป /s/<slug> มาที่ proxy นี้

const ROOT_HOSTS = new Set(["shark.in.th", "www.shark.in.th", "localhost"]);

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const res = NextResponse.next();

  // แยก backoffice
  if (host === "backoffice.shark.in.th") {
    res.headers.set("x-shark-surface", "backoffice");
    return applySecurity(res);
  }

  // custom domain / subdomain ของร้าน → ส่ง host ให้ชั้น app resolve เป็น tenant (อ่าน header นี้)
  // (ดูหมายเหตุ DEFER ด้านบน — ชั้น app เรียก resolveTenantByHost() เอง ไม่ทำ DB ใน proxy)
  if (!ROOT_HOSTS.has(host) && host !== "backoffice.shark.in.th" && !host.endsWith(".vercel.app")) {
    res.headers.set("x-shark-host", host);
  }
  res.headers.set("x-shark-surface", "app");
  return applySecurity(res);
}

function applySecurity(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  // ข้าม static/image/asset — กัน proxy บล็อก CSS/JS
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
