// probe-trips-t0.1-pure.mts — hunter T0.1: ตัวตรวจทัวร์/ทะเบียน/ค่าเริ่ม แบบไม่แตะฐาน (ไม่มีการเขียน)
import { boot, fmt, errMsg, out, type Rec } from "./probe-trips-t0.1-lib.mjs";
boot("probe-trips-t0.1-pure");

const SET = (await import("@/lib/core/settings")) as unknown as Rec;
const TOUR = (await import("@/lib/core/settings/legal/th-tour-2569")) as unknown as Rec;
const SELL = (await import("@/lib/core/sellable")) as unknown as Rec;
type Def = { key: string; domain: string; group: string; schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }; defaults: Rec; legal?: string[]; legalInput?: unknown; chain: string[] };
const listDefs = SET.listDefs as (d: string, g?: string) => Def[];
const getDef = SET.getDef as (k: string) => Def | undefined;
const legalInputsOf = SET.legalInputsOf as (d: Def, v: unknown, get: (k: string) => unknown) => { ruleId: string; input: unknown }[];
const validateGroup = SET.validateGroup as (dm: string, g: string, v: Rec) => unknown[];
const defineSettings = SET.defineSettings as (dm: string, defs: unknown[], o?: unknown) => void;
const evaluateTourRule = TOUR.evaluateTourRule as (id: string, input: unknown, o?: unknown) => Rec;
const IDS = TOUR.TOUR_RULE_IDS as string[];

// ── 1. fuzz ตัวตรวจทัวร์ 46 rule × อินพุตผิดรูป/ปรปักษ์ ──
const nasty: unknown[] = [
  undefined, null, NaN, Infinity, -Infinity, -1, 0, 1e15, -1e15, 1.5, "", "x", "W01", true, false, [], [[]], {}, Symbol("s"), BigInt(10), () => 1, new Date(NaN), new Date(8.64e15), new Map(),
  JSON.parse('{"__proto__":{"hit":true}}'), JSON.parse('{"constructor":{"prototype":{"x":1}}}'), Object.create(null), { hit: "true" }, { hit: true, vars: { a: NaN } }, { hit: true, vars: [] }, { hit: true, vars: { __proto__: 1 } },
  { hit: true, extra: 1 }, { hit: true, vars: { "{x}": "{y}" } }, [{ fromDaysBefore: NaN, refundPct: 100 }], [{ fromDaysBefore: 30, refundPct: 101 }], [{ fromDaysBefore: -5, refundPct: 100 }], [{ fromDaysBefore: 1e15, refundPct: 100 }],
  [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 30, refundPct: 0 }], [{ fromDaysBefore: "30", refundPct: 100 }], { ladder: [], depositPct: 1e15 }, { ladder: null, depositPct: 30 },
  { EXTERNAL: NaN, MIN_NOT_MET: 100, SHOP_FAULT: 100 }, { EXTERNAL: 101, MIN_NOT_MET: 100, SHOP_FAULT: 100 }, { th: 1 }, { th: "a".repeat(200_000) }, { confirmedAt: "2026-02-30", groups: [], diveSatangPerPaxDay: 1, mooring: {} },
  { confirmedAt: "9999-12-31", groups: [], diveSatangPerPaxDay: 0, mooring: {} }, { confirmedAt: "0001-01-01", groups: [], diveSatangPerPaxDay: 0, mooring: {} },
  new Proxy({}, { get() { throw new Error("boom"); }, ownKeys() { throw new Error("boom2"); } }),
];
const deep: Rec = {}; let cur = deep; for (let i = 0; i < 5000; i++) { cur.x = {}; cur = cur.x as Rec; }
nasty.push(deep);
const bad: string[] = [];
let n = 0;
const lv = new Map<string, number>();
for (const id of [...IDS, "W00", "W47", "__proto__", "constructor", "toString", "DEPOSIT_RETURN_DAYS", ""]) {
  for (const x of nasty) {
    n++;
    try {
      const v = evaluateTourRule(id, x);
      const k = `${String(v.level)}`;
      lv.set(k, (lv.get(k) ?? 0) + 1);
      if (v.level !== "OK" && v.level !== "WARN") bad.push(`${id}: level ${String(v.level)}`);
      if (typeof v.messageTh !== "string" || typeof v.code !== "string") bad.push(`${id}: shape ${fmt(v)}`);
    } catch (e) { bad.push(`${id} THROW ${errMsg(e)}`); }
  }
}
out("1-fuzz", `${n} calls · levels ${fmt([...lv])} · bad ${bad.length}`, bad.slice(0, 8));
// เทมเพลตข้อความ: vars ที่มี {..} แทนซ้ำ?
out("1-fill", evaluateTourRule("W36", { hit: true, vars: { "ชื่อ": "{วันที่}", "วันที่": "X" } }).messageTh);

