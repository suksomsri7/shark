// Fable probe K1.8: mention ข้ามร้าน · body ยาวเกิน · XSS ใน body · แจ้งเตือนซ้ำเมื่อ mention คนเดิม 2 ครั้งในความเห็นเดียว
import { prisma } from "@/lib/core/db";
import { readFileSync } from "node:fs";
const kq = (await import("../kanban-qc-env.mts" as string)) as { KQC: any; resolveKanbanScope: (p: any) => Promise<any> };
const { addComment, listComments } = await import("@/lib/modules/kanban/comments");
const scope = await kq.resolveKanbanScope(prisma); const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
const ctx = { tenantId: scope.tenantId, systemId: scope.systemId, actorUserId: E.users.owner.userId, role: "OWNER", permissions: new Set<string>() } as any;
const card = await prisma.kanbanCard.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" } });
const other = await prisma.user.findFirst({ where: { memberships: { none: { tenantId: scope.tenantId } } }, select: { id: true, name: true } });
const thana = E.users.staff.thana.userId;
const n0 = await prisma.appNotification.count({ where: { recipientUserId: thana } });
const ids: string[] = [];
// 1 ข้ามร้าน
const c1 = await addComment(ctx, card!.id, `ทดสอบ @[คนนอก](${other?.id ?? "nope"}) และ @[ธนา](${thana}) กับ @[ธนาอีก](${thana})`); ids.push(c1.id);
console.log("1 mentions (ต้องมีแค่ธนา 1):", JSON.stringify(c1.mentions));
const n1 = await prisma.appNotification.count({ where: { recipientUserId: thana } });
console.log("2 แจ้งเตือนธนาเพิ่ม (ต้อง 1):", n1 - n0);
const nOther = other ? await prisma.appNotification.count({ where: { recipientUserId: other.id, createdAt: { gt: new Date(Date.now() - 60000) } } }) : 0;
console.log("3 แจ้งเตือนคนนอก (ต้อง 0):", nOther);
// 4 XSS/HTML เก็บเป็น text ดิบ (UI render เป็น text)
const c2 = await addComment(ctx, card!.id, `<img src=x onerror=alert(1)> @[ธนา](${thana})`); ids.push(c2.id);
const l = await listComments(ctx, card!.id); const dto = l.find((x: any) => x.id === c2.id) as any;
console.log("4 body dto:", JSON.stringify(dto?.body).slice(0, 80), "| author:", dto?.author?.name);
// 5 ยาวเกิน
try { await addComment(ctx, card!.id, "ก".repeat(20001)); console.log("5 ยาว 20001: ผ่าน (ไม่มี limit?)"); } catch (e) { console.log("5 ยาว 20001: throw →", (e as Error).message.slice(0, 60)); }
// 6 whitespace-only
try { await addComment(ctx, card!.id, "   \n "); console.log("6 ว่าง: ผ่าน ❌"); } catch (e) { console.log("6 ว่าง: throw →", (e as Error).message.slice(0, 60)); }
// cleanup
await prisma.kanbanComment.deleteMany({ where: { id: { in: ids } } });
await prisma.appNotification.deleteMany({ where: { recipientUserId: thana, createdAt: { gt: new Date(Date.now() - 120000) } } });
await prisma.outboxEvent.deleteMany({ where: { tenantId: scope.tenantId, type: "kanban.comment.added", createdAt: { gt: new Date(Date.now() - 120000) } } });
await prisma.$disconnect();
