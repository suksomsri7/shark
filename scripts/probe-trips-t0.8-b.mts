// probe-trips-t0.8-b.mts — นักล่า T0.8 กลุ่ม E (ยิงพร้อมกัน) F (ขอบอายุเก็บ) G (ลบผู้จอง) (untracked · hunter)
// งานลบเรียกด้วย tenantIds ของ probe เท่านั้น · purgeTripPersonalDataForUnit ด้วยหน่วยของ probe เท่านั้น
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.8-b.mts
import * as L from "./probe-trips-t0.8-lib.mjs";
const { W, call, code, val, staff, pctx, check, finding, opn, q, asRec, asArr, fmt, hex, rid, NOW0, JPG, PDF, DEPS, STORE, consent, storageCtl } = L;

L.boot("probe-t0.8-b");
L.installFakeStorage();

const myPurge = (now: Date, o: L.Rec = {}) => call("runPdpaPurge", now, { tenantIds: [...W.tenantIds], storage: { del: L.fakeDel }, ...o });
const unitPurge = (unitId: string, now: Date, o: L.Rec = {}) => call("purgeTripPersonalDataForUnit", { tenantId: W.tA, unitId, now, storage: { del: L.fakeDel }, ...o });
const firstInstantOf = (ymd: string, tz: string): Date => {
  // brute: นาทีแรก (แล้วไล่มิลลิวินาที) ที่วันที่ท้องถิ่น = ymd
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  let t = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) - 16 * 3_600_000;
  while (f.format(new Date(t)) < ymd) t += 60_000;
  let lo = t - 60_000, hi = t; // f(lo) < ymd ≤ f(hi)
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (f.format(new Date(m)) < ymd) lo = m; else hi = m; }
  return new Date(hi);
};
const addDays = (ymd: string, n: number) => new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + n)).toISOString().slice(0, 10);
const localYmd = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function invariants(tag: string, tids: string[]) {
  // I1: กล่องสุขภาพมี ⇒ มีบันทึกความยินยอม · I2: MEDICAL ที่ยังไม่ลบ ⇒ สุขภาพ PROVIDED · I3: เอกสารที่ไม่ deleted ⇒ FileAsset ยังอยู่ · I4: ลบทั้งคน ⇒ ไม่มี FileAsset · I5: ผู้เยาว์+สุขภาพ ⇒ guardianConsent
  const i1 = await q(`SELECT id FROM "TripPassenger" WHERE "tenantId" = ANY($1::text[]) AND answers->'health'->>'status' = 'PROVIDED' AND (answers->'health'->'consent'->>'textHash') IS NULL`, [tids]);
  const i2 = await q<{ id: string; st: string | null }>(`SELECT d.id, p.answers->'health'->>'status' AS st FROM "TripDocument" d JOIN "TripPassenger" p ON p.id = d."passengerId" WHERE d."tenantId" = ANY($1::text[]) AND d.kind = 'MEDICAL' AND d."deletedAt" IS NULL AND COALESCE(p.answers->'health'->>'status', '') <> 'PROVIDED'`, [tids]);
  const i3 = await q<{ id: string; kind: string }>(`SELECT d.id, d.kind FROM "TripDocument" d WHERE d."tenantId" = ANY($1::text[]) AND d."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "FileAsset" f WHERE f.id = d."fileId")`, [tids]);
  const i4 = await q(`SELECT d.id FROM "TripDocument" d JOIN "TripPassenger" p ON p.id = d."passengerId" WHERE d."tenantId" = ANY($1::text[]) AND p.answers->'purged'->'stages' ? 'ALL' AND EXISTS (SELECT 1 FROM "FileAsset" f WHERE f.id = d."fileId") AND d."retainUntil" > now() + interval '1 day'`, [tids]);
  const i5 = await q(`SELECT id FROM "TripPassenger" WHERE "tenantId" = ANY($1::text[]) AND "isMinor" = true AND answers->'health'->>'status' = 'PROVIDED' AND "guardianConsent" IS NULL`, [tids]);
  check(`INV-${tag}`, !i1.length && !i2.length && !i3.length && !i4.length, `I1 box-no-consent=${i1.length} I2 medical-without-PROVIDED=${i2.length} ${fmt(i2.slice(0, 3))} I3 doc→missing asset=${i3.length} ${fmt(i3.slice(0, 3))} I4 erased-with-file=${i4.length} I5 minor-health-no-guardian=${i5.length}`);
  return { i1, i2, i3, i4, i5 };
}

