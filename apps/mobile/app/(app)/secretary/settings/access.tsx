// สิทธิ์ของเลขาต่อระบบ (ใบ S2.8 · แบบ B3 sec-b.jpg หน้า 3) — GET/PUT secretary/access
//   3 ระดับที่ตั้งได้ OFF / READ / DRAFT · ขั้น "ทำเองได้" แสดงล็อกเสมอ (ไม่มีใน API รุ่นแรก · มติเจ้าของ 5)
//   ตั้งได้เฉพาะ OWNER (บทบาทจาก /me) — บทบาทอื่นเห็นระดับแบบอ่านอย่างเดียว + ป้าย "เจ้าของเท่านั้น" (เซิร์ฟเวอร์ตรวจซ้ำ 403)
//   เปลี่ยนระดับ = แสดงทันที แล้ว PUT {module, level} · ล้ม = คืนค่าเดิม + ข้อความไทยของเซิร์ฟเวอร์
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Loading, Note, SysBadge } from "@/src/components/airy";
import { OwnerOnlyBadge, SettingsTop } from "@/src/components/secretary/SettingRow";
import { LevelPicker } from "@/src/components/secretary/LevelPicker";
import { sysName } from "@/src/components/secretary/RoomCard";
import { sysColor } from "@/src/components/secretary/sys";
import { DEFAULT_SECRETARY_NAME, secGet, secPut, serverNote, useActiveRole, useSecretaryMe, type AccessItem, type AccessLevel } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import th from "@/src/i18n/th";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** ระดับที่ตั้งได้ในรุ่นแรก — ค่าอื่นจากเซิร์ฟเวอร์ (ไม่ควรมี) แสดงเป็นปิด */
const SETTABLE: readonly AccessLevel[] = ["OFF", "READ", "DRAFT"];
/** คำอธิบายสั้นด้านขวาของระบบ (มีเฉพาะระบบหลัก) */
const hintKey = (module: string): I18nKey | null => {
  const k = "sec.access.hint." + module;
  return k in th ? (k as I18nKey) : null;
};
const levelOf = (v: string): AccessLevel => (SETTABLE as readonly string[]).includes(v) ? (v as AccessLevel) : "OFF";

export default function SecretaryAccessScreen() {
  const { c } = useTheme();
  const t = useT();
  const role = useActiveRole();
  const owner = role === "OWNER";
  const sec = useSecretaryMe();
  const name = sec?.name ?? DEFAULT_SECRETARY_NAME;
  const { tenants, activeTenantId } = useAuth();
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const [items, setItems] = useState<AccessItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId) return;
      let live = true;
      secGet("secretary/access")
        .then((r) => {
          if (!live) return;
          setItems(r.items ?? []);
          setLoaded(true);
        })
        .catch(() => live && (setLoaded(true), setNote(t("sec.set.loadFail"))));
      return () => {
        live = false;
      };
    }, [activeTenantId, t]),
  );

  const change = async (module: string, level: AccessLevel) => {
    if (!owner) return;
    const before = items;
    const tenant = activeTenantId;
    setNote(null);
    setItems((xs) => xs.map((x) => (x.module === module ? { ...x, level } : x)));
    try {
      const r = await secPut("secretary/access", { module, level });
      if (tenantRef.current === tenant && r.items) setItems(r.items);
    } catch (e) {
      if (tenantRef.current !== tenant) return;
      setItems(before);
      setNote(serverNote(e) ?? t("sec.set.saveFail"));
    }
  };

  return (
    <AiryScreen testID="sec-access">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-access-top" title={t("sec.access.title", { name })} subtitle={t("sec.access.sub", { tenant: tenantName })} />
        <Text style={[styles.intro, { color: c.textMuted }]}>{t("sec.access.intro", { name })}</Text>
        {!owner ? <OwnerOnlyBadge /> : null}
        {note ? (
          <Note warn testID="sec-access-note">
            {note}
          </Note>
        ) : null}
        {/* S2.14: ก่อนผลแรก = Loading */}
        {!loaded ? <Loading testID="sec-access-loading" /> : null}
        {loaded && items.length === 0 && !note ? <Text style={[styles.empty, { color: c.textMuted }]}>{t("sec.access.empty")}</Text> : null}
        {items.map((x) => {
          const sysLabel = sysName(t, x.module);
          const hint = hintKey(x.module);
          return (
            <Glass key={x.module} testID="sec-access-row" radius={radii.sugg} style={styles.card}>
              <View testID={`sec-access-row-${x.module}`} style={styles.head}>
                <SysBadge sys={sysColor(x.module)} label={sysLabel.length > 4 ? sysLabel.slice(0, 3) : sysLabel} />
                <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                  {sysLabel}
                </Text>
                {hint ? (
                  <Text style={[styles.hint, { color: c.textMuted }]} numberOfLines={1}>
                    {t(hint)}
                  </Text>
                ) : null}
              </View>
              <LevelPicker testID={`sec-access-level-${x.module}`} value={levelOf(String(x.level))} readOnly={!owner} onChange={(l) => void change(x.module, l)} />
            </Glass>
          );
        })}
        <Text style={[styles.foot, { color: c.textMuted }]}>{t("sec.access.foot")}</Text>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  intro: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: F.v(16) },
  empty: { fontSize: T.sub, marginTop: spacing.lg, textAlign: "center" },
  card: { marginTop: 8, paddingVertical: 11, paddingHorizontal: 14 },
  hint: { fontSize: T.cap - 1, maxWidth: 150 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: T.sub + 1, fontWeight: "600", flex: 1 },
  foot: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: spacing.lg, textAlign: "center" },
});
