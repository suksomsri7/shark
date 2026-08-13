// QC — ระบบ "การจัดการ" Page + Widget + PIN login (P1 · มติเจ้าของ 13 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] Registry sync: ทุกเมนูใน childrenFor (layout) ต้องมี widget ใน registry — เมนูใหม่ห้ามตกหล่น
// [2] Page ผูกกิจการ: widget เลือกได้เฉพาะเมนูของกิจการนั้น + ระบบที่กิจการใช้ได้
// [3] 🔴 PIN: ผิด = เข้าไม่ได้ · ยังไม่ตั้ง = เข้าไม่ได้ · ถูก = ได้ userId/tenantId · ปิด Page = เข้าไม่ได้
// [4] สิทธิ์เข้าดู: OWNER เห็นหมด · พนักงานเห็นตาม allowedWidgetKeys · คนนอก Page = ไม่เข้า
// [5] ไม่รั่วข้ามร้าน: จัดการ/อ่าน Page ของร้านอื่นไม่ได้
// [6] จัดลำดับ: id ข้ามร้าน/มั่ว ถูกเมิน · ลำดับที่ส่งถูกบันทึกจริง
//
// รัน: pnpm exec tsx scripts/qc-pages.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const { existsSync, readFileSync } = await import("node:fs");
const sys = await import("@/lib/modules/system/service");
const pages = await import("@/lib/pages/service");
const { WIDGET_DEFS } = await import("@/lib/pages/registry");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tid = "";
let otherTid = "";
try {
  // ── [1] registry sync กับ childrenFor ใน layout ──
  console.log("── registry sync ──");
  const layoutSrc = readFileSync("src/app/app/layout.tsx", "utf8");
  const body = layoutSrc.slice(layoutSrc.indexOf("const childrenFor"), layoutSrc.indexOf("// ระบบทั้งหมด"));
  const splitAt = body.indexOf("const s = `/app/sys");
  const parse = (text: string, kind: "business" | "feature") => {
    const out: { type: string; suffix: string }[] = [];
    const caseRe = /case\s+"([A-Z_]+)":([\s\S]*?)(?=case\s+"|default:)/g;
    let m: RegExpExecArray | null;
    while ((m = caseRe.exec(text)) !== null) {
      const hrefRe = /href:\s*(`[^`]*`|\bs\b|\bb\b)/g;
      let h: RegExpExecArray | null;
      while ((h = hrefRe.exec(m[2]!)) !== null) {
        const tok = h[1]!;
        const suffix = tok === "s" || tok === "b" ? "" : (/^\$\{[bs]\}(.*)$/.exec(tok.slice(1, -1))?.[1] ?? "");
        out.push({ type: m[1]!, suffix });
      }
    }
    return out;
  };
  const navEntries = [
    ...parse(body.slice(0, splitAt), "business").map((e) => ({ ...e, kind: "business" as const })),
    ...parse(body.slice(splitAt), "feature").map((e) => ({ ...e, kind: "feature" as const })),
  ];
  const regKeys = new Set(WIDGET_DEFS.map((w) => w.key));
  const missing = navEntries.filter(
    (e) => !regKeys.has(`${e.kind === "business" ? "B" : "S"}:${e.type}${e.suffix}`),
  );
  chk("RG-1", `ทุกเมนูใน childrenFor มี widget ใน registry (${navEntries.length} เมนู)`,
    missing.length === 0, "ครบ", JSON.stringify(missing.slice(0, 5)));
  chk("RG-2", "registry ไม่มี key ซ้ำ", regKeys.size === WIDGET_DEFS.length, "ไม่ซ้ำ",
    `${WIDGET_DEFS.length - regKeys.size} ซ้ำ`);
  chk("RG-3", "มีหน้า /app/pages + /app/pages/[pageId] + /p/[slug] + /api/page-login",
    existsSync("src/app/app/pages/page.tsx") && existsSync("src/app/app/pages/[pageId]/page.tsx") &&
      existsSync("src/app/p/[slug]/page.tsx") && existsSync("src/app/api/page-login/route.ts"),
    "ครบ 4", "ขาด");
  chk("RG-4", "🔴 route login มีด่านกันเดา PIN (rate limit ต่อสมาชิก + ต่อ IP)",
    /checkRateLimit\(\s*`page-login:/.test(readFileSync("src/app/api/page-login/route.ts", "utf8")) &&
      /checkRateLimit\(\s*`page-login-ip:/.test(readFileSync("src/app/api/page-login/route.ts", "utf8")),
    "มี 2 ชั้น", "ขาด");

  // ── setup: ร้านตัดผม (BOOKING) + ระบบ POS/HR ผูกกิจการ ──
  const t = await prisma.tenant.create({ data: { name: "QC Page", slug: `qc-pg-${Date.now()}` } });
  tid = t.id;
  const ctx = { tenantId: tid };
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "ร้านตัดผม", slug: `pg-${Date.now()}` },
  });
  const unit2 = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "SHOP", name: "ร้านออนไลน์", slug: `pg2-${Date.now()}` },
  });
  const posSys = await sys.createSystem(tid, "POS", "ขายหน้าร้าน POS");
  await sys.linkUnit(tid, posSys.id, unit.id); // POS ผูกร้านตัดผมเท่านั้น
  const hrSys = await sys.createSystem(tid, "HR", "พนักงาน HR"); // ไม่ผูกสาขาไหน = ระดับร้าน
  const owner = await prisma.user.create({ data: { email: `qc-pg-o-${Date.now()}@example.com`, name: "เจ้าของ" } });
  const staffU = await prisma.user.create({ data: { email: `qc-pg-s-${Date.now()}@example.com`, name: "พนักงานเอ" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: owner.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const staffM = await prisma.membership.create({
    data: { tenantId: tid, userId: staffU.id, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date() },
  });

  // ── [2] สร้าง Page + ขอบเขต widget ──
  console.log("── Page + ขอบเขต widget ──");
  const created = await pages.createPage(ctx, { unitId: unit.id, name: "หน้าพนักงาน" });
  chk("PG-1", "สร้าง Page ได้ + มี slug สาธารณะ", created.ok === true && !!created.id, "ok", JSON.stringify(created));
  const pageId = created.id!;
  const avail = await pages.availableWidgets(ctx, pageId);
  chk("PG-2", "widget ที่เลือกได้ = เมนูจองคิว + POS (ผูกกิจการนี้) + HR (ระดับร้าน)",
    avail.some((w) => w.key === "B:BOOKING/booking") && avail.some((w) => w.key === "S:POS/pos/register") &&
      avail.some((w) => w.key === "S:HR/hr/attendance"),
    "มีครบ 3 กลุ่ม", JSON.stringify([...new Set(avail.map((w) => w.type))]));
  chk("PG-3", "🔴 เมนูของกิจการอื่น/ระบบที่ไม่ได้เปิด ไม่โผล่ให้เลือก (มติ: เห็นเฉพาะของกิจการนั้น)",
    !avail.some((w) => w.type === "SHOP") && !avail.some((w) => w.type === "ACCOUNT"),
    "ไม่มี SHOP/ACCOUNT", JSON.stringify([...new Set(avail.map((w) => w.type))]));
  const addOk = await pages.addWidget(ctx, pageId, "S:POS/pos/register");
  await pages.addWidget(ctx, pageId, "B:BOOKING/booking");
  await pages.addWidget(ctx, pageId, "S:HR/hr/attendance");
  chk("PG-4", "เพิ่ม widget ได้", addOk.ok === true, "ok", JSON.stringify(addOk));
  const addBad = await pages.addWidget(ctx, pageId, "B:SHOP/shop");
  chk("PG-5", "🔴 เพิ่ม widget ของกิจการอื่น → ปฏิเสธ", addBad.ok === false, "false", JSON.stringify(addBad));
  const addDup = await pages.addWidget(ctx, pageId, "S:POS/pos/register");
  chk("PG-6", "เพิ่มซ้ำ → ปฏิเสธ", addDup.ok === false, "false", JSON.stringify(addDup));

  // ── [6] จัดลำดับ ──
  const pg = await pages.getPage(ctx, pageId);
  const idsDesc = [...pg!.widgets.map((w) => w.id)].reverse();
  await pages.reorderWidgets(ctx, pageId, ["fake-id", ...idsDesc]);
  const after = await pages.getPage(ctx, pageId);
  chk("PG-7", "จัดลำดับใหม่ถูกบันทึก (id มั่วถูกเมิน)",
    JSON.stringify(after!.widgets.map((w) => w.id)) === JSON.stringify(idsDesc), "ตามที่ส่ง", "เพี้ยน");

  // ── render + href resolve ──
  const render = await pages.pageForRender(pg!.slug);
  chk("PG-8", "render: business → /app/u/<slug>/... · feature → /app/sys/<id>/...",
    !!render &&
      render.widgets.some((w) => w.href === `/app/u/${unit.slug}/booking`) &&
      render.widgets.some((w) => w.href === `/app/sys/${posSys.id}/pos/register`) &&
      render.widgets.some((w) => w.href === `/app/sys/${hrSys.id}/hr/attendance`),
    "ครบ 3", JSON.stringify(render?.widgets.map((w) => w.href)));

  // ── [3] สมาชิก + PIN ──
  console.log("── สมาชิก + PIN ──");
  const am = await pages.addPageMember(ctx, pageId, staffM.id);
  chk("PM-1", "เพิ่มพนักงานเข้า Page ได้", am.ok === true, "ok", JSON.stringify(am));
  const pm = (await pages.getPage(ctx, pageId))!.members[0]!;
  chk("PM-2", "ชื่อบนจอ login = ชื่อคน ไม่ใช่อีเมล", pm.displayName === "พนักงานเอ", "พนักงานเอ", pm.displayName);
  const noPin = await pages.verifyPageLogin(pg!.slug, pm.id, "1234");
  chk("PM-3", "🔴 ยังไม่ตั้ง PIN → เข้าไม่ได้", noPin.ok === false && noPin.reason === "no_pin", "no_pin", JSON.stringify(noPin));
  const badPin = await pages.setPageMemberPin(ctx, pm.id, "12ab");
  chk("PM-4", "PIN ไม่ใช่ตัวเลข 4-8 หลัก → ปฏิเสธ", badPin.ok === false, "false", JSON.stringify(badPin));
  await pages.setPageMemberPin(ctx, pm.id, "246810");
  const wrong = await pages.verifyPageLogin(pg!.slug, pm.id, "111111");
  chk("PM-5", "🔴 PIN ผิด → เข้าไม่ได้", wrong.ok === false && wrong.reason === "wrong_pin", "wrong_pin", JSON.stringify(wrong));
  const right = await pages.verifyPageLogin(pg!.slug, pm.id, "246810");
  chk("PM-6", "PIN ถูก → ได้ user/tenant ที่ถูกต้อง",
    right.ok === true && right.userId === staffU.id && right.tenantId === tid, "user พนักงานเอ", JSON.stringify(right));
  const roster = await pages.loginRoster(pg!.slug);
  chk("PM-7", "จอ login ไม่มีอีเมลหลุด (มีแต่ชื่อที่ตั้ง)",
    !!roster && roster.members.every((m) => !m.name.includes("@")), "ไม่มี @", JSON.stringify(roster?.members));

  // ── [4] สิทธิ์เข้าดู ──
  console.log("── สิทธิ์เข้าดู ──");
  const ownerAccess = await pages.accessFor(pg!.slug, owner.id);
  chk("AC-1", "OWNER เข้าได้ + เห็นทุก widget", ownerAccess?.admin === true && ownerAccess.allowedKeys === null, "admin", JSON.stringify(ownerAccess));
  const staffAccess = await pages.accessFor(pg!.slug, staffU.id);
  chk("AC-2", "พนักงานใน Page เข้าได้ (ค่าเริ่มต้นเห็นทุก widget ของหน้า)",
    staffAccess?.admin === false && staffAccess.allowedKeys === null, "member/ทั้งหมด", JSON.stringify(staffAccess));
  // จำกัดราย widget (โครง P2 — enforcement ฝั่ง render ต้องทำงานแล้ว)
  await prisma.pageMember.update({ where: { id: pm.id }, data: { allowedWidgetKeys: ["S:POS/pos/register"] } });
  const limited = await pages.accessFor(pg!.slug, staffU.id);
  chk("AC-3", "จำกัดราย widget → เห็นเฉพาะที่อนุญาต",
    limited?.allowedKeys instanceof Set && limited.allowedKeys.has("S:POS/pos/register") && limited.allowedKeys.size === 1,
    "1 key", JSON.stringify(limited && limited.allowedKeys ? [...limited.allowedKeys] : null));
  const stranger = await prisma.user.create({ data: { email: `qc-pg-x-${Date.now()}@example.com` } });
  chk("AC-4", "🔴 คนนอกร้าน login ค้างอยู่ → ไม่เข้า Page นี้", (await pages.accessFor(pg!.slug, stranger.id)) === null, "null", "-");
  await prisma.user.delete({ where: { id: stranger.id } });
  // เอาออกจาก Page → เข้าไม่ได้ทันที
  await pages.removePageMember(ctx, pm.id);
  chk("AC-5", "เอาออกจาก Page → login ไม่ได้ + สิทธิ์หาย",
    (await pages.verifyPageLogin(pg!.slug, pm.id, "246810")).ok === false &&
      (await pages.accessFor(pg!.slug, staffU.id)) === null, "เข้าไม่ได้", "-");

  // ── ปิด Page ──
  await pages.updatePage(ctx, pageId, { active: false });
  chk("PG-9", "ปิด Page → หน้า/login หายทั้งคู่",
    (await pages.pageForRender(pg!.slug)) === null && (await pages.loginRoster(pg!.slug)) === null, "null", "-");
  await pages.updatePage(ctx, pageId, { active: true });

  // ── [5] ข้ามร้าน ──
  console.log("── ข้ามร้าน ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-pg2-${Date.now()}` } });
  otherTid = t2.id;
  const crossCtx = { tenantId: otherTid };
  chk("XT-1", "ร้านอื่นอ่าน Page ของเราไม่เห็น", (await pages.getPage(crossCtx, pageId)) === null, "null", "-");
  const crossAdd = await pages.addWidget(crossCtx, pageId, "B:BOOKING/booking");
  chk("XT-2", "🔴 ร้านอื่นเพิ่ม widget ให้ Page เราไม่ได้", crossAdd.ok === false, "false", JSON.stringify(crossAdd));
  const crossPin = await pages.setPageMemberPin(crossCtx, pm.id, "9999");
  chk("XT-3", "🔴 ร้านอื่นตั้ง PIN ให้สมาชิกเราไม่ได้", crossPin.ok === false, "false", JSON.stringify(crossPin));
  await pages.reorderWidgets(crossCtx, pageId, ["a", "b"]);
  const stillOrdered = await pages.getPage(ctx, pageId);
  chk("XT-4", "ร้านอื่นสั่งจัดลำดับ Page เรา → ไม่มีผล",
    JSON.stringify(stillOrdered!.widgets.map((w) => w.id)) === JSON.stringify(idsDesc), "ลำดับเดิม", "เพี้ยน");
  const crossDel = await pages.deletePage(crossCtx, pageId);
  chk("XT-5", "ร้านอื่นลบ Page เราไม่ได้", crossDel.ok === true && (await pages.getPage(ctx, pageId)) !== null, "ยังอยู่", "-");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e));
} finally {
  for (const id of [tid, otherTid].filter(Boolean)) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    for (const [n, fn] of [
      ["page", () => prisma.page.deleteMany({ where: { tenantId: id } })],
      ["appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: id } })],
      ["appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: id } })],
      ["membershipUsers", async () => {
        const ms = await prisma.membership.findMany({ where: { tenantId: id }, select: { userId: true } });
        await prisma.membership.deleteMany({ where: { tenantId: id } });
        for (const m of ms) await prisma.user.deleteMany({ where: { id: m.userId, email: { endsWith: "@example.com" } } });
      }],
      ["unit", () => prisma.businessUnit.deleteMany({ where: { tenantId: id } })],
      ["tenant", () => prisma.tenant.delete({ where: { id } })],
    ] as [string, () => Promise<unknown>][]) await del(n, fn);
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: ระบบการจัดการ (Page + Widget + PIN) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
