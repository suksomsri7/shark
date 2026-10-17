// board-settings.ts — ตัวเขียนค่าตั้ง "บอร์ดงาน + ห้องทีม" ของ POS (POS P3.8 ▸ R2 มติ 2 · CD-2 CD-4 ◂)
//
// ทางเขียนเดียวกับ settings-general.ts: สิทธิ์ (เจ้าของร้านเท่านั้น) → ตรวจแพตช์ทั้งก้อน → สาขาต้องผูก POS นี้ →
//   ตัวตรวจ id จากผู้เรียก (บอร์ด/ห้อง — composition root `pos-board-bridges.ts` ฉีดมา เพราะโมดูล POS ไม่รู้จักบอร์ดงาน/แชททีม) →
//   ธุรกรรม + ล็อกแถว FOR UPDATE → jsonb_set เฉพาะ settings.pos.board / settings.pos.teamRoom (คีย์อื่นไม่ถูกแตะ) → AuditLog pos.settings.updated
// 🔴 คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message(ไทย), field?} — ไม่โยน
// 🔴 ค่านอกช่วง/คีย์แปลก = VALIDATION (ไม่ตัดขอบเงียบ) · ช่วงเดียวกับตัวอ่าน posBoardSettings/posTeamRoomSettings (กฎไป-กลับ)
// 🔴 CD-4: teamRoom.enabledByUserId = ผู้บันทึก (เจ้าของร้าน) เสมอ — ค่าที่ client ส่งมาถูกเมิน
// 🔴 แพตช์ที่ไม่เปลี่ยนอะไร = ok · ไม่เขียน · ไม่มี audit

import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "./db";
import {
  isBoardSettingsId,
  POS_BOARD_LIMITS,
  POS_BOARD_SOLD_OUT_SOURCES,
  posBoardSettings,
  posRoomRef,
  posTeamRoomSettings,
  type PosBoardSettings,
  type PosTeamRoomSettings,
} from "./board-settings-shared";
import { ctxOk, POS_SETTINGS_AUDIT, posLinkedUnitIds, settingsMembership, settingsRefuse, type PosSettingsWriterActor } from "./settings-general";
import type { PosSettingsRefusal } from "./settings-shared";

type Ctx = { tenantId: string; systemId: string };
export type PosBoardSettingsPatch = { board?: unknown; teamRoom?: unknown };
export type PosBoardSettingsResult = { ok: true; board: PosBoardSettings; teamRoom: PosTeamRoomSettings } | PosSettingsRefusal;
/** ตัวตรวจ id จากภายนอก (บอร์ดของร้านนี้ที่ใช้งานอยู่ · ห้องที่เจ้าของเลือกได้) — คืน null = ผ่าน · ข้อความ = ปฏิเสธ (field) */
export type PosBoardIdVerifier = (next: { board: PosBoardSettings | null; teamRoom: PosTeamRoomSettings | null }) => Promise<{ field: string; message: string } | null>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown, lim: { min: number; max: number }) => typeof v === "number" && Number.isInteger(v) && v >= lim.min && v <= lim.max;
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
type Bad = { field: string; message: string };
const bad = (field: string, message: string): Bad => ({ field, message });
function keysOnly(o: Record<string, unknown>, allowed: readonly string[], at: string): Bad | null {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return bad(at ? `${at}.${k}` : k, `ไม่รู้จักคีย์ ${k}`);
  return null;
}
const boolAt = (o: Record<string, unknown>, k: string, at: string): Bad | null => (k in o && typeof o[k] !== "boolean" ? bad(`${at}.${k}`, `${k} ต้องเป็นจริง/เท็จ`) : null);

