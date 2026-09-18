// probe-c14-review.mts — หลักฐานรอบแก้รีวิว C1.4 (B1 a/b/c + setOptOut ฝั่งสมาชิก · S1 · S2 · S3) · positive + negative ต่อข้อ
// QC DB เท่านั้น (.env.qc) · tenant ทิ้งได้ `qc-c14rv-<rand>` ลบใน finally · ไม่ drain outbox
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c14-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const CT = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const CS = (await import("@/lib/modules/crm/consents" as string)) as Any;
const MEM = (await import("@/lib/modules/member" as string)) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c14rv-${rand}`;
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
let seq = 0;
const phoneOf = () => `08${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}${seq++ % 10}`.slice(0, 10);
const mailOf = (s: string) => `${TAG}-${s}@qc-crm.example`;

console.log(`\n═══ probe C1.4 review · DB ${host} · ${TAG} ═══`);
const users: string[] = [];
let tid = "";
try {
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  const owner = (await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: TAG } })).id as string;
  users.push(owner);
  await P.membership.create({ data: { userId: owner, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  const mem = (await sysSvc.createSystem(tid, "MEMBER", `MEM ${TAG}`)).id as string;
  const cx = { tenantId: tid, systemId: crm, actorUserId: owner };
  const mx = { tenantId: tid, systemId: mem, actorUserId: owner };
  const OWN = { userId: owner, role: "OWNER", unitAccess: [] as string[], permissions: {} };
  const row = (id: string) => P.crmContact.findFirst({ where: { id } });
  const mkContact = async (first: string, extra: Record<string, Any> = {}) => (await CT.createContact(cx, OWN, { firstName: `${first} ${rand}`, phone: phoneOf(), email: mailOf(first.replace(/\s/g, "")), force: true, ...extra })).contact.id as string;
  const mc = async (customerId: string | null | undefined, ch: string) => (await P.memberConsent.findFirst({ where: { customerId: customerId ?? "-", channel: ch } }))?.granted ?? null;
  const conv = (id: string, k: string, extra: Record<string, Any> = {}) => call(CT.convertContact, cx, OWN, id, { idempotencyKey: `${TAG}-${k}`, member: { systemId: mem }, ...extra });
  const can = async (id: string, ch: string) => CS.canContact(await row(id), ch, {});
  const pipe = await P.crmPipeline.create({
    data: { tenantId: tid, systemId: crm, name: `ขาย ${TAG}`, isDefault: true, stages: { create: [{ tenantId: tid, systemId: crm, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }] } },
  });

  // ── B1 (a) convert สร้างสมาชิกใหม่ ──
  {
    const k = await mkContact("บีหนึ่งเอ");
    await CS.set(cx, OWN, k, { channel: "EMAIL", granted: true, source: "STAFF" });
    await CS.set(cx, OWN, k, { channel: "LINE", granted: true, source: "STAFF" });
    await CT.setOptOut(cx, OWN, k, { optOut: true, source: "STAFF" });
    const r = await conv(k, "a1");
    const vals = await Promise.all(["EMAIL", "LINE", "SMS", "PHONE"].map((ch) => mc(r.v?.customerId, ch)));
    chk("B1a+ convert → new member: marketingOptOut turns every channel into a revoke on the member (CRM grants EMAIL/LINE NOT carried)", r.ok && vals.every((v) => v === false), `${r.msg} EMAIL/LINE/SMS/PHONE=${vals.join("/")}`);
    const k2 = await mkContact("บีหนึ่งเอลบ");
    await CS.set(cx, OWN, k2, { channel: "EMAIL", granted: true, source: "STAFF" });
    await CS.set(cx, OWN, k2, { channel: "SMS", granted: false, source: "STAFF" });
    const r2 = await conv(k2, "a2");
    chk("B1a− control: no opt-out ⇒ CRM grant copied (EMAIL true) · CRM revoke copied (SMS false) · untouched channel not invented (LINE null)",
      r2.ok && (await mc(r2.v?.customerId, "EMAIL")) === true && (await mc(r2.v?.customerId, "SMS")) === false && (await mc(r2.v?.customerId, "LINE")) === null,
      `${r2.msg} EMAIL=${await mc(r2.v?.customerId, "EMAIL")} SMS=${await mc(r2.v?.customerId, "SMS")} LINE=${await mc(r2.v?.customerId, "LINE")}`);
  }

  // ── B1 (b) convert ผูกสมาชิกที่มีอยู่แล้ว ──
  {
    const ph = phoneOf();
    const m = await MEM.createMember(mx, OWN, { firstName: `สมาชิกเดิม ${rand}`, phone: ph, source: "WALK_IN", consents: [{ channel: "EMAIL", granted: true, source: "STAFF" }, { channel: "SMS", granted: false, source: "STAFF" }] });
    const k = await mkContact("บีสอง", { phone: ph });
    await CS.set(cx, OWN, k, { channel: "EMAIL", granted: false, source: "STAFF" });
    await CS.set(cx, OWN, k, { channel: "SMS", granted: true, source: "STAFF" });
    const r = await conv(k, "b1");
    chk("B1b+ convert links an EXISTING member (same phone) and applies the CRM EMAIL revoke to it (EMAIL true → false)",
      r.ok && r.v?.customerId === m.customerId && (await mc(m.customerId, "EMAIL")) === false, `${r.msg} linked=${r.v?.customerId === m.customerId} EMAIL=${await mc(m.customerId, "EMAIL")}`);
    chk("B1b− never grant: the CRM SMS grant does NOT lift the member's SMS refusal (stays false)", (await mc(m.customerId, "SMS")) === false, `SMS=${await mc(m.customerId, "SMS")}`);
    const convAudit = await P.auditLog.count({ where: { tenantId: tid, action: "member.privacy.consent", targetId: m.customerId } });
    chk("B1b+ the in-transaction revoke is audited after commit (member.privacy.consent · via crm.contact.convert)", convAudit >= 1, `audits=${convAudit}`);
  }

  // ── B1 (b) ถอนไม่สำเร็จ ⇒ การแปลงทั้งก้อนย้อนกลับ (atomic) ──
  {
    const ph = phoneOf();
    const m = await MEM.createMember(mx, OWN, { firstName: `สมาชิกบังคับล้ม ${rand}`, phone: ph, source: "WALK_IN", consents: [{ channel: "EMAIL", granted: true, source: "STAFF" }] });
    const k = await mkContact("บีสองล้ม", { phone: ph });
    await CS.set(cx, OWN, k, { channel: "EMAIL", granted: false, source: "STAFF" });
    const before = JSON.stringify(await row(k));
    const trig = `qc_c14rv_${rand}`;
    let r: Any;
    try {
      await P.$executeRawUnsafe(
        `CREATE FUNCTION ${trig}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."customerId" = '${m.customerId}' AND NEW."granted" = false THEN RAISE EXCEPTION 'qc-c14rv forced revoke failure'; END IF; RETURN NEW; END $$`,
      );
      await P.$executeRawUnsafe(`CREATE TRIGGER ${trig} BEFORE INSERT OR UPDATE ON "MemberConsent" FOR EACH ROW EXECUTE FUNCTION ${trig}_fn()`);
      r = await conv(k, "b-fail", { deal: { pipelineId: pipe.id, title: `ดีลล้ม ${rand}` } });
    } finally {
      await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trig} ON "MemberConsent"`).catch(() => 0);
      await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${trig}_fn()`).catch(() => 0);
    }
    const deals = await P.crmDeal.count({ where: { contactId: k } });
    const ev = await P.outboxEvent.count({ where: { tenantId: tid, type: "crm.contact.converted", idempotencyKey: { startsWith: `crm.contact.converted#${k}#` } } });
    chk("B1b− forced member-revoke failure ⇒ the WHOLE convert rolls back with a calm Thai CONFLICT (contact byte-identical · no deal · no event · member EMAIL still true)",
      !r.ok && r.code === "CONFLICT" && /[ก-๙]/.test(r.msg) && JSON.stringify(await row(k)) === before && deals === 0 && ev === 0 && (await mc(m.customerId, "EMAIL")) === true,
      `code=${r.code} same=${JSON.stringify(await row(k)) === before} deals=${deals} events=${ev} EMAIL=${await mc(m.customerId, "EMAIL")}`);
    const r2 = await conv(k, "b-fail");
    chk("B1b+ retry after the failure (trigger gone) converts and revokes", r2.ok && (await mc(m.customerId, "EMAIL")) === false, `${r2.msg} EMAIL=${await mc(m.customerId, "EMAIL")}`);
  }

  // ── B1 (c) รวมผู้ติดต่อ ──
  {
    const keep = await mkContact("เก็บซี");
    const drop = await mkContact("รวมซี");
    await CS.set(cx, OWN, keep, { channel: "EMAIL", granted: true, source: "STAFF" });
    await CS.set(cx, OWN, drop, { channel: "EMAIL", granted: false, source: "STAFF" });
    await CS.set(cx, OWN, drop, { channel: "LINE", granted: true, source: "STAFF" });
    const r = await call(CT.mergeContacts, cx, OWN, { keepId: keep, mergeId: drop, confirm: true, reason: "ทดสอบรวมความยินยอม" });
    chk("B1c+ merge (non-member keep): the dropped contact's EMAIL revoke carries over — canContact(keep, EMAIL) false", r.ok && (await can(keep, "EMAIL")) === false, `${r.msg} can=${await can(keep, "EMAIL")}`);
    chk("B1c− never grant: the dropped contact's LINE grant is NOT given to keep (canContact LINE false)", (await can(keep, "LINE")) === false, `LINE=${await can(keep, "LINE")}`);
    // keep ผูกสมาชิก · drop ขอไม่รับ
    const keep2 = await mkContact("เก็บซีสมาชิก");
    await CS.set(cx, OWN, keep2, { channel: "EMAIL", granted: true, source: "STAFF" });
    const cv = await conv(keep2, "c2");
    const drop2 = await mkContact("รวมซีไม่รับ");
    await CT.setOptOut(cx, OWN, drop2, { optOut: true, source: "STAFF" });
    const before = await mc(cv.v?.customerId, "EMAIL");
    const r2 = await call(CT.mergeContacts, cx, OWN, { keepId: keep2, mergeId: drop2, confirm: true, reason: "ทดสอบรวมสมาชิก" });
    chk("B1c+ merge (member-linked keep): the dropped contact's opt-out revokes the member's EMAIL through the member facade (true → false)",
      cv.ok && r2.ok && before === true && (await mc(cv.v?.customerId, "EMAIL")) === false, `${cv.msg}${r2.msg} before=${before} after=${await mc(cv.v?.customerId, "EMAIL")}`);
  }

  // ── setOptOut ของผู้ติดต่อที่ผูกสมาชิก ──
  {
    const k = await mkContact("ไม่รับสมาชิก");
    await CS.set(cx, OWN, k, { channel: "EMAIL", granted: true, source: "STAFF" });
    await CS.set(cx, OWN, k, { channel: "LINE", granted: true, source: "STAFF" });
    const cv = await conv(k, "oo");
    const b = [await mc(cv.v?.customerId, "EMAIL"), await mc(cv.v?.customerId, "LINE")];
    const o = await call(CT.setOptOut, cx, OWN, k, { optOut: true, source: "STAFF" });
    const a1 = [await mc(cv.v?.customerId, "EMAIL"), await mc(cv.v?.customerId, "LINE")];
    chk("OPT+ member-linked setOptOut(true) revokes every marketing channel on the member (EMAIL/LINE true → false) · canContact false",
      cv.ok && o.ok && b.every((x) => x === true) && a1.every((x) => x === false) && (await can(k, "EMAIL")) === false, `${o.msg} before=${b.join("/")} after=${a1.join("/")}`);
    const o2 = await call(CT.setOptOut, cx, OWN, k, { optOut: false, source: "STAFF" });
    chk("OPT− setOptOut(false) never re-grants on the member (EMAIL stays false) · CRM mirror column follows", o2.ok && (await mc(cv.v?.customerId, "EMAIL")) === false && (await row(k))?.marketingOptOut === false,
      `${o2.msg} EMAIL=${await mc(cv.v?.customerId, "EMAIL")} col=${(await row(k))?.marketingOptOut}`);
  }

  // ── S1 Party ผู้ถือคนเดียว ──
  {
    const ph = phoneOf();
    const m = await MEM.createMember(mx, OWN, { firstName: `สมาชิกพาร์ตี้ ${rand}`, phone: ph, email: mailOf("sharedparty"), source: "WALK_IN" });
    const k = await mkContact("พาร์ตี้ร่วม", { phone: ph, email: null });
    const p0 = (await row(k))?.partyId;
    const shared = p0 === m.partyId;
    const u = await call(CT.updateContact, cx, OWN, k, { email: mailOf("newmail-s1") });
    const party0 = await P.party.findFirst({ where: { id: p0 } });
    const r1 = await row(k);
    chk("S1+ contact shares its Party with a member: updateContact(email) does NOT write the shared Party (email unchanged · personParty(new keys) resolves by the unchanged phone)",
      shared && u.ok && party0?.email === mailOf("sharedparty"), `${u.msg} shared=${shared} partyMail=${party0?.email} partyNow=${r1?.partyId === p0 ? "same (phone key)" : "re-pointed"}`);
    const np = phoneOf();
    const u1 = await call(CT.updateContact, cx, OWN, k, { phone: np });
    const party0a = await P.party.findFirst({ where: { id: p0 } });
    const r1b = await row(k);
    chk("S1+ phone change on a shared Party ⇒ contact re-pointed to personParty(new phone) · shared Party phone untouched",
      u1.ok && r1b?.partyId !== p0 && party0a?.phone === ph, `${u1.msg} repointed=${r1b?.partyId !== p0} sharedPhone=${party0a?.phone === ph ? "unchanged" : party0a?.phone}`);
    const u2 = await call(CT.updateContact, cx, OWN, k, { phone: null });
    const party0b = await P.party.findFirst({ where: { id: p0 } });
    chk("S1+ clearing the phone never nulls the shared Party's phone", u2.ok && !!party0b?.phone, `${u2.msg} sharedPhone=${party0b?.phone ? "kept" : "NULLED"}`);
    const k2 = await mkContact("พาร์ตี้เดี่ยว");
    const p2 = (await row(k2))?.partyId;
    const u3 = await call(CT.updateContact, cx, OWN, k2, { email: mailOf("sole-new") });
    const party2 = await P.party.findFirst({ where: { id: p2 } });
    chk("S1− sole holder: the Party itself is updated (email synced) and the contact keeps it", u3.ok && party2?.email === mailOf("sole-new") && (await row(k2))?.partyId === p2, `${u3.msg} partyMail=${party2?.email}`);
  }

  // ── S2 รวมผู้ติดต่อที่ Party ผูกกับสมาชิกคนละคน ──
  {
    const pa = phoneOf();
    const pb = phoneOf();
    await MEM.createMember(mx, OWN, { firstName: `สมาชิกเอ ${rand}`, phone: pa, source: "WALK_IN" });
    await MEM.createMember(mx, OWN, { firstName: `สมาชิกบี ${rand}`, phone: pb, source: "WALK_IN" });
    const ka = await mkContact("สองพาร์ตี้เอ", { phone: pa, email: null });
    const kb = await mkContact("สองพาร์ตี้บี", { phone: pb, email: null });
    const r = await call(CT.mergeContacts, cx, OWN, { keepId: ka, mergeId: kb, confirm: true, reason: "ทดสอบพาร์ตี้สองคน" });
    chk("S2+ merge refused (VALIDATION, Thai) when the two Parties belong to different members — nothing merged",
      !r.ok && r.code === "VALIDATION" && /[ก-๙]/.test(r.msg) && !(await row(kb))?.mergedIntoId, `code=${r.code} merged=${!!(await row(kb))?.mergedIntoId}`);
    const kc = await mkContact("พาร์ตี้ปกติเอ");
    const kd = await mkContact("พาร์ตี้ปกติบี");
    const r2 = await call(CT.mergeContacts, cx, OWN, { keepId: kc, mergeId: kd, confirm: true, reason: "ทดสอบพาร์ตี้ปกติ" });
    chk("S2− control: Parties with no member/account holder merge normally", r2.ok && (await row(kd))?.mergedIntoId === kc, `${r2.msg}`);
  }

  // ── S3 convert แข่งกับ merge / consents.set ──
  {
    let leftDeals = 0;
    let rounds = "";
    // หน่วงการรวม 0 · 150 · 300 · 450 · 600 ms เพื่อให้ได้ทั้งลำดับ "รวมก่อน" และ "แปลงก่อน/ซ้อนกัน"
    for (let i = 0; i < 5; i += 1) {
      const keep = await mkContact(`แข่งเก็บ ${i}`);
      const drop = await mkContact(`แข่งรวม ${i}`);
      const [c, m] = await Promise.all([
        conv(drop, `race-m-${i}`, { member: undefined, deal: { pipelineId: pipe.id, title: `ดีลแข่ง ${i}` } }),
        new Promise((r) => setTimeout(r, i * 150)).then(() => call(CT.mergeContacts, cx, OWN, { keepId: keep, mergeId: drop, confirm: true, reason: "ทดสอบแข่งรวม" })),
      ]);
      const n = await P.crmDeal.count({ where: { contactId: drop } });
      leftDeals += n;
      rounds += ` r${i}:conv=${c.ok ? "ok" : c.code} merge=${m.ok ? "ok" : m.code} dealsOnDropped=${n}`;
    }
    chk("S3+ convert ∥ merge(drop = same contact) × 5 (staggered): no deal is ever left on a merged contact (convert re-reads after the row lock)", leftDeals === 0, rounds);
    const keep = await mkContact("แข่งหลังรวมเก็บ");
    const drop = await mkContact("แข่งหลังรวมทิ้ง");
    await CT.mergeContacts(cx, OWN, { keepId: keep, mergeId: drop, confirm: true, reason: "ทดสอบรวมก่อนแปลง" });
    const late = await conv(drop, "late", { member: undefined, deal: { pipelineId: pipe.id, title: "ดีลช้า" } });
    chk("S3− control: convert of an already merged contact is refused", !late.ok && ["VALIDATION", "NOT_FOUND"].includes(late.code), `code=${late.code}`);

    let stray = 0;
    let rs = "";
    for (let i = 0; i < 3; i += 1) {
      const k = await mkContact(`แข่งยินยอม ${i}`);
      await CS.set(cx, OWN, k, { channel: "EMAIL", granted: true, source: "STAFF" });
      const [c, s] = await Promise.all([conv(k, `race-c-${i}`), call(CS.set, cx, OWN, k, { channel: "EMAIL", granted: false, source: "STAFF" })]);
      const r = await row(k);
      const after = r?.convertedAt ? await P.crmContactConsent.count({ where: { contactId: k, createdAt: { gt: r.convertedAt } } }) : 0;
      const em = await mc(c.v?.customerId, "EMAIL");
      stray += after + (em === false ? 0 : 1);
      rs += ` r${i}:conv=${c.ok ? "ok" : c.code} set=${s.ok ? s.v?.via : s.code} crmRowsAfterConvert=${after} memberEMAIL=${em}`;
    }
    chk("S3+ convert ∥ consents.set(EMAIL=false) × 3: the revoke always lands in exactly one source (no CRM row after convert · member EMAIL false)", stray === 0, rs);
    const k = await mkContact("ยินยอมหลังแปลง");
    const cv = await conv(k, "seq");
    const s2 = await call(CS.set, cx, OWN, k, { channel: "EMAIL", granted: false, source: "STAFF" });
    chk("S3− control: consents.set after convert goes to the member (via MEMBER) and writes no CRM row", cv.ok && s2.ok && s2.v?.via === "MEMBER" && (await P.crmContactConsent.count({ where: { contactId: k } })) === 0, `via=${s2.v?.via}`);
  }
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (/^[a-z0-9]+$/i.test(tid)) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string);
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tables) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = '${tid}'`).catch(() => 0);
    await P.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.tenant.delete({ where: { id: tid } }).catch(() => 0);
  }
  for (const u of users) await P.user.delete({ where: { id: u } }).catch(() => 0);
  const left = tid ? await P.tenant.count({ where: { id: tid } }) : 0;
  const leftU = await P.user.count({ where: { id: { in: users } } });
  chk("CLEAN", left === 0 && leftU === 0, `tenant=${left} users=${leftU}`);
  await P.$disconnect();
}
const passed = out.filter((c) => c.ok).length;
console.log(`\n${passed === out.length ? "🟢" : "🔴"} probe C1.4 review: ${passed}/${out.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: out.length, passed, findings: out.filter((c) => !c.ok).map((c) => c.id) })}`);
process.exit(passed === out.length ? 0 : 1);
