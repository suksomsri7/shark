// qc-hr-h4.5-fix-lib.mts — ORACLE-EDIT (H4.5 fix round · controller ruling) — checks added after review + hunt (ledger/wo-notes/hr-H4.5-review.md · hr-H4.5-hunt.md)
//   A relation + drift · D1 links end with the account/membership change (same tx) · D2 use-time validity · D3 re-hire · E event switch at send ·
//   F OFF/DIGEST-off ⇒ SKIPPED(OFF) + digest day window · G tenant not ACTIVE · H claim re-check before push · I plan failure ⇒ event retry · J in-app note on replace/unlink
//   ports hunter probes P1b (F1) · P4b (F2) · P4a (F3) · P5 (F4) · LINE = the oracle's fake only · oracle-owned, no product code
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Any, ROOT, canon, short, errText, failedKeys } from "./qc-hr-lib.mjs";

export const CHECKS_FIX = `
F1.1|A|C|R|[static] HrLineLink.employee relation (onDelete Restrict) + HrEmployee back-relation · migration has the digestOf index · DB index present
F1.2|A|C|R|[run] prisma migrate diff (DB → schema) mentions neither HrLineLink nor HrNotice (other tickets' drift ignored)
F2.1|D1|C|R|[db] staff revoke (membership off + linkedUserId cleared) ends the employee's ACTIVE link (ACCOUNT) in the same call · no send needed
F2.2|D1|C|R|[db] staff grant to a new account ends a link issued for another user (ACCOUNT)
F2.3|D2 hunt-F1|C|R|[db] employee row re-linked to another account (no hook) ⇒ new account sees no ACTIVE/no LINE name · admin chip not ACTIVE · old LINE gets notLinked · link ENDED/ACCOUNT
F2.4|D2|C|R|[db] membership removed (no hook) ⇒ chip not ACTIVE · hr.menu notLinked · link ENDED/ACCOUNT
F2.5|D3|C|R|[db] re-hire / account back ⇒ the old link stays ENDED · status not ACTIVE
F3.1|E hunt-F2|C|R|[db] FAILED roster notice · ROSTER switched off · job retry ⇒ 0 pushes · SKIPPED/OFF
F3.2|F hunt-F3|C|R|[db] DIGEST HELD · LINE switched off ⇒ SKIPPED/OFF at save · job 0 pushes · re-enabled +41 d ⇒ 0 pushes
F3.3|F|C|R|[db] digest = own day window: a 3-day-old HELD row is not counted (digest "1") and ends SKIPPED
F3.4|G hunt-F4|C|R|[db] tenant SUSPENDED ⇒ retry 0 pushes (SKIPPED/TENANT) · hr.menu gets no answer
F3.5|H|C|R|[db] claim lost before the push (lease re-taken) ⇒ sender pushes nothing and leaves the row to its new owner · job budget checked before digests
F3.6|I|C|R|[db] planHrNotices failing ⇒ consumer throws (event retried) · retry ⇒ 1 notice + 1 in-app
F3.8|r2 mi-1|C|R|[db] claim made by a run whose \`now\` is 10 min old still holds a fresh lease (wall clock) ⇒ not re-claimable now · an expired lease is re-claimable
F3.9|r2 mi-2|C|R|[db] planHrNotices in bounded chunks (seam chunk=2): failure in chunk 2 keeps chunk 1 · retry ⇒ exactly one notice + one in-app per recipient
F4.1|gate|C|R|[db] ORACLE-EDIT (H4.5 gate fix · controller ruling): paid ⇒ SLIP HELD (digest) · hr.payroll.reversed ⇒ SKIPPED/REVERSED · 0 slip pushes · digest counts only the roster notice ("1")
F4.2|gate|C|R|[db] ORACLE-EDIT (H4.5 gate fix · controller ruling): paid ⇒ SLIP SENT · reversed ⇒ row unchanged · no extra push
F4.3|gate|C|R|[db] ORACLE-EDIT (H4.5 gate fix · controller ruling): reversed replayed ⇒ ok · nothing changes · no push
F4.4|gate|C|R|[db] ORACLE-EDIT (H4.5 gate fix · controller ruling): SLIP claimed but not yet pushed · reversed ⇒ sender pushes nothing · SKIPPED/REVERSED
Z2|ruling 9|C|R|[db] a QC tenant deleted the way qc-hr-lib does (cleanupFx) leaves 0 HrNotice / HrLineLink rows (no Tenant FK · explicit cleanup) · RESIDUE sees them
F3.7|J|C|R|[db] re-link · admin unlink · LINE unlink ⇒ +1 in-app "บัญชี LINE ที่เชื่อมไว้ถูกเปลี่ยน/ยกเลิก" each · no LINE name in bodies
`;
export const CHANGED_NOTE = "บัญชี LINE ที่เชื่อมไว้ถูกเปลี่ยน/ยกเลิก";

