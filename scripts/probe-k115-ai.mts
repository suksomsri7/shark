// probe (builder) — เส้นทาง AI ของสกิล `tasks` หลัง K1.15: tool ลงทะเบียนครบ · read ทำงานจริง · write = ข้อเสนอ
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: { expectedPath: string }; resolveKanbanScope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null> };
const { readFileSync } = await import("node:fs");
const tools = await import("@/lib/ai/tools");
const skills = await import("@/lib/ai/skills");
const kb = await import("@/lib/ai/kanban-ops");

const scope = await kq.resolveKanbanScope(prisma);
if (!scope) throw new Error("ยังไม่ได้ seed");
const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8")) as { boards: { patong: { id: string } } };
const names = tools.toolRegistry().map((t) => t.def.name).filter((n) => n.startsWith("kanban_"));
console.log("tool ที่ลงทะเบียนจริง:", names.length, names.join(","));
console.log("ซ้ำไหม:", names.length === new Set(names).size ? "ไม่ซ้ำ ✅" : "ซ้ำ ❌");
skills.assertSkillRegistryComplete();
console.log("assertSkillRegistryComplete ✅");

const read = await kb.runKanbanTool(scope.tenantId, "kanban_list_boards", {}, { systemId: scope.systemId });
console.log("kanban_list_boards →", read.mode, read.mode === "read" ? `${JSON.stringify(read.result).slice(0, 90)}…` : JSON.stringify(read));
const summary = await kb.runKanbanTool(scope.tenantId, "kanban_board_summary", { boardId: E.boards.patong.id }, { systemId: scope.systemId });
console.log("kanban_board_summary →", summary.mode, summary.mode === "read" ? JSON.stringify(summary.result).slice(0, 140) : JSON.stringify(summary));
const mine = await kb.runKanbanTool(scope.tenantId, "kanban_my_tasks", { assignee: "ธนา" }, { systemId: scope.systemId });
console.log("kanban_my_tasks(ธนา) →", mine.mode, mine.mode === "read" ? JSON.stringify(mine.result).slice(0, 120) : JSON.stringify(mine));
const write = await kb.runKanbanTool(scope.tenantId, "kanban_create_card", { boardId: E.boards.patong.id, columnId: "x", title: "จาก AI" }, { systemId: scope.systemId });
console.log("kanban_create_card →", write.mode, write.mode === "propose" ? `${write.kind} · ${write.summary}` : JSON.stringify(write));
const danger = await kb.runKanbanTool(scope.tenantId, "kanban_archive_card", { cardId: "x", reason: "ทดสอบ" }, { systemId: scope.systemId });
console.log("kanban_archive_card →", danger.mode, danger.mode === "propose" ? `${danger.kind}` : JSON.stringify(danger));
console.log("kind ที่ต้องยืนยัน 2 ชั้น:", kb.kanbanDestructiveKinds().join(","));
await prisma.$disconnect();
