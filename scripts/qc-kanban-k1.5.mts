// QC — บอร์ดงาน WO K1.5: ลากวางเดสก์ท็อป + หน้าบอร์ดใหม่ (ส่วน static + action) — ส่วน "เห็นภาพ/ลากจริง" อยู่ที่ scripts/visual-kanban.mts 1.5
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.5 + พิมพ์เขียว v2 §3.2/§13
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const DIR = "src/components/kanban";
if (!existsSync(`${DIR}/BoardView.tsx`)) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/components/kanban/BoardView.tsx)");
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
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));

  // ═══ S1 โครงไฟล์ + client component ═══
  const files = ["BoardView.tsx", "Column.tsx", "Card.tsx", "BoardHeader.tsx", "KanbanIcon.tsx"];
  chk("K1.5-S1.1", "มี component ครบ: BoardView · Column · Card · BoardHeader · KanbanIcon", files.every((f) => existsSync(`${DIR}/${f}`)), files.join(","), files.filter((f) => !existsSync(`${DIR}/${f}`)).join(",") || "ครบ");
  const bv = read(`${DIR}/BoardView.tsx`);
  chk("K1.5-S1.2", "BoardView เป็น client component (\"use client\") และไม่ import prisma/db", /^"use client";?/m.test(bv) && !/@\/lib\/core\/db|@prisma\/client/.test(bv), "client · ไม่แตะ db", "ผิด");
  const all = files.map((f) => read(`${DIR}/${f}`)).join("\n");
  chk("K1.5-S1.3", "ลากด้วย pointer events (onPointerDown/Move/Up หรือ setPointerCapture) — ไม่ใช้ HTML5 draggable (มือถือไม่รองรับ)", /onPointerDown|setPointerCapture/.test(all) && !/draggable=\{?true|onDragStart=/.test(all), "pointer events", "HTML5 DnD/ไม่มี");
  const testids = ["board-header", "column", "card", "drop-indicator", "add-card"];
  chk("K1.5-S1.4", "data-testid ครบ: board-header · column · card · drop-indicator · add-card (harness ภาพ/ลากใช้)", testids.every((t) => all.includes(`data-testid="${t}"`) || all.includes(`data-testid={\`${t}`) || all.includes(`"${t}"`)), testids.join(","), testids.filter((t) => !all.includes(`"${t}"`)).join(",") || "ครบ");
  chk("K1.5-S1.5", "optimistic UI: มี useOptimistic หรือ state ชั่วคราว + rollback (คำว่า rollback/revert/คืนค่า) เมื่อ action ปฏิเสธ", /useOptimistic|useState/.test(bv) && /rollback|revert|คืน/i.test(bv), "optimistic+rollback", "ไม่พบ", "MAJOR");
  chk("K1.5-S1.6", "toast/ข้อความแจ้งเมื่อปฏิเสธ (WIP เต็ม/ถูกเก็บ) เป็นภาษาไทย และไม่โทษผู้ใช้", /toast|Toast|แจ้ง/.test(bv) && /[ก-๙]/.test(bv) && !/คุณทำผิด|ผิดพลาดของคุณ/.test(bv), "toast ไทย", "ไม่พบ", "MAJOR");

  // ═══ S2 หน้า/route ═══
  const pagePath = "src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx";
  chk("K1.5-S2.1", "มีหน้า /app/sys/[id]/kanban/b/[boardId]/page.tsx", existsSync(pagePath), "มี", "ไม่มี");
  const page = read(pagePath);
  chk("K1.5-S2.2", "หน้าบอร์ดใช้ getBoardFor (ผ่านสิทธิ์ 2 ชั้น) และ notFound() เมื่อมองไม่เห็น", /getBoardFor/.test(page) && /notFound\(\)/.test(page), "getBoardFor+notFound", "ไม่พบ");
  const oldPage = read("src/app/app/sys/[id]/kanban/[boardId]/page.tsx");
  chk("K1.5-S2.3", "หน้าเดิม /kanban/[boardId] redirect ไป /kanban/b/[boardId] (ลิงก์เก่าไม่ตาย)", /redirect\(/.test(oldPage) && /kanban\/b\//.test(oldPage), "redirect", "ไม่มี", "MAJOR");
  const layout = read("src/app/app/layout.tsx");
  chk("K1.5-S2.4", "layout: หน้าบอร์ดยุบเมนูซ้ายเป็นรางไอคอน (มีคำว่า rail/ราง หรือ prop ที่ผูกกับ /kanban/b/)", /rail|ราง/i.test(layout + all) && /kanban\/b\//.test(layout + all), "รางไอคอน", "ไม่พบ", "MAJOR");

  // ═══ S3 server action ═══
  const actions = read("src/lib/modules/kanban/actions.ts");
  chk("K1.5-S3.1", "actions.ts มี moveCardAction + moveColumnAction ที่เรียก moves.ts (ไม่ทำตรรกะเอง) และตรวจสิทธิ์ EDITOR", /export async function moveCardAction/.test(actions) && /export async function moveColumnAction/.test(actions) && /from "\.\/moves"|moves\./.test(actions) && /assertBoardRole|EDITOR/.test(actions), "ครบ", "ขาด");
  chk("K1.5-S3.2", "actions.ts ไม่ export ฟังก์ชันที่ไม่ใช่ action (ทุก export ลงท้าย Action)", (actions.match(/export (async )?function (\w+)/g) ?? []).every((m) => /Action\b/.test(m)), "เฉพาะ *Action", (actions.match(/export (async )?function (\w+)/g) ?? []).filter((m) => !/Action\b/.test(m)).join(",") || "ผ่าน");

  // ═══ S4 ภาษาออกแบบ ═══
  chk("K1.5-S4.1", "ใช้โทเคนตามแบบ: พื้นเวที #f4f5f7 · คอลัมน์ #eceef1 (หรือ CSS var ที่นิยามค่านี้) · accent #1d4ed8", /f4f5f7/i.test(all + read("src/app/globals.css")) && /eceef1/i.test(all + read("src/app/globals.css")), "โทเคนตรงแบบ", "ไม่พบ", "MAJOR");
  chk("K1.5-S4.2", "คำไทยตามแบบ §5.5: 'เพิ่มการ์ด' · 'กำหนดส่ง' · 'ป้ายกำกับ' · 'เก็บเข้าคลัง' (ไม่ใช้ 'ลบ')", /เพิ่มการ์ด/.test(all) && /กำหนดส่ง/.test(all) && !/ลบการ์ด/.test(all), "คำตามแบบ", "ไม่ตรง", "MAJOR");
  chk("K1.5-S4.3", "การ์ดมีตรา: ป้าย · กำหนดส่ง (สีตามความหมาย: เลย=แดง · ใน 24 ชม.=อำพัน · เสร็จ=เขียว) · เช็คลิสต์ n/m · ไฟล์ · ความเห็น · รูปคน", /dueAt|กำหนดส่ง/.test(read(`${DIR}/Card.tsx`)) && /amber|red|green/i.test(read(`${DIR}/Card.tsx`)) && /avatar|initial|รูปคน|Avatar/i.test(read(`${DIR}/Card.tsx`)), "ตราครบ", "ขาด", "MAJOR");
  chk("K1.5-S4.4", "ไอคอนเป็น SVG sprite (KanbanIcon) ไม่ใช่อีโมจิในหน้าบอร์ด", /<svg|<symbol|ICONS/.test(read(`${DIR}/KanbanIcon.tsx`)) && !/[\u{1F300}-\u{1FAFF}]/u.test(bv + read(`${DIR}/Column.tsx`) + read(`${DIR}/Card.tsx`)), "SVG", "อีโมจิ/ไม่มี", "MAJOR");

  // ═══ S5 ข้อมูลที่หน้าโหลดต้องผ่าน getBoardFor (เช็ค service ตรง) ═══
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const m = (await prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: E.users.owner.userId } }))!;
  const actor = { userId: E.users.owner.userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> };
  const b = await svc.getBoardFor({ tenantId: scope.tenantId, systemId: scope.systemId, actorUserId: actor.userId }, actor, E.boards.patong.id);
  chk("K1.5-S5.1", "getBoardFor คืนบอร์ดป่าตอง 5 คอลัมน์ 24 การ์ด + role ADMIN + การ์ดมี cardNo/position/labels/assignees", b?.columns?.length === 5 && b.columns.reduce((n: number, c: Any) => n + c.cards.length, 0) === 24 && b.role === "ADMIN" && b.columns[0].cards.every((c: Any) => typeof c.cardNo === "number" && typeof c.position === "string"), "5/24/ADMIN", `${b?.columns?.length}/${b?.columns?.reduce((n: number, c: Any) => n + c.cards.length, 0)}/${b?.role}`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.5 (static+action) — ส่วนภาพ/ลากจริง: pnpm exec tsx scripts/visual-kanban.mts 1.5 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