// ── 2. W01 เทียบสูตรอ้างอิงอิสระ (สุ่ม 20,000 ตาราง) ──
const refW01 = (ladder: { fromDaysBefore: number; refundPct: number }[]) => {
  const steps = [...ladder].sort((a, b) => b.fromDaysBefore - a.fromDaysBefore);
  for (let d = 0; d <= 1000; d++) {
    const r = steps.find((s) => s.fromDaysBefore <= d)?.refundPct ?? 0;
    const min = d >= 30 ? 100 : d >= 15 ? 50 : 0;
    if (r < min) return true;
  }
  return false;
};
let seed = 12345;
const rnd = (m: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
const diff: string[] = [];
for (let i = 0; i < 20_000; i++) {
  const k = 1 + rnd(5);
  const ladder = Array.from({ length: k }, () => ({ fromDaysBefore: rnd(61), refundPct: [0, 20, 49, 50, 51, 99, 100][rnd(7)] }));
  const got = evaluateTourRule("W01", ladder).level === "WARN";
  if (got !== refW01(ladder)) diff.push(`${fmt(ladder)} got ${got}`);
}
out("2-W01-diff", `ต่างจากสูตรอ้างอิง ${diff.length}/20000`, diff.slice(0, 3));

// ── 3. W38 เลี่ยงถ้อยคำ ──
const w38 = (th: string, en?: string) => evaluateTourRule("W38", en === undefined ? { th } : { th, en }).level;
const variants: [string, string, string?][] = [
  ["control", "ผู้จัดไม่รับผิดชอบทุกกรณี"],
  ["ZWSP", "ผู้จัดไม่รับผิดชอบ​ทุกกรณี"],
  ["ZWJ", "ไม่รับ‍ผิดชอบทุกกรณี"],
  ["soft-hyphen-en", "รับทราบ", "we w­aive all claims"],
  ["fullwidth-en", "รับทราบ", "ＷＡＩＶＥ ＡＬＬ ＣＬＡＩＭＳ"],
  ["en-dash-nbsp", "รับทราบ", "hold harmless"],
  ["thai-sara-am-decomposed", "ไม่รับผิดชอบทุกกรณี".normalize("NFD")],
  ["mai-ek-order", "ไม่รับผิดชอบใดๆ ทั้งสิ้น"],
  ["synonym", "ผู้จัดไม่ต้องรับผิดในทุกกรณี"],
];
out("3-W38", variants.map(([t, th, en]) => `${t}=${w38(th, en)}`).join(" · "));

// ── 4. ค่าเริ่มทุกแม่แบบ: schema · legal · กลุ่ม ──
const defs = listDefs("trips");
const TPLS = ["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION", "_fallback"];
const issues: string[] = [];
const warnByDefault: string[] = [];
for (const tk of TPLS) {
  const val = (d: Def) => (Object.prototype.hasOwnProperty.call(d.defaults, tk) ? d.defaults[tk] : d.defaults._fallback);
  const get = (k: string) => { const d = getDef(k); return d ? val(d) : undefined; };
  for (const d of defs) {
    const v = val(d);
    if (!d.schema.safeParse(v).success) issues.push(`${tk} ${d.key} schema`);
    if (!Object.prototype.hasOwnProperty.call(d.defaults, tk)) issues.push(`${tk} ${d.key} ไม่มีค่าแม่แบบ (ใช้ _fallback)`);
    for (const { ruleId, input } of legalInputsOf(d, v, get)) {
      const r = evaluateTourRule(ruleId, input);
      if (r.level !== "OK") warnByDefault.push(`${tk} ${d.key} ${ruleId} ${String(r.code)} ${String(r.severity)}`);
    }
  }
  const groups = [...new Set(defs.map((d) => d.group))];
  for (const g of groups) {
    const values: Rec = {};
    for (const d of listDefs("trips", g)) values[d.key] = val(d);
    const gi = validateGroup("trips", g, values);
    if (gi.length) issues.push(`${tk} group ${g}: ${fmt(gi)}`);
  }
  // RUNTIME rules ที่ค่าเริ่มจะทำให้ยิง (อ่านจากค่า): ตรวจ sanity ข้ามคีย์ที่ไม่มีตัวตรวจ
  const age = get("trips.pax.childAgeBand") as Rec, park = get("trips.parkFee.ageBands") as Rec, minor = get("trips.pdpa.minorConsent") as Rec;
  if (!(Number(age.infantBelow) <= Number(age.childFrom) && Number(age.childFrom) <= Number(age.childTo))) issues.push(`${tk} childAgeBand ไม่เรียง`);
  if (!(Number(park.childTo) < Number(park.adultFrom))) issues.push(`${tk} parkFee ageBands ทับ`);
  if (!(Number(minor.parentOnlyAtOrBelow) < Number(minor.minorBelow))) issues.push(`${tk} minorConsent`);
}
out("4-defaults", `${defs.length} คีย์ × ${TPLS.length} แม่แบบ · ปัญหา ${issues.length}`, issues.slice(0, 10));
out("4-warn-at-default", warnByDefault.length ? warnByDefault : "ไม่มีคำเตือนที่ค่าเริ่ม");

// ── 5. schema ยอมค่าประหลาดไหม (ผ่านทางเดียวกับ draftOne = def.schema.safeParse) ──
const weird: [string, unknown][] = [["NaN", NaN], ["Inf", Infinity], ["neg", -1], ["1e15", 1e15], ["float", 1.5], ["str", "5"], ["null", null], ["arr", []], ["obj", {}], ["proto", JSON.parse('{"__proto__":{"x":1}}')], ["ctor", { constructor: 1 }], ["date", new Date()], ["bigint", BigInt(10)]];
const accepted: string[] = [];
for (const d of defs) for (const [t, v] of weird) { try { const r = d.schema.safeParse(v); if (r.success && !(t === "null" && d.schema.safeParse(null).success && v === null)) accepted.push(`${d.key}←${t}`); } catch (e) { accepted.push(`${d.key}←${t} THROW ${errMsg(e)}`); } }
out("5-schema-weird", accepted.length ? accepted : "ไม่ยอมอะไรประหลาด");
// เลข 0 / ว่าง ที่มีความหมายทางธุรกิจแปลก
const edgeAccepted = ([
  ["trips.cancel.ladder", [{ fromDaysBefore: 0, refundPct: 100 }]],
  ["trips.cancel.ladder", [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 30, refundPct: 0 }]],
  ["trips.cancel.ladder", [{ fromDaysBefore: 0, refundPct: 0 }, { fromDaysBefore: 30, refundPct: 100 }]],
  ["trips.pax.childAgeBand", { infantBelow: 20, childFrom: 4, childTo: 2 }],
  ["trips.parkFee.ageBands", { freeBelow: 100, childFrom: 90, childTo: 1, adultFrom: 0, thaiSeniorFreeFrom: 0, childByHeightCm: 0 }],
  ["trips.pdpa.minorConsent", { parentOnlyAtOrBelow: 25, minorBelow: 5 }],
  ["trips.sell.cutoff", { daysBefore: 0, atMin: 0, perChannel: { __proto__: { daysBefore: 1, atMin: 1 } } }],
  ["trips.sell.cutoff", JSON.parse('{"daysBefore":0,"atMin":0,"perChannel":{"__proto__":{"daysBefore":1,"atMin":1}}}')],
  ["trips.parkFee.table", { confirmedAt: "2099-01-01", groups: [{ code: "G1", nameTh: "x", thaiChildSatang: 0, thaiAdultSatang: 0, foreignChildSatang: 0, foreignAdultSatang: 0 }], diveSatangPerPaxDay: 0, mooring: { upTo20Satang: 0, from21Satang: 0 } }],
  ["trips.fx.rates", [{ currency: "USD", rateMicros: 1 }, { currency: "USD", rateMicros: 2_000_000_000 }]],
  ["trips.pay.reminderDaysBefore", []],
  ["trips.marine.manifestColumns", ["fullName", "docNumber"]],
] as [string, unknown][]).map(([k, v]) => `${k}=${getDef(k)?.schema.safeParse(v).success}${getDef(k)?.legal?.length ? `/${(getDef(k)?.legal ?? []).map((r) => evaluateTourRule(r, r === "W03" ? { ladder: v, depositPct: 30 } : v).level).join(",")}` : ""}`);
out("5-edge", edgeAccepted);
const vg = validateGroup("trips", "cancel", { "trips.cancel.ladder": [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 30, refundPct: 0 }] });
out("5-group-dup-ladder", vg);

