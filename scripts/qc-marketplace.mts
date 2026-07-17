// QC — Marketplace โครง (WO-0063) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/marketplace/service.ts (เทมเพลตอุตสาหกรรม = DNA preset · ใช้ pipeline เดิม saveDnaFacts→proposeBlueprint→applyBlueprint):
//   TEMPLATES: Record<string, { label: string(ไทย), description: string(ไทย), icon: string, facts: DnaFacts }>
//     · อย่างน้อย 4: salon(ร้านเสริมสวย/นัดหมาย) · restaurant(ร้านอาหาร/โต๊ะ) · retail(ร้านค้าปลีก/ขายสินค้า+สต็อก) · hotel(ที่พัก/ห้อง)
//     · facts ต้อง valid ตาม ZDnaFacts (oracle validate ทุกตัว)
//   listTemplates() → [{ key, label, description, icon }]
//   installTemplate(ctx {tenantId}, key) → { ok: true, results } — key ปลอม → throw ไทย
//     · tenant มี DnaProfile อยู่แล้ว → throw ไทย ("ตั้งค่าแล้ว...") — กัน clobber ร้านที่ตั้งค่าเอง
//     · สำเร็จ → บันทึก TenantInstall (unique [tenantId,itemKey]) + เก็บ blueprintId · ติดตั้งซ้ำ key เดิม → throw ไทย
//   listInstalled(ctx) → TenantInstall[]
//   UI: /app/marketplace — grid เทมเพลต (ไอคอน+ป้าย+คำอธิบาย+ปุ่มติดตั้ง/ป้าย "ติดตั้งแล้ว") + ลิงก์ NavDrawer · actions assertCan marketplace.template.install
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { ZDnaFacts } = await import("@/lib/dna/schema");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = ""; let tid2 = "";
try {
  const mp = (await import("@/lib/marketplace/service" as string).catch(() => null)) as { [k: string]: any } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!mp) { chk("MP-0", "มี marketplace/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const keys = Object.keys(mp.TEMPLATES ?? {});
    chk("MP-1.1", "TEMPLATES ≥4 (salon/restaurant/retail/hotel) ป้าย+คำอธิบายไทย", ["salon", "restaurant", "retail", "hotel"].every((k) => keys.includes(k)) && keys.every((k) => /[ก-๙]/.test(mp.TEMPLATES[k].label) && /[ก-๙]/.test(mp.TEMPLATES[k].description)), "ครบ 4", JSON.stringify(keys));
    chk("MP-1.2", "facts ทุกเทมเพลต valid ตาม ZDnaFacts", keys.every((k) => ZDnaFacts.safeParse(mp.TEMPLATES[k].facts).success), "valid หมด", JSON.stringify(keys.filter((k) => !ZDnaFacts.safeParse(mp.TEMPLATES[k].facts).success)));
    const t = await prisma.tenant.create({ data: { name: "QC MP", slug: `qc-mp-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    let thKey = false; try { await mp.installTemplate(ctx, "ไม่มีจริง"); } catch { thKey = true; }
    chk("MP-2.1", "key ปลอม → throw", thKey, "throw", "?");
    const r = await mp.installTemplate(ctx, "retail");
    const sysCount = await prisma.appSystem.count({ where: { tenantId: tid } });
    const unitCount = await prisma.businessUnit.count({ where: { tenantId: tid } });
    chk("MP-2.2", "ติดตั้ง retail → ระบบ+หน่วยธุรกิจเกิดจริง (≥1/≥1) + TenantInstall บันทึก", r.ok === true && sysCount >= 1 && unitCount >= 1 && (await prisma.tenantInstall.count({ where: { tenantId: tid, itemKey: "retail" } })) === 1, "≥1/≥1/1", `${sysCount}/${unitCount}`);
    let thDup = false; try { await mp.installTemplate(ctx, "retail"); } catch { thDup = true; }
    let thHasDna = false; try { await mp.installTemplate(ctx, "salon"); } catch { thHasDna = true; }
    chk("MP-2.3", "ติดตั้งซ้ำ / tenant มี DNA แล้วติดตั้งเทมเพลตอื่น → throw ทั้งคู่ (กัน clobber)", thDup && thHasDna, "throw", `${thDup}/${thHasDna}`);
    chk("MP-2.4", "listInstalled = 1", ((await mp.listInstalled(ctx)) as unknown[]).length === 1, "1", "?");
    const t2 = await prisma.tenant.create({ data: { name: "QC MP2", slug: `qc-mp2-${Date.now()}` } }); tid2 = t2.id;
    chk("MP-3.1", "tenant อื่น listInstalled = 0 (guard)", ((await mp.listInstalled({ tenantId: tid2 })) as unknown[]).length === 0, "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["tenantInstall", "dnaBlueprint", "dnaProfile", "accountSystemLink", "accountSettings", "accountLedger", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Marketplace =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
