// crm-link.ts — แปลง "ลิงก์ของใบแจ้งเตือน CRM" (data.link ของ push · `crmNotifLink` ฝั่งเว็บ) → เส้นทางของจอ CRM ในแอป (ใบ C3.7)
// 🔴 ฟังก์ชันบริสุทธิ์ ไม่มี import (ข้อสอบ S4.2 import ไฟล์นี้ตรงจาก node) · รับเฉพาะลิงก์สัมพัทธ์ของเว็บเราเอง
//    `/app/sys/<systemId>/crm/…` — URL เต็ม (โดเมนอื่น/ของเราเอง) · `//host` · ลิงก์แชท/โมดูลอื่น = null (ตัวจัดการแชทเดิมทำต่อ)
// รูปที่เว็บส่ง: `/app/sys/<id>/crm<path>?n=<คีย์>&nd=<วันไทย>&r=<รหัสระเบียน>` (path: /deals/<id> · /activities · /contacts/<id> ·
//   /companies/<id> · /deals) และ `/app/sys/<id>?n=…` (โควตา → หน้าแรก CRM)
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function queryOf(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of q.split("&")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i);
    const v = part.slice(i + 1);
    if (ID.test(k) && ID.test(v)) out[k] = v;
  }
  return out;
}

export function crmRouteFromLink(link: string): string | null {
  if (typeof link !== "string") return null;
  const s = link.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return null;
  const m = /^\/app\/sys\/([A-Za-z0-9_-]{1,64})(\/crm(\/[A-Za-z0-9_/-]*)?)?(?:\?([^#]*))?(?:#.*)?$/.exec(s);
  if (!m) return null;
  const sys = m[1];
  const q = queryOf(m[4] ?? "");
  if (!m[2]) return q.n ? `/crm?systemId=${sys}` : null; // หน้าแรกของระบบ = เฉพาะใบของ CRM (มีคีย์ n)
  const parts = (m[3] ?? "").split("/").filter(Boolean);
  if (parts[0] === "deals" && parts[1] && ID.test(parts[1])) return `/crm?systemId=${sys}&dealId=${parts[1]}`;
  if (parts[0] === "activities") return q.r ? `/crm/tasks?systemId=${sys}&taskId=${q.r}` : `/crm/tasks?systemId=${sys}`;
  return `/crm?systemId=${sys}`;
}
