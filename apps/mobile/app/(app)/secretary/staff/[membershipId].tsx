// สิทธิ์ต่อคน (ใบ S2.22 · แบบ G3 sec-g.jpg หน้า 3 + sec-dark-g.jpg หน้า 3) — โซนทีม
//   ข้อมูล: GET secretary/staff (แถวของคนนี้: role · units · levels (ไม่มีแชท) · chat · active) · GET secretary/access (ระบบที่กิจการเปิด) · GET inbox/staff (เข้าเวร)
//   บทบาท (OWNER ตั้ง พนักงาน/ผู้จัดการ · MANAGER ตั้งได้แค่พนักงาน และแก้ได้เฉพาะเป้าหมายที่เป็นพนักงาน R-S1.25d)
//   หน่วย/สาขา · ระดับต่อระบบ 3 ขั้น (เฉพาะระดับที่โมดูลมี levelsAvailable · โมดูลที่มีแต่ OFF = ล็อก) · แชทลูกค้า NONE/VIEW/REPLY
//   บันทึก ⇒ PUT secretary/staff/[membershipId] {role, unitIds, levels (เฉพาะโมดูลที่แก้), chat (เมื่อแก้), extraPermissions}
//     ส่งเฉพาะที่แก้: ส่งระดับเดิมซ้ำ = เซิร์ฟเวอร์จัดคีย์ใหม่ทั้งโมดูล (คีย์รายตัวที่เคยให้ไว้จะเปลี่ยน) — ไม่ทำโดยผู้ใช้ไม่ได้กด
//     extraPermissions = {} (เซิร์ฟเวอร์ยังไม่บอกคีย์รายตัวที่ให้ได้ → ยังไม่มีช่องรายคีย์ · DTO-REQ ใน wo-notes)
//   ระงับชั่วคราว / เอาออกจากกิจการ = ยืนยัน 2 ขั้น (ชีต) ⇒ POST …/suspend | …/remove ⇒ กลับรายชื่อ
//   ตัวเอง / เจ้าของ / (MANAGER ดูคนที่ไม่ใช่พนักงาน) = อ่านอย่างเดียว ไม่มีปุ่ม
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, Icon, IconBtn, Note, PrimaryButton, Segment, Sheet, TopBar } from "@/src/components/airy";
import { ChatLevelPicker } from "@/src/components/secretary/ChatLevelPicker";
import { LevelGrid, gridModules, levelOf, levelsAvailable, offOnly, type ModuleLevel } from "@/src/components/secretary/LevelGrid";
import { roleLabel } from "@/src/components/secretary/AddMemberSheet";
import { dateBkk } from "@/src/components/secretary/bkk";
import {
  isDenied,
  normalizeStaff,
  normalizeUnits,
  putStaff,
  secGet,
  secPostId,
  serverNote,
  useActiveRole,
  type ChatLevel,
  type StaffPerson,
  type UnitOpt,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const ALL = "*";
type Role = "STAFF" | "MANAGER";
type Form = { role: string; units: string[]; levels: Record<string, string>; chat: ChatLevel };
const sameUnits = (a: string[], b: string[]) => [...a].sort().join(",") === [...b].sort().join(",");
/** R-S2.21a: เฉพาะ ["*"] = ทุกสาขา · [] = ยังไม่มีสาขา */
const allUnits = (u: string[]) => u.includes(ALL);
/** แชทลูกค้า 3 ระดับเท่านั้น (CHAT_LEVELS · R-S1.25h) — ค่าอื่นไม่ส่ง */
const isChatLevel = (v: string): v is ChatLevel => v === "NONE" || v === "VIEW" || v === "REPLY";
const CONFIRM_TEXT = {
  suspend: { title: "perm.suspend.title", body: "perm.suspend.body", ok: "perm.suspend.ok" },
  remove: { title: "perm.remove.title", body: "perm.remove.body", ok: "perm.remove.ok" },
} as const;

export default function StaffPermissionScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { activeTenantId } = useAuth();
  const actorRole = useActiveRole();
  const owner = actorRole === "OWNER";

  const [person, setPerson] = useState<StaffPerson | null>(null);
  const [missing, setMissing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [unitOpts, setUnitOpts] = useState<UnitOpt[]>([]);
  const [access, setAccess] = useState<string[]>([]);
  const [onDuty, setOnDuty] = useState(false);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"suspend" | "remove" | null>(null);

  const load = useCallback(async () => {
    const [s, a, d] = await Promise.allSettled([secGet("secretary/staff"), secGet("secretary/access"), secGet("inbox/staff")]);
    if (s.status === "rejected") {
      if (isDenied(s.reason)) setDenied(true);
      return;
    }
    const p = normalizeStaff(s.value).people.find((x) => x.membershipId === membershipId) ?? null;
    setUnitOpts(normalizeUnits(s.value));
    setPerson(p);
    setMissing(!p);
    if (a.status === "fulfilled") setAccess((a.value.items ?? []).map((x) => x.module));
    if (d.status === "fulfilled" && p) setOnDuty((d.value.items ?? []).some((x) => x.userId === p.userId && x.onDuty === true));
    if (p) {
      const f: Form = { role: p.role, units: p.units, levels: { ...p.levels }, chat: p.chat }; // ระดับดิบของ server (โมดูล OFF-only ที่มีคีย์รายตัว = ป้าย "ให้รายคีย์ไว้")
      setSaved(f);
      setForm(f);
    }
  }, [membershipId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, activeTenantId]),
  );

  const modules = useMemo(() => gridModules(access, person?.levels ?? {}), [access, person]);
  // ใครแก้ได้: OWNER แก้ทุกคนยกเว้นเจ้าของ/ตัวเอง · MANAGER แก้ได้เฉพาะพนักงาน (เซิร์ฟเวอร์ตรวจซ้ำ)
  const editable = !!person && !person.me && person.role !== "OWNER" && (owner || (actorRole === "MANAGER" && person.role === "STAFF"));
  const roleOptions: Role[] = owner ? ["STAFF", "MANAGER"] : ["STAFF"];
  const managerForm = form?.role === "MANAGER";

  // R-S2.21c: ลดผู้จัดการ → พนักงาน — ระดับที่แสดงของผู้จัดการคือค่าเต็มจาก staffViewOf (ไม่ใช่คีย์ที่เก็บจริง) ⇒ ส่งทุกโมดูลในกริด + แชท ตามที่เจ้าของเลือก
  const demoting = saved?.role === "MANAGER" && form?.role === "STAFF";
  const changedLevels = useMemo(() => {
    if (!form || !saved) return {};
    const out: Record<string, ModuleLevel> = {};
    for (const m of modules) {
      if (offOnly(m)) continue; // ระดับเดียว (ปิด) — ไม่ส่ง (คีย์รายตัวคงไว้)
      const l = levelOf(form.levels, m);
      // ส่งเฉพาะระดับที่โมดูลมีจริง (levelsAvailable) และต่างจากเดิม · ลดบทบาท = ส่งทั้งกริด
      if ((demoting || l !== levelOf(saved.levels, m)) && levelsAvailable(m).includes(l)) out[m] = l;
    }
    return out;
  }, [form, saved, modules, demoting]);
  const dirty = !!form && !!saved && (form.role !== saved.role || !sameUnits(form.units, saved.units) || form.chat !== saved.chat || Object.keys(changedLevels).length > 0);

  const toggleUnit = (id: string) =>
    setForm((f) => {
      if (!f) return f;
      if (id === ALL) return { ...f, units: [ALL] };
      const base = f.units.filter((u) => u !== ALL);
      const next = base.includes(id) ? base.filter((u) => u !== id) : [...base, id];
      return { ...f, units: next }; // ว่าง = ยังไม่มีสาขา (R-S2.21a)
    });

  // เลือกบทบาท: ผู้จัดการ → พนักงาน ⇒ กริดเริ่มที่ปิดทุกระบบ + แชทไม่เห็น ให้เจ้าของเลือกเอง (ไม่สืบค่าเต็มของผู้จัดการ) · กลับเป็นผู้จัดการ = ค่าที่โหลดมา
  const pickRole = (k: string) =>
    setForm((f) => {
      if (!f || !saved) return f;
      if (k === "STAFF" && saved.role === "MANAGER") return { ...f, role: k, levels: {}, chat: "NONE" };
      if (k === saved.role) return { ...f, role: k, levels: saved.levels, chat: saved.chat };
      return { ...f, role: k };
    });

  const save = async () => {
    if (!form || !saved || !dirty || !editable || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      // R-S2.21c: role / unitIds ส่งเฉพาะเมื่อเปลี่ยน
      await putStaff(membershipId, {
        ...(form.role !== saved.role ? { role: form.role === "MANAGER" ? "MANAGER" : "STAFF" } : {}),
        ...(!sameUnits(form.units, saved.units) ? { unitIds: form.units } : {}),
        levels: changedLevels,
        ...((demoting || form.chat !== saved.chat) && isChatLevel(form.chat) ? { chat: form.chat } : {}),
        extraPermissions: {},
      });
      setNote({ text: t("perm.saved"), warn: false });
      await load();
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("perm.saveFail"), warn: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const act = async () => {
    const kind = confirm;
    setConfirm(null);
    if (!kind || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      if (kind === "suspend") await secPostId("secretary/staff/[id]/suspend", membershipId, {});
      else await secPostId("secretary/staff/[id]/remove", membershipId, {});
      router.dismissTo("/secretary/staff"); // กลับรายชื่อ (ไม่อยู่ใน stack = แทนจอนี้)
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("perm.actFail"), warn: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/secretary/staff"));
  const unitNames = (u: string[]) =>
    allUnits(u) ? t("perm.unitAll") : u.length === 0 ? t("perm.unitNone") : u.map((id) => unitOpts.find((x) => x.id === id)?.name ?? t("perm.unitOne")).join(", ");
  const jd = dateBkk(person?.joinedAt);
  const sub = person
    ? [
        unitNames(person.units),
        roleLabel(t, person.role),
        ...(onDuty ? [t("sec.staff.onDuty")] : []),
        ...(!person.active ? [t("sec.staff.suspended")] : []),
        ...(jd ? [t("perm.joined", { d: jd.date, month: t(`sec.month.${jd.month}` as I18nKey) })] : []),
      ].join(" · ")
    : "";
  const name = person?.name || t("sec.room.someone");
  const ct = CONFIRM_TEXT[confirm === "remove" ? "remove" : "suspend"];

  return (
    <AiryScreen testID="perm">
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <TopBar testID="perm-top" left={<IconBtn testID="perm-back" icon="chevron-left" label={t("sec.set.back")} onPress={back} />} title={person ? name : t("perm.title")} subtitle={sub} right={<View style={styles.spacer} />} />

        {denied || missing ? (
          <Glass testID="perm-missing" style={styles.denied}>
            <Icon name="lock" size={22} color={c.textMuted} />
            <Text style={[styles.deniedT, { color: c.text }]}>{denied ? t("sec.staff.denied") : t("perm.missing")}</Text>
          </Glass>
        ) : null}

        {person && form ? (
          <>
            {!editable ? (
              <Note testID="perm-readonly" style={styles.leftNote}>
                {person.me ? t("perm.readonly.me") : person.role === "OWNER" ? t("perm.readonly.owner") : t("perm.readonly.manager")}
              </Note>
            ) : null}
            <Text style={[styles.label, { color: c.textDim }]}>{t("perm.role")}</Text>
            <Segment
              testID="perm-role"
              value={form.role}
              onChange={(k) => editable && pickRole(k)}
              options={(editable ? roleOptions : [person.role]).map((r) => ({ key: r, label: roleLabel(t, r) }))}
            />

            <Text style={[styles.label, { color: c.textDim }]}>{t("perm.units")}</Text>
            <View testID="perm-unit" style={styles.chips}>
              <Chip testID="perm-unit-all" active={allUnits(form.units)} label={t("perm.unitAll")} onPress={editable ? () => toggleUnit(ALL) : undefined} />
              {unitOpts.map((u) => (
                <Chip key={u.id} testID={`perm-unit-${u.id}`} active={!allUnits(form.units) && form.units.includes(u.id)} label={u.name} onPress={editable ? () => toggleUnit(u.id) : undefined} />
              ))}
            </View>

            <Text style={[styles.label, { color: c.textDim }]}>{t("perm.levels")}</Text>
            {managerForm ? (
              <Note testID="perm-manager-full" style={styles.leftNote}>
                {t("perm.managerFull")}
              </Note>
            ) : null}
            <View style={styles.grid}>
              <ChatLevelPicker testID="perm-chat" value={managerForm ? "REPLY" : form.chat} onChange={(v) => setForm((f) => (f ? { ...f, chat: v } : f))} disabled={!editable || managerForm} hint={unitNames(form.units)} />
              <LevelGrid
                testID="perm-level"
                modules={modules}
                levels={form.levels}
                disabled={!editable || managerForm}
                onChange={(m, l) => setForm((f) => (f ? { ...f, levels: { ...f.levels, [m]: l } } : f))}
              />
            </View>
            <Text style={[styles.foot, { color: c.textMuted }]}>{t("perm.foot", { name })}</Text>

            {note ? (
              <Note warn={note.warn} testID="perm-note">
                {note.text}
              </Note>
            ) : null}
            {editable ? (
              <>
                <View style={styles.save}>
                  <PrimaryButton testID="perm-save" label={busy ? t("sec.set.saving") : t("sec.set.save")} disabled={!dirty || busy} onPress={() => void save()} />
                </View>
                <View style={styles.acts}>
                  <Pressable testID="perm-suspend" accessibilityRole="button" disabled={busy || !person.active} onPress={() => setConfirm("suspend")} style={[glassStyle(c, size.iconBtn / 2), styles.btn, !person.active && styles.dim]}>
                    <Text style={[styles.btnT, { color: c.text }]}>{person.active ? t("perm.suspend") : t("sec.staff.suspended")}</Text>
                  </Pressable>
                  <Pressable testID="perm-remove" accessibilityRole="button" disabled={busy} onPress={() => setConfirm("remove")} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
                    <Text style={[styles.btnT, { color: c.bad.fg }]}>{t("perm.remove")}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} testID="perm-confirm" top={470}>
        <Text style={[styles.sh, { color: c.text }]}>{t(ct.title, { name })}</Text>
        <Text style={[styles.sb, { color: c.textMuted }]}>{t(ct.body)}</Text>
        <View style={styles.acts}>
          <Pressable testID="perm-confirm-no" accessibilityRole="button" onPress={() => setConfirm(null)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("perm.keep")}</Text>
          </Pressable>
          <Pressable testID="perm-confirm-ok" accessibilityRole="button" disabled={busy} onPress={() => void act()} style={[styles.btn, styles.main, { backgroundColor: confirm === "remove" ? c.bad.fg : c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t(ct.ok)}</Text>
          </Pressable>
        </View>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  spacer: { width: size.iconBtn },
  label: { fontSize: T.cap + 0.5, fontWeight: "600", marginTop: F.v(30), marginBottom: 8, marginLeft: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grid: { gap: 10 },
  leftNote: { textAlign: "left", marginTop: 8 },
  foot: { fontSize: T.cap - 0.5, lineHeight: 18, marginTop: 12, marginLeft: 2 },
  save: { marginTop: spacing.lg },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn + 2, borderRadius: (size.iconBtn + 2) / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.4 },
  btnT: { fontSize: T.sub + 0.5, fontWeight: "700" },
  dim: { opacity: 0.55 },
  denied: { marginTop: F.v(40), alignItems: "center", gap: spacing.sm },
  deniedT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  sb: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
});
