// ห้องงานของเลขา (ใบ S2.4 · แบบ A3/A4/A5 sec-a.jpg หน้า 3–5 · C4 sec-c.jpg หน้า 5)
//   14 พ.ย. 2026: ตัวจอทั้งหมดย้ายไป `src/components/secretary/RoomView.tsx` (ใช้ร่วมกับจอเริ่มงานใหม่หลังกดส่ง — คุยต่อหน้าเดิม แบบ Ⓑ)
//   ไฟล์นี้อ่าน id จากเส้นทางแล้วส่งต่อ · พฤติกรรม/testID เดิมทั้งหมดอยู่ใน RoomView (ดูหัวไฟล์นั้น)
import { useLocalSearchParams } from "expo-router";
import { RoomView } from "@/src/components/secretary/RoomView";

export default function SecretaryRoomScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  return <RoomView id={typeof params.id === "string" ? params.id : ""} />;
}
