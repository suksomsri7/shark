// งานประจำ (ใบ S2.5 · แบบ A7 sec-a.jpg หน้า 7 + sec-dark-a.jpg หน้า 7)
//   ข้อมูล: GET secretary/scheduled ({items, max}) · POST secretary/scheduled · PUT secretary/scheduled/[id] {active} · DELETE secretary/scheduled/[id]
//   แถว: คำสั่ง · ความถี่ + เวลา (hourBkk เวลาไทย) + ช่องทาง · รอบถัดไป · สวิตช์เปิด/ปิด · งานของคนอื่น = อ่านอย่างเดียว (เว้นเจ้าของกิจการ: เปิด/ปิด/ลบได้)
//   ชีตเพิ่ม/แก้ (ScheduleSheet): ทุกวัน/ทุกสัปดาห์ (+วัน) · ชั่วโมง 0–23 · ช่องทาง push/room (ปริยายทั้งคู่) · รายเดือนไม่มีในแอปรุ่นแรก
//   แก้เวลา/ความถี่: เซิร์ฟเวอร์รุ่นนี้ PUT รับแค่ active ⇒ ตั้งใหม่ (POST) แล้วลบของเดิม (เต็มเพดาน ⇒ ลบก่อนแล้วตั้งใหม่ · ตั้งไม่ผ่าน = ตั้งของเดิมคืน)
//   เพดาน max ⇒ ข้อความไทย (i18n) ก่อนเปิดชีต · ข้อความผิดของเซิร์ฟเวอร์ (ไทย) แสดงตามที่ส่งมา
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, IconBtn, LoadError, Loading } from "@/src/components/airy";
import { ScheduleSheet, hh, type ScheduleDraft, type ScheduleIds } from "@/src/components/secretary/ScheduleSheet";
import { ApiError } from "@/src/api/client";
import {
  DEFAULT_SECRETARY_NAME,
  isDenied,
  nextRunOf,
  normalizeTasks,
  secDeleteId,
  secGet,
  secPost,
  secPutId,
  useSecretaryMe,
  type ScheduleBody,
  type TaskRow,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, shadow, useTheme } from "@/src/theme/index";
import { cardGap, size, spacing, type as T } from "@/src/theme/tokens";

const SHEET_IDS: ScheduleIds = {
  sheet: "sec-sched-sheet",
  instruction: "sec-sched-instruction",
  freqDaily: "sec-sched-freq-daily",
  freqWeekly: "sec-sched-freq-weekly",
  day: "sec-sched-day",
  hour: "sec-sched-hour",
  chPush: "sec-sched-ch-push",
  chRoom: "sec-sched-ch-room",
  save: "sec-sched-save",
  del: "sec-sched-delete",
  delConfirm: "sec-sched-delete-confirm",
  delCancel: "sec-sched-delete-cancel",
  error: "sec-sched-error",
};
const NEW_DRAFT: ScheduleDraft = { instruction: "", frequency: "DAILY", days: [1], hourBkk: 8, channels: ["push", "room"] };
const DEFAULT_MAX = 10;

type Editor = { key: number; task: TaskRow | null } | null;
const errText = (e: unknown, fallback: string) => (e instanceof ApiError && e.detail ? e.detail : fallback);
const editable = (x: TaskRow) => x.frequency === "DAILY" || x.frequency === "WEEKLY";
const bodyOf = (x: TaskRow): ScheduleBody => ({
  instruction: x.instruction,
  hourBkk: x.hourBkk,
  frequency: x.frequency === "WEEKLY" ? "WEEKLY" : "DAILY",
  ...(x.frequency === "WEEKLY" ? { days: x.days } : {}),
  channels: x.channels,
});
const same = (a: ScheduleBody, b: ScheduleBody) => JSON.stringify(a) === JSON.stringify(b);

