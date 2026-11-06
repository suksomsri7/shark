// ช่องสั่งงาน .inp — ปุ่ม + · ช่องพิมพ์ · ปุ่มส่ง (ไม่มีปุ่มเสียง ตามมติ 16)
// กระจกสูง size.inputH มนเต็ม · ปุ่มส่งกลม size.send พื้น accent
// S2.3 (เพิ่ม prop เท่านั้น · ไม่ใส่ = เหมือนเดิม): sendTestID · sendDisabled (พื้น btnOff) · autoFocus
// S2.18 (เพิ่ม prop เท่านั้น): plusTestID · plusDisabled · left (ปุ่มเสริมหลัง + เช่น สวิตช์บันทึกภายใน) · multiline · maxLength · inputStyle
// S2.14 รอบ 3 (R-S2.14o): `locked` = ไม่มีสิทธิ์ — แถบจาง · ไอคอนกุญแจแทนปุ่ม + · พิมพ์/ส่งไม่ได้ (ดูออกว่าล็อก ไม่ใช่แค่กดไม่ติด)
// S3a.6 (เพิ่ม prop เท่านั้น): right (ปุ่มเสริมหน้าปุ่มส่ง เช่น "แปลแล้วส่ง")
// S2.14 F1 (RESOLUTIONS §W): พื้นทึบ `solidBarStyle` (surface ของแถบ) แทนกระจกโปร่ง — ข้อความการ์ดใต้แถบไม่ทะลุ ทั้ง 2 ธีม
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { TextInput } from "@/src/components/ui/text";
import { shadow, solidBarStyle, useTheme } from "@/src/theme/index";
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
  plusTestID,
  plusDisabled = false,
  left,
  right,
  multiline = false,
  maxLength,
  inputStyle,
  locked = false,
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
  /** testID ของปุ่ม + (ปริยาย `<testID>-plus`) */
  plusTestID?: string;
  plusDisabled?: boolean;
  /** ชิ้นส่วนเสริมระหว่างปุ่ม + กับช่องพิมพ์ */
  left?: ReactNode;
  /** ชิ้นส่วนเสริมระหว่างช่องพิมพ์กับปุ่มส่ง */
  right?: ReactNode;
  multiline?: boolean;
  maxLength?: number;
  inputStyle?: StyleProp<TextStyle>;
  /** ล็อก (ไม่มีสิทธิ์): จาง + กุญแจ + พิมพ์/ส่งไม่ได้ */
  locked?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[solidBarStyle(c, radii.input), styles.bar, style, locked && styles.locked]} accessibilityState={{ disabled: locked }}>
      {locked ? (
        <View testID={`${testID}-locked`} style={styles.plus}>
          <Icon name="lock" size={18} color={c.iconDim} />
        </View>
      ) : (
        <Pressable testID={plusTestID ?? `${testID}-plus`} onPress={onPlus} disabled={plusDisabled} accessibilityRole="button" accessibilityState={{ disabled: plusDisabled }} style={[styles.plus, plusDisabled && styles.off]}>
          <Icon name="plus" />
        </Pressable>
      )}
      {left}
      <TextInput
        autoFocus={autoFocus}
        testID={`${testID}-field`}
        value={value}
        onChangeText={onChangeText}
        editable={!locked}
        placeholder={placeholder}
        placeholderTextColor={c.placeholder}
        style={[styles.field, { color: c.text }, inputStyle]}
        multiline={multiline}
        maxLength={maxLength}
        onSubmitEditing={sendDisabled || multiline ? undefined : onSend}
        returnKeyType="send"
      />
      {right}
      <Pressable
        testID={sendTestID ?? `${testID}-send`}
        onPress={onSend}
        disabled={sendDisabled || locked}
        accessibilityRole="button"
        accessibilityState={{ disabled: sendDisabled || locked }}
        style={[styles.send, sendDisabled || locked ? { backgroundColor: c.btnOff.bg } : [{ backgroundColor: c.accent }, shadow(c.accentShadow)]]}
      >
        <Icon name="arrow-up" color={sendDisabled || locked ? c.btnOff.fg : c.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: size.inputH, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 10 },
  plus: { width: 36, height: size.send, marginLeft: 6, alignItems: "center", justifyContent: "center" },
  field: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 0, outlineWidth: 0 },
  off: { opacity: 0.4 },
  locked: { opacity: 0.55 },
  send: { width: size.send, height: size.send, borderRadius: size.send / 2, alignItems: "center", justifyContent: "center" },
});