// ── 6. ทะเบียน: def ที่ domain ไม่ตรง / rule หอในโดเมน trips / rule ทัวร์ในโดเมนอื่น ต้องโยน ──
const z = (await import("zod")).z;
const mk = (key: string, domain: string, legal: string[]) => ({ key, domain, group: "hunt", type: "enum", schema: z.enum(["A", "B"]), defaults: { _fallback: "A" }, chain: ["UNIT"], editPermission: "trips.settings.edit", labelTh: "ทดสอบ", legal });
const reg: string[] = [];
for (const [dm, d] of [["rooms", mk("rooms.hunt.a", "trips", ["DEPOSIT_RETURN_DAYS"])], ["trips", mk("trips.hunt.b", "rooms", ["W01"])], ["rooms", mk("rooms.hunt.c", "rooms", ["W20"])], ["agency", mk("agency.hunt.d", "agency", ["LATE_FEE_CAP"])], ["trips", mk("trips.hunt.e", "trips", ["W01​"])]] as [string, Rec][]) {
  try { defineSettings(dm, [d]); reg.push(`${String(d.key)}: ลงทะเบียนได้ ❗`); } catch (e) { reg.push(`${String(d.key)}: โยน (${errMsg(e).slice(0, 80)})`); }
}
out("6-registry", reg);

// ── 7. ทะเบียนข้อความ copy ใน defs ตรงกับ core/sellable ──
const defCh = (getDef("trips.sell.cutoff")?.schema as unknown as { shape?: Rec })?.shape;
out("7-channels", `sellable ${fmt(SELL.SELL_CHANNELS)}`, `cutoff perChannel ยอม COUNTER=${getDef("trips.sell.cutoff")?.schema.safeParse({ daysBefore: 1, atMin: 1, perChannel: { COUNTER: { daysBefore: 1, atMin: 1 } } }).success} · ยอม BOGUS=${getDef("trips.sell.cutoff")?.schema.safeParse({ daysBefore: 1, atMin: 1, perChannel: { BOGUS: { daysBefore: 1, atMin: 1 } } }).success}`, defCh ? "" : "");
{ const s = getDef("trips.sell.cutoff")!.schema.safeParse(JSON.parse('{"daysBefore":0,"atMin":0,"perChannel":{"__proto__":{"daysBefore":1,"atMin":1}}}')); out("8-proto", fmt(s.data), "ownKeys", Object.keys(((s.data as Rec)?.perChannel ?? {}) as Rec), "json", JSON.stringify(s.data)); }
process.exit(0);
