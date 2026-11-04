// การ์ดอนุมัติของห้องงาน + ตรรกะการอนุมัติทั้งหมด (ใบ S2.4 · แบบ A4 sec-a.jpg หน้า 4 · C4 sec-c.jpg หน้า 5)
// ไฟล์นี้ไฟล์เดียวถือ "การตัดสิน" ทั้งหมด (ผู้ตรวจ UX อนุมัติ/ย้อนอ่านที่นี่):
//   • อนุมัติ → `approve(item, confirm2x=false)` · เซิร์ฟเวอร์ตอบ needsSecondConfirm (DESTRUCTIVE) ⇒ ชีตยืนยันครั้งที่ 2 → `approve(item, confirm2x=true)`
//     ok:false ⇒ แสดง note ของเซิร์ฟเวอร์บนการ์ด (ไม่ปิดการ์ด · ข้อเสนอยัง PENDING) · ok ⇒ ข้อความสั้น + โหลดห้องใหม่
//   • ตีกลับ → ชีต C4 (RejectSheet): หมายเหตุ + remember "JOB" (แค่งานนี้) / "RULE" (จำเป็นกฎ · ต้องมีหมายเหตุ) · แผน = ตีกลับทั้งแผน (body ว่าง)
//   • แก้ → ชีต (EditSheet) เฉพาะ editable (kind ทะเบียน op) · ส่งเฉพาะช่องที่เปลี่ยน `{patch}` · chat.send ไม่มีปุ่มแก้ (§M)
//   • "ทำไมต้องอนุมัติ" = `why` จากเซิร์ฟเวอร์เท่านั้น (รายการ หรือผลของ approve) — ไม่มี = ไม่แสดง (ไม่แต่งเอง)
//   • สวิตช์ "ครั้งหน้าไม่ต้องถาม" แสดงแบบปิด+ล็อก (R-K3b: กฎอนุมัติรุ่นแรก = แสดงอย่างเดียว ไม่มีทางอัตโนมัติ)
// S2.10 (RESOLUTIONS §S): ok ⇒ จอเอาการ์ดออกทันที (onDone removed=true) · ok:false/409/410 ⇒ โหลดใหม่ทันที (removed=false) · กดซ้ำกันด้วย ref ·
//   แผน: ผล "ทำแล้ว N/M" + note ของขั้นที่ล้มตัวแรก (doneCount>0 ⇒ โหลดใหม่) · แก้แล้ว = แสดงช่องที่แก้จาก `res.input` (allowlist sec.field.*) ·
//   chat.send แสดงบรรทัดลงชื่อที่เซิร์ฟเวอร์ต่อท้ายจริง (R-S1.12c) · canApprove=false ⇒ ปุ่มอนุมัติปิด + บอกว่ารอผู้มีสิทธิ์ · ห้องร่วม = ป้าย "รออนุมัติ · <ผู้มีสิทธิ์>" (D2)
// การยิง API อยู่ที่จอ (ส่ง `actions` มา · ชื่อเส้นอยู่ในตาราง src/api/secretary.ts) · sheets ต้องวาดที่รากจอ (absolute ทับทั้งจอ) ⇒ คืน `sheets` ให้จอวาง
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, Sheet, SysBadge } from "@/src/components/airy";
import { ApiError } from "@/src/api/client";
import type { ApprovalItem, ApproveRes, ProposalItem, RejectBody } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import th from "@/src/i18n/th";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";
import { EditSheet, editableFields, fieldLabel, hasFieldLabel } from "./EditSheet";
import { RejectSheet, type RejectChoice } from "./RejectSheet";
import { StepList } from "./StepCard";
import { sysName } from "./RoomCard";
import { sysColor, sysShortKey } from "./sys";

