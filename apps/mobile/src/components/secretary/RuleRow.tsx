// แถวกฎอนุมัติ (แบบ B4 sec-b.jpg หน้า 4) — ชื่อ · คำอธิบาย · ค่าขวา (วงเงิน/"ปิดไม่ได้") · สวิตช์
//   `locked` = ข้อในทะเบียน ALWAYS_APPROVE (เงินออก · ลบ/ยกเลิก · ข้อมูลส่วนบุคคล) — เปิดเสมอ ปิดไม่ได้ (COMMON §C.4)
//   R-K3b: รุ่นแรกกฎ = เก็บ + แสดง + ใช้ในข้อความ "ทำไมต้องอนุมัติ" (ทุกข้อเสนอยังต้องอนุมัติ)
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Glass } from "@/src/components/airy";
import { useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";
import { Toggle } from "./SettingRow";

export function RuleRow({
  testID,
  rowId,
  title,
  sub,
  value,
  on,
  locked = false,
  readOnly = false,
  onChange,
  children,
  label,
}: {
  testID: string;
  /** รหัสแถว — testID ของแถว = `<testID>-<rowId>` · สวิตช์ = `<testID>-<rowId>-toggle` */
  rowId: string;
  title: string;
  sub: string;
  value?: string;
  on: boolean;
  locked?: boolean;
  readOnly?: boolean;
  onChange?: (v: boolean) => void;
  children?: ReactNode;
  label?: string;
}) {
  const { c } = useTheme();
  return (
    <Glass testID={testID} pad={false} radius={radii.sugg} style={styles.card}>
      <View testID={`${testID}-${rowId}`} style={styles.row}>
        <View style={styles.body}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{sub}</Text>
        </View>
        {value ? <Text style={[styles.value, { color: c.textMuted }]}>{value}</Text> : null}
        <Toggle testID={`${testID}-${rowId}-toggle`} value={on} locked={locked} disabled={readOnly} onChange={onChange} label={label ?? title} />
      </View>
      {children}
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  body: { flex: 1 },
  title: { fontSize: 15.5, fontWeight: "700", lineHeight: 21 },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: 3 },
  value: { fontSize: 13 },
});
