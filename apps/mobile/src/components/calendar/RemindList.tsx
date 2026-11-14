// แท็บ "เตือนฉัน" ของปฏิทิน (CAL2.4 · แผน §3 CAL2.4 · ไม่มีจอในภาพแบบ — ใช้หน้าตาแถวเดียวกับจอ 3)
//   ชิปย่อย วันนี้/ต่อไป/เสร็จแล้ว → GET calendar/items?tab= · แถว = CalItemDto (แถบสีเตือนฉัน/นัดส่วนตัว · เวลา · ชื่อ · บรรทัดรอง · ป้าย · วงกลมติ๊ก)
//   ปัดซ้าย = ลบ (ถามยืนยัน → DELETE items/[id] = ยกเลิก) · ปัดขวา = เสร็จ (POST items/[id]/done) — SwipeRow เดียวกับแชทลูกค้า (K1)
//   แตะแถว = onEdit (AddCalSheet โหมดแก้ · CAL2.6) · แท็บเสร็จแล้ว: วงกลม = ติ๊กออก (reopen · เฉพาะไม่ทำซ้ำ) · ไม่มีปัด
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useFocusEffect } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Chip, Icon, LoadError, Loading } from "@/src/components/airy";
import { SwipeRow } from "@/src/components/customers/SwipeRow";
import { calApi, type CalItemDto, type ItemsTab } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { scheduleZoneBadges } from "@/src/api/secretary";
import { dayOfIso, dayOfMs, hhmm, shortDate, wdShortOf } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { calCard } from "./style";

const TABS: ItemsTab[] = ["today", "upcoming", "done"];

