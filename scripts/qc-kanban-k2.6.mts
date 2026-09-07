// QC — บอร์ดงาน WO K2.6: ฟิลด์กำหนดเอง 5 ชนิด (≤20/บอร์ด) — fields.ts · ค่าต่อการ์ด · แสดงบนการ์ด/หลังการ์ด/ตาราง · ตั้งค่าบอร์ด
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.6
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/fields.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/fields.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
let boardId = ""; let thanaMemberAdded = false;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const fx = (await import("@/lib/modules/kanban/fields" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  boardId = E.boards.maint.id; // TENANT board — thana เป็น VIEWER ผ่าน visibility (K2.6 builder แย้งถูก) → เชิญเป็น EDITOR ชั่วคราว (ลบใน finally)
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  await (prisma as Any).kanbanBoardMember.deleteMany({ where: { boardId, userId: thana.userId } });
  await members.addMember(ctxO, boardId, thana.userId, "EDITOR");
  thanaMemberAdded = true;
  const card = (await prisma.kanbanCard.findFirst({ where: { boardId, status: "ACTIVE" }, orderBy: { cardNo: "asc" } }))!;

  // ═══ S1 schema ═══
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCustomField'`)).map((c) => c.column_name);
  const vcols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCustomFieldValue'`)).map((c) => c.column_name);
  chk("K2.6-S1.1", "KanbanCustomField {boardId name type options(Json) showOnCard sortOrder} · KanbanCustomFieldValue {cardId fieldId valueText valueNumber valueDate valueBool valueOption} · enum 5 ชนิด", ["boardId", "name", "type", "options", "showOnCard", "sortOrder"].every((c) => cols.includes(c)) && ["cardId", "fieldId", "valueText", "valueNumber", "valueDate", "valueBool", "valueOption"].every((c) => vcols.includes(c)), "ครบ", `${cols.join(",")} | ${vcols.join(",")}`);
  const enums = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='KanbanCustomFieldType'`)).map((e) => e.enumlabel);
  chk("K2.6-S1.2", "enum KanbanCustomFieldType = TEXT NUMBER DATE CHECKBOX SELECT", ["TEXT", "NUMBER", "DATE", "CHECKBOX", "SELECT"].every((v) => enums.includes(v)), "5", enums.join(","));

  // ═══ S2 นิยามฟิลด์ (ADMIN) ═══
  const f1 = await fx.createField(ctxO, owner, boardId, { name: "งบประมาณ", type: "NUMBER", showOnCard: true, options: { unit: "บาท" } });
  const f2 = await fx.createField(ctxO, owner, boardId, { name: "ความสำคัญ", type: "SELECT", showOnCard: true, options: { choices: ["สูง", "กลาง", "ต่ำ"] } });
  const f3 = await fx.createField(ctxO, owner, boardId, { name: "วันส่งซ่อม", type: "DATE" });
  const f4 = await fx.createField(ctxO, owner, boardId, { name: "ต้องมีใบเสร็จ", type: "CHECKBOX" });
  const f5 = await fx.createField(ctxO, owner, boardId, { name: "เลขอ้างอิง", type: "TEXT" });
  chk("K2.6-S2.1", "createField ครบ 5 ชนิด · sortOrder ต่อเนื่อง 0..4 · showOnCard ตามที่ส่ง", [f1, f2, f3, f4, f5].every((f) => f?.id) && [f1, f2, f3, f4, f5].map((f) => f.sortOrder).join(",") === "0,1,2,3,4" && f1.showOnCard === true && f3.showOnCard === false, "5 ฟิลด์", JSON.stringify([f1, f2, f3, f4, f5].map((f) => [f?.name, f?.type, f?.sortOrder])));
  const eDup = await fails(() => fx.createField(ctxO, owner, boardId, { name: "งบประมาณ", type: "TEXT" }));
  const eEd = await fails(() => fx.createField(ctxT, thana, boardId, { name: "x", type: "TEXT" }));
  chk("K2.6-S2.2", "ชื่อซ้ำ → throw ไทย · EDITOR สร้างฟิลด์ไม่ได้ (ADMIN เท่านั้น)", !!eDup && /[ก-๙]/.test(eDup.message) && !!eEd, "throw/throw", `${eDup?.message?.slice(0, 40)} / ${eEd ? "throw" : "ไม่ throw"}`);
  const eSel = await fails(() => fx.createField(ctxO, owner, boardId, { name: "ว่าง", type: "SELECT", options: { choices: [] } }));
  chk("K2.6-S2.3", "SELECT ไม่มีตัวเลือก → throw ไทย", !!eSel && /[ก-๙]/.test(eSel.message), "throw", eSel?.message?.slice(0, 50) ?? "ไม่ throw", "MAJOR");
  const eLim = await fails(async () => { for (let i = 0; i < 16; i++) await fx.createField(ctxO, owner, boardId, { name: `f${i}`, type: "TEXT" }); });
  const cnt = await (prisma as Any).kanbanCustomField.count({ where: { boardId } });
  chk("K2.6-S2.4", "เพดาน 20 ฟิลด์/บอร์ด (KANBAN_LIMITS.customFieldsPerBoard): ใบที่ 21 throw ไทย LIMIT_REACHED · นับได้ 20", !!eLim && /[ก-๙]/.test(eLim.message) && cnt === 20, "20 + throw", `${cnt} ${eLim?.message?.slice(0, 40) ?? "ไม่ throw"}`);

  // ═══ S3 ค่าต่อการ์ด (EDITOR) ═══
  await fx.setCardFieldValue(ctxT, thana, card.id, f1.id, 12500.5);
  await fx.setCardFieldValue(ctxT, thana, card.id, f2.id, "สูง");
  await fx.setCardFieldValue(ctxT, thana, card.id, f3.id, new Date("2026-10-15T00:00:00.000Z"));
  await fx.setCardFieldValue(ctxT, thana, card.id, f4.id, true);
  await fx.setCardFieldValue(ctxT, thana, card.id, f5.id, "PO-2026-091");
  const vals = await fx.getCardFieldValues(ctxT, thana, card.id);
  chk("K2.6-S3.1", "setCardFieldValue ทั้ง 5 ชนิด → getCardFieldValues คืน [{fieldId,name,type,value,display}] · display ไทย (ตัวเลขมีคั่นหลัก+หน่วย · วันที่ไทย · ✓)", vals.length >= 5 && vals.find((v: Any) => v.fieldId === f1.id)?.value === 12500.5 && /12,500/.test(vals.find((v: Any) => v.fieldId === f1.id)?.display ?? "") && vals.find((v: Any) => v.fieldId === f2.id)?.value === "สูง" && vals.find((v: Any) => v.fieldId === f4.id)?.value === true && /ต\.ค\./.test(vals.find((v: Any) => v.fieldId === f3.id)?.display ?? ""), "5 ค่า + display", JSON.stringify(vals).slice(0, 240));
  const eBadNum = await fails(() => fx.setCardFieldValue(ctxT, thana, card.id, f1.id, "ไม่ใช่ตัวเลข"));
  const eBadSel = await fails(() => fx.setCardFieldValue(ctxT, thana, card.id, f2.id, "ไม่มีตัวเลือกนี้"));
  chk("K2.6-S3.2", "ค่าผิดชนิด (ข้อความใน NUMBER · ตัวเลือกนอกรายการ) → throw ไทย ไม่บันทึก", !!eBadNum && !!eBadSel && /[ก-๙]/.test(eBadNum.message), "throw×2", `${eBadNum?.message?.slice(0, 40)} / ${eBadSel?.message?.slice(0, 40)}`);
  await fx.setCardFieldValue(ctxT, thana, card.id, f5.id, null);
  const vals2 = await fx.getCardFieldValues(ctxT, thana, card.id);
  chk("K2.6-S3.3", "ตั้งค่า null = ล้าง (แถวค่าถูกลบ) · ฟิลด์อื่นไม่กระทบ", !vals2.find((v: Any) => v.fieldId === f5.id && v.value !== null) && vals2.find((v: Any) => v.fieldId === f1.id)?.value === 12500.5, "ล้าง", JSON.stringify(vals2.map((v: Any) => [v.name, v.value])).slice(0, 160), "MAJOR");
  const detail = await cards.getCardDetail(ctxT, card.id);
  chk("K2.6-S3.4", "getCardDetail มี customFields[] (ทุกฟิลด์ของบอร์ด + ค่า) · getBoardView การ์ดมี fieldsOnCard[] เฉพาะ showOnCard ที่มีค่า", Array.isArray(detail?.customFields) && detail.customFields.length === 20 && detail.customFields.find((f: Any) => f.fieldId === f1.id)?.value === 12500.5, "customFields 20", JSON.stringify(detail?.customFields?.slice(0, 2) ?? null).slice(0, 160));
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const bv = await svc.getBoardView({ tenantId: tid, systemId: SYS, actorUserId: thana.userId }, thana, boardId).catch(() => svc.getBoardView(ctxT, boardId));
  const bvCard = bv?.columns?.flatMap((c: Any) => c.cards).find((c: Any) => c.id === card.id);
  chk("K2.6-S3.5", "การ์ดในบอร์ดแสดง fieldsOnCard = [งบประมาณ ฿12,500.50, ความสำคัญ สูง] (showOnCard เท่านั้น)", Array.isArray(bvCard?.fieldsOnCard) && bvCard.fieldsOnCard.length === 2 && bvCard.fieldsOnCard.some((f: Any) => /สูง/.test(f.display)), "2 ฟิลด์", JSON.stringify(bvCard?.fieldsOnCard ?? null).slice(0, 160), "MAJOR");
  await fx.deleteField(ctxO, owner, f4.id);
  const left = await (prisma as Any).kanbanCustomFieldValue.count({ where: { fieldId: f4.id } });
  chk("K2.6-S3.6", "deleteField (ADMIN) → ค่าของฟิลด์นั้นหายด้วย (cascade) · activity BOARD_UPDATED", left === 0, "0", String(left));
  const eSort = await fx.reorderFields(ctxO, owner, boardId, [f2.id, f1.id]);
  const f1b = await (prisma as Any).kanbanCustomField.findUnique({ where: { id: f1.id } });
  chk("K2.6-S3.7", "reorderFields(ids) → sortOrder ใหม่ตามลำดับที่ส่ง (f2=0, f1=1) ฟิลด์ที่ไม่ส่งต่อท้าย", eSort && f1b?.sortOrder === 1, "f1=1", String(f1b?.sortOrder), "MAJOR");

  // ═══ S4 UI (static) ═══
  const back = read("src/components/kanban/CardBack.tsx") + read("src/components/kanban/CustomFields.tsx");
  chk("K2.6-S4.1", "หลังการ์ด: บล็อก 'ฟิลด์กำหนดเอง' testid custom-fields แก้ค่าในที่ทุกชนิด (NUMBER=input numeric · DATE=ThaiDatePicker · CHECKBOX · SELECT · TEXT) → setCardFieldValueAction · ไม่ใช่ 'เร็ว ๆ นี้' อีก", /custom-fields/.test(back) && /setCardFieldValueAction/.test(back) && /ThaiDatePicker/.test(back) && !/ฟิลด์กำหนดเอง[^<]*เร็ว ๆ นี้/.test(back), "ครบ", "ขาด");
  const cardUi = read("src/components/kanban/Card.tsx");
  chk("K2.6-S4.2", "การ์ดบนบอร์ดแสดง fieldsOnCard เป็นชิปเล็ก (testid card-field)", /fieldsOnCard/.test(cardUi) && /card-field/.test(cardUi), "มี", "ไม่มี", "MAJOR");
  const settings = read("src/components/kanban/settings/CustomFieldsSettings.tsx") + read("src/app/app/sys/[id]/kanban/settings/fields/page.tsx");
  chk("K2.6-S4.3", "ตั้งค่าบอร์ด › ฟิลด์กำหนดเอง (ภาพ 10): '3 / 20' + รายการชนิด/ตัวเลือก + เพิ่ม/แก้/ลบ/ลาก/สลับแสดงบนการ์ด · testid custom-fields-settings · ตาราง (K2.1) มีคอลัมน์ฟิลด์เพิ่มได้", /custom-fields-settings/.test(settings) && /\/ 20|\/20/.test(settings) && /showOnCard|แสดงหน้าการ์ด|แสดงบนการ์ด/.test(settings), "ครบ", "ขาด", "MAJOR");
  const shots = existsSync(".qc-shots/kanban/2.6") ? readdirSync(".qc-shots/kanban/2.6").filter((f) => f.endsWith(".png")) : [];
  chk("K2.6-S4.4", "ภาพจริง ≥ 3 ใบ (ตั้งค่าฟิลด์ · หลังการ์ดแก้ค่า · การ์ดบนบอร์ดมีชิป)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try { if (boardId && thanaMemberAdded) { const E2 = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8")); await (prisma as Any).kanbanBoardMember.deleteMany({ where: { boardId, userId: E2.users.staff.thana.userId } }); } } catch { /* */ }
  try { if (boardId) { await (prisma as Any).kanbanCustomFieldValue.deleteMany({ where: { field: { boardId } } }); await (prisma as Any).kanbanCustomField.deleteMany({ where: { boardId } }); await (prisma as Any).kanbanActivity.deleteMany({ where: { boardId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }); } } catch { /* */ }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.6 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
