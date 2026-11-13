// HR H3.5 ▸ ตัวเขียน XLSX ขั้นต่ำ (pure · node:zlib อย่างเดียว) — brief R8
//   1 ชีต · ทุกเซลล์เป็นข้อความ (inlineStr) ที่ใช้รูปแบบตัวเลข 49 (Text) — เลขบัญชีขึ้นต้นด้วย 0 ไม่หาย · ไม่มีสูตร
//   ไบต์คงที่ต่ออินพุต: เวลาในไฟล์ zip = 1980-01-01 00:00 เสมอ (ไม่อ่านนาฬิกา) · อ่านกลับได้ด้วย dorm/import-parse#parseImportFile ◂
import { deflateRawSync } from "node:zlib";
import { concat, utf8 } from "./encode";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01

function zip(entries: [string, string][]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const raw = utf8(text);
    const comp = new Uint8Array(deflateRawSync(raw, { level: 9 }));
    const nm = utf8(name);
    const crc = crc32(raw);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0, true);
    lh.setUint16(8, 8, true);
    lh.setUint16(10, DOS_TIME, true);
    lh.setUint16(12, DOS_DATE, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nm.length, true);
    lh.setUint16(28, 0, true);
    const local = concat([new Uint8Array(lh.buffer), nm, comp]);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 8, true);
    ch.setUint16(12, DOS_TIME, true);
    ch.setUint16(14, DOS_DATE, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, comp.length, true);
    ch.setUint32(24, raw.length, true);
    ch.setUint16(28, nm.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    centrals.push(concat([new Uint8Array(ch.buffer), nm]));
    locals.push(local);
    offset += local.length;
  }
  const cd = concat(centrals);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cd.length, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  return concat([...locals, cd, new Uint8Array(end.buffer)]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r/g, "&#13;");
function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** ตาราง (ทุกค่าเป็นข้อความ) → ไบต์ .xlsx */
export function xlsxBytes(table: string[][], sheetName = "Payroll"): Uint8Array {
  const rows = table
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${colName(ci)}${ri + 1}" s="1" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("")}</row>`)
    .join("");
  return zip([
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    ["_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `${XML}<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ],
    ["xl/worksheets/sheet1.xml", `${XML}<worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`],
  ]);
}
