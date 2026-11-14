// แผ่น "เพิ่มเตือน" (CAL2.6 · แบบ cal-2.png จอ 6) + แผ่นเลือกของปุ่ม + (สั่งงานเลขา / เพิ่มเตือน/นัด) + Host ของโซน
//   Segment เตือนความจำ | นัดหมาย · เรื่อง · เมื่อไหร่: อีก 1 ชม. / เย็นนี้ 18:00 (ผ่าน 18:00 แล้ว = ซ่อน) / พรุ่งนี้ 09:00 / เลือกเอง…
//   (เลือกเอง = แถววัน 14 วัน + ปุ่มชั่วโมง/นาที ± · ไม่ใช้ native date picker) · ตั้งค่าเพิ่ม: ทำซ้ำ · ผูกกับ · เตือนล่วงหน้า (+ ถึง ของนัดหมาย)
//   บันทึก = POST calendar/items (เพิ่ม) / PATCH items/[id] (แก้ · CAL2.7) · **ไม่มี "แจ้งใคร"** (มติ M3)
//   Host (CalSheetHost) ครอบ Stack ของโซนเลขา — useCalSheet(): openAdd / openEdit / openPlus · นอก Host = null (ปุ่ม + กลับไป /secretary/new ตามเดิม)
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { Icon, Segment, Sheet } from "@/src/components/airy";
import { calApi, calChanged, LEAD_MINUTES, linkCandidates, type CalItemBody, type CalItemDto, type CalKind, type CalRepeat, type LinkCandidate } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { scheduleZoneBadges } from "@/src/api/secretary";
import { addDays, dayOfIso, dayOfMs, dayStartMs, hhmm, isoAt, minuteText, shortDate, wdShortOf, weekdayOf } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { calCard } from "./style";
import { useAuth } from "@/src/lib/auth-context";
import { setDeviceCalUser } from "@/src/lib/device-calendar";

// ───────── Host ─────────
type Open = { mode: "add"; kind?: CalKind } | { mode: "edit"; item: CalItemDto };
type CalSheetApi = { openAdd: (kind?: CalKind) => void; openEdit: (item: CalItemDto) => void; openPlus: () => void };
const Ctx = createContext<CalSheetApi | null>(null);
/** null = อยู่นอก Host */
export function useCalSheet(): CalSheetApi | null {
  return useContext(Ctx);
}

export function CalSheetHost({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  useEffect(() => setDeviceCalUser(user?.id ?? null), [user?.id]); // CAL2.11 ค่าปฏิทินในเครื่องแยกต่อผู้ใช้
  const [open, setOpen] = useState<Open | null>(null);
  const [plus, setPlus] = useState(false);
  const value = useMemo<CalSheetApi>(
    () => ({
      openAdd: (kind) => {
        setPlus(false);
        setOpen({ mode: "add", kind });
      },
      openEdit: (item) => {
        setPlus(false);
        setOpen({ mode: "edit", item });
      },
      openPlus: () => setPlus(true),
    }),
    [],
  );
  return (
    <Ctx.Provider value={value}>
      <View style={styles.host}>
        {children}
        <PlusSheet visible={plus} onClose={() => setPlus(false)} onCal={() => value.openAdd()} />
        {open ? <AddCalSheet key={open.mode === "edit" ? `e-${open.item.id}` : "add"} open={open} onClose={() => setOpen(null)} /> : null}
      </View>
    </Ctx.Provider>
  );
}

// ───────── ปุ่ม + ของโซนเลขา: เลือก "สั่งงานเลขา" (เส้นเดิม /secretary/new) หรือ "เพิ่มเตือน/นัด" ─────────
function PlusSheet({ visible, onClose, onCal }: { visible: boolean; onClose: () => void; onCal: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const Row = ({ testID, icon, title, sub, onPress }: { testID: string; icon: "message-circle" | "bell"; title: string; sub: string; onPress: () => void }) => (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={[calCard(c, 18), styles.plusRow]}>
      <View style={[styles.plusIc, { backgroundColor: c.chip.bg }]}>
        <Icon name={icon} size={19} color={c.text} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.plusT, { color: c.text }]}>{title}</Text>
        <Text style={[styles.plusS, { color: c.textMuted }]}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={c.iconDim} />
    </Pressable>
  );
  return (
    <Sheet testID="cal-plus" visible={visible} onClose={onClose} top={560}>
      <Text style={[styles.h2, { color: c.text }]}>{t("cal.plus.title")}</Text>
      <Row
        testID="cal-plus-task"
        icon="message-circle"
        title={t("cal.plus.task")}
        sub={t("cal.plus.taskSub")}
        onPress={() => {
          onClose();
          router.push("/secretary/new");
        }}
      />
      <Row testID="cal-plus-cal" icon="bell" title={t("cal.plus.cal")} sub={t("cal.plus.calSub")} onPress={onCal} />
    </Sheet>
  );
}