/** ข้อความกติกาทำซ้ำ ("ทุกวันจันทร์" / "ทุกวัน" / "ทุกวันที่ 5") */
export function repeatText(it: Pick<CalItemDto, "repeat" | "repeatDays" | "startAt">, t: ReturnType<typeof useT>, lang: "th" | "en"): string {
  if (it.repeat === "NONE") return t("cal.repeat.NONE");
  if (it.repeat === "DAILY") return t("cal.repeat.DAILY");
  if (it.repeat === "MONTHLY") return t("cal.repeat.monthOn", { d: Number(dayOfIso(it.startAt).slice(8, 10)) });
  const days = it.repeatDays.length ? it.repeatDays : [new Date(Date.parse(it.startAt) + 7 * 3600_000).getUTCDay()];
  const names = days.map((d) => (lang === "th" ? TH_FULL[d] : wdShortOf(d, lang)));
  return t("cal.repeat.weekOn", { days: names.join(lang === "th" ? " " : ", ") });
}
const TH_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/** onAskDelete: จอวาดแผ่นยืนยัน (ชั้นบนสุดของจอ ไม่ใช่ใน ScrollView) แล้วเรียก run() เมื่อกดลบ */
export function RemindList({ onEdit, onAskDelete, reloadKey }: { onEdit: (it: CalItemDto) => void; onAskDelete: (it: CalItemDto, run: () => void) => void; reloadKey?: number }) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = useState<ItemsTab>("today");
  const [rows, setRows] = useState<CalItemDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const openRow = useRef<SwipeableMethods | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (tb: ItemsTab) => {
    try {
      const r = await calApi.items(tb, 50);
      if (tabRef.current !== tb) return;
      setRows(Array.isArray(r.items) ? r.items : []);
      setFailed(null);
    } catch (e) {
      if (tabRef.current === tb) setFailed(apiErrorText(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load(tab);
    }, [tab, load]),
  );
  useEffect(() => {
    if (reloadKey) void load(tabRef.current);
  }, [reloadKey, load]);

  const switchTab = (tb: ItemsTab) => {
    if (tb === tab) return;
    setRows(null);
    setFailed(null);
    setTab(tb);
  };

  const act = async (it: CalItemDto, kind: "done" | "reopen" | "delete") => {
    setNote(null);
    openRow.current?.close();
    const before = rows;
    if (kind !== "reopen" || tab === "done") setRows((r) => (r ? r.filter((x) => x.id !== it.id || (kind === "done" && it.repeat !== "NONE")) : r));
    try {
      if (kind === "done") await calApi.done(it.id, it.occursAt);
      else if (kind === "reopen") await calApi.reopen(it.id);
      else await calApi.remove(it.id);
      scheduleZoneBadges();
      void load(tab);
    } catch (e) {
      setRows(before);
      setNote(apiErrorText(e));
    }
  };

  const today = dayOfMs(Date.now());
  const sub = (it: CalItemDto): string => {
    if (it.status === "DRAFT") return t("cal.rem.draft");
    if (it.snoozeUntil && Date.parse(it.snoozeUntil) > Date.now()) return t("cal.rem.snoozed", { time: hhmm(it.snoozeUntil) });
    const parts: string[] = [];
    if (it.repeat !== "NONE") parts.push(repeatText(it, t, lang));
    if (it.link) parts.push(it.link.label);
    else if (it.note) parts.push(it.note.split("\n")[0]);
    return parts.join(" · ");
  };

  return (
    <View testID="cal-remind">
      <View style={styles.tabs}>
        {TABS.map((tb) => (
          <Chip key={tb} testID={`cal-rem-tab-${tb}`} label={t(`cal.rem.${tb}`)} active={tab === tb} onPress={() => switchTab(tb)} />
        ))}
      </View>
      {note ? (
        <Text testID="cal-rem-note" style={[styles.note, { color: c.bad.fg }]}>
          {note}
        </Text>
      ) : null}
      {rows === null ? (
        failed ? <LoadError testID="cal-rem-error" message={failed} onRetry={() => void load(tab)} /> : <Loading testID="cal-rem-loading" />
      ) : rows.length === 0 ? (
        <View testID="cal-rem-empty" style={styles.empty}>
          <Icon name="bell" size={22} color={c.textFaint} />
          <Text style={[styles.emptyT, { color: c.textMuted }]}>{t(`cal.rem.empty.${tab}`)}</Text>
        </View>
      ) : (
        rows.map((it) => {
          const ev = it.kind === "EVENT";
          const col = ev ? c.cal.personal : c.cal.remind;
          const at = tab === "done" && it.doneAt ? it.doneAt : it.occursAt;
          const d = dayOfIso(at);
          const s = sub(it);
          const done = it.status === "DONE";
          const body = (
            <Pressable
              testID={`cal-rem-${it.id}`}
              accessibilityRole="button"
              onPress={() => (it.status === "OPEN" || it.status === "DRAFT" ? onEdit(it) : undefined)}
              style={[calCard(c, 16), styles.card, done && styles.done]}
            >
              <View style={[styles.bar, { backgroundColor: col }]} />
              <View style={styles.tm}>
                <Text style={[styles.tmT, { color: c.text }]}>{it.allDay ? t("cal.allDay") : hhmm(at)}</Text>
                {d !== today ? <Text style={[styles.tmS, { color: c.textFaint }]}>{shortDate(d, lang)}</Text> : null}
              </View>
              <View style={styles.x}>
                <Text style={[styles.title, { color: c.text }, done && styles.strike]} numberOfLines={2}>
                  {it.title}
                </Text>
                {s ? (
                  <Text style={[styles.sub, { color: it.status === "DRAFT" ? c.warn.fg : c.textMuted }]} numberOfLines={2}>
                    {s}
                  </Text>
                ) : null}
                <View style={[styles.tag, { backgroundColor: `${col}${c.calTagAlpha}` }]}>
                  <Text style={[styles.tagT, { color: col }]}>{ev ? t("cal.rc.event") : t("cal.rc.remind")}</Text>
                </View>
              </View>
              {!ev && it.status !== "DRAFT" ? (
                <Pressable
                  testID={`cal-rem-${it.id}-check`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={done ? t("cal.checked") : t("cal.check")}
                  hitSlop={10}
                  onPress={() => void act(it, done ? "reopen" : "done")}
                  style={[styles.ck, { borderColor: done ? col : c.btnOff.bg }, done && { backgroundColor: col }]}
                >
                  {done ? <Icon name="check" size={13} color={c.onSys} /> : null}
                </Pressable>
              ) : null}
            </Pressable>
          );
          return (
            <SwipeRow
              key={it.id}
              testID={`cal-rem-swipe-${it.id}`}
              enabled={tab !== "done"}
              label={t("cal.rem.delete")}
              onDelete={() => onAskDelete(it, () => void act(it, "delete"))}
              onDone={ev ? undefined : () => void act(it, "done")}
              doneLabel={t("cal.rem.markDone")}
              onOpen={(m) => {
                if (openRow.current && openRow.current !== m) openRow.current.close();
                openRow.current = m;
              }}
              onClose={(m) => {
                if (openRow.current === m) openRow.current = null;
              }}
            >
              {body}
            </SwipeRow>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, marginTop: 14 },
  note: { fontSize: 12.5, marginTop: 8, marginHorizontal: 4 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 36 },
  emptyT: { fontSize: 14, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  done: { opacity: 0.55 },
  bar: { width: 4, borderRadius: 2 },
  tm: { width: 52, paddingTop: 1 },
  tmT: { fontSize: 12.5, fontWeight: "700" },
  tmS: { fontSize: 11, marginTop: 1, lineHeight: 15 },
  x: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  strike: { textDecorationLine: "line-through" },
  sub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  tag: { alignSelf: "flex-start", borderRadius: 7, paddingVertical: 2, paddingHorizontal: 7, marginTop: 5 },
  tagT: { fontSize: 10.5, fontWeight: "700" },
  ck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignSelf: "center", alignItems: "center", justifyContent: "center" },
});
