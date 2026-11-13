// probe-trips-t0.8-a.mts — นักล่า T0.8 กลุ่ม A B C D H I + เขตเวลา (untracked · hunter)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.8-a.mts
import { randomBytes } from "node:crypto";
import * as L from "./probe-trips-t0.8-lib.mjs";
const { W, call, code, val, staff, pctx, check, finding, opn, q, asRec, asArr, fmt, hex, rid, NOW0, JPG, PDF, PNG, DEPS, STORE, consent } = L;

L.boot("probe-t0.8-a");
L.installFakeStorage();
const T0 = new Date();
const STAMP = L.STAMP;
const UP = STAMP.toUpperCase().replace(/[^A-Z0-9]/g, "");
const MK = { alg: `zqhalg${STAMP}`, cond: `zqhcnd${STAMP}`, doc: `ZQH${UP}`.slice(0, 18), grd: `Zqhgrd${STAMP}`, sgn: `Zqhsgn${STAMP}`, bad: `zqhbad${STAMP}` };
const ERRS: L.Rec[] = [];
const C = async (name: string, ...a: unknown[]) => { const r = await call(name, ...a); if (r.ok !== true) ERRS.push({ name, r }); return r; };
const lvs: string[] = [];

try {
  await L.sweepStale();
  await L.cleanupMisc();
  await L.setupWorld();
  const { tA, tB, uA, uA2 } = W;
  console.log("setup ok", tA, tB);

  // ═══════════ ข้อมูลตั้งต้น ═══════════
  const B1 = await L.mkBooking("PD", ["P1 one", "P2 two"]);
  const B2 = await L.mkBooking("PD", ["B2 one"]);
  const B3 = await L.mkBooking("PC", ["U2 one"]);
  const BB = await L.mkBooking("PB", ["TB one"]);
  const [P1, P2] = B1.pax;
  const t1 = (await L.issue(P1)).token, t2 = (await L.issue(P2)).token, tb2 = (await L.issue(B2.pax[0])).token;
  const t3 = (await L.issue(B3.pax[0], "oa", NOW0, uA2)).token;
  const tbb = (await L.issue(BB.pax[0], "ob")).token;
  // P1: ฟอร์ม + สุขภาพ (marker) + ไฟล์ทุกชนิด
  const s1 = await C("submitPassengerForm", pctx(), { token: t1, idempotencyKey: `s${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: MK.doc }), health: { consent, allergies: MK.alg, conditions: MK.cond } });
  check("PC-submit", s1.ok === true, `P1 submit with health ${code(s1)}`);
  const up = async (token: string, kind: string, ct = "image/jpeg", data = JPG()) => C("uploadPassengerDocument", pctx(), { token, idempotencyKey: `f${hex(6)}`, kind, contentType: ct, data }, DEPS);
  const upS = async (pid: string, kind: string, ct = "image/jpeg", data = JPG(), unit = uA, who = "oa") => C("uploadPassengerDocumentStaff", staff(who, { unit }), { passengerId: pid, idempotencyKey: `g${hex(6)}`, kind, contentType: ct, data }, DEPS);
  const d1 = { PASSPORT: val(await up(t1, "PASSPORT"), "P1 pass").documentId, CERT: val(await up(t1, "CERT", "image/png", PNG()), "P1 cert").documentId, MEDICAL: val(await up(t1, "MEDICAL", "application/pdf", PDF()), "P1 med").documentId,
    INSURANCE: val(await upS(P1, "INSURANCE", "application/pdf", PDF()), "P1 ins").documentId, WAIVER: val(await upS(P1, "WAIVER"), "P1 waiver").documentId } as Record<string, unknown>;
  const dP2 = val(await up(t2, "PASSPORT"), "P2").documentId;
  const dB2 = val(await up(tb2, "PASSPORT"), "B2").documentId;
  const dB3 = val(await up(t3, "PASSPORT"), "B3").documentId;
  const dBB = val(await up(tbb, "PASSPORT"), "BB").documentId;
  const fileOf = async (docId: unknown) => String((await L.docRow(String(docId)))?.fileId ?? "");
  const STO = asRec(await import("@/lib/storage/service"));
  const nonTrips = asRec(await (STO.uploadFile as L.Fn)({ tenantId: tA }, { kind: "ATTACHMENT", filename: "crm.jpg", contentType: "image/jpeg", data: JPG(), visibility: "private" }));
  const nonTripsPublic = asRec(await (STO.uploadFile as L.Fn)({ tenantId: tA }, { kind: "ATTACHMENT", filename: "pub.jpg", contentType: "image/jpeg", data: JPG() }));
  let lv1 = await L.lastIssued(P1); lvs.push(lv1);

  // ═══════════ A. route ไฟล์กลาง ═══════════
  console.log("\n── A: route / link viewer ──");
  const RES: L.Rec[] = [];
  const hit = async (tag: string, url: string, hdr: Record<string, string> = {}) => {
    const r = await L.routeHit(url, hdr); opn("A.route"); RES.push({ tag, status: r.status, ...r.h });
    if (r.h["cache-control"] !== "private, no-store") finding({ id: `A-hdr-${tag}`, sev: "MAJOR", status: "REPRODUCED", title: "route answer without private,no-store", observed: fmt(r.h), expected: "cache-control private, no-store" });
    return r;
  };
  // ตัวควบคุมบวก
  for (const k of ["PASSPORT", "CERT", "INSURANCE", "WAIVER"]) {
    const cu = await C("customerDocumentUrl", pctx(), { token: t1, documentId: d1[k], purpose: "CUSTOMER_SELF" });
    const url = String(asRec(cu.value).url ?? "");
    const r = url ? await hit(`own-${k}`, url) : { status: -1, h: {} as L.Rec, body: new Uint8Array() };
    const exp = k === "INSURANCE" ? "attachment" : "inline";
    check(`A1-${k}`, r.status === 200 && String(r.h["content-disposition"]).startsWith(exp) && r.h["x-content-type-options"] === "nosniff" && !url.includes(t1.split(".")[0]), `own ${k}: ${code(cu)} ${r.status} ${fmt(r.h)}`);
  }
  // MEDICAL
  {
    const cu = await C("customerDocumentUrl", pctx(), { token: t1, documentId: d1.MEDICAL, purpose: "CUSTOMER_SELF" });
    const r = await hit("own-MEDICAL-minted", L.linkUrl(await fileOf(d1.MEDICAL), lv1));
    check("A2", code(cu) === "FORBIDDEN/OTP_REQUIRED" && r.status === 404, `MEDICAL svc=${code(cu)} route=${r.status}`);
  }
  // คนอื่น/การจองอื่น/หน่วยอื่น/ร้านอื่น/ไฟล์นอก trips
  for (const [tag, doc] of [["P2", dP2], ["B2", dB2], ["unit2", dB3], ["tenantB", dBB]] as const) {
    const cu = await C("customerDocumentUrl", pctx(), { token: t1, documentId: doc, purpose: "CUSTOMER_SELF" });
    const r = await hit(`x-${tag}`, L.linkUrl(await fileOf(doc), lv1));
    check(`A3-${tag}`, code(cu) === "NOT_FOUND" && r.status === 404, `${tag}: svc=${code(cu)} route=${r.status}`);
  }
  for (const [tag, f] of [["nonTripsPrivate", String(nonTrips.assetId)], ["nonTripsPublic", String(nonTripsPublic.assetId)]] as const) {
    const r = await hit(`x-${tag}`, L.linkUrl(f, lv1));
    check(`A7-${tag}`, r.status === 404, `${tag} route=${r.status}`);
  }
  // id ของเอกสาร (ไม่ใช่ fileId) ใน path
  { const r = await hit("docid-as-file", L.linkUrl(String(d1.PASSPORT), lv1)); check("A7-docid", r.status === 404, `TripDocument.id as file id → ${r.status}`); }
  // lv ของร้าน B กับไฟล์ร้าน A · lv = แถว revoked / แถว audit อื่น
  {
    const lvB = await L.lastIssued(BB.pax[0]);
    const r = await hit("lvB-fileA", L.linkUrl(await fileOf(d1.PASSPORT), lvB));
    check("A6-lvB", r.status === 404, `tenant B lv on tenant A file → ${r.status}`);
    const other = (await q<{ id: string }>(`SELECT id FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 AND action <> 'trips.passenger.link_issued' LIMIT 1`, [tA, P1]))[0]?.id ?? "";
    const r2 = await hit("lv-otherAudit", L.linkUrl(await fileOf(d1.PASSPORT), other));
    check("A8-otherAudit", r2.status === 404, `lv = non-link audit row of P1 → ${r2.status}`);
  }
  // ปลอม/แก้
  {
    const f = await fileOf(d1.PASSPORT);
    const good = L.linkUrl(f, lv1);
    const u = new URL(`http://x${good}`);
    const sig = String(u.searchParams.get("sig")), exp = String(u.searchParams.get("exp"));
    const variants: [string, string, number[]][] = [
      ["sig-flip", good.replace(sig, sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0")), [403]],
      ["sig-upper", good.replace(sig, sig.toUpperCase()), [200]],
      ["exp+1", good.replace(`exp=${exp}`, `exp=${Number(exp) + 1}`), [403]],
      ["exp-905" /* ผู้คุม 13 พ.ย.: +901 พลาดตามเวลา (สร้าง URL ก่อนยิงจริง 1 วิ ⇒ อยู่ในเพดาน 900 วิ) */, (() => { const e = Math.floor(Date.now() / 1000) + 905; return `/api/files/${f}?exp=${e}&sig=${L.mintSig(f, e, `LINK_CUSTOMER:${lv1}`)}&lv=${lv1}`; })(), [403]],
      ["exp-past", (() => { const e = Math.floor(Date.now() / 1000) - 1; return `/api/files/${f}?exp=${e}&sig=${L.mintSig(f, e, `LINK_CUSTOMER:${lv1}`)}&lv=${lv1}`; })(), [403]],
      ["no-lv", good.replace(`&lv=${lv1}`, ""), [403]],
      ["no-sig", good.replace(`&sig=${sig}`, ""), [403]],
      ["no-exp", good.replace(`exp=${exp}&`, ""), [403]],
      ["lv-upper", good.replace(`lv=${lv1}`, `lv=${lv1.toUpperCase()}`), [403, 404]],
      ["lv-41", good.replace(`lv=${lv1}`, `lv=${lv1}${"a".repeat(41 - lv1.length)}`), [403]],
      ["lv-dup-first-bad", good.replace(`lv=${lv1}`, `lv=zzzzzzzzzzzzzzzzzzzz&lv=${lv1}`), [403]],
      ["lv-dup-first-good", good.replace(`lv=${lv1}`, `lv=${lv1}&lv=zzzzzzzzzzzzzzzzzzzz`), [200]],
      ["lv-encoded", good.replace(`lv=${lv1}`, `lv=${encodeURIComponent(lv1).replace(/[a-z]/, (c) => `%${c.charCodeAt(0).toString(16)}`)}`), [200]],
      ["lv-space", good.replace(`lv=${lv1}`, `lv=%20${lv1}`), [403]],
      ["lv-nul", good.replace(`lv=${lv1}`, `lv=${lv1}%00`), [403]],
      ["id-encoded", good.replace(`/api/files/${f}`, `/api/files/${encodeURIComponent(f).replace(/[a-z]/, (c) => `%${c.charCodeAt(0).toString(16)}`)}`), [200]],
      ["id-dotdot", good.replace(`/api/files/${f}`, `/api/files/..%2F${f}`), [404]],
      ["huge-lv", good.replace(`lv=${lv1}`, `lv=${"a".repeat(20_000)}`), [403]],
      ["huge-sig", good.replace(`sig=${sig}`, `sig=${"a".repeat(20_000)}`), [403]],
      ["sig-as-staff-key", (() => { const e = Math.floor(Date.now() / 1000) + 200; return `/api/files/${f}?exp=${e}&sig=${L.mintSig(f, e, `STAFF:${lv1}`)}&lv=${lv1}`; })(), [403]],
      ["lv-is-userId", (() => { const uid = String(W.U.oa.userId).replace(/[^a-z0-9]/gi, ""); const e = Math.floor(Date.now() / 1000) + 200; return `/api/files/${f}?exp=${e}&sig=${L.mintSig(f, e, `LINK_CUSTOMER:${uid}`)}&lv=${uid}`; })(), [403, 404]],
    ];
    for (const [tag, url, okc] of variants) { const r = await hit(tag, url); check(`A9-${tag}`, okc.includes(r.status), `${tag} → ${r.status} (want ${okc.join("|")})`); }
    // ไม่มีคุกกี้+ไม่มี lv = 403 เดิม · คุกกี้ปลอมไม่เปลี่ยนผล
    const r0 = await hit("baseline-no-cookie", `/api/files/${f}?exp=${exp}&sig=${sig}`);
    check("A10-baseline", r0.status === 403, `no cookie no lv → ${r0.status}`);
    const r1 = await hit("junk-cookie", good, { cookie: "shark_session=junk; shark_customer=junk; shark_portal=junk" });
    check("A10-junkcookie", r1.status === 200, `junk cookies + lv → ${r1.status} (cookies unread outside Next; noted)`);
    // ถังอัตรา: lv สุ่มที่ไม่มีจริงสร้างถังใหม่ทุกค่า (ด่านผู้ดูผ่านด้วยค่าที่คนนอกเลือก)
    const before = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE 'files:private:LINK_CUSTOMER:t08hz%'`))[0]?.n ?? 0;
    for (let i = 0; i < 25; i++) await hit("random-lv", `/api/files/${f}?exp=${exp}&sig=${"0".repeat(64)}&lv=t08hz${hex(8)}`);
    const after = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE 'files:private:LINK_CUSTOMER:t08hz%'`))[0]?.n ?? 0;
    if (after - before >= 25) finding({ id: "A-RL-1", sev: "MINOR", status: "REPRODUCED", title: "route: any 16–40-char `lv` from an anonymous caller becomes a viewer — each distinct value writes a fresh ChatRateBucket row and gets its own 60/min bucket",
      observed: `25 anonymous requests with random lv (no cookie, bad sig) → ${after - before} new rate-bucket rows; before T0.8 the same requests were refused 403 at step 1 without a per-viewer DB write`, expected: "anonymous junk is bounded only by the 300/min IP bucket; consider requiring lv to exist (or rate-limit by IP only for LINK_CUSTOMER) — design note, not a leak" });
    await q(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'files:private:LINK_CUSTOMER:t08hz%'`);
  }
  // หลังเพิกถอน / ออกใหม่ / ลบเอกสาร / ลบ FileAsset / ทริปจบ / การจองปิด
  {
    const f = await fileOf(d1.PASSPORT);
    const ok0 = await hit("life-before", L.linkUrl(f, lv1));
    val(await C("revokePassengerFormLink", staff(), { passengerId: P1 }), "revoke");
    const r1 = await hit("life-revoked", L.linkUrl(f, lv1));
    const t1b = (await L.issue(P1)).token; const lv1b = await L.lastIssued(P1); lvs.push(lv1b);
    const r2 = await hit("life-new-on-old-lv", L.linkUrl(f, lv1));
    const r3 = await hit("life-new-lv", L.linkUrl(f, lv1b));
    const t1c = (await L.issue(P1)).token; const lv1c = await L.lastIssued(P1); lvs.push(lv1c);
    const r4 = await hit("life-reissued-old", L.linkUrl(f, lv1b));
    const oldTok = await C("openPassengerForm", pctx(), { token: t1b });
    const replay = await C("openPassengerForm", pctx(), { token: t1 });
    check("A8-life", ok0.status === 200 && r1.status === 404 && r2.status === 404 && r3.status === 200 && r4.status === 404 && code(oldTok) === "NOT_FOUND" && code(replay) === "NOT_FOUND",
      `before=${ok0.status} revoked=${r1.status} oldAfterNew=${r2.status} new=${r3.status} reissuedOld=${r4.status} oldToken=${code(oldTok)} revokedToken=${code(replay)}`);
    lv1 = lv1c;
    // ลบเอกสาร (สถานะ deletedAt ในร้านตัวเอง) — ไฟล์ CERT
    const fc = await fileOf(d1.CERT);
    const a = await hit("life-cert-ok", L.linkUrl(fc, lv1));
    await q(`UPDATE "TripDocument" SET "deletedAt" = now() WHERE id = $1 AND "tenantId" = $2`, [d1.CERT, tA]);
    const b = await hit("life-cert-deleted", L.linkUrl(fc, lv1));
    // ลบ FileAsset จริง (INSURANCE)
    const fi = await fileOf(d1.INSURANCE);
    await (STO.deleteFileAsset as L.Fn)({ tenantId: tA }, fi, { del: L.fakeDel });
    const c = await hit("life-asset-gone", L.linkUrl(fi, lv1));
    // ทริปจบ (ตามนาฬิกาจริงของ route): ย้าย endsAt ไปอดีตในร้านตัวเอง
    const dep = (await q<{ s: Date; e: Date; c: Date }>(`SELECT "startsAt" AS s, "endsAt" AS e, "cutoffAt" AS c FROM "TripDeparture" WHERE id = $1`, [B1.dep]))[0]!;
    await q(`UPDATE "TripDeparture" SET "startsAt" = '2025-12-31T20:00:00Z', "cutoffAt" = '2025-12-31T20:00:00Z', "endsAt" = '2026-01-01T00:00:00Z' WHERE id = $1 AND "tenantId" = $2`, [B1.dep, tA]);
    const d = await hit("life-trip-ended", L.linkUrl(f, lv1));
    await q(`UPDATE "TripDeparture" SET "startsAt" = $3, "cutoffAt" = $4, "endsAt" = $5 WHERE id = $1 AND "tenantId" = $2`, [B1.dep, tA, dep.s, dep.c, dep.e]);
    await q(`UPDATE "TripBooking" SET status = 'CANCELLED' WHERE id = $1 AND "tenantId" = $2`, [B1.bookingId, tA]);
    const e = await hit("life-cancelled", L.linkUrl(f, lv1));
    const st = (await q<{ s: string }>(`SELECT status AS s FROM "TripBooking" WHERE id = $1`, [B1.bookingId]))[0]?.s;
    await q(`UPDATE "TripBooking" SET status = 'CONFIRMED' WHERE id = $1 AND "tenantId" = $2`, [B1.bookingId, tA]);
    check("A8-state", a.status === 200 && b.status === 404 && c.status === 404 && d.status === 404 && e.status === 404, `cert ok=${a.status} deleted=${b.status} assetGone=${c.status} tripEnded=${d.status} cancelled(${st})=${e.status}`);
    // ไฟล์ PASSPORT ของ P1 หลังลบทั้งคน (ERASE)
  }
  console.log("ROUTE_RESULTS", JSON.stringify(RES));

  // ═══════════ B. token ═══════════
  console.log("\n── B: self-fill tokens ──");
  {
    const tok = (await L.issue(P2)).token; lvs.push(await L.lastIssued(P2));
    const [p, s] = tok.split(".");
    const pl = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as L.Rec;
    const forge = (o: L.Rec) => `${Buffer.from(JSON.stringify({ ...pl, ...o })).toString("base64url")}.${s}`;
    const variants: [string, string][] = [
      ["swap-subject", forge({ s: P1 })], ["swap-tenant", forge({ t: tB })], ["swap-purpose", forge({ u: "trips.pax-form2" })], ["exp+1", forge({ e: Number(pl.e) + 1 })],
      ["trunc-sig", `${p}.${s.slice(0, -2)}`], ["trunc-payload", `${p.slice(0, -4)}.${s}`], ["no-dot", `${p}${s}`], ["three-parts", `${p}.${s}.x`], ["pad", `${p}=.${s}`],
      ["other-pax-sig", `${p}.${t1.split(".")[1]}`], ["empty", ""], ["4096", "a".repeat(4096)], ["4097", "a".repeat(4097)], ["unicode", `${p}.${s}‮`],
    ];
    for (const [tag, v] of variants) { const r = await C("openPassengerForm", pctx(), { token: v }); opn("B.token"); check(`B1-${tag}`, ["NOT_FOUND", "VALIDATION"].includes(String(r.code)), `${tag} → ${code(r)}`); }
    // ลิงก์ P2 ส่งข้อมูลของ P1 (ids ในเนื้อ)
    for (const extra of [{ passengerId: P1 }, { bookingId: B1.bookingId }, { tenantId: tA }]) {
      const r = await C("submitPassengerForm", pctx(), { token: tok, idempotencyKey: `x${hex(6)}`, expectedRev: 0, fields: { fullName: "Swap" }, ...extra });
      opn("B.token"); check(`B3-${Object.keys(extra)[0]}`, code(r) === "VALIDATION", `extra ${Object.keys(extra)[0]} → ${code(r)}`);
    }
    const p1row = await L.pax(P1); check("B3-p1-untouched", String(p1row.fullName) !== "Swap", `P1 fullName=${String(p1row.fullName)}`);
    // อัตรา: ค่าตั้งของหน่วย
    const S = asRec(await import("@/lib/core/settings"));
    const rl = asRec(asRec(asRec(await (S.resolveSettings as L.Fn)({ tenantId: tA }, ["trips.public.rateLimits"], { unitId: uA }, new Date(NOW0)))["trips.public.rateLimits"]).value);
    const lim = Number(rl.tokenPerHourPerDevice);
    const ck = `t08h_rl_${hex(4)}`;
    const codes: string[] = [];
    for (let i = 0; i < lim + 1; i++) { codes.push(code(await call("openPassengerForm", pctx(NOW0, ck), { token: tok }))); opn("B.rate"); }
    check("B4-valid-limit" /* ผู้คุม 13 พ.ย.: มติ P6 — ลิงก์ถูกจำกัดต่อ "ลิงก์" (10 × lim) ไม่ใช่ต่อเครื่อง ⇒ lim+1 ครั้งต้องผ่านทั้งหมด */, codes.every((c) => c === "ok"), `limit ${lim}: ${codes.join(",")}`);
    // flood of invalid on another device does not lock this one; flood on same device does
    const ck2 = `t08h_fl_${hex(4)}`;
    for (let i = 0; i < 60; i++) { await call("openPassengerForm", pctx(NOW0, ck2), { token: `${randomBytes(20).toString("base64url")}.${randomBytes(32).toString("base64url")}` }); opn("B.rate"); }
    const sameDev = await call("openPassengerForm", pctx(NOW0, ck2), { token: tok });
    const otherDev = await call("openPassengerForm", pctx(NOW0), { token: tok });
    check("B4-flood", code(sameDev) === "RATE_LIMITED" && otherDev.ok === true, `after 60 invalid on device X: same device=${code(sameDev)} other device=${code(otherDev)} (clientKey is caller-chosen ⇒ lockout is per-key only)`);
    // clientKey ผิดรูป
    for (const ck3 of ["short", "a".repeat(129), "bad key with space", `t08h_${"‮"}xxxxxx`]) { const r = await call("openPassengerForm", { clientKey: ck3, now: new Date(NOW0) }, { token: tok }); opn("B.rate"); check(`B4-ck-${ck3.length}`, code(r) === "VALIDATION", `clientKey ${JSON.stringify(ck3.slice(0, 12))} → ${code(r)}`); }
  }

  // ═══════════ C. leak scan + text rule ═══════════
  console.log("\n── C: leak / text rule ──");
  const Bc = await L.mkBooking("PD", ["C one", "C minor"]);
  const tc = (await L.issue(Bc.pax[0])).token, tm = (await L.issue(Bc.pax[1])).token;
  {
    const bad: [string, L.Rec][] = [
      ["bidi-name", { fullName: `${MK.bad}‮abc` }], ["ctl-name", { fullName: `${MK.bad}\u0007` }], ["lrm", { fullName: `${MK.bad}‎` }], ["lone-surr", { fullName: `${MK.bad}\ud800` }],
      ["c1", { fullName: `${MK.bad}\u0085` }], ["ls-mid", { fullName: `${MK.bad}\u2028x` }], ["ls-trail", { fullName: `zzz\u2028` }], ["oversize", { fullName: `${MK.bad}${"x".repeat(9000)}` }], ["doc-bad", { docNumber: `${MK.bad}!!` }],
      ["phone-bad", { phone: `${MK.bad}` }], ["nat-bad", { nationality: MK.bad }], ["dob-future", { dob: "2099-01-01" }], ["unknown-key", { [MK.bad]: 1 }], ["allergies-in-fields", { allergies: MK.bad }],
    ];
    for (const [tag, f] of bad) { const r = await C("submitPassengerForm", pctx(), { token: tc, idempotencyKey: `c${hex(6)}`, expectedRev: revOfSafe(await L.pax(Bc.pax[0])), fields: f }); opn("C.bad"); check(`C1-${tag}`, tag === "ls-trail" ? r.ok === true : code(r).startsWith("VALIDATION"), `${tag} → ${code(r)} ${fmt(r.details)}`); }
    const zw = await C("submitPassengerForm", pctx(), { token: tc, idempotencyKey: `c${hex(6)}`, expectedRev: revOfSafe(await L.pax(Bc.pax[0])), fields: { fullName: `Zw​Name﻿` } });
    const row = await L.pax(Bc.pax[0]);
    check("C1-zwsp-stripped", zw.ok === true && row.fullName === "ZwName", `ZWSP/BOM → ${code(zw)} stored=${JSON.stringify(row.fullName)}`);
    const hbad: [string, L.Rec][] = [["alg-bidi", { consent, allergies: `${MK.bad}⁦` }], ["alg-oversize", { consent, allergies: `${MK.bad}${"y".repeat(600)}` }], ["cond-oversize", { consent, conditions: `${MK.bad}${"y".repeat(2100)}` }],
      ["no-consent", { allergies: MK.bad }], ["wrong-hash", { consent: { ...consent, textHash: "0".repeat(64) }, allergies: MK.bad }], ["declined+data", { declined: true, allergies: MK.bad }], ["accepted-false", { consent: { ...consent, accepted: false }, allergies: MK.bad }]];
    for (const [tag, h] of hbad) { const r = await C("submitPassengerForm", pctx(), { token: tc, idempotencyKey: `c${hex(6)}`, expectedRev: revOfSafe(await L.pax(Bc.pax[0])), health: h }); opn("C.bad"); check(`C2-${tag}`, r.ok !== true, `${tag} → ${code(r)}`); }
    const after = await L.pax(Bc.pax[0]);
    check("C2-nothing-stored", !JSON.stringify(after).includes(MK.bad), `row after rejected health: ${JSON.stringify(after.answers).slice(0, 200)}`);
    // guardian/sign names with control chars
    const g = await C("submitPassengerForm", pctx(), { token: tm, idempotencyKey: `c${hex(6)}`, expectedRev: 0, fields: { dob: "2015-01-01" }, guardian: { name: `${MK.bad}‮`, relation: "PARENT" } });
    check("C1-guardian-bidi", code(g).startsWith("VALIDATION"), `guardian bidi → ${code(g)}`);
    // happy paths with markers
    val(await C("submitPassengerForm", pctx(), { token: tm, idempotencyKey: `c${hex(6)}`, expectedRev: 0, fields: L.fullPD({ dob: "2015-01-01" }), guardian: { name: MK.grd, relation: "PARENT" }, health: { consent, allergies: MK.alg, conditions: MK.cond } }), "minor+guardian");
    const tplPD = await L.curTemplateHash("PD");
    val(await C("signPassengerWaiver", pctx(), { token: tm, idempotencyKey: `w${hex(6)}`, templateHash: tplPD, locale: "th", accept: true, signerName: MK.sgn, signerRole: "GUARDIAN", guardian: { name: MK.grd, relation: "PARENT" } }), "sign");
    val(await C("submitPassengerForm", pctx(), { token: tc, idempotencyKey: `c${hex(6)}`, expectedRev: revOfSafe(await L.pax(Bc.pax[0])), fields: L.fullPD({ docNumber: MK.doc }), health: { consent, allergies: MK.alg } }), "adult");
    val(await C("uploadPassengerDocument", pctx(), { token: tc, idempotencyKey: `m${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "med");
    await C("getTripPassengers", staff("sv"), { bookingId: Bc.bookingId });
    const g2 = await C("getTripPassengers", staff("oa", { unit: uA2 }), { bookingId: B3.bookingId });
    void g2;
    const rv = await C("revealPassengerData", staff("oa"), { passengerId: Bc.pax[0], what: "HEALTH", purpose: "SAFETY" });
    check("PC-reveal", JSON.stringify(rv).includes(MK.alg), `reveal returns marker (positive control) ${code(rv)}`);
    await C("revealPassengerData", staff("oa"), { passengerId: Bc.pax[0], what: "DOC_NUMBER", purpose: "MANIFEST" });
    await C("exportPassengerData", staff("oa"), { passengerId: Bc.pax[1], purpose: "PDPA_REQUEST" });
    await C("withdrawHealthConsent", pctx(), { token: tc, idempotencyKey: `w${hex(6)}`, mode: "PREVIEW" }, DEPS);
    val(await C("withdrawHealthConsent", pctx(), { token: tc, idempotencyKey: `w${hex(6)}`, mode: "EXECUTE" }, DEPS), "withdraw");
    await C("submitPassengerForm", pctx(), { token: tm, idempotencyKey: `c${hex(6)}`, expectedRev: revOfSafe(await L.pax(Bc.pax[1])), health: { declined: true } }, DEPS);
    await C("submitPassengerForm", pctx(), { token: tm, idempotencyKey: `c${hex(6)}`, expectedRev: 999, fields: { docNumber: MK.doc } });
    const req = val(await C("recordPdpaRequest", staff("oa"), { kind: "ERASE", passengerId: Bc.pax[1], idempotencyKey: `r${hex(6)}` }), "req");
    val(await C("resolvePdpaRequest", staff("oa"), { requestId: req.requestId, expectedStatus: "RECEIVED", decision: "DONE" }, DEPS), "erase");
    await C("runPdpaPurge", new Date("2031-01-01T00:00:00Z"), { tenantIds: [tA], storage: { del: L.fakeDel } });
    const hits = await L.scanLeaks([MK.alg, MK.cond, MK.doc, MK.grd, MK.sgn, MK.bad, ...L.TOKENS, ...L.TOKENS.map((t) => t.split(".")[1] ?? t), ...L.TOKENS.map((t) => t.split(".")[0] ?? t)], W.tenantIds, T0);
    const errHits = [MK.alg, MK.cond, MK.doc, MK.grd, MK.sgn, MK.bad, ...L.TOKENS].filter((m) => JSON.stringify(ERRS).includes(m));
    opn("C.scan", ERRS.length);
    // positive control for scanner
    await L.insertRow("OutboxEvent", { id: rid("ob"), tenantId: tA, type: "qc.t08h.control", payload: JSON.stringify({ x: MK.alg }), idempotencyKey: rid("k") });
    const ctl = await L.scanLeaks([MK.alg], [tA], T0);
    await q(`DELETE FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'qc.t08h.control'`, [tA]);
    check("PC-scanner", ctl.some((h) => h.where === "OutboxEvent"), "scanner finds planted marker");
    check("C3-scan", hits.length === 0 && errHits.length === 0, `leak hits: ${fmt(hits.slice(0, 5))} · error-result hits: ${fmt(errHits)} (errors scanned ${ERRS.length})`);
    if (hits.length || errHits.length) finding({ id: "C-LEAK", sev: "BLOCKER", status: "REPRODUCED", title: "marker found outside sealed columns", observed: fmt({ hits: hits.slice(0, 5), errHits }), expected: "no marker in outbox/audit/ops/errors" });
    const erased = await L.pax(Bc.pax[1]);
    check("C4-erased-row", !JSON.stringify(erased).includes(MK.grd) && !JSON.stringify(erased).includes(MK.sgn) && !JSON.stringify(erased).includes(MK.alg), `erased row clean: ${JSON.stringify(erased).slice(0, 160)}`);
  }

  // ═══════════ D. consent / sealing ═══════════
  console.log("\n── D: consent / sealing ──");
  {
    // PT: ไม่มี T62 แต่ allergies เปิด · PN: ไม่มีทั้งคู่
    const BT = await L.mkBooking("PT", ["PT one"]); const tt = (await L.issue(BT.pax[0])).token;
    const BN = await L.mkBooking("PN", ["PN one"]); const tn = (await L.issue(BN.pax[0])).token;
    const r1 = await C("submitPassengerForm", pctx(), { token: tt, idempotencyKey: `d${hex(6)}`, expectedRev: 0, isMinorDeclared: false, health: { consent, conditions: "x" } });
    const r2 = await C("submitPassengerForm", pctx(), { token: tn, idempotencyKey: `d${hex(6)}`, expectedRev: 0, isMinorDeclared: false, health: { consent, allergies: "x" } });
    const r3 = await C("submitPassengerForm", pctx(), { token: tt, idempotencyKey: `d${hex(6)}`, expectedRev: 0, health: { consent, allergies: "nuts" } });
    const r4 = await C("submitPassengerForm", pctx(), { token: tn, idempotencyKey: `d${hex(6)}`, expectedRev: 0, health: { declined: true } });
    check("D1-not-collected", code(r1) === "VALIDATION/HEALTH_NOT_COLLECTED" && code(r2) === "VALIDATION/HEALTH_NOT_COLLECTED" && code(r3) === "VALIDATION/AGE_UNKNOWN" && code(r4) === "VALIDATION/HEALTH_NOT_COLLECTED",
      `PT conditions=${code(r1)} PN allergies=${code(r2)} PT no age=${code(r3)} PN declined=${code(r4)}`);
    const ptRow = await L.pax(BT.pax[0]); const pnRow = await L.pax(BN.pax[0]);
    check("D1-nothing", !asRec(ptRow.answers).health && !asRec(pnRow.answers).health, "no health stored");

    // ── ผู้เยาว์: ให้สุขภาพตอนเป็นผู้ใหญ่ แล้วเปลี่ยน dob เป็นเด็ก (ไม่มีผู้ปกครอง) ──
    const BM = await L.mkBooking("PD", ["flip one", "flip two", "grd one"]);
    const tf = (await L.issue(BM.pax[0])).token;
    val(await C("submitPassengerForm", pctx(), { token: tf, idempotencyKey: `d${hex(6)}`, expectedRev: 0, fields: L.fullPD({ dob: "1990-01-01" }), health: { consent, allergies: "peanut" } }), "adult health");
    const flip = await C("submitPassengerForm", pctx(), { token: tf, idempotencyKey: `d${hex(6)}`, expectedRev: 1, fields: { dob: "2016-06-01" } });
    const fr = await L.pax(BM.pax[0]);
    const fa = asRec(fr.answers);
    opn("D.minor", 2);
    const leftover = flip.ok === true && asRec(fa.health).status === "PROVIDED" && fr.guardianConsent === null && fr.isMinor === true;
    check("D2-minor-flip", !leftover, `after dob→2016 (age 10) without guardian: ${code(flip)} health=${String(asRec(fa.health).status)} signerRole=${String(asRec(asRec(fa.health).consent).signerRole)} guardianConsent=${fmt(fr.guardianConsent)} isMinor=${String(fr.isMinor)}`);
    if (leftover) finding({ id: "D-MINOR-FLIP", sev: "MAJOR", status: "REPRODUCED", title: "health data of a minor kept with SELF consent and no guardian after dob is changed (invariant §14.1)",
      observed: `submit {dob:"1990-01-01", health+consent} ⇒ PROVIDED/SELF; then submit {fields:{dob:"2016-06-01"}} (no health, no guardian) ⇒ ok, row isMinor=true, guardianConsent=null, sealed health box still PROVIDED with consent.signerRole=SELF`,
      expected: "writeCore must re-check §14.1 when minor status changes: refuse (GUARDIAN_REQUIRED) or require guardian / drop the box — same for isMinorDeclared false→true" });
    // isMinorDeclared variant
    const tf2 = (await L.issue(BM.pax[1])).token;
    val(await C("submitPassengerForm", pctx(), { token: tf2, idempotencyKey: `d${hex(6)}`, expectedRev: 0, isMinorDeclared: false, fields: { fullName: "decl" }, health: { consent, allergies: "milk" } }), "declared adult");
    const flip2 = await C("submitPassengerForm", pctx(), { token: tf2, idempotencyKey: `d${hex(6)}`, expectedRev: 1, isMinorDeclared: true });
    const f2 = await L.pax(BM.pax[1]);
    const left2 = flip2.ok === true && asRec(asRec(f2.answers).health).status === "PROVIDED" && f2.guardianConsent === null;
    check("D2-declared-flip", !left2, `isMinorDeclared false→true without guardian: ${code(flip2)} health=${String(asRec(asRec(f2.answers).health).status)} guardian=${fmt(f2.guardianConsent)}`);
    if (left2) finding({ id: "D-MINOR-FLIP-2", sev: "MAJOR", status: "REPRODUCED", title: "same via isMinorDeclared false→true", observed: `ok; health PROVIDED/SELF; guardianConsent null`, expected: "GUARDIAN_REQUIRED or drop health" });

    // ── ผู้ปกครองเปลี่ยนชื่อทับบันทึกความยินยอมสุขภาพ ──
    const tg = (await L.issue(BM.pax[2])).token;
    val(await C("submitPassengerForm", pctx(), { token: tg, idempotencyKey: `d${hex(6)}`, expectedRev: 0, fields: L.fullPD({ dob: "2014-01-01" }), guardian: { name: "Guardian Alpha", relation: "PARENT" }, health: { consent, allergies: "egg" } }), "minor G1");
    const g0 = asRec((await L.pax(BM.pax[2])).guardianConsent);
    const rr = await C("submitPassengerForm", pctx(), { token: tg, idempotencyKey: `d${hex(6)}`, expectedRev: 1, guardian: { name: "Guardian Beta", relation: "LEGAL_GUARDIAN" } });
    const g1 = asRec((await L.pax(BM.pax[2])).guardianConsent);
    const tplPD = await L.curTemplateHash("PD");
    const sw = await C("signPassengerWaiver", pctx(), { token: tg, idempotencyKey: `w${hex(6)}`, templateHash: tplPD, locale: "th", accept: true, signerName: "Gamma", signerRole: "GUARDIAN", guardian: { name: "Guardian Gamma", relation: "PARENT" } });
    const g2 = asRec((await L.pax(BM.pax[2])).guardianConsent);
    opn("D.guardian", 3);
    const over = rr.ok === true && String(g1.name) === "Guardian Beta" && asArr(g1.scopes).length >= 0 && JSON.stringify(g1.scopes).includes("HEALTH") && String(g0.name) === "Guardian Alpha";
    check("D3-guardian-overwrite", !over, `G1=${fmt(g0)} → after guardian-only submit: ${code(rr)} ${fmt(g1)} → after waiver by Gamma: ${code(sw)} ${fmt(g2)}`);
    if (over) finding({ id: "D-GUARDIAN-OVERWRITE", sev: "MAJOR", status: "REPRODUCED", title: "health-consent evidence re-attributed: a later guardian-only submit (or a GUARDIAN waiver signature) overwrites guardianConsent.name/relation/at while keeping scope HEALTH",
      observed: `consent given by "Guardian Alpha" (scopes [HEALTH], at ${String(g0.at)}); submit {guardian:{name:"Guardian Beta"}} without health ⇒ guardianConsent = {name:"Guardian Beta", relation:LEGAL_GUARDIAN, scopes:${fmt(g1.scopes)}, at:${String(g1.at)}}; waiver ⇒ ${fmt(g2)}. No audit row records the previous guardian (consent_given audit has no name).`,
      expected: "who gave the HEALTH consent must not change unless consent is re-given (keep per-scope guardian records, or require health re-consent / refuse guardian change while scope HEALTH exists)" });

    // ── เอกสารรับทราบความเสี่ยง: อายุไม่รู้ ⇒ เซ็นเองได้ ──
    const BW = await L.mkBooking("PN", ["waiver unk"]); const tw = (await L.issue(BW.pax[0])).token;
    const tplPN = await L.curTemplateHash("PN");
    const su = await C("signPassengerWaiver", pctx(), { token: tw, idempotencyKey: `w${hex(6)}`, templateHash: tplPN, locale: "th", accept: true, signerName: "Kid Self", signerRole: "SELF" });
    const after = await C("submitPassengerForm", pctx(), { token: tw, idempotencyKey: `d${hex(6)}`, expectedRev: revOfSafe(await L.pax(BW.pax[0])), isMinorDeclared: true });
    const ov = await C("openPassengerForm", pctx(), { token: tw });
    const ws = asRec(asRec(ov.value).waiver).status;
    const ev = asRec((await L.pax(BW.pax[0])).waiverEvidence);
    opn("D.waiver", 3);
    const bad = su.ok === true && after.ok === true && ws === "SIGNED";
    check("D4-waiver-age-unknown", !bad, `PN (dob OFF): sign SELF with age unknown → ${code(su)}; then isMinorDeclared:true → ${code(after)}; waiver status=${String(ws)} signer=${fmt(ev.signer)} minor=${fmt(ev.minor)}`);
    if (bad) finding({ id: "D-WAIVER-AGE-UNKNOWN", sev: "MINOR", status: "REPRODUCED", title: "waiver accepted from signerRole SELF while age is unknown; later declaring minor keeps status SIGNED (signed by the minor)",
      observed: `product with dob OFF: signPassengerWaiver SELF ok (evidence.minor={isMinor:false,age:null}); submit isMinorDeclared:true ok; status stays SIGNED with signer.role SELF`,
      expected: "brief §3/§6.2: a minor's waiver is signed by the guardian — unknown age should be AGE_UNKNOWN (as for health) or minor declaration should flip waiver to MISSING/NEEDS_RESIGN" });

    // ── AAD: ย้ายกล่องข้ามแถว ──
    const BX = await L.mkBooking("PD", ["aad x", "aad y"]);
    const tx = (await L.issue(BX.pax[0])).token, ty = (await L.issue(BX.pax[1])).token;
    val(await C("submitPassengerForm", pctx(), { token: tx, idempotencyKey: `d${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: "AADX12345" }), health: { consent, allergies: "aadmarkx" } }), "x");
    val(await C("submitPassengerForm", pctx(), { token: ty, idempotencyKey: `d${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: "AADY99999" }), health: { consent, allergies: "aadmarky" } }), "y");
    const okx = await C("revealPassengerData", staff(), { passengerId: BX.pax[0], what: "HEALTH", purpose: "SAFETY" });
    await q(`UPDATE "TripPassenger" y SET answers = jsonb_set(y.answers, '{health}', x.answers->'health'), "docNumberEnc" = x."docNumberEnc" FROM "TripPassenger" x WHERE x.id = $1 AND y.id = $2 AND y."tenantId" = $3`, [BX.pax[0], BX.pax[1], tA]);
    const ry = await C("revealPassengerData", staff(), { passengerId: BX.pax[1], what: "HEALTH", purpose: "SAFETY" });
    const rd = await C("revealPassengerData", staff(), { passengerId: BX.pax[1], what: "DOC_NUMBER", purpose: "MANIFEST" });
    const ex = await C("exportPassengerData", staff(), { passengerId: BX.pax[1], purpose: "PDPA_REQUEST" });
    const lst = await C("getTripPassengers", staff("oa", { unit: uA }), { bookingId: BX.bookingId });
    opn("D.aad", 5);
    check("D5-aad", JSON.stringify(okx).includes("aadmarkx") && !JSON.stringify(ry).includes("aadmarkx") && !JSON.stringify(rd).includes("AADX12345") && !JSON.stringify(ex).includes("aadmarkx") && !JSON.stringify(lst).includes("AADX12345"),
      `control=${code(okx)} swapped health=${code(ry)} doc=${code(rd)} export=${code(ex)}`);
    // cross-tenant copy
    const BBx = await L.mkBooking("PB", ["aad b"]);
    await q(`UPDATE "TripPassenger" y SET answers = jsonb_set(y.answers, '{health}', x.answers->'health') || '{"rev":0}'::jsonb FROM "TripPassenger" x WHERE x.id = $1 AND y.id = $2 AND y."tenantId" = $3`, [BX.pax[0], BBx.pax[0], tB]);
    const rb = await C("revealPassengerData", staff("ob"), { passengerId: BBx.pax[0], what: "HEALTH", purpose: "SAFETY" });
    check("D5-aad-tenant", !JSON.stringify(rb).includes("aadmarkx"), `tenant B with copied box → ${code(rb)}`);

    // ── ถอน: กล่อง + MEDICAL หาย (DB + ที่เก็บ) ──
    const md = val(await C("uploadPassengerDocument", pctx(), { token: tx, idempotencyKey: `m${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "med");
    const fid = String((await L.docRow(String(md.documentId)))?.fileId);
    const path = (await q<{ path: string }>(`SELECT path FROM "FileAsset" WHERE id = $1`, [fid]))[0]?.path ?? "";
    const had = STORE.has(path);
    val(await C("withdrawHealthConsentStaff", staff("se"), { passengerId: BX.pax[0], idempotencyKey: `w${hex(6)}`, mode: "EXECUTE" }, DEPS), "withdraw by se (edit only)");
    const xr = await L.pax(BX.pax[0]); const dr = await L.docRow(String(md.documentId));
    const faN = (await q(`SELECT 1 FROM "FileAsset" WHERE id = $1`, [fid])).length;
    check("D6-withdraw", had && !STORE.has(path) && faN === 0 && dr?.deletedAt !== null && asRec(asRec(xr.answers).health).status === "WITHDRAWN" && !JSON.stringify(xr.answers).includes("box"),
      `store before=${had} after=${STORE.has(path)} FileAsset=${faN} doc.deletedAt=${String(dr?.deletedAt)} health=${String(asRec(asRec(xr.answers).health).status)}`);
  }

  // ═══════════ H. สิทธิ์ / แยกร้าน ═══════════
  console.log("\n── H: permissions / isolation ──");
  {
    const BH = await L.mkBooking("PD", ["perm one"]); const th = (await L.issue(BH.pax[0])).token;
    val(await C("submitPassengerForm", pctx(), { token: th, idempotencyKey: `h${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: "PERM12345" }), health: { consent, allergies: "permalg" } }), "h");
    const med = val(await C("uploadPassengerDocument", pctx(), { token: th, idempotencyKey: `m${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "med").documentId;
    const pass = val(await C("uploadPassengerDocument", pctx(), { token: th, idempotencyKey: `m${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS), "pass").documentId;
    const pid = BH.pax[0];
    const req = val(await C("recordPdpaRequest", staff(), { kind: "ACCESS", passengerId: pid, idempotencyKey: `r${hex(6)}` }), "req").requestId;
    const calls: [string, L.Rec][] = [
      ["getTripPassengers", { bookingId: BH.bookingId }], ["ensurePassengerSlots", { bookingId: BH.bookingId }], ["updateTripPassenger", { passengerId: pid, expectedRev: 1, idempotencyKey: `h${hex(6)}`, fields: { finSize: "M" } }],
      ["setPassengerFormStatus", { passengerId: pid, expectedRev: 1, status: "VERIFIED" }], ["issuePassengerFormLink", { passengerId: pid }], ["issueBookingFormLinks", { bookingId: BH.bookingId }], ["revokePassengerFormLink", { passengerId: pid }],
      ["recordWitnessedWaiver", { passengerId: pid, idempotencyKey: `h${hex(6)}`, templateHash: "0".repeat(64), locale: "th", signerName: "x", signerRole: "SELF" }],
      ["uploadPassengerDocumentStaff", { passengerId: pid, idempotencyKey: `h${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }],
      ["passengerDocumentUrl", { documentId: pass, purpose: "CHECKIN" }], ["revealPassengerData", { passengerId: pid, what: "DOC_NUMBER", purpose: "MANIFEST" }], ["revealPassengerData", { passengerId: pid, what: "HEALTH", purpose: "SAFETY" }],
      ["withdrawHealthConsentStaff", { passengerId: pid, idempotencyKey: `h${hex(6)}`, mode: "PREVIEW" }], ["exportPassengerData", { passengerId: pid, purpose: "PDPA_REQUEST" }],
      ["recordPdpaRequest", { kind: "ACCESS", passengerId: pid, idempotencyKey: `h${hex(6)}` }], ["listPdpaRequests", {}], ["resolvePdpaRequest", { requestId: req, expectedStatus: "RECEIVED", decision: "IN_PROGRESS" }],
    ];
    const outsiders: [string, L.Rec, string[]][] = [
      ["tenantB-ctxB", staff("ob"), ["NOT_FOUND", "FORBIDDEN"]],
      ["tenantB-actor-ctxA", { ...staff("ob"), tenantId: tA, unitId: uA }, ["NOT_FOUND"]],
      ["unit2-only-ctxA", staff("shu2", { unit: uA }), ["NOT_FOUND"]],
      ["unit2-only-ctxU2", staff("shu2", { unit: uA2 }), ["NOT_FOUND", "FORBIDDEN"]],
      ["pending-member", staff("pend"), ["NOT_FOUND"]],
      ["public", { ...staff(), actor: { kind: "PUBLIC" } }, ["FORBIDDEN", "VALIDATION"]],
      ["agent", { ...staff(), actor: { kind: "AGENT", agentId: "x", userId: "y" } }, ["FORBIDDEN", "VALIDATION"]],
      ["system", { ...staff(), actor: { kind: "SYSTEM" } }, ["FORBIDDEN", "VALIDATION"]],
    ];
    const leaksH: string[] = [];
    for (const [tag, ctx, allowed] of outsiders) for (const [fnName, input] of calls) {
      const extra = ["uploadPassengerDocumentStaff", "recordWitnessedWaiver", "withdrawHealthConsentStaff", "resolvePdpaRequest"].includes(fnName) ? [DEPS] : [];
      const r = await call(fnName, ctx, input, ...extra); opn("H.iso");
      const empty = r.ok === true && fnName === "listPdpaRequests" && asArr(asRec(r.value).items).length === 0;
      const emptyLinks = r.ok === true && fnName === "issueBookingFormLinks" && asArr(asRec(r.value).links).length === 0;
      if (!(allowed.includes(String(r.code)) || empty || emptyLinks)) leaksH.push(`${tag}:${fnName}→${code(r)}`);
    }
    check("H1-isolation", leaksH.length === 0, `outsider calls not refused: ${leaksH.slice(0, 12).join(" · ")}`);
    if (leaksH.length) finding({ id: "H-ISO", sev: "BLOCKER", status: "REPRODUCED", title: "outsider got through", observed: leaksH.join(" · "), expected: "NOT_FOUND/FORBIDDEN" });
    // ระดับสิทธิ์แคบ
    const narrow: [string, string, L.Rec, string][] = [
      ["mg", "revealPassengerData", { passengerId: pid, what: "DOC_NUMBER", purpose: "MANIFEST" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["mg", "revealPassengerData", { passengerId: pid, what: "HEALTH", purpose: "SAFETY" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["mgall", "revealPassengerData", { passengerId: pid, what: "HEALTH", purpose: "SAFETY" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["hstr", "revealPassengerData", { passengerId: pid, what: "HEALTH", purpose: "SAFETY" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["hstr", "revealPassengerData", { passengerId: pid, what: "DOC_NUMBER", purpose: "SAFETY" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["mg", "passengerDocumentUrl", { documentId: med, purpose: "SAFETY" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["sv", "passengerDocumentUrl", { documentId: med, purpose: "SAFETY" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["mg", "exportPassengerData", { passengerId: pid, purpose: "PDPA_REQUEST" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["pm", "exportPassengerData", { passengerId: pid, purpose: "PDPA_REQUEST" }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["se", "updateTripPassenger", { passengerId: pid, expectedRev: 1, idempotencyKey: `h${hex(6)}`, health: { declined: true } }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["se", "uploadPassengerDocumentStaff", { passengerId: pid, idempotencyKey: `h${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, "FORBIDDEN/SENSITIVE_PERMISSION"],
      ["sv", "updateTripPassenger", { passengerId: pid, expectedRev: 1, idempotencyKey: `h${hex(6)}`, fields: { finSize: "L" } }, "FORBIDDEN"],
      ["sr", "recordPdpaRequest", { kind: "ACCESS", passengerId: pid, idempotencyKey: `h${hex(6)}` }, "FORBIDDEN"],
    ];
    const nbad: string[] = [];
    for (const [who, fnName, input, want] of narrow) { const r = await call(fnName, staff(who), input, DEPS); opn("H.narrow"); if (code(r) !== want) nbad.push(`${who}:${fnName}→${code(r)} (want ${want})`); if (JSON.stringify(r).includes("permalg") || JSON.stringify(r).includes("PERM12345")) nbad.push(`${who}:${fnName} LEAKED value`); }
    check("H2-narrow", nbad.length === 0, nbad.join(" · ") || "all refused");
    // DTO for view-only: no health/full doc
    const dto = await call("getTripPassengers", staff("sv"), { bookingId: BH.bookingId });
    check("H3-dto", dto.ok === true && !JSON.stringify(dto).includes("permalg") && !JSON.stringify(dto).includes("PERM12345") && !/"box"|tokenHash|\/api\/files/.test(JSON.stringify(dto)), `sv DTO clean ${code(dto)}`);
    // mask=false unit: reveal-holder on uA2 gets full doc + audit list_unmasked; view-only does not
    const BU = await L.mkBooking("PC", ["mask off"]); const tu = (await L.issue(BU.pax[0], "oa", NOW0, uA2)).token;
    val(await C("submitPassengerForm", pctx(), { token: tu, idempotencyKey: `h${hex(6)}`, expectedRev: 0, fields: L.fullPD({ docNumber: "UNMASK1234" }) }), "u2");
    const before = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.list_unmasked' AND "targetId" = $1`, [BU.bookingId]))[0]?.n ?? 0;
    const full = await call("getTripPassengers", staff("shu2", { unit: uA2 }), { bookingId: BU.bookingId });
    const onlyView = await call("getTripPassengers", staff("mg", { unit: uA2 }), { bookingId: BU.bookingId });
    const after = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.list_unmasked' AND "targetId" = $1`, [BU.bookingId]))[0]?.n ?? 0;
    check("H4-unmasked", JSON.stringify(full).includes("UNMASK1234") && !JSON.stringify(onlyView).includes("UNMASK1234") && after - before === 1, `reveal holder sees full=${JSON.stringify(full).includes("UNMASK1234")} manager sees=${JSON.stringify(onlyView).includes("UNMASK1234")} audit +${after - before}`);
    // reveal audit count
    const ra0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.revealed' AND "targetId" = $1`, [pid]))[0]?.n ?? 0;
    for (let i = 0; i < 3; i++) await call("revealPassengerData", staff("sr"), { passengerId: pid, what: "DOC_NUMBER", purpose: "CHECKIN" });
    const ra1 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'trips.passenger.revealed' AND "targetId" = $1`, [pid]))[0]?.n ?? 0;
    check("H5-reveal-audit", ra1 - ra0 === 3, `3 reveals → +${ra1 - ra0} audit rows`);
    // witnessed waiver by staff without health for a minor / view-only staff
    const wv = await call("recordWitnessedWaiver", staff("sv"), { passengerId: pid, idempotencyKey: `h${hex(6)}`, templateHash: await L.curTemplateHash("PD"), locale: "th", signerName: "x", signerRole: "SELF" }, DEPS);
    check("H6-witness-viewonly", code(wv) === "FORBIDDEN", `view-only witnessed waiver → ${code(wv)}`);
  }

  // ═══════════ I. คำขอเจ้าของข้อมูล ═══════════
  console.log("\n── I: data-subject requests ──");
  {
    const BI = await L.mkBooking("PD", ["dsr one", "dsr two"]);
    const pid = BI.pax[0];
    const key = `r${hex(6)}`;
    const a = await C("recordPdpaRequest", staff(), { kind: "ERASE", passengerId: pid, idempotencyKey: key });
    const b = await C("recordPdpaRequest", staff(), { kind: "ERASE", passengerId: pid, idempotencyKey: key });
    const c = await C("recordPdpaRequest", staff(), { kind: "ACCESS", passengerId: pid, idempotencyKey: key });
    const d = await C("recordPdpaRequest", staff(), { kind: "ERASE", passengerId: pid, idempotencyKey: `r${hex(6)}` });
    check("I1-dup", a.ok === true && asRec(b.value).replayed === true && code(c) === "IDEMPOTENCY_CONFLICT", `same key → replay=${String(asRec(b.value).replayed)} · same key other body → ${code(c)} · other key same subject → ${code(d)} (duplicate open request ${d.ok === true ? "ACCEPTED" : "refused"})`);
    if (d.ok === true && asRec(d.value).merged !== true /* ผู้คุม 13 พ.ย.: มติ P9 — คำขอซ้ำถูกรวมกับใบเดิม */) finding({ id: "I-DUP", sev: "NOTE", status: "REPRODUCED", title: "two open ERASE requests for the same passenger are accepted with different idempotency keys", observed: "both RECEIVED", expected: "brief has no dedupe rule — note only" });
    // วันที่รับ
    const rx: [string, string][] = [["far-future", "9999-12-20"], ["future", "2030-01-01"], ["ancient", "0100-01-01"], ["1900", "1900-01-01"]];
    const dues: string[] = [];
    for (const [tag, ymd] of rx) { const r = await C("recordPdpaRequest", staff(), { kind: "ERASE", passengerId: pid, receivedAt: ymd, idempotencyKey: `r${hex(6)}` }); opn("I.date"); dues.push(`${tag}(${ymd})→${code(r)} dueAt=${String(asRec(r.value).dueAt)}`); }
    console.log("  dues", dues.join(" · "));
    const ff = dues[0];
    if (/ok/.test(ff) && /dueAt=1970|dueAt=undefined|Invalid/.test(ff)) finding({ id: "I-DATE", sev: "MINOR", status: "REPRODUCED", title: "recordPdpaRequest accepts receivedAt in the far future and computes a nonsense dueAt", observed: dues.join(" · "), expected: "receivedAt bounded (not after today in unit tz, sane lower bound) — far-future value overflows addDaysYmd (+010000-…) and purgeInstant falls back to epoch" });
    else if (dues.some((x) => /^(future|far-future)/.test(x) && x.includes("→ok"))) finding({ id: "I-DATE", sev: "MINOR", status: "REPRODUCED", title: "receivedAt in the future accepted", observed: dues.join(" · "), expected: "receivedAt ≤ today" });
    // สถานะ
    const rid1 = String(asRec(a.value).requestId);
    const s1 = await C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS);
    const s2 = await C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "RECEIVED", decision: "REJECTED" }, DEPS);
    const s3 = await C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "RECEIVED", decision: "IN_PROGRESS", reasonCode: "OTHER" }, DEPS);
    const s4 = await C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "RECEIVED", decision: "IN_PROGRESS" }, DEPS);
    const s5 = await C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "IN_PROGRESS", decision: "IN_PROGRESS" }, DEPS);
    const s6 = await C("resolvePdpaRequest", staff("ob"), { requestId: rid1, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS);
    const s7 = await C("resolvePdpaRequest", staff("oa", { unit: uA2 }), { requestId: rid1, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS);
    const s8 = await Promise.all([C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS), C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "IN_PROGRESS", decision: "REJECTED", reasonCode: "LEGAL_CLAIM" }, DEPS)]);
    const s9 = await C("resolvePdpaRequest", staff(), { requestId: rid1, expectedStatus: "DONE", decision: "IN_PROGRESS" }, DEPS);
    opn("I.state", 10);
    const st = (await q<{ s: string }>(`SELECT status AS s FROM "TripPdpaRequest" WHERE id = $1`, [rid1]))[0]?.s;
    const pr = await L.pax(pid);
    check("I2-state", code(s1).startsWith("STATE_CONFLICT") && code(s2) === "VALIDATION" && code(s3) === "VALIDATION" && s4.ok === true && code(s5).startsWith("STATE_CONFLICT") && code(s6) === "NOT_FOUND" && code(s7) === "NOT_FOUND"
      && s8.filter((x) => x.ok === true).length === 1 && code(s9).startsWith("STATE_CONFLICT"),
      `wrongExpected=${code(s1)} rejectNoReason=${code(s2)} reasonOnNonReject=${code(s3)} →IN_PROGRESS=${code(s4)} self=${code(s5)} tenantB=${code(s6)} unit2=${code(s7)} race=${s8.map(code).join("/")} afterDone=${code(s9)} final=${st} paxPurged=${JSON.stringify(asRec(pr.answers).purged ?? null)}`);
    // record with other tenant's passenger / party
    const xr = await C("recordPdpaRequest", staff(), { kind: "ACCESS", passengerId: BB.pax[0], idempotencyKey: `r${hex(6)}` });
    const xp = await C("recordPdpaRequest", staff(), { kind: "ACCESS", partyId: "nonexistent-party", idempotencyKey: `r${hex(6)}` });
    const xn = await C("recordPdpaRequest", staff(), { kind: "ACCESS", idempotencyKey: `r${hex(6)}` });
    check("I3-cross", code(xr) === "NOT_FOUND" && code(xp) === "NOT_FOUND" && code(xn) === "VALIDATION", `other-tenant pax=${code(xr)} unknown party=${code(xp)} none=${code(xn)}`);
    // ERASE ∥ submit
    const tI = (await L.issue(BI.pax[1])).token;
    const er = val(await C("recordPdpaRequest", staff(), { kind: "ERASE", passengerId: BI.pax[1], idempotencyKey: `r${hex(6)}` }), "er").requestId;
    const race = await Promise.all([
      C("resolvePdpaRequest", staff(), { requestId: er, expectedStatus: "RECEIVED", decision: "DONE" }, DEPS),
      ...Array.from({ length: 4 }, (_, i) => C("submitPassengerForm", pctx(), { token: tI, idempotencyKey: `e${i}${hex(5)}`, expectedRev: 0, fields: L.fullPD({ fullName: `Racer${i}` }) })),
      C("uploadPassengerDocument", pctx(), { token: tI, idempotencyKey: `e${hex(6)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() }, DEPS),
    ]);
    const prow = await L.pax(BI.pax[1]);
    const live = await q<{ id: string; fileId: string }>(`SELECT id, "fileId" FROM "TripDocument" WHERE "passengerId" = $1 AND "deletedAt" IS NULL`, [BI.pax[1]]);
    const assets = live.length ? (await q(`SELECT 1 FROM "FileAsset" WHERE id = ANY($1::text[])`, [live.map((x) => x.fileId)])).length : 0;
    opn("I.race", race.length);
    const purgedAll = JSON.stringify(asRec(prow.answers).purged ?? {}).includes("ALL");
    check("I4-erase-race", purgedAll && String(prow.fullName) === "" , `race codes ${race.map(code).join(",")} · row purged=${purgedAll} name=${JSON.stringify(prow.fullName)} live docs=${live.length} assets=${assets} (live docs get retainUntil=now and are removed by the next purge run)`);
    if (live.length) {
      const r = await C("runPdpaPurge", new Date(NOW0), { tenantIds: [tA], storage: { del: L.fakeDel } });
      const live2 = (await q(`SELECT 1 FROM "TripDocument" WHERE "passengerId" = $1 AND "deletedAt" IS NULL`, [BI.pax[1]])).length;
      check("I4-erase-race-job", live2 === 0, `next purge run (${code(r)}) leaves ${live2} live docs`);
    }
  }

  // ═══════════ เขตเวลา (ฟังก์ชันบริสุทธิ์) ═══════════
  console.log("\n── TZ: purgeInstant brute force ──");
  {
    const TR = await L.T();
    const purgeInstant = TR.purgeInstant as (d: string, tz: string) => Date;
    const fmtD = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const zones = ["Asia/Bangkok", "America/Santiago", "America/Havana", "America/Asuncion", "Asia/Beirut", "America/Sao_Paulo", "Pacific/Apia", "Australia/Lord_Howe", "Asia/Tehran", "America/Los_Angeles", "Europe/London", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kathmandu", "Africa/Cairo", "America/Godthab"];
    const bad: string[] = [];
    let n = 0;
    for (const tz of zones) {
      const f = fmtD(tz);
      for (let i = 0; i < 2 * 366; i++) {
        const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
        const next = new Date(Date.UTC(2026, 0, 2 + i)).toISOString().slice(0, 10);
        const t = purgeInstant(d, tz); n++;
        const at = f.format(t), before = f.format(new Date(t.getTime() - 1));
        // ต้องเป็นวินาทีแรกของวันถัดไป: ณ t = next และ t-1ms = d
        if (!(at === next && before === d)) { if (bad.length < 12) bad.push(`${tz} ${d}: got ${t.toISOString()} (local@t=${at}, @t-1ms=${before})`); else bad.push(""); }
      }
    }
    opn("TZ", n);
    check("TZ-1", bad.length === 0, `${n} (tz,day) pairs · wrong: ${bad.length} ${bad.filter(Boolean).slice(0, 12).join(" | ")}`);
    if (bad.length) {
      const early = bad.filter((b) => b && /local@t=\d{4}-\d\d-\d\d/.test(b)).filter((b) => { const m = /\(local@t=([\d-]+), @t-1ms=([\d-]+)\)/.exec(b); const d = b.split(" ")[1]; return m && m[1] <= d; });
      finding({ id: "TZ-PURGEINSTANT", sev: early.length ? "MAJOR" : "MINOR", status: "REPRODUCED", title: "purgeInstant is not the first instant of the next local day for some zones/days (DST at midnight)",
        observed: `${bad.length} of ${n} pairs wrong; ${early.length} return an instant that is still inside the due day (deletes early); samples: ${bad.filter(Boolean).slice(0, 6).join(" | ")}`, expected: "first instant whose local date is dueYmd+1 (never before end of dueYmd)" });
    }
  }
} catch (e) {
  console.log("💥", L.errMsg(e), e instanceof Error ? e.stack?.split("\n").slice(1, 6).join(" ") : "");
  finding({ id: "HARNESS", sev: "NOTE", status: "SUSPICION", title: "probe aborted", observed: L.errMsg(e), expected: "" });
} finally {
  L.summary("probe-t0.8-a");
  try { await L.cleanupTenants(W.tenantIds); await L.cleanupMisc(lvs); } catch (e) { console.log("cleanup", L.errMsg(e)); }
  await L.endPool();
  process.exit(0);
}
function revOfSafe(row: L.Rec) { return L.revOf(row); }