// ───────── แผ่นเพิ่ม/แก้ ─────────
type Preset = "in1h" | "tonight" | "tomorrow9" | "custom";
type RowKey = "repeat" | "link" | "lead" | "until" | null;
const REPEATS: CalRepeat[] = ["NONE", "DAILY", "WEEKLY", "MONTHLY"];
const DURATIONS = [30, 60, 90, 120, 180];

const nowMinuteMs = () => Math.floor(Date.now() / 60_000) * 60_000;
/** นาทีของวัน (เวลาไทย) ของ ISO */
const minuteOf = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

function AddCalSheet({ open, onClose }: { open: Open; onClose: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const edit = open.mode === "edit" ? open.item : null;
  const today = dayOfMs(Date.now());
  const nextHour = (() => {
    const m = minuteOf(new Date(nowMinuteMs()).toISOString());
    return Math.min(23 * 60, (Math.floor(m / 60) + 1) * 60);
  })();

  const [kind, setKind] = useState<CalKind>(edit?.kind ?? (open.mode === "add" ? (open.kind ?? "REMINDER") : "REMINDER"));
  const [title, setTitle] = useState(edit?.title ?? "");
  const [preset, setPreset] = useState<Preset | null>(edit ? "custom" : null);
  const [cDay, setCDay] = useState(edit ? dayOfIso(edit.startAt) : today);
  const [cMin, setCMin] = useState(edit ? minuteOf(edit.startAt) : nextHour);
  const [dur, setDur] = useState(edit?.endAt ? Math.max(15, Math.round((Date.parse(edit.endAt) - Date.parse(edit.startAt)) / 60_000)) : 60);
  const [repeat, setRepeat] = useState<CalRepeat>(edit?.repeat ?? "NONE");
  const [days, setDays] = useState<number[]>(edit?.repeatDays ?? []);
  const [link, setLink] = useState<LinkCandidate | null>(edit?.link ? { type: edit.link.type, id: edit.link.id, label: edit.link.label } : null);
  const [lead, setLead] = useState<number>(edit?.leadMinutes ?? 0);
  const [row, setRow] = useState<RowKey>(null);
  const [cands, setCands] = useState<LinkCandidate[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (row === "link" && cands === null) void linkCandidates().then(setCands);
  }, [row, cands]);
  // นัดหมายใหม่: เตือนล่วงหน้าตั้งต้น 15 นาที (สัญญา §5.2) · เตือนความจำ = ตรงเวลา
  useEffect(() => {
    if (!edit) setLead(kind === "EVENT" ? 15 : 0);
  }, [kind, edit]);

  const showTonight = Date.now() < dayStartMs(today) + 18 * 3600_000;
  const startIso = (): string | null => {
    if (preset === "in1h") return new Date(nowMinuteMs() + 3600_000).toISOString();
    if (preset === "tonight") return isoAt(today, 18);
    if (preset === "tomorrow9") return isoAt(addDays(today, 1), 9);
    if (preset === "custom") return isoAt(cDay, Math.floor(cMin / 60), cMin % 60);
    return null;
  };
  const start = startIso();

  const save = async () => {
    setErr(null);
    if (!title.trim()) return setErr(t("cal.add.needTitle"));
    if (!start) return setErr(t("cal.add.needTime"));
    const body: CalItemBody = {
      kind,
      title: title.trim(),
      startAt: start,
      ...(kind === "EVENT" ? { endAt: new Date(Date.parse(start) + dur * 60_000).toISOString() } : {}),
      repeat,
      ...(repeat === "WEEKLY" ? { repeatDays: days.length ? [...days].sort() : [weekdayOf(dayOfIso(start))] } : {}),
      leadMinutes: lead,
      ...(link ? { link: { type: link.type, id: link.id } } : {}),
    };
    setBusy(true);
    try {
      if (edit) {
        const { link: _l, ...rest } = body;
        void _l;
        await calApi.patch(edit.id, { ...rest, repeatDays: repeat === "WEEKLY" ? body.repeatDays : [], link: link ? { type: link.type, id: link.id } : null });
      } else await calApi.create(body);
      scheduleZoneBadges();
      calChanged();
      onClose();
    } catch (e) {
      setErr(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const chip = (key: Preset, label: string) => (
    <Pressable
      key={key}
      testID={`cal-add-when-${key}`}
      accessibilityRole="button"
      accessibilityState={{ selected: preset === key }}
      onPress={() => setPreset(key)}
      style={[styles.chip, { backgroundColor: preset === key ? c.accent : c.chip.bg }]}
    >
      <Text style={[styles.chipT, { color: preset === key ? c.onAccent : c.chip.fg }, preset === key && styles.bold]}>{label}</Text>
    </Pressable>
  );
  const small = (testID: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={testID} testID={testID} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.sChip, { backgroundColor: on ? c.accent : c.chip.bg }]}>
      <Text style={[styles.sChipT, { color: on ? c.onAccent : c.chip.fg }]}>{label}</Text>
    </Pressable>
  );
  const dayLabel = (d: string) => (d === today ? t("cal.title.today") : d === addDays(today, 1) ? t("cal.title.tomorrow") : shortDate(d, lang));
  const repeatLabel = (r: CalRepeat) => t(`cal.repeat.${r}`);
  const leadLabel = (m: number) => t(`cal.lead.${m}` as "cal.lead.0");
  const filtered = (cands ?? []).filter((x) => !q.trim() || x.label.toLowerCase().includes(q.trim().toLowerCase()));

  const Row = ({ k, label, value }: { k: Exclude<RowKey, null>; label: string; value: string }) => (
    <Pressable testID={`cal-add-${k}`} accessibilityRole="button" accessibilityState={{ expanded: row === k }} onPress={() => setRow((r) => (r === k ? null : k))} style={[styles.r, { borderBottomColor: c.divider }]}>
      <Text style={[styles.rT, { color: c.text }]}>{label}</Text>
      <Text style={[styles.rV, { color: c.textMuted }]} numberOfLines={1}>
        {value} ›
      </Text>
    </Pressable>
  );

  return (
    <Sheet testID="cal-add" visible onClose={onClose} top={110}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <View style={styles.hd}>
          <Text style={[styles.h2, { color: c.text }]}>{edit ? t("cal.add.editTitle") : t("cal.add.title")}</Text>
          <Pressable testID="cal-add-close" accessibilityRole="button" accessibilityLabel={t("cal.add.close")} onPress={onClose} style={[styles.x, { backgroundColor: c.chip.bg }]}>
            <Icon name="x" size={16} color={c.textDim} />
          </Pressable>
        </View>
        <View style={styles.seg}>
          <Segment
            testID="cal-add-kind"
            size="sm"
            value={kind}
            onChange={(k) => setKind(k as CalKind)}
            options={[
              { key: "REMINDER", label: t("cal.add.kind.REMINDER") },
              { key: "EVENT", label: t("cal.add.kind.EVENT") },
            ]}
          />
        </View>

        <Text style={[styles.fl, { color: c.textFaint }]}>{t("cal.add.subject")}</Text>
        <TextInput
          testID="cal-add-title"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          placeholder={t("cal.add.subjectPh")}
          placeholderTextColor={c.placeholder}
          style={[calCard(c, 16), styles.fbox, { color: c.text }]}
        />

        <Text style={[styles.fl, { color: c.textFaint }]}>{t("cal.add.when")}</Text>
        <View style={styles.chips}>
          {chip("in1h", t("cal.add.in1h"))}
          {showTonight ? chip("tonight", t("cal.add.tonight")) : null}
          {chip("tomorrow9", t("cal.add.tomorrow9"))}
          {chip("custom", preset === "custom" ? `${dayLabel(cDay)} ${minuteText(cMin)}` : t("cal.add.custom"))}
        </View>
        {preset === "custom" ? (
          <View testID="cal-add-custom" style={[calCard(c, 16), styles.custom]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => small(`cal-add-day-${d}`, dayLabel(d), d === cDay, () => setCDay(d)))}
            </ScrollView>
            <View style={styles.timeRow}>
              <Text style={[styles.rT, { color: c.text }]}>{t("cal.add.time")}</Text>
              <View style={styles.stepper}>
                <Pressable testID="cal-add-hour-minus" accessibilityRole="button" onPress={() => setCMin((m) => (m - 60 + 1440) % 1440)} style={[styles.step, { backgroundColor: c.chip.bg }]}>
                  <Icon name="minus" size={14} color={c.text} />
                </Pressable>
                <Pressable testID="cal-add-hour-plus" accessibilityRole="button" onPress={() => setCMin((m) => (m + 60) % 1440)} style={[styles.step, { backgroundColor: c.chip.bg }]}>
                  <Icon name="plus" size={14} color={c.text} />
                </Pressable>
                <Text testID="cal-add-time" style={[styles.timeT, { color: c.text }]}>
                  {minuteText(cMin)}
                </Text>
                <Pressable testID="cal-add-min-minus" accessibilityRole="button" onPress={() => setCMin((m) => (m - 15 + 1440) % 1440)} style={[styles.step, { backgroundColor: c.chip.bg }]}>
                  <Icon name="chevrons-down" size={14} color={c.text} />
                </Pressable>
                <Pressable testID="cal-add-min-plus" accessibilityRole="button" onPress={() => setCMin((m) => (m + 15) % 1440)} style={[styles.step, { backgroundColor: c.chip.bg }]}>
                  <Icon name="chevrons-up" size={14} color={c.text} />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <Text style={[styles.fl, { color: c.textFaint }]}>{t("cal.add.more")}</Text>
        <View style={[calCard(c, 16), styles.grp]}>
          {kind === "EVENT" ? <Row k="until" label={t("cal.add.until")} value={start ? hhmm(new Date(Date.parse(start) + dur * 60_000).toISOString()) : `+${dur}′`} /> : null}
          {row === "until" && kind === "EVENT" ? (
            <View style={styles.opts}>{DURATIONS.map((m) => small(`cal-add-until-${m}`, start ? hhmm(new Date(Date.parse(start) + m * 60_000).toISOString()) : `${m}′`, dur === m, () => setDur(m)))}</View>
          ) : null}
          <Row k="repeat" label={t("cal.add.repeat")} value={repeatLabel(repeat)} />
          {row === "repeat" ? (
            <View style={styles.opts}>
              {REPEATS.map((r) => small(`cal-add-repeat-${r}`, repeatLabel(r), repeat === r, () => setRepeat(r)))}
              {repeat === "WEEKLY" ? (
                <View style={styles.wdRow}>
                  {Array.from({ length: 7 }, (_, i) =>
                    small(`cal-add-wd-${i}`, wdShortOf(i, lang), days.includes(i), () => setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))),
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
          <Row k="link" label={t("cal.add.link")} value={link?.label ?? t("cal.add.linkNone")} />
          {row === "link" ? (
            <View style={styles.optsCol}>
              <TextInput
                testID="cal-add-link-q"
                value={q}
                onChangeText={setQ}
                placeholder={t("cal.add.linkSearch")}
                placeholderTextColor={c.placeholder}
                style={[styles.search, { color: c.text, backgroundColor: c.chip.bg }]}
              />
              {small("cal-add-link-none", t("cal.add.linkNone"), !link, () => setLink(null))}
              {filtered.slice(0, 8).map((x) => small(`cal-add-link-${x.id}`, x.label, link?.id === x.id, () => setLink(x)))}
            </View>
          ) : null}
          <Row k="lead" label={t("cal.add.lead")} value={leadLabel(lead)} />
          {row === "lead" ? <View style={styles.opts}>{LEAD_MINUTES.map((m) => small(`cal-add-lead-${m}`, leadLabel(m), lead === m, () => setLead(m)))}</View> : null}
        </View>

        {err ? (
          <Text testID="cal-add-err" style={[styles.err, { color: c.bad.fg }]}>
            {err}
          </Text>
        ) : null}
        <Pressable testID="cal-add-save" accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.save, { backgroundColor: c.accent }, busy && styles.busy]}>
          <Text style={[styles.saveT, { color: c.onAccent }]}>{t("cal.add.save")}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  body: { paddingBottom: 30 },
  hd: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h2: { fontSize: 21, fontWeight: "800" },
  x: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  seg: { marginTop: 12 },
  fl: { fontSize: 12, marginTop: 14, marginBottom: 6, marginHorizontal: 4 },
  fbox: { paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, outlineWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 12 },
  chipT: { fontSize: 12 },
  bold: { fontWeight: "700" },
  custom: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  dayRow: { gap: 6 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  step: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  timeT: { fontSize: 17, fontWeight: "700", minWidth: 56, textAlign: "center" },
  grp: { overflow: "hidden" },
  r: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rT: { fontSize: 14 },
  rV: { marginLeft: "auto", fontSize: 13.5, flexShrink: 1 },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  optsCol: { gap: 6, paddingHorizontal: 14, paddingVertical: 10, alignItems: "flex-start" },
  wdRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, width: "100%" },
  sChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  sChipT: { fontSize: 12.5 },
  search: { alignSelf: "stretch", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, fontSize: 13.5, outlineWidth: 0 },
  err: { fontSize: 13, marginTop: 12, marginHorizontal: 4 },
  save: { marginTop: 16, borderRadius: 16, paddingVertical: 13, alignItems: "center" },
  saveT: { fontSize: 15, fontWeight: "700" },
  busy: { opacity: 0.6 },
  plusRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10 },
  plusIc: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  plusT: { fontSize: 15, fontWeight: "700" },
  plusS: { fontSize: 12.5, marginTop: 1 },
});
