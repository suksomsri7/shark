// แถวรายการลูกค้าที่ปัดไปซ้ายได้ (K1 · 14 พ.ย. 2026 เจ้าของสั่ง "ลบห้องแชทโดยสไลด์ไปทางซ้ายและขึ้น icon delete" · แบบ mock secretary-1114 จอ ③)
//   ปัดซ้าย ⇒ การ์ดเลื่อนไป SWIPE_ACTION_W (94) · ปุ่มแดงมุมมน ไอคอนถังขยะ (Feather trash-2) + "ลบแชท" โผล่ทางขวา · แตะปุ่ม = onDelete (จอถามยืนยันเอง)
//   ปัดยาวจนสุด (เกิน FULL_SWIPE) แล้วปล่อย = onDelete เหมือนแตะปุ่ม (ยังถามยืนยัน) · เปิดได้ทีละแถว (จอปิดแถวเก่าผ่าน onOpen → methods.close)
//   enabled=false (ไม่มีสิทธิ์ลบ · canHide) = แถวธรรมดา ปัดไม่ได้ ไม่มีปุ่ม
//   CAL2.4 (แท็บเตือนฉันของปฏิทิน): `onDone` (ไม่บังคับ) = ปัดขวาเผยปุ่มเขียว ✓ (doneLabel) ทางซ้าย · ปัดขวายาวจนสุดแล้วปล่อย = onDone ทันที · ไม่ส่ง = เหมือนเดิม
//   ใช้ ReanimatedSwipeable ของ react-native-gesture-handler (GestureHandlerRootView อยู่ที่ app/_layout.tsx) — เว็บใช้ลากเมาส์ได้
import { useCallback, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { runOnJS, useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

/** ระยะที่การ์ดเลื่อนตอนเปิด (ปุ่ม 84 + ช่องไฟ 10 · ตามแบบ) */
export const SWIPE_ACTION_W = 94;
/** ปัดเลยระยะนี้แล้วปล่อย = กดลบทันที (ยังผ่านหน้าถามยืนยัน) */
const FULL_SWIPE = SWIPE_ACTION_W * 2;

function DoneAction({ translation, onFar, onPress, label, testID }: { translation: SharedValue<number>; onFar: (far: boolean) => void; onPress: () => void; label: string; testID: string }) {
  const { c } = useTheme();
  useAnimatedReaction(
    () => translation.value > FULL_SWIPE,
    (far, prev) => {
      if (far !== prev) runOnJS(onFar)(far);
    },
  );
  return (
    <View style={styles.actionL}>
      <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.btn, { backgroundColor: c.status.run }]}>
        <Icon name="check" size={22} color={c.onSys} />
        <Text style={[styles.btnT, { color: c.onSys }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function DeleteAction({ translation, onFar, onPress, label, testID }: { translation: SharedValue<number>; onFar: (far: boolean) => void; onPress: () => void; label: string; testID: string }) {
  const { c } = useTheme();
  useAnimatedReaction(
    () => translation.value < -FULL_SWIPE,
    (far, prev) => {
      if (far !== prev) runOnJS(onFar)(far);
    },
  );
  return (
    <View style={styles.action}>
      <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.btn, { backgroundColor: c.danger.bg }]}>
        <Icon name="trash-2" size={22} color={c.danger.fg} />
        <Text style={[styles.btnT, { color: c.danger.fg }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

export function SwipeRow({
  enabled,
  label,
  onDelete,
  onDone,
  doneLabel,
  onOpen,
  onClose,
  testID,
  children,
}: {
  enabled: boolean;
  label: string;
  onDelete: () => void;
  /** CAL2.4: ปัดขวา = เสร็จ (ไม่ส่ง = ปัดขวาไม่ได้) */
  onDone?: () => void;
  doneLabel?: string;
  /** แถวนี้กำลังเปิด — จอปิดแถวที่เปิดค้างอยู่ก่อนหน้า (ทีละแถว) */
  onOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
  testID: string;
  children: ReactNode;
}) {
  const ref = useRef<SwipeableMethods | null>(null);
  const far = useRef(false);
  const setFar = useCallback((v: boolean) => {
    far.current = v;
  }, []);
  const farL = useRef(false);
  const setFarL = useCallback((v: boolean) => {
    farL.current = v;
  }, []);

  if (!enabled) return <View style={styles.wrap}>{children}</View>;
  return (
    <ReanimatedSwipeable
      ref={ref}
      testID={testID}
      containerStyle={[styles.wrap, styles.visible]}
      friction={1}
      rightThreshold={SWIPE_ACTION_W / 2}
      dragOffsetFromRightEdge={12}
      leftThreshold={SWIPE_ACTION_W / 2}
      renderRightActions={(_p, translation) => <DeleteAction translation={translation} onFar={setFar} onPress={onDelete} label={label} testID={`${testID}-delete`} />}
      renderLeftActions={
        onDone ? (_p, translation) => <DoneAction translation={translation} onFar={setFarL} onPress={onDone} label={doneLabel ?? ""} testID={`${testID}-done`} /> : undefined
      }
      onSwipeableWillOpen={(dir) => {
        if (ref.current) onOpen(ref.current);
        // RNGH: "right" = แผงขวา (ลบ) เปิด · "left" = แผงซ้าย (เสร็จ · ปัดขวา) เปิด
        if (String(dir) !== "left" && far.current) {
          far.current = false;
          onDelete();
        }
        if (String(dir) === "left" && farL.current && onDone) {
          farL.current = false;
          onDone();
        }
      }}
      onSwipeableClose={() => {
        if (ref.current) onClose(ref.current);
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  // เงาของการ์ดกระจกไม่ถูกตัด (ค่าปริยายของ Swipeable = hidden) · ปุ่มซ่อนเองตอนปิด (opacity ของ Swipeable)
  visible: { overflow: "visible" },
  action: { width: SWIPE_ACTION_W, paddingLeft: 10 },
  actionL: { width: SWIPE_ACTION_W, paddingRight: 10 },
  btn: { flex: 1, borderRadius: radii.card, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6 },
  btnT: { fontSize: T.cap, fontWeight: "700" },
});
