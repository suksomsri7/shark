// probe-c16-review.mts — หลักฐานรอบแก้รีวิว C1.6 (B1 · S1 · S2/S3 · S4 · S5 · S7 · S9) · positive + negative ต่อข้อ
// QC DB เท่านั้น (.env.qc) · tenant ทิ้งได้ `qc-c16rv-<rand>` ลบใน finally · ไม่ drain outbox · ที่เก็บไฟล์ไม่ถูกแตะ (deps.put ฉีด + env ปลอม)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c16-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c16rv-${rand}`;
process.env.SHARK_BUNNY_CDN = "https://qc-c16rv-cdn.invalid";
process.env.SHARK_BUNNY_ZONE = `${TAG}-zone`;
process.env.SHARK_BUNNY_KEY = `${TAG}-key`;
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: Any, init?: Any) => {
  const url = typeof input === "string" ? input : String(input?.url ?? input);
  if (/bunny|qc-c16rv-cdn/.test(url)) return new Response("ok", { status: 201 });
  return realFetch(input, init);
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const A = (await import("@/lib/modules/crm/activities" as string)) as Any;
const F = (await import("@/lib/modules/crm/files" as string)) as Any;

const out: { id: string; ok: boolean; detail: string }[] = [];
const chk = (id: string, ok: unknown, detail: string) => {
  out.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${id} — ${detail}`);
};
const call = async (fn: Any, ...args: Any[]) => {
  try {
    return { ok: true, v: await fn(...args), code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    return { ok: false, v: undefined as Any, code: String(x?.code ?? ""), msg: e instanceof Error ? e.message : String(e) };
  }
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });
const DAY = 86_400_000;
const PUTS: string[] = [];
const deps = { put: async (p: string) => { PUTS.push(p); }, del: async () => 200 };

console.log(`\n═══ probe C1.6 review · DB ${host} · ${TAG} ═══`);
const users: string[] = [];
let tid = "";
try {
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  const mkUser = async (s: string, role: string, permissions: Record<string, unknown>) => {
    const u = (await P.user.create({ data: { email: `${TAG}-${s}@qc.invalid`, name: `QC ${s}` } })).id as string;
    users.push(u);
    await P.membership.create({ data: { userId: u, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    return u;
  };
  const uOwner = await mkUser("owner", "OWNER", {});
  const uStaff = await mkUser("staff", "STAFF", { "crm.*": true, "kanban.*": true });
  const uLimited = await mkUser("limited", "STAFF", { "crm.activity.create": true });
  const act = (u: string, role: string, permissions: Record<string, unknown>) => ({ userId: u, role, unitAccess: ["*"], permissions });
  const owner = act(uOwner, "OWNER", {});
  const staff = act(uStaff, "STAFF", { "crm.*": true, "kanban.*": true });
  const limited = act(uLimited, "STAFF", { "crm.activity.create": true });
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  const crm2 = (await sysSvc.createSystem(tid, "CRM", `CRM2 ${TAG}`)).id as string;
  const kan = (await sysSvc.createSystem(tid, "KANBAN", `KAN ${TAG}`)).id as string;
  for (const s of [crm, crm2]) await P.appSystem.update({ where: { id: s }, data: { settings: { crm: { uiVersion: 2 } } } });
  const cx = (u: string, s = crm) => ({ tenantId: tid, systemId: s, actorUserId: u });
  const party = async (name: string, kind: string) => (await P.party.create({ data: { tenantId: tid, name, kind } })).id as string;
  const company = async (name: string) => (await P.crmCompany.create({ data: { tenantId: tid, systemId: crm, name, partyId: await party(name, "COMPANY") } })).id as string;
  const co1 = await company(`บริษัทหนึ่ง ${rand}`);
  const co2 = await company(`บริษัทสอง ${rand}`);
  const k = (await P.crmContact.create({ data: { tenantId: tid, systemId: crm, name: `ผู้ติดต่อ ${rand}`, firstName: "ผู้ติดต่อ", companyId: co1, partyId: await party(`ผู้ติดต่อ ${rand}`, "PERSON") } })).id as string;
  await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: co1, contactId: k, role: "OTHER", isPrimary: true } });
  await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: co2, contactId: k, role: "OTHER", isPrimary: false } });
  const pipe = await P.crmPipeline.create({ data: { tenantId: tid, systemId: crm, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: tid, systemId: crm, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }] } }, include: { stages: true } });
  const d = (await P.crmDeal.create({ data: { tenantId: tid, systemId: crm, contactId: k, companyId: co1, pipelineId: pipe.id, stageId: pipe.stages[0].id, title: `ดีล ${rand}`, kind: "OPEN", ownerUserId: uOwner } })).id as string;
  const rawAct = async (data: Record<string, Any>, s = crm) => (await P.crmActivity.create({ data: { tenantId: tid, systemId: s, type: "TASK", ownerUserId: uOwner, ...data } })).id as string;
  const mkBoard = async (name: string, visibility: string) => {
    const b = await P.kanbanBoard.create({ data: { tenantId: tid, systemId: kan, name, createdById: uOwner, visibility } });
    for (const [i, n] of ["รอทำ", "เสร็จ"].entries()) await P.kanbanColumn.create({ data: { tenantId: tid, systemId: kan, boardId: b.id, name: n, sortOrder: i, position: `a${i}` } });
    return b.id as string;
  };
  const SECRET_BOARD = `บอร์ดลับ ${rand}`;
  const privB = await mkBoard(SECRET_BOARD, "PRIVATE");
  const tenB = await mkBoard(`บอร์ดทั้งร้าน ${rand}`, "TENANT");

  // ── B1: บอร์ดผ่านด่านการมองเห็นของโมดูลบอร์ดงาน ──
  {
    const own = await call(A.boardOptions, cx(uOwner), owner);
    const st = await call(A.boardOptions, cx(uStaff), staff);
    const a1 = await rawAct({ dealId: d, contactId: k, companyId: co1, title: `งานบี1 ${rand}` });
    const a2 = await rawAct({ dealId: d, contactId: k, companyId: co1, title: `งานบี1ข ${rand}`, ownerUserId: uStaff });
    const okCard = await call(A.openTaskCard, cx(uOwner), owner, { activityId: a1, boardId: privB });
    const noCard = await call(A.openTaskCard, cx(uStaff), staff, { activityId: a2, boardId: privB });
    const crmSrc = walk("src/lib/modules/crm").concat(walk("src/app/app/sys/[id]/crm"), walk("src/components/crm")).filter((f) => /kanbanBoard\s*\./.test(read(f)));
    chk("B1.pos", own.ok && own.v.some((b: Any) => b.id === privB) && st.ok && st.v.some((b: Any) => b.id === tenB) && okCard.ok, `owner sees private=${own.v?.some((b: Any) => b.id === privB)} · staff sees tenant board=${st.v?.some((b: Any) => b.id === tenB)} · owner opens card on private board=${okCard.ok || okCard.msg}`);
    chk("B1.neg", st.ok && !JSON.stringify(st.v).includes(SECRET_BOARD) && noCard.code === "NOT_FOUND" && crmSrc.length === 0, `staff list has secret name=${JSON.stringify(st.v ?? []).includes(SECRET_BOARD)} · staff openTaskCard(private)=${noCard.code || "accepted"} · direct kanbanBoard queries in crm/**=${crmSrc.join(",") || "none"}`);
  }

  // ── S1: pre re-resolved every attempt (company changes while waiting for the lock) ──
  {
    const blocker = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT "id" FROM "CrmCompany" WHERE "id" = $1 FOR UPDATE`, co1);
      await sleep(1500);
      await tx.crmContact.update({ where: { id: k }, data: { companyId: co2 } });
    }, { timeout: 20_000 });
    await sleep(300);
    const r = await call(A.logActivity, cx(uOwner), owner, { type: "LINE", title: `แข่งล็อก ${rand}`, contactId: k });
    await blocker;
    const row = r.ok ? await P.crmActivity.findFirst({ where: { id: r.v.id } }) : null;
    chk("S1.pos", r.ok && row?.companyId === co2, `logActivity while the contact's company moved co1→co2 under the lock: ok=${r.ok || r.msg} companyId=${row?.companyId === co2 ? "co2 (fresh)" : row?.companyId === co1 ? "co1 (stale)" : row?.companyId}`);
    chk("S1.neg", r.ok && row?.companyId !== co1 && r.code !== "CONFLICT", `never the stale company · no CONFLICT after retry (${r.code || "-"})`);
    await P.crmContact.update({ where: { id: k }, data: { companyId: co1 } });
  }

  // ── S2/S3: what already happened is not pending · NOTE never pending · COALESCE(dueAt, startAt) ──
  {
    const past = await call(A.logActivity, cx(uOwner), owner, { type: "CALL", title: `โทรแล้ว ${rand}`, dealId: d, startAt: new Date(Date.now() - 3600_000) });
    const note = await call(A.logActivity, cx(uOwner), owner, { type: "NOTE", title: `โน้ต ${rand}`, dealId: d });
    const fut = await call(A.logActivity, cx(uOwner), owner, { type: "MEETING", title: `นัดอนาคต ${rand}`, dealId: d, startAt: new Date(Date.now() + 2 * DAY) });
    const rawNote = await rawAct({ dealId: d, type: "NOTE", title: `โน้ตดิบ ${rand}` });
    const th0 = Math.floor((Date.now() + 7 * 3600_000) / DAY) * DAY - 7 * 3600_000;
    const startOnly = await rawAct({ dealId: d, title: `เริ่มวันนี้ ${rand}`, startAt: new Date(th0 + 23 * 3600_000 + 30 * 60_000) });
    const pend = await call(A.listActivities, cx(uOwner), owner, { status: "pending", dealId: d, pageSize: 200 });
    const today = await call(A.listActivities, cx(uOwner), owner, { status: "today", dealId: d, pageSize: 200 });
    const ids = new Set((pend.v?.items ?? []).map((x: Any) => x.id));
    const tIds = new Set((today.v?.items ?? []).map((x: Any) => x.id));
    const rows = await P.crmActivity.findMany({ where: { id: { in: [past.v?.id, note.v?.id, fut.v?.id].filter(Boolean) } } });
    const doneOf = (id: string) => rows.find((x: Any) => x.id === id)?.doneAt ?? null;
    chk("S2.pos", past.ok && note.ok && !!doneOf(past.v.id) && !!doneOf(note.v.id) && !ids.has(past.v.id) && !ids.has(note.v.id), `past CALL done=${!!doneOf(past.v?.id)} · NOTE done=${!!doneOf(note.v?.id)} · neither in pending`);
    chk("S2.neg", fut.ok && doneOf(fut.v.id) === null && ids.has(fut.v.id) && !ids.has(rawNote), `future MEETING stays open + in pending=${ids.has(fut.v?.id)} · an open NOTE row is still excluded from pending=${!ids.has(rawNote)}`);
    chk("S3.pos", today.ok && tIds.has(startOnly), `a TASK with dueAt null and startAt today (Thai) is in "today" via COALESCE(dueAt, startAt)=${tIds.has(startOnly)}`);
    chk("S3.neg", today.ok && !tIds.has(fut.v?.id) && !tIds.has(rawNote), `"today" excludes the +2 d meeting and the NOTE`);
  }

  // ── S4: keyset pagination across the null-dueAt boundary ──
  {
    const d4 = (await P.crmDeal.create({ data: { tenantId: tid, systemId: crm, contactId: k, companyId: co1, pipelineId: pipe.id, stageId: pipe.stages[0].id, title: `ดีลหน้า ${rand}`, kind: "OPEN", ownerUserId: uOwner } })).id as string;
    const want = [
      await rawAct({ dealId: d4, title: `p1 ${rand}`, dueAt: new Date(Date.now() + DAY) }),
      await rawAct({ dealId: d4, title: `p2 ${rand}`, dueAt: new Date(Date.now() + 2 * DAY) }),
      await rawAct({ dealId: d4, title: `p3 ${rand}` }),
      await rawAct({ dealId: d4, title: `p4 ${rand}` }),
      await rawAct({ dealId: d4, title: `p5 ${rand}` }),
    ];
    const got: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let boundaryOnNull = false;
    do {
      const r = await call(A.listActivities, cx(uOwner), owner, { status: "pending", dealId: d4, pageSize: 2, cursor });
      if (!r.ok) break;
      got.push(...r.v.items.map((x: Any) => x.id));
      const last = r.v.items[r.v.items.length - 1];
      if (r.v.nextCursor && last && last.dueAt === null) boundaryOnNull = true;
      cursor = r.v.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    chk("S4.pos", got.length === 5 && new Set(got).size === 5 && want.every((w) => got.includes(w)) && got[0] === want[0] && got[1] === want[1] && boundaryOnNull, `5 rows over ${pages} pages · no duplicates · dated first · a page boundary fell on a null dueAt=${boundaryOnNull}`);
    const junk = await call(A.listActivities, cx(uOwner), owner, { status: "pending", dealId: d4, pageSize: 2, cursor: "not-a-cursor" });
    const forged = await call(A.listActivities, cx(uOwner), owner, { status: "pending", dealId: d4, pageSize: 2, cursor: Buffer.from("x|' OR 1=1 --", "utf8").toString("base64url") });
    chk("S4.neg", junk.ok && forged.ok && junk.v.items[0]?.id === want[0] && forged.v.items[0]?.id === want[0], `garbage / forged cursor ⇒ first page, no error (${junk.code || "ok"} / ${forged.code || "ok"})`);
  }

  // ── S5: pin = author or MANAGER+ · complete needs crm.activity.complete · kanban completion credits nobody · audit on success ──
  {
    const n = await call(A.logActivity, cx(uOwner), owner, { type: "NOTE", title: `หมุด ${rand}`, dealId: d });
    const pinStaff = await call(A.setPinned, cx(uStaff), staff, n.v?.id, true);
    const pinOwner = await call(A.setPinned, cx(uOwner), owner, n.v?.id, true);
    // controller edit (C1.7): STAFF activity visibility = OWN ⇒ the activity the STAFF completes is his own
    const t1 = await rawAct({ dealId: d, title: `ปิดสิทธิ์ ${rand}`, ownerUserId: uStaff });
    const cLim = await call(A.completeActivity, cx(uLimited), limited, t1);
    const cStaff = await call(A.completeActivity, cx(uStaff), staff, t1);
    const cAgain = await call(A.completeActivity, cx(uStaff), staff, t1);
    const aud = await P.auditLog.count({ where: { tenantId: tid, targetId: t1, action: "crm.activity.complete" } });
    const t2 = await rawAct({ dealId: d, contactId: k, companyId: co1, title: `ปิดจากบอร์ด ${rand}` });
    const card = await call(A.openTaskCard, cx(uOwner), owner, { activityId: t2, boardId: tenB });
    await A.onKanbanCardCompleted({ tenantId: tid, payload: { cardId: card.v?.cardId, actorUserId: uStaff } });
    const r2 = await P.crmActivity.findFirst({ where: { id: t2 } });
    const aud2 = await P.auditLog.findMany({ where: { tenantId: tid, targetId: t2, action: "crm.activity.complete" } });
    chk("S5.pos", pinOwner.ok && cStaff.ok && cAgain.ok && aud === 2 && !!r2?.doneAt && aud2.some((x: Any) => x.after?.via === "kanban" && x.actorId === null), `author pins=${pinOwner.ok} · crm.* staff completes (+ repeat)=${cStaff.ok}/${cAgain.ok} · audit rows on success=${aud} · kanban completion done=${!!r2?.doneAt} audit via kanban=${aud2.length}`);
    // controller edit (C1.7): an invisible row answers NOT_FOUND (404-not-403) — both refusals are correct
    const refused = (c: string) => c === "FORBIDDEN" || c === "NOT_FOUND";
    chk("S5.neg", refused(pinStaff.code) && refused(cLim.code) && r2?.completedById === null, `non-author STAFF pin=${pinStaff.code || "allowed"} · STAFF without crm.activity.complete=${cLim.code || "allowed"} · kanban completedById=${r2?.completedById ?? "null"}`);
  }

  // ── S7: custom records through where.ts recordWhere ──
  {
    const obj = await P.customObject.create({ data: { tenantId: tid, systemId: crm, key: `car${rand}`, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" } });
    const obj2 = await P.customObject.create({ data: { tenantId: tid, systemId: crm2, key: `car${rand}`, label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" } });
    const rec = (await P.customRecord.create({ data: { tenantId: tid, systemId: crm, objectId: obj.id, parentType: "CONTACT", parentId: k, title: `รถ ${rand}` } })).id as string;
    const rec2 = (await P.customRecord.create({ data: { tenantId: tid, systemId: crm2, objectId: obj2.id, parentType: "NONE", title: `รถระบบสอง ${rand}` } })).id as string;
    const ok = await call(A.logActivity, cx(uOwner), owner, { type: "VISIT", title: `ดูรถ ${rand}`, customRecordId: rec });
    const bad = await call(A.logActivity, cx(uOwner), owner, { type: "VISIT", title: `ดูรถอื่น ${rand}`, customRecordId: rec2 });
    const fBad = await call(F.attachFile, cx(uOwner), owner, { entityType: "RECORD", entityId: rec2, filename: "x.pdf", contentType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }, deps);
    const whereSrc = read("src/lib/modules/crm/where.ts");
    const uses = (read("src/lib/modules/crm/activities.ts").match(/recordWhere\(/g) ?? []).length + (read("src/lib/modules/crm/files.ts").match(/recordWhere\(/g) ?? []).length;
    chk("S7.pos", ok.ok && /export (async )?function recordWhere/.test(whereSrc) && uses >= 3, `record of this system accepted=${ok.ok || ok.msg} · recordWhere exported · call sites=${uses} (resolve · mention visibility · files)`);
    chk("S7.neg", bad.code === "NOT_FOUND" && fBad.code === "NOT_FOUND" && !/customRecord\.(findFirst|count|findMany)\(\{\s*where:\s*\{\s*(\.\.\.identityScope|tenantId)/.test(read("src/lib/modules/crm/activities.ts") + read("src/lib/modules/crm/files.ts")), `another system's record ⇒ log=${bad.code || "accepted"} · attach=${fBad.code || "accepted"} · no raw record scope left`);
  }

  // ── S9: invisible / bidi characters stripped · NUL in body refused ──
  {
    const zw = "\u200b\u202e\u2066\u2028\ufeff";
    const r = await call(A.logActivity, cx(uOwner), owner, { type: "CALL", title: `โทร${zw}ลูกค้า ${rand}`, dealId: d, startAt: new Date(Date.now() + DAY) });
    const f = await call(F.attachFile, cx(uOwner), owner, { entityType: "DEAL", entityId: d, filename: `สัญญา\u202efdp.exe${zw}.pdf`, contentType: "application/pdf", data: new Uint8Array([37, 80, 68, 70, 45]) }, deps);
    const row = r.ok ? await P.crmActivity.findFirst({ where: { id: r.v.id } }) : null;
    const link = f.ok ? await P.crmFileLink.findFirst({ where: { id: f.v.id } }) : null;
    const clean = (x: string | null | undefined) => typeof x === "string" && !/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/.test(x);
    chk("S9.pos", r.ok && f.ok && clean(row?.title) && clean(link?.name) && clean(f.v?.name), `title stored clean=${clean(row?.title)} · file name stored/DTO clean=${clean(link?.name)}/${clean(f.v?.name)} (${JSON.stringify(link?.name ?? "")})`);
    const before = await P.crmActivity.count({ where: { tenantId: tid } });
    const nul = await call(A.logActivity, cx(uOwner), owner, { type: "NOTE", title: `โน้ตศูนย์ ${rand}`, body: "ก่อน\u0000หลัง", dealId: d });
    const after = await P.crmActivity.count({ where: { tenantId: tid } });
    chk("S9.neg", nul.code === "VALIDATION" && /[ก-๙]/.test(nul.msg) && after === before, `NUL in body ⇒ ${nul.code || "accepted"} (Thai) · rows+${after - before}`);
  }
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}`.slice(0, 600) : String(e));
} finally {
  if (tid) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string)
      .filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => 0);
    await P.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.tenant.delete({ where: { id: tid } }).catch(() => 0);
  }
  for (const u of users) {
    await P.appNotification.deleteMany({ where: { recipientUserId: u } }).catch(() => 0);
    await P.user.delete({ where: { id: u } }).catch(() => 0);
  }
  const left = tid ? await P.tenant.count({ where: { id: tid } }) : 0;
  chk("CLEAN", left === 0 && (users.length === 0 || (await P.user.count({ where: { id: { in: users } } })) === 0), `tenant/users removed · storage puts (stubbed)=${PUTS.length}`);
  await prisma.$disconnect();
}
const passed = out.filter((x) => x.ok).length;
console.log(`\n${passed === out.length ? "🟢" : "🔴"} probe C1.6 review: ${passed}/${out.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: out.length, passed, findings: out.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(passed === out.length ? 0 : 1);
