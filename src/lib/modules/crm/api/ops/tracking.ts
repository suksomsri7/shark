// ops/tracking.ts — op ของลิงก์ติดตาม (ใบ C2.11 · CRM-API "Tracking")
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `tracking.ts` ของใบ C2.6 (รหัสลิงก์ · ตัวนับคลิก/คลิกไม่ซ้ำ · ตั๋วระบุตัวตน)
// 🔴 AUDIT-CLASS X6: ที่อยู่ปลายทางของลิงก์รับเฉพาะ http/https (`httpUrl`) — `javascript:` / `data:` ถูกปฏิเสธก่อนถึงบริการ
//    (ลิงก์ของร้านถูกส่งต่อให้ลูกค้าคลิก ⇒ ลิงก์ที่รันสคริปต์ได้คือช่องยิงสคริปต์ในนามร้าน)
// 🔴 AUDIT-CLASS X8: สถิติคืนเป็น "ตัวเลขต่อวัน" เท่านั้น — ไม่มี IP ดิบ ไม่มี user-agent ไม่มีตัวระบุผู้เข้าชม

import { z } from "zod";
import * as tracking from "../../tracking";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, httpUrl, optText, pageCursor, pageOfCursor, take } from "../schema";

const list = defineCrmOp({
  id: "tracking.links.list",
  method: "GET",
  path: "/tracking/links",
  kind: "read",
  action: "crm.tracking.manage",
  summary: "The shop's tracked short links (newest first): code, destination, name, channel, whether it is on, total clicks and unique clicks.",
  label: "รายการลิงก์ติดตาม",
  input: z.object({ take, cursor }).strict(),
  rate: "read",
  test: "C2.11-S2.11",
  async handler({ actor, input }) {
    const rows = await tracking.listLinks(crmCtxOf(actor), crmActorOf(actor));
    const page = pageOfCursor(input.cursor);
    const size = input.take ?? 50;
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, nextCursor: page * size < rows.length ? pageCursor(page + 1) : null };
  },
});

const create = defineCrmOp({
  id: "tracking.links.create",
  method: "POST",
  path: "/tracking/links",
  kind: "write",
  action: "crm.tracking.manage",
  summary:
    "Make a tracked short link to an http or https address. A code of 6-32 letters, digits, - and _ can be asked for; otherwise one is generated. " +
    "Clicks are counted per link and, when the visitor is known, land on the contact's timeline.",
  label: "สร้างลิงก์ติดตาม",
  input: z.object({ url: httpUrl, name: optText(120), label: optText(120), channel: optText(40), code: optText(32) }).strict(),
  test: "C2.11-S2.11",
  async handler({ actor, input }) {
    // ชื่อของลิงก์: `name` (ชื่อในบริการ) หรือ `label` (ชื่อที่หน้าจอ/คู่มือเรียก) — ช่องเดียวกัน
    const link = await tracking.createLink(crmCtxOf(actor), crmActorOf(actor), {
      url: input.url,
      name: input.name ?? input.label ?? null,
      channel: input.channel ?? null,
      code: input.code ?? null,
    });
    return { linkId: link.id, ...link };
  },
});

const stats = defineCrmOp({
  id: "tracking.links.stats",
  method: "GET",
  path: "/tracking/links/{id}/stats",
  kind: "read",
  action: "crm.tracking.manage",
  summary: "Clicks of one tracked link: the totals and the clicks per day (Thai calendar day) over the last `days` days (1-365, 30 by default).",
  label: "สถิติลิงก์ติดตาม",
  input: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }).strict(),
  rate: "report",
  test: "C2.11-S2.11",
  async handler({ actor, params, input }) {
    const r = await tracking.linkStats(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { days: input.days ?? 30 });
    return { linkId: params.id ?? "", ...r };
  },
});

export const TRACKING_OPS: ApiOp[] = [list, create, stats];
