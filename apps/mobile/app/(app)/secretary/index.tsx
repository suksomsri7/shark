// เลขา AI · หน้าแรก (ใบ S2.1) — โครง A1/C3: GET /api/mobile/secretary/rooms?scope=mine
//   มีห้อง ⇒ รายการ A1 แบบการ์ดเรียบ (S2.2 วาดเต็ม: ตัวกรอง/ค้นหา/ป้ายระบบ/สั่งโดย)
//   ไม่มีห้อง / เส้นยังไม่ขึ้นเซิร์ฟเวอร์ ⇒ C3 "สั่งงานแรกได้เลย" (หน้าตาเดียวกับภาพคู่ S0.2 · sec-c.jpg หน้า 4)
// ข้อความทั้งหมดผ่าน i18n (src/i18n) · ชื่อเลขาจาก secretary/me · ชื่อกิจการจาก /api/mobile/me (แตะ = ตัวสลับกิจการ)
// ขนาด: ตำแหน่ง/ระยะแนวตั้ง = แบบ × 0.73 · ตัวอักษร C3 = ชุด F ของธีม (R-UI1 · src/theme/index.ts)
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Dot, Icon, InputBar, Orb, SectionLabel, SysBadge, type DotStatus } from "@/src/components/airy";
import { SecTopBar, TenantTitle } from "@/src/components/secretary/SecTopBar";
import { DEFAULT_SECRETARY_NAME, listRooms, useSecretaryMe, type RoomItem, type RoomStatus } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme, type SysKey } from "@/src/theme/index";
import { radii, size, spacing } from "@/src/theme/tokens";

/** ระยะล่างของช่องสั่งงาน (เหนือขอบจอ) */
const INPUT_BOTTOM = 26;

/** ข้อเสนอของ C3 — ข้อความจาก i18n (ใบ S2.2/S2.3 เปลี่ยนเป็นข้อเสนอจริงจาก secretary/suggestions) */
const SUGGEST: { id: string; sys: SysKey }[] = [
  { id: "s1", sys: "pos" },
  { id: "s2", sys: "crm" },
  { id: "s3", sys: "bk" },
];

const STATUS_DOT: Record<RoomStatus, DotStatus> = { OPEN: "done", RUNNING: "run", WAITING: "wait", DONE: "done" };

export default function SecretaryHome() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTenantId } = useAuth();
  const name = useSecretaryMe()?.name ?? DEFAULT_SECRETARY_NAME;
  const [rooms, setRooms] = useState<RoomItem[] | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let live = true;
    setRooms(null);
    listRooms("mine")
      .then((r) => live && setRooms(Array.isArray(r.items) ? r.items : []))
      .catch(() => live && setRooms([]));
    return () => {
      live = false;
    };
  }, [activeTenantId]);

  const hasRooms = !!rooms && rooms.length > 0;
  const newTask = () => router.push("/secretary/new");

  return (
    <AiryScreen testID="sec-secretary">
      <ScrollView testID="sec-home" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SecTopBar zone="secretary" center="none" />
        <View style={styles.tenant}>
          <TenantTitle big />
        </View>
        <Text style={[styles.sub, { color: c.textMuted }]}>{hasRooms ? t("sec.a1.sub", { name, count: rooms.length }) : t("sec.c3.sub", { name })}</Text>

        {rooms === null ? null : hasRooms ? (
          rooms.map((r) => (
            <Pressable
              testID={`sec-room-${r.id}`}
              key={r.id}
              accessibilityRole="button"
              onPress={() => router.push(`/secretary/room/${r.id}`)}
              style={[glassStyle(c), styles.room]}
            >
              <Dot status={STATUS_DOT[r.status] ?? "done"} />
              <View style={styles.sx}>
                <Text style={[styles.st, { color: c.text }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[styles.ss, { color: c.textMuted }]}>{t(`sec.status.${r.status}` as I18nKey)}</Text>
              </View>
              <Icon name="chevron-right" size={16} />
            </Pressable>
          ))
        ) : (
          <>
            <View style={styles.hero}>
              <Orb size={size.orbHero} testID="sec-orb" />
              <Text style={[styles.h2, { color: c.text }]}>{t("sec.c3.heroTitle")}</Text>
              <Text style={[styles.p, { color: c.textMuted }]}>{t("sec.c3.heroBody")}</Text>
            </View>
            <SectionLabel style={styles.sec}>{t("sec.c3.suggestLabel")}</SectionLabel>
            {SUGGEST.map((s) => (
              <Pressable testID={`sec-suggest-${s.id}`} key={s.id} accessibilityRole="button" onPress={newTask} style={[glassStyle(c, radii.sugg), styles.sugg]}>
                <SysBadge sys={s.sys} label={t(`sec.c3.${s.id}.badge` as I18nKey)} />
                <View style={styles.sx}>
                  <Text style={[styles.st, { color: c.text }]}>{t(`sec.c3.${s.id}.title` as I18nKey)}</Text>
                  <Text style={[styles.ss, { color: c.textMuted }]}>{t(`sec.c3.${s.id}.sub` as I18nKey)}</Text>
                </View>
                <Icon name="chevron-right" size={16} />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <InputBar
        testID="sec-input"
        placeholder={hasRooms ? t("sec.a1.input", { name }) : t("sec.c3.input", { name })}
        onPlus={newTask}
        onSend={newTask}
        style={[styles.input, { bottom: INPUT_BOTTOM + insets.bottom }]}
      />
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: size.inputH + INPUT_BOTTOM + spacing.lg },
  tenant: { marginTop: 14 },
  sub: { fontSize: F.sub, marginTop: 2, lineHeight: 20 },
  hero: { alignItems: "center", marginTop: 39 },
  h2: { fontSize: F.h2, fontWeight: "700", letterSpacing: -0.5, marginTop: 14, lineHeight: 30 },
  p: { fontSize: F.p, lineHeight: 21, marginTop: 6, textAlign: "center" },
  sec: { marginTop: 22, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  sugg: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 8 },
  room: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: F.v(16) },
  sx: { flex: 1, minWidth: 0 },
  st: { fontSize: F.row, lineHeight: 20 },
  ss: { fontSize: F.rowSub, lineHeight: 17 },
  input: { position: "absolute", left: spacing.page, right: spacing.page },
});
