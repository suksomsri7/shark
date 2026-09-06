// ops/core.ts — op พื้นฐานของ API บอร์ดงาน (K1.15)
//
// `GET /ping` เก็บไว้ถาวรเป็น smoke test: ผู้เชื่อมต่อที่เพิ่งได้คีย์ยิงตัวนี้ก่อนเสมอ
// เพื่อแยกว่า "คีย์/ระบบ/สิทธิ์ผิด" (ปัญหาของเขา) ออกจาก "ข้อมูลบอร์ดผิด" (ปัญหาของเรา)

import { defineKanbanOp, type ApiOp } from "../op";
import { boardRoleForScopes } from "../actor";

const ping = defineKanbanOp({
  id: "ping",
  method: "GET",
  path: "/ping",
  kind: "read",
  action: "kanban.board.read",
  summary: "Check that the API key works, and see which task board system and board role it is bound to.",
  label: "ทดสอบการเชื่อมต่อ",
  test: "K1.15-S2.1",
  async handler({ actor }) {
    return {
      ok: true,
      systemId: actor.systemId,
      keyName: actor.keyName,
      // บทบาทบนทุกบอร์ดของระบบนี้ (D18) — บอกไว้ตั้งแต่ ping เพื่อให้ผู้เชื่อมต่อรู้ทันทีว่าเขียนได้ไหม
      boardRole: boardRoleForScopes(actor.scopes),
      scopes: actor.scopes,
    };
  },
});

export const CORE_OPS: ApiOp[] = [ping];
