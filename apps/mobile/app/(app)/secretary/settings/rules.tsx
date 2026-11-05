// ต้องอนุมัติเสมอ (ใบ S2.8 · แบบ B4 sec-b.jpg หน้า 4) — GET/PUT secretary/rules
//   R-K3b: กฎ 3 ข้อ chat.send · money.limit (+ limitSatang) · pii.export = เก็บ + แสดง + ใช้ในข้อความ "ทำไมต้องอนุมัติ" เท่านั้น
//     (รุ่นแรกทุกข้อเสนอยังต้องอนุมัติ) · ข้อในทะเบียน alwaysApprove (เงินออก · ลบ/ยกเลิก · ข้อมูลส่วนบุคคล) = เปิดเสมอ ปิดไม่ได้ (COMMON §C.4)
//   วงเงินแสดงเป็นบาท ↔ ส่ง limitSatang (บาท × 100) · ผู้อนุมัติ = เจ้าของ/ผู้จัดการ (R-K4 · แสดงอย่างเดียว · ชื่อจาก secretary/staff ถ้าอ่านได้)
//   ตั้งได้เฉพาะ OWNER — บทบาทอื่นอ่านอย่างเดียว + ป้าย "เจ้าของเท่านั้น"
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, LoadError, Loading, Note, SectionLabel } from "@/src/components/airy";
import { OwnerOnlyBadge, SettingsTop } from "@/src/components/secretary/SettingRow";
import { RuleRow } from "@/src/components/secretary/RuleRow";
import { bahtText } from "@/src/components/secretary/bkk";
import { isDenied, secGet, secPut, serverNote, useActiveRole, type RuleKey, type RuleState, type RulesView, type StaffRow } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** ค่าเริ่มต้นของ lib (approval-gate DEFAULT_RULES) — ใช้ระหว่างโหลด/เมื่อเซิร์ฟเวอร์ไม่ส่งข้อนั้น */
const DEFAULTS: Record<RuleKey, RuleState> = { "chat.send": { enabled: true, limitSatang: null }, "money.limit": { enabled: true, limitSatang: 500_000 }, "pii.export": { enabled: true, limitSatang: null } };

type Row = { id: string; title: I18nKey; sub: I18nKey; rule?: RuleKey; always?: string };
/** ลำดับตามแบบ B4: เงินออก (ล็อก) · เอกสารเงินถึงลูกค้า (money.limit) · ส่งข้อความถึงลูกค้า (chat.send) · ลบ/ยกเลิก (ล็อก) · ข้อมูลส่วนบุคคล (pii.export) */
const ROWS: Row[] = [
  { id: "money", title: "sec.rules.money.title", sub: "sec.rules.money.sub", always: "money" },
  { id: "money.limit", title: "sec.rules.limit.title", sub: "sec.rules.limit.sub", rule: "money.limit" },
  { id: "chat.send", title: "sec.rules.chat.title", sub: "sec.rules.chat.sub", rule: "chat.send" },
  { id: "destructive", title: "sec.rules.destructive.title", sub: "sec.rules.destructive.sub", always: "destructive" },
  { id: "pii.export", title: "sec.rules.pii.title", sub: "sec.rules.pii.sub", rule: "pii.export", always: "piiExport" },
];

