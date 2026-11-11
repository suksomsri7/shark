// S2.14 F1 (RESOLUTIONS §W): แถบรองใต้ปุ่ม/ช่องลอยล่าง — วางหลัง ScrollView ก่อนของลอย · ไล่จากใสเป็นพื้นจอทึบ (dockStyle)
//   ⇒ ข้อความการ์ดที่เลื่อนผ่านใต้ปุ่ม "เพิ่มพนักงาน" / "ส่งคำเชิญ" / "สร้างและเริ่มใช้" / ช่องสั่งงาน A1 ไม่ทะลุขึ้นมา · ไม่รับการแตะ (ของใต้แถบยังเลื่อนได้)
import { StyleSheet, View } from "react-native";
import { dockStyle, useTheme } from "@/src/theme/index";

export function BottomDock({ height }: { height: number }) {
  const { c } = useTheme();
  return <View style={[styles.dock, { height }, dockStyle(c)]} />;
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, pointerEvents: "none" },
});
