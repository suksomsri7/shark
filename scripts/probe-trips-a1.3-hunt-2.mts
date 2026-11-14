// hunt-2 — A1.3a date edges through the REAL port (quoteTripLine as AGENT): first/last day · special over base · 1-day · open-ended ·
//          book-date in unit timezone (Bangkok vs UTC unit, instants where the two calendars disagree) · card validity edges · port null cases
// run: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-a1.3-hunt-2.mts
import { huntSetup, NOW, type Rec } from "./probe-trips-a1.3-hunt-lib.mjs"; // PROBE-EDIT (typecheck): .mts → .mjs (TS5097 · tsx maps .mjs → .mts)

const H = await huntSetup("probe-a1.3-hunt-2");
const { call, check, fmt, R } = H;
const com = (r: Rec) => R(R(r.value).commission);
const pct = (bp: number, extra: Rec = {}) => ({ productKind: "TRIP", mode: "COMMISSION_PCT", valueBp: bp, ...extra });

try {
  const S = await H.mkShop("d2", { u: null, uz: "UTC" });
  const P = await H.mkProd(S, "P", "u");
  const PZ = await H.mkProd(S, "PZ", "uz");
  const tiers = await H.tiersOf(S);
  const X = await H.mkAccount(S, "X");

  // ── travel-date edges (contract card of X) ──
  const rows = [
    pct(1000, { productId: P.id }),
    pct(1500, { productId: P.id, travelFrom: "2027-03-10", travelTo: "2027-03-20" }),
    pct(1700, { productId: P.id, travelFrom: "2027-04-01", travelTo: "2027-04-01" }),
    pct(1900, { productId: P.id, travelFrom: "2027-06-01" }),
    // PROBE-EDIT (มติ Z2): แถว travelTo อย่างเดียวชนคีย์มิติของแถวถาวร ⇒ RATE_OVERLAP · ใช้แถวเปิดต้นแบบ travelFrom 1900-01-01 แทน (ความหมายเดิม: ตั้งแต่ไหนก็ได้ถึง 31 ม.ค.)
    pct(800, { productId: P.id, travelFrom: "1900-01-01", travelTo: "2027-01-31" }), // open start
  ];
  const card = await H.mkCard(S, { kind: "AGENT", agentAccountId: X }, rows);
  const want: [string, number, string][] = [
    ["2026-12-15", 800, "open-start special (travelTo only) beats base"],
    ["2027-01-31", 800, "open-start special last day"],
    ["2027-02-01", 1000, "day after open-start → base"],
    ["2027-03-09", 1000, "day before special → base"],
    ["2027-03-10", 1500, "special first day"],
    ["2027-03-20", 1500, "special last day"],
    ["2027-03-21", 1000, "day after special → base"],
    ["2027-03-31", 1000, "day before 1-day special"],
    ["2027-04-01", 1700, "1-day special"],
    ["2027-04-02", 1000, "day after 1-day special"],
    ["2027-05-31", 1000, "day before open-ended"],
    ["2027-06-01", 1900, "open-ended first day"],
    ["2099-12-31", 1900, "open-ended far future"],
  ];
  for (const [d, bp, what] of want) {
    const dep = await H.mkDep(P, d);
    const r = await H.quote(S, X, P, dep);
    const c = com(r);
    check(`D-travel ${d} ${what}`, r.ok === true && c.rateBp === bp && String(c.refId).endsWith(`@${card.version}`), `rateBp ${bp} refId …@${card.version}`, `${r.ok === true ? `rateBp ${c.rateBp} refId ${c.refId}` : fmt(r)}`);
  }
  // departure whose UTC instant is the previous day (00:30 Bangkok) — travel date must be localDate
  {
    const dep = await H.mkDep(P, "2027-03-10", { startsAt: new Date("2027-03-10T00:30:00+07:00") });
    const r = await H.quote(S, X, P, dep);
    check("D-travel localDate 2027-03-10 starting 00:30 BKK (= 03-09 UTC) → special first day", r.ok === true && com(r).rateBp === 1500, "1500", r.ok === true ? `rateBp ${com(r).rateBp}` : fmt(r));
    const dep2 = await H.mkDep(P, "2027-03-20", { startsAt: new Date("2027-03-20T23:30:00+07:00") });
    const r2 = await H.quote(S, X, P, dep2);
    check("D-travel localDate 2027-03-20 starting 23:30 BKK → special last day", r2.ok === true && com(r2).rateBp === 1500, "1500", r2.ok === true ? `rateBp ${com(r2).rateBp}` : fmt(r2));
  }

  // ── book-date edges in unit timezone ──
  const B = await H.mkAccount(S, "B");
  const cardB = await H.mkCard(S, { kind: "AGENT", agentAccountId: B }, [
    pct(1000, { productId: P.id }), pct(2500, { productId: P.id, bookFrom: "2026-11-13", bookTo: "2026-11-13" }),
    pct(1000, { productId: PZ.id }), pct(2500, { productId: PZ.id, bookFrom: "2026-11-13", bookTo: "2026-11-13" }),
  ]);
  const depP = await H.mkDep(P, "2027-03-01");
  const depZ = await H.mkDep(PZ, "2027-03-01");
  const bookCases: [string, string, "P" | "PZ", number][] = [
    ["BKK 23:59:59 on 12th", "2026-11-12T16:59:59.999Z", "P", 1000],
    ["BKK 00:00 on 13th", "2026-11-12T17:00:00.000Z", "P", 2500],
    ["BKK 23:59 on 13th", "2026-11-13T16:59:00.000Z", "P", 2500],
    ["BKK 00:00 on 14th", "2026-11-13T17:00:00.000Z", "P", 1000],
    ["UTC 17:00 on 12th (BKK already 13th)", "2026-11-12T17:00:00.000Z", "PZ", 1000],
    ["UTC 00:00 on 13th", "2026-11-13T00:00:00.000Z", "PZ", 2500],
    ["UTC 23:59 on 13th (BKK already 14th)", "2026-11-13T23:59:00.000Z", "PZ", 2500],
    ["UTC 00:00 on 14th", "2026-11-14T00:00:00.000Z", "PZ", 1000],
  ];
  for (const [what, iso, which, bp] of bookCases) {
    const p = which === "P" ? P : PZ;
    const r = await H.quote(S, B, p, which === "P" ? depP : depZ, { now: new Date(iso) });
    check(`D-book ${which} ${what}`, r.ok === true && com(r).rateBp === bp, `rateBp ${bp}`, r.ok === true ? `rateBp ${com(r).rateBp} ref ${com(r).refId}` : fmt(r));
  }
  void cardB;

  // ── card validity edges (two cards of C, adjacent) ──
  const C = await H.mkAccount(S, "C");
  await H.mkCard(S, { kind: "AGENT", agentAccountId: C }, [pct(3000, { productId: P.id }), pct(3000, { productId: PZ.id })], { validTo: "2026-11-12" });
  await H.mkCard(S, { kind: "AGENT", agentAccountId: C }, [pct(3100, { productId: P.id }), pct(3100, { productId: PZ.id })], { validFrom: "2026-11-13" });
  for (const [what, iso, which, bp] of [
    ["BKK unit at 16:59Z 12th (BKK 23:59 12th) → old card", "2026-11-12T16:59:00Z", "P", 3000],
    ["BKK unit at 17:00Z 12th (BKK 13th) → new card", "2026-11-12T17:00:00Z", "P", 3100],
    ["UTC unit at 17:00Z 12th → old card", "2026-11-12T17:00:00Z", "PZ", 3000],
    ["UTC unit at 00:00Z 13th → new card", "2026-11-13T00:00:00Z", "PZ", 3100],
  ] as const) {
    const r = await H.quote(S, C, which === "P" ? P : PZ, which === "P" ? depP : depZ, { now: new Date(iso) });
    check(`D-card ${what}`, r.ok === true && com(r).rateBp === bp, `rateBp ${bp}`, r.ok === true ? `rateBp ${com(r).rateBp}` : fmt(r));
  }

  // ── overlap guard at the service: adjacent ok · touching rejected · book-overlap-but-travel-disjoint ok ──
  {
    const D = await H.mkAccount(S, "D");
    const c = await H.mkCard(S, { kind: "AGENT", agentAccountId: D }, [pct(100, { productId: P.id, travelFrom: "2027-01-01", travelTo: "2027-01-10" })], { activate: false });
    let v = c.version;
    const up = async (rate: Rec) => { const r = await call("upsertAgentRate", S.ctx(), { cardId: c.id, expectedVersion: v, rate }, { now: NOW }); if (r.ok === true) v = Number(R(r.card).version); return r; };
    const r1 = await up(pct(110, { productId: P.id, travelFrom: "2027-01-11", travelTo: "2027-01-20" }));
    check("D-guard adjacent (to=D, from=D+1) accepted", r1.ok === true, "ok", fmt(r1));
    const r2 = await up(pct(120, { productId: P.id, travelFrom: "2027-01-20", travelTo: "2027-01-25" }));
    check("D-guard touching (to=D, from=D) → RATE_OVERLAP", r2.ok === false && r2.reason === "RATE_OVERLAP", "VALIDATION RATE_OVERLAP", fmt(r2));
    const r3 = await up(pct(130, { productId: P.id, travelFrom: "2027-01-05", travelTo: "2027-01-06", bookFrom: "2027-01-01", bookTo: "2027-01-02" }));
    check("D-guard travel overlaps but book window bounded (book open on the other row) → still overlap (both dims overlap)", r3.ok === false && r3.reason === "RATE_OVERLAP", "RATE_OVERLAP", fmt(r3));
    const r4 = await up(pct(140, { productId: P.id, travelFrom: "2027-01-05", travelTo: "2027-01-06", priority: 1 }));
    check("D-guard same window different priority → accepted", r4.ok === true, "ok", fmt(r4));
    const r5 = await up(pct(150, { productId: P.id, travelFrom: "2027-01-05", travelTo: "2027-01-06", optionId: P.opt }));
    check("D-guard same window but optionId-specific (different dims) → accepted", r5.ok === true, "ok", fmt(r5));
    // NND-key trap: a base row (no dates) and a special row whose only bound is a TO-date share the key (bookFrom=null, travelFrom=null)
    const base = await up(pct(1000, { productId: P.id, optionId: P.opt2 }));
    const baseId = String(R(base.rate).id);
    const sp = await up(pct(2000, { productId: P.id, optionId: P.opt2, travelTo: "2027-02-28" }));
    const after = await H.q<{ n: number }>(`SELECT count(*)::int n FROM "AgentRate" WHERE "rateCardId" = $1 AND "optionId" = $2`, [c.id, P.opt2]);
    const baseStill = await H.q<{ bp: number; t: string | null }>(`SELECT "valueBp" bp, to_char("travelTo",'YYYY-MM-DD') t FROM "AgentRate" WHERE id = $1`, [baseId]);
    // PROBE-EDIT (มติ Z2): คีย์มิติชนแต่ช่องต่าง ⇒ ปฏิเสธชัด ๆ RATE_OVERLAP · แถวถาวรไม่ถูกเขียนทับ
    check("D-guard adding 'until 2027-02-28' special next to a permanent base row → explicit RATE_OVERLAP · base row untouched (never silently converted)",
      sp.ok === false && sp.reason === "RATE_OVERLAP" && after[0].n === 1 && baseStill[0]?.bp === 1000 && baseStill[0]?.t === null, "RATE_OVERLAP · 1 row · base 1000 travelTo null", `rows ${after[0].n} · base row now ${fmt(baseStill[0])} · upsert result ${fmt({ ok: sp.ok, reason: sp.reason, id: R(sp.rate).id, sameIdAsBase: R(sp.rate).id === baseId })}`);
    for (const [d, ok] of [["2027-02-29", false], ["2028-02-29", true], ["2027-3-01", false], ["2027-03-01T00:00", false], ["0000-01-01", false]] as const) { // PROBE-EDIT (มติ Z8): ปี 0000 นอก 1900–2200 ⇒ BAD_INPUT
      const r = await up(pct(5, { productId: P.id, travelFrom: d, travelTo: d, priority: 7 }));
      check(`D-date '${d}' ${ok ? "accepted" : "rejected BAD_INPUT"}`, ok ? r.ok === true : r.ok === false && r.reason === "BAD_INPUT", ok ? "ok" : "BAD_INPUT", fmt(r));
    }
  }

  // ── precedence: rate priority beats special · card priority · option-specific ──
  {
    const E = await H.mkAccount(S, "E");
    await H.mkCard(S, { kind: "AGENT", agentAccountId: E }, [pct(4000, { productId: P.id, priority: 1 }), pct(4100, { productId: P.id, travelFrom: "2027-01-01" }), pct(4200, { productId: P.id, optionId: P.opt, travelFrom: "2027-01-01" })]);
    const dep = await H.mkDep(P, "2027-03-03");
    const r = await H.quote(S, E, P, dep);
    check("D-order priority 1 base beats priority 0 special", r.ok === true && com(r).rateBp === 4000, "4000", r.ok === true ? String(com(r).rateBp) : fmt(r));
    const F2 = await H.mkAccount(S, "F");
    await H.mkCard(S, { kind: "AGENT", agentAccountId: F2 }, [pct(4100, { productId: P.id, travelFrom: "2027-01-01" }), pct(4200, { productId: P.id, optionId: P.opt, travelFrom: "2026-01-01" })]);
    const r2 = await H.quote(S, F2, P, dep);
    check("D-order equal priority, both special: option-specific beats null option", r2.ok === true && com(r2).rateBp === 4200, "4200", r2.ok === true ? String(com(r2).rateBp) : fmt(r2));
    const dep2 = await H.mkDep(P, "2027-03-03", { opt: "opt2" });
    const r3 = await H.quote(S, F2, P, dep2);
    check("D-order departure of other option ignores option-specific row", r3.ok === true && com(r3).rateBp === 4100, "4100", r3.ok === true ? String(com(r3).rateBp) : fmt(r3));
  }

  // ── tier special shadowed by contract (R3) + tier default ──
  {
    const T = await H.mkAccount(S, "T", { tierId: tiers.B });
    await H.mkCard(S, { kind: "TIER", tierCode: "B" }, [pct(6000, { productId: P.id, travelFrom: "2027-01-01", travelTo: "2027-12-31" })]);
    const dep = await H.mkDep(P, "2027-05-05");
    const r0 = await H.quote(S, T, P, dep);
    check("D-tier special of tier B applies to tier-B agency without contract", r0.ok === true && com(r0).rateBp === 6000 && com(r0).rateSource === "TIER", "6000 TIER", r0.ok === true ? `${com(r0).rateBp} ${com(r0).rateSource}` : fmt(r0));
    await H.mkCard(S, { kind: "AGENT", agentAccountId: T }, [pct(1234, { productId: P.id })]);
    const r1 = await H.quote(S, T, P, dep);
    check("D-tier contract replaces tier special entirely (R3)", r1.ok === true && com(r1).rateBp === 1234 && com(r1).rateSource === "CONTRACT", "1234 CONTRACT", r1.ok === true ? `${com(r1).rateBp} ${com(r1).rateSource}` : fmt(r1));
    const dep2 = await H.mkDep(P, "2028-01-01");
    const T2 = await H.mkAccount(S, "T2", { tierId: tiers.B });
    const r2 = await H.quote(S, T2, P, dep2);
    check("D-tier outside tier special → tier default A1 B 15%", r2.ok === true && com(r2).rateBp === 1500 && String(com(r2).refId).startsWith("tier:"), "1500 tier:…:A1", r2.ok === true ? `${com(r2).rateBp} ${com(r2).refId}` : fmt(r2));
  }

  // ── port null cases (all same answer) ──
  {
    const dep = await H.mkDep(P, "2027-03-03");
    const outs: Record<string, Rec> = {};
    // PROBE-EDIT (typecheck): ทูเพิล readonly ส่งเข้า mkAccount ไม่ได้ (TS2345) — ประกาศชนิดแบบแก้ได้
    const nullCases: [string, { status?: string; unitIds?: string[] }][] = [["SUSPENDED", { status: "SUSPENDED" }], ["PENDING", { status: "PENDING" }], ["CLOSED", { status: "CLOSED" }], ["OTHER_UNIT", { unitIds: [S.units.uz] }]];
    for (const [k, o] of nullCases) {
      const id = await H.mkAccount(S, k.slice(0, 4), o);
      await H.mkCard(S, { kind: "AGENT", agentAccountId: id }, [pct(999, { productId: P.id })]).catch(() => null);
      outs[k] = await H.quote(S, id, P, dep);
    }
    const S2 = await H.mkShop("d2b", { u: null });
    const Xb = await H.mkAccount(S2, "XB");
    outs.OTHER_SHOP = await H.quote(S, Xb, P, dep);
    outs.UNKNOWN = await H.quote(S, "a13h_nope_1234", P, dep);
    const ref = JSON.stringify(outs.UNKNOWN);
    for (const [k, r] of Object.entries(outs)) check(`D-null port ${k} → FORBIDDEN AGENCY_NOT_ENABLED, identical to unknown id`, r.ok === false && r.code === "FORBIDDEN" && JSON.stringify(r) === ref, ref.slice(0, 160), fmt(r));
    // product of another unit of the same shop with the ctx unit = u
    const depZ2 = await H.mkDep(PZ, "2027-03-03");
    const rz = await H.callTr("quoteTripLine", H.agentCtx(S, X, S.units.u), { ...H.line(PZ, depZ2), unitId: S.units.u });
    check("D-null product of other unit under unit ctx → not priced (NOT_FOUND/FORBIDDEN)", rz.ok === false, "ok:false", fmt(rz));
  }
} catch (e) {
  console.log(`PROBE ERROR ${String(e instanceof Error ? e.stack : e).slice(0, 800)}`);
} finally {
  H.summary("hunt-2");
  await H.cleanup();
}