/** ตรวจรูปแพตช์ board (ทุกคีย์ไม่บังคับ — ที่ไม่ส่ง = ค่าเดิม) */
function checkBoard(v: unknown): Bad | null {
  if (!isRecord(v)) return bad("board", "board ต้องเป็นออบเจกต์");
  const k = keysOnly(v, ["enabled", "defaultBoardId", "boardByUnit", "assignManager", "rules"], "board");
  if (k) return k;
  for (const b of ["enabled", "assignManager"]) {
    const e = boolAt(v, b, "board");
    if (e) return e;
  }
  if ("defaultBoardId" in v && v.defaultBoardId !== null && !isBoardSettingsId(v.defaultBoardId)) return bad("board.defaultBoardId", "รหัสบอร์ดไม่ถูกต้อง");
  if ("boardByUnit" in v) {
    if (!isRecord(v.boardByUnit)) return bad("board.boardByUnit", "boardByUnit ต้องเป็นออบเจกต์");
    const entries = Object.entries(v.boardByUnit);
    if (entries.length > POS_BOARD_LIMITS.unitEntries) return bad("board.boardByUnit", `ผูกบอร์ดรายสาขาได้ไม่เกิน ${POS_BOARD_LIMITS.unitEntries} สาขา`);
    for (const [u, b] of entries) if (!isBoardSettingsId(u) || !isBoardSettingsId(b)) return bad(`board.boardByUnit.${u}`, "รหัสสาขา/บอร์ดไม่ถูกต้อง");
  }
  if ("rules" in v) {
    const r = v.rules;
    if (!isRecord(r)) return bad("board.rules", "rules ต้องเป็นออบเจกต์");
    const rk = keysOnly(r, ["shiftDiff", "soldOut", "refundNeeded"], "board.rules");
    if (rk) return rk;
    if ("shiftDiff" in r) {
      const s = r.shiftDiff;
      if (!isRecord(s)) return bad("board.rules.shiftDiff", "shiftDiff ต้องเป็นออบเจกต์");
      const sk = keysOnly(s, ["enabled", "minAbsSatang", "everyClose", "forcedClose"], "board.rules.shiftDiff");
      if (sk) return sk;
      for (const b of ["enabled", "everyClose", "forcedClose"]) {
        const e = boolAt(s, b, "board.rules.shiftDiff");
        if (e) return e;
      }
      if ("minAbsSatang" in s && !isInt(s.minAbsSatang, POS_BOARD_LIMITS.minAbsSatang)) return bad("board.rules.shiftDiff.minAbsSatang", `เกณฑ์ขาด/เกินต้องเป็นจำนวนเต็ม ${POS_BOARD_LIMITS.minAbsSatang.min}–${POS_BOARD_LIMITS.minAbsSatang.max} สตางค์`);
    }
    if ("soldOut" in r) {
      const s = r.soldOut;
      if (!isRecord(s)) return bad("board.rules.soldOut", "soldOut ต้องเป็นออบเจกต์");
      const sk = keysOnly(s, ["enabled", "hours", "sources"], "board.rules.soldOut");
      if (sk) return sk;
      const e = boolAt(s, "enabled", "board.rules.soldOut");
      if (e) return e;
      if ("hours" in s && !isInt(s.hours, POS_BOARD_LIMITS.hours)) return bad("board.rules.soldOut.hours", `จำนวนชั่วโมงต้องเป็นจำนวนเต็ม ${POS_BOARD_LIMITS.hours.min}–${POS_BOARD_LIMITS.hours.max}`);
      if ("sources" in s && (!Array.isArray(s.sources) || s.sources.length === 0 || !s.sources.every((x) => (POS_BOARD_SOLD_OUT_SOURCES as readonly unknown[]).includes(x))))
        return bad("board.rules.soldOut.sources", "แหล่งของหมดต้องเป็น MANUAL/KDS/STOCK อย่างน้อยหนึ่ง");
    }
    if ("refundNeeded" in r) {
      const s = r.refundNeeded;
      if (!isRecord(s)) return bad("board.rules.refundNeeded", "refundNeeded ต้องเป็นออบเจกต์");
      const sk = keysOnly(s, ["enabled"], "board.rules.refundNeeded");
      if (sk) return sk;
      const e = boolAt(s, "enabled", "board.rules.refundNeeded");
      if (e) return e;
    }
  }
  return null;
}

