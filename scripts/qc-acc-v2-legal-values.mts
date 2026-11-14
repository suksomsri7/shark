// QC ACC T0.1 + T0.2 — ประเภทผู้ประกอบการ + ตารางค่ากฎหมายมีวันที่มีผล (legalValueAt)
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md §"รายละเอียดใบงาน T0.1 + T0.2" · design note ledger/wo-notes/T0.1-T0.2.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally) — ไม่พึ่ง seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-legal-values.mts
//
// ครอบคลุม
//   L1  แถวระบบมาจาก skill เท่านั้น: ทุกแถวมีที่มา references/*.md + § · ป้าย V/V2 · ไม่มีแถวป้าย U
//   L2  VAT ณ วันที่ก่อน/ในช่วง/หลังวันมีผล (พ.ร.ฎ. ฉ.807) · ไม่มีแถวครอบ = แถวใกล้สุด + คำเตือน (ไม่บล็อก)
//   L3  หัก ณ ที่จ่าย: ประเภทเงินได้ × ผู้จ่าย × ผู้รับ × ช่องทาง · e-WHT หมดอายุแล้วกลับอัตราปกติ (T-WHT-05)
//   L4  ประเภทผู้ประกอบการ (T0.1): ค่าเริ่ม UNSET + คำเตือน · isJuristicPayer · ขับสถานะผู้จ่าย
//   L5  กำหนดยื่นแบบ ภ.พ.30 / ภ.ง.ด. วันปกติ + วันออนไลน์ (หมดอายุตามประกาศ)
//   L6  ร้านแก้ค่า → ระบบยอม + คำเตือน (pure และผ่านเครื่องยนต์ค่าตั้งจริง: สิทธิ์ · ประวัติ)
//   L7  getSettings/saveSettings: อัตรา VAT อ่านจากตาราง · ส่งค่าเดิมซ้ำผ่าน · ค่าต่าง = ชี้ไปตาราง
//   L8  fitness: ไม่มีเลข 700/300/"วันที่ 10" ฝังในโมดูลบัญชี
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-legal-values");
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);
const D = (ymd: string) => new Date(`${ymd}T05:00:00Z`); // เที่ยงวันไทย
const codes = (w: { code: string }[]) => w.map((x) => x.code);

const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
const TH = (await import("@/lib/core/settings/legal/th-tax-2569" as string)) as Any;
const EMPTY = LV.EMPTY_BOOK_LEGAL;
const book = (entityKind = "UNSET", shop: Partial<{ vat: Any[]; wht: Any[]; deadline: Any[] }> = {}) => ({ entityKind, shop: { vat: [], wht: [], deadline: [], ...shop } });

