// PROBE — reviewer B ของ SVC D.13 (โจมตีด้วย probe จริง) · ไม่ใช่ข้อสอบ · ล้างข้อมูลที่สร้างเองทุกครั้ง (slug/อีเมล `svc-d13b-`)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d13-b.mts
// หมวด: X ข้ามร้าน · B ขอบเขตอาคาร · R เพิกถอนทันที · M เงิน · W writeVia · C หลายโพรเซสพร้อมกัน
/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
type Any = any;

const LABEL = "probe-d13-b";
const envMod = (await import("./svc-qc-env.mts" as string)) as { loadSvcQcEnv: (label: string) => { host: string } };
envMod.loadSvcQcEnv(LABEL);
if (process.env.APP_ENV === "production") { console.error("APP_ENV=production"); process.exit(4); }
if (process.env.CI) { console.error("ห้าม CI"); process.exit(4); }

const S: Any = await import("@/lib/core/settings" as string);
const DM: Any = await import("@/lib/modules/dorm" as string);
const db: Any = (await import("@/lib/core/db" as string)).prisma;

// ═══════════ โหมดลูก (โพรเซสที่สอง/สาม สำหรับหมวด C) ═══════════
const ci = process.argv.indexOf("--child");
if (ci >= 0) {
  const job = JSON.parse(process.argv[ci + 1]);
  const t0 = Date.now();
  while (Date.now() < job.at) await new Promise((r) => setTimeout(r, 5));
  let out: Any;
  try {
    if (job.kind === "set") out = await S.setSettings(job.actor, job.ctx, job.changes);
    else if (job.kind === "preset") out = await DM.applyDormRolePreset(job.actor, job.ctx, job.input);
    else if (job.kind === "assign") out = await DM.setDormBuildingAssignment(job.actor, job.ctx, job.input);
  } catch (e) { out = { threw: String(e) }; }
  process.stdout.write(JSON.stringify({ out, waited: Date.now() - t0 }));
  await db.$disconnect();
  process.exit(0);
}

// ═══════════ ผล ═══════════
type Res = { id: string; res: "HOLD" | "BREACH" | "ERR" | "INFO"; sev: string; why: string };
const results: Res[] = [];
const fmt = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 400); } catch { return String(v); } };
async function probe(id: string, name: string, sev: "BLOCKER" | "MAJOR" | "MINOR" | "INFO", fn: () => Promise<string[]>) {
  try {
    const bad = await fn();
    const res = bad.length ? (sev === "INFO" ? "INFO" : "BREACH") : "HOLD";
    results.push({ id, res, sev, why: bad.join(" | ") });
    console.log(`  ${bad.length ? "🔴" : "✅"} [${id}] ${name}${bad.length ? `\n       → ${bad.join("\n       → ")}` : ""}`);
  } catch (e) {
    results.push({ id, res: "ERR", sev, why: String(e) });
    console.log(`  ⚠️ [${id}] ${name} — throw: ${String(e).slice(0, 400)}`);
  }
}
const isNF = (r: Any) => r === null || (r && r.ok === false && r.code === "NOT_FOUND");