export type ApprovalActions = {
  approve: (item: ApprovalItem, confirm2x: boolean) => Promise<ApproveRes>;
  reject: (item: ApprovalItem, body: RejectBody) => Promise<{ ok?: boolean; memoryId?: string }>;
  edit: (item: ProposalItem, patch: Record<string, unknown>) => Promise<{ ok?: boolean; input?: Record<string, unknown> | null }>;
};
/** ผลของการกระทำต่อจอ: removed = เอาการ์ดออกทันที (สำเร็จ) · false = โหลดใหม่ทันที (ไม่ผ่าน/หมดอายุ/แก้แล้ว) */
export type ApprovalDone = (item: ApprovalItem, removed: boolean) => void;
/** ข้อความสั้นท้ายจอ — warn = ผลไม่ครบ (แผนทำได้บางขั้น) */
export type Flash = { text: string; warn: boolean };

/** testID ทั้งหมดของการ์ด/ชีต (จอเป็นผู้กำหนด · spec s2.4) */
export type ApprovalIds = {
  card: string;
  approve: string;
  reject: string;
  edit: string;
  why: string;
  auto: string;
  steps: string;
  step: string;
  confirm2x: string;
  rejectSheet: string;
  editSheet: string;
};

type Open = { kind: "confirm2x" | "reject" | "edit"; item: ApprovalItem } | null;

const omit = (o: Record<string, string>, k: string) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
const errText = (e: unknown, fallback: string) => (e instanceof ApiError && e.detail ? e.detail : fallback);
/** สถานะที่แปลว่ารายการเปลี่ยนไปแล้ว (ไม่พบ/ไม่ PENDING/หมดอายุ) ⇒ โหลดใหม่ */
const stale = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 410);
/** บรรทัดลงชื่อที่เซิร์ฟเวอร์ต่อท้าย chat.send (CHAT_SEND_SIGNATURE · R-S1.12c) — ข้อความจริงที่ลูกค้าเห็น */
export const CHAT_SIGNATURE_KIND = "chat.send";

export type ApprovalFlow = ReturnType<typeof useApprovalFlow>;