export default function SecretaryScheduledScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { activeTenantId, tenants, user } = useAuth();
  const myId = user?.id ?? null;
  const isOwner = tenants.find((x) => x.tenantId === activeTenantId)?.role === "OWNER";
  const name = useSecretaryMe()?.name ?? DEFAULT_SECRETARY_NAME;

  const [items, setItems] = useState<TaskRow[] | null>(null);
  const [max, setMax] = useState(DEFAULT_MAX);
  const [offline, setOffline] = useState(false);
  // R-S2.14h: 403 = การ์ดล็อก (LoadError denied) แทนรายการ/ข้อความออฟไลน์
  const [denied, setDenied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; warn: boolean; cap?: boolean } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(h);
  }, [flash]);

  const load = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const r = await secGet("secretary/scheduled");
      setItems(normalizeTasks(r, myId));
      const m = Math.floor(Number(r?.max));
      setMax(Number.isFinite(m) && m > 0 ? m : DEFAULT_MAX);
      setOffline(false);
      setDenied(false);
      setNowMs(Date.now());
    } catch (e) {
      if (isDenied(e)) {
        setDenied(true);
        setOffline(false);
        setItems([]);
        return;
      }
      setOffline(true);
      setItems((x) => x ?? []);
    }
  }, [activeTenantId, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const list = items ?? [];
  const canManage = (x: TaskRow) => x.mine || isOwner;
  const atCap = list.length >= max;

  const add = () => {
    setFlash(null);
    if (atCap) {
      setFlash({ text: t("sec.sched.cap", { max }), warn: true, cap: true });
      return;
    }
    setSheetErr(null);
    setEditor({ key: Date.now(), task: null });
  };
  const edit = (x: TaskRow) => {
    if (!canManage(x)) return;
    setFlash(null);
    setSheetErr(null);
    setEditor({ key: Date.now(), task: x });
  };
  const close = () => {
    if (!busy) setEditor(null);
  };

  // เปิด/ปิด: เปลี่ยนบนจอก่อน (สวิตช์ตอบทันที) · ล้ม = คืนค่าเดิม + ข้อความ
  const toggle = async (x: TaskRow) => {
    if (!canManage(x)) return;
    const next = !x.active;
    setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, active: next } : y)));
    try {
      await secPutId("secretary/scheduled/[id]", x.id, { active: next });
    } catch (e) {
      setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, active: x.active } : y)));
      setFlash({ text: errText(e, t("sec.sched.err")), warn: true });
    }
  };

  const save = async (body: ScheduleBody) => {
    const old = editor?.task ?? null;
    if (old && same(body, bodyOf(old))) {
      setEditor(null);
      return;
    }
    setBusy(true);
    setSheetErr(null);
    try {
      if (!old) {
        await secPost("secretary/scheduled", body);
      } else if (list.length < max) {
        // ตั้งใหม่ก่อน แล้วค่อยลบของเดิม (ตั้งไม่ผ่าน = ของเดิมยังอยู่)
        const r = await secPost("secretary/scheduled", body);
        if (!old.active) await secPutId("secretary/scheduled/[id]", r.id, { active: false }).catch(() => {});
        await secDeleteId("secretary/scheduled/[id]", old.id);
      } else {
        // เต็มเพดาน: ลบของเดิมก่อน · ตั้งใหม่ไม่ผ่าน ⇒ ตั้งของเดิมคืน
        await secDeleteId("secretary/scheduled/[id]", old.id);
        try {
          const r = await secPost("secretary/scheduled", body);
          if (!old.active) await secPutId("secretary/scheduled/[id]", r.id, { active: false }).catch(() => {});
        } catch (e) {
          await secPost("secretary/scheduled", bodyOf(old)).catch(() => {});
          throw e;
        }
      }
      setEditor(null);
      setFlash({ text: t("sec.sched.saved"), warn: false });
      void load();
    } catch (e) {
      setSheetErr(errText(e, t("sec.sched.err")));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const old = editor?.task;
    if (!old) return;
    setBusy(true);
    setSheetErr(null);
    try {
      await secDeleteId("secretary/scheduled/[id]", old.id);
      setEditor(null);
      setFlash({ text: t("sec.sched.deleted"), warn: false });
      void load();
    } catch (e) {
      setSheetErr(errText(e, t("sec.sched.err")));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate("/secretary");
  };

  const dayName = (d: number) => t(`sec.sched.day.${d}` as I18nKey);
  const lineOf = (x: TaskRow) => {
    const time = hh(x.hourBkk);
    const freq =
      x.frequency === "DAILY"
        ? t("sec.sched.line.daily", { time })
        : x.frequency === "WEEKLY"
          ? t("sec.sched.line.weekly", { days: x.days.map(dayName).join(" "), time })
          : t("sec.sched.line.monthly", { days: x.days.join(", "), time });
    const ch = x.channels.map((k) => t(k === "push" ? "sec.sched.ch.push" : "sec.sched.ch.room")).join(" + ");
    return `${freq} · ${t("sec.sched.chLine", { ch })}`;
  };
  const nextOf = (x: TaskRow) => {
    const n = nextRunOf(x, nowMs);
    if (!n) return t("sec.sched.off");
    const time = hh(x.hourBkk);
    if (n.inDays === 0) return t("sec.sched.next.today", { time });
    if (n.inDays === 1) return t("sec.sched.next.tomorrow", { time });
    if (n.inDays < 7) return t("sec.sched.next.weekday", { day: dayName(n.weekday), time });
    return t("sec.sched.next.date", { d: n.day, m: n.month });
  };
  const ownerLine = (x: TaskRow) => (x.mine ? (editable(x) ? null : t("sec.sched.monthlyRo")) : isOwner ? t("sec.sched.notMineOwner") : t("sec.sched.notMine"));

  const task = editor?.task ?? null;
  const locked = task ? !(task.mine && editable(task)) : false;
  const initial: ScheduleDraft = task
    ? { instruction: task.instruction, frequency: task.frequency === "WEEKLY" ? "WEEKLY" : "DAILY", days: task.days.length ? task.days : [1], hourBkk: task.hourBkk, channels: task.channels }
    : NEW_DRAFT;

  return (
    <AiryScreen testID="sec-sched">
      <ScrollView testID="sec-sched-list" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.bar}>
          <IconBtn testID="sec-sched-back" icon="chevron-left" label={t("sec.sched.back")} onPress={back} />
          {/* R-S2.14o: ไม่มีสิทธิ์ (403) = ไม่มีปุ่มสร้างงานประจำ */}
          {denied ? <View style={styles.barSpacer} /> : <IconBtn testID="sec-sched-add" icon="plus" label={t("sec.sched.add")} onPress={add} />}
        </View>
        <Text style={[styles.h, { color: c.text }]}>{t("sec.sched.title")}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.sched.sub", { name })}</Text>

        {/* S2.14: ก่อนผลแรก = Loading */}
        {items === null ? <Loading testID="sec-sched-loading" /> : null}
        {denied ? <LoadError testID="sec-sched-denied" denied /> : null}
        {items && list.length === 0 && !offline && !denied ? (
          <Glass testID="sec-sched-empty" style={styles.empty}>
            <Icon name="clock" size={26} color={c.textMuted} />
            <Text style={[styles.emptyT, { color: c.text }]}>{t("sec.sched.empty")}</Text>
            <Text style={[styles.emptyS, { color: c.textMuted }]}>{t("sec.sched.emptySub", { name })}</Text>
          </Glass>
        ) : null}

        <View style={styles.rows}>
          {list.map((x) => {
            const manage = canManage(x);
            const who = ownerLine(x);
            return (
              <Glass key={x.id} pad={{ v: 14, h: 18 }} style={styles.row}>
                <Pressable testID="sec-sched-item" accessibilityRole="button" accessibilityState={{ disabled: !manage }} onPress={() => edit(x)} style={styles.rowT}>
                  <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                    {x.instruction}
                  </Text>
                  <Text style={[styles.line, { color: c.textDim }]}>{lineOf(x)}</Text>
                  {who ? <Text style={[styles.who, { color: c.textMuted }]}>{who}</Text> : null}
                </Pressable>
                <Text style={[styles.next, { color: c.textMuted }]}>{nextOf(x)}</Text>
                <Pressable
                  testID="sec-sched-toggle"
                  accessibilityRole="switch"
                  accessibilityLabel={t("sec.sched.toggle")}
                  accessibilityState={{ checked: x.active, disabled: !manage }}
                  aria-checked={x.active}
                  disabled={!manage}
                  onPress={() => void toggle(x)}
                  hitSlop={6}
                  style={[styles.track, { backgroundColor: x.active ? c.status.run : c.btnOff.bg }, !manage && styles.dim]}
                >
                  <View style={[styles.knob, { backgroundColor: c.onSys, alignSelf: x.active ? "flex-end" : "flex-start" }, shadow(c.seg.onShadow)]} />
                </Pressable>
              </Glass>
            );
          })}
        </View>

        {list.length > 0 ? <Text style={[styles.note, { color: c.textMuted }]}>{t("sec.sched.note")}</Text> : null}
        {/* R-S2.14h: การ์ดล้มตัวเดียวกับทุกจอ (เดิม: ข้อความกดได้ sec-sched-retry) */}
        {offline ? <LoadError testID="sec-sched-error" message={t("sec.sched.offline")} onRetry={() => void load()} /> : null}
      </ScrollView>

      {flash ? (
        <Text testID={flash.cap ? "sec-sched-cap" : "sec-sched-flash"} style={[styles.flash, { color: flash.warn ? c.warn.fg : c.text, backgroundColor: flash.warn ? c.warn.bg : c.chip.bg }]}>
          {flash.text}
        </Text>
      ) : null}

      {editor ? (
        <ScheduleSheet
          key={editor.key}
          visible
          editing={!!task}
          locked={locked && task ? (task.mine ? t("sec.sched.monthlyRo") : t("sec.sched.notMineOwner")) : null}
          initial={initial}
          name={name}
          ids={SHEET_IDS}
          busy={busy}
          error={sheetErr}
          onClose={close}
          onSave={(b) => void save(b)}
          onDelete={task ? () => void remove() : undefined}
        />
      ) : null}
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  barSpacer: { width: size.iconBtn, height: size.iconBtn },
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 40 },
  bar: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.5, marginTop: F.v(40), lineHeight: 38 },
  sub: { fontSize: F.sub, lineHeight: 20, marginTop: 4 },
  rows: { marginTop: F.v(24), gap: cardGap },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowT: { flex: 1, minWidth: 0 },
  title: { fontSize: T.body, fontWeight: "600", lineHeight: 22 },
  line: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  who: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  next: { fontSize: 12.5, maxWidth: 84, textAlign: "right" },
  track: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: "center" },
  knob: { width: 27, height: 27, borderRadius: 14 },
  dim: { opacity: 0.5 },
  note: { fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 22 },
  empty: { marginTop: F.v(60), alignItems: "center", gap: spacing.sm, paddingVertical: 28 },
  emptyT: { fontSize: T.h, fontWeight: "700", textAlign: "center" },
  emptyS: { fontSize: T.sub, lineHeight: 20, textAlign: "center" },
  retry: { minHeight: size.iconBtn, justifyContent: "center" },
  flash: { position: "absolute", left: spacing.page, right: spacing.page, bottom: 26, fontSize: T.sub, lineHeight: 20, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, overflow: "hidden", textAlign: "center" },
});
