// ops/watch.ts — op ของ "ติดตามการ์ด" (K2.11 · เปิดผ่าน REST ใน K2.12)
//
// 🔴 มีแค่เป้าหมาย CARD ผ่าน REST วันนี้ (COLUMN/BOARD ยังเป็นของหน้าจอเท่านั้น — ไม่มีในสัญญา K2.12)
//    `watch.ts#requireTargetBoard` ตรวจ VIEWER ของบอร์ดที่การ์ดสังกัดเองแล้ว (มองไม่เห็น = 404) ⇒
//    ไม่ต้อง `assertCardRole` ซ้ำที่นี่ · ซ้ำ/เลิกติดตามซ้ำ = เงียบ (idempotent ตามสัญญา K2.11)

import { watch, unwatch } from "../../watch";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const cardsWatch = defineKanbanOp({
  id: "cards.watch",
  method: "PUT",
  path: "/cards/{id}/watch",
  kind: "write",
  action: "kanban.board.read",
  summary: "Start watching a card: get notified of its activity even when not assigned to it. Watching again is a no-op.",
  label: "ติดตามการ์ด",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    await watch(ctx, kanbanActorOf(actor), { targetType: "CARD", targetId: params.id! });
    return { ok: true, cardId: params.id!, watching: true };
  },
});

const cardsUnwatch = defineKanbanOp({
  id: "cards.unwatch",
  method: "DELETE",
  path: "/cards/{id}/watch",
  kind: "write",
  action: "kanban.board.read",
  summary: "Stop watching a card. Unwatching a card that was not watched is a no-op.",
  label: "เลิกติดตามการ์ด",
  test: "K2.12-S3.1",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    await unwatch(ctx, kanbanActorOf(actor), { targetType: "CARD", targetId: params.id! });
    return { ok: true, cardId: params.id!, watching: false };
  },
});

export const WATCH_OPS: ApiOp[] = [cardsWatch, cardsUnwatch];
