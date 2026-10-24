// route.ts — POS P4.3 ▸ F-P3-22 · CD-P43-O8 (OP §HF-FU2 RPT-6): รายงานแบบพิมพ์เป็นเอกสาร text/html ทั้งหน้า (ไม่มีเปลือกแอป/iframe) ◂
//   GET /app/sys/<POS>/pos/reports/print/html?kind=&from=&to=&unit=&locale=&noprint= — query เดียวกับหน้าพิมพ์ /pos/reports/print
//   เนื้อ = posReportPrintAction ตรงตัว (ตัวอ่านรายงานเดิม · ไม่มี SQL ใหม่ · CSS พิมพ์ของ renderReportPrintHtml) · kind=overview = ต่อหลายส่วนด้วย combine (print-doc.ts ตัวเดียวกับหน้า)
//   + สคริปต์สั่ง print() หลังฟอนต์พร้อม (noprint=1 = ไม่สั่ง) · สคริปต์ผูก nonce ของ CSP (สคริปต์อื่นในเอกสารไม่ทำงาน)
// 🔴 ด่านของตัวเอง (route ไม่ผ่าน layout ของหน้า): ไม่มี session = 401 · ไม่มีร้าน/ร้านถูกระงับ = 403 · ระบบไม่ใช่ POS ของร้าน/ไม่มีสาขาที่เข้าได้ = 404 ·
//    ไม่มี pos.report.view ที่สาขาใดเลย = 403 ก่อนเรียกตัวอ่าน · คำปฏิเสธของตัวอ่าน → PERMISSION_DENIED 403 · VALIDATION 400 · NOT_FOUND 404 · อื่น 500
//    ?unit= รับเฉพาะสาขาที่ดูรายงานได้ (ไม่ใช่ = ทุกสาขาในขอบเขต — ตัวอ่านตัดขอบเขตเอง) · no-store + noindex
import { randomBytes } from "node:crypto";
import { getAuth } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { isReportKind, REPORT_PERMISSION, type ReportKind } from "@/lib/modules/pos/reports";
import { posReportPrintAction } from "@/lib/modules/pos/report-actions";
import { combine, type Printed } from "../print-doc";

export const dynamic = "force-dynamic";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** สถานะ HTTP ของรหัสปฏิเสธจากตัวอ่าน */
const STATUS_OF: Record<string, number> = { PERMISSION_DENIED: 403, VALIDATION: 400, NOT_FOUND: 404 };
const OVERVIEW_TITLE = { th: "ภาพรวมรายงาน", en: "Report overview" } as const;

/** คำตอบที่ไม่ใช่เอกสาร — ข้อความสั้น (ไม่มีข้อความของเซิร์ฟเวอร์ · ไม่มีข้อมูลร้าน) */
function plain(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

/** ใส่สคริปต์สั่งพิมพ์ (nonce) ก่อน </body> — เอกสารจาก renderReportPrintHtml ไม่มี <script> เอง */
function withPrint(html: string, nonce: string): string {
  const script = `<script nonce="${nonce}">window.addEventListener("load",function(){var go=function(){window.focus();window.print();};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go,go);}else{go();}});</script>\n`;
  const at = html.lastIndexOf("</body>");
  return at < 0 ? `${html}${script}` : `${html.slice(0, at)}${script}${html.slice(at)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth) return plain(401, "Unauthorized");
  const active = auth.active;
  if (!active || active.tenant.status === "SUSPENDED" || active.tenant.status === "CLOSED") return plain(403, "Forbidden");
  const tenantId = active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" }, select: { id: true } });
  if (!sys) return plain(404, "Not found");
  const m = posMembership(active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) return plain(404, "Not found");
  const allowed = units.filter((u) => evaluate(m, { module: "pos", action: REPORT_PERMISSION, unitId: u.id }));
  // ประตู: ไม่มีสิทธิ์รายงานที่สาขาใดเลย = 403 (ก่อนเรียกตัวอ่านใด ๆ)
  if (allowed.length === 0) return plain(403, "Forbidden");

  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const unitRaw = url.searchParams.get("unit") ?? "";
  const unitId = allowed.some((u) => u.id === unitRaw) ? unitRaw : "";
  const locale = url.searchParams.get("locale") === "en" ? "en" : "th";
  if (kindRaw !== "overview" && !isReportKind(kindRaw)) return plain(400, "Bad request");

  const print = async (kind: ReportKind): Promise<Printed | { code: string }> => {
    const r = await posReportPrintAction({ systemId: id, kind, from, to, locale, ...(unitId ? { unitId } : {}) });
    return r.ok ? { html: r.html, title: r.title, generatedAt: r.generatedAt } : { code: r.code };
  };
  let doc: Printed;
  if (kindRaw === "overview") {
    const kinds: ReportKind[] = ["daily", ...(isDate(from) && from === to ? (["hourly"] as const) : []), ...(!unitId && allowed.length > 1 ? (["branches"] as const) : []), "channels", "payments", "staff"];
    const got = await Promise.all(kinds.map((k) => print(k)));
    const head = got[0]!;
    if ("code" in head) return plain(STATUS_OF[head.code] ?? 500, STATUS_OF[head.code] ? head.code : "Error");
    const parts = got.filter((g): g is Printed => !("code" in g));
    doc = { html: combine(parts, OVERVIEW_TITLE[locale]), title: OVERVIEW_TITLE[locale], generatedAt: head.generatedAt };
  } else {
    const r = await print(kindRaw as ReportKind);
    if ("code" in r) return plain(STATUS_OF[r.code] ?? 500, STATUS_OF[r.code] ? r.code : "Error");
    doc = r;
  }

  const nonce = randomBytes(16).toString("base64");
  const html = url.searchParams.get("noprint") === "1" ? doc.html : withPrint(doc.html, nonce);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    },
  });
}
