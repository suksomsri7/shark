// ─────────────────────────────────────────────────────────────
// defs/messaging.ts — ค่าตั้งการส่งข้อความบริการหาลูกค้า (pure) · CC §4.4 · ใบสั่ง R0.3 §7.2
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { SettingDef } from "../types";

const EDIT = "settings.messaging.edit";
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const DEFS: SettingDef[] = [
  {
    key: "messaging.channelOrder", domain: "messaging", group: "channel", type: "table", labelTh: "ลำดับช่องทางส่งข้อความ",
    schema: z
      .array(z.enum(["LINE", "SMS", "WEB_LINK"]))
      .min(1)
      .refine((a) => new Set(a).size === a.length, { message: "ช่องทางซ้ำ" }),
    defaults: { _fallback: ["LINE", "WEB_LINK"] },
    chain: ["TENANT", "UNIT"], editPermission: EDIT,
  },
  {
    key: "messaging.lineConnectionId", domain: "messaging", group: "channel", type: "text", labelTh: "LINE OA ที่ใช้ส่งของสาขานี้",
    schema: z.string().min(1).max(64).nullable(),
    defaults: { _fallback: null },
    chain: ["UNIT"], editPermission: EDIT,
  },
  {
    key: "messaging.quietHours", domain: "messaging", group: "quiet", type: "table", labelTh: "ช่วงเวลางดส่งข้อความ",
    schema: z.object({ start: HHMM, end: HHMM }).nullable(),
    defaults: { _fallback: { start: "21:00", end: "08:00" } },
    chain: ["TENANT", "UNIT"], editPermission: EDIT,
  },
];

defineSettings("messaging", DEFS, { groupLabelsTh: { channel: "ช่องทางส่งข้อความ", quiet: "เวลางดส่งข้อความ" } });
