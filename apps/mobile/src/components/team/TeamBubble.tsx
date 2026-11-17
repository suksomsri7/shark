// ฟองข้อความแชททีม (B27 · team2.png จอ 3 / team4.png จอ 4)
//   ของเรา = ฟองทึบชิดขวา · คนอื่น = ฟองขาวชิดซ้าย (กลุ่ม = ชื่อผู้ส่งสีเหนือฟอง) · ใต้ฟอง = เวลา (+ " · อ่านแล้ว" / "อ่านแล้ว N" ของเรา)
//   ไฟล์แนบ = AttachList (รูปย่อผ่านเส้นไฟล์ที่ตรวจสิทธิ์ห้อง) · ข้อความระบบของกลุ่ม = บรรทัดกลางสีจาง · ถูกลบ = ตัวเอียงจาง
//   กดค้างฟองของเรา = onLongPress (ลบข้อความ)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { AttachList } from "@/src/components/secretary/SecAttach";
import type { TeamMsg } from "@/src/api/team";
import { bgImage, F, glassStyle, linear, shadow, useTheme } from "@/src/theme/index";
import { type as T } from "@/src/theme/tokens";

export function TeamBubble({
  msg,
  testID,
  time,
  readText,
  senderName,
  senderColor,
  deletedText,
  onLongPress,
}: {
  msg: TeamMsg;
  testID: string;
  time: string;
  /** ของเรา: "อ่านแล้ว" / "อ่านแล้ว 3" / null */
  readText: string | null;
  /** กลุ่ม: ชื่อผู้ส่ง (ของคนอื่น) */
  senderName?: string | null;
  senderColor?: string;
  deletedText: string;
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  if (msg.kind === "SYSTEM") {
    return (
      <View testID={`${testID}-sys`} style={styles.sysWrap}>
        <Text style={[styles.sysT, { color: c.textMuted, backgroundColor: c.chip.bg }]}>{msg.body}</Text>
      </View>
    );
  }
  const mine = msg.mine;
  const content = msg.deleted ? (
    <Text style={[styles.t, styles.del, { color: mine ? c.bubbleUser.fg : c.textMuted }]}>{deletedText}</Text>
  ) : (
    <>
      {msg.attachments.length ? <AttachList items={msg.attachments} onDark={mine} testID={`${testID}-attachments`} /> : null}
      {msg.body ? (
        <Text style={[styles.t, { color: mine ? c.bubbleUser.fg : c.bubbleOther.fg }]} selectable>
          {msg.body}
        </Text>
      ) : null}
    </>
  );
  const meta = [time, ...(readText ? [readText] : [])].join(" · ");
  return (
    <View testID={testID} style={[styles.wrap, mine ? styles.right : styles.left]}>
      {!mine && senderName ? <Text style={[styles.name, { color: senderColor ?? c.textMuted }]}>{senderName}</Text> : null}
      <Pressable
        onLongPress={onLongPress}
        disabled={!onLongPress}
        style={[
          mine ? [styles.mine, bgImage(linear(c.bubbleUser.from, c.bubbleUser.to)), shadow(c.tabShadow)] : [glassStyle(c, 18), styles.oth],
          msg.pending && styles.pending,
        ]}
      >
        {content}
      </Pressable>
      <Text testID={mine && readText ? `${testID}-read` : undefined} style={[styles.meta, { color: c.textMuted }, mine && styles.metaR]}>
        {meta}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: "82%", marginTop: F.v(14) },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end" },
  name: { fontSize: T.cap, fontWeight: "700", marginBottom: 4, marginLeft: 4 },
  mine: { borderRadius: 18, paddingVertical: 10, paddingHorizontal: 16 },
  oth: { paddingVertical: 10, paddingHorizontal: 16 },
  pending: { opacity: 0.7 },
  t: { fontSize: T.body - 1, lineHeight: 23 },
  del: { fontStyle: "italic", opacity: 0.75 },
  meta: { fontSize: T.cap - 1, lineHeight: 16, marginTop: 4, marginLeft: 4 },
  metaR: { textAlign: "right", marginRight: 4 },
  sysWrap: { alignItems: "center", marginTop: F.v(18) },
  sysT: { fontSize: T.cap, lineHeight: 18, textAlign: "center", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden", maxWidth: "90%" },
});
