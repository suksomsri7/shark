// ปฏิทินเลขา (CAL2.1–2.4 · แบบ cal-1.png จอ 3 วัน · จอ 4 เดือน · cal-3.png จอ 10 พรุ่งนี้)
//   แถบบน zone="calendar" · หัว: วันนี้/พรุ่งนี้/เมื่อวาน/วันที่ + เดือนปี พ.ศ. (หรือวันที่ย่อ) · ⚙ = ตั้งค่าปฏิทิน (จอ 8) · Segment วัน/เดือน/เตือนฉัน
//   วัน (CAL2.2): แถบสัปดาห์ (จุด = GET calendar/month) · กลุ่ม "ทั้งวัน"/"ตามเวลา" · AgendaRow (แถบสีระบบ · ป้าย · วงกลมติ๊ก) ·
//     แตะ = deepLink (web → หน้าระบบ WebView ?open · app → router.push) · ติ๊ก = items/[id]/done|reopen หรือ source-done (การ์ด/CRM) ·
//     ดึงลง = โหลดใหม่ + google/sync แบบไม่รอ · ว่าง = ข้อความว่าง · notes ของเซิร์ฟเวอร์ใต้หัว · การ์ดนัดชน (CAL2.12) ท้ายรายการ
//   เดือน (CAL2.3): ตาราง 7 คอลัมน์เริ่มอาทิตย์ · จุดสี ≤ 3 · ‹ › เปลี่ยนเดือน (ปี พ.ศ.) · แตะวัน = รายการของวันนั้นด้านล่าง
//   เตือนฉัน (CAL2.4): RemindList
//   params: ?day=YYYY-MM-DD (push/การ์ดวันนี้/ลิงก์ของเตือน) · ?item=<id> (เปิดแผ่นแก้ไขของเตือนนั้น · CAL2.6) · ?view=month|remind
// ข้อมูลผ่าน src/api/calendar.ts (dev/QC = fixture เมื่อเซิร์ฟเวอร์ยังไม่มีเส้น) · ไม่มีสีฝัง (ธีม c.cal)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Icon, LoadError, Loading, Segment } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { AgendaRow } from "@/src/components/calendar/AgendaRow";
import { WeekStrip } from "@/src/components/calendar/WeekStrip";
import { MonthGrid } from "@/src/components/calendar/MonthGrid";
import { calApi, deepLinkRoute, deviceAgenda, sortAgenda, useCalFixture, type AgendaItem, type AgendaResult, type ColorKey } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { scheduleZoneBadges } from "@/src/api/secretary";
import { addDays, addMonths, dayOfMs, isDay, monthName, monthYear, shortDate, weekDays, yearLabel, ymOf } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { spacing } from "@/src/theme/tokens";

type View3 = "day" | "month" | "remind";
type DayData = { day: string; res: AgendaResult; device: AgendaItem[] };

