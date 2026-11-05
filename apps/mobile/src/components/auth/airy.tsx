// ชิ้นส่วนจอเข้า/สมัครธีม Airy (ใบ S2.12 · แบบ sec-c หน้า 1–2) — สีจาก src/theme/index เท่านั้น · ทุกปุ่มรับ testID
// สเกล R-UI1: ตำแหน่ง/ระยะแนวตั้ง = แบบ × 0.73 (F.v ของ src/theme/index) · ตัวอักษร/มุมโค้งไม่ต่ำกว่า tokens · ui.tsx (ชุดเดิมของ 1.0/DNA) ไม่แตะ
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, StyleSheet, View, type TextInputProps } from "react-native";
import { Text, TextInput } from "@/src/components/ui/text";
import { IconBtn } from "@/src/components/airy";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type } from "@/src/theme/tokens";

// ช่องกรอกบนเว็บไม่ต้องมีกรอบโฟกัสของเบราว์เซอร์ (กรอบกระจกของเราแทน)
const NO_OUTLINE = (Platform.OS === "web" ? { outlineWidth: 0 } : {}) as object;

/** แถบบน .bar + แถบขั้น .prog — ซ้าย = ปุ่มย้อน (ถ้ามี) · กลาง = ชื่อขั้น · ล่าง = ขีด n ช่อง */
export function StepBar({
  title,
  step,
  total = 3,
  onBack,
  backTestID,
  backLabel,
}: {
  title: string;
  step?: number;
  total?: number;
  onBack?: () => void;
  backTestID?: string;
  backLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <View>
      <View style={st.bar}>
        <View style={st.side}>{onBack && backTestID ? <IconBtn testID={backTestID} icon="chevron-left" onPress={onBack} label={backLabel} /> : null}</View>
        <Text style={[st.barTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={st.side} />
      </View>
      {step ? (
        <View style={st.prog}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[st.progI, { backgroundColor: i < step ? c.accent : c.divider }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** หัวกลางจอ .hero: (orb) + หัวเรื่อง + คำอธิบาย */
export function Hero({ orb, title, children, top }: { orb?: ReactNode; title: string; children?: ReactNode; top: number }) {
  const { c } = useTheme();
  return (
    <View style={[st.hero, { marginTop: top }]}>
      {orb}
      <Text style={[st.h2, { color: c.text, marginTop: orb ? F.v(22) : 0 }]}>{title}</Text>
      {children ? <Text style={[st.p, { color: c.textMuted }]}>{children}</Text> : null}
    </View>
  );
}

/** ช่องกรอก .fl + .fld.in (กระจก) · `badge` = ป้ายเล็กข้างชื่อช่อง */
export function AuthField({ label, badge, top, testID, ...input }: TextInputProps & { label: string; badge?: string; top?: number; testID: string }) {
  const { c } = useTheme();
  return (
    <View>
      <View style={[st.flRow, top !== undefined && { marginTop: top }]}>
        <Text style={[st.fl, { color: c.sysTag.fg }]}>{label}</Text>
        {badge ? <Text style={[st.badge, { color: c.chip.fg, backgroundColor: c.chip.bg }]}>{badge}</Text> : null}
      </View>
      <TextInput
        testID={testID}
        placeholderTextColor={c.placeholder}
        autoCorrect={false}
        {...input}
        style={[glassStyle(c, radii.seg), st.fld, { color: c.text }, NO_OUTLINE]}
      />
    </View>
  );
}

/** รหัส 6 ช่อง .otp — ช่องพิมพ์จริง 1 ช่องคลุมทับกล่อง (วางรหัส 6 หลักได้ · ตัวเลขเท่านั้น · เลื่อนช่องเอง)
 *  `shakeKey` เปลี่ยนค่า ⇒ สั่นซ้ายขวา (รหัสผิด) · `onFilled` เรียกเมื่อครบ 6 หลัก */
export function OtpBoxes({
  value,
  onChange,
  onFilled,
  testID,
  shakeKey = 0,
  editable = true,
  autoFocus = true,
  top,
}: {
  value: string;
  onChange: (v: string) => void;
  onFilled?: (v: string) => void;
  testID: string;
  shakeKey?: number;
  editable?: boolean;
  autoFocus?: boolean;
  top?: number;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(autoFocus);
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shakeKey) return;
    const d = (to: number) => Animated.timing(shake, { toValue: to, duration: 50, useNativeDriver: Platform.OS !== "web" });
    Animated.sequence([d(10), d(-10), d(8), d(-8), d(4), d(0)]).start();
  }, [shakeKey, shake]);
  const cur = Math.min(value.length, 5);
  return (
    <Animated.View style={[st.otpWrap, top !== undefined && { marginTop: top }, { transform: [{ translateX: shake }] }]}>
     <View style={st.otp}>
      {Array.from({ length: 6 }, (_, i) => {
        const on = focused && editable && i === cur;
        return (
          <View key={i} style={[glassStyle(c, OTP_R), st.otpBox, on && { borderColor: c.accent, borderWidth: 2.5 }]}>
            <Text style={[st.otpD, { color: c.text }]}>{value[i] ?? ""}</Text>
          </View>
        );
      })}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(t) => {
          const d = t.replace(/\D/g, "").slice(0, 6);
          onChange(d);
          if (d.length === 6 && d !== value) onFilled?.(d);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        caretHidden
        accessibilityLabel="OTP"
        style={[StyleSheet.absoluteFill, st.otpInput, NO_OUTLINE]}
      />
     </View>
    </Animated.View>
  );
}
const OTP_R = 14;

/** บรรทัดลิงก์ .note: "นำ <b>ปุ่ม</b>" — ส่วนที่กดได้ตัวหนา */
export function LinkLine({ lead, cta, onPress, testID, disabled = false, top }: { lead?: string; cta: string; onPress: () => void; testID: string; disabled?: boolean; top?: number }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} hitSlop={8} style={[st.link, top !== undefined && { marginTop: top }]}>
      <Text style={[st.note, { color: c.textMuted }]}>
        {lead ? `${lead} ` : ""}
        <Text style={[st.note, st.b, { color: disabled ? c.textFaint : c.textDim }]}>{cta}</Text>
      </Text>
    </Pressable>
  );
}

/** ข้อความกลางจอ .note (ไม่กดได้) */
export function NoteLine({ children, top, tone = "muted" }: { children: ReactNode; top?: number; tone?: "muted" | "error" | "ok" }) {
  const { c } = useTheme();
  const color = tone === "error" ? c.legacy.danger : tone === "ok" ? c.status.run : c.textMuted;
  return <Text style={[st.note, { color }, top !== undefined && { marginTop: top }]}>{children}</Text>;
}

/** ปุ่มรอง (กระจก) เต็มกว้าง — ใช้กับ "สมัครเลย" / "เข้าด้วยวิธีอื่น" / "ออกจากระบบ" */
export function GlassButton({ label, onPress, testID, tone = "normal" }: { label: string; onPress: () => void; testID: string; tone?: "normal" | "danger" }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [glassStyle(c, radii.btn), st.gbtn, pressed && st.pressed]}>
      <Text style={[st.gbtnT, { color: tone === "danger" ? c.legacy.danger : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar: { height: F.v(52), flexDirection: "row", alignItems: "center" },
  side: { width: size.iconBtn, alignItems: "flex-start" },
  barTitle: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "600" },
  prog: { flexDirection: "row", gap: 6, marginTop: F.v(6) },
  progI: { flex: 1, height: 3, borderRadius: 2 },
  hero: { alignItems: "center" },
  h2: { fontSize: type.lt, fontWeight: "700", letterSpacing: -0.6, textAlign: "center" },
  p: { fontSize: type.sub, lineHeight: 22, textAlign: "center", marginTop: F.v(8) },
  flRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: F.v(22), marginBottom: F.v(8), marginLeft: 3 },
  fl: { fontSize: 13, fontWeight: "600" },
  badge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 1, borderRadius: radii.k, overflow: "hidden" },
  fld: { height: 46, paddingHorizontal: 14, fontSize: type.body, fontWeight: "500" },
  otpWrap: { alignItems: "center" },
  otp: { flexDirection: "row", gap: 7 },
  otpBox: { width: 42, height: 53, alignItems: "center", justifyContent: "center" },
  otpD: { fontSize: 24, fontWeight: "600" },
  otpInput: { opacity: 0.01, color: "transparent", backgroundColor: "transparent", borderWidth: 0 },
  link: { alignSelf: "center", paddingHorizontal: spacing.sm },
  note: { fontSize: type.cap, lineHeight: 20, textAlign: "center" },
  b: { fontWeight: "600" },
  gbtn: { height: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  gbtnT: { fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.75 },
});
