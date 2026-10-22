"use client";

// BoardSettings.tsx — POS P3.8U แท็บ "บอร์ดงานและห้องทีม" (มติ 1 2 3 6 10 ของ P3.8 · CD-P38U-1 3 4 5 10)
//   ไม่มีภาพออกแบบของแท็บนี้ (ภาพ 10 มีแค่การ์ด KANBAN · ภาพ 17 = โครงหน้าตั้งค่า) ⇒ เลย์เอาต์อนุพันธ์จากแท็บทั่วไป (การ์ด · แถว · สวิตช์ · บันทึกต่อการ์ด) — รอเจ้าของรับทราบ
//   การ์ด 1 บอร์ดงาน: สวิตช์หลัก · บอร์ดปริยาย · บอร์ดรายสาขา · มอบให้ผู้จัดการ · กฎ ขาด/เกินปิดกะ · ของหมดนาน · ต้องคืนเงิน · ปุ่มสร้างบอร์ด "งานหน้าร้าน" (มติ 1)
//   การ์ด 2 ห้องทีม: สวิตช์หลัก · ห้องปริยาย · ห้องรายสาขา · โพสต์ปิดกะ · แสดงขาด/เกิน (W18) · สรุปเช้า (ห้องปริยายเท่านั้น · R8) + เวลา
//   การ์ด 3 การ์ดงานที่ตั้งจากที่อื่น (อ่านอย่างเดียว): K3.3 ยกเลิกบิล · คำขออนุมัติ (ลิงก์ไปตั้งค่าบอร์ดงาน) · P1.11 แจ้งปัญหาใบเสร็จ (ลิงก์แท็บใบเสร็จ)
// 🔴 แก้ในจอก่อน · บันทึกต่อการ์ดส่งเฉพาะคีย์ที่เปลี่ยน (แพตช์บางส่วน) · ผลบันทึก = ค่าตั้งเต็มของเซิร์ฟเวอร์แทนที่ของเดิม · โหลดหน้าไม่เขียนอะไร
// 🔴 คำปฏิเสธ = รหัส/field → คีย์ข้อความ board.errors.<code> ที่ช่องของ field นั้น (ไม่แสดง message ไทยของเซิร์ฟเวอร์)
// 🔴 ไม่มีชื่อคนในแท็บนี้ (มติ 10) · ตัวเลือกห้องมาถึงจอเฉพาะเจ้าของร้าน · ผู้ดูอื่นเห็นชื่อบอร์ดเฉพาะบอร์ดที่ตัวเองเปิดได้
// 🔴 ไม่มีข้อความไทยนอก t() · ปุ่ม ≥ 44px · import เฉพาะ *-actions / *-shared

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { savePosBoardSettingsAction } from "@/lib/pos-board-actions";
import { createBoardFromTemplateAction } from "@/lib/modules/kanban/actions";
import { POS_BOARD_LIMITS, POS_BOARD_SOLD_OUT_SOURCES, type PosBoardSettings, type PosRoomRef, type PosTeamRoomSettings } from "@/lib/modules/pos/board-settings-shared";
import { posSettingsHref } from "@/components/pos/settings/settings-tabs";
import { CardHead, Chip, InlineNote, SettingsCard, SwitchKnob, TabHead } from "./settings-ui";

export type BoardTabData = {
  isOwner: boolean;
  board: PosBoardSettings;
  teamRoom: PosTeamRoomSettings;
  units: { id: string; name: string }[];
  /** ชื่อบอร์ดที่ผู้ดูคนนี้เปิดได้ (id → ชื่อ) */
  boardNames: Record<string, string>;
  /** เจ้าของร้านเท่านั้น (อื่น = null) */
  boardOptions: { id: string; name: string }[] | null;
  roomOptions: { meetingSystemId: string; channelId: string; label: string }[] | null;
  /** channelId ของห้องที่ตั้งไว้ซึ่งยังใช้อยู่ (ไม่ถูกเก็บ/ลบ) */
  liveRooms: string[];
  kanbanSystemId: string | null;
  meetingSystemId: string | null;
  others: { voided: { enabled: boolean; boardId: string | null } | null; approval: { enabled: boolean; boardId: string | null } | null; issueBoardId: string | null };
  canAddSystem: boolean;
};
type Section = "board" | "room";
type Err = { section: Section | "create"; code: string; field?: string };

const ADD_SYSTEM_HREF = "/app/settings/systems";
const roomKey = (r: PosRoomRef | null | undefined) => (r ? `${r.meetingSystemId}/${r.channelId}` : "");
const roomOf = (k: string): PosRoomRef | null => {
  const i = k.indexOf("/");
  return i > 0 ? { meetingSystemId: k.slice(0, i), channelId: k.slice(i + 1) } : null;
};
const canonMap = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
const satToText = (s: number) => String(s / 100);
const intOf = (s: string): number | null => (/^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : null);

