// เชิญพนักงาน (ใบ S2.21 · แบบ G2 sec-g.jpg หน้า 2 + sec-dark-g.jpg หน้า 2) — โซนทีม
//   ชื่อ · เบอร์ (มือถือไทย · normalize ก่อนส่ง) · บทบาท (OWNER เลือก พนักงาน/ผู้จัดการ · MANAGER เห็นเฉพาะพนักงาน R-S1.25d)
//   หน่วย/สาขา (ติ๊ก · ส่ง `unitIds` ชัดเจนเสมอ · ค่าเริ่มต้น "ทุกสาขา" = ["*"]) · ระดับต่อระบบเริ่มต้น = ปิดทุกระบบ (เฉพาะระดับที่โมดูลมี · LevelGrid)
//   แชทลูกค้า ไม่เห็น/ดูได้/ตอบได้ · ตัวอย่าง SMS (แม่แบบเดียวกับเซิร์ฟเวอร์ "SHARK: …")
//   ส่ง ⇒ POST secretary/staff/invite {name, phone, role, unitIds, permissions} ⇒ ลิงก์ (เมื่อ SMS ไม่ได้ส่งจริง) + หมดอายุ
//   เหตุผลปฏิเสธ (S1.25) แสดงข้อความไทยของจอ: rate_limited · already_member · already_invited · pending_cap · bad_permissions · sms_unavailable · throttled
//   คำเชิญค้าง (GET staff/invites) + ส่งอีกครั้ง (POST …/resend) / ยกเลิก (DELETE · ยืนยันก่อน)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, Icon, IconBtn, Note, PrimaryButton, Segment, Sheet, TopBar } from "@/src/components/airy";
import { ChatLevelPicker } from "@/src/components/secretary/ChatLevelPicker";
import { InviteRow } from "@/src/components/secretary/InviteRow";
import type { StaffRowIds } from "@/src/components/secretary/StaffRow";
import { LevelGrid, gridModules, permissionsFromLevels, type ModuleLevel } from "@/src/components/secretary/LevelGrid";
import { dateBkk } from "@/src/components/secretary/bkk";
import {
  inviteReasonOf,
  isDenied,
  normalizeInvites,
  normalizeStaff,
  normalizeUnits,
  secDeleteId,
  secGet,
  secPost,
  secPostId,
  serverNote,
  useActiveRole,
  type ChatLevel,
  type InviteReason,
  type InviteRes,
  type StaffInvite,
  type UnitOpt,
} from "@/src/api/secretary";
import { formatThaiMobileInput, maskPhone, normalizeThaiMobile } from "@/src/lib/phone";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const ALL = "*";
/** testID ของแถวคำเชิญค้าง (spec s2.21) */
const ROW_IDS: StaffRowIds = { row: "inv-pending-row", chat: "inv-pending-chat", pending: "inv-pending-row", resend: "inv-resend", cancel: "inv-cancel" };
const NAME_MAX = 80;
/** เหตุผลปฏิเสธ → ข้อความไทยของจอ (ข้อความเซิร์ฟเวอร์ใช้กับเหตุผลอื่น) */
const REASON: Partial<Record<InviteReason, I18nKey>> = {
  rate_limited: "inv.err.rate_limited",
  already_member: "inv.err.already_member",
  already_invited: "inv.err.already_invited",
  pending_cap: "inv.err.pending_cap",
  bad_permissions: "inv.err.bad_permissions",
  sms_unavailable: "inv.err.sms_unavailable",
  throttled: "inv.err.throttled",
  bad_phone: "inv.err.bad_phone",
  forbidden: "inv.err.forbidden",
  bad_units: "inv.err.bad_units",
};

/** ค่าเริ่มต้นสาขาของคำเชิญ (R-S2.21d) */
function defaultUnits(owner: boolean, unitCount: number, mine: string[]): string[] {
  if (owner) return unitCount > 1 ? [] : [ALL];
  return mine.length ? (mine.includes(ALL) ? [ALL] : mine) : [];
}