// ═══ L1 แถวระบบ = skill เท่านั้น ═══
const SKILL_DIR = "/root/.claude/skills/shark-thai-law/references";
const allSys: Any[] = [...TH.SYSTEM_VAT_ROWS, ...TH.SYSTEM_WHT_ROWS, ...TH.SYSTEM_DEADLINE_ROWS];
// ORACLE-EDIT (ACC T5.1 · เลน 2): ไฟล์บัญชี/ภาษีธุรกิจของ skill ใช้เลขข้อเป็นอักษรไทย (§ก2 · §ข · §ก5) — แถวกำหนดยื่นรายปีอ้างไฟล์เหล่านั้น ⇒ ยอมรับ § ตามด้วยเลขหรืออักษรไทย (เดิมรับเฉพาะตัวเลข)
const SRC_RE = /^references\/[a-z-]+\.md §[\dก-ฮ]+/;
chk("L1.1", "ทุกแถวระบบมีที่มา references/<ไฟล์>.md §<ข้อ>", allSys.every((r) => SRC_RE.test(r.source)), "ครบ", allSys.filter((r) => !SRC_RE.test(r.source)).map((r) => r.id));
chk("L1.2", "ไม่มีแถวระบบป้าย U/S (ค่า [U] ห้าม seed เป็นข้อเท็จจริง)", allSys.every((r) => r.tag === "V" || r.tag === "V2"), "V/V2", allSys.filter((r) => r.tag !== "V" && r.tag !== "V2").map((r) => `${r.id}:${r.tag}`));
chk("L1.3", "ทุกแถวระบบมีวันที่ตรวจ", allSys.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.checkedAt ?? "")), "มี", allSys.filter((r) => !r.checkedAt).map((r) => r.id));
let skillOk = true;
try {
  const files = new Set(readdirSync(SKILL_DIR));
  const missing = allSys.map((r) => r.source.match(/^references\/([a-z-]+\.md)/)?.[1]).filter((f) => f && !files.has(f));
  chk("L1.4", "ไฟล์ที่อ้างมีอยู่จริงใน skill shark-thai-law", missing.length === 0, [], missing);
  const vatRef = readFileSync(join(SKILL_DIR, "common-vat-invoice.md"), "utf8");
  chk("L1.5", "skill VAT §12 ยังระบุช่วง ฉ.807 ถึง 30 ก.ย. 2570 (ตรงแถว sys-vat-807)", /ฉ\.807/.test(vatRef) && /๓๐ กันยายน พ\.ศ\. ๒๕๗๐|30 ก\.ย\. 2570/.test(vatRef), "ตรง", "ไม่พบ", "MAJOR");
  chk("L1.6", "skill VAT §19 ยังระบุ ภ.พ.30 วันที่ 15 / ออนไลน์ 23 ถึง 31 ม.ค. 2570", /วันที่ 15 ของเดือนถัดไป/.test(vatRef) && /ภายในวันที่ 23/.test(vatRef) && /31 ม\.ค\. 2570/.test(vatRef), "ตรง", "ไม่พบ", "MAJOR");
} catch (e) {
  skillOk = false;
  chk("L1.4", "อ่าน skill ได้", false, "อ่านได้", String(e), "MINOR");
}
void skillOk;
chk("L1.7", "ไม่มีแถวหลังวันหมดอายุที่ skill ยังไม่ยืนยัน (VAT หลัง 30 ก.ย. 2570 · ออนไลน์หลัง 31 ม.ค. 2570)", !TH.SYSTEM_VAT_ROWS.some((r: Any) => r.from !== null && r.from > "2027-09-30") && !TH.SYSTEM_DEADLINE_ROWS.some((r: Any) => r.channel === "ONLINE" && (r.to === null || r.to > "2027-01-31")), "ไม่มี", "มี");

