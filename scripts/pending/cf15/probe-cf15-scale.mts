// C5.5-fix11 scale measurement — one erase over N rewritten audit rows (identity key `note`) + N/5 linked cards each with one comment
//   (all carry the person's identity ⇒ every row is rewritten) · prints wall time and rows/60 s · own tenant on QC3, CLEAN.
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf15/probe-cf15-scale.mts 50000
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const N = Math.max(1, Number(process.argv[2] ?? 20_000));
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf15-scale: QC3 only (host=${host})`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("probe-cf15-scale: network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf15s-${rand}`;
let T = "";
let uid = "";
let ok = false;
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  uid = u.id;
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  const K = (await sysSvc.createSystem(T, "KANBAN", `${TAG} board`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const board = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `งาน ${TAG}` } })).id as string;
  const col = (await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board, name: "ต้องทำ" } })).id as string;
  const name = `ลูกค้าใหญ่ ${TAG}`;
  const phone = "0866666666";
  const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } });
  const c = (await P.crmContact.create({ data: { tenantId: T, systemId: S, name, partyId: party.id, ownerUserId: u.id, phone } })).id as string;
  const old = new Date(Date.now() - 86_400_000);
  const t1 = Date.now();
  for (let i = 0; i < N; i += 1_000) {
    await P.auditLog.createMany({ data: Array.from({ length: Math.min(1_000, N - i) }, (_v, k) => ({ tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: c, before: { note: "เดิม" }, after: { note: `ทั่วไป ${i + k}` }, createdAt: old })) });
  }
  const nc = Math.round(N / 5);
  for (let i = 0; i < nc; i += 1_000) {
    const part = Array.from({ length: Math.min(1_000, nc - i) }, (_v, k) => ({ id: `${TAG}-k-${String(i + k).padStart(7, "0")}`, tenantId: T, systemId: K, boardId: board, columnId: col, title: `โทรหา ${name} ${i + k}` }));
    await P.kanbanCard.createMany({ data: part });
    await P.kanbanCardLink.createMany({ data: part.map((x) => ({ tenantId: T, systemId: K, cardId: x.id, linkType: "CRM_CONTACT", linkId: c, role: "RELATED" })) });
    await P.kanbanComment.createMany({ data: part.map((x) => ({ tenantId: T, cardId: x.id, authorUserId: u.id, body: `เบอร์ ${phone}` })) });
  }
  console.log(`fixture ${N} audit + ${nc} cards + ${nc} comments in ${Date.now() - t1} ms`);
  const ts = Date.now();
  let err: Any = null;
  let r: Any = null;
  try {
    r = await CRM.privacy.eraseContact({ tenantId: T, systemId: S, actorUserId: u.id }, owner, { contactId: c, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf15 scale)" }, { del: async () => undefined });
  } catch (e) {
    err = e;
  }
  const ms = Date.now() - ts;
  const rewritten = N + 2 * nc;
  const leftAudit = (await P.auditLog.count({ where: { tenantId: T, targetId: c, action: "crm.contact.update", NOT: { after: { path: ["note"], equals: "[ข้อมูลถูกลบ]" } } } })) as number;
  const leftCards = (await P.kanbanCard.count({ where: { tenantId: T, title: { contains: name } } })) as number;
  ok = !!r?.erased && leftAudit === 0 && leftCards === 0;
  console.log(`SCALE rewritten=${rewritten} erased=${r?.erased ?? false} error=${err ? `${err.name} ${err.code ?? ""}` : "none"} ms=${ms} leftAudit=${leftAudit} leftCards=${leftCards} ⇒ ≈ ${Math.round((rewritten * 60_000) / Math.max(ms, 1))} rewritten rows per 60 s at this size`);
} finally {
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => String(x.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
  }
  if (uid) {
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  let left = 0;
  for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
  console.log(`CLEAN left=${left} tenant=${await P.tenant.count({ where: { id: T } })}`);
  await prisma.$disconnect();
}
process.exit(ok ? 0 : 1);