// ═══════════ ล้าง ═══════════
const PRISMA_NS: Any = (await import("@prisma/client" as string)).Prisma;
const MODELS: string[] = (PRISMA_NS.dmmf.datamodel.models as Any[]).filter((m) => m.fields.some((f: Any) => f.name === "tenantId" && f.kind === "scalar")).map((m) => m.name).filter((n) => n !== "Tenant");
const del = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
const SLUG = "svc-d13b-";
const tenantIds: string[] = [];
async function cleanup(ids: string[]) {
  if (ids.length) {
    for (let p = 0; p < 6; p++) for (const m of MODELS) { try { await db[del(m)].deleteMany({ where: { tenantId: { in: ids } } }); } catch { /* FK */ } }
    try { await db.tenant.deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log(`  ⚠️ ลบ tenant: ${String(e).slice(0, 200)}`); }
  }
  try { await db.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${String(e).slice(0, 200)}`); }
}
async function countsOf(tid: string): Promise<Record<string, number>> {
  const o: Record<string, number> = {};
  for (const m of MODELS) { try { const n = await db[del(m)].count({ where: { tenantId: tid } }); if (n) o[m] = n; } catch { /* */ } }
  return o;
}
const diffCounts = (a: Record<string, number>, b: Record<string, number>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? 0) !== (b[k] ?? 0)).map((k) => `${k} ${a[k] ?? 0}→${b[k] ?? 0}`);

{
  const stale = (await db.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } })) as { id: string }[];
  await cleanup(stale.map((r) => r.id));
}

const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const D = "2026-11-03";
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; mid: string };

let exitCode = 0;
try {
  // ═══════════ ฉาก ═══════════
  const mkTenant = async (name: string) => { const r = await db.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("PROBE D13B ร้าน A");
  const tB = await mkTenant("PROBE D13B ร้าน B");
  const ctxA = { tenantId: tA };
  const ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, name: string, type = "DORM") => (await db.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UX = await mkUnit(tA, "หอสองอาคาร P");
  const UY = await mkUnit(tA, "หออีกหน่วย P");
  const UB = await mkUnit(tB, "หอร้าน B P");
  const mkBld = async (tenantId: string, unitId: string, name: string) => (await db.roomBuilding.create({ data: { tenantId, unitId, name, floors: 3, sortOrder: 1 } })).id as string;
  const mkType = async (tenantId: string, unitId: string) => (await db.hotelRoomType.create({ data: { tenantId, unitId, name: "ห้อง P", rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: 450000 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, rt: string, b: string | null) => (await db.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId: rt, buildingId: b, floorNo: 1 } })).id as string;
  const mkOcc = async (tenantId: string, unitId: string, roomId: string, s: string, e: string) => (await db.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(s), endDate: dbDate(e), kind: "LEASE", refType: "DormLease", refId: `p-${uid()}` } })).id as string;
  const mkParty = async (tenantId: string, name: string, phone: string) => (await db.party.create({ data: { tenantId, kind: "PERSON", name, phone, phoneNorm: phone } })).id as string;
  const mkLease = async (tenantId: string, unitId: string, roomId: string, partyId: string, status: string, occupancyId: string | null, extra: Record<string, unknown> = {}) =>
    (await db.dormLease.create({ data: { tenantId, unitId, roomId, partyId, status, startDate: dbDate(status === "DRAFT" ? "2026-11-15" : "2026-06-01"), endDate: dbDate("2027-05-31"), rentSatang: 450000, commonFeeSatang: 30000, depositSatang: 900000, occupancyId, createdById: "ProbeD13B", ...extra } })).id as string;
  const mkRun = async (tenantId: string, unitId: string, periodKey: string, due: string) =>
    (await db.dormBillRun.create({ data: { tenantId, unitId, periodKey, status: "SENT", sentAt: new Date("2026-10-26T10:00:00+07:00"), dueDate: dbDate(due), issueDate: dbDate("2026-10-26") } })).id as string;
  const mkBill = async (tenantId: string, unitId: string, runId: string, leaseId: string, roomId: string, partyId: string, periodKey: string, status: string, total: number, paid: number, due: string) =>
    (await db.dormBill.create({ data: { tenantId, unitId, runId, leaseId, roomId, partyId, periodKey, status, lines: [], subtotalSatang: total, totalSatang: total, paidSatang: paid, dueDate: dbDate(due) } })).id as string;

  const bXA = await mkBld(tA, UX, "อาคาร PA");
  const bXB = await mkBld(tA, UX, "อาคาร PB-ลับ");
  const bY = await mkBld(tA, UY, "อาคาร PY-ลับ");
  const bB = await mkBld(tB, UB, "อาคาร ร้านB-ลับ");
  const rtX = await mkType(tA, UX);
  const rtY = await mkType(tA, UY);
  const rtB = await mkType(tB, UB);
  const XA1 = await mkRoom(tA, UX, "PA1", rtX, bXA);
  const XB1 = await mkRoom(tA, UX, "PB1", rtX, bXB);
  const XB2 = await mkRoom(tA, UX, "PB2", rtX, bXB);
  const Y1 = await mkRoom(tA, UY, "PY1", rtY, bY);
  const RB1 = await mkRoom(tB, UB, "RB1", rtB, bB);
  const pXA = await mkParty(tA, "อัมพร เอพี", "0862220001");
  const pXB = await mkParty(tA, "บัวลอยลับ บีพี", "0862220002");
  const pXB2 = await mkParty(tA, "จองลับ ซีพี", "0862220003");
  const pB = await mkParty(tB, "ร้านบีลับ ดีพี", "0862220004");
  const lXA = await mkLease(tA, UX, XA1, pXA, "ACTIVE", await mkOcc(tA, UX, XA1, "2026-06-01", "2027-06-01"));
  const lXB = await mkLease(tA, UX, XB1, pXB, "ACTIVE", await mkOcc(tA, UX, XB1, "2026-06-01", "2027-06-01"));
  const lXBd = await mkLease(tA, UX, XB2, pXB2, "DRAFT", await mkOcc(tA, UX, XB2, "2026-11-15", "2027-06-01"), { bookingFeeSatang: 300000 });
  const lB = await mkLease(tB, UB, RB1, pB, "ACTIVE", await mkOcc(tB, UB, RB1, "2026-06-01", "2027-06-01"));
  const runX = await mkRun(tA, UX, "2026-11", "2026-11-05");
  const runXo = await mkRun(tA, UX, "2026-10", "2026-10-05");
  await mkBill(tA, UX, runX, lXA, XA1, pXA, "2026-11", "SENT", 511100, 0, "2026-11-05");
  await mkBill(tA, UX, runX, lXB, XB1, pXB, "2026-11", "PAID", 622200, 622200, "2026-11-05");
  await mkBill(tA, UX, runXo, lXB, XB1, pXB, "2026-10", "SENT", 377700, 0, "2026-10-05");
  await db.dormRepair.create({ data: { tenantId: tA, unitId: UX, roomId: XB1, category: "OTHER", text: "ซ่อมลับPB", status: "OPEN" } });

  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `${SLUG}${tag}-${RUN}`;
    await db.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@qc.invalid`, name: `PROBE ${tag}` } });
    const mb = await db.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, mid: mb.id };
  };
  const CARE = { "dorm.view": true, "dorm.lease.manage": true, "dorm.slip.review": true };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const CARE_A = await mkMember("care-a", tA, "STAFF", [UX], CARE);
  const CARE_N = await mkMember("care-n", tA, "STAFF", [UX], CARE);
  const MGR_X = await mkMember("mgr-x", tA, "MANAGER", [UX]);
  const MGR_ALL = await mkMember("mgr-all", tA, "MANAGER", ["*"]);
  const VIEW_X = await mkMember("view-x", tA, "STAFF", [UX], { "dorm.view": true });
  const SEDIT = await mkMember("sedit", tA, "STAFF", [UX], { "dorm.view": true, "dorm.settings.edit": true, "settings.staff.write": true });
  const TARGET_Y = await mkMember("target-y", tA, "STAFF", [UY], { "dorm.view": true });
  const TARGET_X = await mkMember("target-x", tA, "STAFF", [UX], { "dorm.view": true });
  const WILD = await mkMember("wild", tA, "STAFF", [UX], { "dorm.*": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const STAFF_B = await mkMember("staff-b", tB, "STAFF", [UB], { "dorm.view": true });

  const set = (a: Actor, ch: Any[], ctx: Any = ctxA) => S.setSettings(a, ctx, ch);
  const ASSIGN = "rooms.access.buildingAssignments";
  const SCOPE = "rooms.access.managerScope";
  const baseAssign = { [CARE_A.mid]: [bXA], [MGR_X.mid]: [bXB], [VIEW_X.mid]: [bXA, bXB], [MGR_ALL.mid]: [bXA] };
  const r0 = await set(OWNER, [{ key: SCOPE, scope: "UNIT", scopeId: UX, value: "BUILDING" }, { key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
  if (!r0?.ok) throw new Error(`ตั้งขอบเขตไม่ได้ ${fmt(r0)}`);
  const readAssign = async () => (await S.resolveSettings(ctxA, [ASSIGN], { unitId: UX }))[ASSIGN]?.value as Record<string, string[]>;
  const HOME = (a: Any, unitId: string, ctx: Any = ctxA, extra: Any = {}) => DM.dormHomeModel(a, ctx, { unitId, date: D, ...extra });
  const LC = (a: Actor, tenantId = tA) => ({ tenantId, actorUserId: a.userId });
  const SECRET_XB = ["PB1", "PB2", XB1, XB2, lXB, lXBd, bXB, "บัวลอยลับ", "จองลับ", "ซ่อมลับPB", "622200", "377700", "PB-ลับ"];
  const leakIn = (o: unknown, words: string[]) => { const js = JSON.stringify(o ?? null); return words.filter((w) => js.includes(w)); };

  // ═══════════ X ข้ามร้าน ═══════════
  console.log("\nX. ข้ามร้าน");
  await probe("X-1", "dormHomeModel ข้ามร้าน (unit/ctx/actor สลับ) ⇒ null · cells ปลอมจากร้าน B ถูกตัด", "BLOCKER", async () => {
    const bad: string[] = [];
    for (const [n, r] of [
      ["A→unit B", await HOME(OWNER, UB, ctxA)],
      ["B→unit A", await HOME(OWNER_B, UX, ctxB)],
      ["actor A ใน ctx B", await HOME(OWNER, UB, ctxB)],
      ["actor B ใน ctx A", await HOME(OWNER_B, UX, ctxA)],
      ["staff B ปลอม role OWNER ใน ctx A", await HOME({ ...STAFF_B, role: "OWNER", unitAccess: ["*"] }, UX, ctxA)],
    ] as [string, Any][]) if (r !== null) bad.push(`${n}: ได้โมเดล ${fmt(r).slice(0, 120)}`);
    const m = await HOME(OWNER, UX, ctxA, { cells: [{ roomId: RB1, number: "RB1", roomTypeId: rtB, buildingId: bB, floorNo: 1, rentMode: "MONTHLY", hkStatus: "CLEAN", use: "LEASED", occupancy: null, next: null, finance: null }] });
    const lk = leakIn(m, [RB1, "RB1", bB, "ร้านบีลับ"]);
    if (lk.length) bad.push(`cells ปลอมร้าน B หลุด: ${lk.join(",")}`);
    return bad;
  });
  await probe("X-2", "ฟังก์ชันสัญญาข้ามร้าน: leaseId ร้าน B ผ่านหน่วยร้าน A / actor A ใน ctx B ⇒ ไม่พบ · ไม่เขียน", "BLOCKER", async () => {
    const bad: string[] = [];
    const before = await countsOf(tB);
    const lb0 = await db.dormLease.findFirst({ where: { id: lB }, select: { status: true, updatedAt: true, coTenants: true } });
    const calls: [string, Any][] = [];
    for (const [c, unitId] of [[LC(OWNER), UX], [LC(OWNER, tB), UB], [LC(OWNER_B), UX]] as [Any, string][]) {
      const lid = lB;
      calls.push([`getLease ${c.tenantId === tA ? "A" : "B"}/${unitId === UX ? "UX" : "UB"}`, await DM.getLease(c, { unitId, leaseId: lid })]);
      calls.push(["leaseContract", await DM.leaseContract(c, { unitId, leaseId: lid })]);
      calls.push(["leaseFileLinks", await DM.leaseFileLinks(c, { unitId, leaseId: lid })]);
      calls.push(["cancelLease", await DM.cancelLease(c, { unitId, leaseId: lid, reason: "probe ข้ามร้าน" })]);
      calls.push(["updateLeaseOccupants", await DM.updateLeaseOccupants(c, { unitId, leaseId: lid, occupants: [{ name: "แอบ" }], vehicles: [] })]);
      calls.push(["receiveBookingFee", await DM.receiveBookingFee(c, { unitId, leaseId: lid })]);
      calls.push(["moveIn", await DM.moveIn(c, { unitId, leaseId: lid })]);
      calls.push(["signLease", await DM.signLease(c, { unitId, leaseId: lid, method: "PAPER", file: { data: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" } })]);
      calls.push(["addLeaseFiles", await DM.addLeaseFiles(c, { unitId, leaseId: lid, kind: "DOCUMENT", files: [{ data: new Uint8Array([1, 2]), contentType: "application/pdf" }] })]);
    }
    for (const [n, r] of calls) if (!isNF(r)) bad.push(`${n}: ${fmt(r).slice(0, 160)}`);
    const cr = await DM.createLease(LC(OWNER), { unitId: UX, roomId: RB1, startDate: "2026-12-01", months: 12, tenant: { name: "ข้าม ร้าน", phone: "0861234567" } });
    if (!isNF(cr)) bad.push(`createLease ห้องร้าน B: ${fmt(cr)}`);
    const ll = await DM.listLeases(LC(OWNER), { unitId: UB, tab: "CURRENT" });
    if ((ll?.rows ?? []).length) bad.push(`listLeases A→UB ได้แถว ${ll.rows.length}`);
    const ll2 = await DM.listLeases(LC(OWNER, tB), { unitId: UB, tab: "CURRENT" });
    if ((ll2?.rows ?? []).length) bad.push(`listLeases actor A ใน ctx B ได้แถว ${ll2.rows.length}`);
    const lb1 = await db.dormLease.findFirst({ where: { id: lB }, select: { status: true, updatedAt: true, coTenants: true } });
    if (JSON.stringify(lb0) !== JSON.stringify(lb1)) bad.push(`สัญญาร้าน B ขยับ ${fmt(lb0)} → ${fmt(lb1)}`);
    const dc = diffCounts(before, await countsOf(tB));
    if (dc.length) bad.push(`ร้าน B มีแถวเปลี่ยน: ${dc.join(", ")}`);
    return bad;
  });
  await probe("X-3", "applyDormRolePreset ข้ามร้าน (membership B ผ่านหน่วย A · actor B บนหน่วย A · actor A ใน ctx B) ⇒ ok:false · ไม่เขียน", "BLOCKER", async () => {
    const bad: string[] = [];
    const p0 = await db.membership.findMany({ where: { id: { in: [STAFF_B.mid, TARGET_X.mid] } }, select: { id: true, permissions: true } });
    for (const [n, a, ctx, input] of [
      ["A owner → staff B", OWNER, ctxA, { unitId: UX, membershipId: STAFF_B.mid, role: "CARETAKER" }],
      ["B owner → unit A target A", OWNER_B, ctxB, { unitId: UX, membershipId: TARGET_X.mid, role: "CARETAKER" }],
      ["B owner ctx A", OWNER_B, ctxA, { unitId: UX, membershipId: TARGET_X.mid, role: "CARETAKER" }],
      ["A owner ctx B", OWNER, ctxB, { unitId: UB, membershipId: STAFF_B.mid, role: "CARETAKER" }],
      ["ปลอม role OWNER (staff B) ctx A", { ...STAFF_B, role: "OWNER", unitAccess: ["*"] }, ctxA, { unitId: UX, membershipId: TARGET_X.mid, role: "CARETAKER" }],
    ] as [string, Any, Any, Any][]) {
      const r = await DM.applyDormRolePreset(a, ctx, input);
      if (r?.ok !== false) bad.push(`${n}: ${fmt(r)}`);
    }
    const p1 = await db.membership.findMany({ where: { id: { in: [STAFF_B.mid, TARGET_X.mid] } }, select: { id: true, permissions: true } });
    if (JSON.stringify(p0) !== JSON.stringify(p1)) bad.push(`permissions เปลี่ยน ${fmt(p0)} → ${fmt(p1)}`);
    return bad;
  });
  await probe("X-4", "ค่าตั้งข้ามร้าน: เจ้าของ B เขียน buildingAssignments/managerScope ของหน่วย A · เจ้าของ A เขียนหน่วย B ⇒ ไม่ ok ไม่เขียน · loadDormPolicySettings ข้ามร้าน ⇒ null", "BLOCKER", async () => {
    const bad: string[] = [];
    const a0 = await readAssign();
    for (const [n, a, ctx, scopeId] of [["B→UX", OWNER_B, ctxB, UX], ["A ctx B→UX", OWNER, ctxB, UX], ["A→UB", OWNER, ctxA, UB]] as [string, Actor, Any, string][]) {
      const r = await set(a, [{ key: ASSIGN, scope: "UNIT", scopeId, value: { [OWNER_B.mid]: [bXA, bXB] } }, { key: SCOPE, scope: "UNIT", scopeId, value: "UNIT" }], ctx);
      if (r?.ok !== false) bad.push(`${n}: ${fmt(r)}`);
    }
    const a1 = await readAssign();
    if (JSON.stringify(a0) !== JSON.stringify(a1)) bad.push(`assign เปลี่ยน`);
    const sv = await db.settingValue.count({ where: { tenantId: tB } });
    if (sv) bad.push(`ร้าน B มีแถว SettingValue ${sv}`);
    for (const [n, a, ctx, unitId] of [["A→UB", OWNER, ctxA, UB], ["B→UX", OWNER_B, ctxB, UX], ["A ใน ctx B", OWNER, ctxB, UB]] as [string, Actor, Any, string][]) {
      const m = await DM.loadDormPolicySettings(a, ctx, { unitId });
      if (m !== null) bad.push(`policy ${n} ได้โมเดล`);
    }
    // ฟอร์มของหน่วยอื่นยัดเข้าโมเดล
    const fY = await S.loadSettingsForm(OWNER, ctxA, { domains: ["rooms", "payments", "messaging"], unitId: UY });
    const mY = await DM.loadDormPolicySettings(OWNER, ctxA, { unitId: UX, form: fY });
    if (mY !== null) bad.push("รับ form ของหน่วย UY เข้าโมเดล UX");
    const scB = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: OWNER_B.userId });
    if (scB.all || scB.buildingIds.length) bad.push(`dormBuildingScope owner B บน UX = ${fmt(scB)}`);
    return bad;
  });
  await probe("X-5", "assignments ชี้อาคารของหน่วยอื่น/ร้านอื่น ⇒ ไม่เห็นห้อง/ชื่ออาคารนั้น", "MAJOR", async () => {
    const bad: string[] = [];
    const r = await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: { ...baseAssign, [CARE_N.mid]: [bY, bB] } }]);
    if (!r?.ok) return [`ตั้งไม่ได้ (ระบบปฏิเสธ = ปลอดภัย) ${fmt(r)}`].filter(() => false);
    const sc = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: CARE_N.userId });
    if (sc.all || sc.buildingIds.length) bad.push(`scope = ${fmt(sc)}`);
    const m = await HOME(CARE_N, UX);
    const lk = leakIn(m, ["PY-ลับ", "ร้านB-ลับ", bY, bB, "PY1", "RB1"]);
    if (lk.length) bad.push(`home หลุด ${lk.join(",")}`);
    if ((m?.cells ?? []).length) bad.push(`home เห็น ${m.cells.length} ห้อง`);
    const ll = await DM.listLeases(LC(CARE_N), { unitId: UX, tab: "CURRENT" });
    if ((ll?.rows ?? []).length) bad.push(`listLeases ${ll.rows.length} แถว`);
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
    return bad;
  });

  // ═══════════ B ขอบเขตอาคาร ═══════════
  console.log("\nB. ขอบเขตอาคาร");
  await probe("B-1", "ผู้ดูแลอาคาร A ยิงทุกฟังก์ชันสัญญาใส่สัญญาอาคาร B (ACTIVE + DRAFT มีเงินจอง) ⇒ ไม่พบ · ไม่มีแถวใหม่ในร้าน", "BLOCKER", async () => {
    const bad: string[] = [];
    const c = LC(CARE_A);
    const before = await countsOf(tA);
    const l0 = await db.dormLease.findMany({ where: { id: { in: [lXB, lXBd] } }, orderBy: { id: "asc" } });
    for (const lid of [lXB, lXBd]) {
      const calls: [string, Any][] = [
        ["getLease", await DM.getLease(c, { unitId: UX, leaseId: lid })],
        ["leaseContract", await DM.leaseContract(c, { unitId: UX, leaseId: lid })],
        ["leaseFileLinks", await DM.leaseFileLinks(c, { unitId: UX, leaseId: lid })],
        ["receiveBookingFee", await DM.receiveBookingFee(c, { unitId: UX, leaseId: lid })],
        ["moveIn", await DM.moveIn(c, { unitId: UX, leaseId: lid })],
        ["signLease", await DM.signLease(c, { unitId: UX, leaseId: lid, method: "PAPER", file: { data: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" } })],
        ["addLeaseFiles", await DM.addLeaseFiles(c, { unitId: UX, leaseId: lid, kind: "DOCUMENT", files: [{ data: new Uint8Array([1, 2]), contentType: "application/pdf" }] })],
        ["updateLeaseOccupants", await DM.updateLeaseOccupants(c, { unitId: UX, leaseId: lid, occupants: [{ name: "แอบ" }], vehicles: [] })],
        ["cancelLease", await DM.cancelLease(c, { unitId: UX, leaseId: lid, reason: "probe ข้ามอาคาร" })],
      ];
      for (const [n, r] of calls) if (!isNF(r)) bad.push(`${n}(${lid === lXB ? "ACTIVE" : "DRAFT"}): ${fmt(r).slice(0, 160)}`);
    }
    const l1 = await db.dormLease.findMany({ where: { id: { in: [lXB, lXBd] } }, orderBy: { id: "asc" } });
    if (JSON.stringify(l0) !== JSON.stringify(l1)) bad.push("สัญญาอาคาร B ขยับ");
    const dc = diffCounts(before, await countsOf(tA));
    if (dc.length) bad.push(`แถวใหม่ในร้าน A: ${dc.join(", ")}`);
    // positive control
    if (!(await DM.getLease(c, { unitId: UX, leaseId: lXA }))) bad.push("positive: getLease อาคาร A ได้ null");
    return bad;
  });
  await probe("B-2", "MANAGER ที่ถูกจำกัด XB: อ่าน/เขียนสัญญา XA ⇒ ไม่พบ · home ไม่มี XA", "BLOCKER", async () => {
    const bad: string[] = [];
    const c = LC(MGR_X);
    if ((await DM.getLease(c, { unitId: UX, leaseId: lXA })) !== null) bad.push("getLease XA ได้");
    const r = await DM.cancelLease(c, { unitId: UX, leaseId: lXA, reason: "probe ผจก" });
    if (!isNF(r)) bad.push(`cancelLease XA ${fmt(r)}`);
    const cr = await DM.createLease(c, { unitId: UX, roomId: XA1, startDate: "2027-07-01", months: 12, tenant: { name: "ผจก แอบ", phone: "0861234568" } });
    if (!isNF(cr)) bad.push(`createLease XA1 ${fmt(cr)}`);
    const m = await HOME(MGR_X, UX);
    const lk = leakIn(m, ["PA1", XA1, "อัมพร", "511100", bXA]);
    if (lk.length) bad.push(`home หลุด ${lk.join(",")}`);
    // MANAGER unitAccess * แต่ assign แค่ XA
    const ma = await HOME(MGR_ALL, UX);
    const lk2 = leakIn(ma, SECRET_XB);
    if (lk2.length) bad.push(`MANAGER(*) home หลุด XB: ${lk2.join(",")}`);
    return bad;
  });
  await probe("B-3", "ไม่มีรายการ (CARE_N) ⇒ home 0 ห้อง · ไม่มีชื่ออาคาร/ยอด · listLeases 0 · counts 0 · heldTotal 0", "BLOCKER", async () => {
    const bad: string[] = [];
    const m = await HOME(CARE_N, UX);
    if (!m) return ["home null (ควรได้โมเดลว่าง)"].filter(() => false);
    if (m.cells.length || m.kpi.rooms.total || m.buildings.length) bad.push(`cells ${m.cells.length} buildings ${m.buildings.length}`);
    const lk = leakIn(m, [...SECRET_XB, "PA1", "อัมพร", "511100", "PA"]);
    if (lk.length) bad.push(`หลุด ${lk.join(",")}`);
    if (m.billing && (m.billing.billCount || m.billing.totalSatang)) bad.push(`billing ${fmt(m.billing)}`);
    const ll = await DM.listLeases(LC(CARE_N), { unitId: UX, tab: "CURRENT" });
    const cs = Object.values(ll?.counts ?? {}).reduce((a: number, b: Any) => a + Number(b), 0);
    if ((ll?.rows ?? []).length || cs || ll?.heldTotalSatang) bad.push(`listLeases rows ${ll?.rows?.length} counts ${fmt(ll?.counts)} held ${ll?.heldTotalSatang}`);
    return bad;
  });
  await probe("B-4", "findTenantCandidates โดยผู้ดูแลอาคาร A ด้วยเบอร์ผู้เช่าอาคาร B ⇒ ไม่บอกว่ามีสัญญาที่อาคาร B (activeLeases)", "MINOR", async () => {
    const r = await DM.findTenantCandidates(LC(CARE_A), { unitId: UX, phone: "0862220002" });
    const hit = (r ?? []).find((x: Any) => x.partyId === pXB);
    return hit && hit.activeLeases > 0 ? [`ได้ ${fmt(hit)} — นับสัญญาห้องอาคาร B (นอกขอบเขต) ให้ผู้ดูแลอาคาร A`] : [];
  });
  await probe("B-5", "STAFF ถือ dorm.settings.edit / MANAGER: เขียน managerScope (UNIT+BUILDING) · buildingAssignments · reset · applyTemplate RESET_ALL ⇒ ไม่ได้", "BLOCKER", async () => {
    const bad: string[] = [];
    const a0 = await readAssign();
    for (const a of [SEDIT, MGR_X, MGR_ALL]) {
      for (const ch of [
        { key: SCOPE, scope: "UNIT", scopeId: UX, value: "UNIT" },
        { key: SCOPE, scope: "BUILDING", scopeId: bXA, value: "UNIT" },
        { key: ASSIGN, scope: "UNIT", scopeId: UX, value: { [a.mid]: [bXA, bXB] } },
      ]) {
        const r = await set(a, [ch]);
        if (r?.ok !== false) bad.push(`${a.userId.split("-").slice(2, 4).join("-")} set ${ch.key}@${ch.scope}: ${fmt(r)}`);
      }
      const rr = await S.resetSetting(a, ctxA, { key: ASSIGN, scope: "UNIT", scopeId: UX });
      if (rr?.ok !== false) bad.push(`reset ${ASSIGN}: ${fmt(rr)}`);
      const rs = await S.resetSetting(a, ctxA, { key: SCOPE, scope: "UNIT", scopeId: UX });
      if (rs?.ok !== false) bad.push(`reset ${SCOPE}: ${fmt(rs)}`);
      const rt = await S.applyTemplate(a, ctxA, { unitId: UX, domain: "rooms", templateKey: "APARTMENT", overwrite: "RESET_ALL" });
      if (rt?.ok !== false) bad.push(`applyTemplate RESET_ALL: ${fmt(rt)}`);
    }
    const a1 = await readAssign();
    if (JSON.stringify(a0) !== JSON.stringify(a1)) bad.push(`assign เปลี่ยน ${fmt(a1)}`);
    const sc = (await S.resolveSettings(ctxA, [SCOPE], { unitId: UX }))[SCOPE]?.value;
    if (sc !== "BUILDING") bad.push(`managerScope = ${sc}`);
    return bad;
  });
  await probe("B-6", "หน้า 17 ของคนไม่ใช่ผู้จัดการ (STAFF dorm.view): ไม่ได้ตารางผู้ดูแล/ชื่อ/membershipId ของคนอื่น (รวมใน form.value)", "MINOR", async () => {
    const m = await DM.loadDormPolicySettings(VIEW_X, ctxA, { unitId: UX });
    if (!m) return [];
    const bad: string[] = [];
    const lk = leakIn(m, [CARE_A.mid, MGR_X.mid, MGR_ALL.mid, "PROBE care-a", "PROBE mgr-x"]);
    if (lk.length) {
      const f = (m.form.groups as Any[]).flatMap((g) => g.fields).find((x: Any) => x.key === ASSIGN);
      bad.push(`หลุด ${lk.length} ค่า (buildingScope.assignments=${fmt(m.buildingScope.assignments)} · members=${m.buildingScope.members.length} · form field ${ASSIGN}.value=${fmt(f?.value).slice(0, 160)})`);
    }
    return bad;
  });
  await probe("B-7", "applyDormRolePreset ข้ามหน่วย: MANAGER ที่คุมแค่ UX (ถูกจำกัดอาคารด้วย) ใช้ชุดสิทธิ์กับ STAFF ที่อยู่หน่วย UY เท่านั้น (ไม่อยู่ใน applyTargets)", "MAJOR", async () => {
    const before = await db.membership.findFirst({ where: { id: TARGET_Y.mid }, select: { permissions: true } });
    const pm = await DM.loadDormPolicySettings(MGR_X, ctxA, { unitId: UX });
    const inTargets = (pm?.roles?.applyTargets ?? []).some((x: Any) => x.membershipId === TARGET_Y.mid);
    const r = await DM.applyDormRolePreset(MGR_X, ctxA, { unitId: UX, membershipId: TARGET_Y.mid, role: "TECH" });
    const after = await db.membership.findFirst({ where: { id: TARGET_Y.mid }, select: { permissions: true } });
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) await db.membership.update({ where: { id: TARGET_Y.mid }, data: { permissions: before.permissions } });
    return r?.ok || changed ? [`ok=${fmt(r)} · อยู่ใน applyTargets=${inTargets} · permissions ${fmt(before?.permissions)} → ${fmt(after?.permissions)} (มีผลกับหน่วย UY ที่ผู้จัดการไม่ได้คุม)`] : [];
  });
  await probe("B-8", "applyDormRolePreset TECH กับ STAFF ที่ถือ dorm.* ⇒ ต้องไม่เห็นเงิน/ผังอีก (wildcard ต้องถูกถอน)", "MAJOR", async () => {
    const r = await DM.applyDormRolePreset(OWNER, ctxA, { unitId: UX, membershipId: WILD.mid, role: "TECH" });
    const mem = await db.membership.findFirst({ where: { id: WILD.mid }, select: { role: true, unitAccess: true, permissions: true } });
    const acc = DM.dormAccess({ role: mem.role, unitAccess: mem.unitAccess, permissions: mem.permissions }, UX);
    const m = await HOME(WILD, UX);
    const bad: string[] = [];
    if (!r?.ok) bad.push(`apply ไม่ ok ${fmt(r)}`);
    if (acc.money || acc.board || m) bad.push(`หลัง TECH: perms=${fmt(mem.permissions)} access=${fmt(acc)} home=${m ? "ได้โมเดล" : "null"}`);
    return bad;
  });

  // ═══════════ R เพิกถอนทันที ═══════════
  console.log("\nR. เพิกถอนแล้วมีผลทันที (actor เก่าใน process เดิม)");
  await probe("R-1", "ถอนอาคารจากรายการ (owner set) ⇒ คำขอต่อไปของ actor เดิม: getLease/updateLeaseOccupants/home ไม่เห็น XA", "BLOCKER", async () => {
    const bad: string[] = [];
    const c = LC(CARE_A);
    if (!(await DM.getLease(c, { unitId: UX, leaseId: lXA }))) bad.push("positive: ก่อนถอนต้องเห็น");
    const { [CARE_A.mid]: _drop, ...rest } = baseAssign;
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: rest }]);
    if ((await DM.getLease(c, { unitId: UX, leaseId: lXA })) !== null) bad.push("getLease ยังได้");
    const u = await DM.updateLeaseOccupants(c, { unitId: UX, leaseId: lXA, occupants: [{ name: "หลังถอน" }], vehicles: [] });
    if (!isNF(u)) bad.push(`updateLeaseOccupants ${fmt(u)}`);
    const m = await HOME(CARE_A, UX);
    if ((m?.cells ?? []).length) bad.push(`home ${m.cells.length} ห้อง`);
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
    return bad;
  });
  await probe("R-2", "ถอนสมาชิกภาพ (acceptedAt=null) / ถอด dorm.view+lease ⇒ actor เดิม (ยังถือ role/permissions เก่าใน object) ทำอะไรไม่ได้", "BLOCKER", async () => {
    const bad: string[] = [];
    const c = LC(CARE_A);
    await db.membership.update({ where: { id: CARE_A.mid }, data: { acceptedAt: null } });
    try {
      if ((await HOME(CARE_A, UX)) !== null) bad.push("home ได้ (สมาชิกภาพถูกถอน)");
      if ((await DM.getLease(c, { unitId: UX, leaseId: lXA })) !== null) bad.push("getLease ได้");
      if ((await DM.loadDormPolicySettings(CARE_A, ctxA, { unitId: UX })) !== null) bad.push("policy ได้");
      const sc = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: CARE_A.userId });
      if (sc.all || sc.buildingIds.length) bad.push(`scope ${fmt(sc)}`);
    } finally { await db.membership.update({ where: { id: CARE_A.mid }, data: { acceptedAt: new Date() } }); }
    await db.membership.update({ where: { id: CARE_A.mid }, data: { permissions: { "dorm.meter.read": true } } });
    try {
      if ((await HOME(CARE_A, UX)) !== null) bad.push("home ได้หลังถอดสิทธิ์");
      if ((await DM.getLease(c, { unitId: UX, leaseId: lXA })) !== null) bad.push("getLease ได้หลังถอดสิทธิ์");
      const ll = await DM.listLeases(c, { unitId: UX, tab: "CURRENT" });
      if ((ll?.rows ?? []).length) bad.push(`listLeases ${ll.rows.length}`);
    } finally { await db.membership.update({ where: { id: CARE_A.mid }, data: { permissions: CARE } }); }
    // OWNER → STAFF ลดบทบาท: ผู้จัดการ (*) ถูกลดเป็น STAFF ไม่มีสิทธิ์
    await db.membership.update({ where: { id: MGR_ALL.mid }, data: { role: "STAFF", permissions: {} } });
    try {
      if ((await HOME(MGR_ALL, UX)) !== null) bad.push("MANAGER→STAFF ยังได้ home");
      const r = await DM.applyDormRolePreset(MGR_ALL, ctxA, { unitId: UX, membershipId: TARGET_X.mid, role: "CARETAKER" });
      if (r?.ok) bad.push("MANAGER→STAFF ยังใช้ชุดสิทธิ์ได้");
    } finally { await db.membership.update({ where: { id: MGR_ALL.mid }, data: { role: "MANAGER", permissions: {} } }); }
    return bad;
  });

  // ═══════════ M เงิน ═══════════
  console.log("\nM. เงิน");
  await probe("M-1", "STAFF dorm.view (เห็น 2 อาคาร) / actor ปลอมคีย์เงิน ⇒ โมเดลไม่มีตัวเลขเงิน/฿", "BLOCKER", async () => {
    const bad: string[] = [];
    for (const [n, a] of [["view", VIEW_X], ["ปลอม permissions เงิน+OWNER", { ...VIEW_X, role: "OWNER", permissions: { "dorm.bill.run": true, "dorm.*": true } }]] as [string, Any][]) {
      const m = await HOME(a, UX);
      if (!m) { bad.push(`${n}: null (ควรได้โมเดลไม่มีเงิน)`); continue; }
      if (m.money !== false) bad.push(`${n}: money=${m.money}`);
      const lk = leakIn(m, ["฿", "511100", "622200", "377700", "5,111", "6,222", "3,777"]);
      if (lk.length) bad.push(`${n}: หลุด ${lk.join(",")}`);
    }
    return bad;
  });

  // ═══════════ W writeVia ═══════════
  console.log("\nW. writeVia (rooms.legal.*)");
  await probe("W-1", "writeViaIssues ครบ 3 คีย์ · คีย์แปลงรูป (ช่องว่าง/ตัวพิมพ์) setSettings ก็ไม่เขียน", "MAJOR", async () => {
    const bad: string[] = [];
    const ks = ["rooms.legal.mode", "rooms.legal.outOfScopeReason", "rooms.legal.outOfScopeEvidence"];
    const iss = S.writeViaIssues(ks);
    if (iss.length !== 3) bad.push(`writeViaIssues ${fmt(iss)}`);
    for (const k of [" rooms.legal.mode", "rooms.legal.mode ", "ROOMS.legal.mode", "rooms.legal.mode​"]) {
      if (S.writeViaIssues([k]).length) continue;
      const r = await set(OWNER, [{ key: k, scope: "UNIT", scopeId: UX, value: "WARN" }]);
      if (r?.ok) bad.push(`คีย์ ${JSON.stringify(k)} เขียนได้`);
    }
    const mode = (await S.resolveSettings(ctxA, ["rooms.legal.mode"], { unitId: UX }))["rooms.legal.mode"]?.value;
    if (mode !== "STRICT") bad.push(`mode = ${mode}`);
    return bad;
  });
  await probe("W-2", "ทางอื่น: applyTemplate(RESET_ALL) โดยเจ้าของ (applyTemplateAction ไม่เรียก writeViaIssues) เปลี่ยน/ล้างโหมดกฎหมายที่ตั้งผ่านหน้า 10", "MAJOR", async () => {
    const bad: string[] = [];
    const lm = await DM.setDormLegalMode(OWNER, ctxA, { unitId: UY, mode: "WARN" });
    if (!lm?.ok) return [`(ฉาก) setDormLegalMode WARN ไม่ ok ${fmt(lm)} — ข้าม`].filter(() => false);
    const m0 = (await S.resolveSettings(ctxA, ["rooms.legal.mode"], { unitId: UY }))["rooms.legal.mode"]?.value;
    const r = await S.applyTemplate(OWNER, ctxA, { unitId: UY, domain: "rooms", templateKey: "APARTMENT", overwrite: "RESET_ALL" });
    const m1 = (await S.resolveSettings(ctxA, ["rooms.legal.mode"], { unitId: UY }))["rooms.legal.mode"]?.value;
    if (r?.ok && m0 !== m1) bad.push(`applyTemplate RESET_ALL ok → rooms.legal.mode ${m0} → ${m1} (ไม่ผ่านหน้า 10/setDormLegalMode · ไม่ถูก writeVia กัน)`);
    return bad;
  });

  // ═══════════ C หลายโพรเซส ═══════════
  console.log("\nC. หลายโพรเซสพร้อมกัน");
  const self = fileURLToPath(import.meta.url);
  const child = (job: Any) => new Promise<Any>((res) => {
    const p = spawn(process.execPath, [...process.execArgv, self, "--child", JSON.stringify(job)], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let o = ""; let e = "";
    p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (e += d));
    p.on("close", () => { try { res(JSON.parse(o.trim().split("\n").pop() ?? "")); } catch { res({ parseErr: o.slice(-300), stderr: e.slice(-300) }); } });
  });
  const ownerA = { role: OWNER.role, unitAccess: OWNER.unitAccess, permissions: OWNER.permissions, userId: OWNER.userId };
  await probe("C-1", "(INFO · มติผู้คุม = หนี้เครื่องยนต์) setSettings ส่งทั้งตารางจากค่าเดิม 2 โพรเซส — เขียนทีหลังชนะ", "INFO", async () => {
    const bad: string[] = [];
    let lost = 0;
    const N = 3;
    for (let i = 0; i < N; i++) {
      await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
      const stale = await readAssign();
      const { [CARE_A.mid]: _x, ...revoked } = stale;
      const added = { ...stale, [CARE_N.mid]: [bXB] };
      const at = Date.now() + 2500;
      const [r1, r2] = await Promise.all([
        child({ kind: "set", at, actor: ownerA, ctx: ctxA, changes: [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: revoked }] }),
        child({ kind: "set", at, actor: ownerA, ctx: ctxA, changes: [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: added }] }),
      ]);
      const fin = await readAssign();
      const careA = Array.isArray(fin[CARE_A.mid]) && fin[CARE_A.mid].length > 0;
      const careN = Array.isArray(fin[CARE_N.mid]) && fin[CARE_N.mid].length > 0;
      const scA = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: CARE_A.userId });
      console.log(`     รอบ ${i + 1}: p1.ok=${r1?.out?.ok} p2.ok=${r2?.out?.ok} · CARE_A ยังมีอาคาร=${careA} (scope ${fmt(scA)}) · CARE_N ถูกเพิ่ม=${careN}`);
      if (r1?.out?.ok && r2?.out?.ok && (careA || !careN)) lost++;
    }
    if (lost) bad.push(`${lost}/${N} รอบ ทั้งสองโพรเซส ok:true แต่การแก้ฝั่งหนึ่งหายเงียบ (ถ้าฝั่งถอนแพ้ ⇒ ผู้ดูแลที่ถูกถอนได้อาคารคืน) — ไม่มีตรวจเวอร์ชัน/ล็อกต่อแถวสมาชิก`);
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
    return bad;
  });
  const asg = (a: Any, membershipId: string, buildingIds: string[], unitId = UX, ctx: Any = ctxA) => DM.setDormBuildingAssignment(a, ctx, { unitId, membershipId, buildingIds });
  await probe("C-3", "setDormBuildingAssignment 2 โพรเซสพร้อมกัน คนละคน (ถอน CARE_A · เพิ่ม CARE_N) ⇒ ทั้งสองการแก้อยู่ครบ · คนอื่นไม่ขยับ", "MAJOR", async () => {
    const bad: string[] = [];
    for (let i = 0; i < 4; i++) {
      await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
      const at = Date.now() + 2500;
      const [r1, r2] = await Promise.all([
        child({ kind: "assign", at, actor: ownerA, ctx: ctxA, input: { unitId: UX, membershipId: CARE_A.mid, buildingIds: [] } }),
        child({ kind: "assign", at, actor: ownerA, ctx: ctxA, input: { unitId: UX, membershipId: CARE_N.mid, buildingIds: [bXB] } }),
      ]);
      const fin = await readAssign();
      const scA = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: CARE_A.userId });
      const scN = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: CARE_N.userId });
      const others = [MGR_X.mid, VIEW_X.mid, MGR_ALL.mid].every((m) => JSON.stringify(fin[m]) === JSON.stringify(baseAssign[m]));
      console.log(`     รอบ ${i + 1}: p1=${fmt(r1?.out)} p2=${fmt(r2?.out)} · CARE_A ${fmt(scA.buildingIds)} · CARE_N ${fmt(scN.buildingIds)} · คนอื่นคงเดิม=${others}`);
      if (!r1?.out?.ok || !r2?.out?.ok) bad.push(`รอบ ${i + 1}: ไม่ ok ${fmt(r1)} ${fmt(r2)}`);
      if ((scA.buildingIds ?? []).length) bad.push(`รอบ ${i + 1}: การถอน CARE_A หาย (${fmt(scA)})`);
      if (JSON.stringify(scN.buildingIds) !== JSON.stringify([bXB])) bad.push(`รอบ ${i + 1}: การเพิ่ม CARE_N หาย (${fmt(scN)})`);
      if (!others) bad.push(`รอบ ${i + 1}: แถวคนอื่นขยับ ${fmt(fin)}`);
    }
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
    return bad;
  });
  await probe("C-4", "setDormBuildingAssignment 2 โพรเซสพร้อมกัน คนเดียวกัน (ถอน vs เพิ่ม XB) ⇒ ผลสุดท้าย = ค่าใดค่าหนึ่งครบ · ประวัติ SettingChange ต่อกันถูก (after ของอันแรก = before ของอันหลัง) · คนอื่นไม่ขยับ", "MAJOR", async () => {
    const bad: string[] = [];
    for (let i = 0; i < 4; i++) {
      await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
      const t0 = new Date();
      const at = Date.now() + 2500;
      const [r1, r2] = await Promise.all([
        child({ kind: "assign", at, actor: ownerA, ctx: ctxA, input: { unitId: UX, membershipId: CARE_A.mid, buildingIds: [] } }),
        child({ kind: "assign", at, actor: ownerA, ctx: ctxA, input: { unitId: UX, membershipId: CARE_A.mid, buildingIds: [bXA, bXB] } }),
      ]);
      const fin = await readAssign();
      const v = JSON.stringify(fin[CARE_A.mid] ?? null);
      const okFinal = v === JSON.stringify([]) || v === JSON.stringify([bXA, bXB].sort());
      const others = [MGR_X.mid, VIEW_X.mid, MGR_ALL.mid].every((m) => JSON.stringify(fin[m]) === JSON.stringify(baseAssign[m]));
      const ch = await db.settingChange.findMany({ where: { tenantId: tA, key: ASSIGN, scopeId: UX, at: { gte: t0 } }, orderBy: { at: "asc" }, select: { before: true, after: true } });
      const chain = ch.length < 2 || JSON.stringify(ch[ch.length - 1].before) === JSON.stringify(ch[ch.length - 2].after);
      const lastAfter = ch.length ? JSON.stringify((ch[ch.length - 1].after as Any)?.[CARE_A.mid] ?? null) : "";
      console.log(`     รอบ ${i + 1}: p1=${fmt(r1?.out)} p2=${fmt(r2?.out)} · CARE_A=${v} · change ${ch.length} แถว ต่อกัน=${chain} · after ล่าสุด=${lastAfter}`);
      if (!r1?.out?.ok || !r2?.out?.ok) bad.push(`รอบ ${i + 1}: ไม่ ok`);
      if (!okFinal) bad.push(`รอบ ${i + 1}: ค่าสุดท้ายผสม ${v}`);
      if (!others) bad.push(`รอบ ${i + 1}: แถวคนอื่นขยับ`);
      if (!chain) bad.push(`รอบ ${i + 1}: ประวัติไม่ต่อกัน (before ของอันหลัง ≠ after ของอันแรก ⇒ อ่านค่าเก่า)`);
      if (ch.length && lastAfter !== v) bad.push(`รอบ ${i + 1}: after ล่าสุด ${lastAfter} ≠ ค่าจริง ${v}`);
    }
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
    return bad;
  });
  await probe("A-1", "setDormBuildingAssignment: STAFF ถือ dorm.settings.edit / MANAGER (* และหน่วยเดียว) / actor ปลอม OWNER ⇒ ปฏิเสธ · ไม่เขียน", "BLOCKER", async () => {
    const bad: string[] = [];
    const a0 = await readAssign();
    for (const [n, a] of [["SEDIT", SEDIT], ["MGR_X", MGR_X], ["MGR_ALL", MGR_ALL], ["VIEW ปลอม OWNER", { ...VIEW_X, role: "OWNER", unitAccess: ["*"], permissions: { "dorm.*": true } }], ["owner B ใน ctx A", OWNER_B]] as [string, Any][]) {
      const r = await asg(a, CARE_N.mid, [bXA, bXB]);
      if (r?.ok !== false) bad.push(`${n}: ${fmt(r)}`);
      const r2 = await asg(a, a.mid ?? CARE_N.mid, [bXA, bXB]);
      if (r2?.ok !== false) bad.push(`${n} (ให้ตัวเอง): ${fmt(r2)}`);
    }
    const a1 = await readAssign();
    if (JSON.stringify(a0) !== JSON.stringify(a1)) bad.push(`assign เปลี่ยน ${fmt(a1)}`);
    return bad;
  });
  await probe("A-2", "setDormBuildingAssignment ข้ามร้าน/ข้ามหน่วย: membershipId ร้าน B · STAFF ที่ไม่เข้าหน่วย UX · OWNER เป้าหมาย · buildingId หน่วย UY / ร้าน B / ปน · unitId ร้าน B · owner A ใน ctx B ⇒ ปฏิเสธ · ไม่เขียนทั้งสองร้าน", "BLOCKER", async () => {
    const bad: string[] = [];
    const a0 = await readAssign();
    const sv0 = await db.settingValue.count({ where: { tenantId: tB } });
    const ch0 = await db.settingChange.count({ where: { tenantId: { in: [tA, tB] }, key: ASSIGN } });
    for (const [n, f] of [
      ["membership ร้าน B", () => asg(OWNER, STAFF_B.mid, [bXA])],
      ["STAFF หน่วย UY เท่านั้น", () => asg(OWNER, TARGET_Y.mid, [bXA])],
      ["เป้าหมาย = OWNER", () => asg(OWNER, OWNER.mid, [bXA])],
      ["membership ไม่มีจริง", () => asg(OWNER, "nope-" + RUN, [bXA])],
      ["อาคารหน่วย UY", () => asg(OWNER, CARE_N.mid, [bY])],
      ["อาคารร้าน B", () => asg(OWNER, CARE_N.mid, [bB])],
      ["อาคารปน (XA + ร้าน B)", () => asg(OWNER, CARE_N.mid, [bXA, bB])],
      ["unitId ร้าน B", () => asg(OWNER, CARE_N.mid, [bXA], UB)],
      ["owner A ใน ctx B", () => asg(OWNER, STAFF_B.mid, [bB], UB, ctxB)],
      ["owner B → หน่วย A", () => asg(OWNER_B, CARE_N.mid, [bXA], UX, ctxB)],
      ["buildingIds ไม่ใช่อาร์เรย์", () => DM.setDormBuildingAssignment(OWNER, ctxA, { unitId: UX, membershipId: CARE_N.mid, buildingIds: bXA as Any })],
      ["buildingIds เกิน 50", () => asg(OWNER, CARE_N.mid, Array.from({ length: 51 }, () => bXA))],
    ] as [string, () => Promise<Any>][]) {
      const r = await f();
      if (r?.ok !== false) bad.push(`${n}: ${fmt(r)}`);
    }
    const a1 = await readAssign();
    if (JSON.stringify(a0) !== JSON.stringify(a1)) bad.push(`assign ร้าน A เปลี่ยน ${fmt(a1)}`);
    if ((await db.settingValue.count({ where: { tenantId: tB } })) !== sv0) bad.push("ร้าน B มีแถวค่าตั้งใหม่");
    if ((await db.settingChange.count({ where: { tenantId: { in: [tA, tB] }, key: ASSIGN } })) !== ch0) bad.push("มีประวัติ SettingChange ใหม่");
    // positive control: owner ตั้งให้ CARE_N ได้ แล้วมีผลกับขอบเขต
    const ok1 = await asg(OWNER, CARE_N.mid, [bXB]);
    const sc = await DM.dormBuildingScope(ctxA, { unitId: UX, userId: CARE_N.userId });
    if (!ok1?.ok || JSON.stringify(sc.buildingIds) !== JSON.stringify([bXB])) bad.push(`positive: owner ตั้งไม่ได้/ไม่มีผล ${fmt(ok1)} ${fmt(sc)}`);
    await set(OWNER, [{ key: ASSIGN, scope: "UNIT", scopeId: UX, value: baseAssign }]);
    return bad;
  });
  await probe("C-2", "applyDormRolePreset TECH vs ACCOUNTANT พร้อมกัน 2 โพรเซส ⇒ ผลสุดท้ายตรงชุดใดชุดหนึ่งครบ (ไม่ผสม)", "MINOR", async () => {
    const bad: string[] = [];
    for (let i = 0; i < 3; i++) {
      const at = Date.now() + 2500;
      const [a, b] = await Promise.all([
        child({ kind: "preset", at, actor: ownerA, ctx: ctxA, input: { unitId: UX, membershipId: TARGET_X.mid, role: "TECH" } }),
        child({ kind: "preset", at, actor: ownerA, ctx: ctxA, input: { unitId: UX, membershipId: TARGET_X.mid, role: "ACCOUNTANT" } }),
      ]);
      const pm = ((await db.membership.findFirst({ where: { id: TARGET_X.mid }, select: { permissions: true } }))?.permissions ?? {}) as Record<string, unknown>;
      const match = (role: "TECH" | "ACCOUNTANT") => Object.entries(DM.dormPresetPermissions(role)).every(([k, v]) => (pm[k] === true) === v);
      if (!(match("TECH") || match("ACCOUNTANT"))) bad.push(`รอบ ${i + 1}: ผสม ${fmt(pm)} (a=${fmt(a?.out)} b=${fmt(b?.out)})`);
    }
    return bad;
  });
} catch (e) {
  console.error(`🔴 ${LABEL} throw: ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  const left = await db.tenant.count({ where: { slug: { startsWith: SLUG } } });
  const lu = await db.user.count({ where: { email: { startsWith: SLUG } } });
  console.log(`\nล้างข้อมูล: tenant ค้าง ${left} · user ค้าง ${lu}`);
  const br = results.filter((r) => r.res === "BREACH");
  const er = results.filter((r) => r.res === "ERR");
  console.log(`\nสรุป ${LABEL}: HOLD ${results.filter((r) => r.res === "HOLD").length} · INFO ${results.filter((r) => r.res === "INFO").map((r) => r.id).join(" ") || "-"} · BREACH ${br.length} (${br.map((r) => `${r.id}/${r.sev}`).join(" ")}) · ERR ${er.length} (${er.map((r) => r.id).join(" ")})`);
  await db.$disconnect();
  process.exit(exitCode || (br.length || er.length ? 1 : 0));
}