/** ตรวจรูปแพตช์ teamRoom (enabledByUserId รับไว้แต่ไม่ใช้ — CD-4) */
function checkRoom(v: unknown): Bad | null {
  if (!isRecord(v)) return bad("teamRoom", "teamRoom ต้องเป็นออบเจกต์");
  const k = keysOnly(v, ["enabled", "defaultRoom", "roomByUnit", "posts", "briefHourBkk", "enabledByUserId"], "teamRoom");
  if (k) return k;
  const e = boolAt(v, "enabled", "teamRoom");
  if (e) return e;
  const refOk = (x: unknown) => isRecord(x) && Object.keys(x).every((kk) => kk === "meetingSystemId" || kk === "channelId") && posRoomRef(x) !== null;
  if ("defaultRoom" in v && v.defaultRoom !== null && !refOk(v.defaultRoom)) return bad("teamRoom.defaultRoom", "ห้องต้องเป็น {meetingSystemId, channelId}");
  if ("roomByUnit" in v) {
    if (!isRecord(v.roomByUnit)) return bad("teamRoom.roomByUnit", "roomByUnit ต้องเป็นออบเจกต์");
    const entries = Object.entries(v.roomByUnit);
    if (entries.length > POS_BOARD_LIMITS.unitEntries) return bad("teamRoom.roomByUnit", `ผูกห้องรายสาขาได้ไม่เกิน ${POS_BOARD_LIMITS.unitEntries} สาขา`);
    for (const [u, r] of entries) if (!isBoardSettingsId(u) || !refOk(r)) return bad(`teamRoom.roomByUnit.${u}`, "รหัสสาขา/ห้องไม่ถูกต้อง");
  }
  if ("posts" in v) {
    const p = v.posts;
    if (!isRecord(p)) return bad("teamRoom.posts", "posts ต้องเป็นออบเจกต์");
    const pk = keysOnly(p, ["shiftClose", "showOverShort", "dailyBrief"], "teamRoom.posts");
    if (pk) return pk;
    for (const b of ["shiftClose", "showOverShort", "dailyBrief"]) {
      const pe = boolAt(p, b, "teamRoom.posts");
      if (pe) return pe;
    }
  }
  if ("briefHourBkk" in v && !isInt(v.briefHourBkk, POS_BOARD_LIMITS.briefHourBkk)) return bad("teamRoom.briefHourBkk", "เวลาสรุปเช้าต้องเป็นชั่วโมง 0–23");
  return null;
}

/** รวมแพตช์ลงค่าเดิม (ระดับคีย์บนสุด · rules/posts รวมทีละกฎ) แล้วผ่านตัวอ่านอีกรอบ */
function mergeBoard(cur: PosBoardSettings, patch: Record<string, unknown>): PosBoardSettings {
  const rules = isRecord(patch.rules) ? patch.rules : {};
  const next = {
    ...cur,
    ...patch,
    rules: {
      shiftDiff: { ...cur.rules.shiftDiff, ...(isRecord(rules.shiftDiff) ? rules.shiftDiff : {}) },
      soldOut: { ...cur.rules.soldOut, ...(isRecord(rules.soldOut) ? rules.soldOut : {}) },
      refundNeeded: { ...cur.rules.refundNeeded, ...(isRecord(rules.refundNeeded) ? rules.refundNeeded : {}) },
    },
  };
  return posBoardSettings({ pos: { board: next } });
}
function mergeRoom(cur: PosTeamRoomSettings, patch: Record<string, unknown>, ownerUserId: string): PosTeamRoomSettings {
  const next = { ...cur, ...patch, posts: { ...cur.posts, ...(isRecord(patch.posts) ? patch.posts : {}) }, enabledByUserId: ownerUserId };
  return posTeamRoomSettings({ pos: { teamRoom: next } });
}

async function lockPos(tx: Prisma.TransactionClient, ctx: Ctx): Promise<boolean> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
  return locked.length > 0;
}
/** รวมคีย์ใต้ settings.pos ในคำสั่งเดียว (jsonb_set + ||) — คีย์อื่นของ settings/pos ไม่ถูกแตะ */
async function mergePosKeys(tx: Prisma.TransactionClient, ctx: Ctx, keys: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(keys);
  await tx.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{pos}',
      (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END) || ${json}::jsonb,
      true),
      "updatedAt" = now()
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
}
/** ภาพของค่าตั้งใน audit — id ล้วน ไม่มีชื่อ */
const auditView = (b: PosBoardSettings, r: PosTeamRoomSettings) => ({
  section: "board",
  board: { enabled: b.enabled, defaultBoardId: b.defaultBoardId, units: Object.keys(b.boardByUnit).length, assignManager: b.assignManager, rules: b.rules },
  teamRoom: { enabled: r.enabled, defaultChannelId: r.defaultRoom?.channelId ?? null, units: Object.keys(r.roomByUnit).length, posts: r.posts, briefHourBkk: r.briefHourBkk },
});

/**
 * R2 — บันทึกค่าตั้งบอร์ดงาน/ห้องทีม (เจ้าของร้านเท่านั้น · มติ 2) · `verify` = ตัวตรวจ id บอร์ด/ห้องของผู้เรียก (root) — ไม่ส่ง = ไม่ตรวจ id ภายนอก
 */
