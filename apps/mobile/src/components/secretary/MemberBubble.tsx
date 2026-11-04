// ห้องร่วม (ใบ S2.10 · แบบ D2 sec-d.jpg หน้า 2) — ฟองของคนอื่นในห้อง + ข้อความระบบ + อวตารตัวอักษร (ใช้ร่วมกับ D1/D3)
//   คนอื่น = อวตารตัวอักษร + "ชื่อ · บทบาท" เล็ก + ฟองกระจกชิดซ้าย · ข้อความระบบ (🔔 เข้าห้อง/ถอน · authorUserId "system" · §J R-S1.6b) = ป้ายกลางสีจาง + เวลา
//   สีอวตารมาจากสีระบบของธีม (วนตาม userId) — ไม่มีสีฝัง
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import type { MsgRow } from "@/src/api/secretary";
import { F, glassStyle, useTheme, type SysKey } from "@/src/theme/index";
import { type as T } from "@/src/theme/tokens";

const AVATAR_KEYS: SysKey[] = ["crm", "acc", "pos", "bk", "mem", "dorm", "kb", "chat"];
/** สระหน้า/วรรณยุกต์ที่ไม่ใช้เป็นตัวอักษรแรกของอวตาร (เช่น "เอ" → "อ") */
const LEAD = /^[\u0E40-\u0E44\s]+/;

export function initialOf(name: string | null | undefined): string {
  const s = (name ?? "").trim().replace(LEAD, "");
  return Array.from(s)[0]?.toUpperCase() ?? "?";
}

function keyOf(seed: string): SysKey {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_KEYS[h % AVATAR_KEYS.length]!;
}

export function Avatar({ name, seed, size = 34, testID }: { name: string | null | undefined; seed: string; size?: number; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.sys[keyOf(seed || name || "")] }]}>
      <Text style={[styles.avT, { color: c.onSys, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.56) }]}>{initialOf(name)}</Text>
    </View>
  );
}

/** ฟองของคนอื่นในห้อง (D2): อวตาร + "ชื่อ · บทบาท" + ฟองกระจก */
export function MemberBubble({ msg, name, role, testID }: { msg: MsgRow; name: string; role: string | null; testID: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={styles.row}>
      <Avatar name={name} seed={msg.authorId ?? name} size={24} />
      <View style={styles.col}>
        <Text style={[styles.name, { color: c.textMuted }]} numberOfLines={1}>
          {role ? `${name} · ${role}` : name}
        </Text>
        <View style={[glassStyle(c, 20), styles.bubble]}>
          <Text style={[styles.t, { color: c.bubbleOther.fg }]} selectable>
            {msg.content}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** ข้อความระบบกลางห้อง (🔔 เข้าห้อง/ถอน) + เวลา */
export function SystemMsg({ msg, time, testID }: { msg: MsgRow; time: string; testID: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={styles.sysWrap}>
      <Text style={[styles.sysT, { color: c.textMuted, backgroundColor: c.chip.bg }]}>{time ? `${msg.content} · ${time}` : msg.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  av: { alignItems: "center", justifyContent: "center", opacity: 0.78 },
  avT: { fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: F.v(26), maxWidth: "88%" },
  col: { flexShrink: 1, minWidth: 0 },
  name: { fontSize: T.cap - 0.5, marginBottom: 4, marginLeft: 2, lineHeight: 16 },
  bubble: { borderTopLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14, alignSelf: "flex-start" },
  t: { fontSize: T.body - 1, lineHeight: 23 },
  sysWrap: { alignItems: "center", marginTop: F.v(22) },
  sysT: { fontSize: T.cap, lineHeight: 18, textAlign: "center", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden", maxWidth: "90%" },
});
