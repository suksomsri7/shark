// ตั้งค่าปฏิทิน (CAL2.9 · แบบ cal-2.png จอ 8) — เข้าจาก ⚙ ในจอปฏิทิน · ของใครของมัน ตั้งแยกต่อคน ต่อร้าน
//   หัว: ‹ กลับ · "ตั้งค่าปฏิทิน" + ชื่อกิจการ (GET calendar/prefs.tenantName)
//   สรุปวันนี้: ส่งสรุปตอนเช้า (สวิตช์) + เวลา "08:00 (ค่าเริ่ม)" · สรุปพรุ่งนี้ตอนเย็น (สวิตช์) + เวลา — แตะเวลา = แผ่นเลือกชั่วโมง/นาที
//   แสดงในปฏิทิน (เฉพาะระบบที่คุณมีสิทธิ์): prefs.sources[] (จุดสีระบบ + ชื่อ + บรรทัดรอง + สวิตช์)
//   ซิงก์ปฏิทินนอก: Google Calendar (สถานะ เชื่อมแล้ว/เชื่อม/ต้องเชื่อมใหม่ → จอ 9) · ปฏิทิน iPhone (CAL2.11 ยังไม่มี = แจ้งว่ามาในแอปรุ่นถัดไป)
//   บันทึกทันทีที่สลับ (PUT calendar/prefs · ล้ม = คืนค่าเดิม + ข้อความ)
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Icon, IconBtn, LoadError, Loading, Sheet } from "@/src/components/airy";
import { calCard } from "@/src/components/calendar/style";
import { calApi, type ColorKey, type PrefSourceKey, type PrefsPut, type PrefsRes } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { minuteText } from "@/src/lib/cal-date";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

const SRC_COLOR: Record<PrefSourceKey, ColorKey> = { booking: "booking", account: "account", tax: "account", kanban: "kanban", crm: "crm", hr: "hr", dorm: "dorm", ticket: "ticket", trips: "trips" };
const DEFAULT_MORNING = 480;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 15, 30, 45];

function Toggle({ on, onPress, testID, label }: { on: boolean; onPress: () => void; testID: string; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} hitSlop={6} onPress={onPress} style={[styles.tg, { backgroundColor: on ? c.sys.chat : c.btnOff.bg }]}>
      <View style={[styles.knob, { backgroundColor: c.onSys }, on ? styles.knobOn : null]} />
    </Pressable>
  );
}