const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");

export function runFixStatic(g: { ck: (id: string, r: Record<string, unknown>, exp: string, extra?: string) => boolean }): void {
  const s = rd("prisma/schema/hr.prisma");
  const blk = (m: string) => {
    const i = s.indexOf(`model ${m} {`);
    return i < 0 ? "" : s.slice(i, s.indexOf("\n}", i));
  };
  const mig = rd("prisma/migrations/20270111000000_hr_line_link/migration.sql");
  g.ck("F1.1", {
    rel: /\n\s*employee\s+HrEmployee\s+@relation\(fields:\s*\[employeeId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/.test(blk("HrLineLink")),
    back: /\n\s*\w+\s+HrLineLink\[\]/.test(blk("HrEmployee")),
    idx: /INDEX[^;]*"HrNotice"[^;]*\("digestOf"\)/.test(mig),
  }, "relation · back-relation · digestOf index");
}

export function driftOfLine(): { ok: boolean; note: string } {
  try {
    const out = execFileSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
    const mine = out.split("\n").filter((l) => /HrLineLink|HrNotice/.test(l));
    return { ok: mine.length === 0, note: mine.length ? mine.join(" | ").slice(0, 200) : `clean for H4.5 (${out.split("\n").filter((l) => /Changed the/.test(l)).length} other tables differ)` };
  } catch (e) {
    return { ok: false, note: `diff did not run: ${errText(e).slice(0, 120)}` };
  }
}

/** DB checks — h = helpers of the oracle's runDb (same fixture, same fake) */
export async function runFixDb(h: Any): Promise<void> {
  const { P, chk, ck, call, fake, TT, sA, cA, C, U, E, K, EXT, actor, V, issue, type, press, links, active, notices, notesOf, pushes, roster, plan, send, job, noticeOne, row, setPol, linkVia, consume, HL, LN, LL, STAFF, emp, contact, exq, MIN, SLUG } = h;
  const textOf = (rs: Any[]) => rs.filter((m) => m.type === "text").map((m) => m.text).join("|");
  const statusOf = (ls: Any[]) => ls.map((x: Any) => `${x.status}/${x.endReason ?? "-"}`).join(",");
  for (const n of ["31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41"]) await emp(n, h.u1);
  for (const k of ["31", "32", "33", "34", "35", "36", "37", "38", "39", "40a", "40b", "41"]) await contact(k, "c1");
  await setPol();
  const notLinked = textOf((await press("free", "hr.menu")).replies);

  // ── D1 staff revoke / grant end links in the same call ──
  {
    await linkVia("31", "31");
    const m = await P.membership.findFirst({ where: { tenantId: TT, userId: U.s31.id } });
    const r = await STAFF.revokeStaffAccess({ tenantId: TT, actorUserId: U.owner.id, membershipId: m?.id ?? "∅" });
    const ls = await links("31");
    ck("F2.1", { revoked: r?.ok === true, ended: ls.some((x: Any) => x.status === "ENDED" && x.endReason === "ACCOUNT") && !ls.some((x: Any) => x.status === "ACTIVE") }, "ENDED/ACCOUNT", `${short(r, 60)} ${statusOf(ls)}`);
  }
  {
    await linkVia("32", "32");
    await exq(`UPDATE "HrEmployee" SET "linkedUserId" = NULL WHERE "id" = $1`, E["32"]); // legacy row unlinked without any hook
    const r = await STAFF.grantStaffAccess({ tenantId: TT, actorUserId: U.owner.id, employeeId: E["32"], email: `${SLUG}-g32@qc.invalid` });
    const ls = await links("32");
    ck("F2.2", { granted: r?.ok === true, ended: ls.some((x: Any) => x.status === "ENDED" && x.endReason === "ACCOUNT") && !ls.some((x: Any) => x.status === "ACTIVE") }, "ENDED/ACCOUNT", `${short(r, 60)} ${statusOf(ls)}`);
  }
  // ── D2 use time (hunter F1 / P1b) ──
  {
    await linkVia("33", "33");
    U.sX33 = await h.mk("sx33", "STAFF", [], {});
    await exq(`UPDATE "HrEmployee" SET "linkedUserId" = NULL WHERE "id" = $1`, E["33"]);
    await exq(`UPDATE "HrEmployee" SET "linkedUserId" = $2 WHERE "id" = $1`, E["33"], U.sX33.id);
    const st = await call(LL, "myLineStatus", actor(U.sX33));
    const chip = await call(LL, "employeeLineStatus", cA, V("owner"), { employeeId: E["33"] });
    const menu = await press("33", "hr.menu");
    const ls = await links("33");
    ck("F2.3", {
      notActive: st.value?.ok === true && st.value?.state !== "ACTIVE" && st.value?.displayName == null, chip: chip.value?.ok === true && chip.value?.state !== "ACTIVE",
      menu: !menu.replies.some((x: Any) => x.type === "flex") && textOf(menu.replies) === notLinked, ended: ls.some((x: Any) => x.status === "ENDED" && x.endReason === "ACCOUNT") && !ls.some((x: Any) => x.status === "ACTIVE"),
    }, "not linked · ENDED/ACCOUNT", `state=${st.value?.state} name=${st.value?.displayName ? "LEAK" : "-"} chip=${chip.value?.state} menu=${short(textOf(menu.replies), 30)} ${statusOf(ls)}`);
  }
  {
    await linkVia("34", "34");
    await P.membership.deleteMany({ where: { userId: U.s34.id, tenantId: TT } });
    const chip = await call(LL, "employeeLineStatus", cA, V("owner"), { employeeId: E["34"] });
    const menu = await press("34", "hr.menu");
    const ls = await links("34");
    ck("F2.4", { chip: chip.value?.ok === true && chip.value?.state !== "ACTIVE", menu: !menu.replies.some((x: Any) => x.type === "flex"), ended: ls.some((x: Any) => x.status === "ENDED" && x.endReason === "ACCOUNT") && !ls.some((x: Any) => x.status === "ACTIVE") }, "not linked", `chip=${chip.value?.state} ${statusOf(ls)}`);
  }
  {
    await exq(`UPDATE "HrEmployee" SET "linkedUserId" = $2 WHERE "id" = $1`, E["33"], U.s33.id); // the original account is back (re-hire)
    const st = await call(LL, "myLineStatus", actor(U.s33));
    ck("F2.5", { state: st.value?.ok === true && st.value?.state !== "ACTIVE", rows: (await active("33")).length === 0 }, "stays ended", `${st.value?.state}`);
  }

  // ── E event switch at send (hunter F2 / P4b) ──
  {
    await linkVia("35", "35");
    fake.script.set(EXT["35"]!, [500]);
    const n0 = new Date();
    const p = await plan(roster(["35"]));
    await send(p.value?.ids ?? [], n0);
    const first = (await notices("35")).map((n: Any) => n.line).join(",");
    await setPol({ events: { ROSTER: false, LEAVE: true, OT: true, SWAP: true, SLIP: true } });
    const from = fake.reqs.length;
    await job(new Date(n0.getTime() + 6 * MIN));
    const ns = await notices("35");
    await setPol();
    ck("F3.1", { first: first === "FAILED", none: pushes("35", from).length === 0, skipped: ns.every((n: Any) => n.line === "SKIPPED" && n.skipCode === "OFF") }, "0 pushes · SKIPPED/OFF", `${first} → ${ns.map((n: Any) => `${n.line}/${n.skipCode ?? "-"}`).join(",")} pushes=${pushes("35", from).length}`);
  }
  // ── F OFF in DIGEST mode (hunter F3 / P4a) + digest day window ──
  {
    await linkVia("36", "36");
    await setPol({ mode: "DIGEST" });
    await plan(roster(["36"]));
    const held = (await notices("36")).map((n: Any) => n.line).join(",");
    await setPol({ enabled: false, mode: "DIGEST" });
    const atSave = await notices("36");
    const from = fake.reqs.length;
    await job(new Date("2031-03-10T11:00:00Z"));
    await setPol({ mode: "DIGEST" });
    await job(new Date("2031-04-20T11:00:00Z"));
    const after = await notices("36");
    await setPol();
    ck("F3.2", { held: held === "HELD", atSave: atSave.every((n: Any) => n.line === "SKIPPED" && n.skipCode === "OFF"), none: pushes("36", from).length === 0, still: after.length === 1 && after[0].line === "SKIPPED" }, "SKIPPED/OFF · 0 pushes", `${held} → ${atSave.map((n: Any) => `${n.line}/${n.skipCode ?? "-"}`).join(",")} pushes=${pushes("36", from).length} rows=${after.map((n: Any) => `${n.kind}:${n.line}`).join(",")}`);
  }
  {
    await linkVia("37", "37");
    await setPol({ mode: "DIGEST" });
    const D = "2032-06-10";
    const old = await noticeOne("37", new Date(`2032-06-07T03:00:00Z`));
    const cur = await noticeOne("37", new Date(`${D}T03:00:00Z`));
    const from = fake.reqs.length;
    await job(new Date(`${D}T10:31:00Z`));
    const ps = pushes("37", from);
    const ro = await row(old), rc = await row(cur);
    await setPol();
    const alt = String(ps[0]?.messages?.[0]?.altText ?? "");
    ck("F3.3", { one: ps.length === 1 && alt === "คุณมีแจ้งเตือนใหม่ 1 รายการ", cur: rc?.line === "SENT" && !!rc?.digestOf, old: ro?.line === "SKIPPED" && !ro?.digestOf }, "digest \"1\" · old SKIPPED", `pushes=${ps.length} alt=${alt} old=${ro?.line}/${ro?.skipCode ?? "-"} cur=${rc?.line}`);
  }
  // ── G tenant not ACTIVE (hunter F4 / P5) ──
  {
    await linkVia("38", "38");
    fake.script.set(EXT["38"]!, [500]);
    const n0 = new Date();
    const p = await plan(roster(["38"]));
    await send(p.value?.ids ?? [], n0);
    await P.tenant.update({ where: { id: TT }, data: { status: "SUSPENDED" } });
    let ns: Any[] = [], from = 0, menu: Any = { replies: [{}] };
    try {
      from = fake.reqs.length;
      await job(new Date(n0.getTime() + 6 * MIN));
      ns = await notices("38");
      menu = await press("38", "hr.menu");
    } finally {
      await P.tenant.update({ where: { id: TT }, data: { status: "ACTIVE" } });
    }
    ck("F3.4", { none: pushes("38", from).length === 0, skipped: ns.length > 0 && ns.every((n: Any) => n.line === "SKIPPED" && n.skipCode === "TENANT"), menu: menu.replies.length === 0 }, "0 pushes · SKIPPED/TENANT · no menu", `pushes=${pushes("38", from).length} ${ns.map((n: Any) => `${n.line}/${n.skipCode ?? "-"}`).join(",")} menuReplies=${menu.replies.length}`);
  }
  // ── H claim re-check before the push ──
  {
    await linkVia("39", "39");
    const p = await plan(roster(["39"]));
    const now = new Date();
    const rows = await LN.claimLineNotices({ tenantId: TT, ids: p.value?.ids ?? [], now });
    await exq(`UPDATE "HrNotice" SET "nextAttemptAt" = $2 WHERE "id" = $1`, rows[0]?.id ?? "∅", new Date(now.getTime() + 7 * MIN)); // another worker re-took the lease
    const from = fake.reqs.length;
    const r = await call(HL, "sendClaimedLineNotices", rows, { now });
    const after = await row(rows[0]?.id);
    const src = readFileSync(join(ROOT, "src/lib/platform/hr-line.ts"), "utf8");
    const jobBody = src.slice(src.indexOf("export async function runHrLineJobs"), src.indexOf("export async function runHrLineJobs") + 1500);
    const budgetFirst = jobBody.indexOf("left()") >= 0 && jobBody.indexOf("left()") < jobBody.indexOf("buildLineDigests(");
    await exq(`UPDATE "HrNotice" SET "line" = 'SKIPPED', "skipCode" = 'QC' WHERE "id" = $1`, rows[0]?.id ?? "∅");
    ck("F3.5", { claimed: rows.length === 1, ran: r.ok, none: pushes("39", from).length === 0, untouched: after?.line === "SENDING", budgetFirst }, "0 pushes · row left SENDING", `${r.text} pushes=${pushes("39", from).length} line=${after?.line}`);
  }
  // ── I plan failure ⇒ the event is retried ──
  {
    await linkVia("41", "41");
    const fn = `qc45_fail_${h.tag}`;
    const trg = `qc45_trg_${h.tag}`;
    const ev = roster(["41"]);
    const n0 = await notesOf("41");
    let first = "∅", mid: Any[] = [];
    await exq(`CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'qc45 forced plan failure'; END $f$`);
    await exq(`CREATE TRIGGER ${trg} BEFORE INSERT ON "HrNotice" FOR EACH ROW WHEN (NEW."tenantId" = '${TT}') EXECUTE FUNCTION ${fn}()`);
    try {
      first = await consume(ev);
      mid = await notices("41", ev.payload.publishId);
    } finally {
      await exq(`DROP TRIGGER IF EXISTS ${trg} ON "HrNotice"`);
      await exq(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
    const midNotes = await notesOf("41");
    const second = await consume(ev);
    const fin = await notices("41", ev.payload.publishId);
    ck("F3.6", { threw: first.startsWith("THROW"), nothing: mid.length === 0 && midNotes === n0, retry: second === "ok" && fin.length === 1 && (await notesOf("41")) === n0 + 1 }, "throw · retry 1+1", `first=${short(first, 50)} mid=${mid.length} retry=${second} final=${fin.length} notes+${(await notesOf("41")) - n0}`);
  }
  // ── J in-app note on replace / admin unlink / LINE unlink ──
  {
    const changed = async () => (await P.appNotification.findMany({ where: { tenantId: TT, recipientUserId: U.s40.id }, select: { title: true, body: true } })) as Any[];
    const cnt = async () => (await changed()).filter((n: Any) => `${n.title} ${n.body}`.includes("บัญชี LINE ที่เชื่อมไว้ถูกเปลี่ยน/ยกเลิก")).length;
    await linkVia("40", "40a");
    const c0 = await cnt();
    await linkVia("40", "40b");
    const c1 = await cnt();
    await call(LL, "adminUnlinkLine", cA, V("owner"), { employeeId: E["40"] });
    const c2 = await cnt();
    await linkVia("40", "40a");
    await press("40a", "hr.unlink");
    const c3 = await cnt();
    const blob = canon(await changed());
    const names = [...fake.names.values()].filter((x: string) => x.length > 4);
    ck("F3.7", { relink: c1 === c0 + 1, admin: c2 === c1 + 1, line: c3 === c2 + 1, noName: !names.some((x: string) => blob.includes(x)) }, "+1 ×3 · no LINE name", `${c0}→${c1}→${c2}→${c3}`);
  }
  // ── r2 mi-1: lease from the wall clock ──
  {
    for (const n of ["42", "43", "44", "45", "46", "47"]) await emp(n, h.u1);
    await contact("42", "c1");
    await linkVia("42", "42");
    const p = await plan(roster(["42"]));
    const id = (p.value?.ids ?? [])[0] ?? "∅";
    const old = new Date(Date.now() - 10 * MIN); // the run started 10 min ago in `now` terms
    const mine = await LN.claimLineNotices({ tenantId: TT, ids: [id], now: old });
    const again = (await LN.claimLineNotices({ tenantId: TT, now: new Date(), limit: 20 })) as Any[];
    const heldFresh = mine.length === 1 && !again.some((r: Any) => r.id === id);
    await exq(`UPDATE "HrNotice" SET "nextAttemptAt" = $2 WHERE "id" = $1`, id, new Date(Date.now() - 3 * MIN)); // truly expired lease
    const again2 = (await LN.claimLineNotices({ tenantId: TT, now: new Date(), limit: 20 })) as Any[];
    const reclaimed = again2.some((r: Any) => r.id === id);
    const others = [...again, ...again2].filter((r: Any) => r.id !== id);
    if (others.length) await HL.sendClaimedLineNotices(others, { now: new Date() });
    await exq(`UPDATE "HrNotice" SET "line" = 'SKIPPED', "skipCode" = 'QC' WHERE "id" = $1`, id);
    ck("F3.8", { claimed: mine.length === 1, heldFresh, reclaimed }, "fresh lease held · expired reclaimable", `lease=${mine[0]?.lease ? new Date(mine[0].lease).toISOString() : "-"} heldFresh=${heldFresh} reclaimed=${reclaimed}`);
  }
  // ── r2 mi-2: planner in bounded chunks (seam opts.chunk) ──
  {
    const five = ["43", "44", "45", "46", "47"];
    const sorted = five.map((n) => E[n]!).sort();
    const failOn = sorted[2]!;
    const ev = roster(five);
    const fn = `qc45_chunk_${h.tag}`, trg = `qc45_chunk_trg_${h.tag}`;
    let first: Any = null, mid = -1;
    await exq(`CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'qc45 forced chunk failure'; END $f$`);
    await exq(`CREATE TRIGGER ${trg} BEFORE INSERT ON "HrNotice" FOR EACH ROW WHEN (NEW."employeeId" = '${failOn}') EXECUTE FUNCTION ${fn}()`);
    try {
      first = await call(LN, "planHrNotices", ev, { chunk: 2 });
      mid = Number((await h.raw(`SELECT count(*)::int AS n FROM "HrNotice" WHERE "tenantId" = $1 AND "refId" = $2`, TT, ev.payload.publishId))[0]?.n ?? -1);
    } finally {
      await exq(`DROP TRIGGER IF EXISTS ${trg} ON "HrNotice"`);
      await exq(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
    const second = await call(LN, "planHrNotices", ev, { chunk: 2 });
    const per = await h.raw(`SELECT "employeeId", count(*)::int AS n FROM "HrNotice" WHERE "tenantId" = $1 AND "refId" = $2 GROUP BY 1`, TT, ev.payload.publishId);
    const notes = await Promise.all(five.map((n) => notesOf(n)));
    ck("F3.9", { failed: !first.ok, kept: mid === 2, retried: second.ok, one: per.length === 5 && per.every((r: Any) => Number(r.n) === 1), inapp: notes.every((x: number) => x === 1) }, "chunk 1 kept · retry ⇒ 1 each", `first=${short(first.text, 40)} mid=${mid} per=${per.map((r: Any) => r.n).join(",")} inapp=${notes.join(",")}`);
  }
  // ── ORACLE-EDIT (H4.5 gate fix · controller ruling): hr.payroll.reversed withdraws unsent payslip notices ──
  {
    const CONS = h.CONS as Record<string, (e: Any) => Promise<void>>;
    const mkRun = async (pk: string, emps: string[]) => {
      const r = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sA, periodKey: pk, payDate: new Date(`${pk}-25T00:00:00Z`), status: "PAID", engineVersion: 1, totalGrossSatang: 1_000_000 * emps.length, totalNetSatang: 1_000_000 * emps.length } });
      for (const e of emps) await P.hrPayrollItem.create({ data: { tenantId: TT, systemId: sA, runId: r.id, employeeId: E[e], grossSatang: 1_000_000, ssoBaseSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: 1_000_000 } });
      return r.id as string;
    };
    const paidEv = (runId: string, pk: string) => ({ id: `qc45g-${runId}`, tenantId: TT, systemId: sA, unitId: null, type: "hr.payroll.paid", payload: { systemId: sA, runId, periodKey: pk }, idempotencyKey: `hr.payroll.paid#${runId}`, status: "PENDING", attempts: 0, createdAt: new Date() });
    const revEv = (runId: string, pk: string) => ({ id: `qc45r-${runId}`, tenantId: TT, systemId: sA, unitId: null, type: "hr.payroll.reversed", payload: { systemId: sA, runId, periodKey: pk, adjustmentIds: [] }, idempotencyKey: `hr.payroll.reversed#${runId}`, status: "PENDING", attempts: 0, createdAt: new Date() });
    const reverse = async (runId: string, pk: string) => {
      await exq(`UPDATE "HrPayrollRun" SET "status" = 'REVERSED', "reversedAt" = now() WHERE "id" = $1`, runId);
      return consume(revEv(runId, pk));
    };
    const cons = async (e: Any) => CONS[e.type]!(e).then(() => "ok", (x: unknown) => `THROW ${errText(x)}`);
    void cons;
    for (const n of ["48", "49", "50"]) await emp(n, h.u1);
    for (const k of ["48", "49", "50"]) await contact(k, "c1");
    for (const n of ["48", "49", "50"]) await linkVia(n, n);
    // F4.1 digest: roster + slip HELD · reversed ⇒ slip SKIPPED/REVERSED · digest "1"
    await setPol({ mode: "DIGEST" });
    const r1 = await mkRun("2034-01", ["48"]);
    await plan(roster(["48"]));
    await consume(paidEv(r1, "2034-01"));
    const held = (await notices("48")).map((n: Any) => `${n.kind}:${n.line}`).sort().join(",");
    const rv1 = await reverse(r1, "2034-01");
    const slipAfter = (await notices("48", r1))[0];
    const wall = new Date();
    const bkk = new Date(wall.getTime() + 7 * 3_600_000);
    const day = bkk.toISOString().slice(0, 10);
    let at = new Date(`${day}T10:31:00Z`);
    if (at.getTime() <= wall.getTime()) at = new Date(at.getTime() + 24 * 3_600_000);
    const from = fake.reqs.length;
    await job(at);
    const ps = pushes("48", from);
    const alt = String(ps[0]?.messages?.[0]?.altText ?? "");
    await setPol();
    ck("F4.1", { held: held === "ROSTER:HELD,SLIP:HELD", rev: rv1 === "ok" && slipAfter?.line === "SKIPPED" && slipAfter?.skipCode === "REVERSED", one: ps.length === 1 && alt === "คุณมีแจ้งเตือนใหม่ 1 รายการ", notDigested: !slipAfter?.digestOf || (await row(slipAfter.id))?.line === "SKIPPED" }, "SKIPPED/REVERSED · digest \"1\"", `held=${held} rev=${short(rv1, 40)} slip=${slipAfter?.line}/${slipAfter?.skipCode ?? "-"} pushes=${ps.length} alt=${alt}`);
    // F4.2 sent ⇒ unchanged
    const r2 = await mkRun("2034-02", ["49"]);
    const f2 = fake.reqs.length;
    await consume(paidEv(r2, "2034-02"));
    const sent = (await notices("49", r2))[0];
    const f2b = fake.reqs.length;
    const rv2 = await reverse(r2, "2034-02");
    const after2 = (await notices("49", r2))[0];
    ck("F4.2", { sent: sent?.line === "SENT" && pushes("49", f2).length === 1, same: rv2 === "ok" && after2?.line === "SENT" && after2?.skipCode == null, none: pushes("49", f2b).length === 0 }, "SENT stays · no extra push", `${sent?.line} → ${after2?.line} extra=${pushes("49", f2b).length}`);
    // F4.3 replay
    const f3 = fake.reqs.length;
    const again = await consume(revEv(r1, "2034-01"));
    const again2 = await consume(revEv(r2, "2034-02"));
    const s1 = (await notices("48", r1))[0], s2 = (await notices("49", r2))[0];
    ck("F4.3", { ok: again === "ok" && again2 === "ok", same: s1?.line === "SKIPPED" && s1?.skipCode === "REVERSED" && s2?.line === "SENT", none: fake.reqs.length === f3 }, "idempotent", `${again}/${again2} ${s1?.line}/${s2?.line} reqs+${fake.reqs.length - f3}`);
    // F4.4 claimed but not pushed
    const r3 = await mkRun("2034-03", ["50"]);
    const p3 = await plan(paidEv(r3, "2034-03"));
    const now = new Date();
    const rows = await LN.claimLineNotices({ tenantId: TT, ids: p3.value?.ids ?? [], now });
    const rv3 = await reverse(r3, "2034-03");
    const f4 = fake.reqs.length;
    await HL.sendClaimedLineNotices(rows, { now });
    const s3 = (await notices("50", r3))[0];
    ck("F4.4", { claimed: rows.length === 1, rev: rv3 === "ok", none: pushes("50", f4).length === 0, skipped: s3?.line === "SKIPPED" && s3?.skipCode === "REVERSED" }, "0 pushes · SKIPPED/REVERSED", `claimed=${rows.length} pushes=${pushes("50", f4).length} ${s3?.line}/${s3?.skipCode ?? "-"}`);
  }
  void C; void K; void sA; void failedKeys; void chk;
}

/** ORACLE-EDIT (H4.5 fix round · controller ruling 9): throwaway tenant with one HrNotice + one HrLineLink ⇒ residueOf lists them ⇒ cleanupFx ⇒ 0 rows */
export async function runCleanupCheck(g: { P: Any; coreHash: Any; slug: string; chk: (id: string, ok: unknown, e: unknown, a: unknown) => boolean; lib: Any }): Promise<void> {
  const { P, coreHash, slug, chk, lib } = g;
  const fx2 = lib.makeFixtures(P, coreHash, `${slug}z`);
  let seen = "", left = "∅";
  try {
    const tid = await fx2.newTenant("-z", "QC HR H4.5 cleanup");
    const sys = await P.appSystem.create({ data: { tenantId: tid, type: "HR", name: `${slug}z hr` } });
    const u = await fx2.mkUser(tid, "zs", `QC45 z ${slug}`, "STAFF", [], {});
    const e = await fx2.mkEmp(tid, sys.id, `พนักงานz ${slug}`, { linkedUserId: u.id });
    await P.$executeRawUnsafe(`INSERT INTO "HrLineLink" ("id","tenantId","systemId","employeeId","issuedForUserId","status","expiresAt") VALUES ($1,$2,$3,$4,$5,'PENDING', now())`, `${slug}zl`, tid, sys.id, e, u.id);
    await P.$executeRawUnsafe(`INSERT INTO "HrNotice" ("id","tenantId","systemId","employeeId","kind","refId","dedupeKey","line") VALUES ($1,$2,$3,$4,'ROSTER','z',$5,'NONE')`, `${slug}zn`, tid, sys.id, e, `hr:ROSTER:z:${e}`);
    seen = (await lib.residueOf(P, fx2, `${slug}z`, `${slug}z`)).filter((r: string) => /^Hr(Notice|LineLink)=/.test(r)).join(",");
  } catch (x) {
    seen = `THROW ${errText(x)}`;
  }
  await lib.cleanupFx(P, fx2, `${slug}z`);
  const ids = fx2.tenants.length ? fx2.tenants : ["∅"];
  const r = (await P.$queryRawUnsafe(`SELECT (SELECT count(*) FROM "HrNotice" WHERE "tenantId" = ANY($1::text[]))::int AS n, (SELECT count(*) FROM "HrLineLink" WHERE "tenantId" = ANY($1::text[]))::int AS l, (SELECT count(*) FROM "Tenant" WHERE "id" = ANY($1::text[]))::int AS t`, ids)) as Any[];
  left = `notice=${r[0]?.n} link=${r[0]?.l} tenant=${r[0]?.t}`;
  chk("Z2", /HrNotice=1/.test(seen) && /HrLineLink=1/.test(seen) && Number(r[0]?.n) === 0 && Number(r[0]?.l) === 0 && Number(r[0]?.t) === 0, "RESIDUE lists both · 0 after cleanupFx", `seen=${seen || "-"} after: ${left}`);
}
