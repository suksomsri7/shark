// การ์ด "วันนี้" บนหน้าเลขา (CAL2.5 · แบบ cal-1.png จอ 2 · .brief ใน gen.py)
//   GET calendar/today → หัว "วันนี้ · จ. 16 พ.ย." + "N รายการ" · คำทัก · ≤ 4 บรรทัด (จุดสีระบบ + ข้อความ + ข้อความขวา) · "ดูทั้งหมดในปฏิทิน ›"
//   ซ่อนเมื่อ count = 0 / โหลดไม่ได้ / ข้ามเที่ยงคืน (ตั้งเวลาโหลดใหม่ตอนเที่ยงคืนไทย + ทุกครั้งที่จอ focus) · แตะ = จอปฏิทินวันนี้
//   นัดในเครื่อง (CAL2.11) จะเติมภายหลัง — ตอนนี้แสดงตามเซิร์ฟเวอร์อย่างเดียว
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { calApi, onCalChanged, type TodayRes } from "@/src/api/calendar";
import { useAuth } from "@/src/lib/auth-context";
import { dayOfMs, dayStartMs, addDays } from "@/src/lib/cal-date";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { calCard } from "./style";

export function TodayCard({ testID = "cal-today" }: { testID?: string }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { activeTenantId } = useAuth();
  const [res, setRes] = useState<TodayRes | null>(null);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    try {
      const r = await calApi.today();
      if (tenantRef.current === tenant) setRes(r);
    } catch {
      if (tenantRef.current === tenant) setRes(null);
    }
  }, [activeTenantId]);

  useEffect(() => setRes(null), [activeTenantId]);
  useEffect(() => onCalChanged(() => void load()), [load]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // เที่ยงคืนไทย ⇒ การ์ดของเมื่อวานหาย แล้วโหลดของวันใหม่
  useEffect(() => {
    const next = dayStartMs(addDays(dayOfMs(Date.now()), 1)) - Date.now() + 1000;
    const id = setTimeout(() => {
      setRes(null);
      void load();
    }, Math.max(1000, Math.min(next, 2_147_000_000)));
    return () => clearTimeout(id);
  }, [res, load]);

  if (!res || res.count <= 0 || res.day !== dayOfMs(Date.now()) || !res.lines?.length) return null;
  const go = () => router.navigate({ pathname: "/secretary/calendar", params: { day: res.day } });
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={go} style={[calCard(c, 22), styles.card]}>
      <View style={styles.top}>
        <Icon name="calendar" size={15} color={c.textMuted} />
        <Text style={[styles.topT, { color: c.textMuted }]}>{t("cal.card.title", { date: res.dateLabel })}</Text>
        <Text style={[styles.topR, { color: c.textMuted }]}>{t("cal.count", { n: res.count })}</Text>
      </View>
      <Text style={[styles.h, { color: c.text }]}>{res.greeting}</Text>
      <View style={styles.ul}>
        {res.lines.slice(0, 4).map((l, i) => (
          <View key={`${l.colorKey}${i}`} style={styles.li}>
            <View style={[styles.dot, { backgroundColor: c.cal[l.colorKey] ?? c.textFaint }]} />
            <Text style={[styles.liT, { color: c.text }]} numberOfLines={1}>
              {l.text}
            </Text>
            {l.rightText ? <Text style={[styles.liR, { color: c.textFaint }]}>{l.rightText}</Text> : null}
          </View>
        ))}
      </View>
      <Pressable testID={`${testID}-more`} accessibilityRole="link" onPress={go} hitSlop={6}>
        <Text style={[styles.more, { color: c.cal.booking }]}>{t("cal.card.more")}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, paddingVertical: 14, paddingHorizontal: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  topT: { fontSize: 12.5, flex: 1 },
  topR: { fontSize: 12.5 },
  h: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  ul: { marginTop: 8 },
  li: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liT: { fontSize: 13.5, flex: 1 },
  liR: { fontSize: 12 },
  more: { marginTop: 8, fontSize: 13, fontWeight: "700" },
});
