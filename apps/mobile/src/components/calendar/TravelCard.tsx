// การ์ดเผื่อเวลาเดินทาง (Q8 · มติเจ้าของ 15 พ.ย. · แบบ /root/mockups/secretary-calendar/q8/q8.png จอ 1–2)
//   ข้อความหัว/รอง/ป้าย มาจาก TravelSuggestion (สัญญา §16.3 · เซิร์ฟเวอร์ หรือสำเนาในแอปสำหรับคู่ในเครื่อง)
//   ASK (ครั้งแรก · จอ 1): "ต้องเผื่อเวลาเดินทางไหมครับ?" · นัดก่อนหน้า … เลิก HH:MM → นัดนี้ HH:MM · "เห็นเฉพาะคุณ" ·
//     ชิป ไม่ต้อง/15/30/45 นาที/อื่น ๆ (± 5 นาที) · ☑ จำไว้สำหรับ <ประเภท> · ยืนยัน / ข้าม
//   REMEMBERED (ครั้งต่อไป · จอ 2 การ์ดเหลือง): "⏱ <ประเภท> — คุณเคยเผื่อ N นาที" · "<นัด> HH:MM · นัดก่อนหน้าเลิก HH:MM" ·
//     "ให้เตือนออกเดินทาง **HH:MM** เหมือนเดิมไหมครับ?" · ป้าย "จำจากครั้งก่อน" · ใช่ เตือนเลย / ไม่ต้อง / เปลี่ยน… (→ แบบ ASK เลือกค่าที่จำไว้)
//   🔴 ไม่มีการตั้งเตือนเงียบ — ทุกเส้นทางต้องกดยืนยัน (มติ Q8) · ผู้เรียกให้ onConfirm/onDismiss (เซิร์ฟเวอร์ หรือคู่ที่มีนัดในเครื่อง)
//   testID: cal-travel-<pairKey>[-min-<n>|-other|-minus|-plus|-remember|-confirm|-skip|-yes|-no|-change]
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import type { TravelSuggestion } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { hhmm } from "@/src/lib/cal-date";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { calCard } from "./style";


/** ตัวหนาเฉพาะเวลา HH:MM ในบรรทัด (แบบ q8 จอ 2 "ให้เตือนออกเดินทาง **14:15** …") */
function boldTime(line: string, time: string, color: string) {
  const i = time ? line.indexOf(time) : -1;
  if (i < 0) return line;
  return (
    <>
      {line.slice(0, i)}
      <Text style={[styles.bold, { color }]}>{time}</Text>
      {line.slice(i + time.length)}
    </>
  );
}

