// QC ACC T2.10 — ถ้อยคำ: ไม่เรียกเอกสารธรรมดาว่า "ใบเสร็จอิเล็กทรอนิกส์ / e-receipt" · ข้อความ "สำเนาเพื่อความสะดวก" บนลิงก์/อีเมล/หน้าใบเสร็จออนไลน์ ·
//   ท้ายใบกำกับไม่ยืนยัน "ออกตามมาตรา 86/4" โดยปริยาย · ปุ่มส่งออกไม่อ้าง "ไฟล์ยื่นกรมสรรพากร" · ไม่มีคำ "ถูกกฎหมาย" / "ขั้นต่ำตามกฎหมาย" ในข้อความที่ผู้ใช้เห็น
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md T2.10 (ปิด B16 K8) · design note ledger/wo-notes/T2.10.md
// กฎ: skill domain-accounting-books.md §ง4 · common-vat-invoice.md §5 §14 · audit-checklist-accounting.md B16 K8
// สแตติก + เรนเดอร์ (ไม่แตะฐาน) · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-wording.mts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-wording");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, act?: unknown) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(join(ROOT, dir))) {
    const p = join(dir, f);
    const st = statSync(join(ROOT, p));
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json)$/.test(f)) out.push(p);
  }
  return out;
}
const SCOPE = [...walk("src/lib/modules/account"), ...walk("src/app/app/sys/[id]/account"), ...walk("src/components/account-v2"), ...walk("src/lib/modules/pos").filter((p) => /receipt/.test(p)), ...walk("src/app/(store)/r"), ...walk("src/messages"), "src/lib/i18n/dict.ts"];
const hits = (re: RegExp) => SCOPE.flatMap((p) => (re.test(strip(readFileSync(join(ROOT, p), "utf8"))) ? [p] : []));

console.log("\n── W1 ชื่อเรียกที่ตรงความจริง (สแตติก) ──");
chk("W1.1", "ไม่มี \"ใบเสร็จอิเล็กทรอนิกส์\" / \"e-receipt\" ในบัญชี · ใบเสร็จ POS · หน้าใบเสร็จออนไลน์ · ข้อความแปล", hits(/ใบเสร็จอิเล็กทรอนิกส์|e-receipt/i).length === 0, hits(/ใบเสร็จอิเล็กทรอนิกส์|e-receipt/i));
chk("W1.2", "ไม่มี \"ไฟล์ยื่นกรมสรรพากร\" (ไฟล์ CSV ช่วยกรอก ไม่ใช่ไฟล์ที่กรมรับยื่น)", hits(/ไฟล์ยื่นกรมสรรพากร/).length === 0, hits(/ไฟล์ยื่นกรมสรรพากร/));
chk("W1.3", "ไม่มี \"ถูกกฎหมาย\" / \"ขั้นต่ำตามกฎหมาย\" ในข้อความที่ผู้ใช้เห็น", hits(/ถูกกฎหมาย|ขั้นต่ำตามกฎหมาย/).length === 0, hits(/ถูกกฎหมาย|ขั้นต่ำตามกฎหมาย/));
const unsub = readFileSync(join(ROOT, "src/app/u/[token]/page.tsx"), "utf8");
chk("W1.4", "หน้ายกเลิกรับอีเมล: ไม่อ้างว่ากฎหมายกำหนดให้ส่งใบเสนอราคา", !/ตามที่กฎหมายกำหนด/.test(unsub));
const wht = readFileSync(join(ROOT, "src/app/app/sys/[id]/account/wht/page.tsx"), "utf8");
chk("W1.5", "ปุ่มส่งออก ภ.ง.ด. บอกว่าเป็น CSV ช่วยกรอกแบบ · ไม่มีลูกศร emoji", wht.includes("ส่งออกรายการ ภ.ง.ด.3/53 (CSV ช่วยกรอกแบบ)") && !wht.includes("⬇"));