export default function SecretaryStaffInviteScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenants, activeTenantId } = useAuth();
  const role = useActiveRole();
  const owner = role === "OWNER";
  const manage = owner || role === "MANAGER";
  const shop = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteRole, setInviteRole] = useState<"STAFF" | "MANAGER">("STAFF");
  // R-S2.21d: ค่าเริ่มต้นสาขาตั้งหลังโหลด — OWNER ที่มี >1 สาขา ต้องเลือกเอง · MANAGER = สาขาของตัวเอง
  const [units, setUnits] = useState<string[]>([]);
  const unitsTouched = useRef(false);
  const [myUnits, setMyUnits] = useState<string[] | null>(null);
  const [levels, setLevels] = useState<Record<string, ModuleLevel>>({});
  const [chat, setChat] = useState<ChatLevel>("NONE");
  const [unitOpts, setUnitOpts] = useState<UnitOpt[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [result, setResult] = useState<(InviteRes & { phone: string }) | null>(null);
  const [cancelling, setCancelling] = useState<StaffInvite | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!owner) setInviteRole("STAFF"); // MANAGER เชิญได้เฉพาะพนักงาน (R-S1.25d)
  }, [owner]);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(normalizeInvites(await secGet("secretary/staff/invites")));
    } catch (e) {
      if (isDenied(e)) setDenied(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.allSettled([secGet("secretary/staff"), secGet("secretary/access")]).then(([s, a]) => {
        if (!live) return;
        if (s.status === "fulfilled") {
          const opts = normalizeUnits(s.value);
          const mine = normalizeStaff(s.value).people.find((x) => x.me)?.units ?? [];
          setUnitOpts(opts);
          setMyUnits(mine);
          if (!unitsTouched.current) setUnits(defaultUnits(owner, opts.length, mine));
        } else if (!unitsTouched.current) setUnits(owner ? [ALL] : []);
        if (a.status === "fulfilled") setModules(gridModules((a.value.items ?? []).map((x) => x.module)));
      });
      void loadInvites();
      return () => {
        live = false;
      };
    }, [loadInvites, activeTenantId, owner]),
  );

  const e164 = normalizeThaiMobile(phone);
  const nameOk = name.trim().length > 0 && Array.from(name.trim()).length <= NAME_MAX;
  const ready = manage && !denied && nameOk && !!e164 && units.length > 0 && !busy;
  // MANAGER ให้ได้เฉพาะสาขาของตัวเอง (server ตรวจซ้ำ bad_units) · ทุกสาขาเฉพาะเมื่อตัวเองมี "*"
  const canAll = owner || (myUnits ?? []).includes(ALL);
  const shownUnits = owner || canAll ? unitOpts : unitOpts.filter((u) => (myUnits ?? []).includes(u.id));

  const toggleUnit = (id: string) => {
    unitsTouched.current = true;
    setUnits((cur) => {
      if (id === ALL) return cur.includes(ALL) ? [] : [ALL];
      const base = cur.filter((u) => u !== ALL);
      return base.includes(id) ? base.filter((u) => u !== id) : [...base, id]; // ว่าง = ยังไม่เลือก ⇒ ปุ่มส่งปิด (ไม่ส่งรายการว่าง)
    });
  };

  const smsText = useMemo(() => t("inv.sms", { shop, name: name.trim() || t("inv.smsName") }), [t, shop, name]);

  const reasonText = (e: unknown): string => {
    const r = inviteReasonOf(e);
    const k = r ? REASON[r] : undefined;
    return k ? t(k) : (serverNote(e) ?? t("inv.err.generic"));
  };

  const submit = async () => {
    if (!ready || !e164 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    setResult(null);
    try {
      const r = await secPost("secretary/staff/invite", {
        name: name.trim(),
        phone: e164,
        role: inviteRole,
        unitIds: units,
        // ผู้จัดการเข้าถึงทุกระบบตามบทบาท ⇒ ไม่ต้องให้คีย์ · พนักงาน = คีย์ของระดับที่เลือก (LevelGrid ที่เดียว)
        permissions: inviteRole === "MANAGER" ? {} : permissionsFromLevels(levels, chat),
      });
      setResult({ ...r, phone: e164 });
      setName("");
      setPhone("");
      void loadInvites();
    } catch (e) {
      setNote({ text: reasonText(e), warn: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote({ text: ok, warn: false });
    } catch (e) {
      setNote({ text: reasonText(e), warn: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
      void loadInvites();
    }
  };
  const resend = (i: StaffInvite) => void run(() => secPostId("secretary/staff/invites/[id]/resend", i.inviteId, {}), t("inv.resent"));
  const cancel = async () => {
    const i = cancelling;
    setCancelling(null);
    if (i) await run(() => secDeleteId("secretary/staff/invites/[id]", i.inviteId), t("inv.cancelled"));
  };

  // R-S2.21d: MANAGER แตะได้เฉพาะคำเชิญของพนักงาน (R-S1.25d)
  const canTouch = (i: StaffInvite) => manage && (owner || i.role === "STAFF");
  const close = () => (router.canGoBack() ? router.back() : router.replace("/secretary/staff"));
  const until = result?.expiresAt ? dateBkk(result.expiresAt) : null;
  const isManagerInvite = inviteRole === "MANAGER";

  return (
    <AiryScreen testID="inv">
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 120 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TopBar testID="inv-top" left={<IconBtn testID="inv-close" icon="x" label={t("biz.close")} onPress={close} />} title={t("inv.title")} subtitle={shop} right={<View style={styles.spacer} />} />

        {!manage || denied ? (
          <Glass testID="inv-denied" style={styles.denied}>
            <Icon name="lock" size={22} color={c.textMuted} />
            <Text style={[styles.deniedT, { color: c.text }]}>{t("inv.denied")}</Text>
          </Glass>
        ) : null}

        <Text style={[styles.label, { color: c.textDim }]}>{t("inv.name")}</Text>
        <TextInput
          testID="inv-name"
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          placeholder={t("inv.namePh")}
          placeholderTextColor={c.placeholder}
          style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
        />
        <Text style={[styles.label, { color: c.textDim }]}>{t("inv.phone")}</Text>
        <TextInput
          testID="inv-phone"
          value={phone}
          onChangeText={(v) => setPhone(formatThaiMobileInput(v))}
          keyboardType="phone-pad"
          placeholder={t("inv.phonePh")}
          placeholderTextColor={c.placeholder}
          style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
        />
        {phone.length >= 10 && !e164 ? (
          <Note warn testID="inv-phone-error">
            {t("inv.err.bad_phone")}
          </Note>
        ) : null}

        <Text style={[styles.label, { color: c.textDim }]}>{t("inv.role")}</Text>
        <Segment
          testID="inv-role"
          value={inviteRole}
          onChange={(k) => setInviteRole(k === "MANAGER" ? "MANAGER" : "STAFF")}
          options={[
            { key: "STAFF", label: t("sec.role.STAFF") },
            ...(owner ? [{ key: "MANAGER", label: t("sec.role.MANAGER") }] : []),
          ]}
        />
        {!owner ? <Text style={[styles.hint, { color: c.textMuted }]}>{t("inv.roleManagerHint")}</Text> : null}

        <Text style={[styles.label, { color: c.textDim }]}>{t("inv.units")}</Text>
        <View testID="inv-unit" style={styles.chips}>
          {canAll ? <Chip testID="inv-unit-all" active={units.includes(ALL)} label={t("perm.unitAll")} onPress={() => toggleUnit(ALL)} /> : null}
          {shownUnits.map((u) => (
            <Chip key={u.id} testID={`inv-unit-${u.id}`} active={units.includes(u.id)} label={u.name} onPress={() => toggleUnit(u.id)} />
          ))}
        </View>

        {units.length === 0 ? <Text testID="inv-unit-pick" style={[styles.hint, { color: c.warn.fg }]}>{t("inv.unitPick")}</Text> : null}

        <Text style={[styles.label, { color: c.textDim }]}>{t("inv.levels")}</Text>
        {isManagerInvite ? (
          <Note testID="inv-manager-full" style={styles.leftNote}>
            {t("perm.managerFull")}
          </Note>
        ) : null}
        <View style={styles.grid}>
          <ChatLevelPicker testID="inv-chat" value={isManagerInvite ? "REPLY" : chat} onChange={setChat} disabled={isManagerInvite} hint={t("inv.chatHint")} />
          <LevelGrid testID="inv-level" modules={modules} levels={isManagerInvite ? {} : levels} disabled={isManagerInvite} onChange={(m, l) => setLevels((x) => ({ ...x, [m]: l }))} />
        </View>

        <Glass testID="inv-sms-preview" radius={radii.sugg} pad={{ v: 14, h: 16 }} style={styles.sms}>
          <View style={styles.smsRow}>
            <View style={[styles.smsIco, { backgroundColor: c.surface }]}>
              <Icon name="message-square" size={18} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.smsH, { color: c.text }]}>{t("inv.smsTitle")}</Text>
              <Text style={[styles.smsT, { color: c.textMuted }]}>{smsText}</Text>
            </View>
          </View>
        </Glass>

        {note ? (
          <Note warn={note.warn} testID="inv-note">
            {note.text}
          </Note>
        ) : null}
        {result ? (
          <Glass testID="inv-result" radius={radii.sugg} pad={{ v: 14, h: 16 }} style={styles.sms}>
            <Text style={[styles.smsH, { color: c.text }]}>
              {result.sms === "sent" ? t("inv.sent", { phone: maskPhone(result.phone) }) : t("inv.linkReady", { phone: maskPhone(result.phone) })}
            </Text>
            {result.link && result.sms !== "sent" ? (
              <Text testID="inv-result-link" selectable style={[styles.link, { color: c.text, backgroundColor: c.chip.bg }]}>
                {result.link}
              </Text>
            ) : null}
            {until ? <Text style={[styles.smsT, { color: c.textMuted }]}>{t("inv.until", { d: until.date, m: until.month })}</Text> : null}
          </Glass>
        ) : null}

        {invites.length ? <Text style={[styles.label, { color: c.textDim }]}>{t("inv.pendingTitle", { n: invites.length })}</Text> : null}
        {invites.map((i) => (
          <InviteRow
            key={i.inviteId}
            invite={i}
            ids={ROW_IDS}
            busy={busy}
            onResend={canTouch(i) ? () => resend(i) : undefined}
            onCancel={canTouch(i) && !i.expired ? () => setCancelling(i) : undefined}
          />
        ))}
      </ScrollView>

      <View style={[styles.cta, { bottom: 26 + insets.bottom }]}>
        <PrimaryButton testID="inv-submit" label={busy ? t("inv.sending") : t("inv.submit")} disabled={!ready} onPress={() => void submit()} />
      </View>

      <Sheet visible={!!cancelling} onClose={() => setCancelling(null)} testID="inv-cancel-sheet" top={520}>
        <Text style={[styles.sh, { color: c.text }]}>{t("sec.staff.cancelTitle", { name: cancelling?.name || t("sec.staff.invitee") })}</Text>
        <Text style={[styles.sb, { color: c.textMuted }]}>{t("sec.staff.cancelBody")}</Text>
        <View style={styles.acts}>
          <Pressable testID="inv-cancel-sheet-no" accessibilityRole="button" onPress={() => setCancelling(null)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.staff.keep")}</Text>
          </Pressable>
          <Pressable testID="inv-cancel-sheet-ok" accessibilityRole="button" disabled={busy} onPress={() => void cancel()} style={[styles.btn, styles.main, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.staff.cancelOk")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  spacer: { width: size.iconBtn },
  flex: { flex: 1, minWidth: 0 },
  label: { fontSize: T.cap + 0.5, fontWeight: "600", marginTop: F.v(30), marginBottom: 8, marginLeft: 2 },
  input: { height: 50, borderRadius: radii.segIn + 4, borderWidth: 1, paddingHorizontal: 16, fontSize: T.body + 1 },
  hint: { fontSize: T.cap - 0.5, marginTop: 6, marginLeft: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grid: { gap: 10 },
  leftNote: { textAlign: "left", marginTop: 0, marginBottom: 8 },
  sms: { marginTop: 12 },
  smsRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  smsIco: { width: 38, height: 38, borderRadius: radii.k + 2, alignItems: "center", justifyContent: "center" },
  smsH: { fontSize: T.sub + 0.5, fontWeight: "700" },
  smsT: { fontSize: T.cap, lineHeight: 18, marginTop: 4 },
  link: { fontSize: T.sub, borderRadius: radii.k, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8, overflow: "hidden" },
  denied: { marginTop: F.v(20), alignItems: "center", gap: spacing.sm },
  deniedT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  cta: { position: "absolute", left: spacing.page, right: spacing.page },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  sb: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
});
