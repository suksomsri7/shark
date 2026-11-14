// books-export.ts — ส่งออกสมุดบัญชีที่พิมพ์ได้ + ไฟล์แนบ เป็น ZIP ก่อนลบร้าน/ยกเลิกบริการ (ACC T4.5 · K2 K6 G1)
//
// กฎ: พ.ร.บ.การบัญชี ม.14 เก็บ ≥5 ปีนับแต่วันปิดบัญชี [V] · ร้านยกเลิกบริการต้องส่งออกครบชุด + แจ้งว่าหน้าที่เก็บเป็นของร้าน (skill domain-accounting-books §ก4)
//   · คำสั่ง ป.121/2545 ข้อ 5: พิมพ์ได้ทันที + Export รายเดือน/รอบบัญชี [V] · สแกนแล้วทิ้งต้นฉบับ ไม่พบตัวบทรับรอง [U] (§ง3)
// เนื้อใน ZIP (ชื่อไทย): อ่านก่อน.txt · สมุดรายวัน.html (พิมพ์ได้) · บัญชีแยกประเภท.html (พิมพ์ได้) · สมุดรายวัน.csv · ผังบัญชี.csv · เอกสาร.csv ·
//   ไฟล์แนบ.csv (รายการไฟล์ + สถานะ) · ไฟล์แนบ/<เลขที่เอกสาร>/<ชื่อไฟล์> (เฉพาะไฟล์บนคลังของ SHARK — ไม่ยิง URL ภายนอก กัน SSRF)
// อ่านอย่างเดียว · ไม่ลบอะไร
import { tenantDb } from "@/lib/core/db";
import { csvRow } from "@/lib/core/csv";
import { buildZip, type ZipEntry } from "@/lib/core/zip";
import { legalWarning, legalWarningRefTh } from "@/lib/core/settings/legal/warnings";
import { complianceValueAt } from "./legal-values";
import { accountNow } from "./clock";

export type BooksArchiveSummary = {
  entries: number;
  lines: number;
  documents: number;
  attachments: number;
  attachmentsIncluded: number;
  attachmentsSkipped: number;
  bytes: number;
  firstDate: string | null;
  lastDate: string | null;
  retentionYears: number;
};

const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").slice(0, 120) || "ไฟล์";
const csv = (head: readonly (string | number)[], rows: readonly (readonly (string | number | null)[])[]) =>
  `﻿${[csvRow([...head]), ...rows.map((r) => csvRow(r.map((x) => (x === null ? "" : x))))].join("\r\n")}\r\n`;

const MAX_ATTACH_BYTES = 200 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

/** ไฟล์อยู่บนคลังของ SHARK เท่านั้น (CDN ที่ตั้งไว้) — URL อื่นไม่ดึง (ผู้ใช้วาง URL เองได้ ⇒ ห้ามให้เซิร์ฟเวอร์ยิงที่ไหนก็ได้) */
function ownStorageUrl(url: string): boolean {
  const base = (process.env.SHARK_BUNNY_CDN ?? "").replace(/\/+$/, "");
  return !!base && /^https:\/\//i.test(base) && url.startsWith(`${base}/`);
}

const PRINT_CSS = `body{font-family:"Sarabun","Noto Sans Thai",sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;margin-bottom:12px}th,td{border:1px solid #999;padding:3px 6px;vertical-align:top}th{background:#eee;text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums}
.meta{color:#444}.entry{page-break-inside:avoid}@media print{body{margin:0}.noprint{display:none}}`;