/** แพตช์บอร์ด = เฉพาะคีย์ที่ต่างจากค่าที่บันทึก (ซ้อนตามโครง) */
function boardPatch(saved: PosBoardSettings, cur: PosBoardSettings): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (cur.enabled !== saved.enabled) p.enabled = cur.enabled;
  if (cur.defaultBoardId !== saved.defaultBoardId) p.defaultBoardId = cur.defaultBoardId;
  if (canonMap(cur.boardByUnit) !== canonMap(saved.boardByUnit)) p.boardByUnit = cur.boardByUnit;
  if (cur.assignManager !== saved.assignManager) p.assignManager = cur.assignManager;
  const rules: Record<string, Record<string, unknown>> = {};
  const sd: Record<string, unknown> = {};
  for (const k of ["enabled", "minAbsSatang", "everyClose", "forcedClose"] as const) if (cur.rules.shiftDiff[k] !== saved.rules.shiftDiff[k]) sd[k] = cur.rules.shiftDiff[k];
  if (Object.keys(sd).length) rules.shiftDiff = sd;
  const so: Record<string, unknown> = {};
  if (cur.rules.soldOut.enabled !== saved.rules.soldOut.enabled) so.enabled = cur.rules.soldOut.enabled;
  if (cur.rules.soldOut.hours !== saved.rules.soldOut.hours) so.hours = cur.rules.soldOut.hours;
  if (cur.rules.soldOut.sources.join(",") !== saved.rules.soldOut.sources.join(",")) so.sources = cur.rules.soldOut.sources;
  if (Object.keys(so).length) rules.soldOut = so;
  if (cur.rules.refundNeeded.enabled !== saved.rules.refundNeeded.enabled) rules.refundNeeded = { enabled: cur.rules.refundNeeded.enabled };
  if (Object.keys(rules).length) p.rules = rules;
  return p;
}
/** แพตช์ห้องทีม (enabledByUserId เซิร์ฟเวอร์ตั้งเอง — ไม่ส่ง) */
function roomPatch(saved: PosTeamRoomSettings, cur: PosTeamRoomSettings): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (cur.enabled !== saved.enabled) p.enabled = cur.enabled;
  if (roomKey(cur.defaultRoom) !== roomKey(saved.defaultRoom)) p.defaultRoom = cur.defaultRoom;
  if (canonMap(Object.fromEntries(Object.entries(cur.roomByUnit).map(([u, r]) => [u, roomKey(r)]))) !== canonMap(Object.fromEntries(Object.entries(saved.roomByUnit).map(([u, r]) => [u, roomKey(r)]))))
    p.roomByUnit = cur.roomByUnit;
  const posts: Record<string, unknown> = {};
  for (const k of ["shiftClose", "showOverShort", "dailyBrief"] as const) if (cur.posts[k] !== saved.posts[k]) posts[k] = cur.posts[k];
  if (Object.keys(posts).length) p.posts = posts;
  if (cur.briefHourBkk !== saved.briefHourBkk) p.briefHourBkk = cur.briefHourBkk;
  return p;
}

