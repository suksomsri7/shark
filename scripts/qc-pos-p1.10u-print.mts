// qc-pos-p1.10u-print.mts — ตรวจส่วนบริสุทธิ์ของโมดูลพิมพ์ใบเสร็จฝั่ง client (POS P1.10 U · brief §4) · ไม่แตะ DB ไม่ต้องมี .env
// รัน: pnpm exec tsx scripts/qc-pos-p1.10u-print.mts
//   U1 ไบต์ ESC/POS ของ payload คงที่ (sample-payload · เวลาคงที่) ได้ผลเดิมทุกไบต์ทั้ง raster/tis620 · มีช่อง raster สำหรับบรรทัดไทย
//   U2 gsv0: หัวคำสั่ง GS v 0 m xL xH yL yH ถูก · ความยาว = 8 + ไบต์ต่อแถว × สูง · ข้อมูลผิดขนาด = โยน
//   U3 packMono: บิตแมป MSB ก่อน · ดำ/ขาว/โปร่งใสถูก · แถวเติมครบไบต์
//   U4 spliceRaster: ความยาวผล = เดิม − 8n + Σ ภาพ · ที่ว่าง GS v 0 ทุกช่องถูกแทน (ไม่เหลือ) · ภาพเรียงตามลำดับช่อง · ไบต์นอกช่องไม่เปลี่ยน
//   U5 spliceRaster ปฏิเสธ offset ที่ไม่ใช่ที่ว่าง (กันแทนผิดที่)
//   U6 chunkBytes: ทุกก้อน ≤ ขนาด · ต่อกลับเท่าเดิม · จำนวนก้อน = ceil(n/ขนาด) (USB 16 KB · BT 20)
//   U7 ความกว้างภาพ (80 มม. 576 · 58 มม. 384 · ตัวใหญ่ 80 มม. 576) + ลิ้นชักอย่างเดียว = ESC p 0 25 250 ล้วน + VAT ตัวอย่าง ฿170 @7% = 11.12
import { encodeEscPos, type ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import { BT_CHUNK, USB_CHUNK, chunkBytes } from "@/components/pos/print/chunk";
import { DRAWER_PULSE } from "@/components/pos/print/escpos";
import { RASTER_PLACEHOLDER, gsv0, packMono, slotWidthDots, spliceRaster } from "@/components/pos/print/raster";
import { includedVat, samplePayload } from "@/components/pos/print/sample-payload";

type Check = { id: string; name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, detail = "") {
  checks.push({ id, name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
}
const fnv = (b: Uint8Array) => {
  let h = 0x811c9dc5;
  for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
};
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const indexOfSeq = (hay: Uint8Array, needle: readonly number[], from = 0) => {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let k = 0; k < needle.length; k++) if (hay[i + k] !== needle[k]) continue outer;
    return i;
  }
  return -1;
};

const fixed = (): ReceiptPayload =>
  samplePayload({
    header: { name: "บ้านกาแฟสวนผึ้ง", phone: "032-512-345", address: "88/8 ถ.เพชรเกษม ต.หัวหิน", logoUrl: null },
    footer: "ขอบคุณที่อุดหนุนค่ะ",
    showPoints: true,
    showCashier: true,
    book: { orgName: "บ้านกาแฟ", taxId: "0105561234567", branchCode: "00001", address: null, phone: null, logoUrl: null, vatRegistered: true, vatRateBp: 700, posAbbreviatedInvoice: true },
    text: { latte: "ลาเต้", croissant: "ครัวซองต์", cashier: "น้ำฝน", member: "สมาชิกตัวอย่าง" },
    receiptNo: "202610-0001",
    issuedAt: "2026-10-01T01:05:00.000Z",
    copy: false,
    branchName: "สาขาหัวหิน",
    device: { name: "เคาน์เตอร์ 1", posRegNo: "POS001" },
  });

console.log("── P1.10U print module (pure) ──");

// U1
{
  const a = encodeEscPos(fixed(), { paper: "80", drawerKick: true, thaiText: "raster", cut: true, locale: "th" });
  const b = encodeEscPos(fixed(), { paper: "80", drawerKick: true, thaiText: "raster", cut: true, locale: "th" });
  const c = encodeEscPos(fixed(), { paper: "58", drawerKick: false, thaiText: "tis620", cut: true, locale: "th" });
  const d = encodeEscPos(fixed(), { paper: "58", drawerKick: false, thaiText: "tis620", cut: true, locale: "th" });
  const sameSlots = JSON.stringify(a.rasterSlots) === JSON.stringify(b.rasterSlots);
  chk(
    "U1",
    "ESC/POS ของ payload คงที่ได้ผลเดิมทุกไบต์ (raster 80 + tis620 58) · มีช่อง raster บรรทัดไทย · tis620 ไม่มีช่อง",
    eq(a.bytes, b.bytes) && sameSlots && eq(c.bytes, d.bytes) && a.rasterSlots.length > 0 && c.rasterSlots.length === 0,
    `raster ${a.bytes.length}B/${a.rasterSlots.length} ช่อง fnv ${fnv(a.bytes)} vs ${fnv(b.bytes)} · tis620 ${c.bytes.length}B fnv ${fnv(c.bytes)} vs ${fnv(d.bytes)}`,
  );
  console.log(`     raster80 ${a.bytes.length} B · ${a.rasterSlots.length} ช่อง · fnv ${fnv(a.bytes)} · tis620/58 ${c.bytes.length} B · fnv ${fnv(c.bytes)}`);
}

// U2
{
  const packed = new Uint8Array(72 * 35);
  const g = gsv0(576, 35, packed);
  const head = [...g.subarray(0, 8)];
  let threw = false;
  try {
    gsv0(576, 35, new Uint8Array(10));
  } catch {
    threw = true;
  }
  chk("U2", "gsv0: หัว 1D 76 30 00 48 00 23 00 · ยาว 8 + 72×35 · ข้อมูลผิดขนาด = โยน", JSON.stringify(head) === JSON.stringify([0x1d, 0x76, 0x30, 0, 72, 0, 35, 0]) && g.length === 8 + 72 * 35 && threw, `head ${head} len ${g.length} threw ${threw}`);
}

// U3
{
  // 10×2: แถว 0 = ดำ 0–7 ขาว 8–9 · แถว 1 = ดำสลับขาว (x คู่ดำ) และ x=9 ดำแต่โปร่งใส
  const w = 10;
  const h = 2;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const px = (x: number, y: number, v: number, a = 255) => rgba.set([v, v, v, a], (y * w + x) * 4);
  for (let x = 0; x < w; x++) px(x, 0, x < 8 ? 0 : 255);
  for (let x = 0; x < w; x++) px(x, 1, x % 2 === 0 ? 0 : 255);
  px(9, 1, 0, 0);
  const m = packMono(rgba, w, h);
  const want = [0xff, 0x00, 0xaa, 0x80];
  chk("U3", "packMono 10×2 → FF 00 AA 80 (MSB ก่อน · โปร่งใส = ขาว · แถวเติมครบไบต์)", JSON.stringify([...m]) === JSON.stringify(want), `got ${[...m].map((x) => x.toString(16)).join(" ")}`);
}

// U4 + U5
{
  const r = encodeEscPos(fixed(), { paper: "80", drawerKick: false, thaiText: "raster", cut: true, locale: "th" });
  const imgs = r.rasterSlots.map((s, i) => {
    const wd = slotWidthDots(s);
    const data = new Uint8Array((wd / 8) * (i + 1)).fill(i % 2 === 0 ? 0x55 : 0x33);
    return gsv0(wd, i + 1, data);
  });
  const out = spliceRaster(r.bytes, r.rasterSlots, imgs);
  const expectLen = r.bytes.length - 8 * r.rasterSlots.length + imgs.reduce((t, x) => t + x.length, 0);
  // ตำแหน่งที่คาดของภาพ i = offset_i + Σ_{j<i}(len_j − 8)
  let shift = 0;
  let orderOk = true;
  let outsideOk = true;
  let prevEnd = 0;
  let prevSrc = 0;
  r.rasterSlots.forEach((s, i) => {
    const at = s.offset + shift;
    if (!eq(out.subarray(at, at + imgs[i]!.length), imgs[i]!)) orderOk = false;
    if (!eq(out.subarray(prevEnd, at), r.bytes.subarray(prevSrc, s.offset))) outsideOk = false;
    prevEnd = at + imgs[i]!.length;
    prevSrc = s.offset + s.length;
    shift += imgs[i]!.length - s.length;
  });
  if (!eq(out.subarray(prevEnd), r.bytes.subarray(prevSrc))) outsideOk = false;
  const left = indexOfSeq(out, RASTER_PLACEHOLDER);
  chk(
    "U4",
    `spliceRaster ${r.rasterSlots.length} ช่อง: ยาว = เดิม − 8n + Σภาพ · ไม่เหลือที่ว่าง GS v 0 · ภาพเรียงตามช่อง · ไบต์นอกช่องเท่าเดิม`,
    r.rasterSlots.length > 1 && out.length === expectLen && left === -1 && orderOk && outsideOk,
    `len ${out.length}/${expectLen} placeholderAt ${left} order ${orderOk} outside ${outsideOk}`,
  );
  let threw = false;
  try {
    spliceRaster(r.bytes, [{ offset: 0, length: 8 }], [imgs[0]!]);
  } catch {
    threw = true;
  }
  chk("U5", "spliceRaster ปฏิเสธ offset ที่ไม่ใช่ที่ว่าง GS v 0 (โยน)", threw, "ไม่โยน");
}

// U6
{
  const big = new Uint8Array(40_000).map((_, i) => i & 0xff);
  const u = chunkBytes(big, USB_CHUNK);
  const b = chunkBytes(big.subarray(0, 1_001), BT_CHUNK);
  const join = (xs: Uint8Array[]) => {
    const o = new Uint8Array(xs.reduce((t, x) => t + x.length, 0));
    let p = 0;
    for (const x of xs) {
      o.set(x, p);
      p += x.length;
    }
    return o;
  };
  chk(
    "U6",
    "chunkBytes: USB ≤ 16384 · BT ≤ 20 · ต่อกลับเท่าเดิม · จำนวน = ceil(n/ขนาด)",
    u.length === Math.ceil(40_000 / USB_CHUNK) && u.every((x) => x.length <= USB_CHUNK) && eq(join(u), big) && b.length === Math.ceil(1_001 / BT_CHUNK) && b.every((x) => x.length <= BT_CHUNK) && eq(join(b), big.subarray(0, 1_001)),
    `usb ${u.length} bt ${b.length}`,
  );
}

// U7
{
  const w80 = slotWidthDots({ cols: 48, big: false });
  const w58 = slotWidthDots({ cols: 32, big: false });
  const wBig = slotWidthDots({ cols: 24, big: true });
  const pulse = [...DRAWER_PULSE];
  const vat = includedVat(17000, 700);
  const p = fixed();
  chk(
    "U7",
    "ความกว้างภาพ 576/384/576(ใหญ่) · ลิ้นชัก = 1B 70 00 19 FA ล้วน · VAT ฿170@7% = 1112 สตางค์ · ตัวอย่างเป็นใบกำกับอย่างย่อ",
    w80 === 576 && w58 === 384 && wBig === 576 && JSON.stringify(pulse) === JSON.stringify([0x1b, 0x70, 0x00, 0x19, 0xfa]) && vat === 1112 && p.kind === "TAX_INVOICE_ABB" && p.totals.vatBaseSatang === 15888,
    `w ${w80}/${w58}/${wBig} pulse ${pulse} vat ${vat} kind ${p.kind}`,
  );
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n===== QC: P1.10U print module =====\nผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ suite: "qc-pos-p1.10u-print", total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, detail: c.detail })) }));
process.exit(failed.length ? 1 : 0);
