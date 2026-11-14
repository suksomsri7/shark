// การ์ดเตือนในห้องเลขา (CAL2.7 · แบบ cal-2.png จอ 5 · .rcard/.ai/.bt ใน gen.py · สัญญา §9.3)
//   ปกติ: 🔔 + ชื่อเรื่อง + ป้าย (เตือนฉัน/นัดส่วนตัว) · แถว "เมื่อไหร่" (อ. 17 พ.ย. 15:00 · ทำซ้ำ = "ทุกวันจันทร์ 09:00") · แถว "ผูกกับ" (link.label)
//     ปุ่ม แก้ไข (AddCalSheet โหมดแก้ → PATCH) · ยกเลิก (ถามยืนยัน → DELETE) · CANCELLED = การ์ดจาง "ยกเลิกแล้ว" · DONE = "เสร็จแล้ว"
//   DRAFT (เตือนประจำที่เลขาสร้างจากแชท · R-CAL-28): ฟองแบบข้อความเลขา "ตั้งเป็น**เตือนประจำ** <กติกา> ใช่ไหมครับ" + ใช่ ตั้งเลย (POST confirm) / แก้เวลา
//   เฉพาะเจ้าของเตือน (เซิร์ฟเวอร์ส่ง reminders ของผู้เรียกเท่านั้น · R-CAL-20) · testID: cal-rc-<id>[-edit|-cancel|-confirm|-retime]
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import type { CalItemDto } from "@/src/api/calendar";
import { dayOfIso, hhmm, shortDate } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { repeatText } from "./RemindList";
import { calCard } from "./style";

export function reminderWhen(it: CalItemDto, t: ReturnType<typeof useT>, lang: "th" | "en"): string {
  const time = it.allDay ? t("cal.allDay") : hhmm(it.startAt);
  if (it.repeat !== "NONE") return `${repeatText(it, t, lang)} ${time}`;
  return `${shortDate(dayOfIso(it.startAt), lang)} ${time}`;
}

export function ReminderCard({
  item,
  busy = false,
  onEdit,
  onCancel,
  onConfirm,
}: {
  item: CalItemDto;
  busy?: boolean;
  onEdit: (it: CalItemDto) => void;
  onCancel: (it: CalItemDto) => void;
  onConfirm: (it: CalItemDto) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const id = `cal-rc-${item.id}`;
  const btn = (key: string, label: string, primary: boolean, onPress: () => void) => (
    <Pressable
      testID={`${id}-${key}`}
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={[styles.btn, { backgroundColor: primary ? c.accent : c.chip.bg }, busy && styles.busy]}
    >
      <Text style={[styles.btnT, { color: primary ? c.onAccent : c.text }]}>{label}</Text>
    </Pressable>
  );

  if (item.status === "DRAFT") {
    const rule = reminderWhen(item, t, lang);
    return (
      <View testID={id} style={styles.draft}>
        <View style={[calCard(c, 20), styles.ai]}>
          <Text style={[styles.aiT, { color: c.text }]}>
            {t("cal.rc.askPre")}
            <Text style={styles.bold}>{t("cal.rc.askBold")}</Text>
            {t("cal.rc.askPost", { rule })}
          </Text>
        </View>
        <View style={styles.row}>
          {btn("confirm", t("cal.rc.confirm"), true, () => onConfirm(item))}
          {btn("retime", t("cal.rc.editTime"), false, () => onEdit(item))}
        </View>
      </View>
    );
  }

  const ev = item.kind === "EVENT";
  const closed = item.status === "CANCELLED" || item.status === "DONE";
  return (
    <View testID={id} style={[calCard(c, 20), styles.card, item.status === "CANCELLED" && styles.faded]}>
      <View style={styles.top}>
        <View style={[styles.ic, { backgroundColor: `${ev ? c.cal.personal : c.cal.remind}${c.calTagAlpha}` }]}>
          <Icon name={ev ? "calendar" : "bell"} size={19} color={ev ? c.cal.personal : c.cal.remind} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{ev ? t("cal.rc.event") : t("cal.rc.remind")}</Text>
        </View>
      </View>
      <View style={[styles.kv, { borderTopColor: c.divider }]}>
        <Text style={[styles.k, { color: c.textMuted }]}>{t("cal.rc.when")}</Text>
        <Text style={[styles.v, { color: c.text }]}>{reminderWhen(item, t, lang)}</Text>
      </View>
      {item.link ? (
        <View style={[styles.kv, { borderTopColor: c.divider }]}>
          <Text style={[styles.k, { color: c.textMuted }]}>{t("cal.rc.link")}</Text>
          <Text style={[styles.v, { color: c.text }]} numberOfLines={2}>
            {item.link.label}
          </Text>
        </View>
      ) : null}
      {closed ? (
        <Text testID={`${id}-state`} style={[styles.state, { color: c.textMuted }]}>
          {item.status === "CANCELLED" ? t("cal.rc.cancelled") : t("cal.rc.done")}
        </Text>
      ) : (
        <View style={styles.row}>
          {btn("edit", t("cal.rc.edit"), false, () => onEdit(item))}
          {btn("cancel", t("cal.rc.cancel"), false, () => onCancel(item))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { padding: 14, maxWidth: 320, marginTop: 10 },
  faded: { opacity: 0.5 },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  ic: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12.5 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  k: { fontSize: 13 },
  v: { fontSize: 13, flexShrink: 1, textAlign: "right" },
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12 },
  btnT: { fontSize: 13.5, fontWeight: "700" },
  busy: { opacity: 0.6 },
  state: { fontSize: 13, fontWeight: "600", marginTop: 10, textAlign: "center" },
  draft: { maxWidth: 300, marginTop: 12 },
  ai: { paddingVertical: 11, paddingHorizontal: 15, borderBottomLeftRadius: 6 },
  aiT: { fontSize: 14.5, lineHeight: 22 },
  bold: { fontWeight: "700" },
});
