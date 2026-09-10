// ops/core.ts — op พื้นฐานของ API ระบบสมาชิก (M1.11)
//
// `GET /ping` เก็บไว้ถาวรเป็น smoke test: ผู้เชื่อมต่อที่เพิ่งได้คีย์ยิงตัวนี้ก่อนเสมอ
// เพื่อแยกว่า "คีย์/ระบบ/สิทธิ์ผิด" (ปัญหาของเขา) ออกจาก "ข้อมูลสมาชิกผิด" (ปัญหาของเรา)

import { CHANNELS } from "@/lib/core/channels";
import { defineMemberOp, type ApiOp } from "../op";
import { memberApiRoleForScopes } from "../actor";
import { channelsWithStatus } from "../../channels-status";

const ping = defineMemberOp({
  id: "ping",
  method: "GET",
  path: "/ping",
  kind: "read",
  action: "member.customer.read",
  summary: "Check that the API key works, and see which member system and permission bundle it is bound to.",
  label: "ทดสอบการเชื่อมต่อ",
  test: "M1.11-S2.1",
  async handler({ actor }) {
    return {
      ok: true,
      systemId: actor.systemId,
      keyName: actor.keyName,
      // ชุดสิทธิ์ของคีย์ (§6.3) — บอกตั้งแต่ ping เพื่อให้ผู้เชื่อมต่อรู้ทันทีว่าเขียนได้ไหม
      // และ **เห็นข้อมูลอ่อนไหวไหม** (readonly/operate = ไม่เห็นเสมอ)
      apiRole: memberApiRoleForScopes(actor.scopes),
      scopes: actor.scopes,
    };
  },
});

const channelsList = defineMemberOp({
  id: "channels.list",
  method: "GET",
  path: "/channels",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The shop's channel registry: every channel that can carry an identity, a consent or an attribution, with whether the shop has actually connected it.",
  label: "ทะเบียนช่องทาง",
  tool: { name: "member_channels", hint: "Use this before writing a consent or an identity, to learn the channel keys this shop accepts." },
  test: "M1.11-S2.7",
  async handler({ actor }) {
    const items = await channelsWithStatus(actor.tenantId);
    return { items, total: CHANNELS.length };
  },
});

export const CORE_OPS: ApiOp[] = [ping, channelsList];
