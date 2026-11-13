// probe-trips-t0.8-next.mts — นักล่า T0.8: route ไฟล์กลางผ่าน Next จริง (server ของผู้คุมที่ :3241 · ไม่ build/ไม่ start server) (untracked · hunter)
// ที่เก็บ = ของจริงตาม .env.qc-trips (Bunny) — วัตถุขนาด 64 ไบต์ใต้ t/<ร้านชั่วคราว>/private/ · ลบด้วย deleteFileAsset ใน finally
// session ที่ mint ปักธง userAgent "qc-t08h-next" · ลบเฉพาะของรอบนี้ใน finally
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.8-next.mts
import { createHash, randomBytes } from "node:crypto";
import * as L from "./probe-trips-t0.8-lib.mjs";
const { W, call, code, val, staff, pctx, check, finding, q, asRec, fmt, hex, rid, NOW0, JPG, PDF, consent } = L;

const BASE = process.env.T08H_BASE ?? "http://127.0.0.1:3241";
const UA = "qc-t08h-next";
L.boot("probe-t0.8-next");
const sessionIds: string[] = [];
const ROWS: L.Rec[] = [];
let ipN = 1;

async function mint(userId: string): Promise<string> {
  const token = `t08h${randomBytes(24).toString("base64url")}`;
  const ttl = new Date(Date.now() + 30 * 60_000);
  const id = rid("ses");
  await L.insertRow("Session", { id, userId, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl, createdAt: new Date() });
  sessionIds.push(id);
  return token;
}
const cookieOf = (token: string | null, tenantId?: string) => (token ? `shark_session=${token}; __Host-shark_session=${token}${tenantId ? `; shark_tenant=${tenantId}` : ""}` : "");
async function get(tag: string, path: string, cookie = "", expect?: string): Promise<{ status: number; h: L.Rec; n: number }> {
  const headers: Record<string, string> = { "x-forwarded-for": `198.18.${(ipN >> 8) & 255}.${ipN++ & 255}` };
  if (cookie) headers.cookie = cookie;
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  const buf = new Uint8Array(await r.arrayBuffer());
  const h: L.Rec = {};
  for (const k of ["cache-control", "x-content-type-options", "content-disposition", "location", "content-type"]) h[k] = r.headers.get(k);
  const row = { tag, status: r.status, ms: Date.now() - t0, bytes: buf.length, ...h, expect: expect ?? "" };
  ROWS.push(row);
  console.log(`  · ${tag.padEnd(46)} ${r.status} cc=${String(h["cache-control"])} nosniff=${String(h["x-content-type-options"])} cd=${String(h["content-disposition"]).slice(0, 30)} loc=${String(h.location)} ${buf.length}B`);
  if (h["cache-control"] !== "private, no-store") finding({ id: `NX-CC-${tag}`, sev: "MAJOR", status: "REPRODUCED", title: "response without private,no-store", observed: fmt(row), expected: "private, no-store" });
  return { status: r.status, h, n: buf.length };
}
const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");