export function BoardSettings({ systemId, data }: { systemId: string; data: BoardTabData }) {
  const t = useTranslations("pos.settings.board");
  const router = useRouter();
  const owner = data.isOwner;
  const [saved, setSaved] = useState({ board: data.board, teamRoom: data.teamRoom });
  const [b, setB] = useState<PosBoardSettings>(data.board);
  const [r, setR] = useState<PosTeamRoomSettings>(data.teamRoom);
  const [minText, setMinText] = useState(satToText(data.board.rules.shiftDiff.minAbsSatang));
  const [hoursText, setHoursText] = useState(String(data.board.rules.soldOut.hours));
  const [busy, setBusy] = useState<Section | "create" | null>(null);
  const [err, setErr] = useState<Err | null>(null);
  const [done, setDone] = useState<Section | null>(null);
  const [extra, setExtra] = useState<{ id: string; name: string }[]>([]);

  const options = useMemo(() => {
    const list = [...(data.boardOptions ?? [])];
    for (const x of extra) if (!list.some((o) => o.id === x.id)) list.push(x);
    return list;
  }, [data.boardOptions, extra]);
  const names = useMemo(() => ({ ...data.boardNames, ...Object.fromEntries(extra.map((x) => [x.id, x.name])) }), [data.boardNames, extra]);
  const boardName = (id: string | null) => (id ? (names[id] ?? t("hiddenBoard")) : t("noneSet"));
  const live = new Set(data.liveRooms);
  const roomOpts = data.roomOptions ?? [];

  // ค่าที่จอส่ง (ช่องตัวเลขเป็นข้อความ — แปลงตอนบันทึก)
  const minSatang = minText === satToText(saved.board.rules.shiftDiff.minAbsSatang) ? saved.board.rules.shiftDiff.minAbsSatang : (() => {
    const n = intOf(minText);
    return n === null ? null : n * 100;
  })();
  const hours = hoursText === String(saved.board.rules.soldOut.hours) ? saved.board.rules.soldOut.hours : intOf(hoursText);
  const bNow: PosBoardSettings = { ...b, rules: { ...b.rules, shiftDiff: { ...b.rules.shiftDiff, minAbsSatang: minSatang ?? saved.board.rules.shiftDiff.minAbsSatang }, soldOut: { ...b.rules.soldOut, hours: hours ?? saved.board.rules.soldOut.hours } } };
  const bPatch = boardPatch(saved.board, bNow);
  const bDirty = Object.keys(bPatch).length > 0 || minSatang === null || hours === null;
  const rPatch = roomPatch(saved.teamRoom, r);
  const rDirty = Object.keys(rPatch).length > 0;
  const boardResolvable = !!b.defaultBoardId || Object.keys(b.boardByUnit).length > 0;
  const roomResolvable = !!r.defaultRoom || Object.keys(r.roomByUnit).length > 0;

  const editB = (fn: (x: PosBoardSettings) => PosBoardSettings) => {
    setB(fn);
    setDone(null);
    if (err?.section === "board") setErr(null);
  };
  const editR = (fn: (x: PosTeamRoomSettings) => PosTeamRoomSettings) => {
    setR(fn);
    setDone(null);
    if (err?.section === "room") setErr(null);
  };
  const applyResult = (res: { board: PosBoardSettings; teamRoom: PosTeamRoomSettings }, section: Section) => {
    setSaved({ board: res.board, teamRoom: res.teamRoom });
    if (section === "board") {
      setB(res.board);
      setMinText(satToText(res.board.rules.shiftDiff.minAbsSatang));
      setHoursText(String(res.board.rules.soldOut.hours));
    } else setR(res.teamRoom);
  };

  const save = async (section: Section) => {
    if (!owner || busy) return;
    if (section === "board" && minSatang === null) return setErr({ section, code: "VALIDATION", field: "board.rules.shiftDiff.minAbsSatang" });
    if (section === "board" && hours === null) return setErr({ section, code: "VALIDATION", field: "board.rules.soldOut.hours" });
    const patch = section === "board" ? bPatch : rPatch;
    if (Object.keys(patch).length === 0) return;
    setBusy(section);
    setErr(null);
    setDone(null);
    try {
      const res = await savePosBoardSettingsAction(section === "board" ? { systemId, board: patch } : { systemId, teamRoom: patch });
      if (res.ok) {
        applyResult(res, section);
        setDone(section);
      } else setErr({ section, code: res.code, ...(res.field ? { field: res.field } : {}) });
    } catch {
      setErr({ section, code: "UNKNOWN" });
    } finally {
      setBusy(null);
    }
  };

  // มติ 1 · CD-P38U-3: บอร์ดเปล่า "งานหน้าร้าน" ในระบบบอร์ดงานแรกของร้าน → ตั้งเป็นบอร์ดปริยาย → โหลดหน้าใหม่
  const createBoard = async () => {
    if (!owner || busy || !data.kanbanSystemId) return;
    setBusy("create");
    setErr(null);
    setDone(null);
    try {
      const c = await createBoardFromTemplateAction({ systemId: data.kanbanSystemId, templateId: null, name: t("newBoardName") });
      if (!c.ok) return setErr({ section: "create", code: "createFailed" });
      setExtra((x) => [...x, { id: c.boardId, name: t("newBoardName") }]);
      const s = await savePosBoardSettingsAction({ systemId, board: { defaultBoardId: c.boardId } });
      if (!s.ok) {
        setB((x) => ({ ...x, defaultBoardId: c.boardId }));
        return setErr({ section: "create", code: "createSaveFailed" });
      }
      applyResult(s, "board");
      router.refresh();
    } catch {
      setErr({ section: "create", code: "createFailed" });
    } finally {
      setBusy(null);
    }
  };

  // ── ชิ้นส่วน ──
  const msg = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.UNKNOWN"));
  const placed = new Set<string>();
  const fieldErr = (section: Section, field: string) => {
    placed.add(`${section}|${field}`);
    return err && err.section === section && err.field === field ? (
      <span data-testid="pos-settings-board-error" data-field={field} role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
        {msg(err.code)}
      </span>
    ) : null;
  };
  const row = (label: string, hint: ReactNode, node: ReactNode, extraNode?: ReactNode) => (
    <div className="flex flex-col gap-1 border-t py-[14px] first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold">{label}</b>
          {hint ? <small className="block text-[12.5px] text-[color:var(--color-muted)]">{hint}</small> : null}
        </div>
        {node}
      </div>
      {extraNode}
    </div>
  );
  const inp = "input h-12 w-[110px] rounded-[13px] px-4 text-right text-[15px] font-semibold tabular-nums disabled:opacity-70";
  const sel = "input h-12 w-full min-w-0 max-w-[320px] rounded-[13px] px-3 text-[14.5px] disabled:opacity-70 sm:w-[300px]";
  const textVal = "max-w-[300px] break-words text-right text-[14px] text-[color:var(--color-ink-soft)]";
  const saveCls = "btn btn-primary h-11 rounded-[11px] px-6 text-[14px] disabled:opacity-50";
  const reason = (on: boolean, key: string, testid?: string) =>
    on ? (
      <span data-testid={testid} className="text-[12.5px] text-[color:var(--color-muted)]">
        {t(key)}
      </span>
    ) : null;
  const roomLabel = (ref: PosRoomRef | null) => {
    if (!ref) return t("noneSet");
    const o = roomOpts.find((x) => x.meetingSystemId === ref.meetingSystemId && x.channelId === ref.channelId);
    return o ? o.label : t("room.hiddenRoom");
  };
  const stale = (ref: PosRoomRef | null, testid: string) =>
    ref && !live.has(ref.channelId) ? (
      <span data-testid={testid} role="status" className="text-[12.5px] font-semibold text-[color:var(--color-danger)]">
        {t("room.stale")}
      </span>
    ) : null;

  /** ตัวเลือกบอร์ด (เจ้าของ) · ค่าเดิมที่ไม่อยู่ในรายการ = ตัวเลือกจาง "บอร์ดที่คุณเปิดดูไม่ได้" (select เขียน testid ตรงตัวที่ผู้เรียก — F15.3) */
  const boardOpts = (value: string | null, empty: string) => (
    <>
      <option value="">{empty}</option>
      {value && !options.some((o) => o.id === value) ? (
        <option value={value} disabled>
          {t("hiddenBoard")}
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </>
  );
  const roomOptsEls = (value: PosRoomRef | null, empty: string) => {
    const k = roomKey(value);
    return (
      <>
        <option value="">{empty}</option>
        {value && !roomOpts.some((o) => roomKey(o) === k) ? (
          <option value={k} disabled>
            {live.has(value.channelId) ? t("room.hiddenRoom") : t("room.staleOption")}
          </option>
        ) : null}
        {roomOpts.map((o) => (
          <option key={roomKey(o)} value={roomKey(o)}>
            {o.label}
          </option>
        ))}
      </>
    );
  };
  const foot = (section: Section, dirty: boolean, button: ReactNode) => (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t pt-4">
      {err && err.section === section && (!err.field || !placed.has(`${section}|${err.field}`)) ? (
        <InlineNote tone="error" testid="pos-settings-board-error">
          {msg(err.code)}
        </InlineNote>
      ) : null}
      {done === section && !dirty ? (
        <span data-testid="pos-settings-board-saved" role="status" className="text-[13.5px] text-[color:var(--color-muted)]">
          {t("saved")}
        </span>
      ) : null}
      {button}
    </div>
  );

  // ── การ์ด 1 บอร์ดงาน ──
  const sd = b.rules.shiftDiff;
  const so = b.rules.soldOut;
  const boardCard = (
    <SettingsCard testid="pos-settings-board-board">
      <CardHead icon="grid" title={t("sectionBoard")} />
      {row(
        t("enabled"),
        t("enabledHint"),
        <button
          data-testid="pos-settings-board-enabled"
          type="button"
          role="switch"
          aria-checked={b.enabled}
          aria-label={t("enabled")}
          aria-disabled={!owner || (!b.enabled && !boardResolvable) ? "true" : undefined}
          disabled={!owner || busy !== null || (!b.enabled && !boardResolvable)}
          className="grid min-h-11 min-w-11 place-items-center"
          onClick={() => editB((x) => ({ ...x, enabled: !x.enabled }))}
        >
          <SwitchKnob on={b.enabled} disabled={!owner || (!b.enabled && !boardResolvable)} />
        </button>,
        <>
          {reason(owner && !b.enabled && !boardResolvable, "needBoard", "pos-settings-board-need-board")}
          {fieldErr("board", "board.enabled")}
        </>,
      )}
      {row(
        t("default"),
        t("defaultHint"),
        owner ? (
          <select data-testid="pos-settings-board-default" className={sel} aria-label={t("default")} value={b.defaultBoardId ?? ""} disabled={busy !== null} onChange={(e) => { const v = e.target.value || null; editB((x) => ({ ...x, defaultBoardId: v })); }}>
            {boardOpts(b.defaultBoardId, t("noBoardOption"))}
          </select>
        ) : (
          <span className={textVal}>{boardName(b.defaultBoardId)}</span>
        ),
        fieldErr("board", "board.defaultBoardId"),
      )}
      {/* มติ 1 · CD-P38U-3: ปุ่มสร้างบอร์ด (เจ้าของ · ยังไม่มีบอร์ดปริยาย · มีระบบบอร์ดงาน) · ไม่มีระบบ = ข้อความ + ลิงก์เพิ่มระบบ (ผู้เพิ่มระบบได้) */}
      {owner && !saved.board.defaultBoardId && data.kanbanSystemId ? (
        <div className="flex flex-col gap-1 border-t py-[14px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <small className="min-w-0 flex-1 text-[12.5px] text-[color:var(--color-muted)]">{t("createHint")}</small>
            <button data-testid="pos-settings-board-create" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5 text-[14px] disabled:opacity-50" disabled={busy !== null} onClick={() => void createBoard()}>
              {busy === "create" ? t("creating") : t("create")}
            </button>
          </div>
          {err?.section === "create" ? (
            <span data-testid="pos-settings-board-error" data-field="create" role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
              {msg(err.code)}
            </span>
          ) : null}
        </div>
      ) : null}
      {!data.kanbanSystemId ? (
        <div className="flex flex-wrap items-center gap-3 border-t py-[14px] text-[13px] text-[color:var(--color-muted)]">
          <span data-testid="pos-settings-board-no-kanban" className="min-w-0 flex-1">
            {t("noKanban")}
          </span>
          {data.canAddSystem ? (
            <Link data-testid="pos-settings-board-add-system" href={ADD_SYSTEM_HREF} className="inline-flex min-h-11 shrink-0 items-center font-bold text-[color:var(--color-accent)]">
              {t("addSystem")}
            </Link>
          ) : null}
        </div>
      ) : null}
      {data.units.length > 1 || Object.keys(b.boardByUnit).length > 0
        ? data.units.map((u) =>
            row(
              t("unitBoard", { unit: u.name }),
              null,
              owner ? (
                <select
                  data-testid={`pos-settings-board-unit-${u.id}`}
                  className={sel}
                  aria-label={t("unitBoard", { unit: u.name })}
                  value={b.boardByUnit[u.id] ?? ""}
                  disabled={busy !== null}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    editB((x) => {
                      const m = { ...x.boardByUnit };
                      if (v) m[u.id] = v;
                      else delete m[u.id];
                      return { ...x, boardByUnit: m };
                    });
                  }}
                >
                  {boardOpts(b.boardByUnit[u.id] ?? null, t("useDefault"))}
                </select>
              ) : (
                <span className={textVal}>{b.boardByUnit[u.id] ? boardName(b.boardByUnit[u.id]!) : t("useDefault")}</span>
              ),
              fieldErr("board", `board.boardByUnit.${u.id}`),
            ),
          )
        : null}
      {row(
        t("assignManager"),
        t("assignManagerHint"),
        <button data-testid="pos-settings-board-rule-assignManager" type="button" role="switch" aria-checked={b.assignManager} aria-label={t("assignManager")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editB((x) => ({ ...x, assignManager: !x.assignManager }))}>
          <SwitchKnob on={b.assignManager} disabled={!owner} />
        </button>,
        fieldErr("board", "board.assignManager"),
      )}
      {/* กฎ R4 ขาด/เกินปิดกะ */}
      {row(
        t("ruleShiftDiff"),
        t("ruleShiftDiffHint"),
        <button data-testid="pos-settings-board-rule-shiftDiff" type="button" role="switch" aria-checked={sd.enabled} aria-label={t("ruleShiftDiff")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editB((x) => ({ ...x, rules: { ...x.rules, shiftDiff: { ...x.rules.shiftDiff, enabled: !x.rules.shiftDiff.enabled } } }))}>
          <SwitchKnob on={sd.enabled} disabled={!owner} />
        </button>,
        fieldErr("board", "board.rules.shiftDiff.enabled"),
      )}
      {row(
        t("min"),
        null,
        <span className="inline-flex items-center gap-2">
          <input
            data-testid="pos-settings-board-min"
            className={inp}
            inputMode="numeric"
            autoComplete="off"
            aria-label={t("min")}
            value={minText}
            disabled={!owner || busy !== null}
            aria-invalid={err?.field === "board.rules.shiftDiff.minAbsSatang"}
            onChange={(e) => {
              setMinText(e.target.value);
              editB((x) => x);
            }}
          />
          <span className="text-[14px] text-[color:var(--color-muted)]">{t("unitBaht")}</span>
        </span>,
        fieldErr("board", "board.rules.shiftDiff.minAbsSatang"),
      )}
      {row(
        t("everyClose"),
        null,
        <button data-testid="pos-settings-board-rule-everyClose" type="button" role="switch" aria-checked={sd.everyClose} aria-label={t("everyClose")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editB((x) => ({ ...x, rules: { ...x.rules, shiftDiff: { ...x.rules.shiftDiff, everyClose: !x.rules.shiftDiff.everyClose } } }))}>
          <SwitchKnob on={sd.everyClose} disabled={!owner} />
        </button>,
        fieldErr("board", "board.rules.shiftDiff.everyClose"),
      )}
      {row(
        t("forcedClose"),
        null,
        <button data-testid="pos-settings-board-rule-forcedClose" type="button" role="switch" aria-checked={sd.forcedClose} aria-label={t("forcedClose")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editB((x) => ({ ...x, rules: { ...x.rules, shiftDiff: { ...x.rules.shiftDiff, forcedClose: !x.rules.shiftDiff.forcedClose } } }))}>
          <SwitchKnob on={sd.forcedClose} disabled={!owner} />
        </button>,
        fieldErr("board", "board.rules.shiftDiff.forcedClose"),
      )}
      {/* กฎ R5 ของหมดนาน */}
      {row(
        t("ruleSoldOut"),
        t("ruleSoldOutHint"),
        <button data-testid="pos-settings-board-rule-soldOut" type="button" role="switch" aria-checked={so.enabled} aria-label={t("ruleSoldOut")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editB((x) => ({ ...x, rules: { ...x.rules, soldOut: { ...x.rules.soldOut, enabled: !x.rules.soldOut.enabled } } }))}>
          <SwitchKnob on={so.enabled} disabled={!owner} />
        </button>,
        fieldErr("board", "board.rules.soldOut.enabled"),
      )}
      {row(
        t("hours"),
        `${POS_BOARD_LIMITS.hours.min}–${POS_BOARD_LIMITS.hours.max}`,
        <span className="inline-flex items-center gap-2">
          <input
            data-testid="pos-settings-board-hours"
            className={inp}
            inputMode="numeric"
            autoComplete="off"
            aria-label={t("hours")}
            value={hoursText}
            disabled={!owner || busy !== null}
            aria-invalid={err?.field === "board.rules.soldOut.hours"}
            onChange={(e) => {
              setHoursText(e.target.value);
              editB((x) => x);
            }}
          />
          <span className="text-[14px] text-[color:var(--color-muted)]">{t("unitHours")}</span>
        </span>,
        fieldErr("board", "board.rules.soldOut.hours"),
      )}
      {row(
        t("sources"),
        null,
        <span className="flex flex-wrap gap-2">
          {POS_BOARD_SOLD_OUT_SOURCES.map((s) => {
            const on = so.sources.includes(s);
            return (
              <button
                key={s}
                data-testid={`pos-settings-board-source-${s}`}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={!owner ? "true" : undefined}
                disabled={!owner || busy !== null}
                className={`inline-flex min-h-11 items-center rounded-[10px] border px-4 text-[14px] disabled:opacity-60 ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`}
                onClick={() => editB((x) => ({ ...x, rules: { ...x.rules, soldOut: { ...x.rules.soldOut, sources: on ? x.rules.soldOut.sources.filter((y) => y !== s) : POS_BOARD_SOLD_OUT_SOURCES.filter((y) => y === s || x.rules.soldOut.sources.includes(y)) } } }))}
              >
                {t(`source.${s}`)}
              </button>
            );
          })}
        </span>,
        fieldErr("board", "board.rules.soldOut.sources"),
      )}
      {/* กฎ R6 ต้องคืนเงิน */}
      {row(
        t("ruleRefundNeeded"),
        t("ruleRefundNeededHint"),
        <button data-testid="pos-settings-board-rule-refundNeeded" type="button" role="switch" aria-checked={b.rules.refundNeeded.enabled} aria-label={t("ruleRefundNeeded")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editB((x) => ({ ...x, rules: { ...x.rules, refundNeeded: { enabled: !x.rules.refundNeeded.enabled } } }))}>
          <SwitchKnob on={b.rules.refundNeeded.enabled} disabled={!owner} />
        </button>,
        fieldErr("board", "board.rules.refundNeeded.enabled"),
      )}
      {owner
        ? foot(
            "board",
            bDirty,
            <button data-testid="pos-settings-board-save" type="button" className={saveCls} disabled={busy !== null || !bDirty} onClick={() => void save("board")}>
              {busy === "board" ? t("saving") : t("save")}
            </button>,
          )
        : null}
    </SettingsCard>
  );

  // ── การ์ด 2 ห้องทีม ──
  const roomCard = (
    <SettingsCard testid="pos-settings-board-room">
      <CardHead icon="mail" title={t("sectionRoom")} />
      {/* W18 · CD-P38U-5: ห้องทีมปิด = กรอบประบอกว่ายังไม่มีโพสต์ (ไม่มีการติ๊กล่วงหน้า) */}
      {!saved.teamRoom.enabled ? (
        <div data-testid="pos-settings-board-all-off" className="mb-3 inline-block self-start rounded-[8px] border border-dashed px-[9px] py-1.5 text-[12px] text-[color:var(--color-muted)]">
          {t("room.allOff")}
        </div>
      ) : null}
      {!data.meetingSystemId ? (
        <p data-testid="pos-settings-board-no-meeting" className="mb-3 text-[13px] text-[color:var(--color-muted)]">
          {t("room.noMeeting")}
        </p>
      ) : null}
      {row(
        t("room.enabled"),
        t("room.enabledHint"),
        <button
          data-testid="pos-settings-board-room-enabled"
          type="button"
          role="switch"
          aria-checked={r.enabled}
          aria-label={t("room.enabled")}
          aria-disabled={!owner || (!r.enabled && !roomResolvable) ? "true" : undefined}
          disabled={!owner || busy !== null || (!r.enabled && !roomResolvable)}
          className="grid min-h-11 min-w-11 place-items-center"
          onClick={() => editR((x) => ({ ...x, enabled: !x.enabled }))}
        >
          <SwitchKnob on={r.enabled} disabled={!owner || (!r.enabled && !roomResolvable)} />
        </button>,
        <>
          {reason(owner && !r.enabled && !roomResolvable, "room.needRoom", "pos-settings-board-need-room")}
          {fieldErr("room", "teamRoom.enabled")}
        </>,
      )}
      {row(
        t("room.default"),
        t("room.defaultHint"),
        owner ? (
          <select data-testid="pos-settings-board-room-default" className={sel} aria-label={t("room.default")} value={roomKey(r.defaultRoom)} disabled={busy !== null} onChange={(e) => { const v = roomOf(e.target.value); editR((x) => ({ ...x, defaultRoom: v })); }}>
            {roomOptsEls(r.defaultRoom, t("room.noRoomOption"))}
          </select>
        ) : (
          <span className={textVal}>{r.defaultRoom ? t("room.hiddenRoom") : t("noneSet")}</span>
        ),
        <>
          {stale(r.defaultRoom, "pos-settings-board-stale")}
          {fieldErr("room", "teamRoom.defaultRoom")}
        </>,
      )}
      {data.units.length > 1 || Object.keys(r.roomByUnit).length > 0
        ? data.units.map((u) =>
            row(
              t("room.unitRoom", { unit: u.name }),
              null,
              owner ? (
                <select
                  data-testid={`pos-settings-board-room-unit-${u.id}`}
                  className={sel}
                  aria-label={t("room.unitRoom", { unit: u.name })}
                  value={roomKey(r.roomByUnit[u.id])}
                  disabled={busy !== null}
                  onChange={(e) => {
                    const v = roomOf(e.target.value);
                    editR((x) => {
                      const m = { ...x.roomByUnit };
                      if (v) m[u.id] = v;
                      else delete m[u.id];
                      return { ...x, roomByUnit: m };
                    });
                  }}
                >
                  {roomOptsEls(r.roomByUnit[u.id] ?? null, t("room.useDefault"))}
                </select>
              ) : (
                <span className={textVal}>{r.roomByUnit[u.id] ? t("room.hiddenRoom") : t("room.useDefault")}</span>
              ),
              <>
                {stale(r.roomByUnit[u.id] ?? null, `pos-settings-board-stale-unit-${u.id}`)}
                {fieldErr("room", `teamRoom.roomByUnit.${u.id}`)}
              </>,
            ),
          )
        : null}
      {row(
        t("room.postShiftClose"),
        null,
        <button data-testid="pos-settings-board-post-shiftClose" type="button" role="switch" aria-checked={r.posts.shiftClose} aria-label={t("room.postShiftClose")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editR((x) => ({ ...x, posts: { ...x.posts, shiftClose: !x.posts.shiftClose } }))}>
          <SwitchKnob on={r.posts.shiftClose} disabled={!owner} />
        </button>,
        fieldErr("room", "teamRoom.posts.shiftClose"),
      )}
      {row(
        t("room.postShowOverShort"),
        t("room.overShortHelp"),
        <button data-testid="pos-settings-board-post-showOverShort" type="button" role="switch" aria-checked={r.posts.showOverShort} aria-label={t("room.postShowOverShort")} aria-disabled={!owner ? "true" : undefined} disabled={!owner || busy !== null} className="grid min-h-11 min-w-11 place-items-center" onClick={() => editR((x) => ({ ...x, posts: { ...x.posts, showOverShort: !x.posts.showOverShort } }))}>
          <SwitchKnob on={r.posts.showOverShort} disabled={!owner} />
        </button>,
        fieldErr("room", "teamRoom.posts.showOverShort"),
      )}
      {row(
        t("room.postDailyBrief"),
        t("room.postDailyBriefHint"),
        <button
          data-testid="pos-settings-board-post-dailyBrief"
          type="button"
          role="switch"
          aria-checked={r.posts.dailyBrief}
          aria-label={t("room.postDailyBrief")}
          aria-disabled={!owner || !r.defaultRoom ? "true" : undefined}
          disabled={!owner || busy !== null || (!r.defaultRoom && !r.posts.dailyBrief)}
          className="grid min-h-11 min-w-11 place-items-center"
          onClick={() => editR((x) => ({ ...x, posts: { ...x.posts, dailyBrief: !x.posts.dailyBrief } }))}
        >
          <SwitchKnob on={r.posts.dailyBrief} disabled={!owner || !r.defaultRoom} />
        </button>,
        <>
          {reason(owner && !r.defaultRoom, "room.briefNeedsDefault", "pos-settings-board-brief-needs-default")}
          {fieldErr("room", "teamRoom.posts.dailyBrief")}
        </>,
      )}
      {row(
        t("room.briefHour"),
        null,
        <select
          data-testid="pos-settings-board-brief-hour"
          className="input h-12 w-[120px] rounded-[13px] px-3 text-[15px] font-semibold tabular-nums disabled:opacity-70"
          aria-label={t("room.briefHour")}
          value={r.briefHourBkk}
          disabled={!owner || busy !== null || !r.defaultRoom}
          onChange={(e) => editR((x) => ({ ...x, briefHourBkk: Number(e.target.value) }))}
        >
          {Array.from({ length: POS_BOARD_LIMITS.briefHourBkk.max - POS_BOARD_LIMITS.briefHourBkk.min + 1 }, (_, i) => i + POS_BOARD_LIMITS.briefHourBkk.min).map((h) => (
            <option key={h} value={h}>
              {t("room.hourValue", { h: String(h).padStart(2, "0") })}
            </option>
          ))}
        </select>,
        fieldErr("room", "teamRoom.briefHourBkk"),
      )}
      {owner
        ? foot(
            "room",
            rDirty,
            <button data-testid="pos-settings-board-room-save" type="button" className={saveCls} disabled={busy !== null || !rDirty} onClick={() => void save("room")}>
              {busy === "room" ? t("saving") : t("save")}
            </button>,
          )
        : null}
    </SettingsCard>
  );

  // ── การ์ด 3 อ่านอย่างเดียว (K3.3 · P1.11) ──
  const kanbanHref = data.kanbanSystemId ? `/app/sys/${data.kanbanSystemId}/kanban/settings` : null;
  const ro = (key: "voided" | "approval" | "issue", label: string, on: boolean, boardId: string | null, href: string | null, linkLabel: string) => (
    <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-[12px] first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <b className="block text-[14.5px] font-semibold">{label}</b>
        <small className="block text-[12.5px] text-[color:var(--color-muted)]">{boardId ? t("others.boardName", { name: boardName(boardId) }) : t("noneSet")}</small>
      </div>
      <Chip tone={on ? "accent" : "muted"}>{on ? t("others.on") : t("others.off")}</Chip>
      {href ? (
        <Link data-testid={`pos-settings-board-readonly-${key}`} href={href} className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[color:var(--color-accent)]">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
  const othersCard = (
    <SettingsCard testid="pos-settings-board-others">
      <CardHead icon="link" title={t("sectionOthers")} />
      {ro("voided", t("others.voided"), !!data.others.voided?.enabled, data.others.voided?.boardId ?? null, kanbanHref, t("others.manageKanban"))}
      {ro("approval", t("others.approval"), !!data.others.approval?.enabled, data.others.approval?.boardId ?? null, kanbanHref, t("others.manageKanban"))}
      {ro("issue", t("others.issue"), !!data.others.issueBoardId, data.others.issueBoardId, posSettingsHref(systemId, "receipt"), t("others.manageReceipt"))}
    </SettingsCard>
  );

  return (
    <div data-testid="pos-settings-board-tab" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={t("title")} desc={t("desc")} />
      {!owner ? (
        <InlineNote tone="ok" testid="pos-settings-board-owner-only">
          {t("ownerOnly")}
        </InlineNote>
      ) : null}
      {boardCard}
      {roomCard}
      {othersCard}
    </div>
  );
}