console.log("\n── W2 สำเนาเพื่อความสะดวก (เรนเดอร์) ──");
const R: Any = await import("@/lib/modules/pos/receipt-render" as string);
const payload: Any = {
  docType: "SALE", kind: "RECEIPT", status: "PAID", copy: false, paper: null,
  shop: { name: "ร้าน QC T2.10", branchName: "สาขา", address: "ที่อยู่", phone: "0" },
  device: {}, doc: { receiptNo: "R-1", issuedAt: "2026-11-13T05:00:00.000Z" },
  lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 5_000, lineTotalSatang: 5_000 }],
  totals: { subtotalSatang: 5_000, lineDiscountSatang: 0, billDiscountSatang: 0, couponDiscountSatang: 0, tierDiscountSatang: 0, serviceChargeSatang: 0, grandTotalSatang: 5_000, vatBaseSatang: 0, vatSatang: 0, vatRateBp: 0, tipSatang: 0 },
  payments: [{ type: "CASH", amountSatang: 5_000 }],
  footer: { text: "", qrEReceiptUrl: "https://example.invalid/r/x", fullTaxInvoiceHint: false },
  labels: R.RECEIPT_LABELS,
};
const th = R.renderReceiptHtml(payload, { paper: "80", locale: "th" });
const en = R.renderReceiptHtml(payload, { paper: "80", locale: "en" });
chk("W2.1", "ใบเสร็จ 80 มม. (QR): \"สแกนดูสำเนาใบเสร็จออนไลน์ (สำเนาเพื่อความสะดวก)\" · EN \"online copy (for convenience)\"", th.includes("สแกนดูสำเนาใบเสร็จออนไลน์ (สำเนาเพื่อความสะดวก)") && en.includes("Scan to view an online copy (for convenience)") && !/อิเล็กทรอนิกส์|e-receipt/i.test(th + en), [th.slice(-400), en.slice(-300)]);
const thPos = JSON.parse(readFileSync(join(ROOT, "src/messages/th/pos.json"), "utf8"));
const enPos = JSON.parse(readFileSync(join(ROOT, "src/messages/en/pos.json"), "utf8"));
chk("W2.2", "หน้าใบเสร็จออนไลน์ /r/<token>: ข้อความสำเนาเพื่อความสะดวก TH/EN + หน้าเรียกใช้", /^สำเนาเพื่อความสะดวก/.test(thPos.pos?.receipt?.public?.convenienceCopy ?? thPos.receipt?.public?.convenienceCopy ?? "") && /^Convenience copy/.test(enPos.pos?.receipt?.public?.convenienceCopy ?? enPos.receipt?.public?.convenienceCopy ?? "") && readFileSync(join(ROOT, "src/app/(store)/r/[token]/pos/PosPublicReceipt.tsx"), "utf8").includes('t("public.convenienceCopy")'));
const send = readFileSync(join(ROOT, "src/lib/modules/pos/receipt-send.ts"), "utf8");
chk("W2.3", "อีเมลใบเสร็จ: ลิงก์ \"ดูสำเนาใบเสร็จออนไลน์\" + ข้อความสำเนาเพื่อความสะดวก", send.includes("ดูสำเนาใบเสร็จออนไลน์") && /\$\{CONVENIENCE_COPY_TH\}/.test(send));

console.log("\n── W3 ท้ายใบกำกับ ม.86/4 ──");
const SS: Any = await import("@/lib/modules/account/settings-schema" as string);
const PS: Any = await import("@/lib/modules/account/print-shared" as string);
chk("W3.1", "ค่าเริ่มต้นข้อความท้ายใบกำกับ = ว่าง · ค่าเดิมของร้านที่ตรงค่าเริ่มต้นเก่าทุกตัวอักษร อ่านเป็นค่าใหม่ · ข้อความที่ร้านแก้เองคงเดิม",
  SS.defaultDocSettings().autoTaxInvoice.legalText === "" &&
    SS.parseDocSettings({ docSettings: { autoTaxInvoice: { legalText: SS.LEGACY_DEFAULT_LEGAL_TEXT } } }).autoTaxInvoice.legalText === "" &&
    SS.parseDocSettings({ docSettings: { autoTaxInvoice: { legalText: "ข้อความของร้าน" } } }).autoTaxInvoice.legalText === "ข้อความของร้าน",
  SS.parseDocSettings({ docSettings: { autoTaxInvoice: { legalText: SS.LEGACY_DEFAULT_LEGAL_TEXT } } }).autoTaxInvoice);
chk("W3.2", "ค่าตั้ง print.section864 ปริยาย AUTO · ประโยค ม.86/4 ในข้อความของร้านถูกตัด (ค่าตั้งตัดสินแทน)", SS.defaultDocSettings().print.section864 === "AUTO" && PS.stripSection864("เอกสารออกเป็นชุด · ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร") === "เอกสารออกเป็นชุด", PS.stripSection864("เอกสารออกเป็นชุด · ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร"));
const full = { sellerName: "ก", sellerAddress: "ข", sellerTaxId: "0105566027001", sellerBranch: "สำนักงานใหญ่", buyerName: "ค", buyerAddress: "ง", buyerTaxId: "0105566027999", buyerBranch: "สำนักงานใหญ่", docNo: "TX-1", lineCount: 1, vatShown: true };
chk("W3.3", "ตัวตรวจรายการ ม.86/4: ครบ = พิมพ์ (AUTO) · ผู้ซื้อมีเลขแต่ไม่มีสาขา = ไม่พิมพ์ · NEVER = ไม่พิมพ์ · ALWAYS = พิมพ์",
  PS.section864Text("AUTO", PS.taxInvoiceMissing(full)) !== null && PS.section864Text("AUTO", PS.taxInvoiceMissing({ ...full, buyerBranch: "" })) === null && PS.section864Text("NEVER", []) === null && PS.section864Text("ALWAYS", ["x"]) !== null,
  PS.taxInvoiceMissing({ ...full, buyerBranch: "" }));

console.log("\n── W4 คีย์แปล TH/EN ตรงกัน (ส่วนที่แก้ในงานนี้) ──");
const keys = (o: Any, pre = ""): string[] => (o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${pre}${k}.`) : [`${pre}${k}`])) : []);
const sec = (o: Any, path: string) => path.split(".").reduce((a: Any, k) => a?.[k], o);
for (const path of ["receipt.public", "bills.drawer", "register.custom"]) {
  const a = keys(sec(thPos, path)).sort();
  const b = keys(sec(enPos, path)).sort();
  chk(`W4.${path}`, `pos.${path}: คีย์ TH = EN (${a.length})`, a.length > 0 && JSON.stringify(a) === JSON.stringify(b), { onlyTh: a.filter((k) => !b.includes(k)), onlyEn: b.filter((k) => !a.includes(k)) });
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.10 ถ้อยคำ: ผ่าน ${cks.length - f.length}/${cks.length} =====`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);
