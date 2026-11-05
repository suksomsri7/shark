// ชิ้นส่วนร่วมของหน้าตั้งค่าเลขา (ใบ S2.7–S2.9 · แบบ B2–B8 sec-b.jpg)
//   SettingsTop  = แถบบนของหน้าย่อย: ปุ่มกลับ + ชื่อหน้า/บรรทัดรองกลาง (+ ปุ่มขวา) — แบบ B2–B8 ไม่มีไอคอน 3 โซน
//   SettingRow   = แถวกระจกแตะได้ (ชื่อ · บรรทัดรอง · ค่าด้านขวา · ลูกศร)
//   Toggle       = สวิตช์เปิด/ปิด (Pressable · role switch) · `locked` = แสดงเปิดจาง กดไม่ได้ ("ปิดไม่ได้")
//   OwnerOnlyBadge = ป้าย "เจ้าของเท่านั้น" ของหน้าที่บทบาทอื่นเห็นแบบอ่านอย่างเดียว
// สีทั้งหมดจากธีม (useTheme) · ทุกปุ่มมี testID
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Glass, Icon, IconBtn, TopBar, type IconName } from "@/src/components/airy";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** แถบบนของหน้าย่อยตั้งค่า — กลับ = ย้อน stack (ไม่มี = หน้าเมนูตั้งค่า) */
export function SettingsTop({ testID, title, subtitle, right }: { testID: string; title?: string; subtitle?: string; right?: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/secretary/settings"));
  return (
    <TopBar
      testID={testID}
      left={<IconBtn testID={`${testID}-back`} icon="chevron-left" label={t("sec.set.back")} onPress={back} />}
      title={title}
      subtitle={subtitle}
      right={right ?? <View style={styles.spacer} />}
    />
  );
}

export function SettingRow({
  testID,
  title,
  sub,
  value,
  icon,
  onPress,
  children,
}: {
  testID: string;
  title: string;
  sub?: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const { c } = useTheme();
  // S2.14: แถวแสดงค่าอย่างเดียว (ไม่มี onPress) = View ไม่ใช่ปุ่มที่ปิดอยู่ (โปรแกรมอ่านจอไม่ประกาศเป็นปุ่ม · ทะเบียนปุ่ม = กล่องแสดงผล)
  const Row = onPress ? Pressable : View;
  return (
    <Glass pad={false} radius={radii.sugg} style={styles.card}>
      <Row testID={testID} {...(onPress ? { onPress, accessibilityRole: "button" as const } : {})} style={styles.row}>
        {icon ? (
          <View style={[styles.ico, { backgroundColor: c.surface }]}>
            <Icon name={icon} size={18} />
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
            {title}
          </Text>
          {sub ? (
            <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={3}>
              {sub}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={[styles.value, { color: c.textMuted }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {children}
        {onPress ? <Icon name="chevron-right" size={18} color={c.iconDim} /> : null}
      </Row>
    </Glass>
  );
}

export function Toggle({ testID, value, onChange, disabled = false, locked = false, label }: { testID: string; value: boolean; onChange?: (v: boolean) => void; disabled?: boolean; locked?: boolean; label?: string }) {
  const { c } = useTheme();
  const off = disabled || locked;
  return (
    <Pressable
      testID={testID}
      onPress={() => !off && onChange?.(!value)}
      disabled={off}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: off }}
      hitSlop={6}
      style={[styles.track, { backgroundColor: value ? c.status.run : c.btnOff.bg }, off && styles.dim]}
    >
      <View style={[styles.knob, { backgroundColor: c.onSys }, value ? styles.knobOn : null]} />
    </Pressable>
  );
}

export function OwnerOnlyBadge({ testID = "sec-owner-only" }: { testID?: string }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: c.warn.bg }]}>
      <Icon name="lock" size={13} color={c.warn.fg} />
      <Text style={[styles.badgeT, { color: c.warn.fg }]}>{t("sec.set.ownerOnly")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: { width: 44 },
  card: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 56 },
  ico: { width: 38, height: 38, borderRadius: radii.k + 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  title: { fontSize: 15.5, fontWeight: "600", lineHeight: 21 },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: 3 },
  value: { fontSize: 13, maxWidth: 130 },
  track: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: "center" },
  knob: { width: 22, height: 22, borderRadius: 11 },
  knobOn: { alignSelf: "flex-end" },
  dim: { opacity: 0.55 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 10, borderRadius: radii.pill, marginTop: spacing.md },
  badgeT: { fontSize: 12.5, fontWeight: "600" },
});