/** สถานะ + การกระทำของการอนุมัติทั้งห้อง (ชีตเปิดได้ทีละใบ · กดได้ทีละรายการ) */
export function useApprovalFlow({ actions, onDone, name, ids }: { actions: ApprovalActions; onDone: ApprovalDone; name: string; ids: ApprovalIds }) {
  const { c } = useTheme();
  const t = useT();
  const [open, setOpen] = useState<Open>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** note ของเซิร์ฟเวอร์ต่อรายการ (ok:false · สิทธิ์ไม่พอ · หมดอายุ) */
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** why ที่ได้จากผล approve (เมื่อรายการไม่มี why มาเอง) */
  const [whyBack, setWhyBack] = useState<Record<string, string>>({});
  const [rejectNote, setRejectNote] = useState("");
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [flash, setFlashState] = useState<Flash | null>(null);
  const setFlash = useCallback((text: string, warn = false) => setFlashState({ text, warn }), []);
  /** input หลังแก้ (res.input ของ edit) ต่อรายการ — การ์ดแสดงช่องที่แก้ (R-S2.4d) */
  const [editedInput, setEditedInput] = useState<Record<string, Record<string, unknown>>>({});
  /** กันกดซ้ำระหว่างรอ (state อัปเดตไม่ทันการแตะสองครั้งติด · R-S2.4e) */
  const busyRef = useRef(false);
  const take = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    return true;
  };
  const release = () => {
    busyRef.current = false;
    setBusyId(null);
  };

  const close = useCallback(() => {
    setOpen(null);
    setSheetErr(null);
  }, []);

  const approve = useCallback(
    async (item: ApprovalItem, confirm2x: boolean) => {
      if (!take()) return;
      setBusyId(item.id);
      setSheetErr(null);
      setNotes((n) => omit(n, item.id));
      try {
        const r = await actions.approve(item, confirm2x);
        if (r.why) setWhyBack((w) => ({ ...w, [item.id]: r.why as string }));
        if (!r.ok && r.needsSecondConfirm && !confirm2x) {
          setOpen({ kind: "confirm2x", item });
          return;
        }
        setOpen(null);
        if (item.type === "plan") {
          // แผน: ผลรวม "ทำแล้ว N/M" + note ของขั้นที่ล้มตัวแรก (R-S2.4c) · doneCount>0 = แผนถูกใช้ไปแล้ว ⇒ การ์ดออก + โหลดใหม่
          const results = r.results ?? [];
          const done = Number(r.doneCount ?? results.filter((x) => x.ok).length) || 0;
          const total = results.length || item.steps.length;
          const failNote = results.find((x) => x.ok === false)?.note ?? (r.ok ? null : (r.note ?? null));
          if (r.ok) {
            setFlash(t("sec.room.ap.planDone", { n: done, m: total }));
            onDone(item, true);
          } else if (done > 0) {
            setFlash(failNote ? t("sec.room.ap.planPartialNote", { n: done, m: total, note: failNote }) : t("sec.room.ap.planPartial", { n: done, m: total }), true);
            onDone(item, true);
          } else {
            setNotes((n) => ({ ...n, [item.id]: failNote || t("sec.room.ap.err") }));
            onDone(item, false);
          }
          return;
        }
        if (!r.ok) {
          setNotes((n) => ({ ...n, [item.id]: r.note || t("sec.room.ap.err") }));
          onDone(item, false);
          return;
        }
        setFlash(r.note || t("sec.room.ap.approved"));
        onDone(item, true);
      } catch (e) {
        const msg = errText(e, t("sec.room.ap.err"));
        if (confirm2x) setSheetErr(msg);
        else setNotes((n) => ({ ...n, [item.id]: msg }));
        if (stale(e)) onDone(item, false);
      } finally {
        release();
      }
    },
    [actions, onDone, setFlash, t],
  );

  const reject = useCallback(
    async (item: ApprovalItem, choice: RejectChoice) => {
      const note = rejectNote.trim();
      if (item.type === "proposal" && choice === "RULE" && !note) return; // กฎต้องมีเหตุผล
      if (!take()) return;
      setBusyId(item.id);
      setSheetErr(null);
      try {
        const body: RejectBody = item.type === "plan" ? {} : { ...(note ? { note } : {}), remember: choice === "RULE" ? "RULE" : "JOB" };
        const r = await actions.reject(item, body);
        setOpen(null);
        setRejectNote("");
        setFlash(choice === "RULE" && r.memoryId !== undefined ? t("sec.room.ap.rejectedRule") : t("sec.room.ap.rejected"));
        onDone(item, true);
      } catch (e) {
        setSheetErr(errText(e, t("sec.room.ap.err")));
        if (stale(e)) onDone(item, false);
      } finally {
        release();
      }
    },
    [actions, onDone, rejectNote, setFlash, t],
  );

  const saveEdit = useCallback(
    async (item: ProposalItem) => {
      const patch: Record<string, unknown> = {};
      for (const f of editableFields(item.input)) {
        const v = editValues[f.key];
        if (v === undefined || v === f.value) continue;
        if (f.numeric) {
          const n = Number(v.replace(/,/g, ""));
          if (!Number.isFinite(n)) {
            setSheetErr(t("sec.room.ap.err"));
            return;
          }
          patch[f.key] = n;
        } else patch[f.key] = v;
      }
      if (Object.keys(patch).length === 0) {
        close();
        return;
      }
      if (!take()) return;
      setBusyId(item.id);
      setSheetErr(null);
      try {
        const r = await actions.edit(item, patch);
        // ฟิลด์ที่แก้แสดงจาก input ที่เซิร์ฟเวอร์บันทึกจริง (res.input) · ไม่มี = ค่าเดิม + patch
        const saved = r.input && typeof r.input === "object" ? r.input : { ...(item.input ?? {}), ...patch };
        setEditedInput((m) => ({ ...m, [item.id]: saved }));
        setOpen(null);
        setFlash(t("sec.room.ap.saved"));
        onDone(item, false);
      } catch (e) {
        setSheetErr(errText(e, t("sec.room.ap.err")));
        if (stale(e)) onDone(item, false);
      } finally {
        release();
      }
    },
    [actions, close, editValues, onDone, setFlash, t],
  );

  const startReject = useCallback((item: ApprovalItem) => {
    setRejectNote("");
    setSheetErr(null);
    setOpen({ kind: "reject", item });
  }, []);
  const startEdit = useCallback((item: ProposalItem) => {
    setEditValues({});
    setSheetErr(null);
    setOpen({ kind: "edit", item });
  }, []);

  const busy = busyId !== null;
  const sheets: ReactNode = (
    <>
      <Sheet visible={open?.kind === "confirm2x"} onClose={busy ? undefined : close} testID={ids.confirm2x} top={430}>
        <Text style={[styles.sh, { color: c.text }]}>{t("sec.room.c2.title")}</Text>
        <ConfirmBody item={open?.kind === "confirm2x" ? open.item : null} error={sheetErr} />
        <ConfirmActions
          testID={ids.confirm2x}
          busy={busy}
          onCancel={close}
          onOk={() => {
            if (open?.kind === "confirm2x") void approve(open.item, true);
          }}
        />
      </Sheet>
      <RejectSheet
        visible={open?.kind === "reject"}
        mode={open?.item.type === "plan" ? "plan" : "proposal"}
        name={name}
        note={rejectNote}
        onNote={setRejectNote}
        busy={busy}
        error={open?.kind === "reject" ? sheetErr : null}
        onClose={close}
        onPick={(choice) => {
          if (open?.kind === "reject") void reject(open.item, choice);
        }}
        testID={ids.rejectSheet}
      />
      <EditSheet
        visible={open?.kind === "edit"}
        fields={open?.kind === "edit" && open.item.type === "proposal" ? editableFields(open.item.input) : []}
        values={editValues}
        onChange={(k, v) => setEditValues((s) => ({ ...s, [k]: v }))}
        busy={busy}
        error={open?.kind === "edit" ? sheetErr : null}
        onClose={close}
        onSave={() => {
          if (open?.kind === "edit" && open.item.type === "proposal") void saveEdit(open.item);
        }}
        testID={ids.editSheet}
      />
    </>
  );

  const clearFlash = useCallback(() => setFlashState(null), []);
  return { ids, name, busyId, notes, whyBack, editedInput, flash, setFlash, clearFlash, approve, startReject, startEdit, sheets };
}

