// ปฏิทินในเครื่อง (CAL2.11 · จอ 9 ฝั่ง iPhone · สัญญา §10.6) — เข้าจากแถว "ปฏิทิน iPhone" ในตั้งค่าปฏิทิน (จอ 8)
//   ยังไม่เชื่อม: คำอธิบายความเป็นส่วนตัว + "อนุญาตและเชื่อม" (requestCalendarPermissionsAsync · ข้อความ NSCalendarsFullAccessUsageDescription ภาษาไทยใน app.json)
//   ถูกปฏิเสธ: บอกทางเปิดในการตั้งค่าเครื่อง (Linking.openSettings)
//   เชื่อมแล้ว: เลือกปฏิทินที่แสดง (สวิตช์ต่อปฏิทิน) · ส่งนัดส่วนตัวไปปฏิทินเครื่อง + ปฏิทินปลายทาง (แก้ได้เท่านั้น) · เลิกเชื่อม (ยืนยัน · ไม่ลบอะไรในเครื่อง)
//   ทุกค่าเก็บในเครื่อง (src/lib/device-calendar.ts) — ไม่มีเส้นเซิร์ฟเวอร์
import { useCallback, useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Icon, IconBtn, Loading } from "@/src/components/airy";
import { calCard } from "@/src/components/calendar/style";
import { ConfirmSheet } from "@/src/components/calendar/ConfirmSheet";
import {
  connectDeviceCalendar,
  deviceCalSupported,
  devicePermission,
  disconnectDeviceCalendar,
  listDeviceCalendars,
  loadDevicePrefs,
  saveDevicePrefs,
  type DeviceCalendar,
  type DeviceCalPrefs,
} from "@/src/lib/device-calendar";
import { runDeviceExportSync } from "@/src/lib/device-sync";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