export async function buildBooksArchive(
  ctx: { tenantId: string; systemId: string },
  opts: { includeAttachments?: boolean; fetchFile?: (url: string) => Promise<Uint8Array | null> } = {},
): Promise<{ zip: Buffer; summary: BooksArchiveSummary; filename: string }> {
  const bdb = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const tdb = tenantDb({ tenantId: ctx.tenantId });
  const [settings, sys, ledgers, entries, docs, files, retention] = await Promise.all([
    bdb.accountSettings.findFirst({ where: {}, select: { orgName: true, taxId: true, branchCode: true, address: true } }),
    tdb.appSystem.findFirst({ where: { id: ctx.systemId, type: "ACCOUNT" }, select: { name: true } }),
    bdb.accountLedger.findMany({ where: {}, select: { id: true, code: true, name: true, type: true }, orderBy: { code: "asc" } }),
    bdb.accountJournalEntry.findMany({
      where: {},
      orderBy: [{ date: "asc" }, { docNo: "asc" }],
      select: { id: true, docNo: true, date: true, periodKey: true, book: true, memo: true, status: true, source: true, refType: true, reversalOf: { select: { docNo: true } }, lines: { select: { accountId: true, debit: true, credit: true, note: true }, orderBy: { id: "asc" } } },
    }),
    bdb.accountDocument.findMany({
      where: {},
      orderBy: [{ issueDate: "asc" }, { docNo: "asc" }],
      select: { id: true, docType: true, docNo: true, status: true, issueDate: true, grandTotal: true, vatAmount: true, voidReason: true, contact: { select: { name: true, taxId: true } } },
    }),
    bdb.accountAttachment.findMany({ where: {}, select: { id: true, fileName: true, fileUrl: true, sizeBytes: true, mimeType: true, documentId: true, archivedAt: true, createdAt: true } }),
    complianceValueAt(ctx, "BOOKS_RETENTION_YEARS", accountNow()),
  ]);
  const acc = new Map(ledgers.map((l) => [l.id, l]));
  const org = settings?.orgName || sys?.name || "สมุดบัญชี";
  const years = retention.value ?? 5;
  const docNoOf = new Map(docs.map((d) => [d.id, d.docNo ?? d.id]));
  const header = `<h1>${esc(org)}</h1><div class="meta">เลขประจำตัวผู้เสียภาษี ${esc(settings?.taxId ?? "-")} · สาขา ${esc(settings?.branchCode ?? "-")}${settings?.address ? ` · ${esc(settings.address)}` : ""}<br>ส่งออกจากระบบ SHARK เมื่อ ${ymd(new Date())} — สำเนาเพื่อเก็บรักษา</div>`;

  // สมุดรายวัน (พิมพ์ได้)
  let lineCount = 0;
  const journalHtml = entries
    .map((e) => {
      lineCount += e.lines.length;
      const rows = e.lines
        .map((l) => {
          const a = acc.get(l.accountId);
          return `<tr><td>${esc(a?.code ?? "")}</td><td>${esc(a?.name ?? "")}${l.note ? ` — ${esc(l.note)}` : ""}</td><td class="n">${l.debit ? baht(l.debit) : ""}</td><td class="n">${l.credit ? baht(l.credit) : ""}</td></tr>`;
        })
        .join("");
      const dr = e.lines.reduce((n, l) => n + l.debit, 0);
      const cr = e.lines.reduce((n, l) => n + l.credit, 0);
      return `<div class="entry"><h2>${esc(e.docNo)} · ${ymd(e.date)} · สมุด${esc(e.book)}${e.status === "REVERSED" ? " · ถูกกลับรายการ" : ""}${e.reversalOf ? ` · กลับรายการของ ${esc(e.reversalOf.docNo)}` : ""}</h2><div class="meta">${esc(e.memo ?? "")}</div><table><tr><th>รหัสบัญชี</th><th>ชื่อบัญชี</th><th>เดบิต</th><th>เครดิต</th></tr>${rows}<tr><th colspan="2">รวม</th><th class="n">${baht(dr)}</th><th class="n">${baht(cr)}</th></tr></table></div>`;
    })
    .join("");
  const page = (title: string, body: string) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(org)}</title><style>${PRINT_CSS}</style></head><body>${header}<h2>${esc(title)}</h2>${body}</body></html>`;

  // บัญชีแยกประเภท (พิมพ์ได้) — ยอดคงเหลือสะสมต่อบัญชี
  const byAcc = new Map<string, { date: Date; docNo: string; memo: string | null; debit: number; credit: number }[]>();
  for (const e of entries) for (const l of e.lines) {
    const arr = byAcc.get(l.accountId) ?? [];
    arr.push({ date: e.date, docNo: e.docNo, memo: l.note ?? e.memo, debit: l.debit, credit: l.credit });
    byAcc.set(l.accountId, arr);
  }
  const ledgerHtml = ledgers
    .filter((a) => byAcc.has(a.id))
    .map((a) => {
      let bal = 0;
      const debitNormal = a.type === "ASSET" || a.type === "EXPENSE" || a.type === "COGS";
      const rows = byAcc.get(a.id)!.map((r) => {
        bal += debitNormal ? r.debit - r.credit : r.credit - r.debit;
        return `<tr><td>${ymd(r.date)}</td><td>${esc(r.docNo)}</td><td>${esc(r.memo ?? "")}</td><td class="n">${r.debit ? baht(r.debit) : ""}</td><td class="n">${r.credit ? baht(r.credit) : ""}</td><td class="n">${baht(bal)}</td></tr>`;
      });
      return `<div class="entry"><h2>${esc(a.code)} ${esc(a.name)}</h2><table><tr><th>วันที่</th><th>เลขที่</th><th>คำอธิบาย</th><th>เดบิต</th><th>เครดิต</th><th>คงเหลือ</th></tr>${rows.join("")}</table></div>`;
    })
    .join("");

  const files_: ZipEntry[] = [];
  const manifest: (string | number | null)[][] = [];
  let included = 0;
  let skipped = 0;
  let bytes = 0;
  const fetchFile =
    opts.fetchFile ??
    (async (url: string) => {
      if (!ownStorageUrl(url)) return null;
      const ctl = AbortSignal.timeout(FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: ctl }).catch(() => null);
      if (!res || !res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    });
  for (const f of files) {
    const folder = f.documentId ? safe(docNoOf.get(f.documentId) ?? f.documentId) : "ไม่ผูกเอกสาร";
    let status = "ไม่ได้รวมในไฟล์นี้";
    if (opts.includeAttachments !== false) {
      if (f.fileUrl.startsWith("private://")) status = "ไฟล์ส่วนตัว — เปิดจากหน้าเอกสารในระบบแล้วบันทึกเก็บเอง";
      else if (bytes + f.sizeBytes > MAX_ATTACH_BYTES) status = "เกินขนาดรวมของไฟล์ส่งออก — ดาวน์โหลดจากลิงก์";
      else {
        const data = await fetchFile(f.fileUrl).catch(() => null);
        if (data) {
          files_.push({ name: `ไฟล์แนบ/${folder}/${safe(f.fileName)}`, data, date: f.createdAt });
          bytes += data.length;
          included++;
          status = "รวมแล้ว";
        } else status = "ดึงไฟล์ไม่ได้ (อยู่นอกคลังของ SHARK หรือเชื่อมต่อไม่ได้) — ดาวน์โหลดจากลิงก์";
      }
    }
    if (status !== "รวมแล้ว") skipped++;
    manifest.push([f.documentId ? docNoOf.get(f.documentId) ?? "" : "", f.fileName, f.mimeType, f.sizeBytes, ymd(f.createdAt), f.archivedAt ? "ถูกเก็บเข้ากรุ" : "", f.fileUrl.startsWith("private://") ? "" : f.fileUrl, status]);
  }

  const duty = legalWarning("SHOP_RECORDS_RETENTION_DUTY", { years });
  const paper = legalWarning("PAPER_ORIGINALS_KEEP");
  const readme = [
    `สมุดบัญชีของ ${org} — ส่งออกจากระบบ SHARK เมื่อ ${ymd(new Date())}`,
    "",
    `สมุดรายวัน.html / บัญชีแยกประเภท.html — เปิดในเบราว์เซอร์แล้วสั่งพิมพ์ได้ (${entries.length} ใบสำคัญ · ${lineCount} บรรทัด)`,
    `สมุดรายวัน.csv · ผังบัญชี.csv · เอกสาร.csv (${docs.length} ใบ) — เปิดด้วย Excel ได้`,
    `ไฟล์แนบ.csv — รายการไฟล์แนบทั้งหมด ${files.length} ไฟล์ (รวมในไฟล์นี้ ${included} · ต้องดาวน์โหลดเอง ${skipped})`,
    "",
    duty.messageTh,
    legalWarningRefTh(duty),
    "",
    paper.messageTh,
    legalWarningRefTh(paper),
    "",
    "ข้อมูลอ้างอิงจากผลค้นคว้าของระบบ ไม่ใช่คำปรึกษากฎหมาย",
  ].join("\r\n");

  const zip = buildZip([
    { name: "อ่านก่อน.txt", data: `﻿${readme}\r\n` },
    { name: "สมุดรายวัน.html", data: page("สมุดรายวัน", journalHtml || "<p>ไม่มีรายการ</p>") },
    { name: "บัญชีแยกประเภท.html", data: page("บัญชีแยกประเภท", ledgerHtml || "<p>ไม่มีรายการ</p>") },
    {
      name: "สมุดรายวัน.csv",
      data: csv(
        ["วันที่", "เลขที่", "สมุด", "สถานะ", "คำอธิบาย", "รหัสบัญชี", "ชื่อบัญชี", "เดบิต", "เครดิต"],
        entries.flatMap((e) => e.lines.map((l) => [ymd(e.date), e.docNo, e.book, e.status, e.memo ?? "", acc.get(l.accountId)?.code ?? "", acc.get(l.accountId)?.name ?? "", (l.debit / 100).toFixed(2), (l.credit / 100).toFixed(2)])),
      ),
    },
    { name: "ผังบัญชี.csv", data: csv(["รหัส", "ชื่อบัญชี", "ประเภท"], ledgers.map((l) => [l.code, l.name, l.type])) },
    {
      name: "เอกสาร.csv",
      data: csv(["วันที่", "ชนิด", "เลขที่", "สถานะ", "คู่ค้า", "เลขผู้เสียภาษีคู่ค้า", "ยอดสุทธิ", "ภาษีมูลค่าเพิ่ม", "เหตุผลยกเลิก"], docs.map((d) => [ymd(d.issueDate), d.docType, d.docNo ?? "(ร่าง)", d.status, d.contact?.name ?? "", d.contact?.taxId ?? "", (d.grandTotal / 100).toFixed(2), (d.vatAmount / 100).toFixed(2), d.voidReason ?? ""])),
    },
    { name: "ไฟล์แนบ.csv", data: csv(["เอกสาร", "ชื่อไฟล์", "ชนิด", "ขนาด (ไบต์)", "วันที่อัปโหลด", "สถานะในระบบ", "ลิงก์", "ในไฟล์ส่งออก"], manifest) },
    ...files_,
  ]);
  const summary: BooksArchiveSummary = {
    entries: entries.length,
    lines: lineCount,
    documents: docs.length,
    attachments: files.length,
    attachmentsIncluded: included,
    attachmentsSkipped: skipped,
    bytes: zip.length,
    firstDate: entries[0] ? ymd(entries[0].date) : null,
    lastDate: entries.length ? ymd(entries[entries.length - 1]!.date) : null,
    retentionYears: years,
  };
  return { zip, summary, filename: `สมุดบัญชี-${safe(org)}-${ymd(new Date())}.zip` };
}

// ═══════════════════ แจ้งหน้าที่เก็บเอกสารก่อนลบร้าน ═══════════════════

export type RetentionBookNotice = {
  systemId: string;
  name: string;
  entries: number;
  lastEntryDate: string | null;
  /** วันที่ต้องเก็บถึงอย่างน้อย (ปีของรายการล่าสุด สิ้นปีปฏิทิน + ระยะเก็บ — ประมาณวันปิดบัญชีด้วยปีบัญชีของสมุด) */
  keepUntil: string | null;
  retentionYears: number;
  retentionOrigin: "SHOP" | "SYSTEM" | null;
  withinRetention: boolean;
  exportedAt: string | null;
};

/** สมุดทุกเล่มของร้าน + รายการล่าสุด + เก็บถึงเมื่อไร (ใช้บนหน้าขอลบร้าน · REST · เลขา) */
export async function retentionNotice(tenantId: string, now: Date = accountNow()): Promise<RetentionBookNotice[]> {
  const books = await tenantDb({ tenantId }).appSystem.findMany({ where: { type: "ACCOUNT" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const out: RetentionBookNotice[] = [];
  for (const b of books) {
    const db = tenantDb({ tenantId, systemId: b.id });
    const [agg, s, rv, exp] = await Promise.all([
      db.accountJournalEntry.aggregate({ where: {}, _max: { date: true }, _count: { _all: true } }),
      db.accountSettings.findFirst({ where: {}, select: { fiscalYearStartMonth: true } }),
      complianceValueAt({ tenantId, systemId: b.id }, "BOOKS_RETENTION_YEARS", now),
      db.tenantDeletionLog.findFirst({ where: { tenantId, event: "EXPORTED", detail: { path: ["systemId"], equals: b.id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    const years = rv.value ?? 5;
    const last = agg._max.date;
    let keepUntil: string | null = null;
    if (last) {
      // วันปิดบัญชีของรอบที่มีรายการล่าสุด: สิ้นเดือนก่อนเดือนเริ่มปีบัญชีถัดไป
      const fy = s?.fiscalYearStartMonth ?? 1;
      const d = new Date(last.getTime() + 7 * 3600_000);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const closeYear = fy === 1 ? y : m >= fy ? y + 1 : y;
      const closeMonth = fy === 1 ? 12 : fy - 1;
      const closeDay = new Date(Date.UTC(closeYear, closeMonth, 0)).getUTCDate();
      keepUntil = `${closeYear + years}-${String(closeMonth).padStart(2, "0")}-${String(closeDay).padStart(2, "0")}`;
    }
    out.push({
      systemId: b.id,
      name: b.name,
      entries: agg._count._all,
      lastEntryDate: last ? ymd(last) : null,
      keepUntil,
      retentionYears: years,
      retentionOrigin: rv.origin,
      withinRetention: !!keepUntil && keepUntil >= ymd(now),
      exportedAt: exp ? exp.createdAt.toISOString() : null,
    });
  }
  return out;
}
