// ฟองข้อความในห้องแชทลูกค้า (ใบ S2.18 · แบบ K2 sec-k.jpg หน้า 2) — แสดงผลอย่างเดียว (ไม่มีการส่งในไฟล์นี้ · การส่ง/ส่งใหม่ = onResend ของจอ)
//   ลูกค้า (IN) = อวตาร + "ชื่อ · เวลา" + ฟองกระจกซ้าย · เรา (OUT) = ฟองทึบขวา + "ชื่อผู้ส่ง · เวลา"
//   ส่งโดย Shark (meta.ai · RESOLUTIONS §M) = ฟองทึบขวา + ป้าย "ส่งโดย Shark (ผู้ช่วย AI) · อนุมัติโดย <ชื่อ>"
//   บันทึกภายใน = การ์ดเส้นประ 🔒 "ลูกค้าไม่เห็น" + @ชื่อ เน้นสี + ไฟล์แนบ · ข้อความระบบ (type SYSTEM / ผู้ส่ง system:* เช่น SLA) = ป้ายกลาง
//   ลิงก์ไฟล์/เสียง/รูปเต็มจอ เปิดเฉพาะ https (isSafeLink · R-S2.17c)
//   สติกเกอร์ (stickerMeta) = ช่องสติกเกอร์ (ไม่โหลดรูปจากภายนอก) · รูป = ย่อ แตะ = ตัวดูเต็มจอ · ไฟล์ = เปิด · เสียง = เล่น (เปิดลิงก์) + ความยาว
//   deliveryStatus FAILED = ✗ + ปุ่มส่งใหม่
import { useState, type ReactNode } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { isSafeLink, type MsgAttachment, type MsgItem } from "@/src/api/inbox";
import { useT } from "@/src/i18n";
import { bgImage, F, glassStyle, linear, shadow, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";
import { Avatar, firstName, hhmm } from "./parts";

export type BubbleKind = "in" | "out" | "ai" | "internal" | "system";
/** ชนิดฟองของข้อความ */
export function bubbleKind(m: MsgItem): BubbleKind {
  // R-S2.17c: ตัดสินจากผู้ส่งเท่านั้น (ไม่ดูเนื้อความ — ใครพิมพ์ 🙋/🔁 เองก็ไม่กลายเป็นข้อความระบบ) · `system:*` = SLA/ระบบแชท · บันทึกภายในไม่มีผู้ส่ง = ระบบ
  const sid = m.senderUserId ?? "";
  const sys = m.type === "SYSTEM" || sid.startsWith("system:") || (m.isInternal && !sid);
  if (sys) return "system";
  if (m.isInternal) return "internal";
  if (m.direction === "IN") return "in";
  return m.meta?.ai ? "ai" : "out";
}

const isImage = (a: MsgAttachment) => a.kind === "IMAGE" || a.mimeType.startsWith("image/");
const isAudio = (m: MsgItem, a: MsgAttachment) => m.type === "AUDIO" || a.kind === "AUDIO" || a.mimeType.startsWith("audio/");
const openSafe = (url: string) => {
  if (isSafeLink(url)) void Linking.openURL(url);
};
const dur = (ms: number | null) => {
  if (!ms || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** ข้อความที่มี @ชื่อ — ส่วน @ เน้นสี */
function Mentions({ body, color, hi }: { body: string; color: string; hi: string }) {
  const parts = body.split(/(@[^\s@]+)/u);
  return (
    <Text style={[styles.noteT, { color }]} selectable>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <Text key={i} style={{ color: hi, fontWeight: "600" }}>
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function MessageBubble({
  msg,
  customerName,
  approverName,
  onImage,
  onResend,
  resending,
  ids,
  inFooter,
}: {
  msg: MsgItem;
  customerName: string;
  /** ชื่อผู้อนุมัติของข้อความ Shark (meta.ai.approvedBy → ชื่อพนักงาน) */
  approverName: string | null;
  onImage: (url: string) => void;
  onResend?: (m: MsgItem) => void;
  resending?: boolean;
  ids: { in: string; out: string; ai: string; internal: string; system: string };
  /** S3a.6: ใต้ฟองลูกค้า (IN) — ปุ่ม "แปล" / คำแปล (จอวาดเอง · testID อยู่ในไฟล์จอ) */
  inFooter?: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  const kind = bubbleKind(msg);
  const time = hhmm(msg.createdAt);
  const body = (msg.body ?? "").trim();

  if (kind === "system") {
    return (
      <View testID={ids.system} style={styles.sysWrap}>
        <Text style={[styles.sysT, { color: c.textMuted, backgroundColor: c.chip.bg }]}>{time ? `${body} · ${time}` : body}</Text>
      </View>
    );
  }

  /** เนื้อหาฟอง · `withBody=false` = เฉพาะไฟล์แนบ (บันทึกภายในวาดข้อความเองพร้อม @ชื่อ) */
  const content = (light: boolean, withBody = true) => {
    const fg = light ? c.bubbleOther.fg : c.bubbleUser.fg;
    return (
      <>
        {withBody && (msg.type === "STICKER" || msg.stickerMeta) ? (
          <View testID="cust-att-sticker" style={[styles.sticker, { backgroundColor: c.chip.bg }]}>
            <Icon name="smile" size={30} color={c.iconDim} />
            <Text style={[styles.attT, { color: c.textMuted }]}>{t("cust.msg.sticker")}</Text>
          </View>
        ) : null}
        {body && withBody ? (
          <Text style={[styles.t, { color: fg }]} selectable>
            {body}
          </Text>
        ) : null}
        {msg.attachments.map((a, i) =>
          isImage(a) ? (
            <Pressable testID="cust-att-image" key={i} onPress={() => onImage(a.url)} accessibilityRole="imagebutton" accessibilityLabel={t("cust.msg.image")} style={styles.imgWrap}>
              <ImageAtt url={a.url} />
            </Pressable>
          ) : isAudio(msg, a) ? (
            <Pressable testID="cust-att-audio" key={i} onPress={() => openSafe(a.url)} accessibilityRole="button" accessibilityLabel={t("cust.msg.audio")} style={styles.attRow}>
              <View style={[styles.play, { backgroundColor: light ? c.accent : c.onAccent }]}>
                <Icon name="play" size={14} color={light ? c.onAccent : c.accent} />
              </View>
              <Text style={[styles.attT, { color: fg }]}>
                {t("cust.msg.audio")} {dur(a.durationMs)}
              </Text>
            </Pressable>
          ) : (
            <Pressable testID="cust-att-file" key={i} onPress={() => openSafe(a.url)} accessibilityRole="link" style={styles.attRow}>
              <Icon name="paperclip" size={15} color={fg} />
              <Text style={[styles.attT, { color: fg }]} numberOfLines={1}>
                {a.name}
              </Text>
            </Pressable>
          ),
        )}
      </>
    );
  };

  if (kind === "internal") {
    return (
      <View testID={ids.internal} style={[styles.note, { backgroundColor: c.cust.noteBg, borderColor: c.cust.noteBorder }]}>
        <View style={[styles.lock, { backgroundColor: c.surface }]}>
          <Icon name="lock" size={18} color={c.warn.fg} />
        </View>
        <View style={styles.noteBody}>
          <Text style={[styles.noteH, { color: c.text }]}>
            {t("cust.msg.internal")} · {firstName(msg.senderName) || t("cust.staff.noName")} {time}
          </Text>
          {body ? <Mentions body={body} color={c.textDim} hi={c.cust.ai} /> : null}
          {msg.attachments.length ? content(true, false) : null}
          <Text style={[styles.noteHint, { color: c.textMuted }]}>{t("cust.msg.customerCantSee")}</Text>
        </View>
      </View>
    );
  }

  if (kind === "in") {
    return (
      <View testID={ids.in} style={styles.inRow}>
        <Avatar name={customerName} seed={customerName} size={26} />
        <View style={styles.inCol}>
          <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
            {customerName} · {time}
          </Text>
          <View style={[glassStyle(c, 18), styles.inB]}>{content(true)}</View>
          {inFooter}
        </View>
      </View>
    );
  }

  // OUT (เรา / Shark)
  const failed = msg.deliveryStatus === "FAILED";
  const footer =
    kind === "ai"
      ? approverName
        ? t("cust.msg.aiBy", { name: approverName, time })
        : t("cust.msg.aiNoApprover", { time })
      : `${firstName(msg.senderName) || t("cust.staff.noName")} · ${time}`;
  return (
    <View testID={kind === "ai" ? ids.ai : ids.out} style={styles.outWrap}>
      <View style={[styles.outB, bgImage(linear(c.bubbleUser.from, c.bubbleUser.to)), shadow(c.tabShadow)]}>
        {content(false)}
        <Text style={[styles.outMeta, { color: c.bubbleUser.fg }]}>{footer}</Text>
      </View>
      {failed ? (
        <View style={styles.failRow}>
          <Text style={[styles.failT, { color: c.bad.fg }]}>✕ {t("cust.msg.failed")}</Text>
          {onResend ? (
            <Pressable testID="cust-bubble-resend" onPress={() => onResend(msg)} disabled={resending} accessibilityRole="button" style={styles.resend}>
              <Icon name="rotate-cw" size={13} color={c.bad.fg} />
              <Text style={[styles.failT, { color: c.bad.fg, fontWeight: "700" }]}>{t("cust.msg.resend")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sysWrap: { alignItems: "center", marginTop: F.v(22) },
  sysT: { fontSize: T.cap - 0.5, lineHeight: 18, textAlign: "center", paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden", maxWidth: "96%" },
  note: { flexDirection: "row", gap: 12, marginTop: F.v(22), borderWidth: 1, borderStyle: "dashed", borderRadius: radii.sugg, paddingVertical: 12, paddingHorizontal: 12 },
  lock: { width: 34, height: 34, borderRadius: radii.k + 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  noteBody: { flex: 1, minWidth: 0 },
  noteH: { fontSize: T.sub, fontWeight: "700", lineHeight: 20 },
  noteT: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: 3 },
  noteHint: { fontSize: T.cap - 1, lineHeight: 16, marginTop: 2 },
  inRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: F.v(26), maxWidth: "90%" },
  inCol: { flexShrink: 1, minWidth: 0 },
  meta: { fontSize: T.cap - 1, marginBottom: 4, marginLeft: 2, lineHeight: 16 },
  inB: { borderTopLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14, alignSelf: "flex-start" },
  t: { fontSize: T.body - 1, lineHeight: 23 },
  outWrap: { alignSelf: "flex-end", maxWidth: "84%", marginTop: F.v(26), alignItems: "flex-end" },
  outB: { borderRadius: 20, borderBottomRightRadius: 6, paddingVertical: 11, paddingHorizontal: 14 },
  outMeta: { fontSize: T.cap - 1.5, lineHeight: 16, marginTop: 6, opacity: 0.72 },
  failRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  failT: { fontSize: T.cap - 0.5 },
  resend: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2 },
  sticker: { width: 96, height: 84, borderRadius: radii.segIn + 2, alignItems: "center", justifyContent: "center", gap: 4 },
  imgWrap: { marginTop: 4 },
  img: { width: 180, height: 140, borderRadius: radii.segIn, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  attRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  attT: { fontSize: T.cap + 0.5, flexShrink: 1 },
  play: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});

/** S2.14 F3: รูปของลูกค้า — พื้นรอ = surface กลาง + ไอคอนรูป (ไม่ใช่สีของพิกเซลรูป) · รูปโหลดได้ทับเต็มกรอบ · โหลดไม่ได้ = คงพื้นรอ
 *  (เดิม: Image เปล่าบนพื้น chip.bg — fixture เป็น PNG 1×1 สีเขียว #00ff00 โปร่ง 50% ถูกยืดเต็มกรอบด้วย resizeMode cover ⇒ กล่องเขียวสด) */
// R-S2.14l: โหลดรูปจากเครื่องอื่นเฉพาะ url ที่ผ่าน isSafeLink (https) — ไม่ผ่าน (data:/http:/javascript: ฯลฯ) = กรอบไอคอนรูปอย่างเดียว
function ImageAtt({ url }: { url: string }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const safe = isSafeLink(url);
  return (
    <View style={[styles.img, { backgroundColor: c.surface, borderColor: c.divider, borderWidth: 1 }]}>
      <Icon name="image" size={26} color={c.iconDim} />
      {failed || !safe ? null : <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />}
    </View>
  );
}
