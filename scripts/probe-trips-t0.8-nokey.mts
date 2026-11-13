// probe-trips-t0.8-nokey.mts — นักล่า T0.8: ไม่มี SESSION_SECRET / ไม่มีกุญแจกล่อง (ลบออกจาก env ของโปรเซสนี้เท่านั้น · untracked · hunter)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.8-nokey.mts
import * as L from "./probe-trips-t0.8-lib.mjs";
const { W, call, code, val, staff, pctx, check, finding, opn, asRec, fmt, hex, NOW0, JPG, DEPS, consent } = L;

L.boot("probe-t0.8-nokey");
L.installFakeStorage();
try {
  await L.sweepStale();
  await L.cleanupMisc();
  await L.setupWorld();
  const b = await L.mkBooking("PD", ["NK one", "NK two"]);
  const t = (await L.issue(b.pax[0])).token;
  val(await call("submitPassengerForm", pctx(), { token: t, idempotencyKey: `k${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: "NOKEY12345" }), health: { consent, allergies: "nokeyalg" } }), "submit");
  const d = String(val(await call("uploadPassengerDocument", pctx(), { token: t, idempotencyKey: `k${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS), "up").documentId);
  const fileId = String((await L.docRow(d))?.fileId);
  const lv = await L.lastIssued(b.pax[0]);
  const url = L.linkUrl(fileId, lv);
  const pos = await L.routeHit(url);
  check("PC-route", pos.status === 200, `with key: route ${pos.status}`);

  // ── ไม่มี SESSION_SECRET ──
  const saved = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  const r: Record<string, L.Rec> = {
    open: await call("openPassengerForm", pctx(), { token: t }),
    submit: await call("submitPassengerForm", pctx(), { token: t, idempotencyKey: `k${hex(6)}`, expectedRev: 1, fields: { finSize: "M" } }),
    issue: await call("issuePassengerFormLink", staff(), { passengerId: b.pax[1] }),
    issueAll: await call("issueBookingFormLinks", staff(), { bookingId: b.bookingId }),
    custUrl: await call("customerDocumentUrl", pctx(), { token: t, documentId: d, purpose: "CUSTOMER_SELF" }),
    staffUrl: await call("passengerDocumentUrl", staff(), { documentId: d, purpose: "CHECKIN" }),
  };
  opn("NK.session", 6);
  let rt: { status: number; h: Record<string, string | null> } = { status: -1, h: {} };
  try { rt = await L.routeHit(url); } catch (e) { rt = { status: -2, h: { err: L.errMsg(e) } }; }
  process.env.SESSION_SECRET = saved;
  const named = (x: L.Rec) => code(x) === "BUSY/SERVER_KEY_MISSING";
  check("NK1-issue", named(r.issue) && named(r.issueAll) && named(r.staffUrl), `issue=${code(r.issue)} issueAll=${code(r.issueAll)} staffUrl=${code(r.staffUrl)}`);
  check("NK1-public", named(r.open) && named(r.submit) && named(r.custUrl), `open=${code(r.open)} submit=${code(r.submit)} customerDocumentUrl=${code(r.custUrl)}`);
  if (!named(r.open)) finding({ id: "NK-PUBLIC", sev: "MINOR", status: "REPRODUCED", title: "public services without SESSION_SECRET answer NOT_FOUND (and count a token guess) instead of a named BUSY SERVER_KEY_MISSING",
    observed: `open=${code(r.open)} submit=${code(r.submit)} customerDocumentUrl=${code(r.custUrl)}`, expected: "fail-closed is satisfied (no data), but brief §5 names SERVER_KEY_MISSING; the misconfiguration looks like 'link invalid' to customers and burns their rate bucket" });
  check("NK1-route", rt.status === 403 || rt.status === 500, `route without key → ${rt.status} ${fmt(rt.h)}`);
  check("NK1-noleak", !JSON.stringify(r).includes("nokeyalg") && !JSON.stringify(r).includes("NOKEY12345"), "no data in results");

  // ── ไม่มีกุญแจกล่อง ──
  const ik = process.env.INTEGRATIONS_CREDENTIALS_KEY;
  delete process.env.INTEGRATIONS_CREDENTIALS_KEY;
  const t2 = (await L.issue(b.pax[1])).token;
  const k: Record<string, L.Rec> = {
    health: await call("submitPassengerForm", pctx(), { token: t2, idempotencyKey: `k${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, allergies: "x" } }),
    doc: await call("submitPassengerForm", pctx(), { token: t2, idempotencyKey: `k${hex(6)}`, expectedRev: 0, fields: { docNumber: "ABCDE12345" } }),
    reveal: await call("revealPassengerData", staff(), { passengerId: b.pax[0], what: "HEALTH", purpose: "SAFETY" }),
    revealDoc: await call("revealPassengerData", staff(), { passengerId: b.pax[0], what: "DOC_NUMBER", purpose: "SAFETY" }),
    exp: await call("exportPassengerData", staff(), { passengerId: b.pax[0], purpose: "PDPA_REQUEST" }),
    cutoffEdit: await call("submitPassengerForm", pctx(), { token: t, idempotencyKey: `k${hex(6)}`, expectedRev: 1, fields: { finSize: "S" } }),
    list: await call("getTripPassengers", staff(), { bookingId: b.bookingId }),
  };
  opn("NK.box", 7);
  process.env.INTEGRATIONS_CREDENTIALS_KEY = ik;
  const p2 = await L.pax(b.pax[1]);
  check("NK2", code(k.health) === "BUSY/SECRET_KEY_MISSING" && code(k.doc) === "BUSY/SECRET_KEY_MISSING" && code(k.reveal) === "BUSY/SECRET_KEY_MISSING" && code(k.revealDoc) === "BUSY/SECRET_KEY_MISSING" && L.revOf(p2) === 0,
    `health=${code(k.health)} doc=${code(k.doc)} reveal=${code(k.reveal)} revealDoc=${code(k.revealDoc)} export=${code(k.exp)} plainEdit=${code(k.cutoffEdit)} list=${code(k.list)} p2.rev=${L.revOf(p2)}`);
  const ra = (await L.q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.revealed' AND "targetId" = $1`, [b.pax[0]]))[0]?.n;
  check("NK2-audit", true, `revealed audit rows written while key missing: ${ra}`);
  void NOW0; void asRec; void W;
} catch (e) {
  console.log("💥", L.errMsg(e));
  finding({ id: "HARNESS-NK", sev: "NOTE", status: "SUSPICION", title: "probe aborted", observed: L.errMsg(e), expected: "" });
} finally {
  L.summary("probe-t0.8-nokey");
  try { await L.cleanupTenants(W.tenantIds); await L.cleanupMisc(); } catch (e) { console.log("cleanup", L.errMsg(e)); }
  await L.endPool();
  process.exit(0);
}