// ═══ L2 VAT ตามวันที่ ═══
{
  const v = LV.legalValueFrom(EMPTY, "vat.rate", D("2026-11-13"));
  chk("L2.1", "VAT 13 พ.ย. 2569 = 700 จากแถวระบบ ฉ.807 ไม่มีคำเตือน", v.value === 700 && v.origin === "SYSTEM" && v.row?.id === "sys-vat-807" && v.warnings.length === 0, 700, v);
  const edge = LV.legalValueFrom(EMPTY, "vat.rate", D("2027-09-30"));
  chk("L2.2", "วันสุดท้ายของช่วง (30 ก.ย. 2570) ยังครอบ ไม่มีคำเตือน", edge.value === 700 && edge.warnings.length === 0, 700, edge);
  const after = LV.legalValueFrom(EMPTY, "vat.rate", D("2027-10-01"));
  chk("L2.3", "หลังวันหมดอายุ (1 ต.ค. 2570) → ใช้แถวใกล้สุด 700 + NO_ROW_FOR_DATE (ไม่บล็อก ไม่เดา 10%)", after.value === 700 && codes(after.warnings).includes("NO_ROW_FOR_DATE"), "700+เตือน", after);
  const before = LV.legalValueFrom(EMPTY, "vat.rate", D("2017-09-30"));
  chk("L2.4", "ก่อนวันมีผล (30 ก.ย. 2560) → แถวใกล้สุด + NO_ROW_FOR_DATE", before.value === 700 && codes(before.warnings).includes("NO_ROW_FOR_DATE"), "700+เตือน", before, "MAJOR");
  const bkk = LV.legalValueFrom(EMPTY, "vat.rate", new Date("2027-09-30T17:30:00Z")); // = 1 ต.ค. 2570 00:30 ไทย
  chk("L2.5", "ตัดวันตามเวลาไทย: 30 ก.ย. 17:30Z = 1 ต.ค. ไทย → นอกช่วง", bkk.ymd === "2027-10-01" && codes(bkk.warnings).includes("NO_ROW_FOR_DATE"), "2027-10-01", bkk.ymd, "MAJOR");
  const rule = LV.vatRuleFrom(EMPTY, D("2026-11-13"));
  eq("L2.6", "ตัวเลือก VAT บรรทัด (ไม่มีแถวร้าน) = 700,0,-1", rule.allowed, [700, 0, -1]);
  const shopRule = LV.vatRuleFrom(book("UNSET", { vat: [{ id: "s1", value: 1000, from: "2027-10-01", to: null, source: "ร้าน", tag: "SHOP", checkedAt: null }] }), D("2026-11-13"));
  chk("L2.7", "แถวร้านอัตราอื่น → dropdown/REST รับค่านั้นได้ (ไม่ล็อก 700/0/−1) · ค่าเริ่มยัง 700 ณ วันนี้", shopRule.defaultBp === 700 && shopRule.allowed.includes(1000) && shopRule.allowed.includes(0) && shopRule.allowed.includes(-1), "700 + 1000", shopRule);
  eq("L2.8", "vatBpOrDefault: ค่านอกตาราง → ค่าเริ่ม", [LV.vatBpOrDefault(rule, 0), LV.vatBpOrDefault(rule, -1), LV.vatBpOrDefault(rule, 1234), LV.vatBpOrDefault(rule, "x")], [0, -1, 700, 700], "MAJOR");
}

