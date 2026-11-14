// การ์ดปฏิทินในห้องเลขา (B1 ของ cal-review-b · สัญญา §15.2 · ต่อจาก CAL2.7) — เลขาไม่ทวนรายการส่วนตัวในข้อความแล้ว
//   GET rooms/[id].calendarCards = การ์ดของ "ผู้ดู" เท่านั้น (คนอื่นในห้อง/เจ้าของที่ดูห้องพนักงาน = ไม่ได้การ์ด ⇒ ไม่เห็นอะไร)
//   AGENDA: แอปดึง GET calendar/agenda?from=fromDay&to=toDay ของผู้ดูเอง → แถวแบบจอ 3 (ไม่มีวงกลมติ๊กในห้อง) + "เปิดในปฏิทิน ›" → /secretary/calendar?day=fromDay
//   LIST: GET calendar/items?tab=today + tab=upcoming → แถวแบบแท็บเตือนฉัน (แตะ = แผ่นแก้ไข)
//   ป้าย "เห็นเฉพาะคุณ" · แสดง ≤ 8 แถว + "และอีก N รายการ" · โหลดใหม่เมื่อ calChanged() · testID: cal-card-<id>[-open|-row-<n>]
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { calApi, deepLinkRoute, deviceAgenda, onCalChanged, sortAgenda, type AgendaItem, type CalItemDto } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { dateNum, dayOfIso, dayOfMs, hhmm, monthName, shortDate, ymOf } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { AgendaRow } from "./AgendaRow";
import { useCalSheet } from "./AddCalSheet";
import { repeatText } from "./RemindList";
import { calCard } from "./style";

export type RoomCalCardDto = { id: string; kind: "AGENDA" | "LIST"; fromDay: string; toDay: string; createdAt: string };
const MAX_ROWS = 8;

function rangeText(from: string, to: string, lang: "th" | "en"): string {
  if (!to || to === from) return shortDate(from, lang);
  if (ymOf(from) === ymOf(to)) return `${dateNum(from)}–${dateNum(to)} ${lang === "en" ? monthName(ymOf(to), lang).slice(0, 3) : shortDate(to, lang).split(" ").pop()}`;
  return `${shortDate(from, lang)} – ${shortDate(to, lang)}`;
}