/** ป้ายชั้นความเสี่ยงของการ์ด: "รออนุมัติ · เงิน + ส่งถึงลูกค้า" (+ "· แก้แล้ว") */
function tagOf(t: ReturnType<typeof useT>, item: ApprovalItem, approver: string | null): string {
  const cls: string[] = [];
  if (item.type === "proposal") {
    if (item.money) cls.push(t("sec.room.ap.cls.money"));
    if (item.customerFacing) cls.push(t("sec.room.ap.cls.customer"));
    if (item.piiExport) cls.push(t("sec.room.ap.cls.pii"));
  }
  if (item.destructive) cls.push(t("sec.room.ap.cls.destructive"));
  const parts = [approver ? t("sec.room.ap.pendingBy", { who: approver }) : t("sec.room.ap.pending"), ...(cls.length ? [cls.join(" + ")] : []), ...(item.type === "proposal" && item.edited ? [t("sec.room.ap.edited")] : [])];
  return parts.join(" · ");
}

/** ชื่อชนิดงาน (ไทย/อังกฤษตาม i18n) · ไม่รู้จัก = "งานใน <ระบบ>" */
export function kindLabel(t: ReturnType<typeof useT>, kind: string, module: string): string {
  const k = `sec.kind.${kind}`;
  return k in th ? t(k as I18nKey) : t("sec.kind.fallback", { sys: sysName(t, module) });
}

/** ช่องที่แก้แล้ว (allowlist) สำหรับแสดงบนการ์ด */
function editedRows(t: ReturnType<typeof useT>, input: Record<string, unknown> | null): { key: string; label: string; value: string }[] {
  if (!input) return [];
  return Object.entries(input)
    .filter(([k, v]) => hasFieldLabel(k) && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => ({ key: k, label: fieldLabel(t, k), value: String(v) }));
}