// ═══ L3 หัก ณ ที่จ่าย ═══
{
  const co = book("COMPANY");
  const q = (b: Any, d: string, query: Any) => LV.legalValueFrom(b, "wht.rate", D(d), query);
  const n = q(co, "2026-11-13", { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L3.1", "บจ. จ่ายค่านายหน้า 40(2) ให้บริษัทไทย ช่องทางปกติ = 3% (skill WHT §2 ข้อ 3/1)", n.value === 300 && n.method === "RATE" && n.origin === "SYSTEM" && /common-withholding-tax\.md §2/.test(n.row?.source ?? ""), 300, n);
  const e = q(co, "2026-11-13", { incomeType: "M40_2", recipient: "JURISTIC_TH", channel: "EWHT" });
  chk("L3.2", "e-WHT ในช่วง กฎกระทรวง 402 (1 ม.ค. 2569–31 ธ.ค. 2570) = 1%", e.value === 100 && e.row?.id === "sys-ewht-40-2-jur" && e.warnings.length === 0, 100, e);
  const eLast = q(co, "2027-12-31", { incomeType: "M40_2", recipient: "JURISTIC_TH", channel: "EWHT" });
  chk("L3.3", "e-WHT วันสุดท้าย 31 ธ.ค. 2570 = 1%", eLast.value === 100, 100, eLast.value);
  const eExp = q(co, "2028-01-01", { incomeType: "M40_2", recipient: "JURISTIC_TH", channel: "EWHT" });
  chk("L3.4", "T-WHT-05 e-WHT หมดอายุ (1 ม.ค. 2571) → กลับอัตราปกติ 3% + EWHT_NOT_IN_EFFECT", eExp.value === 300 && codes(eExp.warnings).includes("EWHT_NOT_IN_EFFECT") && eExp.row?.channel === "NORMAL", "300+เตือน", eExp);
  const eBefore = q(co, "2025-12-31", { incomeType: "M40_2", recipient: "JURISTIC_TH", channel: "EWHT" });
  chk("L3.5", "e-WHT ก่อนช่วง (31 ธ.ค. 2568 — skill ติด [U]) → ไม่เดา ใช้อัตราปกติ + เตือน", eBefore.value === 300 && codes(eBefore.warnings).includes("EWHT_NOT_IN_EFFECT"), "300+เตือน", eBefore, "MAJOR");
  const nj = q(book("INDIVIDUAL"), "2026-11-13", { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L3.6", "ร้านบุคคลธรรมดาจ่ายค่านายหน้าให้บริษัท = ไม่หัก (§3)", nj.method === "NONE" && nj.value === null, "NONE", nj);
  const ind = q(co, "2026-11-13", { incomeType: "M40_2", recipient: "INDIVIDUAL_TH" });
  chk("L3.7", "ค่านายหน้าให้บุคคลธรรมดา = อัตราก้าวหน้า ม.50(1) (ไม่มีตัวเลขตายตัว)", ind.method === "PROGRESSIVE" && ind.value === null, "PROGRESSIVE", ind, "MAJOR");
  const fr = q(book("INDIVIDUAL"), "2026-11-13", { incomeType: "M40_7", recipient: "FOREIGN" });
  chk("L3.8", "จ้างทำของ บริษัทต่างประเทศไม่มีสาขา ผู้จ่ายใครก็ได้ (แถว ANY) = 5% (§10 ข้อ 12)", fr.value === 500 && fr.row?.payer === "ANY", 500, fr, "MAJOR");
  const rent = q(co, "2026-11-13", { incomeType: "M40_5", recipient: "INDIVIDUAL_TH" });
  chk("L3.9", "ค่าเช่าทรัพย์สินให้บุคคลธรรมดา = 5% (§10 ข้อ 6)", rent.value === 500, 500, rent.value, "MAJOR");
  const none = q(co, "2026-11-13", { incomeType: "M40_1", recipient: "INDIVIDUAL_TH" });
  chk("L3.10", "ประเภทที่ skill ไม่ให้อัตรา (40(1)) → null + NO_ROW (ไม่เดา)", none.value === null && codes(none.warnings).includes("NO_ROW"), "null+NO_ROW", none);
  const assumed = q(co, "2026-11-13", { incomeType: "M40_8" });
  chk("L3.11", "ไม่ระบุผู้รับ → ถือว่าบริษัทไทย + RECIPIENT_ASSUMED", assumed.value === 300 && codes(assumed.warnings).includes("RECIPIENT_ASSUMED"), "300+เตือน", assumed, "MINOR");
  const sug = LV.whtSuggestionsFrom(co, D("2026-11-13"));
  eq("L3.12", "อัตราแนะนำต่อประเภท (บจ.) — ผลเดิมของ seed: 40(2)/(6)/(7)/(8)=3% · (5)=5% · (4)=1% · (1)=0", [sug.M40_1, sug.M40_2, sug.M40_4, sug.M40_5, sug.M40_6, sug.M40_7, sug.M40_8], [0, 300, 100, 500, 300, 300, 300]);
  const rates = LV.whtRateOptionsFrom(co, D("2026-11-13"));
  chk("L3.13", "ตัวเลือกอัตรา WHT = อัตราที่มีผลในตาราง ∪ {0} (มี 1/2/3/5/10/15%)", [0, 100, 200, 300, 500, 1000, 1500].every((r) => rates.includes(r)), "ครบ", rates, "MAJOR");
  const ratesAfter = LV.whtRateOptionsFrom(co, D("2028-06-01"));
  chk("L3.14", "หลัง e-WHT หมดอายุ ตัวเลือก 1% ยังมี (จากแถวปกติ 1%) · ค่าที่ไม่มีผลไม่โผล่เอง", ratesAfter.includes(100) && ratesAfter.includes(300), "100,300", ratesAfter, "MINOR");
}

// ═══ L4 ประเภทผู้ประกอบการ ═══
{
  eq("L4.1", "entityKindOf: ไม่มี/ค่าแปลก → UNSET", [TH.entityKindOf(null), TH.entityKindOf({ entityKind: "x" }), TH.entityKindOf({ entityKind: "COMPANY" })], ["UNSET", "UNSET", "COMPANY"]);
  eq("L4.2", "isJuristicPayer: บจ./หจก. true · บุคคล/ห้างสามัญ false · UNSET/อื่น null", ["COMPANY", "JURISTIC_PARTNERSHIP", "INDIVIDUAL", "ORDINARY_PARTNERSHIP", "UNSET", "OTHER"].map((k) => TH.isJuristicPayer(k)), [true, true, false, false, null, null]);
  const u = LV.legalValueFrom(EMPTY, "wht.rate", D("2026-11-13"), { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L4.3", "UNSET → ถือว่าผู้จ่ายนิติบุคคล (ค่าแนะนำเดิม 3%) + ENTITY_KIND_UNSET (ไม่บล็อก)", u.value === 300 && codes(u.warnings).includes("ENTITY_KIND_UNSET"), "300+เตือน", u);
  const v = LV.bookTaxViewFrom(EMPTY, D("2026-11-13"));
  chk("L4.4", "มุมมองตาราง: UNSET มีคำเตือนให้ตั้ง · vatRateBp 700 · แถวระบบ inEffect", v.entityKind === "UNSET" && codes(v.warnings).includes("ENTITY_KIND_UNSET") && v.vatRateBp === 700 && v.tables.vat.some((r: Any) => r.id === "sys-vat-807" && r.inEffect), "ครบ", { k: v.entityKind, w: v.warnings, vat: v.vatRateBp }, "MAJOR");
  const ui = LV.legalUiOptionsFrom(book("INDIVIDUAL"), D("2026-11-13"), [], "SHOP_PAYS");
  const uiCust = LV.legalUiOptionsFrom(book("INDIVIDUAL"), D("2026-11-13"), [], "CUSTOMER_PAYS");
  chk("L4.5", "ร้านบุคคลธรรมดา: แนะนำหัก 40(2) = 0 ตอนร้านจ่าย · ฝั่งลูกค้าหักเรา (นิติฯ) = 3%", ui.whtSuggest.M40_2 === 0 && uiCust.whtSuggest.M40_2 === 300, "0 / 300", [ui.whtSuggest.M40_2, uiCust.whtSuggest.M40_2], "MAJOR");
}

// ═══ L5 กำหนดยื่นแบบ ═══
{
  const pp = LV.filingDeadlineFrom(EMPTY, "PP30", "2026-10");
  chk("L5.1", "ภ.พ.30 เดือนภาษี ต.ค. 2569 → กระดาษ 15 พ.ย. · ออนไลน์ 23 พ.ย. (เดิมฝังวันที่ 10)", pp.paper?.day === 15 && pp.paper.date.toISOString().slice(0, 10) === "2026-11-15" && pp.online?.day === 23 && pp.online.date.toISOString().slice(0, 10) === "2026-11-23", "15/23", { p: pp.paper?.day, o: pp.online?.day });
  const ppDec = LV.filingDeadlineFrom(EMPTY, "PP30", "2026-12");
  chk("L5.2", "ภ.พ.30 ธ.ค. 2569 (ครบกำหนด 15 ม.ค. 2570 ในช่วงประกาศ) → ออนไลน์ 23 ม.ค. 2570 ข้ามปีถูก", ppDec.paper?.date.toISOString().slice(0, 10) === "2027-01-15" && ppDec.online?.date.toISOString().slice(0, 10) === "2027-01-23", "2027-01-15/23", { p: ppDec.paper?.date, o: ppDec.online?.date }, "MAJOR");
  const ppExp = LV.filingDeadlineFrom(EMPTY, "PP30", "2027-01");
  chk("L5.3", "ภ.พ.30 ม.ค. 2570 (ครบกำหนด 15 ก.พ. 2570 หลังประกาศหมดอายุ) → กระดาษ 15 · ไม่มีวันออนไลน์ (skill [U] ไม่เดา)", ppExp.paper?.day === 15 && ppExp.online === null, "15 / null", { p: ppExp.paper?.day, o: ppExp.online });
  const p53 = LV.filingDeadlineFrom(EMPTY, "PND53", "2026-10");
  chk("L5.4", "ภ.ง.ด.53 → กระดาษ 7 · ออนไลน์ 15 (WHT §8)", p53.paper?.day === 7 && p53.online?.day === 15, "7/15", { p: p53.paper?.day, o: p53.online?.day });
  const shopDl = book("COMPANY", { deadline: [{ id: "s-dl", form: "PP30", channel: "PAPER", value: 10, from: null, to: null, source: "นักบัญชีขอเตือนเร็วขึ้น", tag: "SHOP", checkedAt: null }] });
  const ppShop = LV.filingDeadlineFrom(shopDl, "PP30", "2026-10");
  chk("L5.5", "ร้านตั้งกำหนดเอง (วันที่ 10) → ระบบยอมใช้ + SHOP_DIFFERS_FROM_DEFAULT อ้าง ม.83", ppShop.paper?.day === 10 && ppShop.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT" && /§19/.test(w.citation ?? "")), "10+เตือน", ppShop);
}

// ═══ L6 ร้านแก้ค่า (pure) ═══
{
  const shop = book("COMPANY", { wht: [{ id: "s-w", incomeType: "M40_2", payer: "JURISTIC", recipient: "JURISTIC_TH", channel: "NORMAL", method: "RATE", value: 200, from: null, to: null, source: "", tag: "SHOP", checkedAt: null }] });
  const v = LV.legalValueFrom(shop, "wht.rate", D("2026-11-13"), { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L6.1", "แถวร้าน 2% ชนะแถวระบบ 3% + SHOP_DIFFERS_FROM_DEFAULT พร้อมที่มา", v.value === 200 && v.origin === "SHOP" && v.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT" && /§2/.test(w.citation ?? "")), "200+เตือน", v);
  const other = LV.legalValueFrom(shop, "wht.rate", D("2026-11-13"), { incomeType: "M40_8", recipient: "JURISTIC_TH" });
  chk("L6.2", "แถวร้านไม่กระทบประเภทอื่น (40(8) ยัง 3% แถวระบบ)", other.value === 300 && other.origin === "SYSTEM", 300, other, "MAJOR");
  const vatFill = book("UNSET", { vat: [{ id: "s-v", value: 1000, from: "2027-10-01", to: null, source: "ร้าน", tag: "SHOP", checkedAt: null }] });
  const fill = LV.legalValueFrom(vatFill, "vat.rate", D("2027-10-01"));
  chk("L6.3", "แถวร้านเติมช่วงที่ระบบไม่มีแถว → ใช้ค่าร้าน ไม่มี NO_ROW_FOR_DATE และไม่เตือนว่าต่างจากค่าเริ่ม", fill.value === 1000 && fill.origin === "SHOP" && !codes(fill.warnings).includes("NO_ROW_FOR_DATE") && !codes(fill.warnings).includes("SHOP_DIFFERS_FROM_DEFAULT"), "1000 ไม่เตือน", fill, "MAJOR");
  const same = TH.shopRowWarnings("vat", { id: "x", value: 700, from: null, to: null, source: "", tag: "SHOP", checkedAt: null });
  eq("L6.4", "แถวร้านค่าเท่าแถวระบบ → ไม่มีคำเตือน", same, []);
  const diff = TH.shopRowWarnings("vat", { id: "x", value: 800, from: "2026-01-01", to: null, source: "", tag: "SHOP", checkedAt: null });
  chk("L6.5", "แถวร้าน VAT 8% ทับช่วง ฉ.807 → คำเตือน (ไม่บล็อก)", codes(diff).includes("SHOP_DIFFERS_FROM_DEFAULT"), "เตือน", diff);
}

// ═══ L8 fitness: ไม่มีเลขกฎหมายฝังในโมดูลบัญชี ═══
{
  const roots = ["src/lib/modules/account", "src/components/account-v2", "src/lib/ai/account-ops.ts", "src/app/app/sys/[id]/account"];
  const files: string[] = [];
  const walk = (p: string) => {
    const s = statSync(p);
    if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  };
  for (const r of roots) walk(r);
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const hits: string[] = [];
  const PATTERNS: [RegExp, string][] = [
    [/\b(vat\w*|rate\w*|defaultRateBp)\s*(:|=|\?\?|\|\|)\s*(700|300)\b/gi, "อัตราฝัง 700/300"],
    [/\?\?\s*(700|300)\b/g, "ค่าถอย ?? 700/300"],
    [/\bPP30_DUE_DAY\b/g, "PP30_DUE_DAY"],
    [/\b(VAT_OPTIONS|defaultRateBp)\b/g, "ตารางอัตราใน client"],
    [/วันที่ 10 ของเดือน/g, "ข้อความ วันที่ 10"],
  ];
  for (const f of files) {
    const src = strip(readFileSync(f, "utf8"));
    for (const [re, label] of PATTERNS) {
      for (const m of src.matchAll(re)) hits.push(`${f}: ${label}: ${m[0]}`);
    }
  }
  chk("L8.1", `ไม่มีเลขกฎหมายฝังในโมดูลบัญชี (${files.length} ไฟล์)`, hits.length === 0, [], hits.slice(0, 20));
}

// ═══ L6b/L7 ผ่านฐานข้อมูลจริง (ร้านทิ้ง) ═══
const { prisma } = await import("@/lib/core/db");
let tid = "";
try {
  const sys = (await import("@/lib/modules/system/service" as string)) as Any;
  const acc = (await import("@/lib/modules/account/service" as string)) as Any;
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T0.2", slug: `qc-t02-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t02-${stamp}@qc.local`, name: "เจ้าของ T02" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const staff = await prisma.user.create({ data: { email: `qc-t02s-${stamp}@qc.local`, name: "พนักงาน T02" } });
  await prisma.membership.create({ data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date(), permissions: {} } });
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี T02");
  const SYS = s.id as string;
  const s2 = await sys.createSystem(tid, "ACCOUNT", "บัญชี T02 เล่มสอง");
  const ctx = { tenantId: tid, systemId: SYS };
  const ownerActor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.id };
  const staffActor = { role: "STAFF", unitAccess: ["*"], permissions: {}, userId: staff.id };

  const st0 = await acc.getSettings(tid, SYS);
  chk("L7.1", "getSettings (ยังไม่มีแถวตั้งค่า) → vatRateBp 700 จากตาราง · entityKind UNSET", st0.vatRateBp === 700 && st0.entityKind === "UNSET", "700/UNSET", { v: st0.vatRateBp, k: st0.entityKind });
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T02", vatRegistered: true, vatRateBp: 700 });
  chk("L7.2", "saveSettings ส่ง vatRateBp เดิม (700) → ผ่านเงียบ", (await acc.getSettings(tid, SYS)).orgName === "ร้าน T02", "ผ่าน", "ไม่ผ่าน");
  const bad = await acc.saveSettings(tid, SYS, { vatRateBp: 1000 }).then(() => null, (e: Any) => String(e?.message ?? e));
  chk("L7.3", "saveSettings vatRateBp ต่างจากตาราง → ข้อความไทยชี้ไป 'ตารางค่ากฎหมาย'", typeof bad === "string" && /ตาราง/.test(bad), "ชี้ไปตาราง", bad, "MAJOR");

  const denied = await LV.saveBookTax(staffActor, ctx, { entityKind: "COMPANY" });
  chk("L6b.1", "พนักงานไม่มีสิทธิ์ account.settings.manage → ไม่บันทึก (PERMISSION)", denied.ok === false && denied.code === "PERMISSION", "PERMISSION", denied);
  const saved = await LV.saveBookTax(ownerActor, ctx, {
    entityKind: "COMPANY",
    whtRows: [{ id: "", incomeType: "M40_2", payer: "JURISTIC", recipient: "JURISTIC_TH", channel: "NORMAL", method: "RATE", value: 200, from: null, to: null, source: "", checkedAt: null }],
  }, "QC T0.2");
  chk("L6b.2", "เจ้าของตั้ง บจ. + แถวร้าน 40(2) 2% → บันทึกได้ + คำเตือนต่างจากค่าเริ่ม (ไม่บล็อก)", saved.ok === true && saved.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT"), "ok+เตือน", saved);
  const after = await LV.legalValueAt("wht.rate", D("2026-11-13"), ctx, { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L6b.3", "legalValueAt อ่านแถวร้านจากเครื่องยนต์ค่าตั้ง → 200 origin SHOP ป้าย SHOP ที่มา 'ร้านตั้งเอง'", after.value === 200 && after.origin === "SHOP" && after.row?.tag === "SHOP" && after.row?.source === "ร้านตั้งเอง", 200, after);
  chk("L6b.4", "getSettings.entityKind = COMPANY (ไม่มี ENTITY_KIND_UNSET)", (await acc.getSettings(tid, SYS)).entityKind === "COMPANY" && !codes(after.warnings).includes("ENTITY_KIND_UNSET"), "COMPANY", "?");
  const other = await LV.legalValueAt("wht.rate", D("2026-11-13"), { tenantId: tid, systemId: s2.id }, { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L6b.5", "สมุดอีกเล่มของร้านเดียวกันไม่ได้รับค่า (ค่าตั้งชั้น ACCOUNT_BOOK แยกเล่ม)", other.value === 300 && other.origin === "SYSTEM" && codes(other.warnings).includes("ENTITY_KIND_UNSET"), "300 SYSTEM", other);
  const hist = await (prisma as Any).settingChange.count({ where: { tenantId: tid, key: { startsWith: "account." } } });
  chk("L6b.6", "ประวัติการแก้ (SettingChange) ลงจริง ≥2 คีย์", hist >= 2, "≥2", hist, "MAJOR");
  const badRow = await LV.saveBookTax(ownerActor, ctx, { whtRows: [{ id: "", incomeType: "M40_2", payer: "JURISTIC", recipient: "JURISTIC_TH", channel: "NORMAL", method: "RATE", value: null, from: null, to: null, source: "", checkedAt: null }] });
  chk("L6b.7", "แถวรูปแบบผิด (อัตราคงที่ไม่มีตัวเลข) → ปฏิเสธ (ตรวจรูปข้อมูล ไม่ใช่บล็อกกฎหมาย)", badRow.ok === false, "ปฏิเสธ", badRow, "MAJOR");
  const reset = await LV.saveBookTax(ownerActor, ctx, { whtRows: [] });
  const back = await LV.legalValueAt("wht.rate", D("2026-11-13"), ctx, { incomeType: "M40_2", recipient: "JURISTIC_TH" });
  chk("L6b.8", "ล้างแถวร้าน ([]) → กลับค่าเริ่มระบบ 3%", reset.ok === true && back.value === 300 && back.origin === "SYSTEM", 300, back);
  const cfg = await acc.vatConfigOf?.(SYS, D("2027-10-01"));
  if (cfg) chk("L7.4", "vatConfigOf ณ วันหลังหมดอายุ ยังคืน 700 (แถวใกล้สุด) ไม่ล้ม", cfg.vatRateBp === 700, 700, cfg.vatRateBp, "MINOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["settingChange", "settingValue", "accountSettings", "accountLedger", "accountPeriod", "accountDocSequence", "auditLog", "outboxEvent", "membership", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, name: { in: ["เจ้าของ T02", "พนักงาน T02"] } } }));
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T0.1/T0.2 legal values =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);
