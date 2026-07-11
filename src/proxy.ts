import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16: `proxy` แทน `middleware` (ดู AGENTS.md)
// หน้าที่ Stage A: resolve tenant จาก custom domain / subdomain → header ให้ app อ่าน
// + วาง security headers พื้นฐาน (SECURITY §8 ขยายต่อภายหลัง)
// ⚠️ ห้ามใส่ logic หนัก/แตะ DB ที่นี่ (proxy อาจ deploy ที่ CDN edge)

const ROOT_HOSTS = new Set(["shark.in.th", "www.shark.in.th", "localhost"]);

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const res = NextResponse.next();

  // แยก backoffice
  if (host === "backoffice.shark.in.th") {
    res.headers.set("x-shark-surface", "backoffice");
    return applySecurity(res);
  }

  // custom domain / subdomain ของร้าน → resolve เป็น tenant ในชั้น app (อ่าน header นี้)
  if (!ROOT_HOSTS.has(host)) {
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