export function ApprovalCard({ item, flow, showPolicy = false, approver = null }: { item: ApprovalItem; flow: ApprovalFlow; showPolicy?: boolean; approver?: string | null }) {
  const { c } = useTheme();
  const t = useT();
  const ids = flow.ids;
  const busy = flow.busyId !== null;
  const mine = flow.busyId === item.id;
  const why = item.why ?? flow.whyBack[item.id] ?? null;
  const note = flow.notes[item.id] ?? null;
  const module = item.type === "proposal" ? item.module : (item.steps[0]?.module ?? "");
  const head = item.type === "proposal" ? kindLabel(t, item.kind, item.module) : item.title || t("sec.room.ap.plan", { n: item.steps.length });
  const approveLabel = item.type === "plan" ? t("sec.room.ap.approvePlan") : item.customerFacing ? t("sec.room.ap.approveSend") : t("sec.room.ap.approve");
  const tag = useMemo(() => tagOf(t, item, approver), [t, item, approver]);
  const editedIn = flow.editedInput[item.id] ?? (item.type === "proposal" && item.edited ? item.input : null);
  const fields = item.type === "proposal" ? editedRows(t, editedIn) : [];
  const blocked = !item.canApprove;

  return (
    <View>
      <View testID={ids.card} style={[glassStyle(c, radii.card), styles.card, { borderColor: c.approval.border }]}>
        <Text style={[styles.tag, { color: c.warn.fg }]}>{tag}</Text>
        <View style={styles.head}>
          {module ? <SysBadge sys={sysColor(module)} label={t(sysShortKey(module))} solid /> : null}
          <Text style={[styles.headT, { color: c.text }]} numberOfLines={2}>
            {head}
          </Text>
        </View>
        {item.type === "proposal" ? (
          <>
            <Text testID={`${ids.card}-summary`} style={[styles.summary, { color: c.text }]} selectable>
              {item.summary}
            </Text>
            {item.kind === CHAT_SIGNATURE_KIND ? (
              <View testID={`${ids.card}-signature`} style={[styles.sig, { borderTopColor: c.divider }]}>
                <Text style={[styles.sigL, { color: c.textMuted }]}>{t("sec.room.ap.sigLabel")}</Text>
                <Text style={[styles.sigT, { color: c.textDim }]}>{t("sec.room.ap.signature")}</Text>
              </View>
            ) : null}
            {fields.length > 0 ? (
              <View testID={`${ids.card}-fields`} style={[styles.fields, { backgroundColor: c.chip.bg }]}>
                <Text style={[styles.sigL, { color: c.textMuted }]}>{t("sec.room.ap.editedFields")}</Text>
                {fields.map((f) => (
                  <Text key={f.key} style={[styles.fieldT, { color: c.text }]}>
                    <Text style={{ color: c.textMuted }}>{`${f.label}: `}</Text>
                    {f.value}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <StepList steps={item.steps} testID={ids.steps} stepTestID={ids.step} />
        )}
        {why ? (
          <Text testID={ids.why} style={[styles.why, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
            {t("sec.room.ap.why", { why })}
          </Text>
        ) : null}
        {blocked ? (
          <Text testID={`${ids.card}-blocked`} style={[styles.why, { color: c.textDim, backgroundColor: c.chip.bg }]}>
            {approver ? t("sec.room.ap.waitFor", { who: approver }) : t("sec.room.ap.cannot")}
          </Text>
        ) : null}
        {note ? (
          <Text testID={`${ids.card}-note`} style={[styles.why, { color: c.text, backgroundColor: c.chip.bg }]}>
            {note}
          </Text>
        ) : null}
        <View style={styles.acts}>
          {item.type === "proposal" && item.editable ? (
            <Pressable testID={ids.edit} accessibilityRole="button" disabled={busy} onPress={() => flow.startEdit(item)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
              <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.ap.edit")}</Text>
            </Pressable>
          ) : null}
          <Pressable testID={ids.reject} accessibilityRole="button" disabled={busy} onPress={() => flow.startReject(item)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.ap.reject")}</Text>
          </Pressable>
          <Pressable
            testID={ids.approve}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || blocked, busy: mine }}
            disabled={busy || blocked}
            onPress={() => void flow.approve(item, false)}
            style={[styles.btn, styles.main, { backgroundColor: c.accent }, shadow(c.accentShadow), ((busy && !mine) || blocked) && styles.dim]}
          >
            <Text style={[styles.btnT, { color: c.onAccent }]} numberOfLines={1}>
              {approveLabel}
            </Text>
          </Pressable>
        </View>
        <View testID={ids.auto} accessibilityRole="switch" accessibilityState={{ checked: false, disabled: true }} style={[styles.auto, { borderTopColor: c.divider }]}>
          <Icon name="lock" size={14} color={c.textMuted} />
          <View style={styles.autoX}>
            <Text style={[styles.autoT, { color: c.textDim }]}>{t("sec.room.ap.auto")}</Text>
            <Text style={[styles.autoS, { color: c.textMuted }]}>{t("sec.room.ap.autoLocked")}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.btnOff.bg }]}>
            <View style={[styles.knob, { backgroundColor: c.surface }, shadow(c.seg.onShadow)]} />
          </View>
        </View>
      </View>
      {showPolicy ? <Text style={[styles.policy, { color: c.textMuted }]}>{t("sec.room.ap.policy", { name: flow.name })}</Text> : null}
    </View>
  );
}

function ConfirmBody({ item, error }: { item: ApprovalItem | null; error: string | null }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View>
      <Text style={[styles.cb, { color: c.textMuted }]}>{t("sec.room.c2.body")}</Text>
      {item ? (
        <Text style={[styles.cs, { color: c.text, backgroundColor: c.chip.bg }]} numberOfLines={6}>
          {item.type === "proposal" ? item.summary : item.title}
        </Text>
      ) : null}
      {error ? <Text style={[styles.why, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>{error}</Text> : null}
    </View>
  );
}

function ConfirmActions({ testID, busy, onCancel, onOk }: { testID: string; busy: boolean; onCancel: () => void; onOk: () => void }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View style={styles.acts}>
      <Pressable testID={`${testID}-cancel`} accessibilityRole="button" disabled={busy} onPress={onCancel} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
        <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.c2.cancel")}</Text>
      </Pressable>
      <Pressable testID={`${testID}-ok`} accessibilityRole="button" disabled={busy} onPress={onOk} style={[styles.btn, styles.main, { backgroundColor: c.accent }, shadow(c.accentShadow)]}>
        <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.room.c2.ok")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, paddingVertical: 16, paddingHorizontal: 16 },
  tag: { fontSize: T.cap, fontWeight: "600", lineHeight: 18 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  headT: { flex: 1, minWidth: 0, fontSize: T.h, fontWeight: "700", lineHeight: 23 },
  summary: { fontSize: T.sub + 0.5, lineHeight: 22, marginTop: 10 },
  sig: { marginTop: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  sigL: { fontSize: 11.5, lineHeight: 16 },
  sigT: { fontSize: T.cap, lineHeight: 18, fontStyle: "italic" },
  fields: { marginTop: 10, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12 },
  fieldT: { fontSize: T.cap + 0.5, lineHeight: 19 },
  why: { fontSize: 13, lineHeight: 19.5, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12, overflow: "hidden" },
  acts: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  main: { flex: 1.8 },
  dim: { opacity: 0.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
  auto: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  autoX: { flex: 1, minWidth: 0 },
  autoT: { fontSize: 13, fontWeight: "600" },
  autoS: { fontSize: 11.5, marginTop: 1 },
  track: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: "center" },
  knob: { width: 20, height: 20, borderRadius: 10 },
  policy: { fontSize: T.cap, lineHeight: 19, marginTop: 10 },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  cb: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
  cs: { fontSize: T.sub, lineHeight: 20, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: spacing.md, overflow: "hidden" },
});
