// แถวรายชื่อแชททีม (B27 · team2.png จอ 1 / team4.png จอ 1) — การ์ดขาวมนต่อแถว
//   ซ้าย = อวตารวงกลม (กลุ่ม = ไอคอนคน) · ชื่อหนา + ป้ายบทบาท (พนักงาน/ผู้จัดการ/คุยอย่างเดียว/เจ้าของ · กลุ่ม = "กลุ่ม · N")
//   บรรทัดรอง = ข้อความล่าสุด ("คุณ: …" ของเรา) · ขวา = เวลา + ตัวเลขยังไม่อ่านพื้นเขียว
//   แถวรอยอมรับคำเชิญ = จางทั้งแถว "รอยอมรับคำเชิญ" + จำนวนวัน
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { Avatar } from "@/src/components/secretary/MemberBubble";
import type { TeamTag } from "@/src/api/team";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

export const TEAM_AVATAR = 48;

export function TagChip({ tag, label, testID }: { tag: TeamTag | "GROUP"; label?: string; testID?: string }) {
  const { c } = useTheme();
  const t = useT();
  const grey = tag === "CHAT_ONLY" || tag === "GROUP";
  return (
    <View testID={testID} style={[styles.tag, { backgroundColor: grey ? c.chip.bg : c.team.tagBg }]}>
      <Text style={[styles.tagT, { color: grey ? c.chip.fg : c.team.tagFg }]} numberOfLines={1}>
        {label ?? t(`team.tag.${tag}` as I18nKey)}
      </Text>
    </View>
  );
}

export function GroupAvatar({ size = TEAM_AVATAR }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.gav, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.sys.bk }]}>
      <Icon name="users" size={Math.round(size * 0.42)} color={c.onSys} />
    </View>
  );
}

export function TeamRow({
  testID,
  name,
  seed,
  group,
  tag,
  tagLabel,
  preview,
  time,
  unread = 0,
  pending = false,
  muted = false,
  onPress,
}: {
  testID: string;
  name: string;
  seed: string;
  group?: boolean;
  tag: TeamTag | "GROUP" | null;
  tagLabel?: string;
  preview: string;
  time: string;
  unread?: number;
  pending?: boolean;
  muted?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const body = (
    <>
      {pending ? (
        <View style={[styles.pav, { width: TEAM_AVATAR, height: TEAM_AVATAR, borderRadius: TEAM_AVATAR / 2, backgroundColor: c.btnOff.bg }]}>
          <Text style={[styles.pavT, { color: c.onAccent }]}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
        </View>
      ) : group ? (
        <GroupAvatar />
      ) : (
        <Avatar name={name} seed={seed} size={TEAM_AVATAR} />
      )}
      <View style={styles.mid}>
        <View style={styles.top}>
          <Text style={[styles.nm, { color: c.text }]} numberOfLines={1}>
            {name}
          </Text>
          {tag && !pending ? <TagChip tag={tag} label={tagLabel} testID={`${testID}-tag`} /> : null}
          {muted ? <Icon name="bell-off" size={13} color={c.iconDim} /> : null}
        </View>
        <Text testID={`${testID}-preview`} style={[styles.pv, { color: c.textMuted }]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.time, { color: c.textMuted }]}>{time}</Text>
        {unread > 0 ? (
          <View testID={`${testID}-unread`} style={[styles.unread, { backgroundColor: c.team.unreadBg }]}>
            <Text style={[styles.unreadT, { color: c.team.unreadFg }]}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : (
          <View style={styles.unreadSpace} />
        )}
      </View>
    </>
  );
  const style = [glassStyle(c, radii.sugg), styles.row, pending && { opacity: c.team.pendingAlpha }];
  return onPress ? (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, marginTop: 10 },
  mid: { flex: 1, minWidth: 0 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  nm: { fontSize: T.body, fontWeight: "700", lineHeight: 23, flexShrink: 1 },
  pv: { fontSize: T.sub - 0.5, lineHeight: 20, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 6, minWidth: 36 },
  time: { fontSize: T.cap, lineHeight: 16 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  unreadT: { fontSize: 11.5, fontWeight: "700", lineHeight: 14 },
  unreadSpace: { height: 22 },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  tagT: { fontSize: 11, fontWeight: "600", lineHeight: 15 },
  gav: { alignItems: "center", justifyContent: "center" },
  pav: { alignItems: "center", justifyContent: "center" },
  pavT: { fontSize: 20, fontWeight: "700" },
});