export default function CalendarScreen() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ day?: string; item?: string; view?: string }>();
  const fixture = useCalFixture();

  const [today, setToday] = useState(() => dayOfMs(Date.now()));
  const [view, setView] = useState<View3>(params.view === "month" || params.view === "remind" ? params.view : "day");
  const [day, setDay] = useState(() => (isDay(params.day) ? params.day : dayOfMs(Date.now())));
  const [ym, setYm] = useState(() => ymOf(isDay(params.day) ? params.day : dayOfMs(Date.now())));
  const [months, setMonths] = useState<Record<string, Record<string, ColorKey[]>>>({});
  const [data, setData] = useState<DayData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const dayRef = useRef(day);
  dayRef.current = day;

  // ลิงก์ใหม่ (?day=) ขณะจอเปิดอยู่ ⇒ ไปวันนั้น
  useEffect(() => {
    if (isDay(params.day)) {
      setDay(params.day);
      setYm(ymOf(params.day));
      setView((v) => (v === "remind" ? "day" : v));
    }
  }, [params.day]);

  const loadMonth = useCallback(async (m: string, force = false) => {
    if (!force && months[m]) return;
    try {
      const r = await calApi.month(m);
      setMonths((prev) => ({ ...prev, [m]: r.days ?? {} }));
    } catch {
      /* จุดหาย = ไม่บล็อกจอ */
    }
  }, [months]);

  const loadDay = useCallback(async (d: string) => {
    try {
      const res = await calApi.agenda(d, d);
      const device = await deviceAgenda(d, d).catch(() => [] as AgendaItem[]); // หลัง agenda: รู้แล้วว่าใช้ fixture หรือไม่ (dev/QC)
      if (dayRef.current !== d) return;
      setData({ day: d, res, device });
      setFailed(null);
    } catch (e) {
      if (dayRef.current !== d) return;
      setFailed(apiErrorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setToday(dayOfMs(Date.now()));
      void loadDay(day);
    }, [day, loadDay]),
  );
  useEffect(() => {
    const ms = new Set([ymOf(day), ...weekDays(day).map(ymOf), ym]);
    ms.forEach((m) => void loadMonth(m));
  }, [day, ym, loadMonth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    void calApi.googleSync().catch(() => {});
    await Promise.all([loadDay(day), loadMonth(ymOf(day), true), view === "month" && ym !== ymOf(day) ? loadMonth(ym, true) : null]);
    setRefreshing(false);
  }, [day, ym, view, loadDay, loadMonth]);

  const pick = (d: string) => {
    if (d === day) return;
    setDay(d);
    setData((prev) => (prev?.day === d ? prev : null));
  };

  const items = useMemo(() => (data && data.day === day ? sortAgenda([...data.res.items, ...data.device]) : null), [data, day]);
  const allDay = (items ?? []).filter((i) => i.allDay);
  const timed = (items ?? []).filter((i) => !i.allDay);
  const dotsOf = (d: string) => (months[ymOf(d)]?.[d] ?? []).length > 0 || (d === day && !!items && items.length > 0);

  const open = (it: AgendaItem) => {
    const r = deepLinkRoute(it.deepLink, String(Date.now()));
    if (!r) return;
    if (r.pathname === "/secretary/calendar") {
      const d = r.params?.day;
      if (isDay(d)) pick(d);
      if (r.params?.item) router.setParams({ item: r.params.item, day: d ?? day });
      return;
    }
    if (r.pathname === "/") router.navigate({ pathname: "/", params: r.params });
    else router.push({ pathname: r.pathname as never, params: r.params });
  };

  const setDone = (id: string, done: boolean) =>
    setData((prev) => (prev ? { ...prev, res: { ...prev.res, items: prev.res.items.map((x) => (x.id === id ? { ...x, done } : x)) } } : prev));

  const toggle = async (it: AgendaItem) => {
    if (busy.has(it.id)) return;
    const next = !it.done;
    setBusy((b) => new Set(b).add(it.id));
    setDone(it.id, next);
    setNote(null);
    try {
      if (it.source === "reminder" && it.ref?.itemId) {
        if (next) await calApi.done(it.ref.itemId, it.ref.occ);
        else await calApi.reopen(it.ref.itemId);
      } else if ((it.source === "kanban" || it.source === "crm") && next) {
        const id = it.source === "kanban" ? it.ref?.cardId : it.ref?.activityId;
        if (!id) throw new Error("no id");
        await calApi.sourceDone(it.source, id);
      } else {
        setDone(it.id, it.done); // ติ๊กออกของการ์ด/CRM ไม่รองรับในปฏิทิน (สัญญา §4.3)
        return;
      }
      scheduleZoneBadges();
      void loadMonth(ymOf(day), true);
    } catch (e) {
      setDone(it.id, it.done);
      setNote(apiErrorText(e));
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(it.id);
        return n;
      });
    }
  };

  // หัวจอ
  const rel = day === today ? "today" : day === addDays(today, 1) ? "tomorrow" : day === addDays(today, -1) ? "yesterday" : null;
  const title = view === "month" ? monthName(ym, lang) : view === "remind" ? t("cal.seg.remind") : rel ? t(`cal.title.${rel}`) : shortDate(day, lang);
  const right = view === "day" ? (rel === "today" || !rel ? monthYear(ymOf(day), lang) : shortDate(day, lang)) : null;

  const list = (rows: AgendaItem[], prefix: string, compact = false) =>
    rows.map((it) => (
      <AgendaRow key={it.id} item={it} testID={`${prefix}-${it.id}`} compact={compact} busy={busy.has(it.id)} onOpen={open} onToggle={(x) => void toggle(x)} />
    ));

  return (
    <AiryScreen testID="cal-screen">
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: spacing.xxl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
      >
        <SecTopBar zone="calendar" center="none" />
        <View style={styles.hdr}>
          <Text testID="cal-title" style={[styles.h, { color: c.text }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.hr}>
            {view === "month" ? (
              <View style={styles.yr}>
                <Pressable testID="cal-month-prev" accessibilityRole="button" accessibilityLabel={t("cal.prevMonth")} hitSlop={8} onPress={() => setYm((m) => addMonths(m, -1))}>
                  <Text style={[styles.hs, { color: c.textMuted }]}>‹</Text>
                </Pressable>
                <Text style={[styles.hs, { color: c.textMuted }]}>{yearLabel(ym, lang)}</Text>
                <Pressable testID="cal-month-next" accessibilityRole="button" accessibilityLabel={t("cal.nextMonth")} hitSlop={8} onPress={() => setYm((m) => addMonths(m, 1))}>
                  <Text style={[styles.hs, { color: c.textMuted }]}>›</Text>
                </Pressable>
              </View>
            ) : right ? (
              <Text style={[styles.hs, { color: c.textMuted }]}>{right}</Text>
            ) : null}
            <Pressable testID="cal-settings" accessibilityRole="button" accessibilityLabel={t("cal.settings")} hitSlop={6} onPress={() => router.push("/secretary/calendar/settings")} style={styles.gear}>
              <Icon name="settings" size={16} color={c.textMuted} />
            </Pressable>
          </View>
        </View>
        <Segment
          testID="cal-seg"
          size="sm"
          value={view}
          onChange={(k) => {
            const v = k as View3;
            setView(v);
            if (v === "month") setYm(ymOf(day));
          }}
          options={[
            { key: "day", label: t("cal.seg.day") },
            { key: "month", label: t("cal.seg.month") },
            { key: "remind", label: t("cal.seg.remind") },
          ]}
        />
        {fixture && __DEV__ ? <Text style={[styles.note, { color: c.warn.fg }]}>{t("cal.sample")}</Text> : null}
        {note ? (
          <Text testID="cal-note" style={[styles.note, { color: c.bad.fg }]}>
            {note}
          </Text>
        ) : null}

        {view === "day" ? (
          <>
            <WeekStrip testID="cal-week" day={day} hasDots={dotsOf} onPick={pick} />
            {data?.day === day && data.res.notes.length ? (
              <View style={styles.notes}>
                {data.res.notes.map((n, i) => (
                  <Text key={`${n.code}${i}`} style={[styles.noteT, { color: c.textMuted }]}>
                    {n.text}
                  </Text>
                ))}
              </View>
            ) : null}
            {items === null ? (
              failed ? <LoadError testID="cal-error" message={failed} onRetry={() => void loadDay(day)} /> : <Loading testID="cal-loading" />
            ) : items.length === 0 ? (
              <View testID="cal-empty" style={styles.empty}>
                <Icon name="calendar" size={22} color={c.textFaint} />
                <Text style={[styles.emptyT, { color: c.textMuted }]}>{t("cal.empty")}</Text>
                <Text style={[styles.emptyS, { color: c.textFaint }]}>{t("cal.emptySub")}</Text>
              </View>
            ) : (
              <View testID="cal-day-list">
                {allDay.length ? <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.sect.allDay")}</Text> : null}
                {list(allDay, "cal-row")}
                {timed.length ? <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.sect.timed")}</Text> : null}
                {list(timed, "cal-row")}
              </View>
            )}
          </>
        ) : view === "month" ? (
          <>
            <MonthGrid
              testID="cal-month"
              ym={ym}
              selected={day}
              today={today}
              dots={months[ym] ?? {}}
              onPick={pick}
            />
            {ymOf(day) === ym ? (
              <View testID="cal-month-list">
                <Text style={[styles.sect, { color: c.textFaint }]}>{t("cal.dayCount", { date: shortDate(day, lang), n: items?.length ?? 0 })}</Text>
                {items === null ? (
                  failed ? <LoadError testID="cal-error" message={failed} onRetry={() => void loadDay(day)} /> : <Loading testID="cal-loading" />
                ) : items.length === 0 ? (
                  <Text testID="cal-empty" style={[styles.emptyS, styles.monthEmpty, { color: c.textFaint }]}>
                    {t("cal.empty")}
                  </Text>
                ) : (
                  list(items, "cal-mrow", true)
                )}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 14 },
  hdr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 14, paddingHorizontal: 2 },
  h: { fontSize: 22, fontWeight: "800", flexShrink: 1 },
  hr: { flexDirection: "row", alignItems: "center", gap: 8 },
  hs: { fontSize: 13 },
  yr: { flexDirection: "row", alignItems: "center", gap: 6 },
  gear: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  note: { fontSize: 12.5, marginTop: 8, marginHorizontal: 4 },
  notes: { marginTop: 8, gap: 2 },
  noteT: { fontSize: 12, marginHorizontal: 4 },
  sect: { fontSize: 12, marginTop: 14, marginHorizontal: 4, letterSpacing: 0.3 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 36 },
  emptyT: { fontSize: 14, fontWeight: "600" },
  emptyS: { fontSize: 12.5, textAlign: "center" },
  monthEmpty: { paddingVertical: 18 },
});
