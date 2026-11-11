// print-doc.ts — POS P4.3 ▸ F-P3-22 (CD-P43-O8): ตัวช่วยประกอบเอกสารพิมพ์รายงาน ใช้ร่วมระหว่างหน้า /pos/reports/print (PrintFrame) และ
//   route /pos/reports/print/html (text/html) — ย้ายมาจาก print/page.tsx ทุกไบต์ของตรรกะ (bodyOf · combine · ขนาดกระดาษ) ◂
// 🔴 บริสุทธิ์: ไม่มี prisma / session / นาฬิกา — สตริงเข้า สตริงออก

export type Printed = { html: string; title: string; generatedAt: string };

/** ขนาดกระดาษใน @page ของ renderReportPrintHtml */
export const PORTRAIT = "size: A4;";
export const LANDSCAPE = "size: A4 landscape;";

/** เนื้อใน <body> ของเอกสารแบบพิมพ์ (หาด้วย indexOf ไม่ใช้ regex · ข้อความทุกช่องผ่าน esc ของ report-print-shared แล้ว — ไม่มี "</body>" ในเนื้อ) */
export function bodyOf(html: string): string {
  const open = html.indexOf("<body");
  const start = open < 0 ? -1 : html.indexOf(">", open) + 1;
  const end = html.lastIndexOf("</body>");
  return start > 0 && end > start ? html.slice(start, end) : "";
}
/** ภาพรวม: ต่อเอกสารหลายส่วนเป็นเอกสารเดียว — หัว/สไตล์ของส่วนแรก · กระดาษแนวนอนเมื่อมีส่วนใดแนวนอน · ชื่อเอกสาร = ชื่อภาพรวม */
export function combine(parts: Printed[], title: string): string {
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
