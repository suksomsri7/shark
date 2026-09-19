// probe-c110-review.mts — builder probe (ไม่ใช่ oracle) ของรีวิว C1.10: B1 · S1 · S2 · S3 · S4 · เครื่องมือ crm_create_lead รุ่นเดิม (v1)
// QC database only (.env.qc / .env.qc2 ผ่าน qc2.sh) · tenant ทิ้ง `qc-p110-<rand>-*` ลบใน finally
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c110-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log(`[env] DB ${env.loadQcEnv().host}`);
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-p110-${rand}`;
const results: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: unknown, detail: string) => {
  results.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
};
const TENANTS: string[] = [];
const USERS: string[] = [];
const KEYS: string[] = [];
const j = (v: unknown) => JSON.stringify(v);

const ROUTE = (await import("@/app/api/v1/crm/[...path]/route" as string)) as Any;
const TROUTE = (await import("@/app/api/v1/teams/[...path]/route" as string)) as Any;
const AITOOL = (await import("@/app/api/v1/ai/tools/[name]/route" as string)) as Any;
const AISKILL = (await import("@/app/api/v1/ai/skills/[id]/route" as string)) as Any;
const AK = (await import("@/lib/api-keys/service" as string)) as Any;
const SC = (await import("@/lib/api-keys/scopes" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const MEM = (await import("@/lib/modules/member" as string)) as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const PROP = (await import("@/lib/ai/proposals" as string)) as Any;

let seq = 0;
const call = async (mod: Any, base: string, method: string, path: string, key: string | null, body?: unknown, raw?: string): Promise<{ status: number; body: Any; text: string }> => {
  const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}) };
  if (method !== "GET") headers["idempotency-key"] = `${TAG}-${(seq += 1)}`;
  const b = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
  if (b !== undefined) headers["content-type"] = "application/json";
  const res: Response = await mod[method](new Request(`http://qc.invalid/api/v1/${base}${path}`, { method, headers, body: method === "GET" ? undefined : b }), {
    params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }),
  });
  const text = await res.text();
  let parsed: Any = null;
  try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
  return { status: res.status, body: parsed, text };
};
const api = (m: string, p: string, k: string | null, b?: unknown, raw?: string) => call(ROUTE, "crm", m, p, k, b, raw);

