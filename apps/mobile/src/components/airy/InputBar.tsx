// ช่องสั่งงาน .inp — ปุ่ม + · ช่องพิมพ์ · ปุ่มส่ง (ไม่มีปุ่มเสียง ตามมติ 16)
// กระจกสูง size.inputH มนเต็ม · ปุ่มส่งกลม size.send พื้น accent
// S2.3 (เพิ่ม prop เท่านั้น · ไม่ใส่ = เหมือนเดิม): sendTestID · sendDisabled (พื้น btnOff) · autoFocus
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { TextInput } from "@/src/components/ui/text";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size } from "@/src/theme/tokens";
import { Icon } from "./Icon";

export function InputBar({
  testID,
  placeholder,
  value,
  onChangeText,
  onSend,
  onPlus,
  style,
  sendTestID,
  sendDisabled = false,
  autoFocus,
}: {
  testID: string;
  placeholder: string;
  value?: string;
  onChangeText?: (v: string) => void;
  onSend?: () => void;
  onPlus?: () => void;
  style?: StyleProp<ViewStyle>;
  /** testID ของปุ่มส่ง (ปริยาย `<testID>-send`) */
  sendTestID?: string;
  /** ปุ่มส่งกดไม่ได้ (เช่น ช่องว่าง/กำลังส่ง) */
  sendDisabled?: boolean;
  autoFocus?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[glassStyle(c, radii.input), styles.bar, style]}>
      <Pressable testID={`${testID}-plus`} onPress={onPlus} accessibilityRole="button" style={styles.plus}>
        <Icon name="plus" />
      </Pressable>
      <TextInput
        autoFocus={autoFocus}
        testID={`${testID}-field`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.placeholder}
        style={[styles.field, { color: c.text }]}
        onSubmitEditing={sendDisabled ? undefined : onSend}
        returnKeyType="send"
      />
      <Pressable
        testID={sendTestID ?? `${testID}-send`}
        onPress={onSend}
        disabled={sendDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: sendDisabled }}
        style={[styles.send, sendDisabled ? { backgroundColor: c.btnOff.bg } : [{ backgroundColor: c.accent }, shadow(c.accentShadow)]]}
      >
        <Icon name="arrow-up" color={sendDisabled ? c.btnOff.fg : c.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: size.inputH, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 10 },
  plus: { width: 36, height: size.send, marginLeft: 6, alignItems: "center", justifyContent: "center" },
  field: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 0, outlineWidth: 0 },
  send: { width: size.send, height: size.send, borderRadius: size.send / 2, alignItems: "center", justifyContent: "center" },
});
