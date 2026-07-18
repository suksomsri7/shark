// QC — Member public signup + updateCustomer (backoffice edit)
// ครอบคลุม: updateCustomer (แก้ชื่อ/เบอร์ · เบอร์ชน → throw · cross-tenant → ไม่แตะ)
//          resolveMemberUnit (public resolve · cross-tenant · ไม่มีระบบสมาชิก)
//          findOrCreate public signup (source SELF · memberCode · marketingConsent · dedup)
//          rate limit (ยิงเกิน → บล็อก)
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const member = await import("@/lib/modules/member/service");
const sys = await import("@/lib/modules/system/service");
const { checkRateLimit, resetRateLimit } = await import("@/lib/core/rate-limit");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const checks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};
const throws = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
};

let tenantId = "";
let tenantId2 = "";
try {
  console.log("── SETUP ──");
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC Member", slug: `qc-member-${stamp}` } });
  tenantId = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId, type: "BOOKING", name: "ร้านตัดผม", slug: "barber" },
  });
  const memSys = await sys.createSystem(tenantId, "MEMBER", "ระบบสมาชิกบาร์เบอร์");
  await sys.linkUnit(tenantId, memSys.id, unit.id);

  // ── resolveMemberUnit ──
  console.log("\n── resolveMemberUnit (public) ──");
  const r = await member.resolveMemberUnit(t.slug, "barber");
  chk("RES-1", "resolve unit ที่ผูกระบบสมาชิก → คืน memberSystemId ตรง", !!r && r.memberSystemId === memSys.id, memSys.id, String(r?.memberSystemId));
  const rCross = await member.resolveMemberUnit(`qc-nope-${stamp}`, "barber");
  chk("RES-2", "cross-tenant: tenant ผิด → null", rCross === null, "null", String(rCross));
  const rBadUnit = await member.resolveMemberUnit(t.slug, "not-a-unit");
  chk("RES-3", "unit ไม่มี → null", rBadUnit === null, "null", String(rBadUnit));

  // unit อีกตัวไม่ผูกระบบสมาชิก → resolve = null
  const unitNoMem = await prisma.businessUnit.create({
    data: { tenantId, type: "BOOKING", name: "สาขาไร้ระบบ", slug: "nomem" },
  });
  const rNoLink = await member.resolveMemberUnit(t.slug, "nomem");
  chk("RES-4", "unit ไม่ผูกระบบสมาชิก → null", rNoLink === null, "null", String(rNoLink));

  // paused unit → null
  await prisma.businessUnit.update({ where: { id: unitNoMem.id }, data: { status: "PAUSED" } });
  const rPaused = await member.resolveMemberUnit(t.slug, "nomem");
  chk("RES-5", "unit PAUSED → null", rPaused === null, "null", String(rPaused));

  // ── public signup ผ่าน findOrCreate (source SELF) ──
  console.log("\n── public signup (findOrCreate SELF) ──");
  const c1 = await member.findOrCreate({
    tenantId, memberSystemId: memSys.id, name: "สมชาย ใจดี", phone: "0812345678",
    source: "SELF", consents: ["marketing"],
  });
  chk("SIGN-1", "สมัคร → customer เกิด + memberCode 6 ตัว", !!c1.id && !!c1.memberCode && c1.memberCode.length === 6, "id+code(6)", `${c1.id ? "id" : "-"}/${c1.memberCode}`);
  chk("SIGN-2", "ยินยอมข่าวสาร → marketingConsent=true + consentAt ตั้ง", c1.marketingConsent === true && c1.consentAt !== null, "true/ตั้ง", `${c1.marketingConsent}/${c1.consentAt !== null}`);

  // ไม่ยินยอม → false + consentAt null
  const c2 = await member.findOrCreate({
    tenantId, memberSystemId: memSys.id, name: "สมหญิง", phone: "0899999999",
    source: "SELF", consents: [],
  });
  chk("SIGN-3", "ไม่ติ๊กยินยอม → marketingConsent=false + consentAt null", c2.marketingConsent === false && c2.consentAt === null, "false/null", `${c2.marketingConsent}/${c2.consentAt}`);

  // dedup: สมัครเบอร์ซ้ำ → คืนคนเดิม (ไม่งอก)
  const c1dup = await member.findOrCreate({
    tenantId, memberSystemId: memSys.id, name: "สมชาย (ซ้ำ)", phone: "0812345678", source: "SELF",
  });
  chk("SIGN-4", "dedup เบอร์ซ้ำ → คืน customer เดิม (id เดียวกัน)", c1dup.id === c1.id, c1.id, c1dup.id);
  const total = await prisma.customer.count({ where: { memberSystemId: memSys.id } });
  chk("SIGN-5", "dedup ไม่งอก record (มี 2 คน)", total === 2, "2", String(total));

  // ── updateCustomer ──
  console.log("\n── updateCustomer (backoffice edit) ──");
  const u1 = await member.updateCustomer({ tenantId }, c1.id, { name: "สมชาย แก้ชื่อ", phone: "0810000001" });
  chk("UPD-1", "แก้ชื่อ/เบอร์สำเร็จ", u1.name === "สมชาย แก้ชื่อ" && u1.phone === "0810000001", "แก้ชื่อ/0810000001", `${u1.name}/${u1.phone}`);

  // เบอร์ชนสมาชิกอื่นในระบบเดียวกัน → throw
  const eDup = await throws(() => member.updateCustomer({ tenantId }, c1.id, { phone: "0899999999" }));
  chk("UPD-2", "แก้เบอร์ชนสมาชิกอื่น → throw ไทย", !!eDup && /เบอร์/.test(eDup), "throw เบอร์...", String(eDup));

  // ลบทั้งชื่อและเบอร์ → throw (ต้องเหลือ ≥1)
  const eEmpty = await throws(() => member.updateCustomer({ tenantId }, c1.id, { name: "", phone: "" }));
  chk("UPD-3", "ลบทั้งชื่อ+เบอร์ → throw", !!eEmpty && /ชื่อหรือเบอร์/.test(eEmpty), "throw", String(eEmpty));

  // marketingConsent ถอนยินยอม → false + consentAt null
  const u2 = await member.updateCustomer({ tenantId }, c1.id, { marketingConsent: false });
  chk("UPD-4", "ถอนยินยอม → marketingConsent=false + consentAt null", u2.marketingConsent === false && u2.consentAt === null, "false/null", `${u2.marketingConsent}/${u2.consentAt}`);

  // email dedup
  await member.updateCustomer({ tenantId }, c2.id, { email: "somying@example.com" });
  const eMail = await throws(() => member.updateCustomer({ tenantId }, c1.id, { email: "somying@example.com" }));
  chk("UPD-5", "แก้อีเมลชนสมาชิกอื่น → throw ไทย", !!eMail && /อีเมล/.test(eMail), "throw อีเมล...", String(eMail));

  // ── cross-tenant: tenant อื่นแก้ไม่ได้ ──
  console.log("\n── cross-tenant isolation ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC Member 2", slug: `qc-member2-${stamp}` } });
  tenantId2 = t2.id;
  const eCross = await throws(() => member.updateCustomer({ tenantId: tenantId2 }, c1.id, { name: "แฮก" }));
  chk("XT-1", "tenant อื่นเรียก updateCustomer → throw (ไม่พบ)", !!eCross && /ไม่พบ/.test(eCross), "throw ไม่พบ", String(eCross));
  const c1after = await prisma.customer.findUnique({ where: { id: c1.id } });
  chk("XT-2", "ข้อมูล c1 ไม่ถูกแตะจาก cross-tenant", c1after?.name === "สมชาย แก้ชื่อ", "สมชาย แก้ชื่อ", String(c1after?.name));

  // ── rate limit (ตรรกะเดียวกับ action) ──
  console.log("\n── rate limit ──");
  const rlKey = `member-signup:${t.slug}:barber:1.2.3.4`;
  resetRateLimit(rlKey);
  const results: boolean[] = [];
  for (let i = 0; i < 6; i++) results.push(checkRateLimit(rlKey, { limit: 5, windowMs: 60_000 }).ok);
  chk("RL-1", "5 ครั้งแรกผ่าน", results.slice(0, 5).every((x) => x), "true×5", JSON.stringify(results.slice(0, 5)));
  chk("RL-2", "ครั้งที่ 6 ถูกบล็อก", results[5] === false, "false", String(results[5]));
} catch (e) {
  chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 130) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const id of [tenantId, tenantId2].filter(Boolean)) {
    await del(() => prisma.memberActivity.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.customer.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await del(() => prisma.tenant.delete({ where: { id } }));
  }
  console.log("[cleanup] ok");
  await prisma.$disconnect();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n===== QC MEMBER PUBLIC =====\nผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
