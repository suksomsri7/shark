// แผ่นยืนยันของจอปฏิทิน (CAL2.4 ลบเตือน · CAL2.7 ยกเลิกเตือนในห้อง · จอ 9 ยกเลิกการเชื่อม) — วางชั้นบนสุดของจอ (นอก ScrollView)
//   testID: <testID> · <testID>-no · <testID>-yes
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Sheet } from "@/src/components/airy";
import { useTheme } from "@/src/theme/index";

export function ConfirmSheet({
  testID,
  visible,
  title,
  body,
  yes,
  no,
  danger = true,
  onYes,
  onClose,
}: {
  testID: string;
  visible: boolean;
  title: string;
  body?: string;
  yes: string;
  no: string;
  danger?: boolean;
  onYes: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet testID={testID} visible={visible} onClose={onClose} top={500}>
      <Text style={[styles.t, { color: c.text }]}>{title}</Text>
      {body ? <Text style={[styles.b, { color: c.textMuted }]}>{body}</Text> : null}
      <View style={styles.row}>
        <Pressable testID={`${testID}-no`} accessibilityRole="button" onPress={onClose} style={[styles.btn, { backgroundColor: c.chip.bg }]}>
          <Text style={[styles.btnT, { color: c.text }]}>{no}</Text>
        </Pressable>
        <Pressable testID={`${testID}-yes`} accessibilityRole="button" onPress={onYes} style={[styles.btn, { backgroundColor: danger ? c.danger.bg : c.accent }]}>
          <Text style={[styles.btnT, { color: danger ? c.danger.fg : c.onAccent }]}>{yes}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  t: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
  b: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10, marginTop: 18 },
  btn: { flex: 1, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  btnT: { fontSize: 15, fontWeight: "700" },
});