export function RoomCalCard({ card }: { card: RoomCalCardDto }) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const sheet = useCalSheet();
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);
  const [list, setList] = useState<CalItemDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = `cal-card-${card.id}`;

  const load = useCallback(async () => {
    try {
      if (card.kind === "AGENDA") {
        const r = await calApi.agenda(card.fromDay, card.toDay || card.fromDay);
        // CAL2.11: นัดในเครื่องของผู้ดู (อ่านจากเครื่องตอนวาด · ไม่ถึงเซิร์ฟเวอร์)
        const dev = await deviceAgenda(card.fromDay, card.toDay || card.fromDay).catch(() => [] as AgendaItem[]);
        setAgenda(sortAgenda([...r.items, ...dev]).map((x) => ({ ...x, checkable: false })));
      } else {
        const [a, b] = await Promise.all([calApi.items("today", 20), calApi.items("upcoming", 20)]);
        setList([...(a.items ?? []), ...(b.items ?? [])]);
      }
      setErr(null);
    } catch (e) {
      setErr(apiErrorText(e));
    }
  }, [card.kind, card.fromDay, card.toDay]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => onCalChanged(() => void load()), [load]);

  const open = (it: AgendaItem) => {
    const r = deepLinkRoute(it.deepLink, String(Date.now()));
    if (!r) return;
    if (r.pathname === "/") router.navigate({ pathname: "/", params: r.params });
    else router.push({ pathname: r.pathname as never, params: r.params });
  };
  const multiDay = card.toDay && card.toDay !== card.fromDay;
  const today = dayOfMs(Date.now());
  const rows = card.kind === "AGENDA" ? agenda : list;
  const shown = (rows ?? []).slice(0, MAX_ROWS);
  const more = (rows?.length ?? 0) - shown.length;

  return (
    <View testID={id} style={[calCard(c, 20), styles.card]}>
      <View style={styles.top}>
        <Icon name={card.kind === "AGENDA" ? "calendar" : "bell"} size={15} color={c.textMuted} />
        <Text style={[styles.topT, { color: c.textMuted }]} numberOfLines={1}>
          {card.kind === "AGENDA" ? t("cal.room.agenda", { range: rangeText(card.fromDay, card.toDay, lang) }) : t("cal.room.list")}
        </Text>
        <View style={[styles.priv, { backgroundColor: c.chip.bg }]}>
          <Icon name="lock" size={10} color={c.textMuted} />
          <Text style={[styles.privT, { color: c.textMuted }]}>{t("cal.room.private")}</Text>
        </View>
      </View>
      {err ? (
        <Text testID={`${id}-error`} style={[styles.empty, { color: c.bad.fg }]}>
          {err}
        </Text>
      ) : rows === null ? (
        <Text style={[styles.empty, { color: c.textFaint }]}>{t("sec.state.loading")}</Text>
      ) : rows.length === 0 ? (
        <Text testID={`${id}-empty`} style={[styles.empty, { color: c.textFaint }]}>
          {t("cal.room.empty")}
        </Text>
      ) : card.kind === "AGENDA" ? (
        (shown as AgendaItem[]).map((it, i) => {
          const d = dayOfIso(it.startAt);
          const prev = i > 0 ? dayOfIso((shown as AgendaItem[])[i - 1].startAt) : null;
          return (
            <View key={it.id}>
              {multiDay && d !== prev ? <Text style={[styles.day, { color: c.textFaint }]}>{shortDate(d, lang)}</Text> : null}
              <AgendaRow item={it} testID={`${id}-row-${i}`} onOpen={open} />
            </View>
          );
        })
      ) : (
        (shown as CalItemDto[]).map((it, i) => {
          const ev = it.kind === "EVENT";
          const col = ev ? c.cal.personal : c.cal.remind;
          const d = dayOfIso(it.occursAt);
          return (
            <Pressable key={it.id} testID={`${id}-row-${i}`} accessibilityRole="button" onPress={() => sheet?.openEdit(it)} style={[styles.lrow, { borderTopColor: c.divider }]}>
              <View style={[styles.bar, { backgroundColor: col }]} />
              <View style={styles.tm}>
                <Text style={[styles.tmT, { color: c.text }]}>{it.allDay ? t("cal.allDay") : hhmm(it.occursAt)}</Text>
                {d !== today ? <Text style={[styles.tmS, { color: c.textFaint }]}>{shortDate(d, lang)}</Text> : null}
              </View>
              <View style={styles.x}>
                <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                  {it.title}
                </Text>
                {it.status === "DRAFT" || it.repeat !== "NONE" || it.link ? (
                  <Text style={[styles.sub, { color: it.status === "DRAFT" ? c.warn.fg : c.textMuted }]} numberOfLines={1}>
                    {it.status === "DRAFT" ? t("cal.rem.draft") : [it.repeat !== "NONE" ? repeatText(it, t, lang) : "", it.link?.label ?? ""].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.tag, { backgroundColor: `${col}${c.calTagAlpha}` }]}>
                <Text style={[styles.tagT, { color: col }]}>{ev ? t("cal.rc.event") : t("cal.rc.remind")}</Text>
              </View>
            </Pressable>
          );
        })
      )}
      {more > 0 ? <Text style={[styles.more, { color: c.textMuted }]}>{t("cal.room.more", { n: more })}</Text> : null}
      {card.kind === "AGENDA" ? (
        <Pressable testID={`${id}-open`} accessibilityRole="link" hitSlop={6} onPress={() => router.navigate({ pathname: "/secretary/calendar", params: { day: card.fromDay } })}>
          <Text style={[styles.open, { color: c.cal.booking }]}>{t("cal.room.open")}</Text>
        </Pressable>
      ) : (
        <Pressable testID={`${id}-open`} accessibilityRole="link" hitSlop={6} onPress={() => router.navigate({ pathname: "/secretary/calendar", params: { view: "remind" } })}>
          <Text style={[styles.open, { color: c.cal.booking }]}>{t("cal.room.open")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginTop: 10, maxWidth: 340 },
  top: { flexDirection: "row", alignItems: "center", gap: 7 },
  topT: { fontSize: 12.5, flex: 1 },
  priv: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  privT: { fontSize: 10.5 },
  empty: { fontSize: 13, marginTop: 10 },
  day: { fontSize: 11.5, marginTop: 10, marginHorizontal: 2 },
  more: { fontSize: 12.5, marginTop: 8 },
  open: { marginTop: 10, fontSize: 13, fontWeight: "700" },
  lrow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  bar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  tm: { width: 50 },
  tmT: { fontSize: 12.5, fontWeight: "700" },
  tmS: { fontSize: 10.5, marginTop: 1 },
  x: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontWeight: "700", lineHeight: 18 },
  sub: { fontSize: 11.5, marginTop: 1 },
  tag: { borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6 },
  tagT: { fontSize: 10, fontWeight: "700" },
});
