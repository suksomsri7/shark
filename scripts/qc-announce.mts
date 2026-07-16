// QC — ประกาศระบบ (WO-0031) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา:
// src/lib/platform/announce.ts (backoffice — prisma ตรง):
//   createAnnouncement(pu, { title, body }): Promise<{id}>          // ฉบับร่าง (publishedAt null) + audit "announce.create" — ทุก role platform สร้างได้
//   publishAnnouncement(pu, id): Promise<boolean>                    // ตั้ง publishedAt + audit "announce.publish" · ประกาศแล้ว → false
//   unpublishAnnouncement(pu, id): Promise<boolean>                  // เอาลง (publishedAt=null) + audit "announce.unpublish"
//   listAnnouncements(): ทั้งหมด ใหม่→เก่า
// src/lib/announce/service.ts (ฝั่งร้าน):
//   activeAnnouncements(ctx {tenantId}): เฉพาะ published ที่ร้านนี้ยังไม่กดรับทราบ ใหม่→เก่า
//   dismissAnnouncement(ctx, announcementId): Promise<boolean>       // idempotent (ซ้ำ → true เงียบ ๆ ไม่พัง)
// UI: banner บน /app (แสดง active ตัวล่าสุด + ปุ่มรับทราบ) · /backoffice/announcements (สร้าง/ประกาศ/เอาลง)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = ""; let puId = ""; const annIds: string[] = [];
try {
  const plat = await import("@/lib/platform/announce" as string).catch(() => null);
  const shop = await import("@/lib/announce/service" as string).catch(() => null);
  if (!plat || !shop) { chk("AN-0", "มี platform/announce.ts + announce/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC ANN", slug: `qc-an-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC ANN2", slug: `qc-an2-${Date.now()}` } }); tid2 = t2.id;
    const pu = await prisma.platformUser.create({ data: { email: `qc-an-${Date.now()}@x.com`, role: "SUPPORT" } }); puId = pu.id;

    const a1 = await plat.createAnnouncement(pu, { title: "ปิดปรับปรุงคืนนี้", body: "ระบบจะปิด 02:00-03:00" }); annIds.push(a1.id);
    chk("AN-1.1", "สร้างฉบับร่าง + audit", (await prisma.platformAnnouncement.findUnique({ where: { id: a1.id } }))?.publishedAt === null && (await prisma.platformAuditLog.count({ where: { targetId: a1.id, action: "announce.create" } })) === 1, "ร่าง+audit", "?");
    chk("AN-1.2", "ฉบับร่าง ร้านยังไม่เห็น", (await shop.activeAnnouncements({ tenantId: tid })).length === 0, "0", "?");
    chk("AN-2.1", "publish → ร้านเห็น", (await plat.publishAnnouncement(pu, a1.id)) === true && (await shop.activeAnnouncements({ tenantId: tid })).some((x: { id: string }) => x.id === a1.id), "เห็น", "?");
    chk("AN-2.2", "publish ซ้ำ → false", (await plat.publishAnnouncement(pu, a1.id)) === false, "false", "?");
    chk("AN-3.1", "ร้าน A รับทราบ → หายจาก A แต่ B ยังเห็น", (await shop.dismissAnnouncement({ tenantId: tid }, a1.id)) === true && (await shop.activeAnnouncements({ tenantId: tid })).length === 0 && (await shop.activeAnnouncements({ tenantId: tid2 })).length === 1, "A หาย B เห็น", "?");
    chk("AN-3.2", "รับทราบซ้ำ → true ไม่พัง (idempotent)", (await shop.dismissAnnouncement({ tenantId: tid }, a1.id)) === true, "true", "?");
    chk("AN-4.1", "unpublish → ร้าน B ก็ไม่เห็น", (await plat.unpublishAnnouncement(pu, a1.id)) === true && (await shop.activeAnnouncements({ tenantId: tid2 })).length === 0, "0", "?");
    chk("AN-4.2", "listAnnouncements ฝั่ง backoffice เห็นทุกฉบับ", (await plat.listAnnouncements()).some((x: { id: string }) => x.id === a1.id), "เห็น", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) { await d(() => prisma.announcementDismiss.deleteMany({ where: { tenantId: id } })); await d(() => prisma.tenant.delete({ where: { id } })); }
  for (const id of annIds) await d(() => prisma.platformAnnouncement.delete({ where: { id } }));
  if (puId) { await d(() => prisma.platformAuditLog.deleteMany({ where: { platformUserId: puId } })); await d(() => prisma.platformUser.delete({ where: { id: puId } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Announcements =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