try {
  await L.sweepStale();
  await L.cleanupMisc();
  await L.setupWorld();
  const { tA, uA, uA2, uL } = W;
  console.log("setup ok", tA);

  // ═══════════ E. ยิงพร้อมกัน ═══════════
  console.log("\n── E: concurrency ──");
  {
    // E1: 10 คำขอเหมือนกัน
    const b = await L.mkBooking("PD", ["E1 one"]); const t = (await L.issue(b.pax[0])).token;
    const body = { token: t, idempotencyKey: `same${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, allergies: "e1" } };
    const rs = await Promise.all(Array.from({ length: 10 }, () => call("submitPassengerForm", pctx(), body))); opn("E1", 10);
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.updated' AND "targetId" = $1`, [b.pax[0]]))[0]?.n;
    const cg = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.consent_given' AND "targetId" = $1`, [b.pax[0]]))[0]?.n;
    const ev = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE type = 'trips.passenger.form_completed' AND payload->>'passengerId' = $1`, [b.pax[0]]))[0]?.n;
    check("E1", rs.every((r) => r.ok === true) && rs.filter((r) => asRec(r.value).replayed !== true).length === 1 && n === 1 && cg === 1 && ev === 1 && L.revOf(await L.pax(b.pax[0])) === 1, `codes ${rs.map(code).join(",")} audit updated=${n} consent=${cg} event=${ev}`);

    // E2: ลูกค้า ∥ ร้าน (rev เดียวกัน)
    const bad: string[] = [];
    for (let i = 0; i < 6; i++) {
      const b2 = await L.mkBooking("PD", [`E2 ${i}`]); const t2 = (await L.issue(b2.pax[0])).token;
      const [c, s] = await Promise.all([
        call("submitPassengerForm", pctx(), { token: t2, idempotencyKey: `c${hex(6)}`, expectedRev: 0, fields: { finSize: "CUST", phone: "0812345678" } }),
        call("updateTripPassenger", staff("se"), { passengerId: b2.pax[0], expectedRev: 0, idempotencyKey: `s${hex(6)}`, fields: { finSize: "STAFF", phone: null } }),
      ]); opn("E2", 2);
      const row = await L.pax(b2.pax[0]);
      const fs = String(asRec(asRec(row.answers).fields).finSize);
      const winners = [c, s].filter((x) => x.ok === true).length;
      const loserOk = [c, s].filter((x) => x.ok !== true).every((x) => String(x.code) === "STATE_CONFLICT");
      const consistent = (c.ok === true && fs === "CUST" && row.phone !== null) || (s.ok === true && fs === "STAFF" && row.phone === null);
      if (!(winners === 1 && loserOk && consistent && L.revOf(row) === 1)) bad.push(`${i}: c=${code(c)} s=${code(s)} fin=${fs} phone=${String(row.phone)} rev=${L.revOf(row)}`);
    }
    check("E2", bad.length === 0, bad.join(" · ") || "6 trials: one winner, loser STATE_CONFLICT, no mixed rows");

    // E3: ปฏิเสธสุขภาพ (ลูกค้า) ∥ อัปโหลด MEDICAL
    let e3bad = 0; const e3s: string[] = [];
    for (let i = 0; i < 12; i++) {
      const b3 = await L.mkBooking("PD", [`E3 ${i}`]); const t3 = (await L.issue(b3.pax[0])).token;
      val(await call("submitPassengerForm", pctx(), { token: t3, idempotencyKey: `h${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, conditions: "c" } }), "h");
      const [dcl, upl] = await Promise.all([
        (async () => { await L.sleep(i % 4 * 15); return call("submitPassengerForm", pctx(), { token: t3, idempotencyKey: `d${hex(6)}`, expectedRev: 1, health: { declined: true } }, { del: L.fakeDel }); })(),
        call("uploadPassengerDocument", pctx(), { token: t3, idempotencyKey: `m${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS),
      ]); opn("E3", 2);
      const row = await L.pax(b3.pax[0]);
      const live = await q(`SELECT id FROM "TripDocument" WHERE "passengerId" = $1 AND kind = 'MEDICAL' AND "deletedAt" IS NULL`, [b3.pax[0]]);
      const hs = String(asRec(asRec(row.answers).health).status);
      if (hs !== "PROVIDED" && live.length) { e3bad++; e3s.push(`${i}: decline=${code(dcl)} upload=${code(upl)} health=${hs} liveMEDICAL=${live.length}`); }
    }
    check("E3", e3bad === 0, `decline ∥ MEDICAL upload: ${e3bad}/12 end with health≠PROVIDED and a live MEDICAL file ${e3s.slice(0, 4).join(" · ")}`);
    if (e3bad) finding({ id: "E-DECLINE-UPLOAD", sev: "MAJOR", status: "REPRODUCED", title: "declining health (submit {health:{declined:true}}) races a MEDICAL upload: the medical file survives with health DECLINED",
      observed: `${e3bad}/12 trials: ${e3s.slice(0, 3).join(" · ")}`, expected: "same guarantee as withdrawHealthConsent (doc advisory lock + RETRY): no live MEDICAL document unless health is PROVIDED (§14.1)" });

    // E4: ปฏิเสธสุขภาพ ∥ ร้านแก้ช่อง (ไฟล์ถูกลบนอก tx ก่อน CAS แพ้)
    let e4bad = 0; const e4s: string[] = [];
    for (let i = 0; i < 4; i++) {
      const b4 = await L.mkBooking("PD", [`E4 ${i}`]); const t4 = (await L.issue(b4.pax[0])).token;
      val(await call("submitPassengerForm", pctx(), { token: t4, idempotencyKey: `h${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, conditions: "c" } }), "h");
      const md = val(await call("uploadPassengerDocument", pctx(), { token: t4, idempotencyKey: `m${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "med");
      storageCtl.delDelayMs = 400;
      const [dcl, ed] = await Promise.all([
        call("submitPassengerForm", pctx(), { token: t4, idempotencyKey: `d${hex(6)}`, expectedRev: 1, health: { declined: true } }, { del: L.fakeDel }),
        (async () => { await L.sleep(100); return call("updateTripPassenger", staff("se"), { passengerId: b4.pax[0], expectedRev: 1, idempotencyKey: `s${hex(6)}`, fields: { finSize: "Z" } }); })(),
      ]); opn("E4", 2);
      storageCtl.delDelayMs = 0;
      const row = await L.pax(b4.pax[0]); const d = await L.docRow(String(md.documentId));
      const asset = (await q(`SELECT 1 FROM "FileAsset" WHERE id = $1`, [d?.fileId])).length;
      const hs = String(asRec(asRec(row.answers).health).status);
      if (d?.deletedAt === null && asset === 0) { e4bad++; e4s.push(`${i}: decline=${code(dcl)} staffEdit=${code(ed)} health=${hs} doc.deletedAt=null FileAsset=gone`); }
      // staff URL for it
      if (i === 0) { const u = await call("passengerDocumentUrl", staff("sh"), { documentId: md.documentId, purpose: "SAFETY" }); e4s.push(`staff url after: ${code(u)}${u.ok === true ? " (URL issued for a file that no longer exists → route 404)" : ""}`); }
    }
    check("E4", e4bad === 0, `decline ∥ staff edit: ${e4bad}/4 leave a live MEDICAL document whose FileAsset is gone; ${e4s.join(" · ")}`);
    if (e4bad) finding({ id: "E-DECLINE-DANGLING", sev: "MAJOR", status: "REPRODUCED", title: "decline path deletes MEDICAL files outside the transaction before its CAS; when the CAS loses (STATE_CONFLICT) the files are gone but TripDocument rows stay live and health stays PROVIDED",
      observed: e4s.join(" · "), expected: "no document row pointing at a deleted file while not marked deleted; loser must not destroy data (check rev / take doc lock first, or mark rows in a follow-up tx like withdrawCore's RETRY loop)" });

    // E5: ลงนาม ∥ เปลี่ยนแม่แบบ
    {
      const b5 = await L.mkBooking("PN", ["E5"]); const t5 = (await L.issue(b5.pax[0])).token;
      val(await call("submitPassengerForm", pctx(), { token: t5, idempotencyKey: `h${hex(6)}`, expectedRev: 0, isMinorDeclared: false }), "decl");
      const h0 = await L.curTemplateHash("PN");
      const [sg] = await Promise.all([
        call("signPassengerWaiver", pctx(), { token: t5, idempotencyKey: `w${hex(6)}`, templateHash: h0, locale: "th", accept: true, signerName: "E5 signer", signerRole: "SELF" }),
        L.setV(tA, [{ key: "trips.waiver.template", scope: "PRODUCT", scopeId: W.PRD.PN.id, value: { th: `แม่แบบใหม่ ${hex(3)} — รับทราบความเสี่ยง` } }]),
      ]); opn("E5", 2);
      const ov = asRec((await call("openPassengerForm", pctx(), { token: t5 })).value);
      const ev = asRec((await L.pax(b5.pax[0])).waiverEvidence);
      check("E5", sg.ok === true ? String(asRec(ov.waiver).status) === "NEEDS_RESIGN" && ev.templateHash === h0 : String(asRec(sg.details).reason) === "TEMPLATE_CHANGED", `sign=${code(sg)} status=${String(asRec(ov.waiver).status)} evidence.templateHash==old ${ev.templateHash === h0}`);
    }

    // E6: ออกลิงก์ ∥ เพิกถอน
    {
      const b6 = await L.mkBooking("PD", ["E6"]);
      const rs6 = await Promise.all(Array.from({ length: 12 }, (_, i) => i % 3 === 2 ? call("revokePassengerFormLink", staff(), { passengerId: b6.pax[0] }) : call("issuePassengerFormLink", staff(), { passengerId: b6.pax[0] }))); opn("E6", 12);
      const toks = rs6.filter((r) => r.ok === true && asRec(r.value).token).map((r) => String(asRec(r.value).token)); L.TOKENS.push(...toks);
      const opens = await Promise.all(toks.map((tk) => call("openPassengerForm", pctx(), { token: tk })));
      const seqs = await q<{ action: string; seq: number }>(`SELECT action, (after->>'seq')::int AS seq FROM "AuditLog" WHERE "targetId" = $1 AND action IN ('trips.passenger.link_issued','trips.passenger.link_revoked') ORDER BY (after->>'seq')::int`, [b6.pax[0]]);
      const lastIsRevoke = seqs[seqs.length - 1]?.action === "trips.passenger.link_revoked";
      const working = opens.filter((r) => r.ok === true).length;
      const dupSeq = seqs.length !== new Set(seqs.map((s) => s.seq)).size;
      check("E6", !dupSeq && working === (lastIsRevoke ? 0 : 1), `issue∥revoke: tokens=${toks.length} working=${working} lastIsRevoke=${lastIsRevoke} seqs=${seqs.map((s) => `${s.action.endsWith("revoked") ? "R" : "I"}${s.seq}`).join(",")} codes=${rs6.map(code).join(",")}`);
    }

    // E7: 40 ผู้เรียกพร้อมกัน
    {
      const b7 = await L.mkBooking("PD", Array.from({ length: 20 }, (_, i) => `E7 ${i}`));
      const toks = await Promise.all(b7.pax.map(async (p) => (await L.issue(p)).token));
      const t0 = Date.now();
      const rs7 = await Promise.all([
        ...toks.map((tk) => call("submitPassengerForm", pctx(), { token: tk, idempotencyKey: `p${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, allergies: "x" } })),
        ...toks.map((tk) => call("openPassengerForm", pctx(), { token: tk })),
        ...b7.pax.slice(0, 10).map((p) => call("getTripPassengers", staff("sv"), { bookingId: b7.bookingId }).then((r) => (void p, r))),
      ]); opn("E7", rs7.length);
      const ms = Date.now() - t0;
      const badc = rs7.filter((r) => r.ok !== true && String(r.code) !== "STATE_CONFLICT");
      const before = Number((await call("passengersUnexpectedCount")).ok === "NOFN" ? -1 : 0);
      void before;
      check("E7", badc.length === 0 && ms < 60_000, `${rs7.length} parallel calls in ${ms}ms · non-ok: ${badc.map(code).slice(0, 6).join(",")}`);
    }
    await invariants("E", W.tenantIds);
  }

  // ═══════════ F. ขอบอายุเก็บ (หน่วย uL · America/Santiago · ค่าตั้ง 1/2/3/4/5 วัน) ═══════════
  console.log("\n── F: retention boundaries ──");
  {
    const tz = "America/Santiago";
    const bF = await L.mkBooking("PL", ["F minor", "F adult"], { date: "2027-04-01" });
    const dep = (await q<{ endsAt: Date }>(`SELECT "endsAt" FROM "TripDeparture" WHERE id = $1`, [bF.dep]))[0]!.endsAt;
    const E = localYmd(new Date(dep), tz);
    const [pm, pa] = bF.pax;
    const tm = (await L.issue(pm, "oa", NOW0, uL)).token;
    val(await call("submitPassengerForm", pctx(), { token: tm, idempotencyKey: `f${hex(6)}`, expectedRev: 0, fields: L.fullPD({ dob: "2015-01-01" }), guardian: { name: "F Guardian", relation: "PARENT" }, health: { consent, conditions: "fcond" } }), "fm");
    const tpl = await L.curTemplateHash("PL");
    val(await call("signPassengerWaiver", pctx(), { token: tm, idempotencyKey: `w${hex(6)}`, templateHash: tpl, locale: "th", accept: true, signerName: "F Guardian", signerRole: "GUARDIAN", guardian: { name: "F Guardian", relation: "PARENT" } }), "sign");
    const docs: Record<string, string> = {};
    for (const [k, ct, data] of [["PASSPORT", "image/jpeg", JPG()], ["CERT", "image/jpeg", JPG()], ["MEDICAL", "application/pdf", PDF()]] as const)
      docs[k] = String(val(await call("uploadPassengerDocument", pctx(), { token: tm, idempotencyKey: `u${hex(6)}`, kind: k, contentType: ct, data }, DEPS), k).documentId);
    docs.WAIVER = String(val(await call("uploadPassengerDocumentStaff", staff("oa", { unit: uL }), { passengerId: pm, idempotencyKey: `u${hex(6)}`, kind: "WAIVER", contentType: "image/jpeg", data: JPG() }, DEPS), "W").documentId);
    docs.INSURANCE = String(val(await call("uploadPassengerDocumentStaff", staff("oa", { unit: uL }), { passengerId: pm, idempotencyKey: `u${hex(6)}`, kind: "INSURANCE", contentType: "image/jpeg", data: JPG() }, DEPS), "I").documentId);
    const stageAt = (n: number) => firstInstantOf(addDays(E, n + 1), tz);
    const report: string[] = [];
    const state = async () => {
      const r = await L.pax(pm);
      const a = asRec(r.answers);
      const dl = Object.fromEntries(await Promise.all(Object.entries(docs).map(async ([k, id]) => [k, (await L.docRow(id))?.deletedAt !== null])));
      return { health: String(asRec(a.health).status), doc: r.docNumberEnc !== null, waiver: asRec(r.waiverEvidence).purged === true, guardian: r.guardianConsent !== null, dl };
    };
    // ตรวจทีละขั้น: N=1 PASSPORT/CERT/INSURANCE · 2 MEDICAL+health · 3 WAIVER evidence+file · 4 guardian · 5 docNumber
    const expectAt: [number, (s: Awaited<ReturnType<typeof state>>) => boolean, (s: Awaited<ReturnType<typeof state>>) => boolean, string][] = [
      [1, (s) => !s.dl.PASSPORT && !s.dl.CERT && !s.dl.INSURANCE, (s) => s.dl.PASSPORT && s.dl.CERT && s.dl.INSURANCE && !s.dl.MEDICAL, "passportImageDays=1"],
      [2, (s) => s.health === "PROVIDED" && !s.dl.MEDICAL, (s) => s.health === "PURGED" && s.dl.MEDICAL && !s.waiver, "medicalFormDays=2"],
      [3, (s) => !s.waiver && !s.dl.WAIVER, (s) => s.waiver && s.dl.WAIVER && s.guardian, "riskAckDays=3"],
      [4, (s) => s.guardian, (s) => !s.guardian && s.doc, "consentAccessLogDays=4"],
      [5, (s) => s.doc, (s) => !s.doc, "manifestDays=5"],
    ];
    for (const [n, pre, post, name] of expectAt) {
      const at = stageAt(n);
      await unitPurge(uL, new Date(at.getTime() - 1)); opn("F.boundary");
      const s0 = await state();
      await unitPurge(uL, at); await unitPurge(uL, at); opn("F.boundary", 2);
      const s1 = await state();
      const okk = pre(s0) && post(s1);
      report.push(`${name}@${at.toISOString()} pre=${pre(s0)} post=${post(s1)}`);
      check(`F1-${n}`, okk, `${name} E=${E} boundary ${at.toISOString()} (local ${localYmd(at, tz)}): before=${fmt(s0)} after=${fmt(s1)}`);
      if (!okk) finding({ id: `F-BOUNDARY-${n}`, sev: pre(s0) ? "MINOR" : "MAJOR", status: "REPRODUCED", title: `${name}: wrong purge boundary in ${tz}`, observed: `before=${fmt(s0)} after=${fmt(s1)}`, expected: `kept until ${at.toISOString()} and purged at it` });
    }
    const evs = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE type = 'trips.document.purged' AND payload->>'passengerId' = $1`, [pm]))[0]?.n;
    check("F1-events-once", evs === 5 + 4, `purged events for pm = ${evs} (5 files + 4 stages expected once each despite double runs)`);
    void pa;

    // F2: null ⇒ ไม่ลบ (uA2) — ใช้ runPdpaPurge ที่จำกัดร้านตัวเอง
    const b2 = await L.mkBooking("PC", ["F2"]); const t2 = (await L.issue(b2.pax[0], "oa", NOW0, uA2)).token;
    val(await call("submitPassengerForm", pctx(), { token: t2, idempotencyKey: `f${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, conditions: "c" } }), "f2");
    const d2 = String(val(await call("uploadPassengerDocument", pctx(), { token: t2, idempotencyKey: `u${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS), "p").documentId);
    const m2 = String(val(await call("uploadPassengerDocument", pctx(), { token: t2, idempotencyKey: `u${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "m").documentId);
    await unitPurge(uA2, new Date("2045-01-01T00:00:00Z")); opn("F.null");
    const r2 = await L.pax(b2.pax[0]);
    check("F2-null", (await L.docRow(d2))?.deletedAt === null && (await L.docRow(m2))?.deletedAt === null && asRec(asRec(r2.answers).health).status === "PROVIDED", `null retention in 2045: passport deleted=${(await L.docRow(d2))?.deletedAt !== null} medical deleted=${(await L.docRow(m2))?.deletedAt !== null} health=${String(asRec(asRec(r2.answers).health).status)} retainUntil=${String(r2.retainUntil)}`);

    // F3: ลดอายุเก็บหลังอัปโหลด (30 ⇒ 5) — ไม่ย้อน (Q8) แต่ไม่เกินวันเดิม
    const b3 = await L.mkBooking("PD", ["F3"]); const t3 = (await L.issue(b3.pax[0])).token;
    const d3 = String(val(await call("uploadPassengerDocument", pctx(), { token: t3, idempotencyKey: `u${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS), "p").documentId);
    const E3 = localYmd(new Date((await q<{ endsAt: Date }>(`SELECT "endsAt" FROM "TripDeparture" WHERE id = $1`, [b3.dep]))[0]!.endsAt), "Asia/Bangkok");
    await L.setV(tA, [{ key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA, value: { ...L.RET, passportImageDays: 5 } }]);
    await unitPurge(uA, firstInstantOf(addDays(E3, 7), "Asia/Bangkok")); opn("F.shorten");
    const early = (await L.docRow(d3))?.deletedAt !== null;
    await unitPurge(uA, firstInstantOf(addDays(E3, 31), "Asia/Bangkok")); opn("F.shorten");
    const late = (await L.docRow(d3))?.deletedAt !== null;
    await L.setV(tA, [{ key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA, value: L.RET }]);
    check("F3-shorten", !early && late, `shortened 30→5: deleted at E+6? ${early} (Q8 says not retroactive) · at E+30? ${late}`);

    // F4: จำกัดชุด: ผู้เดินทาง 7 คนครบกำหนด limit 3
    const b4 = await L.mkBooking("PL", Array.from({ length: 7 }, (_, i) => `F4 ${i}`), { date: "2027-04-02" });
    for (const p of b4.pax) { const tk = (await L.issue(p, "oa", NOW0, uL)).token; val(await call("submitPassengerForm", pctx(), { token: tk, idempotencyKey: `f${hex(6)}`, expectedRev: 0, fields: L.fullPD() }), "f4"); }
    const at4 = new Date("2027-06-01T00:00:00Z");
    const runs: string[] = []; let total = 0;
    for (let i = 0; i < 6; i++) { const r = await unitPurge(uL, at4, { limit: 3 }); opn("F.batch"); runs.push(`${String(r.passengerStages)}/${String(r.more)}`); total += Number(r.passengerStages); if (!r.more) break; }
    const again = await unitPurge(uL, at4, { limit: 3 });
    const left = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripPassenger" WHERE "bookingId" = $1 AND "docNumberEnc" IS NOT NULL`, [b4.bookingId]))[0]?.n;
    check("F4-batch", left === 0 && Number(again.passengerStages) === 0 && runs[0]?.endsWith("true") === true, `runs ${runs.join(" ")} total=${total} second pass=${String(again.passengerStages)} remaining docNumberEnc=${left}`);
    // F5: ข้ามร้าน — purgeTripPersonalDataForUnit ของร้าน A ด้วยหน่วยของร้าน B
    const xb = await call("purgeTripPersonalDataForUnit", { tenantId: tA, unitId: W.uB, now: new Date("2045-01-01T00:00:00Z"), storage: { del: L.fakeDel } });
    check("F5-cross", asArr(asRec(xb).failed).some((f) => f.code === "UNIT_NOT_TRIPS") && Number(asRec(xb).documents) === 0, `tenant A + unit of B → ${fmt(xb)}`);
    await invariants("F", W.tenantIds);
  }

  // ═══════════ G. ลบผู้จอง ═══════════
  console.log("\n── G: booker purge ──");
  {
    const expire = async (bk: L.Bk, at = "2027-03-02T05:00:00Z") => {
      await q(`UPDATE "TripBooking" SET status = 'EXPIRED', "updatedAt" = $3 WHERE id = $1 AND "tenantId" = $2`, [bk.bookingId, tA, at]);
      await q(`UPDATE "TripHold" SET "expiresAt" = $3 WHERE "bookingId" = $1 AND "tenantId" = $2`, [bk.bookingId, tA, at]);
    };
    const bk = async (id: string) => (await q<L.Rec>(`SELECT status, "bookerPartyId", "piiPurgedAt", version, "paidSatang" FROM "TripBooking" WHERE id = $1`, [id]))[0] ?? {};
    const g1 = await L.mkBooking("PD", ["G1 a", "G1 b"]); const tg = (await L.issue(g1.pax[0])).token;
    val(await call("submitPassengerForm", pctx(), { token: tg, idempotencyKey: `g${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: "GPURGE123" }), health: { consent, allergies: "galg" } }), "g");
    const gd = String(val(await call("uploadPassengerDocument", pctx(), { token: tg, idempotencyKey: `u${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS), "p").documentId);
    const gm = String(val(await call("uploadPassengerDocument", pctx(), { token: tg, idempotencyKey: `u${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "m").documentId);
    const gMoney = await L.mkBooking("PD", ["G money"]); const gRef = await L.mkBooking("PD", ["G refund"]); const gRefDone = await L.mkBooking("PD", ["G refund done"]); const gPaid = await L.mkBooking("PD", ["G paid"]);
    for (const b of [g1, gMoney, gRef, gRefDone, gPaid]) await expire(b);
    await L.insertRow("TripMoneyEvent", { id: rid("me"), tenantId: tA, unitId: uA, bookingId: gMoney.bookingId, kind: "RECEIVED", amountSatang: 1000, vatSatang: 0, passThroughSatang: 0, tender: "CASH", postingStatus: "UNPOSTED", idempotencyKey: rid("k"), updatedAt: new Date() });
    for (const [b, st] of [[gRef, "REQUESTED"], [gRefDone, "REJECTED"]] as const) await L.insertRow("TripRefundRequest", { id: rid("rr"), tenantId: tA, unitId: uA, bookingId: b.bookingId, by: "CUSTOMER", reasonKind: "CUSTOMER", deductions: "[]", status: st, computed: "{}", choice: "MONEY", amountSatang: 0, updatedAt: new Date() });
    await q(`UPDATE "TripBooking" SET "paidSatang" = 500 WHERE id = $1 AND "tenantId" = $2`, [gPaid.bookingId, tA]);
    const v0 = Number((await bk(g1.bookingId)).version);
    const due = firstInstantOf(addDays("2027-03-02", 31), "Asia/Bangkok");
    const pre = await myPurge(new Date(due.getTime() - 1)); opn("G.purge");
    const pre1 = await bk(g1.bookingId);
    // สองงานพร้อมกัน + ร้านอัปโหลดพร้อมกัน
    const [r1, r2, upr] = await Promise.all([myPurge(due), myPurge(due), call("uploadPassengerDocumentStaff", staff(), { passengerId: g1.pax[1], idempotencyKey: `u${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS)]); opn("G.purge", 3);
    const r3 = await myPurge(new Date(due.getTime() + 86_400_000)); opn("G.purge");
    const post = await bk(g1.bookingId);
    const p0 = await L.pax(g1.pax[0]); const p1 = await L.pax(g1.pax[1]);
    const bookersTotal = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.booking.pii_purged' AND "targetId" = $1`, [g1.bookingId]))[0]?.n ?? -1; void r1; void r2;
    const evB = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE type = 'trips.document.purged' AND payload->>'kind' = 'BOOKER' AND payload->>'bookingId' = $1`, [g1.bookingId]))[0]?.n;
    const liveFiles = (await q(`SELECT 1 FROM "TripDocument" d JOIN "FileAsset" f ON f.id = d."fileId" WHERE d."passengerId" = ANY($1::text[])`, [g1.pax])).length;
    check("G1", pre1.piiPurgedAt === null && post.bookerPartyId === null && post.piiPurgedAt !== null && Number(post.version) === v0 + 1 && bookersTotal === 1 && evB === 1
      && String(p0.fullName) === "" && p0.docNumberEnc === null && !JSON.stringify(p0.answers).includes("box") && liveFiles === 0 && (await L.docRow(gd))?.deletedAt !== null && (await L.docRow(gm))?.deletedAt !== null,
      `pre(${new Date(due.getTime() - 1).toISOString()}) piiPurgedAt=${String(pre1.piiPurgedAt)} · post: party=${String(post.bookerPartyId)} piiPurgedAt=${String(post.piiPurgedAt)} version ${v0}→${String(post.version)} bookers=${bookersTotal} BOOKER events=${evB} p0 name=${JSON.stringify(p0.fullName)} files left=${liveFiles} upload∥purge=${code(upr)} p1 purged=${JSON.stringify(asRec(p1.answers).purged ?? null)} r3=${fmt(asRec(r3.value))}`);
    void pre;
    const skipped = await Promise.all([gMoney, gRef, gRefDone, gPaid].map(async (b) => `${b === gMoney ? "money" : b === gRef ? "refund-open" : b === gRefDone ? "refund-rejected" : "paid"}:${(await bk(b.bookingId)).piiPurgedAt === null ? "kept" : "PURGED"}`));
    check("G2-skip", skipped.join(",") === "money:kept,refund-open:kept,refund-rejected:PURGED,paid:kept", `skip rules: ${skipped.join(",")}`);
    // ลิงก์/บริการหลังลบผู้จอง
    const o = await call("openPassengerForm", pctx(), { token: tg });
    const e = await call("ensurePassengerSlots", staff(), { bookingId: g1.bookingId });
    const u = await call("updateTripPassenger", staff(), { passengerId: g1.pax[0], expectedRev: L.revOf(p0), idempotencyKey: `x${hex(6)}`, fields: { fullName: "Back" } });
    const il = await call("issuePassengerFormLink", staff(), { passengerId: g1.pax[1] });
    check("G3-after", code(o) === "NOT_FOUND" && code(e) === "STATE_CONFLICT/BOOKING_CLOSED" && u.ok !== true && il.ok !== true, `open=${code(o)} slots=${code(e)} update=${code(u)} issue=${code(il)}`);
    await invariants("G", W.tenantIds);
  }
} catch (e) {
  console.log("💥", L.errMsg(e), e instanceof Error ? e.stack?.split("\n").slice(1, 6).join(" ") : "");
  finding({ id: "HARNESS-B", sev: "NOTE", status: "SUSPICION", title: "probe aborted", observed: L.errMsg(e), expected: "" });
} finally {
  L.summary("probe-t0.8-b");
  try { await L.cleanupTenants(W.tenantIds); await L.cleanupMisc(); } catch (e) { console.log("cleanup", L.errMsg(e)); }
  await L.endPool();
  process.exit(0);
}
void STORE;
