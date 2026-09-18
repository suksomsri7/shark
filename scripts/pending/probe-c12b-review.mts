// controller probe — C1.2b review items S1–S4 (positive + negative each) · QC DB only · throwaway tenant swept in finally
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c12b-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const OBJ = (await import("@/lib/modules/crm/objects" as string)) as Any;
const MEM = (await import("@/lib/modules/member" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c12b-probe-${rand}`;
let tid = "";
let uid = "";
let ok = 0;
let bad = 0;
const line = (id: string, pass: boolean, what: string) => {
  pass ? ok++ : bad++;
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${what}`);
};
const call = async (fn: () => Promise<unknown>) => {
  try {
    return { ok: true, v: (await fn()) as Any, code: "", msg: "" };
  } catch (e) {
    return { ok: false, v: null, code: String((e as Any)?.code ?? ""), msg: (e as Error).message };
  }
};

console.log(`[env] ${host} · ${TAG}`);
try {
  tid = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  uid = (await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: TAG } })).id;
  await P.membership.create({ data: { userId: uid, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  const mem = (await sysSvc.createSystem(tid, "MEMBER", `MEM ${TAG}`)).id as string;
  const ctx = { tenantId: tid, systemId: crm, actorUserId: uid };
  const owner = { userId: uid, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const F = MEM.fields;
  const fc = (k: string) => ({ ...ctx, objectKey: k, actor: owner });
  const party = async (n: string) => (await P.party.create({ data: { tenantId: tid, name: n, kind: "PERSON" } })).id;
  const contact = await P.crmContact.create({ data: { tenantId: tid, systemId: crm, name: `c ${TAG}`, partyId: await party("c") } });

  // ── S1: sensitive title field ──
  await OBJ.create(ctx, owner, { key: "sec", label: "ลับ", parentType: "CONTACT", titleFieldKey: "plate" });
  const sec = await F.createSection(fc("sec"), { key: "main", label: "หลัก" });
  await F.createField(fc("sec"), { sectionId: sec.id, key: "plate", label: "ทะเบียน", type: "TEXT" });
  await F.createField(fc("sec"), { sectionId: sec.id, key: "idcard", label: "เลขบัตร", type: "TEXT", sensitive: true });
  const u1 = await call(() => OBJ.update(ctx, owner, "sec", { titleFieldKey: "idcard" }));
  line("S1.neg", !u1.ok && u1.code === "VALIDATION", `titleFieldKey→sensitive field refused: ${u1.code} ${u1.msg.slice(0, 70)}`);
  const r1 = await call(() => OBJ.records.create(ctx, owner, "sec", { parentId: contact.id, values: { plate: "กข-1", idcard: "1101700000001" } }));
  line("S1.pos", r1.ok && r1.v.title === "กข-1", `non-sensitive title field → title = value: "${r1.v?.title}"`);
  // field becomes the title while sensitive (created before the guard could see it): object created with titleFieldKey pointing at a not-yet-existing field
  await OBJ.create(ctx, owner, { key: "sec2", label: "ลับสอง", parentType: "CONTACT", titleFieldKey: "idcard" });
  const sec2 = await F.createSection(fc("sec2"), { key: "main", label: "หลัก" });
  await F.createField(fc("sec2"), { sectionId: sec2.id, key: "idcard", label: "เลขบัตร", type: "TEXT", sensitive: true });
  const r2 = await call(() => OBJ.records.create(ctx, owner, "sec2", { parentId: contact.id, values: { idcard: "1101700000002" } }));
  line("S1.neg2", r2.ok && r2.v.title !== "1101700000002" && !String(r2.v.title).includes("1101700000002"), `sensitive title field → fallback title: "${r2.v?.title}"`);

  // ── S2: apiRole ──
  const ro = { ...owner, apiRole: "readonly", keyId: "k1" };
  const op = { ...owner, apiRole: "operate", keyId: "k2" };
  const ad = { ...owner, apiRole: "ADMIN", keyId: "k3" };
  const a1 = await call(() => OBJ.records.create(ctx, ro, "sec", { parentId: contact.id, values: { plate: "RO" } }));
  line("S2.neg", !a1.ok && a1.code === "FORBIDDEN", `READONLY key records.create refused: ${a1.code}`);
  const a2 = await call(() => OBJ.create(ctx, ad, { key: "viaadmin", label: "x", parentType: "NONE", titleFieldKey: "name" }));
  line("S2.neg2", !a2.ok && a2.code === "FORBIDDEN", `ADMIN key object design refused: ${a2.code}`);
  const a3 = await call(() => OBJ.records.create(ctx, op, "sec", { parentId: contact.id, values: { plate: "OP" } }));
  const a4 = await call(() => OBJ.records.create(ctx, ad, "sec", { parentId: contact.id, values: { plate: "AD" } }));
  line("S2.pos", a3.ok && a4.ok, `OPERATE/ADMIN key records.create allowed: ${a3.ok}/${a4.ok}`);
  const a5 = await call(() => OBJ.records.list(ctx, ro, "sec", {}));
  line("S2.pos2", a5.ok, `READONLY key records.list allowed: ${a5.ok}`);

  // ── S3: rename refused while a LOOKUP points at the old key ──
  await OBJ.create(ctx, owner, { key: "target", label: "ปลายทาง", parentType: "NONE", titleFieldKey: "name" });
  await OBJ.create(ctx, owner, { key: "src", label: "ต้นทาง", parentType: "NONE", titleFieldKey: "name" });
  const s3 = await F.createSection(fc("src"), { key: "main", label: "หลัก" });
  const lk = await F.createField(fc("src"), { sectionId: s3.id, key: "toTarget", label: "ชี้ปลายทาง", type: "LOOKUP", options: { target: "CUSTOM", objectKey: "target" } });
  const n1 = await call(() => OBJ.update(ctx, owner, "target", { key: "target2" }));
  line("S3.neg", !n1.ok && n1.code === "VALIDATION" && n1.msg.includes("ต้นทาง"), `rename refused naming referencing object: ${n1.code} ${n1.msg.slice(0, 90)}`);
  await F.archiveField(fc("src"), lk.id);
  const n1b = await call(() => OBJ.update(ctx, owner, "target", { key: "target2" }));
  line("S3.note", true, `after archiving the LOOKUP field (row still has options.objectKey): rename ${n1b.ok ? "allowed" : `refused ${n1b.code}`}`);
  const n2 = await call(() => OBJ.update(ctx, owner, "src", { key: "src2" }));
  line("S3.pos", n2.ok, `rename of an unreferenced object allowed: ${n2.ok} ${n2.msg}`);

  // ── S4: CUSTOMER parent status ──
  await OBJ.create(ctx, owner, { key: "pet", label: "สัตว์", parentType: "CUSTOMER", titleFieldKey: "name" });
  const s4 = await F.createSection(fc("pet"), { key: "main", label: "หลัก" });
  await F.createField(fc("pet"), { sectionId: s4.id, key: "name", label: "ชื่อ", type: "TEXT" });
  const cust = async (status: string) => (await P.customer.create({ data: { tenantId: tid, memberSystemId: mem, name: `m ${status}`, partyId: await party(status), status } })).id;
  for (const st of ["MERGED", "CLOSED"]) {
    const r = await call(async () => OBJ.records.create(ctx, owner, "pet", { parentId: await cust(st), values: { name: "x" } }));
    line(`S4.neg.${st}`, !r.ok && r.code === "VALIDATION", `${st} member parent refused: ${r.code} ${r.msg.slice(0, 60)}`);
  }
  const rA = await call(async () => OBJ.records.create(ctx, owner, "pet", { parentId: await cust("ACTIVE"), values: { name: "y" } }));
  line("S4.pos", rA.ok, `ACTIVE member parent allowed: ${rA.ok} ${rA.msg}`);
} catch (e) {
  line("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 400));
} finally {
  if (tid) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string);
    for (let pass = 0; pass < 4; pass++) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => 0);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.tenant.delete({ where: { id: tid } }).catch(() => 0);
  }
  if (uid) await P.user.delete({ where: { id: uid } }).catch(() => 0);
  const left = tid ? await P.tenant.count({ where: { id: tid } }) : 0;
  console.log(`cleanup: tenant left=${left}`);
  console.log(`PROBE ${ok} pass · ${bad} fail`);
  await prisma.$disconnect();
}
