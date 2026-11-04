// การ์ดอนุมัติของห้องงาน + ตรรกะการอนุมัติทั้งหมด (ใบ S2.4 · แบบ A4 sec-a.jpg หน้า 4 · C4 sec-c.jpg หน้า 5)
// ไฟล์นี้ไฟล์เดียวถือ "การตัดสิน" ทั้งหมด (ผู้ตรวจ UX อนุมัติ/ย้อนอ่านที่นี่):
//   • อนุมัติ → `approve(item, confirm2x=false)` · เซิร์ฟเวอร์ตอบ needsSecondConfirm (DESTRUCTIVE) ⇒ ชีตยืนยันครั้งที่ 2 → `approve(item, confirm2x=true)`
//     ok:false ⇒ แสดง note ของเซิร์ฟเวอร์บนการ์ด (ไม่ปิดการ์ด · ข้อเสนอยัง PENDING) · ok ⇒ ข้อความสั้น + โหลดห้องใหม่
//   • ตีกลับ → ชีต C4 (RejectSheet): หมายเหตุ + remember "JOB" (แค่งานนี้) / "RULE" (จำเป็นกฎ · ต้องมีหมายเหตุ) · แผน = ตีกลับทั้งแผน (body ว่าง)
//   • แก้ → ชีต (EditSheet) เฉพาะ editable (kind ทะเบียน op) · ส่งเฉพาะช่องที่เปลี่ยน `{patch}` · chat.send ไม่มีปุ่มแก้ (§M)
//   • "ทำไมต้องอนุมัติ" = `why` จากเซิร์ฟเวอร์เท่านั้น (รายการ หรือผลของ approve) — ไม่มี = ไม่แสดง (ไม่แต่งเอง)
//   • สวิตช์ "ครั้งหน้าไม่ต้องถาม" แสดงแบบปิด+ล็อก (R-K3b: กฎอนุมัติรุ่นแรก = แสดงอย่างเดียว ไม่มีทางอัตโนมัติ)
// การยิง API อยู่ที่จอ (ส่ง `actions` มา · ชื่อเส้นอยู่ในตาราง src/api/secretary.ts) · sheets ต้องวาดที่รากจอ (absolute ทับทั้งจอ) ⇒ คืน `sheets` ให้จอวาง
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, Sheet, SysBadge } from "@/src/components/airy";
import { ApiError } from "@/src/api/client";
import type { ApprovalItem, ApproveRes, ProposalItem, RejectBody } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import th from "@/src/i18n/th";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";
import { EditSheet, editableFields } from "./EditSheet";
import { RejectSheet, type RejectChoice } from "./RejectSheet";
import { StepList } from "./StepCard";
import { sysName } from "./RoomCard";
import { sysColor, sysShortKey } from "./sys";

export type ApprovalActions = {
  approve: (item: ApprovalItem, confirm2x: boolean) => Promise<ApproveRes>;
  reject: (item: ApprovalItem, body: RejectBody) => Promise<{ ok?: boolean; memoryId?: string }>;
  edit: (item: ProposalItem, patch: Record<string, unknown>) => Promise<void>;
};

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

export type ApprovalFlow = ReturnType<typeof useApprovalFlow>;

