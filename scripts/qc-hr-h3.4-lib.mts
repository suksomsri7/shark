// QC — HR V2 · H3.4 fix round 1 (controller rulings F1–F10 + reviewer coverage list) — behavioural checks split out of qc-hr-h3.4.mts (file size).
// ⚠️ Oracle under change control — ORACLE-EDIT only. Every check builds its own HR system inside the suite's tenant (no shared literals with S4.5–S4.15)
//   and is RED-able by breaking the code path it names. Money literals = hand arithmetic (wo-notes/hr-H3.4.md fix round 1).
import { type Any, short, errText, dbDate, canon, modState, rd, stripComments, sha, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, pathInBase, changedVsBase, diffHunks, fileAt, srcFiles, importsOf, jsonOf, testidsOf, msgParity, tokensOnly } from "./qc-hr-lib.mjs";

// ═════════════════════════ pure (moved verbatim from qc-hr-h3.4.mts — fix round 1, file size) ═════════════════════════
let FX: Any = null;
let LAWSET: Any = null;
const _setFx = (fx: Any) => { FX = fx; LAWSET = FX ? { SSO: { id: "fx-sso", json: FX.law?.SSO }, TAX_BRACKET: { id: "fx-tax", json: FX.law?.TAX_BRACKET }, DEDUCTION: { id: "fx-ded", json: FX.law?.DEDUCTION } } : null; };
export const lineStr = (l: Any, ref?: (x: string) => string) =>
  `${l?.code}:${ref ? ref(String(l?.ref)) : l?.ref}:${l?.day ?? "-"}:${l?.minutes ?? "-"}:${l?.amountSatang}${l?.requestedSatang != null ? `/${l.requestedSatang}` : ""}`;
const projOf = (o: Any, ref?: (x: string) => string) => {
  if (!o || o.ok === false) return { ok: false, code: o?.code ?? "∅" };
  return {
    ok: true, lines: (o.lines ?? []).map((l: Any) => lineStr(l, ref)), whtIncomeSatang: o.whtIncomeSatang, ssoWageSatang: o.ssoWageSatang, ssoBaseSatang: o.ssoBaseSatang,
    ssoEmployeeSatang: o.ssoEmployeeSatang, ssoEmployerSatang: o.ssoEmployerSatang, whtSatang: o.whtSatang, whtOneOffSatang: o.whtOneOffSatang, availableSatang: o.availableSatang, advanceAppliedSatang: o.advanceAppliedSatang,
    claimAppliedSatang: o.claimAppliedSatang, catCapSatang: o.catCapSatang, totalCapSatang: o.totalCapSatang, carry: (o.carry ?? []).map((c: Any) => `${c.cls}:${c.amountSatang}`), receivable: (o.receivable ?? []).map((c: Any) => `${c.cls}:${c.amountSatang}`), addSatang: o.addSatang,
    deductSatang: o.deductSatang, grossSatang: o.grossSatang, netSatang: o.netSatang, blocked: o.blocked ?? null, flags: [...(o.flags ?? [])].sort(),
  };
};
const inputOf = (v: Any) => {
  const { law, ...rest } = v.input;
  return { input: { ...FX._meta.defaults, ...rest }, lawSet: law === "NO_SSO" ? { TAX_BRACKET: LAWSET!.TAX_BRACKET, DEDUCTION: LAWSET!.DEDUCTION } : typeof law === "string" && FX.law?.[law] ? { ...LAWSET!, SSO: { id: `fx-${law}`, json: FX.law[law] } } : LAWSET };
};
export function runPureH34(E: { FX: Any; F: Record<string, string>; ck: (id: string, r: Record<string, unknown>, exp: string, extra?: string) => void; chk: (id: string, ok: boolean, exp: string, act: string) => void }, R: Any, OR: Any, V2: Any): void {
  _setFx(E.FX);
  const { F, ck, chk } = E;
  const fn = R && !R.__err && typeof R.computeRunItemV2 === "function" ? R.computeRunItemV2 : null;
  const call = (inp: Any, law: Any) => {
    if (!fn) return { ok: false, code: `∅computeRunItemV2 (${modState(R, F.rules)})` };
    try {
      return fn(inp, law);
    } catch (e) {
      return { ok: false, code: `THROW ${errText(e)}` };
    }
  };
  const group = (id: string, from: number, to: number, extra: string[] = []) => {
    const vs = (FX?.vectors ?? []).filter((v: Any) => { const n = Number(v.id.slice(1)); return (n >= from && n <= to) || extra.includes(v.id); });
    const bad: string[] = [];
    for (const v of vs) {
      const { input, lawSet } = inputOf(v);
      const got = projOf(call(input, lawSet));
      const want = v.want.ok === false ? { ok: false, code: v.want.code } : { ...v.want };
      if (canon(got) !== canon(want)) bad.push(`${v.id}: ${short(got, 160)}`);
    }
    chk(id, vs.length > 0 && bad.length === 0, `${vs.length} literal vectors`, bad.slice(0, 2).join(" ‖ ") || "all");
  };
  group("S2.1", 1, 7);
  group("S2.2", 8, 11);
  group("S2.3", 12, 14);
  group("S2.4", 15, 24);
  group("S2.5", 25, 28);
  group("S2.6", 29, 32);
  group("S2.7", 33, 36);
  group("S2.8", 37, 44, ["V51", "V61", "V62", "V63", "V65", "V66", "V67"]);
  group("S2.13", 52, 60, ["V64"]);
  group("S2.14", 68, 72);
  group("S2.9", 45, 49);
  group("S2.10", 50, 50);
  {
    const f = OR && typeof OR.otAmount === "function" ? OR.otAmount : null;
    const bad: string[] = [];
    for (const v of FX?.otNormal ?? []) {
      let got: Any;
      try {
        got = f ? f({ ...v.input, law: OR.OT_LAW_DEFAULT }) : null;
      } catch (e) {
        got = { err: errText(e) };
      }
      const g = got?.ok ? { segments: got.segments.map((s: Any) => `${s.cls}:${s.minutes}:${s.multiplierBp}:${s.amountSatang}`), amountSatang: got.amountSatang } : got;
      if (canon(g) !== canon(v.want)) bad.push(`${v.id}: ${short(g, 120)}`);
    }
    chk("S2.11", (FX?.otNormal ?? []).length === 5 && bad.length === 0, "5 literal vectors", bad.slice(0, 2).join(" ‖ ") || "all");
  }
  {
    const c = (b: number, a: Any[]) => {
      try {
        return V2.classifyIncomeV2(b, a);
      } catch (e) {
        return { code: (e as Any)?.code ?? errText(e) };
      }
    };
    const ok = c(1500000, [{ kind: "REFUND", amountSatang: 50000 }]);
    const tip = c(3000000, [{ kind: "TIP", amountSatang: 100 }]);
    const r = { refund: canon(ok) === canon({ whtIncomeSatang: 1500000, ssoWageSatang: 1500000, addSatang: 50000, deductSatang: 0, grossSatang: 1550000 }), tip: tip?.code === "BAD_KIND" };
    ck("S2.12", r, "REFUND classified · TIP refused", short(ok, 120));
  }
  {
    const bad: string[] = [];
    let n = 0;
    for (const v of FX?.vectors ?? []) {
      if (v.want.ok === false) continue;
      const { input, lawSet } = inputOf(v);
      const o = call(input, lawSet);
      n++;
      const sumLines = (o?.lines ?? []).reduce((s: number, l: Any) => s + Number(l.amountSatang), 0);
      const req = (o?.lines ?? []).filter((l: Any) => ["ADVANCE", "DEDUCTION"].includes(l.code)).reduce((s: number, l: Any) => s + Number(l.requestedSatang) + Number(l.amountSatang), 0);
      const carry = [...(o?.carry ?? []), ...(o?.receivable ?? [])].reduce((s: number, c: Any) => s + Number(c.amountSatang), 0);
      const ok = o?.ok && o.grossSatang === o.netSatang + o.ssoEmployeeSatang + o.whtSatang && sumLines === o.grossSatang && (o.blocked || o.netSatang >= 0) && (o.blocked || req === carry);
      if (!ok) bad.push(v.id);
    }
    chk("S3.1", n >= 40 && bad.length === 0, "identities on all ok vectors", `${n} · bad ${bad.slice(0, 6).join(",") || "none"}`);
  }
  {
    const v = (FX?.vectors ?? []).find((x: Any) => x.id === "V33");
    const deepFreeze = (o: Any): Any => (o && typeof o === "object" ? (Object.values(o).forEach(deepFreeze), Object.freeze(o)) : o);
    const { input, lawSet } = v ? inputOf(v) : { input: {}, lawSet: null };
    const before = canon(input);
    const fz = deepFreeze(JSON.parse(JSON.stringify(input)));
    const [dn, mr] = [Date.now, Math.random];
    let trapped = false;
    Date.now = () => ((trapped = true), 0);
    Math.random = () => ((trapped = true), 0);
    let a: Any, b: Any;
    try {
      a = call(fz, lawSet);
      b = call(JSON.parse(before), lawSet);
    } finally {
      Date.now = dn;
      Math.random = mr;
    }
    const r = { ok: a?.ok === true, same: canon(a) === canon(b), untouched: canon(fz) === before, noClock: !trapped, defaults: canon(R?.RUN_V2_DEFAULTS ?? null) === canon({ normalDayMin: 480, catCapBp: 1000, totalCapBp: 2000 }) };
    ck("S3.2", r, "pure + defaults", short(a, 80));
  }
  {
    const v = (FX?.vectors ?? []).find((x: Any) => x.id === "V38");
    const { input, lawSet } = v ? inputOf(v) : { input: {}, lawSet: null };
    const p1 = call(input, lawSet);
    const c = Number((p1?.carry ?? []).find((x: Any) => x.cls === "ADVANCE")?.amountSatang ?? 0);
    const p2 = call({ ...input, periodKey: "2031-10", monthIndex: 2, adjustments: [{ id: "cf1", kind: "ADVANCE", sourceType: "CARRY_FORWARD", amountSatang: c }] }, lawSet);
    const r = { carry: c === 575000, p2: p2?.advanceAppliedSatang === 575000 && (p2?.carry ?? []).length === 0, sum: Number(p1?.advanceAppliedSatang) + Number(p2?.advanceAppliedSatang) === 2000000 };
    ck("S3.3", r, "1,425,000 + 575,000 = 2,000,000", `c=${c} p2=${p2?.advanceAppliedSatang}`);
  }
  {
    const days = Array.from({ length: 30 }, (_, i) => ({ workDayId: `w${i}`, day: `2031-09-${String(i + 1).padStart(2, "0")}`, dayClass: "WORKDAY", workMin: 480, paidLeaveMin: 0, unpaidLeaveMin: i === 3 ? 480 : 0, holidayWorkMin: 0, holidayPaidMin: 0, unplannedMin: 0, review: [], otHolidayWorkMin: 0 }));
    const t0 = performance.now();
    let ok = 0;
    for (let e = 0; e < 300; e++) if (call({ ...FX._meta.defaults, payType: e % 3 === 0 ? "MONTHLY" : "DAILY", baseSalarySatang: 2000000 + e, dailyRateSatang: 50000, periodKey: "2031-09", days, adjustments: [{ id: `a${e}`, kind: "ADVANCE", amountSatang: 100000 }] }, LAWSET)?.ok) ok++;
    const ms = performance.now() - t0;
    ck("S3.4", { all: ok === 300, fast: ms < 2000 }, "300 ok < 2 s", `${ok} in ${ms.toFixed(0)} ms`);
  }
}