try {
  // ── fixtures ──
  const T = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string; TENANTS.push(T);
  const TV1 = (await P.tenant.create({ data: { name: `${TAG}-v1`, slug: `${TAG}-v1` } })).id as string; TENANTS.push(TV1);
  const mk = async (tid: string, sfx: string, role: string) => {
    const u = await P.user.create({ data: { email: `${TAG}-${sfx}@qc.invalid`, name: `QC ${sfx}` } }); USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: [], permissions: {}, acceptedAt: new Date() } });
    return u.id as string;
  };
  const owner = await mk(T, "owner", "OWNER");
  const ownerV1 = await mk(TV1, "ownerv1", "OWNER");
  const foreignUser = await mk(TV1, "foreign", "STAFF");
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  const SV1 = (await sysSvc.createSystem(TV1, "CRM", `CRM v1 ${TAG}`)).id as string;
  await P.appSystem.update({ where: { id: S }, data: { settings: { crm: { uiVersion: 2 } } } });
  await P.appSystem.update({ where: { id: SV1 }, data: { settings: { crm: { uiVersion: 1 } } } });
  const actorO = { userId: owner, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const cS = { tenantId: T, systemId: S, actorUserId: owner };
  const fctx = (objectKey: string) => ({ ...cS, objectKey, actor: actorO });
  // contact field (field-level sensitive in a NON-sensitive section) + object car with a field-level sensitive field
  const secC = await MEM.fields.createSection(fctx("contact"), { key: "p110x", label: "ส่วนทดสอบ" });
  await MEM.fields.createField(fctx("contact"), { sectionId: secC.id, key: "p110Secret", label: "ลับเฉพาะช่อง", type: "TEXT", sensitive: true });
  await MEM.fields.createField(fctx("contact"), { sectionId: secC.id, key: "p110Note", label: "บันทึก", type: "TEXT" });
  await CRM.objects.create(cS, actorO, { key: "car", label: "รถ", labelPlural: "รถ", parentType: "CONTACT", titleFieldKey: "plate" });
  const secR = await MEM.fields.createSection(fctx("car"), { key: "carx", label: "ข้อมูลรถ" });
  await MEM.fields.createField(fctx("car"), { sectionId: secR.id, key: "plate", label: "ทะเบียน", type: "TEXT" });
  await MEM.fields.createField(fctx("car"), { sectionId: secR.id, key: "vin", label: "เลขตัวถัง", type: "TEXT", sensitive: true });
  const SECRET = `ลับมาก${rand}`;
  const VIN = `VIN${rand}SECRET`;
  const PHONE_IN_TEXT = "081-234-5678";
  const MAIL_IN_TEXT = `p110.${rand}@mail.invalid`;
  const c = await CRM.contacts.createContact(cS, actorO, { firstName: `คุณพี ${rand}`, phone: "0891112233", fields: { p110Secret: SECRET, p110Note: `โทร ${PHONE_IN_TEXT} หรือ ${MAIL_IN_TEXT}` } });
  const contactId = c.contact.id as string;
  const rec = await CRM.objects.records.create(cS, actorO, "car", { parentId: contactId, values: { plate: `กข${rand}`, vin: VIN } });
  await CRM.activities.logActivity(cS, actorO, { type: "CALL", title: `โทรหา ${PHONE_IN_TEXT} ส่งเมล ${MAIL_IN_TEXT}`, contactId });

  const mkKey = async (tid: string, name: string, scopes: string[], systemId: string | null, by: string | null) => {
    const k = await AK.createApiKey({ tenantId: tid }, `${TAG} ${name}`, { scopes, systemId, createdById: by });
    KEYS.push(k.id); return k.rawKey as string;
  };
  const B = (id: string) => [...SC.API_SCOPE_BUNDLES.find((b: Any) => b.id === id).scopes];
  const kRO = await mkKey(T, "ro", B("crm.readonly"), S, owner);
  const kOP = await mkKey(T, "op", [...B("crm.operate"), "crm.contact.export"], S, owner);
  const kAD = await mkKey(T, "ad", B("crm.admin"), S, owner);
  const kLegacyV2 = await mkKey(T, "legacy-v2", [], null, owner);
  const kLegacyV1 = await mkKey(TV1, "legacy-v1", [], null, ownerV1);

  // ═══ B1 ═══
  const RT = CRM.crmApi;
  const vO = { tenantId: T, systemId: S, userId: owner, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const logs0 = await P.memberAccessLog.count({ where: { tenantId: T } });
  const q = await RT.runCrmTool(vO, "crm_records_query", { objectKey: "car", parentId: contactId });
  const c360 = await RT.runCrmTool(vO, "crm_contact_360", { contactId });
  const logs1 = await P.memberAccessLog.count({ where: { tenantId: T } });
  chk("B1-neg", "OWNER-asked crm_records_query + crm_contact_360: field-level sensitive values absent · no MemberAccessLog row",
    q.mode === "read" && c360.mode === "read" && !j(q).includes(VIN) && !j(c360).includes(SECRET) && logs1 === logs0, `q=${q.mode} vin=${j(q).includes(VIN)} c=${c360.mode} secret=${j(c360).includes(SECRET)} logs ${logs0}->${logs1}`);
  const direct = await CRM.objects.records.get(cS, actorO, "car", rec.id);
  const d360 = await CRM.contacts.getContact360(cS, actorO, contactId);
  chk("B1-pos", "positive control: the OWNER on the screen (service, human actor) still sees both values", j(direct).includes(VIN) && j(d360).includes(SECRET), `vin=${j(direct).includes(VIN)} secret=${j(d360).includes(SECRET)}`);

  // ═══ S1 ═══
  const exOp = await api("POST", "/contacts/export", kOP, { confirm: true, reason: "ทดสอบส่งออก" });
  const exRecOp = await api("POST", "/objects/car/records/export", kOP, { confirm: true, reason: "ทดสอบส่งออก" });
  chk("S1-neg", "operate key (even holding crm.contact.export) → 403 on contacts.export + records.export", exOp.status === 403 && exRecOp.status === 403, `${exOp.status} ${exRecOp.status}`);
  const exAd = await api("POST", "/contacts/export", kAD, { confirm: true, reason: "ทดสอบส่งออก" });
  const exRecAd = await api("POST", "/objects/car/records/export", kAD, { confirm: true, reason: "ทดสอบส่งออก" });
  chk("S1-pos", "admin key → 200 {csv} on both", exAd.status === 200 && exRecAd.status === 200 && typeof exAd.body?.data?.csv === "string", `${exAd.status} ${exRecAd.status}`);

  // ═══ S2 ═══
  const team = (await P.team.create({ data: { tenantId: T, name: `ทีม ${TAG}` } })).id as string;
  await P.teamMember.create({ data: { tenantId: T, teamId: team, userId: owner, role: "MEMBER" } });
  const m2 = await mk(T, "m2", "STAFF");
  const ev0 = await P.outboxEvent.count({ where: { tenantId: T, type: "team.updated" } });
  const bad = await call(TROUTE, "teams", "PUT", `/${team}/members`, kAD, { members: [{ userId: m2, role: "MEMBER" }, { userId: foreignUser, role: "MEMBER" }] });
  const after = (await P.teamMember.findMany({ where: { teamId: team } })).map((x: Any) => x.userId).sort();
  const ev1 = await P.outboxEvent.count({ where: { tenantId: T, type: "team.updated" } });
  chk("S2-neg", "members.set with a user of ANOTHER tenant → refused (4xx) · members unchanged · no event", bad.status >= 400 && bad.status < 500 && j(after) === j([owner]) && ev1 === ev0, `${bad.status} members=${after.length} ev ${ev0}->${ev1}`);
  const good = await call(TROUTE, "teams", "PUT", `/${team}/members`, kAD, { members: [{ userId: m2, role: "LEAD", acceptingLeads: false }] });
  const after2 = (await P.teamMember.findMany({ where: { teamId: team } })) as Any[];
  const ev2 = await P.outboxEvent.count({ where: { tenantId: T, type: "team.updated" } });
  const trow = await P.team.findUnique({ where: { id: team } });
  chk("S2-pos", "valid set → owner removed · m2 LEAD (acceptingLeads false · Team.leadUserId) · exactly ONE team.updated", good.status === 200 && after2.length === 1 && after2[0].userId === m2 && after2[0].role === "LEAD" && after2[0].acceptingLeads === false && trow.leadUserId === m2 && ev2 - ev1 === 1, `${good.status} n=${after2.length} ev+${ev2 - ev1}`);

  // ═══ S3 ═══
  const big = JSON.stringify({ firstName: "ใหญ่", jobTitle: "x".repeat(1024 * 1024 + 10) });
  const r413 = await api("POST", "/contacts", kAD, undefined, big);
  const cols: Record<string, string> = {};
  for (let i = 0; i < 201; i += 1) cols[`c${i}`] = "x";
  const r201 = await api("POST", "/contacts/import", kAD, { rows: [cols], mapping: { c0: "firstName" } });
  chk("S3-neg", "1 MB+ body → 413 payload_too_large · import row with 201 columns → 422", r413.status === 413 && r413.body?.error?.code === "payload_too_large" && r201.status === 422, `${r413.status}/${r413.body?.error?.code} ${r201.status}`);
  const rows = Array.from({ length: 900 }, (_x, i) => ({ ชื่อ: `นำเข้า${rand}-${i}-${"ก".repeat(400)}` }));
  const bigImport = JSON.stringify({ rows, mapping: { ชื่อ: "firstName" } });
  const rImp = await api("POST", "/contacts/import", kAD, undefined, bigImport);
  chk("S3-pos", `contacts.import with a ${(Buffer.byteLength(bigImport) / 1024 / 1024).toFixed(1)} MB body (> 1 MB, < 10 MB) is NOT refused for size`, rImp.status !== 413, `${rImp.status} ${rImp.text.slice(0, 120)}`);

  // ═══ S4 ═══
  const g = await api("GET", `/contacts/${contactId}`, kRO);
  const acts = await api("GET", `/activities?contactId=${contactId}`, kRO);
  const leakRO = [PHONE_IN_TEXT, MAIL_IN_TEXT, "0891112233"].filter((x) => g.text.includes(x) || acts.text.includes(x));
  chk("S4-neg", "readonly key: phone/e-mail patterns inside a custom TEXT field and an activity title are masked (plus the phone column)", g.status === 200 && acts.status === 200 && leakRO.length === 0, `${g.status} ${acts.status} leaks=${leakRO.join(",")}`);
  const gOp = await api("GET", `/contacts/${contactId}`, kOP);
  chk("S4-pos", "operate key sees the same text unmasked (positive control)", gOp.status === 200 && gOp.text.includes(PHONE_IN_TEXT) && gOp.text.includes(MAIL_IN_TEXT), `${gOp.status}`);

  // ═══ v1 legacy crm_create_lead ═══
  const skillReq = (key: string) => AISKILL.GET(new Request("http://qc.invalid/api/v1/ai/skills/crm", { headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({ id: "crm" }) });
  const s1 = await skillReq(kLegacyV1);
  const s1b = (await s1.json()) as Any;
  const leadDef = (s1b.tools ?? []).find((t: Any) => t.function?.name === "crm_create_lead");
  const toolPost = (key: string, args: unknown) =>
    AITOOL.POST(new Request("http://qc.invalid/api/v1/ai/tools/crm_create_lead", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ args }) }), { params: Promise.resolve({ name: "crm_create_lead" }) });
  const leadName = `ลีดรุ่นเดิม ${rand}`;
  const t1 = await toolPost(kLegacyV1, { name: leadName, phone: "0812223344", note: "โน้ตรุ่นเดิม" });
  const t1b = (await t1.json()) as Any;
  const pid = JSON.parse(String(t1b.result ?? "{}")).proposalId as string | undefined;
  const prow = pid ? await P.aiProposal.findUnique({ where: { id: pid } }) : null;
  const exec = pid ? await PROP.executeProposal({ role: "OWNER", unitAccess: [], permissions: {} }, { tenantId: TV1 }, pid, { userId: ownerV1 }) : null;
  const leadRows = await P.crmContact.count({ where: { tenantId: TV1, systemId: SV1, name: leadName } });
  chk("V1-pos", "legacy EMPTY-scope key on a v1 shop: manifest lists crm_create_lead with the OLD schema (name/phone/email) · POST creates proposal kind crm_create_lead carrying the note · executes → contact",
    s1.status === 200 && !!leadDef && j(Object.keys(leadDef.function.parameters.properties)) === j(["name", "phone", "email"]) && t1.status === 200 && prow?.kind === "crm_create_lead" && prow?.payload?.note === "โน้ตรุ่นเดิม" && exec?.ok === true && leadRows === 1,
    `skill=${s1.status} def=${!!leadDef} tool=${t1.status} kind=${prow?.kind} note=${prow?.payload?.note} exec=${j(exec)} rows=${leadRows}`);
  const s2 = await skillReq(kLegacyV2);
  const s2b = (await s2.json()) as Any;
  const listed2 = (s2b.tools ?? []).some((t: Any) => t.function?.name === "crm_create_lead");
  const t2 = await toolPost(kLegacyV2, { name: `แอบ ${rand}` });
  chk("V1-neg", "the same kind of empty-scope key on a v2 shop: crm_create_lead NOT in the crm manifest (the 3 unscoped legacy tools may stay) · POST crm_create_lead → 403", !listed2 && t2.status === 403, `skill=${s2.status} listed=${listed2} tool=${t2.status}`);
} catch (e) {
  chk("FATAL", "probe ran to the end", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  for (const k of KEYS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${k}`).catch(() => undefined);
  if (ids.length) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => undefined);
    for (const id of ids) {
      await P.appSystemUnit.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await P.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    for (const u of USERS) await P.appNotification.deleteMany({ where: { recipientUserId: u } }).catch(() => undefined);
    for (const u of USERS) await P.user.delete({ where: { id: u } }).catch(() => undefined);
    const left = await P.tenant.count({ where: { id: { in: ids } } });
    chk("CLEAN", "throwaway tenants removed", left === 0, `left=${left}`);
  }
  await prisma.$disconnect();
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? "🟢" : "🔴"} probe-c110-review: ${passed}/${results.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: results.length, passed, findings: results.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === results.length ? 0 : 1);
