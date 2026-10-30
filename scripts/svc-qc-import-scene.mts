// svc-qc-import-scene.mts — SVC D.4 · ฉากจอ หอ 12 "นำเข้าข้อมูลหอ" บนร้าน svcqc **ร้าน B** (SQC_OTHER · หน่วยหอของฉาก)
//
// ใช้ (ต้อง seed ร้าน svcqc แล้ว — scripts/seed-svc-qc.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-import-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-import-scene.mts --clear    # ลบเฉพาะของฉาก (ชุด · FileAsset · หน่วยฉาก)
//
// ฉาก (ค่าจาก SQC_IMPORT_SCENE / sqcImportSample เท่านั้น): หน่วยหอใหม่ของร้าน B → ไฟล์ xlsx 2 ชีต ("ผู้เช่า" = ไฟล์ตัวอย่างแบบ scene · "มิเตอร์" 36 แถว)
//   → uploadImport (put noop) → guessColumns ด้วยตัวเดาตายตัวของฉาก (10/11 · LINE ไม่นำเข้า) → previewImport **ไม่ส่ง mapping** (ค้างขั้นจับคู่คอลัมน์ · ยังไม่ยืนยัน)
//   ⇒ พร้อม 32 · เตือน 3 · ต้องแก้ 1 · แผน 1·3·36 · ผู้เช่า+สัญญา 32 · มิเตอร์ 72 · ค้างยกมา 2 ฿10,200.40 · ประกัน ฿296,400
// ร้าน A ไม่ถูกแตะ (ต้องมี 4 หน่วยพอดี — smoke SM-UNITS) · idempotent: ไฟล์เดิม = ชุดเดิม · รันซ้ำ = SCENE_SUMMARY 0/0/0 · ไม่ได้ seed ⇒ exit 3
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import * as zlib from "node:zlib";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_IMPORT_SCENE as SC, SQC_OTHER, sqcImportSample } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-import-scene";
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");
const dorm = await import("@/lib/modules/dorm");