export default function CalSettingsScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<PrefsRes | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<"morning" | "evening" | null>(null);

  const load = useCallback(async () => {
    try {
      setPrefs(await calApi.prefs());
      setFailed(null);
    } catch (e) {
      setFailed(apiErrorText(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const put = async (body: PrefsPut, optimistic: (p: PrefsRes) => PrefsRes) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs(optimistic(prefs));
    setNote(null);
    try {
      setPrefs(await calApi.putPrefs(body));
    } catch (e) {
      setPrefs(before);
      setNote(apiErrorText(e) || t("cal.set.saveFail"));
    }
  };

  const setMinute = (which: "morning" | "evening", minute: number) =>
    void put(which === "morning" ? { morning: { minute } } : { evening: { minute } }, (p) => ({ ...p, [which]: { ...p[which], minute } }));

  const timeLabel = (which: "morning" | "evening") => {
    const m = prefs?.[which].minute ?? 0;
    return `${minuteText(m)}${which === "morning" && m === DEFAULT_MORNING ? t("cal.set.default") : ""}`;
  };
  const gStatus = prefs?.google.status ?? "NONE";

  const Row = ({ children, last, testID, onPress }: { children: ReactNode; last?: boolean; testID?: string; onPress?: () => void }) =>
    onPress ? (
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={[styles.r, !last && { borderBottomColor: c.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {children}
      </Pressable>
    ) : (
      <View testID={testID} style={[styles.r, !last && { borderBottomColor: c.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {children}
      </View>
    );

  return (
    <AiryScreen testID="cal-settings-screen">
      <View style={styles.bar}>
        <IconBtn testID="cal-set-back" icon="chevron-left" label={t("cal.back")} onPress={() => (router.canGoBack() ? router.back() : router.navigate("/secretary/calendar"))} />
        <View style={styles.center}>
          <Text style={[styles.title, { color: c.text }]}>{t("cal.set.title")}</Text>
          {prefs?.tenantName ? <Text style={[styles.tsub, { color: c.textMuted }]}>{prefs.tenantName}</Text> : null}
        </View>
        <View style={styles.side} />
      </View>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {note ? (
          <Text testID="cal-set-note" style={[styles.note, { color: c.bad.fg }]}>
            {note}
          </Text>
        ) : null}
        {!prefs ? (
          failed ? <LoadError testID="cal-set-error" message={failed} onRetry={() => void load()} /> : <Loading testID="cal-set-loading" />
        ) : (
          <>
            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.set.brief")}</Text>
            <View style={[calCard(c, 16), styles.grp]}>
              <Row>
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.set.morning")}</Text>
                <Toggle testID="cal-set-morning" label={t("cal.set.morning")} on={prefs.morning.on} onPress={() => void put({ morning: { on: !prefs.morning.on } }, (p) => ({ ...p, morning: { ...p.morning, on: !p.morning.on } }))} />
              </Row>
              <Row testID="cal-set-morning-time" onPress={() => setPickFor("morning")}>
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.set.time")}</Text>
                <Text style={[styles.rv, { color: c.textMuted }]}>{timeLabel("morning")} ›</Text>
              </Row>
              <Row>
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.set.evening")}</Text>
                <Toggle testID="cal-set-evening" label={t("cal.set.evening")} on={prefs.evening.on} onPress={() => void put({ evening: { on: !prefs.evening.on } }, (p) => ({ ...p, evening: { ...p.evening, on: !p.evening.on } }))} />
              </Row>
              <Row last testID="cal-set-evening-time" onPress={() => setPickFor("evening")}>
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.set.time")}</Text>
                <Text style={[styles.rv, { color: c.textMuted }]}>{timeLabel("evening")} ›</Text>
              </Row>
            </View>

            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.set.show")}</Text>
            <View style={[calCard(c, 16), styles.grp]}>
              {prefs.sources.length === 0 ? (
                <Row last>
                  <Text style={[styles.rs, { color: c.textMuted }]}>{t("cal.set.noSources")}</Text>
                </Row>
              ) : (
                prefs.sources.map((s, i) => (
                  <Row key={s.key} last={i === prefs.sources.length - 1}>
                    <View style={[styles.dot, { backgroundColor: c.cal[SRC_COLOR[s.key]] ?? c.textFaint }]} />
                    <Text style={[styles.rt, { color: c.text }]}>{s.label}</Text>
                    <Text style={[styles.rs, { color: c.textFaint }]} numberOfLines={1}>
                      {s.sub}
                    </Text>
                    <Toggle
                      testID={`cal-set-src-${s.key}`}
                      label={s.label}
                      on={s.on}
                      onPress={() => void put({ sources: { [s.key]: !s.on } }, (p) => ({ ...p, sources: p.sources.map((x) => (x.key === s.key ? { ...x, on: !x.on } : x)) }))}
                    />
                  </Row>
                ))
              )}
            </View>

            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.set.sync")}</Text>
            <View style={[calCard(c, 16), styles.grp]}>
              <Row testID="cal-set-google" onPress={() => router.push("/secretary/calendar/google")}>
                <View style={[styles.dot, { backgroundColor: c.cal.google }]} />
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.set.google")}</Text>
                <Text style={[styles.rv, { color: gStatus === "ACTIVE" ? c.sys.acc : gStatus === "NEEDS_RECONNECT" ? c.bad.fg : c.textMuted }]}>
                  {gStatus === "ACTIVE" ? t("cal.set.connected") : gStatus === "NEEDS_RECONNECT" ? t("cal.set.reconnect") : t("cal.set.connect")} ›
                </Text>
              </Row>
              <Row last testID="cal-set-iphone" onPress={() => setNote(t("cal.set.iphoneSoon"))}>
                <View style={[styles.dot, { backgroundColor: c.cal.device }]} />
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.set.iphone")}</Text>
                <Text style={[styles.rv, { color: c.textMuted }]}>{t("cal.set.connect")} ›</Text>
              </Row>
            </View>
          </>
        )}
      </ScrollView>

      <Sheet testID="cal-set-pick" visible={!!pickFor} onClose={() => setPickFor(null)} top={380}>
        <Text style={[styles.pickH, { color: c.text }]}>{t("cal.set.pickTime")}</Text>
        <Text style={[styles.pickNow, { color: c.textMuted }]}>{pickFor ? minuteText(prefs?.[pickFor].minute ?? 0) : ""}</Text>
        <View style={styles.hours}>
          {HOURS.map((h) => {
            const cur = pickFor ? Math.floor((prefs?.[pickFor].minute ?? 0) / 60) : -1;
            return (
              <Pressable
                key={h}
                testID={`cal-set-hour-${h}`}
                accessibilityRole="button"
                onPress={() => {
                  if (!pickFor || !prefs) return;
                  const minute = h * 60 + ((prefs[pickFor].minute ?? 0) % 60);
                  setMinute(pickFor, minute);
                }}
                style={[styles.hChip, { backgroundColor: cur === h ? c.accent : c.chip.bg }]}
              >
                <Text style={[styles.hChipT, { color: cur === h ? c.onAccent : c.chip.fg }]}>{String(h).padStart(2, "0")}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.mins}>
          {MINUTES.map((m) => {
            const cur = pickFor ? (prefs?.[pickFor].minute ?? 0) % 60 : -1;
            return (
              <Pressable
                key={m}
                testID={`cal-set-min-${m}`}
                accessibilityRole="button"
                onPress={() => {
                  if (!pickFor || !prefs) return;
                  const minute = Math.floor(prefs[pickFor].minute / 60) * 60 + m;
                  setMinute(pickFor, minute);
                }}
                style={[styles.mChip, { backgroundColor: cur === m ? c.accent : c.chip.bg }]}
              >
                <Text style={[styles.hChipT, { color: cur === m ? c.onAccent : c.chip.fg }]}>:{String(m).padStart(2, "0")}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable testID="cal-set-pick-done" accessibilityRole="button" onPress={() => setPickFor(null)} style={[styles.done, { backgroundColor: c.accent }]}>
          <Text style={[styles.doneT, { color: c.onAccent }]}>{t("cal.add.done")}</Text>
        </Pressable>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 12 },
  center: { flex: 1, alignItems: "center" },
  side: { width: 44 },
  title: { fontSize: 17, fontWeight: "800" },
  tsub: { fontSize: 12.5, marginTop: 1 },
  page: { paddingHorizontal: 18 },
  note: { fontSize: 12.5, marginTop: 10, marginHorizontal: 4 },
  sect: { fontSize: 12, marginTop: 16, marginBottom: 6, marginHorizontal: 4 },
  grp: { overflow: "hidden" },
  r: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, minHeight: 50 },
  rt: { fontSize: 14 },
  rs: { fontSize: 11.5, flexShrink: 1 },
  rv: { marginLeft: "auto", fontSize: 13.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tg: { width: 42, height: 25, borderRadius: 13, marginLeft: "auto", justifyContent: "center", paddingHorizontal: 2 },
  knob: { width: 21, height: 21, borderRadius: 11 },
  knobOn: { alignSelf: "flex-end" },
  pickH: { fontSize: 18, fontWeight: "800" },
  pickNow: { fontSize: 14, marginTop: 2 },
  hours: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  hChip: { width: 46, paddingVertical: 8, borderRadius: 12, alignItems: "center" },
  hChipT: { fontSize: 13.5 },
  mins: { flexDirection: "row", gap: 6, marginTop: 12 },
  mChip: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center" },
  done: { marginTop: 16, borderRadius: 16, paddingVertical: 13, alignItems: "center" },
  doneT: { fontSize: 15, fontWeight: "700" },
});
