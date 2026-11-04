// การ์ดขั้นตอนของแผน (ใบ S2.4 · แบบ A3 sec-a.jpg หน้า 3 · .step) — กล่องสีระบบ + ข้อความขั้น + ท้าย ✓ เสร็จ / ● กำลังทำ / ⏸ รอ / ✕ ล้ม / – ข้าม (หลังขั้นที่ล้ม · S1.14)
// ใช้ในห้องงาน (ความคืบหน้าของแผน) และในการ์ดอนุมัติแผน (ApprovalCard)
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, SysBadge } from "@/src/components/airy";
import type { StepRow, StepStatus } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { type as T } from "@/src/theme/tokens";
import { sysColor, sysShortKey } from "./sys";

export function StepCard({ step, testID }: { step: StepRow; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} accessibilityLabel={step.status} style={[glassStyle(c, 18), styles.step]}>
      <SysBadge sys={sysColor(step.module)} label={t(sysShortKey(step.module))} solid />
      <Text style={[styles.x, { color: c.text }]}>{step.summary}</Text>
      <StepMark status={step.status} />
    </View>
  );
}

function StepMark({ status }: { status: StepStatus }) {
  const { c } = useTheme();
  if (status === "done") return <Icon name="check" size={16} color={c.status.run} />;
  if (status === "run") return <View style={[styles.run, { backgroundColor: c.status.wait }]} />;
  if (status === "fail") return <Icon name="x" size={16} color={c.bad.fg} />;
  if (status === "skip") return <Icon name="minus" size={15} color={c.textMuted} />;
  return <Icon name="pause" size={15} color={c.status.wait} />;
}

/** รายการขั้น — กรอบ `testID` · ทุกขั้นใช้ `stepTestID` เดียวกัน (สถานะอยู่ใน accessibilityLabel: done/run/wait) */
export function StepList({ steps, testID, stepTestID }: { steps: StepRow[]; testID: string; stepTestID: string }) {
  return (
    <View testID={testID}>
      {steps.map((s, i) => (
        <StepCard key={`${i}-${s.kind}`} step={s} testID={stepTestID} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6 },
  x: { flex: 1, minWidth: 0, fontSize: T.sub, lineHeight: 20 },
  run: { width: 10, height: 10, borderRadius: 5 },
});
