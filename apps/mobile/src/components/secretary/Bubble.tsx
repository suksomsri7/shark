// ฟองข้อความในห้องงาน (ใบ S2.4 · แบบ A3/A4 sec-a.jpg หน้า 3–4 · .ubb .aiw .oth)
//   ผู้ใช้ (เรา) = ฟองทึบชิดขวา (bubbleUser) · คนอื่นในห้อง = ชื่อเล็ก + ฟองกระจกชิดซ้าย (D2)
//   เลขา = ลูกแก้ว + ข้อความ (ไม่มีกรอบ) · ข้อความระบบ (🔔/🔁 · authorUserId "system") = ฟองกลางสีจาง (§J R-S1.6b)
//   14 พ.ย. ▸ ไฟล์แนบ (AttachList: รูปย่อ/ชิปไฟล์) เหนือข้อความในฟอง · ฟองที่กำลังส่ง (msg.pending) จางลงเล็กน้อย ◂
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Orb } from "@/src/components/airy";
import type { MsgRow } from "@/src/api/secretary";
import { AttachList } from "@/src/components/secretary/SecAttach";
import { bgImage, F, glassStyle, linear, shadow, useTheme } from "@/src/theme/index";
import { type as T } from "@/src/theme/tokens";

/** ลูกแก้วของเลขาในห้อง (แบบ 32 px × 0.73) + ระยะถึงข้อความ — การ์ดที่ตามมาเยื้องเท่านี้ */
export const ROOM_ORB = 24;
export const ROOM_ORB_GAP = 10;
export const ROOM_INDENT = ROOM_ORB + ROOM_ORB_GAP;

// Lekaa FAB ▸ `footer` = ส่วนท้ายใต้ข้อความของเลขา (ชิป "📍 อ้างอิง: …") ◂
export function Bubble({ msg, mine, authorName, testID, footer }: { msg: MsgRow; mine: boolean; authorName: string | null; testID: string; footer?: ReactNode }) {
  const { c } = useTheme();
  if (msg.role === "system") {
    return (
      <View testID={testID} style={styles.sysWrap}>
        <Text style={[styles.sysT, { color: c.textMuted, backgroundColor: c.chip.bg }]}>{msg.content}</Text>
      </View>
    );
  }
  if (msg.role === "assistant") {
    return (
      <AssistantRow testID={testID}>
        <Text style={[styles.aiT, { color: c.text }]} selectable>
          {msg.content}
        </Text>
        {footer}
      </AssistantRow>
    );
  }
  if (mine) {
    return (
      <View
        testID={testID}
        style={[styles.user, bgImage(linear(c.bubbleUser.from, c.bubbleUser.to)), shadow(c.tabShadow), msg.pending && styles.pending]}
      >
        {msg.attachments?.length ? <AttachList items={msg.attachments} onDark testID={`${testID}-attachments`} /> : null}
        <Text style={[styles.userT, { color: c.bubbleUser.fg }]} selectable>
          {msg.content}
        </Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={styles.othWrap}>
      {authorName ? <Text style={[styles.othName, { color: c.textMuted }]}>{authorName}</Text> : null}
      <View style={[glassStyle(c, 20), styles.oth]}>
        {msg.attachments?.length ? <AttachList items={msg.attachments} testID={`${testID}-attachments`} /> : null}
        <Text style={[styles.userT, { color: c.bubbleOther.fg }]} selectable>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

/** แถวของเลขา: ลูกแก้วซ้าย + เนื้อหา (ข้อความ/การ์ด) */
export function AssistantRow({ children, testID, orb = true }: { children?: ReactNode; testID?: string; orb?: boolean }) {
  return (
    <View testID={testID} style={styles.ai}>
      {orb ? <Orb size={ROOM_ORB} /> : <View style={{ width: ROOM_ORB }} />}
      <View style={styles.aiX}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  user: { alignSelf: "flex-end", maxWidth: "82%", borderRadius: 22, borderBottomRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14, marginTop: F.v(26) },
  pending: { opacity: 0.85 },
  userT: { fontSize: T.body - 1, lineHeight: 23 },
  othWrap: { alignSelf: "flex-start", maxWidth: "82%", marginTop: F.v(26) },
  othName: { fontSize: T.cap, marginBottom: 4, marginLeft: 4 },
  oth: { borderTopLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
  ai: { flexDirection: "row", alignItems: "flex-start", gap: ROOM_ORB_GAP, marginTop: F.v(26) },
  aiX: { flex: 1, minWidth: 0 },
  aiT: { fontSize: T.body - 1, lineHeight: 24 },
  sysWrap: { alignItems: "center", marginTop: F.v(22) },
  sysT: { fontSize: T.cap, lineHeight: 18, textAlign: "center", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden", maxWidth: "90%" },
});
