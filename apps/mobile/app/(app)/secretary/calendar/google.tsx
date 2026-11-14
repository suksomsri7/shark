// Google Calendar (จอ 9 · แบบ cal-3.png) — ส่วนที่ไม่ต้องใช้ native module (CAL2.9 นำทางมาที่นี่ · การ "เชื่อม" จริงด้วย google-signin = CAL2.10 รอ build)
//   ACTIVE / NEEDS_RECONNECT: หัว "Google Calendar" + email · ดึงเข้ามาแสดงในปฏิทิน SHARK (ปฏิทินของบัญชี + สวิตช์ import) ·
//     ส่งออกไปที่ Google (นัดส่วนตัว · เตือนฉัน · นัดลูกค้าที่ฉันรับ) + ไปที่ปฏิทิน · กล่องความเป็นส่วนตัว (M4) · ยกเลิกการเชื่อม (ยืนยัน → DELETE)
//   NONE: แจ้งว่ายังไม่ได้เชื่อม · ปุ่มเชื่อมมากับแอปรุ่นถัดไป (CAL2.10)
//   บันทึกทันทีที่สลับ (PUT calendar/google · ล้ม = คืนค่าเดิม)
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Icon, IconBtn, LoadError, Loading } from "@/src/components/airy";
import { calCard } from "@/src/components/calendar/style";
import { ConfirmSheet } from "@/src/components/calendar/ConfirmSheet";
import { calApi, calChanged, type GoogleLinkDto } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

type ExportKind = "EVENT" | "REMINDER" | "BOOKING";
const EXPORTS: { kind: ExportKind; label: "cal.g.exEvent" | "cal.g.exRemind" | "cal.g.exBooking" }[] = [
  { kind: "EVENT", label: "cal.g.exEvent" },
  { kind: "REMINDER", label: "cal.g.exRemind" },
  { kind: "BOOKING", label: "cal.g.exBooking" },
];