const tenantId = SC.tenantId;
const unit = SC.unit;
const ctx = { tenantId, actorUserId: SQC_OTHER.owner.userId };
const sum = { created: 0, updated: 0, removed: 0 };
const bkkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// ── XLSX เขียนเอง (zip store · sharedStrings) — ไม่มีไลบรารี xlsx ในโปรเจกต์ ──
const enc = (s: string) => Buffer.from(s, "utf8");
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colRef = (i: number) => {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
function zipStore(entries: { name: string; data: Buffer }[]): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  const crc32 = (b: Buffer): number => (zlib as unknown as { crc32: (b: Buffer) => number }).crc32(b) >>> 0;
  for (const e of entries) {
    const nameB = enc(e.name);
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    lh.writeUInt16LE(0, 28);
    parts.push(lh, nameB, e.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nameB);
    off += lh.length + nameB.length + e.data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]));
}
function xlsx(sheets: { name: string; rows: string[][] }[]): Uint8Array {
  const sst: string[] = [];
  const idx = (s: string) => {
    let i = sst.indexOf(s);
    if (i < 0) i = sst.push(s) - 1;
    return i;
  };
  const sheetXml = (rows: string[][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">${r
            .map((c, ci) => {
              const ref = `${colRef(ci)}${ri + 1}`;
              if (c === "") return "";
              if (/^(0|[1-9]\d*)(\.\d+)?$/.test(c)) return `<c r="${ref}"><v>${Number(c)}</v></c>`;
              return `<c r="${ref}" t="s"><v>${idx(c)}</v></c>`;
            })
            .join("")}</row>`,
      )
      .join("")}</sheetData></worksheet>`;
  const bodies = sheets.map((s) => sheetXml(s.rows));
  return zipStore([
    {
      name: "[Content_Types].xml",
      data: enc(
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
      ),
    },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    {
      name: "xl/workbook.xml",
      data: enc(
        `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      ),
    },
    ...bodies.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(b) })),
    { name: "xl/sharedStrings.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join("")}</sst>`) },
  ]);
}

/** ตัวเดาของฉาก (ตายตัว — ไม่เรียก AI จริง): ตามหัวคอลัมน์ภาพ 12 · LINE ไม่นำเข้า ⇒ 10/11 */
const SCENE_FIELDS = ["room", "tenantName", "phone", "startDate", "rent", "deposit", "elecReading", "waterReading", "arrears", "IGNORE", "note"] as const;
const sceneGuesser = { guess: async () => SCENE_FIELDS.map((field, col) => ({ col, field, confidence: 0.9 })) };

let exitCode = 0;
try {
  const seeded = (await prisma.tenant.count({ where: { id: tenantId } })) === 1 && (await prisma.user.count({ where: { id: SQC_OTHER.owner.userId } })) === 1;
  if (!seeded) {
    console.error(`🔴 ${LABEL}: ร้าน svcqc (ร้าน B) ยังไม่ seed — รัน scripts/seed-svc-qc.mts ก่อน`);
    exitCode = 3;
  } else if (clear) {
    const batches = await prisma.dormImportBatch.findMany({ where: { tenantId, unitId: unit.id }, select: { id: true, fileId: true } });
    const files = batches.map((b) => b.fileId).filter((x): x is string => !!x);
    if (files.length) sum.removed += (await prisma.fileAsset.deleteMany({ where: { tenantId, id: { in: files } } })).count;
    sum.removed += (await prisma.dormImportBatch.deleteMany({ where: { tenantId, unitId: unit.id } })).count;
    await prisma.auditLog.deleteMany({ where: { tenantId, unitId: unit.id } });
    sum.removed += (await prisma.businessUnit.deleteMany({ where: { tenantId, id: unit.id } })).count;
    console.log(`${LABEL}: --clear ลบของฉาก ${sum.removed} แถว`);
  } else {
    const u = await prisma.businessUnit.findFirst({ where: { id: unit.id }, select: { id: true, tenantId: true, type: true, slug: true, name: true } });
    if (!u) {
      await prisma.businessUnit.create({ data: { id: unit.id, tenantId, type: unit.type, slug: unit.slug, name: unit.name } });
      sum.created++;
    } else if (u.tenantId !== tenantId || u.type !== unit.type || u.slug !== unit.slug || u.name !== unit.name) {
      await prisma.businessUnit.update({ where: { id: unit.id }, data: { type: unit.type, slug: unit.slug, name: unit.name } });
      sum.updated++;
    }
    const sample = sqcImportSample(bkkToday(), { variant: "scene" });
    const data = xlsx([
      { name: SC.sheets[0], rows: [sample.headers, ...sample.rows] },
      { name: SC.sheets[1], rows: [["ห้อง", sample.headers[6], sample.headers[7]], ...sample.rows.map((r) => [r[0], r[6], r[7]])] },
    ]);
    const up = await dorm.uploadImport(ctx, { unitId: unit.id, fileName: SC.fileName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data }, { put: async () => {} });
    if (!up.ok) throw new Error(`uploadImport ${up.code}: ${up.reason}`);
    if (!up.duplicate) sum.created++;
    const view = await dorm.getImport(ctx, { unitId: unit.id, batchId: up.batchId });
    const ready =
      view &&
      view.status === "DRAFT" &&
      !view.confirmed &&
      view.proposal?.source === "AI" &&
      view.proposal.guessed === SC.expect.guessed &&
      view.summary?.ready === SC.expect.ready &&
      view.summary?.warn === SC.expect.warn &&
      view.summary?.mustFix === SC.expect.mustFix &&
      view.plan?.rooms === sample.expect.rooms &&
      view.plan?.meters === sample.expect.meters &&
      view.plan?.leases === sample.expect.leases &&
      view.plan?.depositSatang === sample.expect.depositSatang;
    if (!ready) {
      const g = await dorm.guessColumns(ctx, { unitId: unit.id, batchId: up.batchId }, { guesser: sceneGuesser });
      if (!g.ok) throw new Error(`guessColumns ${g.code}`);
      const p = await dorm.previewImport(ctx, { unitId: unit.id, batchId: up.batchId });
      if (!p.ok) throw new Error(`previewImport ${p.code}`);
      if (up.duplicate) sum.updated++;
      console.log(`${LABEL}: พรีวิว พร้อม ${p.summary.ready} · เตือน ${p.summary.warn} · ต้องแก้ ${p.summary.mustFix} · แผน ${p.plan.buildings}·${p.plan.floors}·${p.plan.rooms}`);
    }
    console.log(`${LABEL}: หน่วย ${unit.slug} · ชุด ${up.batchId} (${up.duplicate ? "เดิม" : "ใหม่"})`);
  }
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
