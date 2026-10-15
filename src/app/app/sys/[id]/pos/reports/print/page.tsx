import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { posMembership } from "@/lib/modules/pos/access";
import { posUnits } from "@/lib/modules/pos/register";
import { isReportKind, REPORT_PERMISSION, type ReportKind } from "@/lib/modules/pos/reports";
import { posReportPrintAction } from "@/lib/modules/pos/report-actions";
import { PrintFrame } from "./PrintFrame";

// POS P2.12U ▸ มติ 1 — หน้าพิมพ์/PDF ของรายงาน (browser print · brief P2.12 §4 · CD-3)
//   ?kind=&from=&to=&unit=&locale= → posReportPrintAction (สิทธิ์/ขอบเขต/ช่วงวันตรวจในตัวอ่านเดิมทุกประการ) → เอกสาร HTML ทั้งหน้าใน iframe srcdoc ขนาด A4
//   เกาะ client (PrintFrame) สั่ง print() ของ iframe ครั้งเดียวหลังฟอนต์พร้อม — พิมพ์เฉพาะเอกสาร (ไม่มีเมนู/แถบของแอป)
// 🔴 ประตูเดียวกับหน้า /pos/reports: POS ของร้านนี้ · ไม่มีสาขาที่เข้าได้ = notFound · ไม่มี pos.report.view ที่สาขาใดเลย = การ์ดปฏิเสธก่อนเรียกตัวอ่าน
// 🔴 คำปฏิเสธของตัวอ่าน ({ok:false}) = การ์ดปฏิเสธตามรหัส (ไม่ 500 · ไม่แสดง message ไทยของเซิร์ฟเวอร์)
// kind=overview (ไม่ใช่ชนิดของเซิร์ฟเวอร์) = เอกสารสรุปหลายส่วนต่อกัน (รายวัน · รายชั่วโมงเมื่อวันเดียว · สาขาเมื่อดูทุกสาขาและเห็น ≥ 2 สาขา · ช่องทาง · วิธีชำระ · พนักงาน)
//   แต่ละส่วนคือ HTML ของ posReportPrintAction ตรงตัว (ตัดเฉพาะเนื้อใน <body>) · ส่วนที่ถูกปฏิเสธ = ข้าม · ส่วนรายวันถูกปฏิเสธ = การ์ดปฏิเสธ
// เวลา "พิมพ์เมื่อ" มาจากผลของ action (generatedAt) จัดรูปฝั่งเซิร์ฟเวอร์ด้วยเขตเวลาไทย (ไม่อ่านนาฬิกาฝั่ง client · HF-418)
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
/** รหัสปฏิเสธ → คีย์ใต้ pos.report (ชุดเดียวกับจอรายงาน) */
const REFUSAL_KEY: Record<string, string> = { VALIDATION: "errors.validation", NOT_FOUND: "errors.notFound", PERMISSION_DENIED: "errors.permissionDenied" };
type Printed = { html: string; title: string; generatedAt: string };

/** ขนาดกระดาษใน @page ของ renderReportPrintHtml */
const PORTRAIT = "size: A4;";
const LANDSCAPE = "size: A4 landscape;";

