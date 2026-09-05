// QC — บอร์ดงาน WO K1.9: ไฟล์แนบ + ปก (FileAsset ผ่าน src/lib/storage · magic bytes · 10 MB · ≤20/การ์ด · สิทธิ์ · ข้ามร้าน)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.9
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast · ไม่ยิง Bunny จริง — ฉีด deps.put
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/attachments.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/attachments.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const q = async <T = Any,>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe(sql) as Promise<T[]>;
const fails = async (f: () => Promise<unknown>): Promise<Any> => { try { await f(); return null; } catch (e) { return e; } };
const P = prisma as Any;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(200).fill(0)]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...new Array(100).fill(0x20)]);
const EXE = new Uint8Array([0x4d, 0x5a, ...new Array(100).fill(0)]);
const puts: string[] = [];
const deps = { put: async (path: string) => { puts.push(path); } };
let otherTid = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const owner = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId };
  const thanaCtx = { tenantId: tid, systemId: SYS, actorUserId: E.users.staff.thana.userId };
  const att = (await import("@/lib/modules/kanban/attachments" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const { KANBAN_LIMITS } = (await import("@/lib/modules/kanban/limits" as string)) as { KANBAN_LIMITS: Any };

  // ═══ S1 schema ═══
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanAttachment'`)).map((r) => r.column_name);
  chk("K1.9-S1.1", "ตาราง KanbanAttachment: cardId fileId name contentType bytes uploadedById createdAt deletedAt", ["cardId", "fileId", "name", "contentType", "bytes", "uploadedById", "createdAt", "deletedAt"].every((c) => cols.includes(c)), "ครบ", cols.join(","));

  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.9 ไฟล์แนบ" });

  // ═══ S2 อัปโหลด ═══
  const a1 = await att.addAttachment(owner, card.id, { filename: "ราคาต้นทุน.pdf", contentType: "application/pdf", data: PDF }, deps);
  chk("K1.9-S2.1", "addAttachment pdf → row {id,name,contentType,bytes,url} + FileAsset kind ATTACHMENT + deps.put ถูกเรียก 1 ครั้ง", !!a1?.id && a1.name === "ราคาต้นทุน.pdf" && a1.contentType === "application/pdf" && a1.bytes === PDF.length && typeof a1.url === "string" && puts.length === 1 && !!(await prisma.fileAsset.findUnique({ where: { id: a1.fileId } })), "ok", JSON.stringify({ id: a1?.id, puts: puts.length }));
  const a2 = await att.addAttachment(owner, card.id, { filename: "แคปหน้าจอ.png", contentType: "image/png", data: PNG }, deps);
  chk("K1.9-S2.2", "addAttachment png → ok · path ใน storage อยู่ใต้ t/<tenantId>/", !!a2?.id && puts[1]!.includes(`t/${tid}/`), "t/<tenant>/", puts[1] ?? "", "MAJOR");
  const eFake = await fails(() => att.addAttachment(owner, card.id, { filename: "ไวรัส.png", contentType: "image/png", data: EXE }, deps));
  chk("K1.9-S2.3", "ประกาศ png แต่ไบต์เป็น MZ (exe) → ปฏิเสธ ไทย · ไม่สร้างแถว/ไม่ put", !!eFake && /[ก-๙]/.test(String(eFake?.message ?? eFake)) && puts.length === 2 && (await P.kanbanAttachment.count({ where: { cardId: card.id } })) === 2, "ปฏิเสธ", String(eFake?.message ?? eFake).slice(0, 60));
  const eExe = await fails(() => att.addAttachment(owner, card.id, { filename: "setup.exe", contentType: "application/x-msdownload", data: EXE }, deps));
  chk("K1.9-S2.4", "exe → ปฏิเสธ (ชนิดไม่อยู่ในรายการอนุญาต)", !!eExe && puts.length === 2, "ปฏิเสธ", String(eExe?.message ?? "").slice(0, 60));
  const big = new Uint8Array(KANBAN_LIMITS.attachmentMaxBytes + 1); big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const eBig = await fails(() => att.addAttachment(owner, card.id, { filename: "ใหญ่.pdf", contentType: "application/pdf", data: big }, deps));
  chk("K1.9-S2.5", "เกิน 10 MB → ปฏิเสธ ไทย (KANBAN_LIMITS.attachmentMaxBytes)", !!eBig && /[ก-๙]/.test(String(eBig?.message ?? eBig)) && puts.length === 2, "ปฏิเสธ", String(eBig?.message ?? eBig).slice(0, 60));
  for (let i = 0; i < KANBAN_LIMITS.attachmentsPerCard - 2; i++) await att.addAttachment(owner, card.id, { filename: `เอกสาร${i}.pdf`, contentType: "application/pdf", data: PDF }, deps);
  const eCount = await fails(() => att.addAttachment(owner, card.id, { filename: "เกิน.pdf", contentType: "application/pdf", data: PDF }, deps));
  chk("K1.9-S2.6", "ไฟล์ที่ 21 → ปฏิเสธ ไทย (≤20/การ์ด)", !!eCount && /[ก-๙]/.test(String(eCount?.message ?? eCount)) && (await P.kanbanAttachment.count({ where: { cardId: card.id, deletedAt: null } })) === KANBAN_LIMITS.attachmentsPerCard, "20 + ปฏิเสธ", String(await P.kanbanAttachment.count({ where: { cardId: card.id, deletedAt: null } })));

  // ═══ S3 ปก + ลบ + list ═══
  await att.setCover(owner, card.id, a2.id);
  chk("K1.9-S3.1", "setCover(png) → card.coverFileId = fileId ของ a2", ((await prisma.kanbanCard.findUnique({ where: { id: card.id } })) as Any).coverFileId === a2.fileId, "fileId", "ไม่ตรง");
  const eCoverPdf = await fails(() => att.setCover(owner, card.id, a1.id));
  chk("K1.9-S3.2", "ตั้งปกด้วย pdf (ไม่ใช่รูป) → error ไทย", !!eCoverPdf && /[ก-๙]/.test(String(eCoverPdf?.message ?? eCoverPdf)), "error", String(eCoverPdf?.message ?? "").slice(0, 60), "MAJOR");
  const list = await att.listAttachments(owner, card.id);
  chk("K1.9-S3.3", "listAttachments → 20 รายการ (ไม่รวมที่ลบ) มี {id,name,contentType,bytes,url,isCover,uploadedBy{name}}", Array.isArray(list) && list.length === 20 && list.some((x: Any) => x.id === a2.id && x.isCover === true) && typeof list[0].uploadedBy?.name === "string", "20 + isCover", JSON.stringify(list?.[0]).slice(0, 120));
  await att.removeAttachment(owner, a2.id);
  const a2row = await P.kanbanAttachment.findUnique({ where: { id: a2.id } });
  chk("K1.9-S3.4", "removeAttachment ปก → soft delete (deletedAt) + card.coverFileId กลับเป็น null", a2row?.deletedAt instanceof Date && ((await prisma.kanbanCard.findUnique({ where: { id: card.id } })) as Any).coverFileId === null, "null", String(((await prisma.kanbanCard.findUnique({ where: { id: card.id } })) as Any).coverFileId));
  chk("K1.9-S3.5", "หลังลบ 1 → เพิ่มได้อีก 1 (นับเฉพาะที่ยังอยู่)", !!(await att.addAttachment(owner, card.id, { filename: "แทน.pdf", contentType: "application/pdf", data: PDF }, deps).catch(() => null)), "เพิ่มได้", "ไม่ได้", "MAJOR");

  // ═══ S4 สิทธิ์ · ข้ามร้าน ═══
  const eHidden = await fails(() => att.addAttachment(thanaCtx, card.id, { filename: "x.pdf", contentType: "application/pdf", data: PDF }, deps));
  chk("K1.9-S4.1", "thana (มองไม่เห็นบอร์ด PRIVATE) แนบไฟล์ → ไม่พบ (404-class)", !!eHidden && (eHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eHidden?.message))), "ไม่พบ", `${eHidden?.name}`);
  await members.addMember(owner, E.boards.patong.id, E.users.staff.thana.userId, "VIEWER");
  const eViewer = await fails(() => att.addAttachment(thanaCtx, card.id, { filename: "x.pdf", contentType: "application/pdf", data: PDF }, deps));
  const listViewer = await att.listAttachments(thanaCtx, card.id).catch(() => "ERR");
  chk("K1.9-S4.2", "VIEWER แนบไม่ได้ (403) แต่ดูรายการได้", !!eViewer && (eViewer?.name === "KanbanForbiddenError" || eViewer?.status === 403) && Array.isArray(listViewer) && listViewer.length === 20, "403 + list 20", `${eViewer?.name} / ${Array.isArray(listViewer) ? listViewer.length : listViewer}`);
  await members.removeMember(owner, E.boards.patong.id, E.users.staff.thana.userId);
  const t2 = await prisma.tenant.create({ data: { name: "QC K1.9 อื่น", slug: `qc-k19-${Date.now()}` } }); otherTid = t2.id;
  const s2 = await (await import("@/lib/modules/system/service")).createSystem(t2.id, "KANBAN", "B");
  const ctxB = { tenantId: t2.id, systemId: s2.id, actorUserId: E.users.owner.userId };
  const eCross = await fails(() => att.listAttachments(ctxB, card.id));
  const eCrossRm = await fails(() => att.removeAttachment(ctxB, a1.id));
  chk("K1.9-S4.3", "ร้านอื่นดู/ลบไฟล์แนบของเรา → ไม่พบ · ไม่เปลี่ยน", !!eCross && !!eCrossRm && (await P.kanbanAttachment.findUnique({ where: { id: a1.id } })).deletedAt === null, "ไม่พบ", `${eCross?.name}/${eCrossRm?.name}`);

  // ═══ S5 static UI ═══
  const ui = existsSync("src/components/kanban/Attachments.tsx") ? readFileSync("src/components/kanban/Attachments.tsx", "utf8") : "";
  const cardUi = existsSync("src/components/kanban/Card.tsx") ? readFileSync("src/components/kanban/Card.tsx", "utf8") : "";
  const cb = existsSync("src/components/kanban/CardBack.tsx") ? readFileSync("src/components/kanban/CardBack.tsx", "utf8") : "";
  chk("K1.9-S5.1", "UI: Attachments.tsx (client) มี input type=file · testid attachment-list · attachment-upload · ปุ่ม 'ตั้งเป็นปก' · CardBack ใช้", /"use client"/.test(ui) && /type="file"/.test(ui) && ui.includes('"attachment-list"') && ui.includes('"attachment-upload"') && /ตั้งเป็นปก/.test(ui) && /Attachments/.test(cb), "ครบ", "ขาด", "MAJOR");
  chk("K1.9-S5.2", "Card.tsx แสดงปก (coverUrl/coverFileId) + ตราจำนวนไฟล์", /cover/i.test(cardUi) && /attachment/i.test(cardUi), "ปก+ตรา", "ไม่พบ", "MAJOR");
  const actions = existsSync("src/lib/modules/kanban/actions.ts") ? readFileSync("src/lib/modules/kanban/actions.ts", "utf8") : "";
  chk("K1.9-S5.3", "actions: uploadAttachmentAction(FormData) · removeAttachmentAction · setCoverAction (export เฉพาะ *Action)", ["uploadAttachmentAction", "removeAttachmentAction", "setCoverAction"].every((a) => actions.includes(`function ${a}`)) && (actions.match(/export (async )?function (\w+)/g) ?? []).every((m) => /Action\b/.test(m)), "ครบ", "ขาด", "MAJOR");

  // cleanup
  const rows = await P.kanbanAttachment.findMany({ where: { cardId: card.id } }) as Any[];
  await P.kanbanAttachment.deleteMany({ where: { cardId: card.id } });
  await prisma.fileAsset.deleteMany({ where: { id: { in: rows.map((r) => r.fileId) } } });
  await prisma.kanbanCard.deleteMany({ where: { id: card.id } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${E.boards.patong.id}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  if (otherTid) { try { await P.appSystem.deleteMany({ where: { tenantId: otherTid } }); await prisma.tenant.delete({ where: { id: otherTid } }); } catch { /* */ } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.9 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
