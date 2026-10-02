// C5.5-fix9 REVIEW scale probe — how much per-row WRITE work fits in the 60 s erase transaction (from this host to QC3).
//   The builder's E block measured mostly READS (filler cards/audit rows carry no identity ⇒ no UPDATE; portal fillers have no card).
//   Here every linked card, comment and history row carries the person's name/phone ⇒ one UPDATE each. Reports ms per written row.
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf12/review/probe-cf12-review-scale.mts [cards]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf12-review-scale: QC3 only`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf12s-${rand}`;
const N = Math.max(10, Math.min(3_000, Number(process.argv[2] ?? 500)));
let T = "";
const USERS: string[] = [];
let ok = true;
const chunks = async <X,>(rows: X[], fn: (part: X[]) => Promise<unknown>, n = 1_000) => {
  for (let i = 0; i < rows.length; i += n) await fn(rows.slice(i, i + n));
};
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  const K = (await sysSvc.createSystem(T, "KANBAN", `${TAG} board`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const name = `สเกล ${TAG}`;
  const phone = `0870${String(Date.now() % 1e6).padStart(6, "0")}`;
  const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } });
  const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: "สเกล", partyId: party.id, ownerUserId: u.id, phone } });
  const board = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `งาน ${TAG}` } })).id as string;
  const col = (await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board, name: "ต้องทำ" } })).id as string;
  const ids = Array.from({ length: N }, (_v, i) => `${TAG}-c${String(i).padStart(5, "0")}`);
  await chunks(ids, (part) => P.kanbanCard.createMany({ data: part.map((id, i) => ({ id, tenantId: T, systemId: K, boardId: board, columnId: col, title: `โทร ${name} ${i}`, description: `เบอร์ ${phone}`, sortOrder: i })) }));
  await chunks(ids, (part) => P.kanbanCardLink.createMany({ data: part.map((id) => ({ tenantId: T, systemId: K, cardId: id, linkType: "CRM_CONTACT", linkId: c.id, role: "RELATED" })) }));
  await chunks(ids, (part) => P.kanbanComment.createMany({ data: part.map((id) => ({ tenantId: T, cardId: id, authorUserId: u.id, body: `ลูกค้า ${phone}` })) }));
  await chunks(ids, (part) => P.kanbanActivity.createMany({ data: part.map((id) => ({ tenantId: T, boardId: board, cardId: id, type: "CARD_CREATED", data: { title: `โทร ${name}` } })) }));
  const ts = Date.now();
  let err: Any = null;
  let r: Any = null;
  try {
    r = await CRM.privacy.eraseContact({ tenantId: T, systemId: S, actorUserId: u.id }, owner, { contactId: c.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review scale)" }, { del: async () => undefined });
  } catch (e) {
    err = e;
  }
  const ms = Date.now() - ts;
  const written = r?.counts?.kanban ?? 0;
  console.log(`SCALE cards=${N} rowsWritten(kanban)=${written} erased=${r?.erased ?? false} error=${err ? `${err.name} ${err.code ?? ""} ${String(err.message).replace(/\s+/g, " ").slice(0, 160)}` : "none"} ms=${ms} msPerWrittenRow=${written ? (ms / written).toFixed(1) : "-"} ⇒ rows/60s≈${written ? Math.floor(60_000 / (ms / written)) : "-"}`);
  ok = !!r?.erased || !!err;
} finally {
  if (T) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => String(x.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0);
    for (const uid of USERS) {
      await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
      await P.user.delete({ where: { id: uid } }).catch(() => undefined);
    }
    console.log(`CLEAN left=${left} tenant=${await P.tenant.count({ where: { id: T } })} users=${await P.user.count({ where: { id: { in: USERS } } })}`);
  }
  await prisma.$disconnect();
}
process.exit(ok ? 0 : 1);