/** เนื้อใน <body> ของเอกสารแบบพิมพ์ (หาด้วย indexOf ไม่ใช้ regex · ข้อความทุกช่องผ่าน esc ของ report-print-shared แล้ว — ไม่มี "</body>" ในเนื้อ) */
function bodyOf(html: string): string {
  const open = html.indexOf("<body");
  const start = open < 0 ? -1 : html.indexOf(">", open) + 1;
  const end = html.lastIndexOf("</body>");
  return start > 0 && end > start ? html.slice(start, end) : "";
}
/** ภาพรวม: ต่อเอกสารหลายส่วนเป็นเอกสารเดียว — หัว/สไตล์ของส่วนแรก · กระดาษแนวนอนเมื่อมีส่วนใดแนวนอน · ชื่อเอกสาร = ชื่อภาพรวม */
function combine(parts: Printed[], title: string): string {
  const first = parts[0]!.html;
  const wide = parts.some((p) => p.html.includes(LANDSCAPE));
  const base = first.slice(0, first.indexOf("<body"));
  let head = wide ? base.replace(PORTRAIT, LANDSCAPE) : base;
  const t0 = head.indexOf("<title>");
  const t1 = head.indexOf("</title>");
  if (t0 >= 0 && t1 > t0) head = `${head.slice(0, t0)}<title>${title.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}${head.slice(t1)}`;
  const style = "<style>\n.part + .part { margin-top: 18px; padding-top: 10px; border-top: 1px solid #999; }\n</style>\n";
  const body = parts.map((p) => `<section class="part">\n${bodyOf(p.html)}\n</section>`).join("\n");
  return `${head.replace("</head>", `${style}</head>`)}<body data-kind="overview">\n${body}\n</body>\n</html>`;
}
export default async function PosReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string | string[]; from?: string | string[]; to?: string | string[]; unit?: string | string[]; locale?: string | string[]; noprint?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const units = (await posUnits(tenantId, id)).filter((u) => canAccessUnit(m, u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (units.length === 0) notFound();
  const allowed = units.filter((u) => evaluate(m, { module: "pos", action: REPORT_PERMISSION, unitId: u.id }));
  const t = await getTranslations("pos.report");
  const appLocale = await getLocale();

  const kindRaw = one(sp.kind);
  const from = one(sp.from);
  const to = one(sp.to);
  const unitRaw = one(sp.unit);
  const unitId = allowed.some((u) => u.id === unitRaw) ? unitRaw! : "";
  const docLocale = one(sp.locale) === "en" ? "en" : "th";
  const back = `/app/sys/${id}/pos/reports?${new URLSearchParams({ kind: kindRaw ?? "overview", ...(isDate(from) ? { from } : {}), ...(isDate(to) ? { to } : {}), ...(unitId ? { unit: unitId } : {}) }).toString()}`;

  const shell = (children: React.ReactNode) => (
    <div className="flex w-full min-w-0 flex-col gap-4" data-testid="pos-report-print-page">
      <div className="flex min-w-0 flex-wrap items-center gap-3 print:hidden">
        <Link href={back} data-testid="pos-report-print-back" className="btn btn-ghost inline-flex min-h-[44px] items-center text-sm">
          {t("print.back")}
        </Link>
        {children}
      </div>
    </div>
  );
  const refusal = (code: string) =>
    shell(
      <div role="alert" className="card w-full text-sm text-[color:var(--color-muted)]" data-testid="pos-report-print-refusal">
        {t(Object.prototype.hasOwnProperty.call(REFUSAL_KEY, code) ? REFUSAL_KEY[code]! : "errors.unknown")}
      </div>,
    );

  // ประตู: ไม่มีสิทธิ์รายงานที่สาขาใดเลย = การ์ดปฏิเสธ (ก่อนเรียกตัวอ่านใด ๆ)
  if (allowed.length === 0) return refusal("PERMISSION_DENIED");
  if (kindRaw !== "overview" && !isReportKind(kindRaw)) return refusal("VALIDATION");

  const print = async (kind: ReportKind): Promise<Printed | { code: string }> => {
    const r = await posReportPrintAction({ systemId: id, kind, from: from ?? "", to: to ?? "", locale: docLocale, ...(unitId ? { unitId } : {}) });
    return r.ok ? { html: r.html, title: r.title, generatedAt: r.generatedAt } : { code: r.code };
  };

  let doc: Printed;
  if (kindRaw === "overview") {
    const kinds: ReportKind[] = ["daily", ...(isDate(from) && from === to ? (["hourly"] as const) : []), ...(!unitId && allowed.length > 1 ? (["branches"] as const) : []), "channels", "payments", "staff"];
    const got = await Promise.all(kinds.map((k) => print(k)));
    const head = got[0]!;
    if ("code" in head) return refusal(head.code);
    const parts = got.filter((g): g is Printed => !("code" in g));
    const title = t("print.overviewTitle");
    doc = { html: combine(parts, title), title, generatedAt: head.generatedAt };
  } else {
    const r = await print(kindRaw as ReportKind);
    if ("code" in r) return refusal(r.code);
    doc = r;
  }
  const when = new Intl.DateTimeFormat(appLocale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(doc.generatedAt));

  const toolbar = (
    <>
      <Link href={back} data-testid="pos-report-print-back" className="btn btn-ghost inline-flex min-h-[44px] items-center text-sm">
        {t("print.back")}
      </Link>
      <h1 className="min-w-0 flex-1 text-lg font-semibold" data-testid="pos-report-print-title">
        {doc.title}
      </h1>
      <span className="text-xs text-[color:var(--color-muted)] tabular-nums" data-testid="pos-report-print-generated">
        {t("print.generatedAt", { time: when })}
      </span>
    </>
  );
  return (
    <div className="flex w-full min-w-0 flex-col gap-4" data-testid="pos-report-print-page">
      <PrintFrame html={doc.html} wide={doc.html.includes(LANDSCAPE)} autoPrint={one(sp.noprint) !== "1"} toolbar={toolbar} printLabel={t("print.button")} frameTitle={doc.title} />
    </div>
  );
}