export function TravelCard({
  sug,
  onConfirm,
  onDismiss,
  testID,
}: {
  sug: TravelSuggestion;
  /** ยืนยัน: minutes 0 = ไม่ต้องเผื่อ · คืนข้อความผลสั้น ๆ ที่การ์ดแสดงแทน */
  onConfirm: (minutes: number, remember: boolean) => Promise<string>;
  onDismiss: () => Promise<void>;
  testID?: string;
}) {
  const { c } = useTheme();
  const t = useT();
  const id = testID ?? `cal-travel-${sug.pairKey}`;
  const remembered = sug.mode === "propose" && (sug.minutes ?? 0) > 0;
  const [asking, setAsking] = useState(!remembered);
  const [minutes, setMinutes] = useState<number>(sug.minutes ?? 45);
  const presets = sug.options?.length ? sug.options : [0, 15, 30, 45];
  const [subLine, askLine] = (sug.sub ?? "").split("\n");
  const [custom, setCustom] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      setResult(r || t("cal.tr.doneNone"));
    } catch (e) {
      setErr(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <View testID={`${id}-result`} style={[calCard(c, 18), styles.card]}>
        <Text style={[styles.p, { color: c.text }]}>{result}</Text>
      </View>
    );
  }

  const btn = (key: string, label: string, primary: boolean, onPress: () => void) => (
    <Pressable key={key} testID={`${id}-${key}`} accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.btn, { backgroundColor: primary ? c.accent : c.chip.bg }, busy && styles.busy]}>
      <Text style={[styles.btnT, { color: primary ? c.onAccent : c.text }]}>{label}</Text>
    </Pressable>
  );

  if (!asking) {
    return (
      <View testID={id} style={[styles.card, styles.remCard, { backgroundColor: c.warn.bg, borderColor: c.approval.border }]}>
        <View style={styles.row}>
          <Icon name="clock" size={15} color={c.text} />
          <Text style={[styles.h, styles.flex, { color: c.text }]}>{sug.title.replace(/^⏱\s*/, "")}</Text>
        </View>
        {subLine ? <Text style={[styles.p, { color: c.textMuted }]}>{subLine}</Text> : null}
        {askLine ? <Text style={[styles.p, { color: c.textMuted }]}>{boldTime(askLine, sug.leaveAt ? hhmm(sug.leaveAt) : "", c.text)}</Text> : null}
        <View style={[styles.tag, { backgroundColor: `${c.cal.booking}${c.calTagAlpha}` }]}>
          <Text style={[styles.tagT, { color: c.cal.booking }]}>{sug.badge ?? t("cal.tr.remTag")}</Text>
        </View>
        {err ? <Text style={[styles.err, { color: c.bad.fg }]}>{err}</Text> : null}
        <View style={styles.btns}>
          {btn("yes", t("cal.tr.yes"), true, () => void run(() => onConfirm(sug.minutes ?? 0, false)))}
          {btn("no", t("cal.tr.no"), false, () => void run(() => onDismiss()))}
          {btn("change", t("cal.tr.change"), false, () => setAsking(true))}
        </View>
      </View>
    );
  }

  const chip = (n: number) => {
    const on = !custom && minutes === n;
    return (
      <Pressable
        key={n}
        testID={`${id}-min-${n}`}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => {
          setCustom(false);
          setMinutes(n);
        }}
        style={[styles.chip, { backgroundColor: on ? c.accent : c.chip.bg }]}
      >
        <Text style={[styles.chipT, { color: on ? c.onAccent : c.text }, on && styles.bold]}>{n === 0 ? t("cal.tr.none") : t("cal.tr.min", { n })}</Text>
      </Pressable>
    );
  };
  return (
    <View testID={id} style={[calCard(c, 18), styles.card]}>
      <Text style={[styles.h, { color: c.text }]}>{sug.mode === "ask" ? sug.title : t("cal.tr.ask")}</Text>
      {sug.mode === "ask" && subLine ? <Text style={[styles.p, { color: c.textMuted }]}>{subLine}</Text> : null}
      <Text style={[styles.priv, { color: c.cal.booking }]}>{t("cal.tr.private")}</Text>
      <View style={styles.chips}>
        {presets.map(chip)}
        <Pressable
          testID={`${id}-other`}
          accessibilityRole="button"
          accessibilityState={{ selected: custom }}
          onPress={() => setCustom(true)}
          style={[styles.chip, { backgroundColor: custom ? c.accent : c.chip.bg }]}
        >
          <Text style={[styles.chipT, { color: custom ? c.onAccent : c.text }, custom && styles.bold]}>{custom ? t("cal.tr.min", { n: minutes }) : t("cal.tr.other")}</Text>
        </Pressable>
      </View>
      {custom ? (
        <View style={styles.stepper}>
          <Pressable testID={`${id}-minus`} accessibilityRole="button" onPress={() => setMinutes((m) => Math.max(5, m - 5))} style={[styles.step, { backgroundColor: c.chip.bg }]}>
            <Icon name="minus" size={14} color={c.text} />
          </Pressable>
          <Text style={[styles.stepT, { color: c.text }]}>{t("cal.tr.min", { n: minutes })}</Text>
          <Pressable testID={`${id}-plus`} accessibilityRole="button" onPress={() => setMinutes((m) => Math.min(240, m + 5))} style={[styles.step, { backgroundColor: c.chip.bg }]}>
            <Icon name="plus" size={14} color={c.text} />
          </Pressable>
        </View>
      ) : null}
      <Pressable testID={`${id}-remember`} accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember((v) => !v)} style={styles.chk}>
        <View style={[styles.box, remember ? { backgroundColor: c.accent } : { borderColor: c.btnOff.bg, borderWidth: 2 }]}>{remember ? <Icon name="check" size={13} color={c.onAccent} /> : null}</View>
        <Text style={[styles.chkT, { color: c.textDim }]}>
          {t("cal.tr.remember")} <Text style={[styles.bold, { color: c.text }]}>{sug.typeLabel}</Text>
        </Text>
      </Pressable>
      {err ? <Text style={[styles.err, { color: c.bad.fg }]}>{err}</Text> : null}
      <View style={styles.btns}>
        {btn("confirm", t("cal.tr.confirm"), true, () => void run(() => onConfirm(minutes, remember)))}
        {btn("skip", t("cal.tr.skip"), false, () => void run(() => onDismiss()))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 14, marginTop: 10 },
  remCard: { borderRadius: 18, borderWidth: 1.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  h: { fontSize: 14.5, fontWeight: "700" },
  p: { fontSize: 13, marginTop: 3, lineHeight: 19 },
  bold: { fontWeight: "700" },
  priv: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 14 },
  chipT: { fontSize: 13.5 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  step: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  stepT: { fontSize: 15, fontWeight: "700", minWidth: 64, textAlign: "center" },
  chk: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  box: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  chkT: { fontSize: 13 },
  tag: { alignSelf: "flex-start", borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8, marginTop: 6 },
  tagT: { fontSize: 11, fontWeight: "700" },
  err: { fontSize: 12.5, marginTop: 8 },
  btns: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 13 },
  btnT: { fontSize: 14, fontWeight: "700" },
  busy: { opacity: 0.6 },
});