export default function SecretaryRulesScreen() {
  const { c } = useTheme();
  const t = useT();
  const role = useActiveRole();
  const owner = role === "OWNER";
  const { tenants, activeTenantId } = useAuth();
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const [view, setView] = useState<RulesView>({ rules: DEFAULTS, alwaysApprove: ["destructive", "money", "piiExport"] });
  const [limitText, setLimitText] = useState(String(DEFAULTS["money.limit"].limitSatang! / 100));
  const [approvers, setApprovers] = useState<StaffRow[] | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  // S2.14 รอบ 2 (R-S2.14): ก่อนได้ค่าจริงจากเซิร์ฟเวอร์ ห้ามแสดง/แก้สวิตช์จากค่าปริยาย ⇒ ตัวโหลด · ล้ม = การ์ดล้ม + ลองใหม่ · 403 = การ์ดล็อก
  const [load, setLoad] = useState<"loading" | "ok" | "error" | "denied">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;
  const loadedFor = useRef<string | null>(null);

  const apply = useCallback((r: RulesView) => {
    setView(r);
    const s = r.rules?.["money.limit"]?.limitSatang;
    setLimitText(s === null || s === undefined ? "" : String(Math.round(s / 100)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId) return;
      let live = true;
      // กลับมาที่จอเดิมของกิจการเดิม = คงค่าที่โหลดแล้ว · กิจการใหม่/ยังไม่เคยโหลด = ตัวโหลด
      const same = loadedFor.current === activeTenantId;
      if (!same) setLoad("loading");
      secGet("secretary/rules")
        .then((r) => {
          if (!live) return;
          apply(r);
          loadedFor.current = activeTenantId;
          setLoad("ok");
        })
        .catch((e) => live && !same && setLoad(isDenied(e) ? "denied" : "error"));
      // ผู้อนุมัติ (แสดงอย่างเดียว) — อ่านรายชื่อได้เฉพาะเจ้าของ/ผู้จัดการ · อ่านไม่ได้ ⇒ แสดงตามบทบาท
      if (role === "OWNER" || role === "MANAGER") secGet("secretary/staff")
        .then((r) => live && setApprovers((r.items ?? []).filter((x) => !x.pending && x.active !== false && (x.role === "OWNER" || x.role === "MANAGER"))))
        .catch(() => live && setApprovers(null));
      return () => {
        live = false;
      };
    }, [activeTenantId, apply, role, reloadKey]),
  );

  const always = new Set(view.alwaysApprove ?? []);
  const ruleOf = (k: RuleKey): RuleState => view.rules?.[k] ?? DEFAULTS[k];

  const put = async (key: RuleKey, patch: { enabled?: boolean; limitSatang?: number | null }) => {
    if (!owner || load !== "ok") return;
    const tenant = activeTenantId;
    const before = view;
    setNote(null);
    setView((v) => ({ ...v, rules: { ...v.rules, [key]: { ...(v.rules?.[key] ?? DEFAULTS[key]), ...patch } } }));
    try {
      const r = await secPut("secretary/rules", { key, ...patch });
      if (tenantRef.current !== tenant) return;
      apply(r);
      setNote({ text: t("sec.set.savedShort"), warn: false });
    } catch (e) {
      if (tenantRef.current !== tenant) return;
      apply(before);
      setNote({ text: serverNote(e) ?? t("sec.set.saveFail"), warn: true });
    }
  };

  const saveLimit = () => {
    const baht = Number(limitText.replace(/[^0-9]/g, ""));
    if (!limitText.trim() || !Number.isFinite(baht)) return;
    const limitSatang = Math.round(baht) * 100;
    if (limitSatang === ruleOf("money.limit").limitSatang) return;
    void put("money.limit", { limitSatang });
  };

  const valueOf = (r: Row): string => {
    if (r.rule === "money.limit") {
      const s = ruleOf("money.limit").limitSatang;
      return s === null ? t("sec.rules.everyBaht") : t("sec.rules.over", { amount: t("sec.money.baht", { n: bahtText(s) }) });
    }
    if (r.always && always.has(r.always)) return t("sec.rules.locked");
    if (r.rule === "chat.send") return t("sec.rules.everyMessage");
    return t("sec.rules.everyBaht");
  };

  const approverRows: { key: string; name: string; caption: string; initial: string }[] =
    approvers && approvers.length > 0
      ? approvers.map((a, i) => {
          const nm = a.name?.trim() || t(a.role === "OWNER" ? "sec.role.OWNER" : "sec.role.MANAGER");
          return { key: a.userId ?? String(i), name: nm, caption: t(a.role === "OWNER" ? "sec.rules.approver.owner" : "sec.rules.approver.manager"), initial: Array.from(nm)[0] ?? "" };
        })
      : [
          { key: "OWNER", name: t("sec.role.OWNER"), caption: t("sec.rules.approver.owner"), initial: Array.from(t("sec.role.OWNER"))[0] ?? "" },
          { key: "MANAGER", name: t("sec.role.MANAGER"), caption: t("sec.rules.approver.manager"), initial: Array.from(t("sec.role.MANAGER"))[0] ?? "" },
        ];

  return (
    <AiryScreen testID="sec-rules">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-rules-top" title={t("sec.title.settingsRules")} subtitle={tenantName} />
        <Text style={[styles.intro, { color: c.textMuted }]}>{t("sec.rules.intro")}</Text>
        {!owner ? <OwnerOnlyBadge /> : null}
        {note ? (
          <Note warn={note.warn} testID="sec-rules-note">
            {note.text}
          </Note>
        ) : null}

        {load === "loading" ? <Loading testID="sec-rules-loading" /> : null}
        {load === "error" || load === "denied" ? <LoadError testID="sec-rules-error" denied={load === "denied"} onRetry={() => setReloadKey((k) => k + 1)} /> : null}
        {load !== "ok" ? null : ROWS.map((r) => {
          const locked = !!r.always && always.has(r.always);
          const on = locked ? true : r.rule ? ruleOf(r.rule).enabled : true;
          return (
            <RuleRow
              key={r.id}
              testID="sec-rules-row"
              rowId={r.id}
              title={t(r.title)}
              sub={t(r.sub)}
              value={valueOf(r)}
              on={on}
              locked={locked || !r.rule}
              readOnly={!owner}
              onChange={r.rule ? (v) => void put(r.rule!, { enabled: v }) : undefined}
            >
              {r.rule === "money.limit" ? (
                <View style={[styles.limitRow, { borderTopColor: c.divider }]}>
                  <Text style={[styles.limitL, { color: c.textDim }]}>{t("sec.rules.limitLabel")}</Text>
                  <TextInput
                    testID="sec-rules-limit"
                    value={limitText}
                    editable={owner}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    onChangeText={(v) => setLimitText(v.replace(/[^0-9]/g, ""))}
                    onBlur={saveLimit}
                    onSubmitEditing={saveLimit}
                    placeholder="0"
                    placeholderTextColor={c.placeholder}
                    style={[styles.limitIn, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
                  />
                  <Text style={[styles.limitU, { color: c.textDim }]}>{t("sec.rules.bahtUnit")}</Text>
                </View>
              ) : null}
            </RuleRow>
          );
        })}

        <SectionLabel style={styles.label}>{t("sec.rules.approvers")}</SectionLabel>
        <View testID="sec-rules-approver">
          {approverRows.map((a) => (
            <Glass key={a.key} testID={`sec-rules-approver-${a.key}`} radius={radii.sugg} style={styles.appr}>
              <View style={[styles.av, { backgroundColor: c.chip.bg }]}>
                <Text style={[styles.avT, { color: c.text }]}>{a.initial}</Text>
              </View>
              <View style={styles.apprBody}>
                <Text style={[styles.apprN, { color: c.text }]}>{a.name}</Text>
                <Text style={[styles.apprC, { color: c.textMuted }]}>{a.caption}</Text>
              </View>
            </Glass>
          ))}
        </View>
        <Text style={[styles.foot, { color: c.textMuted }]}>{t("sec.rules.foot")}</Text>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  intro: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: F.v(16) },
  limitRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, paddingVertical: 10, paddingHorizontal: 16 },
  limitL: { fontSize: T.cap, flex: 1 },
  limitIn: { width: 110, height: 36, borderRadius: radii.segIn, borderWidth: 1, paddingHorizontal: 10, fontSize: T.sub, textAlign: "right" },
  limitU: { fontSize: T.cap },
  label: { marginTop: F.v(36), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
  appr: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  av: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avT: { fontSize: 15, fontWeight: "700" },
  apprBody: { flex: 1 },
  apprN: { fontSize: T.sub + 1, fontWeight: "700" },
  apprC: { fontSize: T.cap, marginTop: 3 },
  foot: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: spacing.lg, textAlign: "center" },
});
