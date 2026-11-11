// ฟองข้อความในห้องแจ้งปัญหา (ใบ S2.15 · แบบ H2 sec-h.jpg หน้า 2)
//   เรา (mine) = ฟองทึบชิดขวา · คนอื่นในร้าน (เจ้าของเปิดดูเรื่องของพนักงาน) = ฟองกระจกชิดขวา + ป้าย "คนในร้าน"
//   ทีม SHARK (PLATFORM) = อวตาร SH + "ทีม SHARK" + ฟองกระจกชิดซ้าย · route ไม่ส่งชื่อ/รหัสทีมงาน ⇒ แสดงชื่อทีม (ไม่แต่งชื่อคน)
//   ลิงก์หน้าในแอปจากทีม (splitHelpLinks) = การ์ด "เปิดหน้า" ใต้ข้อความ — จอเป็นคนพาไป (onOpenLink)
//   ไฟล์แนบ = ชิป "รูปแนบ N รูป" ในฟอง
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { hhmmBkk } from "@/src/components/secretary/bkk";
import { splitHelpLinks, type HelpLink, type HelpMsg } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { bgImage, F, glassStyle, linear, shadow, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const AVATAR = 26;

export type CaseBubbleIds = { bubble: string; link: string; att: string };

export function CaseBubble({ msg, ids, nonce, onOpenLink }: { msg: HelpMsg; ids: CaseBubbleIds; nonce: string; onOpenLink: (l: HelpLink) => void }) {
  const { c } = useTheme();
  const t = useT();
  const team = msg.side === "PLATFORM";
  const { text, links } = team ? splitHelpLinks(msg.body, nonce) : { text: msg.body.trim(), links: [] as HelpLink[] };
  const images = msg.attachments.filter((a) => a.kind === "image").length;
  const files = msg.attachments.length - images;
  const attText = [images ? t("help.att.images", { n: images }) : "", files ? t("help.att.files", { n: files }) : ""].filter(Boolean).join(" · ");
  const time = hhmmBkk(msg.at);

  if (!team) {
    const solid = msg.mine;
    return (
      <View testID={ids.bubble} style={styles.meWrap}>
        {!solid ? <Text style={[styles.name, styles.nameRight, { color: c.textMuted }]}>{t("help.shopMember")}</Text> : null}
        <View style={[styles.me, solid ? [bgImage(linear(c.bubbleUser.from, c.bubbleUser.to)), shadow(c.tabShadow)] : glassStyle(c, 20)]}>
          {text ? (
            <Text style={[styles.body, { color: solid ? c.bubbleUser.fg : c.bubbleOther.fg }]} selectable>
              {text}
            </Text>
          ) : null}
          {attText ? (
            <View testID={ids.att} style={[styles.att, { backgroundColor: solid ? c.dim : c.chip.bg }]}>
              <Icon name="image" size={13} color={solid ? c.bubbleUser.fg : c.textDim} />
              <Text style={[styles.attT, { color: solid ? c.bubbleUser.fg : c.textDim }]}>{attText}</Text>
            </View>
          ) : null}
        </View>
        {time ? <Text style={[styles.time, styles.nameRight, { color: c.textFaint }]}>{time}</Text> : null}
      </View>
    );
  }

  return (
    <View testID={ids.bubble} style={styles.teamRow}>
      <View style={[styles.avatar, { backgroundColor: c.accent }]}>
        <Text style={[styles.avatarT, { color: c.onAccent }]}>SH</Text>
      </View>
      <View style={styles.teamX}>
        <Text style={[styles.name, { color: c.textMuted }]}>{time ? `${t("help.team")} · ${time}` : t("help.team")}</Text>
        <View style={[glassStyle(c, 20), styles.teamB]}>
          {text ? (
            <Text style={[styles.body, { color: c.bubbleOther.fg }]} selectable>
              {text}
            </Text>
          ) : null}
          {attText ? (
            <View testID={ids.att} style={[styles.att, { backgroundColor: c.chip.bg }]}>
              <Icon name="image" size={13} color={c.textDim} />
              <Text style={[styles.attT, { color: c.textDim }]}>{attText}</Text>
            </View>
          ) : null}
          {links.map((l, i) => (
            <Pressable
              testID={ids.link}
              key={`${l.path}-${i}`}
              accessibilityRole="link"
              accessibilityLabel={l.label ?? t("help.link.default")}
              onPress={() => onOpenLink(l)}
              style={[glassStyle(c, radii.k + 6), styles.link]}
            >
              <View style={[styles.linkIcon, { backgroundColor: c.sys.chat }]}>
                <Icon name="external-link" size={14} color={c.onSys} />
              </View>
              <View style={styles.linkX}>
                <Text style={[styles.linkT, { color: c.text }]} numberOfLines={1}>
                  {l.label ?? t("help.link.default")}
                </Text>
                <Text style={[styles.linkP, { color: c.textMuted }]} numberOfLines={1}>
                  {l.path}
                </Text>
              </View>
              <Text style={[styles.linkGo, { color: c.textMuted }]}>{t("help.link.open")}</Text>
              <Icon name="chevron-right" size={14} color={c.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meWrap: { alignSelf: "flex-end", maxWidth: "84%", marginTop: F.v(26), alignItems: "flex-end" },
  me: { borderRadius: 22, borderBottomRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14, gap: 6 },
  body: { fontSize: T.body - 1, lineHeight: 23 },
  att: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 8, borderRadius: radii.k - 2 },
  attT: { fontSize: T.cap - 0.5 },
  name: { fontSize: T.cap - 0.5, marginBottom: 4 },
  nameRight: { marginRight: 4 },
  time: { fontSize: 11, marginTop: 3 },
  teamRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: F.v(26) },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  avatarT: { fontSize: 10.5, fontWeight: "700" },
  teamX: { flex: 1, minWidth: 0 },
  teamB: { borderTopLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14, gap: 8 },
  link: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 10 },
  linkIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  linkX: { flex: 1, minWidth: 0 },
  linkT: { fontSize: T.sub, fontWeight: "500" },
  linkP: { fontSize: 11, marginTop: 1 },
  linkGo: { fontSize: T.cap - 0.5 },
});