export async function updatePosBoardSettings(ctx: Ctx, actor: PosSettingsWriterActor, input: unknown, verify?: PosBoardIdVerifier): Promise<PosBoardSettingsResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m || m.role !== "OWNER") return settingsRefuse("PERMISSION_DENIED", "ค่าตั้งบอร์ดงาน/ห้องทีม เจ้าของร้านเท่านั้นที่แก้ได้");
    if (!isRecord(input)) return settingsRefuse("VALIDATION", "ค่าที่ส่งมาต้องเป็นออบเจกต์");
    const top = keysOnly(input, ["board", "teamRoom"], "");
    if (top) return settingsRefuse("VALIDATION", top.message, top.field);
    if (!("board" in input) && !("teamRoom" in input)) return settingsRefuse("VALIDATION", "ต้องส่ง board หรือ teamRoom");
    const e1 = "board" in input ? checkBoard(input.board) : null;
    if (e1) return settingsRefuse("VALIDATION", e1.message, e1.field);
    const e2 = "teamRoom" in input ? checkRoom(input.teamRoom) : null;
    if (e2) return settingsRefuse("VALIDATION", e2.message, e2.field);

    const sys0 = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { settings: true } });
    if (!sys0) return settingsRefuse("NOT_FOUND");
    const nextBoard0 = "board" in input ? mergeBoard(posBoardSettings(sys0.settings), input.board as Record<string, unknown>) : null;
    const nextRoom0 = "teamRoom" in input ? mergeRoom(posTeamRoomSettings(sys0.settings), input.teamRoom as Record<string, unknown>, m.userId) : null;
    // สาขาในแผนที่ต้องเป็นสาขาที่ผูก POS นี้ (สาขาร้านอื่น/ไม่ผูก = VALIDATION)
    const linked = new Set(await posLinkedUnitIds(prisma, ctx));
    for (const u of Object.keys(nextBoard0?.boardByUnit ?? {})) if (!linked.has(u)) return settingsRefuse("VALIDATION", "สาขานี้ไม่ได้ผูกกับจุดขายนี้", `board.boardByUnit.${u}`);
    for (const u of Object.keys(nextRoom0?.roomByUnit ?? {})) if (!linked.has(u)) return settingsRefuse("VALIDATION", "สาขานี้ไม่ได้ผูกกับจุดขายนี้", `teamRoom.roomByUnit.${u}`);
    if (verify) {
      const v = await verify({ board: nextBoard0, teamRoom: nextRoom0 });
      if (v) return settingsRefuse("VALIDATION", v.message, v.field);
    }

    const done = await prisma.$transaction(async (tx) => {
      if (!(await lockPos(tx, ctx))) return settingsRefuse("NOT_FOUND");
      const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { settings: true } });
      if (!sys) return settingsRefuse("NOT_FOUND");
      const beforeB = posBoardSettings(sys.settings);
      const beforeR = posTeamRoomSettings(sys.settings);
      const afterB = "board" in input ? mergeBoard(beforeB, input.board as Record<string, unknown>) : beforeB;
      const afterR = "teamRoom" in input ? mergeRoom(beforeR, input.teamRoom as Record<string, unknown>, m.userId) : beforeR;
      const pos = isRecord(sys.settings) && isRecord(sys.settings.pos) ? sys.settings.pos : {};
      const keys: Record<string, unknown> = {};
      if ("board" in input && (canon(afterB) !== canon(beforeB) || !isRecord(pos.board))) keys.board = afterB;
      if ("teamRoom" in input && (canon(afterR) !== canon(beforeR) || !isRecord(pos.teamRoom))) keys.teamRoom = afterR;
      if (Object.keys(keys).length === 0) return { ok: true as const, board: afterB, teamRoom: afterR, audit: null };
      await mergePosKeys(tx, ctx, keys);
      return { ok: true as const, board: afterB, teamRoom: afterR, audit: { before: auditView(beforeB, beforeR), after: auditView(afterB, afterR) } };
    });
    if (!done.ok) return done;
    if (done.audit) await writeAudit({ tenantId: ctx.tenantId, actorId: m.userId, action: POS_SETTINGS_AUDIT, targetType: "AppSystem", targetId: ctx.systemId, before: done.audit.before, after: done.audit.after });
    return { ok: true, board: done.board, teamRoom: done.teamRoom };
  } catch (e) {
    console.error("[pos/board-settings] update", e);
    return settingsRefuse("UNKNOWN");
  }
}
