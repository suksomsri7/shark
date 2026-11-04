// ชีตเพิ่ม/แก้งานประจำ (ใบ S2.5 · แบบ A7) — ช่องคำสั่ง · ทุกวัน/ทุกสัปดาห์ (+วัน อา.–ส.) · ชั่วโมง 0–23 (เวลาไทย) · ช่องทาง แจ้งเตือน/ห้องงาน
// รายเดือนไม่มีในชีต (รุ่นแรก) · ลบ = ยืนยันอีกขั้นในชีตก่อนยิง · ตรวจช่องว่างก่อนส่ง (ข้อความไทยจาก i18n) · ข้อความผิดของเซิร์ฟเวอร์แสดงตามที่ส่งมา
// ชีตเก็บค่าร่างเอง — จอ remount ด้วย key ทุกครั้งที่เปิด · testID ทั้งหมดมาจากจอ (spec s2.5)
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, PrimaryButton, Sheet } from "@/src/components/airy";
import type { ScheduleBody } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, type as T } from "@/src/theme/tokens";

export type ScheduleIds = {
  sheet: string;
  instruction: string;
  freqDaily: string;
  freqWeekly: string;
  day: string;
  hour: string;
  chPush: string;
  chRoom: string;
  save: string;
  del: string;
  delConfirm: string;
  delCancel: string;
  error: string;
};
export type ScheduleDraft = { instruction: string; frequency: "DAILY" | "WEEKLY"; days: number[]; hourBkk: number; channels: ("push" | "room")[] };

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAYS = [1, 2, 3, 4, 5, 6, 0]; // จ.–อา. (ค่าเซิร์ฟเวอร์ 0 = อาทิตย์)
const HOUR_W = 64;
export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function ScheduleSheet({
  visible,
  editing,
  locked = null,
  initial,
  name,
  ids,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  editing: boolean;
  /** ข้อความเมื่อแก้เวลา/ความถี่ไม่ได้ (งานของคนอื่นที่เจ้าของกิจการจัดการ · งานรายเดือน) ⇒ แสดงคำสั่ง + ลบได้อย่างเดียว */
  locked?: string | null;
  initial: ScheduleDraft;
  name: string;
  ids: ScheduleIds;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: ScheduleBody) => void;
  onDelete?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [d, setD] = useState<ScheduleDraft>(initial);
  const [check, setCheck] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const hourList = useRef<ScrollView>(null);

  const set = (patch: Partial<ScheduleDraft>) => {
    setCheck(null);
    setD((x) => ({ ...x, ...patch }));
  };
  const toggleDay = (day: number) => set({ days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b) });
  const toggleCh = (ch: "push" | "room") => set({ channels: d.channels.includes(ch) ? d.channels.filter((x) => x !== ch) : [...d.channels, ch] });

  const save = () => {
    const instruction = d.instruction.trim();
    if (!instruction) return setCheck(t("sec.sched.needText"));
    if (d.frequency === "WEEKLY" && d.days.length === 0) return setCheck(t("sec.sched.needDay"));
    if (d.channels.length === 0) return setCheck(t("sec.sched.needChannel"));
    onSave({ instruction, hourBkk: d.hourBkk, frequency: d.frequency, ...(d.frequency === "WEEKLY" ? { days: d.days } : {}), channels: d.channels });
  };

  const msg = check ?? error;
  return (
    <Sheet testID={ids.sheet} visible={visible} onClose={busy ? undefined : onClose} top={70}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Text style={[styles.h, { color: c.text }]}>{t(editing ? "sec.sched.sheet.edit" : "sec.sched.sheet.new")}</Text>

        {locked ? (
          <View>
            <Text style={[styles.lockedT, { color: c.text }]}>{d.instruction}</Text>
            <Text style={[styles.err, { color: c.textDim, backgroundColor: c.chip.bg }]}>{locked}</Text>
          </View>
        ) : (
          <>
        <Text style={[styles.label, { color: c.textFaint }]}>{t("sec.sched.f.instruction", { name })}</Text>
        <TextInput
          testID={ids.instruction}
          value={d.instruction}
          onChangeText={(v) => set({ instruction: v })}
          placeholder={t("sec.sched.f.placeholder")}
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={2000}
          style={[glassStyle(c, radii.sugg), styles.input, { color: c.text }]}
        />

        <Text style={[styles.label, { color: c.textFaint }]}>{t("sec.sched.f.freq")}</Text>
        <View style={[styles.track, { backgroundColor: c.seg.track }]}>
          {(
            [
              ["DAILY", ids.freqDaily, "sec.sched.freq.daily"],
              ["WEEKLY", ids.freqWeekly, "sec.sched.freq.weekly"],
            ] as const
          ).map(([f, id, label]) => {
            const on = d.frequency === f;
            return (
              <Pressable
                testID={id}
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => set({ frequency: f })}
                style={[styles.opt, on && { backgroundColor: c.seg.on }]}
              >
                <Text style={[styles.optT, { color: on ? c.seg.onFg : c.seg.fg }, on && styles.bold]}>{t(label)}</Text>
              </Pressable>
            );
          })}
        </View>

        {d.frequency === "WEEKLY" ? (
          <>
            <Text style={[styles.label, { color: c.textFaint }]}>{t("sec.sched.f.days")}</Text>
            <View style={styles.days}>
              {DAYS.map((day) => {
                const on = d.days.includes(day);
                return (
                  <Pressable
                    testID={`${ids.day}-${day}`}
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggleDay(day)}
                    style={[styles.dayBtn, { backgroundColor: on ? c.accent : c.chip.bg }]}
                  >
                    <Text style={[styles.dayT, { color: on ? c.onAccent : c.chip.fg }]}>{t(`sec.sched.day.${day}` as I18nKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: c.textFaint }]}>{t("sec.sched.f.hour")}</Text>
        <ScrollView
          ref={hourList}
          testID={ids.hour}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hours}
          contentOffset={{ x: Math.max(0, (initial.hourBkk - 2) * HOUR_W), y: 0 }}
        >
          {HOURS.map((h) => {
            const on = d.hourBkk === h;
            return (
              <Pressable
                testID={`${ids.hour}-${h}`}
                key={h}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => set({ hourBkk: h })}
                style={[styles.hourBtn, { backgroundColor: on ? c.accent : c.chip.bg }]}
              >
                <Text style={[styles.hourT, { color: on ? c.onAccent : c.chip.fg }]}>{hh(h)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: c.textFaint }]}>{t("sec.sched.f.channels")}</Text>
        <View style={styles.chs}>
          {(
            [
              ["push", ids.chPush, "sec.sched.ch.push", "bell"],
              ["room", ids.chRoom, "sec.sched.ch.room", "message-circle"],
            ] as const
          ).map(([ch, id, label, icon]) => {
            const on = d.channels.includes(ch);
            return (
              <Pressable
                testID={id}
                key={ch}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggleCh(ch)}
                style={[glassStyle(c, radii.sugg), styles.ch]}
              >
                <View style={[styles.box, { borderColor: on ? c.accent : c.btnOff.bg, backgroundColor: on ? c.accent : c.surface }]}>
                  {on ? <Icon name="check" size={14} color={c.onAccent} /> : null}
                </View>
                <Icon name={icon} size={17} color={c.textDim} />
                <Text style={[styles.chT, { color: c.text }]}>{t(label)}</Text>
              </Pressable>
            );
          })}
        </View>

          </>
        )}

        {msg ? (
          <Text testID={ids.error} style={[styles.err, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
            {msg}
          </Text>
        ) : null}

        {locked ? null : (
          <View style={styles.save}>
            <PrimaryButton testID={ids.save} label={t("sec.sched.save")} disabled={busy} onPress={save} />
          </View>
        )}

        {editing && onDelete ? (
          asking ? (
            <View style={[styles.ask, { backgroundColor: c.chip.bg }]}>
              <Text style={[styles.askT, { color: c.text }]}>{t("sec.sched.deleteAsk")}</Text>
              <View style={styles.askRow}>
                <Pressable testID={ids.delCancel} accessibilityRole="button" onPress={() => setAsking(false)} style={styles.askBtn}>
                  <Text style={[styles.linkT, { color: c.textDim }]}>{t("sec.sched.cancel")}</Text>
                </Pressable>
                <Pressable
                  testID={ids.delConfirm}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={onDelete}
                  style={[styles.askBtn, styles.askMain, { backgroundColor: c.warn.fg }]}
                >
                  <Text style={[styles.linkT, styles.bold, { color: c.onSys }]}>{t("sec.sched.deleteConfirm")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable testID={ids.del} accessibilityRole="button" disabled={busy} onPress={() => setAsking(true)} style={styles.del}>
              <Icon name="trash-2" size={16} color={c.warn.fg} />
              <Text style={[styles.linkT, { color: c.warn.fg }]}>{t("sec.sched.delete")}</Text>
            </Pressable>
          )
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 18 },
  h: { fontSize: 22, fontWeight: "700", marginBottom: 2 },
  label: { fontSize: 13, fontWeight: "600", letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  input: { minHeight: 76, paddingVertical: 12, paddingHorizontal: 14, fontSize: T.body, textAlignVertical: "top" },
  track: { flexDirection: "row", borderRadius: radii.seg, padding: 4 },
  opt: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radii.segIn },
  optT: { fontSize: 14 },
  bold: { fontWeight: "600" },
  days: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayBtn: { flex: 1, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayT: { fontSize: 13 },
  hours: { gap: 8, paddingVertical: 2 },
  hourBtn: { width: HOUR_W - 8, height: 38, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  hourT: { fontSize: 14 },
  chs: { flexDirection: "row", gap: 10 },
  ch: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 12 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  chT: { fontSize: 14.5 },
  err: { fontSize: 13, lineHeight: 19.5, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 14, overflow: "hidden" },
  save: { marginTop: 18 },
  del: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingVertical: 10 },
  linkT: { fontSize: 15 },
  ask: { marginTop: 14, borderRadius: radii.sugg, padding: 14 },
  askT: { fontSize: 14, lineHeight: 21 },
  askRow: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 10 },
  askBtn: { height: size.iconBtn - 6, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  askMain: {},
  lockedT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, marginTop: 12 },
});