/** สถานะ + การกระทำของการอนุมัติทั้งห้อง (ชีตเปิดได้ทีละใบ · กดได้ทีละรายการ) */
export function useApprovalFlow({ actions, onChanged, name, ids }: { actions: ApprovalActions; onChanged: () => void; name: string; ids: ApprovalIds }) {
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
  const [flash, setFlash] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    setSheetErr(null);
  }, []);

  const approve = useCallback(
    async (item: ApprovalItem, confirm2x: boolean) => {
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
        if (!r.ok) {
          setNotes((n) => ({ ...n, [item.id]: r.note || t("sec.room.ap.err") }));
          return;
        }
        setFlash(r.note || t("sec.room.ap.approved"));
        onChanged();
      } catch (e) {
        const msg = errText(e, t("sec.room.ap.err"));
        if (confirm2x) setSheetErr(msg);
        else setNotes((n) => ({ ...n, [item.id]: msg }));
      } finally {
        setBusyId(null);
      }
    },
    [actions, onChanged, t],
  );

  const reject = useCallback(
    async (item: ApprovalItem, choice: RejectChoice) => {
      const note = rejectNote.trim();
      if (item.type === "proposal" && choice === "RULE" && !note) return; // กฎต้องมีเหตุผล
      setBusyId(item.id);
      setSheetErr(null);
      try {
        const body: RejectBody = item.type === "plan" ? {} : { ...(note ? { note } : {}), remember: choice === "RULE" ? "RULE" : "JOB" };
        const r = await actions.reject(item, body);
        setOpen(null);
        setRejectNote("");
        setFlash(choice === "RULE" && r.memoryId !== undefined ? t("sec.room.ap.rejectedRule") : t("sec.room.ap.rejected"));
        onChanged();
      } catch (e) {
        setSheetErr(errText(e, t("sec.room.ap.err")));
      } finally {
        setBusyId(null);
      }
    },
    [actions, onChanged, rejectNote, t],
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
      setBusyId(item.id);
      setSheetErr(null);
      try {
        await actions.edit(item, patch);
        setOpen(null);
        setFlash(t("sec.room.ap.saved"));
        onChanged();
      } catch (e) {
        setSheetErr(errText(e, t("sec.room.ap.err")));
      } finally {
        setBusyId(null);
      }
    },
    [actions, close, editValues, onChanged, t],
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

  return { ids, name, busyId, notes, whyBack, flash, clearFlash: () => setFlash(null), approve, startReject, startEdit, sheets };
}

/** ป้ายชั้นความเสี่ยงของการ์ด: "รออนุมัติ · เงิน + ส่งถึงลูกค้า" (+ "· แก้แล้ว") */
function tagOf(t: ReturnType<typeof useT>, item: ApprovalItem): string {
  const cls: string[] = [];
  if (item.type === "proposal") {
    if (item.money) cls.push(t("sec.room.ap.cls.money"));
    if (item.customerFacing) cls.push(t("sec.room.ap.cls.customer"));
    if (item.piiExport) cls.push(t("sec.room.ap.cls.pii"));
  }
  if (item.destructive) cls.push(t("sec.room.ap.cls.destructive"));
  const parts = [t("sec.room.ap.pending"), ...(cls.length ? [cls.join(" + ")] : []), ...(item.type === "proposal" && item.edited ? [t("sec.room.ap.edited")] : [])];
  return parts.join(" · ");
}

/** ชื่อชนิดงาน (ไทย/อังกฤษตาม i18n) · ไม่รู้จัก = "งานใน <ระบบ>" */
export function kindLabel(t: ReturnType<typeof useT>, kind: string, module: string): string {
  const k = `sec.kind.${kind}`;
  return k in th ? t(k as I18nKey) : t("sec.kind.fallback", { sys: sysName(t, module) });
}

export function ApprovalCard({ item, flow, showPolicy = false }: { item: ApprovalItem; flow: ApprovalFlow; showPolicy?: boolean }) {
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
  const tag = useMemo(() => tagOf(t, item), [t, item]);

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
          <Text testID={`${ids.card}-summary`} style={[styles.summary, { color: c.text }]} selectable>
            {item.summary}
          </Text>
        ) : (
          <StepList steps={item.steps} testID={ids.steps} stepTestID={ids.step} />
        )}
        {why ? (
          <Text testID={ids.why} style={[styles.why, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
            {t("sec.room.ap.why", { why })}
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
            accessibilityState={{ disabled: busy, busy: mine }}
            disabled={busy}
            onPress={() => void flow.approve(item, false)}
            style={[styles.btn, styles.main, { backgroundColor: c.accent }, shadow(c.accentShadow), busy && !mine && styles.dim]}
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