export default function CalGoogleScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [g, setG] = useState<GoogleLinkDto | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);

  const load = useCallback(async () => {
    try {
      setG(await calApi.google());
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

  const put = async (body: Parameters<typeof calApi.putGoogle>[0], optimistic: (x: GoogleLinkDto) => GoogleLinkDto) => {
    if (!g) return;
    const before = g;
    setG(optimistic(g));
    setNote(null);
    try {
      setG(await calApi.putGoogle(body));
      calChanged();
    } catch (e) {
      setG(before);
      setNote(apiErrorText(e));
    }
  };
  const disconnect = async () => {
    setAsk(false);
    try {
      await calApi.googleDisconnect();
      calChanged();
      void load();
    } catch (e) {
      setNote(apiErrorText(e));
    }
  };

  const Toggle = ({ on, onPress, testID, label }: { on: boolean; onPress: () => void; testID: string; label: string }) => (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} hitSlop={6} onPress={onPress} style={[styles.tg, { backgroundColor: on ? c.sys.chat : c.btnOff.bg }]}>
      <View style={[styles.knob, { backgroundColor: c.onSys }, on ? styles.knobOn : null]} />
    </Pressable>
  );
  const Row = ({ children, last }: { children: ReactNode; last?: boolean }) => <View style={[styles.r, !last && { borderBottomColor: c.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>{children}</View>;

  // บรรทัดรอง (จอ 9): primary = "ของฉัน" · ปฏิทินที่คนอื่นแชร์มา (accessRole ไม่ใช่ owner) = "แชร์มา" · วันหยุด/ของตัวเองอื่น = ว่าง
  const subOf = (x: NonNullable<GoogleLinkDto["calendars"]>[number]): string | null =>
    x.sub ?? (x.primary ? t("cal.g.mine") : x.accessRole && x.accessRole !== "owner" && !/holiday/i.test(x.id) ? t("cal.g.shared") : null);
  const linked = g && g.status !== "NONE";
  const cals = g?.calendars ?? [];
  const kinds = g?.exportKinds ?? [];

  return (
    <AiryScreen testID="cal-google">
      <View style={styles.bar}>
        <IconBtn testID="cal-g-back" icon="chevron-left" label={t("cal.back")} onPress={() => (router.canGoBack() ? router.back() : router.navigate("/secretary/calendar/settings"))} />
        <View style={styles.center}>
          <Text style={[styles.title, { color: c.text }]}>{t("cal.g.title")}</Text>
          {g?.email ? <Text style={[styles.tsub, { color: c.textMuted }]}>{g.email}</Text> : null}
        </View>
        <View style={styles.side} />
      </View>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {note ? (
          <Text testID="cal-g-note" style={[styles.note, { color: c.bad.fg }]}>
            {note}
          </Text>
        ) : null}
        {!g ? (
          failed ? <LoadError testID="cal-g-error" message={failed} onRetry={() => void load()} /> : <Loading testID="cal-g-loading" />
        ) : !linked ? (
          <View testID="cal-g-none" style={[calCard(c, 16), styles.none]}>
            <Icon name="calendar" size={22} color={c.cal.google} />
            <Text style={[styles.noneT, { color: c.text }]}>{t("cal.g.none")}</Text>
            <Text style={[styles.noneB, { color: c.textMuted }]}>{t("cal.g.noneBody")}</Text>
          </View>
        ) : (
          <>
            {g.status === "NEEDS_RECONNECT" ? (
              <View testID="cal-g-reconnect" style={[styles.warn, { backgroundColor: c.warn.bg }]}>
                <Icon name="alert-triangle" size={16} color={c.warn.fg} />
                <Text style={[styles.warnT, { color: c.warn.fg }]}>{g.lastError || t("cal.g.needReconnect")}</Text>
              </View>
            ) : null}
            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.g.import")}</Text>
            <View style={[calCard(c, 16), styles.grp]}>
              {cals.map((x, i) => (
                <Row key={x.id} last={i === cals.length - 1}>
                  <View style={[styles.dot, { backgroundColor: x.color || c.cal.google }]} />
                  <Text style={[styles.rt, { color: c.text }]}>{x.name}</Text>
                  {subOf(x) ? (
                    <Text style={[styles.rs, { color: c.textFaint }]} numberOfLines={1}>
                      {subOf(x)}
                    </Text>
                  ) : null}
                  <Toggle
                    testID={`cal-g-cal-${x.id}`}
                    label={x.name}
                    on={x.import}
                    onPress={() =>
                      void put({ calendars: [{ id: x.id, import: !x.import }] }, (s) => ({ ...s, calendars: (s.calendars ?? []).map((y) => (y.id === x.id ? { ...y, import: !y.import } : y)) }))
                    }
                  />
                </Row>
              ))}
            </View>

            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.g.export")}</Text>
            <View style={[calCard(c, 16), styles.grp]}>
              {EXPORTS.map((e) => {
                const on = kinds.includes(e.kind);
                const next = on ? kinds.filter((k) => k !== e.kind) : [...kinds, e.kind];
                return (
                  <Row key={e.kind}>
                    <Text style={[styles.rt, { color: c.text }]}>{t(e.label)}</Text>
                    <Toggle testID={`cal-g-ex-${e.kind}`} label={t(e.label)} on={on} onPress={() => void put({ exportKinds: next }, (s) => ({ ...s, exportKinds: next }))} />
                  </Row>
                );
              })}
              <Row last>
                <Text style={[styles.rt, { color: c.text }]}>{t("cal.g.target")}</Text>
                <Text style={[styles.rv, { color: c.textMuted }]}>{g.exportCalendarName ?? cals.find((x) => x.primary)?.name ?? ""} ›</Text>
              </Row>
            </View>

            <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.g.privacy")}</Text>
            <View style={[calCard(c, 16), styles.box]}>
              <Text style={[styles.boxT, { color: c.textDim }]}>{t("cal.g.privacyBody")}</Text>
            </View>

            <Pressable testID="cal-g-disconnect" accessibilityRole="button" onPress={() => setAsk(true)} style={[calCard(c, 16), styles.disc]}>
              <Text style={[styles.discT, { color: c.danger.bg }]}>{t("cal.g.disconnect")}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <ConfirmSheet
        testID="cal-g-ask"
        visible={ask}
        title={t("cal.g.disconnectAsk")}
        body={t("cal.g.disconnectBody")}
        yes={t("cal.g.disconnect")}
        no={t("cal.g.keep")}
        onClose={() => setAsk(false)}
        onYes={() => void disconnect()}
      />
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
  box: { paddingVertical: 12, paddingHorizontal: 14 },
  boxT: { fontSize: 13, lineHeight: 20 },
  disc: { marginTop: 16, paddingVertical: 13, alignItems: "center" },
  discT: { fontSize: 15, fontWeight: "700" },
  none: { marginTop: 20, alignItems: "center", gap: 8, paddingVertical: 24, paddingHorizontal: 18 },
  noneT: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  noneB: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  warn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
  warnT: { fontSize: 13, flex: 1 },
});