export default function CalDeviceScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<DeviceCalPrefs | null>(null);
  const [perm, setPerm] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [cals, setCals] = useState<DeviceCalendar[]>([]);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pickTarget, setPickTarget] = useState(false);

  const load = useCallback(async () => {
    const p = await loadDevicePrefs();
    const pm = await devicePermission();
    setPerm(pm);
    setCals(pm === "granted" ? await listDeviceCalendars() : []);
    setPrefs(p);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async (next: DeviceCalPrefs) => {
    setPrefs(next);
    await saveDevicePrefs(next);
    if (next.exportEvents) void runDeviceExportSync();
  };
  const connect = async () => {
    setBusy(true);
    const r = await connectDeviceCalendar();
    setBusy(false);
    if (r === "granted") void runDeviceExportSync();
    await load();
  };

  const Toggle = ({ on, onPress, testID, label }: { on: boolean; onPress: () => void; testID: string; label: string }) => (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} hitSlop={6} onPress={onPress} style={[styles.tg, { backgroundColor: on ? c.sys.chat : c.btnOff.bg }]}>
      <View style={[styles.knob, { backgroundColor: c.onSys }, on ? styles.knobOn : null]} />
    </Pressable>
  );
  const Row = ({ children, last }: { children: ReactNode; last?: boolean }) => <View style={[styles.r, !last && { borderBottomColor: c.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>{children}</View>;

  const linked = !!prefs?.enabled && perm === "granted";
  const writable = cals.filter((x) => x.writable);

  return (
    <AiryScreen testID="cal-device">
      <View style={styles.bar}>
        <IconBtn testID="cal-dev-back" icon="chevron-left" label={t("cal.back")} onPress={() => (router.canGoBack() ? router.back() : router.navigate("/secretary/calendar/settings"))} />
        <View style={styles.center}>
          <Text style={[styles.title, { color: c.text }]}>{t("cal.dev.title")}</Text>
        </View>
        <View style={styles.side} />
      </View>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {!prefs ? (
          <Loading testID="cal-dev-loading" />
        ) : !deviceCalSupported ? (
          <View testID="cal-dev-unsupported" style={[calCard(c, 16), styles.box]}>
            <Text style={[styles.boxT, { color: c.textDim }]}>{t("cal.dev.unsupported")}</Text>
          </View>
        ) : !linked ? (
          <>
            <View style={[calCard(c, 16), styles.none]}>
              <Icon name="smartphone" size={22} color={c.cal.device} />
              <Text style={[styles.noneB, { color: c.textMuted }]}>{t("cal.dev.intro")}</Text>
            </View>
            {perm === "denied" ? (
              <>
                <Text testID="cal-dev-denied" style={[styles.warn, { color: c.warn.fg }]}>
                  {t("cal.dev.denied")}
                </Text>
                <Pressable testID="cal-dev-settings" accessibilityRole="button" onPress={() => void Linking.openSettings()} style={[styles.cta, { backgroundColor: c.accent }]}>
                  <Text style={[styles.ctaT, { color: c.onAccent }]}>{t("cal.dev.openSettings")}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable testID="cal-dev-connect" accessibilityRole="button" disabled={busy} onPress={() => void connect()} style={[styles.cta, { backgroundColor: c.accent }, busy && styles.busy]}>
                <Text style={[styles.ctaT, { color: c.onAccent }]}>{t("cal.dev.connect")}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.dev.show")}</Text>
            <View style={[calCard(c, 16), styles.grp]}>
              {cals.length === 0 ? (
                <Row last>
                  <Text style={[styles.rs, { color: c.textMuted }]}>{t("cal.dev.none")}</Text>
                </Row>
              ) : (
                cals.map((x, i) => {
                  const on = prefs.calendarIds.includes(x.id);
                  return (
                    <Row key={x.id} last={i === cals.length - 1}>
                      <View style={[styles.dot, { backgroundColor: x.color || c.cal.device }]} />
                      <Text style={[styles.rt, { color: c.text }]} numberOfLines={1}>
                        {x.title}
                      </Text>
                      {x.source ? (
                        <Text style={[styles.rs, { color: c.textFaint }]} numberOfLines={1}>
                          {x.source}
                        </Text>
                      ) : null}
                      <Toggle
                        testID={`cal-dev-cal-${i}`}
                        label={x.title}
                        on={on}
                        onPress={() => void save({ ...prefs, calendarIds: on ? prefs.calendarIds.filter((y) => y !== x.id) : [...prefs.calendarIds, x.id] })}
                      />
                    </Row>
                  );
                })
              )}
            </View>

            <View style={[calCard(c, 16), styles.grp, styles.gap]}>
              <Row>
                <Text style={[styles.rt, styles.flex, { color: c.text }]}>{t("cal.dev.export")}</Text>
                <Toggle testID="cal-dev-export" label={t("cal.dev.export")} on={prefs.exportEvents} onPress={() => void save({ ...prefs, exportEvents: !prefs.exportEvents })} />
              </Row>
              <Pressable testID="cal-dev-target" accessibilityRole="button" onPress={() => setPickTarget((v) => !v)} style={styles.r}>
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.dev.target")}</Text>
                <Text style={[styles.rv, { color: c.textMuted }]}>{cals.find((x) => x.id === prefs.exportCalendarId)?.title ?? "—"} ›</Text>
              </Pressable>
              {pickTarget ? (
                <View style={styles.opts}>
                  {writable.map((x, i) => {
                    const on = x.id === prefs.exportCalendarId;
                    return (
                      <Pressable
                        key={x.id}
                        testID={`cal-dev-target-${i}`}
                        accessibilityRole="button"
                        onPress={() => {
                          setPickTarget(false);
                          void save({ ...prefs, exportCalendarId: x.id, map: x.id === prefs.exportCalendarId ? prefs.map : {} });
                        }}
                        style={[styles.opt, { backgroundColor: on ? c.accent : c.chip.bg }]}
                      >
                        <Text style={[styles.optT, { color: on ? c.onAccent : c.chip.fg }]}>{x.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.g.privacy")}</Text>
            <View style={[calCard(c, 16), styles.box]}>
              <Text style={[styles.boxT, { color: c.textDim }]}>{t("cal.dev.intro")}</Text>
            </View>
            <Pressable testID="cal-dev-disconnect" accessibilityRole="button" onPress={() => setAsk(true)} style={[calCard(c, 16), styles.disc]}>
              <Text style={[styles.discT, { color: c.danger.bg }]}>{t("cal.dev.disconnect")}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <ConfirmSheet
        testID="cal-dev-ask"
        visible={ask}
        title={t("cal.dev.disconnectAsk")}
        body={t("cal.dev.disconnectBody")}
        yes={t("cal.dev.disconnect")}
        no={t("cal.g.keep")}
        onClose={() => setAsk(false)}
        onYes={() => {
          setAsk(false);
          void disconnectDeviceCalendar().then(load);
        }}
      />
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 12 },
  center: { flex: 1, alignItems: "center" },
  side: { width: 44 },
  title: { fontSize: 17, fontWeight: "800" },
  page: { paddingHorizontal: 18 },
  flex: { flex: 1 },
  sect: { fontSize: 12, marginTop: 16, marginBottom: 6, marginHorizontal: 4 },
  grp: { overflow: "hidden" },
  gap: { marginTop: 12 },
  r: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, minHeight: 50 },
  rt: { fontSize: 14, flexShrink: 1 },
  rs: { fontSize: 11.5, flexShrink: 1 },
  rv: { marginLeft: "auto", fontSize: 13.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tg: { width: 42, height: 25, borderRadius: 13, marginLeft: "auto", justifyContent: "center", paddingHorizontal: 2 },
  knob: { width: 21, height: 21, borderRadius: 11 },
  knobOn: { alignSelf: "flex-end" },
  box: { paddingVertical: 12, paddingHorizontal: 14, marginTop: 4 },
  boxT: { fontSize: 13, lineHeight: 20 },
  none: { marginTop: 20, alignItems: "center", gap: 10, paddingVertical: 22, paddingHorizontal: 18 },
  noneB: { fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  warn: { fontSize: 13, marginTop: 14, marginHorizontal: 4, lineHeight: 19 },
  cta: { marginTop: 16, borderRadius: 16, paddingVertical: 13, alignItems: "center" },
  ctaT: { fontSize: 15, fontWeight: "700" },
  busy: { opacity: 0.6 },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
  opt: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 12 },
  optT: { fontSize: 12.5 },
  disc: { marginTop: 16, paddingVertical: 13, alignItems: "center" },
  discT: { fontSize: 15, fontWeight: "700" },
});