try {
  // server ต้องตอบก่อนทำอะไร
  const ping = await fetch(`${BASE}/api/files/abcdefghijklmnop1234`).then((r) => r.status).catch(() => -1);
  if (ping < 0) throw new Error(`server ${BASE} not reachable`);
  console.log("storage provider configured:", process.env.STORAGE_PROVIDER ?? "(unset)", "· bunny vars set:", Boolean(process.env.SHARK_BUNNY_ZONE && process.env.SHARK_BUNNY_KEY && process.env.SHARK_BUNNY_CDN));
  await L.sweepStale();
  await L.cleanupMisc();
  await q(`DELETE FROM "Session" WHERE "userAgent" = $1 AND "expiresAt" < now()`, [UA]);
  await L.setupWorld();
  const { tA, tB, uA } = W;
  // ผู้ใช้เพิ่ม: STAFF ไม่มีสิทธิ์ trips ใด ๆ (ร้าน A) · STAFF ร้าน B
  for (const [tag, t, perms] of [["snone", tA, {}], ["sbv", tB, { "trips.passenger.view": true, "trips.passenger.health": true }]] as const) {
    const id = rid(`u${tag}`);
    await L.insertRow("User", { id, email: `trips-t08h-${tag}-${L.STAMP}@shark.local`, name: tag, updatedAt: new Date() });
    await L.insertRow("Membership", { id: rid(`m${tag}`), userId: id, tenantId: t, role: "STAFF", unitAccess: JSON.stringify(["*"]), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
    W.U[tag] = { role: "STAFF", unitAccess: ["*"], permissions: perms, userId: id };
  }
  const ck = {
    sh: cookieOf(await mint(String(W.U.sh.userId)), tA), // view+edit+health
    sv: cookieOf(await mint(String(W.U.sv.userId)), tA), // view only (no health)
    snone: cookieOf(await mint(String(W.U.snone.userId)), tA), // no trips perms
    sbv: cookieOf(await mint(String(W.U.sbv.userId)), tB), // tenant B
  };

  // ── ข้อมูล: การจอง B1 (P1 P2) · B2 · ร้าน B · ไฟล์จริงในที่เก็บ ──
  const B1 = await L.mkBooking("PD", ["N1 one", "N1 two"]);
  const B2 = await L.mkBooking("PD", ["N2 one"]);
  const BB = await L.mkBooking("PB", ["NB one"]);
  const [P1, P2] = B1.pax;
  let t1 = (await L.issue(P1)).token; const t2 = (await L.issue(P2)).token; const tb2 = (await L.issue(B2.pax[0])).token; const tbb = (await L.issue(BB.pax[0], "ob")).token;
  val(await call("submitPassengerForm", pctx(), { token: t1, idempotencyKey: `n${hex(6)}`, expectedRev: 0, fields: L.fullPD(), health: { consent, conditions: "next" } }), "health");
  const up = async (token: string, kind: string, ct = "image/jpeg", data = JPG()) => String(val(await call("uploadPassengerDocument", pctx(), { token, idempotencyKey: `f${hex(6)}`, kind, contentType: ct, data }), `upload ${kind}`).documentId);
  const dP1 = await up(t1, "PASSPORT"); const dP1m = await up(t1, "MEDICAL", "application/pdf", PDF());
  const dP2 = await up(t2, "PASSPORT"); const dB2 = await up(tb2, "PASSPORT"); const dBB = await up(tbb, "PASSPORT");
  const STO = asRec(await import("@/lib/storage/service"));
  const PL = asRec(await import("@/lib/storage/private-links"));
  const nonTrips = asRec(await (STO.uploadFile as L.Fn)({ tenantId: tA }, { kind: "ATTACHMENT", filename: "crm.jpg", contentType: "image/jpeg", data: JPG(), visibility: "private" }));
  check("PC-upload", nonTrips.ok === true, `real storage upload of a non-trips private file: ${fmt(nonTrips)}`);
  const fileOf = async (d: string) => String((await L.docRow(d))?.fileId ?? "");
  const staffUrl = (fileId: string, userId: string) => pathOf(String((PL.privateFileUrl as (f: string, v: L.Rec, t: number) => string)(fileId, { kind: "STAFF", id: userId }, 300)));
  const custUrl = async (token: string, documentId: string) => { const r = await call("customerDocumentUrl", pctx(), { token, documentId, purpose: "CUSTOMER_SELF" }); return { r, url: r.ok === true ? pathOf(String(asRec(r.value).url)) : "" }; };

  // ═══ 1. ตัวควบคุมบวก / การจำแนก ═══
  console.log("\n── 1. classification (positive controls) ──");
  const pcStaff = await get("PC staff(sh) non-trips file STAFF-signed", staffUrl(String(nonTrips.assetId), String(W.U.sh.userId)), ck.sh, "200");
  const pcMissing = await get("PC staff(sh) STAFF-signed, object missing", staffUrl(await (async () => { const fid = rid("fa").replace(/[^a-z0-9]/g, "").slice(0, 25); await L.insertRow("FileAsset", { id: fid, tenantId: tA, kind: "ATTACHMENT", path: `t/${tA}/private/${randomBytes(20).toString("hex")}.jpg`, cdnUrl: "private://x", contentType: "image/jpeg", bytes: 64 }); return fid; })(), String(W.U.sh.userId)), ck.sh, "404 storage");
  const pcNoCookie = await get("PC same STAFF URL, no cookie", staffUrl(String(nonTrips.assetId), String(W.U.sh.userId)), "", "403");
  const classOk = pcStaff.status === 200 && pcStaff.n > 0 && pcNoCookie.status === 403;
  check("PC-classify", classOk, `real object + valid cookie → ${pcStaff.status} (${pcStaff.n}B); missing object → ${pcMissing.status}; no cookie → ${pcNoCookie.status}`);

  // ═══ 2a. ฐาน ═══
  console.log("\n── 2a. baseline ──");
  const a0 = await get("a no cookie, no params", `/api/files/${await fileOf(dP1)}`, "", "403");
  const a1 = await get("a no cookie, junk sig", `/api/files/${await fileOf(dP1)}?exp=1&sig=${"0".repeat(64)}`, "", "403");
  check("NX-a", a0.status === 403 && a1.status === 403, `${a0.status} ${a1.status}`);

  // ═══ 2b. พนักงาน ═══
  console.log("\n── 2b. staff ──");
  const su = async (who: string, d: string) => { const r = await call("passengerDocumentUrl", staff(who), { documentId: d, purpose: "CHECKIN" }); return { r, url: r.ok === true ? pathOf(String(asRec(r.value).url)) : "" }; };
  const b1 = await su("sh", dP1); const rb1 = b1.url ? await get("b sh(perm) own trips PASSPORT", b1.url, ck.sh, "200") : null;
  const b2 = await su("sh", dP1m); const rb2 = b2.url ? await get("b sh(health) MEDICAL", b2.url, ck.sh, "200") : null;
  const b3 = await su("sv", dP1m); const b3p = await su("sv", dP1); const rb3p = b3p.url ? await get("b sv(view,no health) PASSPORT", b3p.url, ck.sv, "200") : null;
  const b4 = await su("snone", dP1);
  const rb5 = b1.url ? await get("b sh's URL replayed with snone cookie", b1.url, ck.snone, "403") : null;
  const rb6 = b1.url ? await get("b sh's URL replayed with tenant-B cookie", b1.url, ck.sbv, "403") : null;
  const rb7 = await get("b tenant-B user, self-signed URL for A file", staffUrl(await fileOf(dP1), String(W.U.sbv.userId)), ck.sbv, "404");
  const rb8 = await get("b snone, self-signed URL (route has no perm check)", staffUrl(await fileOf(dP1m), String(W.U.snone.userId)), ck.snone, "200 by design");
  const b9 = await call("passengerDocumentUrl", staff("sbv", { tenant: tB, unit: W.uB }), { documentId: dP1, purpose: "CHECKIN" });
  check("NX-b", rb1?.status === 200 && rb2?.status === 200 && code(b3.r) === "FORBIDDEN/SENSITIVE_PERMISSION" && rb3p?.status === 200 && code(b4.r) === "FORBIDDEN" && rb5?.status === 403 && rb6?.status === 403 && rb7.status === 404 && code(b9) === "NOT_FOUND",
    `sh PASSPORT=${rb1?.status} sh MEDICAL=${rb2?.status} sv MEDICAL svc=${code(b3.r)} sv PASSPORT=${rb3p?.status} snone svc=${code(b4.r)} replay snone=${rb5?.status} replay B=${rb6?.status} B self-signed=${rb7.status} B svc=${code(b9)} | snone self-signed MEDICAL=${rb8.status} (only reachable if the signing key leaks; route by design trusts the issuer)`);

  // ═══ 2c. ผู้ถือลิงก์ (ไม่มีคุกกี้) ═══
  console.log("\n── 2c. link viewer ──");
  const c1 = await custUrl(t1, dP1);
  const rc1 = c1.url ? await get("c P1 own PASSPORT", c1.url, "", "200") : null;
  const lv1 = new URL(`http://x${c1.url}`).searchParams.get("lv") ?? "";
  const c2 = await custUrl(t1, dP2); const c3 = await custUrl(t1, dP1m);
  const rcP2 = await get("c lv(P1) on P2 file (minted sig)", L.linkUrl(await fileOf(dP2), lv1), "", "404");
  const rcMed = await get("c lv(P1) on own MEDICAL (minted sig)", L.linkUrl(await fileOf(dP1m), lv1), "", "404");
  const rcB2 = await get("c lv(P1) on other booking file", L.linkUrl(await fileOf(dB2), lv1), "", "404");
  const rcBB = await get("c lv(P1) on tenant-B file", L.linkUrl(await fileOf(dBB), lv1), "", "404");
  const rcNT = await get("c lv(P1) on non-trips file", L.linkUrl(String(nonTrips.assetId), lv1), "", "404");
  const u = new URL(`http://x${c1.url}`); const sig = String(u.searchParams.get("sig")); const exp = String(u.searchParams.get("exp"));
  const rcSig = await get("c tampered sig", c1.url.replace(sig, `${sig.slice(0, -1)}${sig.endsWith("a") ? "b" : "a"}`), "", "403");
  const rcExp = await get("c tampered exp", c1.url.replace(`exp=${exp}`, `exp=${Number(exp) + 5}`), "", "403");
  const rcPast = await get("c expired signature", (() => { const f = new URL(`http://x${c1.url}`).pathname.split("/").pop() ?? ""; const e = Math.floor(Date.now() / 1000) - 2; return `/api/files/${f}?exp=${e}&sig=${L.mintSig(f, e, `LINK_CUSTOMER:${lv1}`)}&lv=${lv1}`; })(), "", "403");
  check("NX-c1", rc1?.status === 200 && code(c2.r) === "NOT_FOUND" && code(c3.r) === "FORBIDDEN/OTP_REQUIRED" && [rcP2, rcMed, rcB2, rcBB, rcNT].every((x) => x.status === 404) && rcSig.status === 403 && rcExp.status === 403 && rcPast.status === 403,
    `own=${rc1?.status} svc P2=${code(c2.r)} svc MED=${code(c3.r)} route P2/MED/B2/BB/nonTrips=${[rcP2, rcMed, rcB2, rcBB, rcNT].map((x) => x.status).join("/")} sig=${rcSig.status} exp=${rcExp.status} past=${rcPast.status}`);

  // ═══ 2d. ลำดับความสำคัญ คุกกี้ × ลิงก์ ═══
  console.log("\n── 2d. precedence ──");
  const d1 = await get("d snone cookie + valid lv URL (P1 own)", c1.url, ck.snone, "200 = link alone");
  const d2 = await get("d tenant-B cookie + valid lv URL (A)", c1.url, ck.sbv, "200 = link alone");
  const d3 = await get("d snone cookie + lv(P1) minted for MEDICAL", L.linkUrl(await fileOf(dP1m), lv1), ck.snone, "404");
  const d4 = await get("d sh(health) cookie + lv(P1) minted for MEDICAL", L.linkUrl(await fileOf(dP1m), lv1), ck.sh, "404 (cookie must not upgrade link)");
  const d5 = await get("d sh cookie + lv(P1) minted for P2 file", L.linkUrl(await fileOf(dP2), lv1), ck.sh, "404");
  const lvB = await L.lastIssued(BB.pax[0]);
  const d6 = b1.url ? await get("d sh STAFF URL + foreign lv(tenant B) appended", `${b1.url}&lv=${lvB}`, ck.sh, "200 = staff path") : null;
  const d7 = b1.url ? await get("d sh STAFF URL + garbage lv appended", `${b1.url}&lv=zzzzzzzzzzzzzzzzzzzzzzzz`, ck.sh, "200") : null;
  const d8 = await get("d tenant-B cookie + lv(B) minted for A file", L.linkUrl(await fileOf(dP1), lvB), ck.sbv, "404");
  const d9 = b1.url ? await get("d snone cookie + sh STAFF URL + valid lv param", `${b1.url}&lv=${lv1}`, ck.snone, "403 (lv must not upgrade a cookie)") : null;
  const d10 = await get("d tenant-B cookie + lv(P1) minted P1 PASSPORT", L.linkUrl(await fileOf(dP1), lv1), ck.sbv, "200 = link alone");
  check("NX-d", d1.status === 200 && d2.status === 200 && d3.status === 404 && d4.status === 404 && d5.status === 404 && d6?.status === 200 && d7?.status === 200 && d8.status === 404 && d9?.status === 403 && d10.status === 200,
    `snone+lv=${d1.status} B+lv=${d2.status} snone+lvMED=${d3.status} sh+lvMED=${d4.status} sh+lvP2=${d5.status} staffURL+foreignLv=${d6?.status} staffURL+garbageLv=${d7?.status} B+lvB→A=${d8.status} snone+staffURL+lv=${d9?.status} B+lvP1=${d10.status}`);

  // ═══ 2c ต่อ: เพิกถอน / ออกใหม่ / ทริปจบ ═══
  console.log("\n── 2c lifecycle ──");
  val(await call("revokePassengerFormLink", staff(), { passengerId: P1 }), "revoke");
  const l1 = await get("c after revoke (old URL)", c1.url, "", "404");
  const l1c = await get("c after revoke + sh cookie (old URL)", c1.url, ck.sh, "404");
  t1 = (await L.issue(P1)).token;
  const l2 = await get("c after reissue (old URL)", c1.url, "", "404");
  const c4 = await custUrl(t1, dP1); const l3 = c4.url ? await get("c new link URL", c4.url, "", "200") : null;
  t1 = (await L.issue(P1)).token;
  const l4 = c4.url ? await get("c 2nd reissue (previous new URL)", c4.url, "", "404") : null;
  const c5 = await custUrl(t1, dP1);
  const dep = (await q<{ s: Date; e: Date; c: Date }>(`SELECT "startsAt" AS s, "endsAt" AS e, "cutoffAt" AS c FROM "TripDeparture" WHERE id = $1`, [B1.dep]))[0]!;
  await q(`UPDATE "TripDeparture" SET "startsAt" = '2025-12-31T20:00:00Z', "cutoffAt" = '2025-12-31T20:00:00Z', "endsAt" = '2026-01-01T00:00:00Z' WHERE id = $1 AND "tenantId" = $2`, [B1.dep, tA]);
  const l5 = c5.url ? await get("c trip ended (expired link)", c5.url, "", "404") : null;
  await q(`UPDATE "TripDeparture" SET "startsAt" = $3, "cutoffAt" = $4, "endsAt" = $5 WHERE id = $1 AND "tenantId" = $2`, [B1.dep, tA, dep.s, dep.c, dep.e]);
  const l6 = c5.url ? await get("c trip restored", c5.url, "", "200") : null;
  check("NX-c2", l1.status === 404 && l1c.status === 404 && l2.status === 404 && l3?.status === 200 && l4?.status === 404 && l5?.status === 404 && l6?.status === 200,
    `revoked=${l1.status} revoked+cookie=${l1c.status} reissued old=${l2.status} new=${l3?.status} 2nd reissue=${l4?.status} tripEnded=${l5?.status} restored=${l6?.status}`);

  // ═══ 2e. ผู้ดูเดิม (ก่อน T0.8) ═══
  console.log("\n── 2e. pre-T0.8 viewer ──");
  const e1 = await get("e STAFF non-trips file (as CR-era)", staffUrl(String(nonTrips.assetId), String(W.U.snone.userId)), ck.snone, "200");
  const e2 = await get("e STAFF non-trips + junk lv param", `${staffUrl(String(nonTrips.assetId), String(W.U.snone.userId))}&lv=zzzzzzzzzzzzzzzzzzzz`, ck.snone, "200");
  const e3 = await get("e STAFF tenant-B cookie own-signed, A file", staffUrl(String(nonTrips.assetId), String(W.U.sbv.userId)), ck.sbv, "404");
  const e4 = await get("e STAFF URL id path-like", `/api/files/..%2Fx?exp=1&sig=00`, ck.snone, "404");
  const e5 = await get("e STAFF URL junk sig", `/api/files/${String(nonTrips.assetId)}?exp=1&sig=${"0".repeat(64)}`, ck.snone, "403");
  check("NX-e", e1.status === 200 && e2.status === 200 && e3.status === 404 && e4.status === 404 && e5.status === 403, `member=${e1.status} +junkLv=${e2.status} otherTenant=${e3.status} pathlike=${e4.status} junkSig=${e5.status} (old route 4026db504: 200/200/404/404/403 by reading — lv ignored)`);

  // ═══ 2f. ถังอัตราของ lv ที่ตรวจไม่ได้ ═══
  console.log("\n── 2f. rate rows ──");
  const garbage = Array.from({ length: 20 }, () => `t08hg${hex(8)}`);
  const cnt = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [garbage.map((g) => `files:private:LINK_CUSTOMER:${g}`)]))[0]?.n ?? -1;
  const allLink = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE 'files:private:LINK_CUSTOMER:%'`))[0]?.n ?? -1;
  const before = await cnt(), beforeAll = await allLink();
  const st: number[] = [];
  const f0 = await fileOf(dP1);
  for (const g of garbage) st.push((await fetch(`${BASE}/api/files/${f0}?exp=${Math.floor(Date.now() / 1000) + 100}&sig=${"ab".repeat(32)}&lv=${g}`, { headers: { "x-forwarded-for": "198.18.250.1" } })).status);
  const after = await cnt(), afterAll = await allLink();
  check("NX-f", after - before === 0 && st.every((s) => s === 403 || s === 404), `20 garbage lv: statuses ${[...new Set(st)].join(",")} · rows for these lv ${before}→${after} · all LINK_CUSTOMER rows ${beforeAll}→${afterAll}`);

  // ═══ 3. server actions ═══
  console.log("\n── 3. server actions: skipped (no script in repo POSTs Next-Action without a browser) ──");
  void NOW0; void uA; void PDF;
} catch (e) {
  console.log("💥", L.errMsg(e), e instanceof Error ? e.stack?.split("\n").slice(1, 5).join(" ") : "");
  finding({ id: "HARNESS-NX", sev: "NOTE", status: "SUSPICION", title: "probe aborted", observed: L.errMsg(e), expected: "" });
} finally {
  console.log("ROWS_JSON", JSON.stringify(ROWS));
  L.summary("probe-t0.8-next");
  try {
    // วัตถุจริงในที่เก็บ: ลบทุกแถว FileAsset ของร้านชั่วคราวผ่าน deleteFileAsset ก่อนลบร้าน
    const STO = asRec(await import("@/lib/storage/service"));
    const fas = await q<{ id: string; tenantId: string }>(`SELECT id, "tenantId" FROM "FileAsset" WHERE "tenantId" = ANY($1::text[])`, [W.tenantIds]);
    let okN = 0;
    for (const f of fas) { const r = asRec(await (STO.deleteFileAsset as L.Fn)({ tenantId: f.tenantId }, f.id)); if (r.ok === true) okN++; }
    console.log(`🧹 storage objects deleted ${okN}/${fas.length}`);
    if (sessionIds.length) await q(`DELETE FROM "Session" WHERE id = ANY($1::text[])`, [sessionIds]);
    await L.cleanupTenants(W.tenantIds);
    await L.cleanupMisc();
  } catch (e) { console.log("cleanup", L.errMsg(e)); }
  await L.endPool();
  process.exit(0);
}