// ═════════════════════════ statics (moved verbatim from qc-hr-h3.4.mts — fix round 1, file size) ═════════════════════════
const marked = (base: string, f: string, tag = /HR H\d/) => {
  const hs = diffHunks(base, f);
  if (hs === null) return { n: -1, bad: 1 };
  const live = hs.filter((h) => h.added.length > 0);
  return { n: live.length, bad: live.filter((h) => !h.added.some((l) => tag.test(l))).length };
};
export const fnBody = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
};
const WRITE_RE = /\b(hrPayrollRun|hrPayrollItem|hrPayAdjustment)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(HrPayrollRun|HrPayrollItem|HrPayAdjustment)"/i;
export function runStaticH34(E: { F: Record<string, string>; FROZEN: string[]; TESTIDS: string[]; BASE: string; H: string; ck: (id: string, r: Record<string, unknown>, exp: string, extra?: string) => void; chk: (id: string, ok: boolean, exp: string, act: string) => void }): void {
  const { F, FROZEN, TESTIDS, BASE, H, ck, chk } = E;
  const rules = stripComments(rd(F.rules));
  const ui = rd(F.ui);
  {
    const imp = importsOf(rules);
    const r = {
      files: rules.length > 0 && ui.length > 0,
      imports: imp.length > 0 && imp.every((i) => ["./payroll-rules-v2", "./ot-rules"].includes(i.spec ?? "")),
      pure: !/Date\.now|new Date\(\s*\)|Math\.random|process\.env|@\/lib\/core|prisma|tenantDb|await\s/.test(rules),
      exports: /export\s+function\s+computeRunItemV2\b/.test(rules) && /export\s+const\s+RUN_V2_DEFAULTS\b/.test(rules),
    };
    ck("S1.1", r, "files · pure · exports", `imports=${imp.map((i) => i.spec).join(",") || "∅"}`);
  }
  {
    const k = stripComments(rd(F.migK).replace(/--.*$/gm, "")).replace(/\s+/g, " ").trim();
    const c = stripComments(rd(F.migC).replace(/--.*$/gm, ""));
    const stmts = k.split(";").map((s) => s.trim()).filter(Boolean);
    const sch = rd(F.schema);
    const enumBody = (n: string) => (sch.match(new RegExp(`enum ${n} \\{([^}]*)\\}`))?.[1] ?? "");
    const r = {
      kinds: stmts.length === 2 && stmts.some((s) => /^ALTER TYPE "HrPayItemKind" ADD VALUE 'REFUND'$/i.test(s)) && stmts.some((s) => /^ALTER TYPE "HrPaySource" ADD VALUE 'CARRY_FORWARD'$/i.test(s)),
      cols: /ADD COLUMN\s+"stepsJson"\s+JSONB/i.test(c) && /ADD COLUMN\s+"inputDigest"\s+TEXT/i.test(c) && /ADD COLUMN\s+"consentAt"\s+TIMESTAMP/i.test(c),
      additive: c.length > 0 && !/\bDROP\b|\bRENAME\b|ALTER\s+TYPE/i.test(c),
      schema: /\bREFUND\b/.test(enumBody("HrPayItemKind")) && /\bCARRY_FORWARD\b/.test(enumBody("HrPaySource")) && /stepsJson\s+Json\?/.test(sch) && /inputDigest\s+String\?/.test(sch),
    };
    ck("S1.2", r, "2 migrations exact · schema", `kinds=${short(k, 120)}`);
  }
  {
    const bad: string[] = [];
    for (const p of srcFiles("src")) {
      if (p === F.payroll) continue;
      if (!WRITE_RE.test(stripComments(rd(p)))) continue;
      const old = fileAt(BASE, p);
      if (old !== null && WRITE_RE.test(stripComments(old))) continue;
      bad.push(p);
    }
    chk("S1.3", bad.length === 0 && rd(F.rules).length > 0, "payroll.ts only (+ base writers)", bad.join(",") || (rd(F.rules) ? "ok" : "rules absent"));
  }
  {
    const pay = stripComments(rd(F.payroll));
    const named = [F.rules, F.ui, F.payroll].filter((p) => /hrLawTable|HrLawTable/.test(stripComments(rd(p))));
    const r = { none: named.length === 0, reads: /loadLawSet\s*\(/.test(pay) && importsOf(pay).some((i) => i.spec === "./law"), built: rd(F.rules).length > 0 };
    ck("S1.4", r, "law.ts only reader", named.join(","));
  }
  {
    const re = /\b(lat|lng|accuracyM|photoKey|gpsLat|gpsLng|selfie)\b/;
    const hunks = (diffHunks(BASE, F.payroll) ?? []).flatMap((h) => h.added).join("\n");
    const hits = [["rules", rd(F.rules)], ["ui", rd(F.ui)], ["payroll+", hunks]].filter(([, s]) => re.test(stripComments(s))).map(([n]) => n);
    chk("S1.5", hits.length === 0 && rd(F.rules).length > 0, "none", hits.join(",") || (rd(F.rules) ? "clean" : "rules absent"));
  }
  {
    const shaNow = sha(rd(PAYROLL_RULES_FILE));
    // ORACLE-EDIT (H3.4 builder, phase B — merge of H3.2; narrowed in fix round 1 F10): work-entries.ts / judge.ts may differ from the base ONLY by
    //   the named additive gate readers (H3.2: workEntryStatesInTx · workEntrySourceEmployeesInTx · H3.4: workEntryPunchEmployeesInTx) inside their marked
    //   blocks + the one import line of workEntryPunchEmployeesInTx — both sides are compared with exactly those blocks/lines removed, and every export
    //   inside a removed block must be one of the named readers
    const GATE_READERS = new Set(["workEntryStatesInTx", "workEntrySourceEmployeesInTx", "workEntryPunchEmployeesInTx", "unbindWorkEntriesFromRunInTx"]); // + fix r2 G7 (the pair of bindWorkEntriesToRunInTx)
    const cutBlocks = (src: string | null) => {
      if (src === null) return { rest: null as string | null, names: [] as string[] };
      const names: string[] = [];
      let rest = src.replace(/^.*\bimport \{ workEntryPunchEmployeesInTx \} from "\.\/judge";.*\n/m, "");
      rest = rest.replace(/^\/\/[^\n]*HR H3\.[24] ▸[^\n]*\n[\s\S]*?^\/\/ ◂ HR H3\.[24]\n/gm, (blk) => {
        for (const m of blk.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.push(m[1]!);
        return "";
      });
      return { rest, names };
    };
    const onlyGateReaders = (f: string) => {
      const now = cutBlocks(rd(f));
      const was = cutBlocks(fileAt(BASE, f));
      return now.rest !== null && was.rest !== null && now.rest === was.rest && now.names.length > 0 && now.names.every((n) => GATE_READERS.has(n));
    };
    // ORACLE-EDIT (H3.4 fix round 3 H5, controller ruling): attendance-pay.ts may carry exactly the two marked leaver-targeting lines (one import · the
    //   `periodKey:` line of the corrected row) — undoing exactly those two lines must give the base bytes
    const AP_IMPORT = 'import { leaverDraftPeriodInTx } from "./payroll"; // HR H3.4 ◂ fix r3 H5';
    const AP_TARGET = "                  periodKey: (await leaverDraftPeriodInTx(tx as never, ctx, e.id, P)) ? P : target, // HR H3.4 ◂ fix r3 H5: คนที่ออกในงวด P · รอบ P ยังร่าง ⇒ งวด P";
    const apOnlyLeaver = (f: string) => {
      const now = rd(f).split("\n");
      if (now.filter((x) => x === AP_IMPORT).length !== 1 || now.filter((x) => x === AP_TARGET).length !== 1) return false;
      return now.filter((x) => x !== AP_IMPORT).map((x) => (x === AP_TARGET ? "                  periodKey: target," : x)).join("\n") === fileAt(BASE, f);
    };
    const ch = changedVsBase(BASE, FROZEN.filter((p) => pathInBase(p, BASE) && !((p === `${H}work-entries.ts` || p === `${H}judge.ts`) && onlyGateReaders(p)) && !(p === `${H}attendance-pay.ts` && apOnlyLeaver(p))));
    chk("S1.6", shaNow === PAYROLL_RULES_SHA && ch === "unchanged", "sha · unchanged", `sha=${shaNow.slice(0, 12)} ${ch}`);
  }
  {
    const v2 = marked(BASE, F.v2, /HR H3\.4/);
    const others = [F.otRules, F.ot, F.acts, F.index].map((f) => [f.split("/").pop(), marked(BASE, f)] as const);
    const pay = stripComments(rd(F.payroll));
    const r = {
      v2: v2.n >= 1 && v2.n <= 2 && v2.bad === 0, others: others.every(([, m]) => m.bad === 0) && others.slice(0, 2).every(([, m]) => m.n >= 1),
      flag: /\bV2_VARIABLE_PAY\s*=\s*false\b/.test(pay), dispatch: /createPayrollRunV2\b/.test(pay) && /HR H3\.4/.test(rd(F.payroll)),
    };
    ck("S1.7", r, "marked hunks", `v2=${v2.n}/${v2.bad} ${others.map(([n, m]) => `${n}=${m.n}/${m.bad}`).join(" ")}`);
  }
  {
    const a = stripComments(rd(F.acts));
    const rev = fnBody(a, "reverseRunAction");
    const dec = fnBody(a, "decideAdjustmentAction");
    const r = { reverse: /"hr\.payroll\.reverse"/.test(rev) && !/"hr\.payroll\.approve"/.test(rev), reject: /"hr\.payadjust\.reject"/.test(dec) && /assertHrCan\([^)]*"hr\.payadjust\.reject"/.test(dec) };
    ck("S1.8", r, "reverse + reject keys", `rev=${rev.length} dec=${dec.length}`);
  }
  {
    const ids = testidsOf(ui, "hr-run2-");
    const th = jsonOf(F.th)?.hr?.run2 ?? {};
    const en = jsonOf(F.en)?.hr?.run2 ?? {};
    const mp = msgParity(th, en, []);
    const inv = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => x.wo === "H3.4");
    const tok = tokensOnly(stripComments(ui));
    const engine = srcFiles("src").some((p) => /\.tsx$/.test(p) && rd(p).includes("hr-run2-engine"));
    const r = {
      testids: TESTIDS.every((t) => ids.has(t)), inv: inv.length >= TESTIDS.length, msgs: Object.values(mp).every(Boolean), tokens: Object.values(tok).every(Boolean) && ui.length > 0,
      page: /payroll-run-ui/.test(rd(F.page)), engine,
    };
    ck("S1.9", r, "UI contract", `missing=${TESTIDS.filter((t) => !ids.has(t)).join(",").slice(0, 120)}`);
  }
  {
    const rules = stripComments(rd(F.rules));
    const block = (diffHunks(BASE, F.payroll) ?? []).flatMap((h) => h.added).map((l) => stripComments(l)).join("\n");
    const r = { rules: rules.length > 0 && !/otWorkdayMin|otHolidayMin/.test(rules), payroll: block.length > 0 && !/otWorkdayMin|otHolidayMin/.test(block), ot: /holidayWorkPricedInTx\s*\(/.test(stripComments(rd(F.ot))), exp: /export\s+async\s+function\s+holidayWorkPricedInTx\b/.test(rd(F.payroll)) };
    ck("S1.10", r, "never priced · H2.9 subtracts run minutes", "");
  }
}



export const FIX_CHECKS = `
S4.19|F1|C|R|[db] (fix r1 F1) holiday worked 400 min (no roster) · OT request 200 min inside: run first ⇒ request pays 0 · request first ⇒ run 200 + request keeps 4,167
S4.20|F2|C|R|[db] (fix r1 F2) cancel a bound ALLOWANCE + a stock charge on a v2 draft ⇒ rebuilt with the v2 engine (snapshot v2 · net 1,917,500 · REFUND still bound · canceller = maker)
S4.21|F3|C|R|[db] (fix r1 F3) JV post fails ⇒ DRAFT · approvedBy null · 0 carry rows · Oct create refused YTD_DRAFT · re-approve ⇒ exactly one carry row 250,000
S4.22|F5|C|R|[db] (fix r1 F5) reverse Sept while Oct v2 run is APPROVED ⇒ LATER_RUN (fixed text) · both runs unchanged
S4.23|F6|C|R|[db] (fix r1 F6) consented stock charge above the cap (shop caps 30/40 %) ⇒ carried DAMAGES row keeps consent ⇒ next month applied beyond 10 %
S4.24|F8|C|R|[db] (fix r1 F8) payroll viewer limited to one unit ⇒ preview totals = Σ visible rows (scope UNITS)
S4.25|cov|C|R|[db] setAdjustmentConsent: no key ⇒ refused · bound row ⇒ refused · consent lifts the legal cap on a real run (400,000 applied vs 150,000 + CAP_NEEDS_CONSENT)
S4.26|cov|C|R|[db] VARIABLE_PAY (DAILY profile) refused in the DB path · YTD_DRAFT refused (S4.21 window)
S4.27|cov|C|R|[db] INPUTS_CHANGED for law activation · adjustment amount · work-day minutes · carry-in row · cap setting · membership (new member) · OT holiday-work minutes (S4.19)
S4.28|cov|C|R|[db] leaver final period ⇒ item receivable DAMAGES 300,000 · approve writes 0 carry rows · preview review RECEIVABLE
S4.29|cov|M|R|[db] SHOP holiday mapped from HrHoliday ⇒ snapshot holidayKinds = SHOP
S4.30|cov|C|R|[db] engine switch back to v1 refused while a v2 DRAFT exists (fixed text) · engine stays 2
`.trim();

type Ck = (id: string, r: Record<string, unknown>, exp: string, extra?: string) => void;
export type FixEnv = {
  P: Any; TT: string; tag: string; ck: Ck; T: Record<string, string>; LAW_KEY: string;
  sys: (n: string) => Promise<string>; me: (s: string, n: string, o?: Record<string, unknown>) => Promise<string>;
  adj: (s: string, emp: string, per: string, kind: string, amount: number) => Promise<string>;
  att: (s: string, emp: string, kind: string, at: Date, re: string | null) => Promise<string>;
  PY: (fn: string, ...a: unknown[]) => Promise<{ ok: boolean; text: string; value: Any }>;
  rows: (sql: string, ...p: unknown[]) => Promise<Any[]>;
  itemBy: (run: string | undefined, emp: string) => Promise<Any>;
  runRow: (id: string | undefined) => Promise<Any>;
  bk: (day: string, hm?: string) => Date;
  V: Record<string, Any>; A: Record<string, Any>; U: Record<string, Any>;
  u1: string; u2: string; OT: Any; JG: Any; SC: Any; pay: Any; mkUser: Any;
  PAY_SEP: Date; PAY_OCT: Date; N_OCT1: Date; N_NOV1: Date; WE?: Any;
};

export async function runFixRound1(X: FixEnv): Promise<void> {
  const { P, TT, ck, T, sys, me, adj, att, PY, rows, itemBy, runRow, bk, V, A, U, u1 } = X;
  const SEP = "2031-09";
  const OCT = "2031-10";
  const shop = async (n: string) => {
    const s = await sys(n);
    await PY("setPayrollEngine", { tenantId: TT, systemId: s }, V.owner, { engineVersion: 2 }, { now: X.N_OCT1 });
    return { s, c: { tenantId: TT, systemId: s } };
  };
  const prof = (s: string, emp: string, base: number, extra: Record<string, unknown> = {}) =>
    P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: emp, baseSalarySatang: base, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 }, ...extra } });
  const create = (c: Any, per = SEP, payDate = X.PAY_SEP, now = X.N_OCT1) => PY("createPayrollRunV2", c, V.pay1, { periodKey: per, payDate }, { now, actor: A.pay1 });
  const approve = (c: Any, id: string | undefined, actor: Any = A.pay3, hooks?: Any) => (hooks ? PY("approveRun", c, id ?? "∅", undefined, actor, hooks) : PY("approveRun", c, id ?? "∅", undefined, actor));
  const codeOf = (r: { value: Any }) => String(r.value?.code ?? "");
  const shown = (r: { ok: boolean; text: string }) => (r.ok ? "ok" : `"${short(r.text, 60)}"`);
  const carryRows = async (s: string) => rows(`SELECT kind::text AS k, "amountSatang" AS a, "periodKey" AS p, status::text AS st, "consentAt" AS c, "runId" FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD' ORDER BY "createdAt"`, s);
  const guard = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      ck(id, { crashed: false }, "no crash", `THROW ${errText(e)}`);
    }
  };

  // ── S4.30 engine switch-back while a v2 draft exists ──
  await guard("S4.30", async () => {
    const { s, c } = await shop("ทีมสลับรุ่น");
    const e1 = await me(s, "สลับ", { unitId: u1 });
    await prof(s, e1, 1500000);
    const cr = await create(c);
    const back = await PY("setPayrollEngine", c, V.owner, { engineVersion: 1 }, { now: X.N_OCT1 });
    const eng = await PY("getPayrollEngine", c);
    ck("S4.30", { created: cr.ok, refused: !back.ok && back.text === T.engineDraft, still2: eng.value?.engineVersion === 2 }, "engineDraft · engine 2", `${shown(cr)} ${shown(back)}`);
    if (cr.value?.id) await X.pay.deleteDraftRun(c, cr.value.id, A.owner).catch(() => null);
  });

  // ── S4.29 SHOP holiday mapping ──
  await guard("S4.29", async () => {
    const { s, c } = await shop("ทีมปิดร้าน");
    const e1 = await me(s, "ปิด", { unitId: u1 });
    await prof(s, e1, 1500000);
    await P.hrHoliday.create({ data: { tenantId: TT, systemId: s, unitId: null, date: dbDate("2031-09-10"), name: `ปิดร้าน ${X.tag}`, kind: "SHOP" } });
    const cr = await create(c);
    const kinds = (await itemBy(cr.value?.id, e1))?.snapshotJson?.holidayKinds ?? {};
    ck("S4.29", { ok: cr.ok, shop: kinds["2031-09-10"] === "SHOP" }, "holidayKinds SHOP", `${shown(cr)} ${short(kinds, 60)}`);
    if (cr.value?.id) await X.pay.deleteDraftRun(c, cr.value.id, A.owner).catch(() => null);
  });

  // ── S4.26 VARIABLE_PAY ──
  let ytdOk = false;
  await guard("S4.26", async () => {
    const { s, c } = await shop("ทีมรายวัน");
    const e1 = await me(s, "รายวัน", { unitId: u1 });
    await prof(s, e1, 0, { payType: "DAILY", dailyRateSatang: 40000 });
    const cr = await create(c);
    (X as Any).__variable = !cr.ok && codeOf(cr) === "VARIABLE_PAY" && cr.text === T.variablePay;
  });

  // ── S4.21 / S4.22 failed JV post · YTD_DRAFT · LATER_RUN ──
  await guard("S4.21", async () => {
    const { s, c } = await shop("ทีมลงบัญชีล้ม");
    await PY("setPayrollBook", c, V.owner, { accountSystemId: (await rows(`SELECT id FROM "AppSystem" WHERE "tenantId" = $1 AND type::text = 'ACCOUNT' ORDER BY "createdAt" LIMIT 1`, TT))[0]?.id ?? null }); // ORACLE-EDIT (H3.7 builder): JV asserted ⇒ explicit HR→ACCOUNT link (H3.7 R3)
    const e1 = await me(s, "ล้ม", { unitId: u1 });
    await prof(s, e1, 1500000);
    await adj(s, e1, SEP, "DEDUCTION", 400000);
    const cr = await create(c);
    const f = await approve(c, cr.value?.id, A.pay3, { __failJournal: true });
    const r1 = await runRow(cr.value?.id);
    const c1 = await carryRows(s);
    const oct = await create(c, OCT, X.PAY_OCT, X.N_NOV1);
    ytdOk = !oct.ok && codeOf(oct) === "YTD_DRAFT" && oct.text === T.ytdDraft;
    const ok = await approve(c, cr.value?.id, A.pay3);
    const c2 = await carryRows(s);
    const r2 = await runRow(cr.value?.id);
    ck("S4.21", {
      failed: !f.ok && codeOf(f) === "POST_FAILED" && f.text === T.postFailed, draft: r1?.status === "DRAFT" && r1?.approvedById === null && r1?.journalEntryId === null, noCarry: c1.length === 0,
      octRefused: ytdOk, reapproved: ok.ok && r2?.status === "APPROVED" && !!r2?.journalEntryId, once: c2.length === 1 && Number(c2[0]?.a) === 250000 && c2[0]?.p === OCT,
    }, "post fail restored · one carry 250,000", `${shown(f)} carry=${c1.length}→${c2.length} oct=${codeOf(oct)} ${shown(oct)} ${shown(ok)}`);
    // S4.22: Oct approved ⇒ reversing Sept refused LATER_RUN
    const oc = await create(c, OCT, X.PAY_OCT, X.N_NOV1);
    const oa = await approve(c, oc.value?.id, A.pay3);
    const rv = await PY("reverseRun", c, cr.value?.id ?? "∅", "qc", A.owner);
    const [sr, or] = [await runRow(cr.value?.id), await runRow(oc.value?.id)];
    ck("S4.22", { setup: oc.ok && oa.ok, refused: !rv.ok && codeOf(rv) === "LATER_RUN" && rv.text === T.laterRun, unchanged: sr?.status === "APPROVED" && or?.status === "APPROVED" }, "LATER_RUN", `${shown(oc)} ${shown(oa)} ${shown(rv)}`);
    await PY("reverseRun", c, oc.value?.id ?? "∅", "qc cleanup", A.owner);
    await PY("reverseRun", c, cr.value?.id ?? "∅", "qc cleanup", A.owner);
  });
  ck("S4.26", { variable: (X as Any).__variable === true, ytd: ytdOk }, "VARIABLE_PAY · YTD_DRAFT", "");

  // ── S4.28 leaver receivable ──
  await guard("S4.28", async () => {
    const { s, c } = await shop("ทีมลาออก");
    const e1 = await me(s, "ลาออก", { unitId: u1, endDate: "2031-09-20" });
    await prof(s, e1, 1500000);
    await adj(s, e1, SEP, "DEDUCTION", 400000);
    const cr = await create(c);
    const it = await itemBy(cr.value?.id, e1);
    const pv = await PY("previewPayrollRunV2", c, V.owner, { runId: cr.value?.id ?? "∅" });
    const ap = await approve(c, cr.value?.id);
    const cr2 = await carryRows(s);
    ck("S4.28", {
      rec: JSON.stringify(it?.snapshotJson?.receivable ?? []) === JSON.stringify([{ cls: "DAMAGES", amountSatang: 300000 }]) && (it?.snapshotJson?.carry ?? []).length === 0,
      net: Number(it?.netSatang) === 850000, review: (pv.value?.review ?? []).some((x: Any) => x.employeeId === e1 && x.code === "RECEIVABLE"), approved: ap.ok, noCarry: cr2.length === 0,
    }, "receivable 300,000 · 0 carry", `${shown(cr)} net=${it?.netSatang} ${shown(ap)} carry=${cr2.length}`);
    if (ap.ok) await PY("reverseRun", c, cr.value?.id ?? "∅", "qc cleanup", A.owner);
  });

  // ── S4.25 consent ──
  await guard("S4.25", async () => {
    const { s, c } = await shop("ทีมยินยอม");
    await PY("setPayrollEngine", c, V.owner, { engineVersion: 2, catCapBp: 3000, totalCapBp: 4000 }, { now: X.N_OCT1 });
    const [e1, e2] = [await me(s, "ยินยอม", { unitId: u1 }), await me(s, "ไม่ยินยอม", { unitId: u1 })];
    await prof(s, e1, 1500000);
    await prof(s, e2, 1500000);
    const d1 = await adj(s, e1, SEP, "DEDUCTION", 400000);
    await adj(s, e2, SEP, "DEDUCTION", 400000);
    const noKey = await PY("setAdjustmentConsent", c, V.staffHr, { id: d1, consent: true });
    const yes = await PY("setAdjustmentConsent", c, V.owner, { id: d1, consent: true });
    const cr = await create(c);
    const bound = await PY("setAdjustmentConsent", c, V.owner, { id: d1, consent: false });
    const [i1, i2] = [await itemBy(cr.value?.id, e1), await itemBy(cr.value?.id, e2)];
    ck("S4.25", {
      noKey: !noKey.ok, ok: yes.ok, boundRefused: !bound.ok, lifted: Number(i1?.deductSatang) === 400000, legal: Number(i2?.deductSatang) === 150000 && (i2?.snapshotJson?.flags ?? []).includes("CAP_NEEDS_CONSENT"),
    }, "consent rules + cap lifted", `${shown(noKey)} ${shown(yes)} ${shown(bound)} d=${i1?.deductSatang}/${i2?.deductSatang}`);
    if (cr.value?.id) await X.pay.deleteDraftRun(c, cr.value.id, A.owner).catch(() => null);
  });

  // ── S4.23 consented stock charge above the cap stays consented next month ──
  await guard("S4.23", async () => {
    const { s, c } = await shop("ทีมหักของ");
    await PY("setPayrollEngine", c, V.owner, { engineVersion: 2, catCapBp: 3000, totalCapBp: 4000 }, { now: X.N_OCT1 });
    const e1 = await me(s, "หักของ", { unitId: u1 });
    await prof(s, e1, 1000000);
    const st = await X.SC.requestStockCharge(c, V.owner, { requestKey: `qc34${X.tag}stk1`, employeeId: e1, kind: "DAMAGE", description: "แก้วแตก", amountSatang: 500000, consent: { confirmed: true, ref: "ยินยอม-34", at: "2031-09-05" } }, { now: bk("2031-09-05") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    if (st?.adjustmentId) await X.pay.decideAdjustment(c, st.adjustmentId, "APPROVED", A.owner).catch(() => null);
    const cr = await create(c);
    const ap = await approve(c, cr.value?.id);
    const carry = await carryRows(s);
    const oc = await create(c, OCT, X.PAY_OCT, X.N_NOV1);
    const io = await itemBy(oc.value?.id, e1);
    // Sept: cap 30 % of 1,000,000 = 300,000 applied (consented) ⇒ carry 200,000 consented ⇒ Oct applies 200,000 (> legal 10 % = 100,000)
    ck("S4.23", { st: !!st?.adjustmentId, approved: ap.ok, carry: carry.length === 1 && Number(carry[0]?.a) === 200000 && !!carry[0]?.c, oct: Number(io?.deductSatang) === 200000 }, "carried row keeps consent", `${short(st, 50)} ${shown(ap)} carry=${short(carry, 80)} oct=${io?.deductSatang}`);
    if (oc.value?.id) await X.pay.deleteDraftRun(c, oc.value.id, A.owner).catch(() => null);
    if (ap.ok) await PY("reverseRun", c, cr.value?.id ?? "∅", "qc cleanup", A.owner);
  });

  // ── S4.20 cancel bound rows on a v2 draft ──
  await guard("S4.20", async () => {
    const { s, c } = await shop("ทีมลบรายการ");
    const e1 = await me(s, "ลบ", { unitId: u1 });
    await prof(s, e1, 2000000);
    const al = await adj(s, e1, SEP, "ALLOWANCE", 10000);
    const rf = await adj(s, e1, SEP, "REFUND", 5000);
    const st = await X.SC.requestStockCharge(c, V.owner, { requestKey: `qc34${X.tag}stk2`, employeeId: e1, kind: "DAMAGE", description: "จานแตก", amountSatang: 3000, consent: { confirmed: true, ref: "ยินยอม-35", at: "2031-09-05" } }, { now: bk("2031-09-05") }).catch(() => null);
    if (st?.adjustmentId) await X.pay.decideAdjustment(c, st.adjustmentId, "APPROVED", A.owner).catch(() => null);
    const cr = await create(c);
    const c1 = await X.pay.cancelAdjustment(c, al, A.pay3).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const c2 = st?.adjustmentId ? await X.pay.cancelStockChargeDraftAdjustment(c, st.adjustmentId, A.pay3).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: false };
    const run = await runRow(cr.value?.id);
    const it = await itemBy(cr.value?.id, e1);
    const refund = (await rows(`SELECT "runId" FROM "HrPayAdjustment" WHERE id = $1`, rf))[0];
    const maker = (await rows(`SELECT "createdById" AS m FROM "HrPayrollRun" WHERE id = $1`, cr.value?.id ?? "∅"))[0]?.m;
    // hand: base 2,000,000 · SSO 87,500 · WHT 0 · REFUND 5,000 ⇒ gross 2,005,000 · net 1,917,500
    ck("S4.20", {
      cancelled: !!c1?.ok && !!c2?.ok, v2: it?.snapshotJson?.engineVersion === 2 && Array.isArray(it?.snapshotJson?.lines), money: Number(it?.netSatang) === 1917500 && Number(run?.n) === 1917500,
      refundBound: refund?.runId === cr.value?.id, maker: maker === U.pay3.id,
    }, "v2 rebuild after cancel", `${short(c1, 40)} ${short(c2, 40)} net=${it?.netSatang} run=${run?.n}`);
    if (cr.value?.id) await X.pay.deleteDraftRun(c, cr.value.id, A.owner).catch(() => null);
  });

  // ── S4.24 preview totals of a branch-limited payroll viewer ──
  await guard("S4.24", async () => {
    const { s, c } = await shop("ทีมสาขา");
    const [e1, e2] = [await me(s, "เหนือ", { unitId: u1 }), await me(s, "ใต้", { unitId: X.u2 })];
    await prof(s, e1, 1500000);
    await prof(s, e2, 3000000);
    const cr = await create(c);
    const wU1 = await X.mkUser("payu1", "STAFF", [u1], { "hr.payroll.read": true });
    const pv = await PY("previewPayrollRunV2", c, { role: wU1.role, unitAccess: wU1.unitAccess, permissions: wU1.permissions, userId: wU1.id }, { runId: cr.value?.id ?? "∅" });
    const rowsV = pv.value?.rows ?? [];
    const t = pv.value?.run?.totals ?? {};
    const i1 = await itemBy(cr.value?.id, e1); // ORACLE-EDIT (fix r2 G8): employer SSO total = Σ visible employer SSO
    ck("S4.24", { rows: rowsV.length === 1 && rowsV[0]?.employeeId === e1, totals: t.netSatang === rowsV[0]?.netSatang && t.grossSatang === rowsV[0]?.grossSatang && t.ssoEmployerSatang === Number(i1?.ssoEmployerSatang), scope: pv.value?.run?.scope === "UNITS" }, "visible totals only", `${shown(pv)} rows=${rowsV.length} net=${t.netSatang}`);
    if (cr.value?.id) await X.pay.deleteDraftRun(c, cr.value.id, A.owner).catch(() => null);
  });

  // ── S4.27 INPUTS_CHANGED matrix (+ OT minutes inside S4.19) ──
  const changed: Record<string, boolean> = {};
  await guard("S4.27", async () => {
    const { s, c } = await shop("ทีมข้อมูลเปลี่ยน");
    const e1 = await me(s, "เปลี่ยน", { unitId: u1 });
    await prof(s, e1, 2000000);
    const al = await adj(s, e1, SEP, "ALLOWANCE", 10000);
    const cf = await adj(s, e1, SEP, "ADVANCE", 30000);
    await P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "sourceType" = 'CARRY_FORWARD', "sourceRef" = $2 WHERE id = $1`, cf, `cf:qc${X.tag}:${e1}:ADVANCE`);
    const cr = await create(c);
    const id = cr.value?.id;
    const tryIt = async (k: string, mut: () => Promise<unknown>, back: () => Promise<unknown>) => {
      await mut();
      const r = await approve(c, id);
      changed[k] = !r.ok && codeOf(r) === "INPUTS_CHANGED" && r.text === T.inputsChanged;
      if (!changed[k]) (changed as Any)[`${k}Code`] = codeOf(r) || (r.ok ? "OK" : short(r.text, 30));
      await back();
    };
    const lawId = `${X.LAW_KEY}-ssoX`;
    await tryIt(
      "law",
      () => P.$executeRawUnsafe(`INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") SELECT $1, kind, '2031-09-15'::date, json, 'ACTIVE'::"HrLawStatus", $1, 'qc h3.4 law activation', 'QC', now() FROM "HrLawTable" WHERE "sourceKey" = $2`, lawId, `${X.LAW_KEY}-sso`),
      () => P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE id = $1`, lawId),
    );
    await tryIt("amount", () => P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "amountSatang" = 10001 WHERE id = $1`, al), () => P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "amountSatang" = 10000 WHERE id = $1`, al));
    await tryIt("carryIn", () => P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "amountSatang" = 30001 WHERE id = $1`, cf), () => P.$executeRawUnsafe(`UPDATE "HrPayAdjustment" SET "amountSatang" = 30000 WHERE id = $1`, cf));
    const wd = (await rows(`SELECT id, "workMin" AS w FROM "HrWorkDay" WHERE "employeeId" = $1 ORDER BY date LIMIT 1`, e1))[0];
    await tryIt("workDay", () => P.$executeRawUnsafe(`UPDATE "HrWorkDay" SET "workMin" = "workMin" + 1 WHERE id = $1`, wd?.id ?? "∅"), () => P.$executeRawUnsafe(`UPDATE "HrWorkDay" SET "workMin" = $2 WHERE id = $1`, wd?.id ?? "∅", Number(wd?.w ?? 0)));
    await tryIt("caps", () => PY("setPayrollEngine", c, V.owner, { engineVersion: 2, catCapBp: 900 }, { now: X.N_OCT1 }), () => PY("setPayrollEngine", c, V.owner, { engineVersion: 2, catCapBp: 1000 }, { now: X.N_OCT1 }));
    // membership: a new salaried member of the period after create (H3.1 gate only reads the run's own work days)
    const eNew = await me(s, "เข้าใหม่", { unitId: u1 });
    await tryIt("membership", () => prof(s, eNew, 1000000), () => P.hrSalaryProfile.deleteMany({ where: { systemId: s, employeeId: eNew } }));
    // fix r2 G9: N (normal day minutes) — the H3.1 work-entries gate runs first; record which refusal answers
    await tryIt("N", () => PY("setPayrollEngine", c, V.owner, { engineVersion: 2 }, { now: X.N_OCT1 }).then(() => X.WE?.setNormalMinutesPerDay({ tenantId: TT, systemId: s }, V.owner, 450)), () => X.WE?.setNormalMinutesPerDay({ tenantId: TT, systemId: s }, V.owner, 480));
    const fin = await approve(c, id);
    changed.finalOk = fin.ok;
    if (fin.ok) await PY("reverseRun", c, id ?? "∅", "qc cleanup", A.owner);
  });

  // ── S4.19 OT holiday work both orders (+ the OT-minutes INPUTS_CHANGED case) ──
  await guard("S4.19", async () => {
    const { s, c } = await shop("ทีมวันหยุด");
    const [ea, eb] = [await me(s, "รอบก่อน", { unitId: u1 }), await me(s, "คำขอก่อน", { unitId: u1 })];
    await prof(s, ea, 3000000);
    await prof(s, eb, 3000000);
    await P.hrHoliday.create({ data: { tenantId: TT, systemId: s, unitId: null, date: dbDate("2031-09-17"), name: `วันหยุด ${X.tag}`, kind: "PUBLIC" } });
    for (const e of [ea, eb]) {
      await att(s, e, "IN", bk("2031-09-17", "08:00"), null);
      await att(s, e, "OUT", bk("2031-09-17", "14:40"), null);
    }
    for (const d of ["2031-09-22", "2031-09-29", "2031-10-01"]) await X.JG.runAttendanceJobs({ now: bk(d), tenantId: TT });
    const otRows = async (e: string) => rows(`SELECT "amountSatang" AS a, status::text AS st FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'OT_REQUEST' AND status::text <> 'REJECTED'`, e);
    const sum = (rs: Any[]) => rs.reduce((x, r) => x + Number(r.a), 0);
    // order B: request first (200 min inside the worked hours) — settled before the run
    const qb = await X.OT.requestOt(c, V.owner, { employeeId: eb, date: "2031-09-17", start: "09:00", end: "12:20" }, { now: bk("2031-09-16") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    await X.OT.decideOtRequest(c, V.owner, qb?.id ?? "∅", "APPROVED", { now: bk("2031-09-25") }).catch(() => null);
    const otB0 = sum(await otRows(eb));
    const cr = await create(c);
    // OT holiday-work minutes changed after create ⇒ INPUTS_CHANGED (coverage list)
    const seg = (await rows(`SELECT "segmentsJson" AS j FROM "HrOtRequest" WHERE id = $1`, qb?.id ?? "∅"))[0]?.j;
    const bump = JSON.parse(JSON.stringify(seg ?? [])).map((x: Any) => (x.cls === "HOLIDAY_WORK" ? { ...x, minutes: x.minutes + 1 } : x));
    await P.$executeRawUnsafe(`UPDATE "HrOtRequest" SET "segmentsJson" = $2::jsonb WHERE id = $1`, qb?.id ?? "∅", JSON.stringify(bump));
    const chg = await approve(c, cr.value?.id);
    changed.otMinutes = !chg.ok && codeOf(chg) === "INPUTS_CHANGED";
    await P.$executeRawUnsafe(`UPDATE "HrOtRequest" SET "segmentsJson" = $2::jsonb WHERE id = $1`, qb?.id ?? "∅", JSON.stringify(seg ?? []));
    const ap = await approve(c, cr.value?.id);
    const hw = (emp: string) => itemBy(cr.value?.id, emp).then((i) => (i?.snapshotJson?.lines ?? []).filter((l: Any) => l.code === "HOLIDAY_WORK").reduce((x: number, l: Any) => x + Number(l.amountSatang), 0));
    // order A: run first, request afterwards (200 min inside the 400 already paid)
    const qa = await X.OT.requestOt(c, V.owner, { employeeId: ea, date: "2031-09-17", start: "09:00", end: "12:20" }, { now: bk("2031-09-17", "13:00") }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    await X.OT.decideOtRequest(c, V.owner, qa?.id ?? "∅", "APPROVED", { now: X.N_OCT1 }).catch(() => null);
    await X.OT.settleOtRequests({ tenantId: TT, systemId: s, now: X.N_NOV1 }).catch(() => null); // re-settle B after the run: must not claw back
    const [hwA, hwB, otA, otB1] = [await hw(ea), await hw(eb), sum(await otRows(ea)), sum(await otRows(eb))];
    // hand: run A = 400 × 3,000,000 / (30 × 480) = 83,333.33 → 83,333 · request A = 0 · request B = 200 × 3,000,000 / 14,400 = 41,666.67 → 41,667 · run B = (400 − 200) → 41,667
    ck("S4.19", { approved: ap.ok, runA: hwA === 83333, reqA: otA === 0, reqB: otB0 === 41667 && otB1 === 41667, runB: hwB === 41667 }, "no double pay both orders", `hwA=${hwA} otA=${otA} otB=${otB0}/${otB1} hwB=${hwB} ${short(qa, 40)}`);
    if (ap.ok) await PY("reverseRun", c, cr.value?.id ?? "∅", "qc cleanup", A.owner);
  });
  console.log(`  ℹ S4.27 refusals ${JSON.stringify(changed)}`);
  ck("S4.27", { law: !!changed.law, amount: !!changed.amount, carryIn: !!changed.carryIn, workDay: !!changed.workDay, caps: !!changed.caps, membership: !!changed.membership, otMinutes: !!changed.otMinutes, N: !!changed.N || (changed as Any).NCode === "WORK_ENTRIES", finalOk: !!changed.finalOk }, "INPUTS_CHANGED ×7 (+ N refused)", short(changed, 200));
}

// ═════════════════════════ fix round 2 (controller G1–G9) ═════════════════════════
export const FIX2_CHECKS = `
S4.31|G1|C|R|[db] (fix r2 G1) v1 Jul/Aug → engine 2 → Sept v2 approved ⇒ reversing the v1 Aug run refused LATER_RUN
S4.32|G3|C|R|[db] (fix r2 G3) Sat 420 min worked (no roster): request-first+revoke-after · run-first+request · revoke-before · revoke-then-new · reverse+rebuild ⇒ every employee 420 min / 87,500 exactly once
S4.33|G4|M|R|[db] (fix r2 G4) a second OT request on the same day off is refused (pinned H2.9 rule)
S4.34|G5|C|R|[db] (fix r2 G5) markPaid during the posting window refused (posting) · finalize failure rolls back with no JV · re-approve ⇒ exactly one JV linked · carry once · work days unbound after the failure (G7)
S4.35|G6|C|R|[db] (fix r2 G6) X creates · Y cancels a bound row (rebuild) ⇒ both X and Y refused SAME_PERSON · Z approves
`.trim();

export async function runFixRound2(X: FixEnv): Promise<void> {
  const { P, TT, ck, T, sys, me, adj, att, PY, rows, itemBy, runRow, bk, V, A, U, u1 } = X;
  const SEP = "2031-09";
  const shop = async (n: string, engine = 2) => {
    const s = await sys(n);
    if (engine === 2) await PY("setPayrollEngine", { tenantId: TT, systemId: s }, V.owner, { engineVersion: 2 }, { now: X.N_OCT1 });
    return { s, c: { tenantId: TT, systemId: s } };
  };
  const prof = (s: string, emp: string, base: number) => P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: emp, baseSalarySatang: base, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
  const create = (c: Any, per = SEP, payDate = X.PAY_SEP, now = X.N_OCT1, actor = A.pay1, viewer = V.pay1) => PY("createPayrollRunV2", c, viewer, { periodKey: per, payDate }, { now, actor });
  const approve = (c: Any, id: string | undefined, actor: Any = A.pay3, hooks?: Any) => (hooks ? PY("approveRun", c, id ?? "∅", undefined, actor, hooks) : PY("approveRun", c, id ?? "∅", undefined, actor));
  const codeOf = (r: { value: Any }) => String(r.value?.code ?? "");
  const shown = (r: { ok: boolean; text: string }) => (r.ok ? "ok" : `"${short(r.text, 60)}"`);
  const guard = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      ck(id, { crashed: false }, "no crash", `THROW ${errText(e)}`);
    }
  };

  // ── S4.31 G1 ──
  await guard("S4.31", async () => {
    const { s, c } = await shop("ทีมรุ่นเดิม", 1);
    const e1 = await me(s, "รุ่นเดิม", { unitId: u1 });
    await prof(s, e1, 3000000);
    const v1 = async (per: string, payDate: Date) => {
      const r = await X.pay.createPayrollRun(c, { periodKey: per, payDate }).catch((e: unknown) => ({ err: errText(e) }));
      if (r?.id) await X.pay.approveRun(c, r.id);
      return r?.id as string | undefined;
    };
    const jul = await v1("2031-07", new Date("2031-07-31T03:00:00Z"));
    const aug = await v1("2031-08", new Date("2031-08-31T03:00:00Z"));
    await PY("setPayrollEngine", c, V.owner, { engineVersion: 2 }, { now: X.N_OCT1 });
    const cr = await create(c);
    const ap = await approve(c, cr.value?.id);
    const rv = await PY("reverseRun", c, aug ?? "∅", "qc", A.owner);
    ck("S4.31", { v1: !!jul && !!aug, sept: cr.ok && ap.ok, refused: !rv.ok && codeOf(rv) === "LATER_RUN" && rv.text === T.laterRun, augKept: (await runRow(aug))?.status === "APPROVED" }, "LATER_RUN on the v1 run", `${shown(cr)} ${shown(ap)} ${shown(rv)}`);
  });

  // ── S4.32 / S4.33 G3 G4: Saturday 6 Sep worked 09:00–16:00 (420 min) · monthly 3,000,000 ⇒ 87,500 for the day, once ──
  await guard("S4.32", async () => {
    const { s, c } = await shop("ทีมวันหยุดสัปดาห์");
    const D = "2031-09-06";
    const E: Record<string, string> = {};
    const shK = (await P.hrShift.create({ data: { tenantId: TT, systemId: s, name: `เช้า ${X.tag}`, startMin: 420, endMin: 900, crossesMidnight: false, graceMin: 15 } })).id as string;
    for (const k of ["k1", "k2", "k3", "k4", "k5"]) {
      E[k] = await me(s, k, { unitId: u1 });
      await prof(s, E[k], 3000000);
      // rostered weekdays (as the hunter's fixture) ⇒ Saturday without a roster entry is a day off, not "no schedule"
      for (const wd of ["2031-09-01", "2031-09-02"]) {
        const re = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: s, employeeId: E[k], date: dbDate(wd), shiftId: shK, unitId: u1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-06-01T00:00:00Z"), source: "MANUAL" } })).id as string;
        await att(s, E[k], "IN", bk(wd, "07:00"), re);
        await att(s, E[k], "OUT", bk(wd, "15:00"), re);
      }
      await att(s, E[k], "IN", bk(D, "09:00"), null);
      await att(s, E[k], "OUT", bk(D, "16:00"), null);
    }
    const judge = async (days: string[]) => { for (const d of days) await X.JG.runAttendanceJobs({ now: bk(d), tenantId: TT }); };
    await judge(["2031-09-08", "2031-09-15", "2031-09-22", "2031-09-29", "2031-10-01"]);
    const req = async (k: string, st: string, en: string, now: Date, decideNow: Date) => {
      const q = await X.OT.requestOt(c, V.owner, { employeeId: E[k], date: D, start: st, end: en }, { now }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
      await X.OT.decideOtRequest(c, V.owner, q?.id ?? "∅", "APPROVED", { now: decideNow }).catch(() => null);
      await X.OT.settleOtRequests({ tenantId: TT, systemId: s, now: decideNow }).catch(() => null);
      return q as Any;
    };
    const revoke = (id: string, now: Date) => X.OT.revokeOtRequest(c, V.owner, id, { reason: "qc revoke" }, { now }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const before = bk("2031-09-05"), at8 = bk("2031-09-08"), late = bk(D, "20:00");
    const q1 = await req("k1", "09:00", "13:00", before, at8);
    const q3 = await req("k3", "09:00", "13:00", before, at8);
    const q4 = await req("k4", "09:00", "13:00", before, at8);
    const q5 = await req("k5", "09:00", "13:00", before, at8);
    await revoke(q3?.id ?? "∅", bk("2031-09-09")); // revoke before the run
    // G4: a second request on the same day off is refused
    const dup = await X.OT.requestOt(c, V.owner, { employeeId: E.k1, date: D, start: "14:00", end: "16:00" }, { now: before }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    ck("S4.33", { refused: !dup?.id && [T.dayOffOne, T.otOverlap].includes(String(dup?.reason ?? "")) }, "second request refused", short(dup, 80));
    const cr = await create(c);
    const ap = await approve(c, cr.value?.id);
    const oct1 = X.N_OCT1, oct2 = bk("2031-10-02");
    await req("k2", "09:00", "16:00", late, oct1); // run first, request after
    await revoke(q1?.id ?? "∅", oct2); // revoke after the run
    await revoke(q4?.id ?? "∅", oct2);
    await req("k4", "09:00", "16:00", late, oct2); // revoke then a new request
    await revoke(q5?.id ?? "∅", oct2);
    const tally = async (k: string, run: string | undefined) => {
      const hw = ((await itemBy(run, E[k]))?.snapshotJson?.lines ?? []).filter((l: Any) => l.code === "HOLIDAY_WORK");
      const runAmt = hw.reduce((x: number, l: Any) => x + Number(l.amountSatang), 0);
      const runMin = hw.reduce((x: number, l: Any) => x + Number(l.minutes), 0);
      const ot = await rows(`SELECT kind::text AS k, "amountSatang" AS a FROM "HrPayAdjustment" WHERE "employeeId" = $1 AND "sourceType"::text = 'OT_REQUEST' AND status::text = 'APPROVED'`, E[k]);
      const otAmt = ot.reduce((x: number, r: Any) => x + (r.k === "DEDUCTION" ? -Number(r.a) : Number(r.a)), 0);
      const reqs = await rows(`SELECT "segmentsJson" AS g FROM "HrOtRequest" WHERE "employeeId" = $1 AND status::text IN ('APPROVED','CANCELLED') AND "settledAt" IS NOT NULL`, E[k]);
      const reqMin = reqs.flatMap((r: Any) => r.g ?? []).filter((g: Any) => g.cls === "HOLIDAY_WORK").reduce((x: number, g: Any) => x + Number(g.minutes), 0);
      return { minutes: runMin + reqMin, total: runAmt + otAmt };
    };
    const all = async (run: string | undefined) => Object.fromEntries(await Promise.all(Object.keys(E).map(async (k) => [k, await tally(k, run)])));
    const t1 = await all(cr.value?.id);
    const rv = await PY("reverseRun", c, cr.value?.id ?? "∅", "qc", A.owner);
    const cr2 = await create(c);
    const ap2 = await approve(c, cr2.value?.id);
    const t2 = await all(cr2.value?.id);
    // hand: 420 × 3,000,000 / (30 × 480) = 87,500 per employee; split amounts round to whole satang per line (±1 tolerated per split)
    const good = (t: Any) => Object.values(t).every((x: Any) => x.minutes === 420 && Math.abs(x.total - 87500) <= 1);
    ck("S4.32", { approved: ap.ok, first: good(t1), rebuilt: rv.ok && cr2.ok && ap2.ok && good(t2) }, "420 min / 87,500 once in every order", `${shown(cr)} ${shown(ap)} t1=${short(t1, 150)} t2=${short(t2, 150)}`);
    if (ap2.ok) await PY("reverseRun", c, cr2.value?.id ?? "∅", "qc cleanup", A.owner);
  });

  // ── S4.34 G5 + G7 ──
  await guard("S4.34", async () => {
    const { s, c } = await shop("ทีมลงบัญชีค้าง");
    await PY("setPayrollBook", c, V.owner, { accountSystemId: (await rows(`SELECT id FROM "AppSystem" WHERE "tenantId" = $1 AND type::text = 'ACCOUNT' ORDER BY "createdAt" LIMIT 1`, TT))[0]?.id ?? null }); // ORACLE-EDIT (H3.7 builder): JV asserted ⇒ explicit HR→ACCOUNT link (H3.7 R3)
    const e1 = await me(s, "ค้าง", { unitId: u1 });
    await prof(s, e1, 1500000);
    await adj(s, e1, SEP, "DEDUCTION", 400000);
    const jvCount = async () => Number((await rows(`SELECT count(*)::int AS n FROM "AccountJournalEntry" WHERE "tenantId" = $1`, TT))[0]?.n ?? -1);
    const cr = await create(c);
    const id = cr.value?.id;
    const j0 = await jvCount();
    const f = await approve(c, id, A.pay3, { __failFinal: true });
    const j1 = await jvCount();
    const r1 = await runRow(id);
    const bound = Number((await rows(`SELECT count(*)::int AS n FROM "HrWorkDay" WHERE "runId" = $1`, id ?? "∅"))[0]?.n ?? -1);
    const carry1 = await rows(`SELECT id FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, s);
    let paidInWindow: Any = null;
    const ok = await approve(c, id, A.pay3, { __beforeFinal: async () => { paidInWindow = await PY("markPaid", c, id ?? "∅"); } });
    const j2 = await jvCount();
    const r2 = await runRow(id);
    const carry2 = await rows(`SELECT "amountSatang" AS a FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, s);
    const again = await approve(c, id, A.pay3);
    const j3 = await jvCount();
    ck("S4.34", {
      failed: !f.ok && codeOf(f) === "POST_FAILED", noJv: j1 === j0 && r1?.status === "DRAFT" && !r1?.journalEntryId && carry1.length === 0, unbound: bound === 0,
      window: !!paidInWindow && !paidInWindow.ok && paidInWindow.text === T.posting, once: ok.ok && j2 === j0 + 1 && !!r2?.journalEntryId && carry2.length === 1 && Number(carry2[0]?.a) === 250000,
      noSecond: !again.ok && j3 === j2,
    }, "no orphan JV · posting refusal · once", `${shown(f)} jv ${j0}/${j1}/${j2}/${j3} bound=${bound} window=${paidInWindow ? shown(paidInWindow) : "∅"} ${shown(ok)} carry=${carry2.length}`);
    if (ok.ok) await PY("reverseRun", c, id ?? "∅", "qc cleanup", A.owner);
  });

  // ── S4.35 G6 ──
  await guard("S4.35", async () => {
    const { s, c } = await shop("ทีมผู้สร้างหลายคน");
    const e1 = await me(s, "หลายคน", { unitId: u1 });
    await prof(s, e1, 1500000);
    const al = await adj(s, e1, SEP, "ALLOWANCE", 10000);
    const cr = await create(c); // X = pay1
    const cn = await X.pay.cancelAdjustment(c, al, A.pay3).catch((e: unknown) => ({ ok: false, reason: errText(e) })); // Y = pay3 rebuilds by cancelling
    const ax = await approve(c, cr.value?.id, A.pay1);
    const ay = await approve(c, cr.value?.id, A.pay3);
    const az = await approve(c, cr.value?.id, A.pay2);
    ck("S4.35", { cancelled: !!cn?.ok, x: !ax.ok && codeOf(ax) === "SAME_PERSON", y: !ay.ok && codeOf(ay) === "SAME_PERSON", z: az.ok }, "makers list", `${short(cn, 40)} ${shown(ax)} ${shown(ay)} ${shown(az)}`);
    if (az.ok) await PY("reverseRun", c, cr.value?.id ?? "∅", "qc cleanup", A.owner);
  });
}

// ═════════════════════════ fix round 3 (controller H1–H3) ═════════════════════════
export const FIX3_CHECKS = `
S4.36|H1|C|R|[db] (fix r3 H1) approve with a failing JV post ∥ markPaid 5–300 ms later ×4 ⇒ never PAID without JV · run back to DRAFT · no JV · no carry
S4.37|H2|C|R|[db] (fix r3 H2/H3) shop without an accounting system: approve ∥ approve ×4 ⇒ one finished run (never DRAFT again) · carry once · losers NOT_DRAFT · no post_failed audit
`.trim();

export async function runFixRound3(X: FixEnv & { T2: string; sysIn: (t: string, n: string) => Promise<string>; meIn: (t: string, s: string, n: string, o?: Record<string, unknown>) => Promise<string> }): Promise<void> {
  const { P, TT, ck, T, sys, me, adj, PY, rows, runRow, V, A, u1 } = X;
  const SEP = "2031-09";
  const codeOf = (r: { value: Any }) => String(r.value?.code ?? "");
  const shown = (r: { ok: boolean; text: string }) => (r.ok ? "ok" : `"${short(r.text, 50)}"`);
  const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const guard = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      ck(id, { crashed: false }, "no crash", `THROW ${errText(e)}`);
    }
  };
  // ── S4.36 H1 ──
  await guard("S4.36", async () => {
    const s = await sys("ทีมจ่ายระหว่างลงบัญชี");
    const c = { tenantId: TT, systemId: s };
    await PY("setPayrollEngine", c, V.owner, { engineVersion: 2 }, { now: X.N_OCT1 });
    const e1 = await me(s, "จ่ายเร็ว", { unitId: u1 });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e1, baseSalarySatang: 1500000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    await adj(s, e1, SEP, "DEDUCTION", 400000);
    const cr = await PY("createPayrollRunV2", c, V.pay1, { periodKey: SEP, payDate: X.PAY_SEP }, { now: X.N_OCT1, actor: A.pay1 });
    const id = cr.value?.id as string | undefined;
    const bad: string[] = [];
    for (const delay of [5, 40, 120, 300]) {
      const [ap, mp] = await Promise.all([PY("approveRun", c, id ?? "∅", undefined, A.pay3, { __failJournal: true }), sleepMs(delay).then(() => PY("markPaid", c, id ?? "∅"))]);
      const r = await runRow(id);
      const carry = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, s))[0]?.n ?? -1);
      if (!(r?.status === "DRAFT" && !r?.journalEntryId && carry === 0 && !mp.ok && codeOf(ap) === "POST_FAILED")) bad.push(`d${delay}:${r?.status}/${r?.journalEntryId ? "jv" : "-"}/c${carry}/${shown(mp)}/${codeOf(ap)}`);
    }
    ck("S4.36", { created: cr.ok, never: bad.length === 0 }, "4/4 restored, markPaid refused", bad.join(" ‖ ") || "4/4");
  });
  // ── S4.37 H2/H3 (tenant without an accounting system) ──
  await guard("S4.37", async () => {
    const s = await X.sysIn(X.T2, "ทีมไม่มีบัญชี");
    const c = { tenantId: X.T2, systemId: s };
    await PY("setPayrollEngine", c, V.other, { engineVersion: 2 }, { now: X.N_OCT1 });
    const e1 = await X.meIn(X.T2, s, "ไม่มีบัญชี", {});
    await P.hrSalaryProfile.create({ data: { tenantId: X.T2, systemId: s, employeeId: e1, baseSalarySatang: 1500000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    await P.hrPayAdjustment.create({ data: { tenantId: X.T2, systemId: s, employeeId: e1, periodKey: SEP, kind: "DEDUCTION", amountSatang: 400000, status: "APPROVED", requestedById: A.other.userId, decidedById: A.other.userId, decidedAt: new Date("2031-06-01T00:00:00Z"), note: `qc ${X.tag}` } });
    const cr = await PY("createPayrollRunV2", c, V.other, { periodKey: SEP, payDate: X.PAY_SEP }, { now: X.N_OCT1, actor: A.other });
    const id = cr.value?.id as string | undefined;
    const res = await Promise.all([0, 1, 2, 3].map(() => PY("approveRun", c, id ?? "∅", undefined, A.other)));
    const r = await runRow(id);
    const fin = (await rows(`SELECT ("stepsJson"->>'finalized') AS f FROM "HrPayrollRun" WHERE id = $1`, id ?? "∅"))[0]?.f;
    const carry = Number((await rows(`SELECT count(*)::int AS n FROM "HrPayAdjustment" WHERE "systemId" = $1 AND "sourceType"::text = 'CARRY_FORWARD'`, s))[0]?.n ?? -1);
    const falseFail = await P.auditLog.count({ where: { tenantId: X.T2, action: "hr.payroll.post_failed" } }).catch(() => -1);
    const losers = res.filter((x) => !x.ok);
    ck("S4.37", { one: res.filter((x) => x.ok).length === 1, finished: r?.status === "APPROVED" && fin === "true", carry: carry === 1, losers: losers.length === 3 && losers.every((x) => codeOf(x) === "NOT_DRAFT"), noFalseAudit: falseFail === 0 }, "one finished · carry once · NOT_DRAFT", `${res.map(shown).join(" ")} st=${r?.status} fin=${fin} carry=${carry} audit=${falseFail}`);
  });
}

// ═════════════════════════ merge round (controller: H3.5 interplay) ═════════════════════════
export const MERGE_CHECKS = `
S4.38|H3.5|C|R|[db] (merge round) a v2 run APPROVED but not finalized (posting in progress) is refused by the bank-file service (STATUS text) · after finalizing it is accepted
`.trim();
export async function runMergeRound(X: FixEnv & { BF: Any }): Promise<void> {
  const { P, TT, ck, sys, me, PY, V, A, u1 } = X;
  try {
    const s = await sys("ทีมไฟล์โอน");
    const c = { tenantId: TT, systemId: s };
    await PY("setPayrollEngine", c, V.owner, { engineVersion: 2 }, { now: X.N_OCT1 });
    const e1 = await me(s, "โอน", { unitId: u1 });
    await P.hrSalaryProfile.create({ data: { tenantId: TT, systemId: s, employeeId: e1, baseSalarySatang: 1500000, ssoEligible: true, personalDeductionJson: { spouse: false, children: 0 } } });
    const cr = await PY("createPayrollRunV2", c, V.pay1, { periodKey: "2031-09", payDate: X.PAY_SEP }, { now: X.N_OCT1, actor: A.pay1 });
    const id = cr.value?.id as string | undefined;
    const req = { runId: id ?? "∅", format: "CSV" };
    let mid: Any = null;
    const ap = await PY("approveRun", c, id ?? "∅", undefined, A.pay3, { __beforeFinal: async () => { mid = await X.BF?.previewBankFile(c, V.owner, req).catch((e: unknown) => ({ ok: false, reason: errText(e) })); } });
    const after = await X.BF?.previewBankFile(c, V.owner, req).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
    const STATUS = X.BF?.BANK_TEXT?.status ?? "สร้างไฟล์โอนเงินได้เฉพาะรอบที่อนุมัติแล้วหรือจ่ายแล้ว";
    ck("S4.38", { approved: ap.ok, refusedMid: !!mid && mid.ok === false && String(mid.reason ?? "") === STATUS, acceptedAfter: !!after && String(after.reason ?? "") !== STATUS }, "posting ⇒ STATUS · finalized ⇒ not STATUS", `mid=${short(mid, 80)} after=${short(after, 80)}`);
  } catch (e) {
    ck("S4.38", { crashed: false }, "no crash", `THROW ${errText(e)}`);
  }
}
