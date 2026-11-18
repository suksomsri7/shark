// probe 2 — stale basis: DRAFT computed, then opening revised/cleared/zeroed, approve without recompute · marker freeze · race save ∥ approve under hr:ytd
import { setup, short, T, underLock } from "./common.mjs";
const X = await setup("hunt-h34y-p2");
const { sys, emp, save, create, approve, item, liveOf, PAY, OPM, c, V, safe, rows, P } = X;
const log = (k: string, v: unknown) => console.log(`${k}: ${short(v, 300)}`);
const pv = (s: string, id: string, e: string) => safe(() => PAY.previewPayrollRunV2(c(s), V.owner, { runId: id })).then((x: any) => (x?.review ?? []).filter((r: any) => r.employeeId === e).map((r: any) => r.code));
const now9 = T("2031-09-10T05:00:00Z");
try {
  // a) DRAFT with rev1 → clear → approve
  const A = await sys("A"); const eA = await emp(A, "A01");
  await save(A, V.owner, eA, {}, now9);
  const dA = await create(A, "2031-09");
  log("a.wht", (await item(dA?.id, eA))?.whtSatang);
  log("a.clear", await safe(() => OPM.clearOpeningYtd(c(A), V.owner, { employeeId: eA, taxYear: 2031, expectRev: 1 }, { now: now9 })));
  log("a.approve after clear", await approve(A, dA?.id));
  // b) DRAFT with rev1 → edit non-money fields only (months 8→5, asOf 08-31→08-15) → approve (digest equal?) → marker
  const B = await sys("B"); const eB = await emp(B, "B01");
  await save(B, V.owner, eB, {}, now9);
  const dB = await create(B, "2031-09");
  log("b.edit months/asOf", await save(B, V.owner, eB, { months: 5, asOfDay: "2031-08-15" }, now9, 1));
  const apB = await approve(B, dB?.id);
  const itB = await item(dB?.id, eB);
  const liveB = (await liveOf(eB))[0];
  log("b.approve", { ok: apB?.ok, code: apB?.code, marker: itB?.snapshotJson?.ytdOpening, liveRev: liveB?.rev, markerIsLive: itB?.snapshotJson?.ytdOpening?.id === liveB?.id });
  // c) DRAFT MISSING → zero opening (digest equal) → approve → preview after approve still warns?
  const C = await sys("C"); const eC = await emp(C, "C01");
  const dC = await create(C, "2031-09");
  log("c.marker", (await item(dC?.id, eC))?.snapshotJson?.ytdOpening);
  log("c.review before", await pv(C, dC?.id, eC));
  log("c.zero", await save(C, V.owner, eC, { asOfDay: "2031-01-01", months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, now9));
  log("c.review draft after zero", await pv(C, dC?.id, eC));
  log("c.approve", (await approve(C, dC?.id))?.ok);
  log("c.review after approve", await pv(C, dC?.id, eC));
  log("c.marker after approve", (await item(dC?.id, eC))?.snapshotJson?.ytdOpening);
  // d) race: approve ∥ save (rev1→rev2 with new WHT) both blocked on hr:ytd
  for (const order of ["approveFirst", "saveFirst"]) {
    const D = await sys(`D${order}`); const eD = await emp(D, "D01");
    await save(D, V.owner, eD, {}, now9);
    const dD = await create(D, "2031-09");
    const calls = [() => approve(D, dD?.id), () => save(D, V.owner, eD, { whtSatang: 0 }, now9, 1)];
    const o = await underLock<any>(P, `hr:ytd:${D}:2031`, 0, 2, order === "approveFirst" ? calls : [calls[1]!, calls[0]!]);
    const [ap, sv] = order === "approveFirst" ? o.res : [o.res[1], o.res[0]];
    const it = await item(dD?.id, eD);
    const run = (await rows(`SELECT status::text AS s, "approvedAt" AS a FROM "HrPayrollRun" WHERE id = $1`, dD?.id))[0];
    const all = await X.openRows(eD);
    const used = all.find((r: any) => r.id === it?.snapshotJson?.ytdOpening?.id);
    const stale = ap?.ok === true && used?.s && run?.a && new Date(used.s).getTime() < new Date(run.a).getTime();
    log(`d.${order}`, { blocked: o.blocked, ap: ap?.ok ?? ap?.code, apCode: ap?.code, sv: sv?.ok ?? sv?.code, wht: it?.whtSatang, markerRev: it?.snapshotJson?.ytdOpening?.rev, usedSupersededBeforeApprove: !!stale });
  }
} catch (e) {
  console.log("ERR", e);
} finally {
  await X.cleanup();
}
