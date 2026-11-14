// ตั้งค่ากิจการ (14 พ.ย. 2026 · แบบ bizgear Ⓑ + bizsheet4 จอ ④ + bizdelete /root/mockups/secretary-1114/) — เข้าจาก ⚙ ท้ายแถวกิจการในตัวสลับกิจการ (B1)
//   หัว: ‹ กลับ · "ตั้งค่ากิจการ" · ชื่อกิจการ · รูปโปรไฟล์ร้านวงกลมใหญ่ (โลโก้ · ไม่มี = ตัวย่อบนสีร้าน) + ป้ายกล้องดำ + "เปลี่ยนรูปโปรไฟล์ร้าน"
//     แตะรูป/ลิงก์ = ชีต: ถ่ายรูปใหม่ · เลือกจากคลังรูป · ใช้ตัวย่อ (XX) แทนรูป (แดง · มีโลโก้เท่านั้น) — ครอปจัตุรัส 1:1 → POST โลโก้ → refreshMe (ไอคอนร้านทุกที่)
//   ขอลบไว้ (PENDING_DELETE): การ์ดแดงบนสุด "⚠ กิจการนี้จะถูกลบ <วัน พ.ศ.>" + อีก N วัน + ปุ่มดำ "ยกเลิกการลบ" (OWNER · ยืนยันก่อน)
//   ข้อมูลกิจการ: ชื่อ·ประเภทธุรกิจ · ที่อยู่·เบอร์·เลขผู้เสียภาษี·สาขา (ใช้บนใบเสร็จ/ใบกำกับ) · เวลาทำการ (รายวัน เปิด/ปิด) — แตะแถว = ชีตแก้ + บันทึก
//   ระบบและเลขา: ระบบของร้าน (N ระบบ → หน้าเว็บ /app/settings/systems ในแดชบอร์ด) · ระบบที่เลขาเข้าถึงได้ · งานที่ต้องอนุมัติก่อน ·
//     ความรู้ของกิจการ · ตอบลูกค้านอกเวลา · โควตางาน·แพ็กเกจ · เลขาของฉัน·ตั้งค่า → หน้าเดิมใน /secretary/settings/*
//   อันตราย (OWNER เท่านั้น · ตรงกับหน้าเว็บ /app/settings/privacy): ส่งออกข้อมูลร้าน (ลิงก์ดาวน์โหลด 5 นาที เปิดในเบราว์เซอร์) ·
//     ลบกิจการ → ชีตยืนยัน พิมพ์ชื่อร้านให้ตรงก่อนกด "ขอลบกิจการ" (ลบจริงหลัง 30 วัน · ยกเลิกได้จากหน้านี้)
// กิจการ = พารามิเตอร์ tenantId (ไม่ใช่กิจการ active) — ข้อมูลกิจการ + ค่าสรุปด้านขวา ยิงด้วย x-tenant-id ของกิจการนี้ (ไม่ต้องสลับ)
//   หน้าเลขา/แพ็กเกจเดิมทำงานกับกิจการ active ⇒ แตะแถวของกิจการที่ไม่ได้ใช้อยู่ = switchTenant ก่อน แล้วค่อยเปิดหน้า (ป้ายบอกใต้หัวกลุ่ม)
// สิทธิ์: OWNER/MANAGER (บทบาทจาก /me · เซิร์ฟเวอร์ตรวจซ้ำ 403) · ชื่อกิจการแก้ได้เฉพาะ OWNER
//   ที่อยู่/เบอร์/เลขภาษี/สาขา = `can.editTax` จากเซิร์ฟเวอร์ (สิทธิ์ตั้งค่าบัญชีแบบเว็บ) · ไม่มี = แถวอ่านอย่างเดียว + คำอธิบาย
// ที่เก็บจริง (ไม่มีของซ้ำ): ที่อยู่/เบอร์/เลขภาษี/สาขา = ตั้งค่าสมุดบัญชีหลัก · เวลาทำการ = เวลาทำการของระบบแชท (ตัวที่ "ตอบนอกเวลา" ใช้)
import { useCallback, useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Chip, Icon, LoadError, Loading, Note, PrimaryButton, SectionLabel, Segment, Sheet, type IconName } from "@/src/components/airy";
import { SettingRow, SettingsTop, Toggle } from "@/src/components/secretary/SettingRow";
import { bizColor, bizInitials } from "@/src/components/secretary/SecTopBar";
import {
  BIZ_HQ_BRANCH,
  BIZ_LOGO_MAX_BYTES,
  BIZ_SETTING_ROLES,
  TENANT_TYPES,
  businessExportLink,
  cancelBusinessDeletion,
  daysUntil,
  deleteBusinessLogo,
  getBusiness,
  hoursSummary,
  isDenied,
  isThaiTaxId,
  patchBusiness,
  quotaNumbers,
  requestBusinessDeletion,
  secGet,
  serverNote,
  shortDate,
  uploadBusinessLogo,
  type BusinessDay,
  type BusinessPatch,
  type BusinessProfile,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useLang, useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const NAME_MIN = 2;
const NAME_MAX = 60;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
/** ลำดับวันบนจอ: จันทร์ → อาทิตย์ (ค่า d ตามเซิร์ฟเวอร์ 0 = อาทิตย์) */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_KEYS: Record<number, I18nKey> = { 0: "bizset.day.0", 1: "bizset.day.1", 2: "bizset.day.2", 3: "bizset.day.3", 4: "bizset.day.4", 5: "bizset.day.5", 6: "bizset.day.6" };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Edit = "basic" | "docs" | "hours" | null;
/** ชีตที่สอง: รูปโปรไฟล์ร้าน · ยืนยันลบกิจการ · ยืนยันยกเลิกการลบ */
type Action = "photo" | "delete" | "undelete" | null;
const AVATAR = 96;
type Summary = { access: number | null; rules: number | null; afterHours: boolean | null; pct: number | null };
type DayForm = { on: boolean; open: string; close: string };
const EMPTY_SUMMARY: Summary = { access: null, rules: null, afterHours: null, pct: null };

export default function BusinessSettingsScreen() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { tenantId: raw } = useLocalSearchParams<{ tenantId: string }>();
  const tenantId = typeof raw === "string" ? raw : "";
  const { tenants, activeTenantId, switchTenant, refreshMe } = useAuth();
  const row = tenants.find((x) => x.tenantId === tenantId) ?? null;
  const allowed = !!row && BIZ_SETTING_ROLES.includes(row.role);
  const owner = row?.role === "OWNER";
  const isActive = tenantId === activeTenantId;

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "denied">("loading");
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [canTax, setCanTax] = useState(false);
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<Edit>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [confirmName, setConfirmName] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerNote, setDangerNote] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  // ฟอร์มของชีต (เติมจาก profile ตอนเปิด)
  const [name, setName] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [hq, setHq] = useState(true);
  const [branchCode, setBranchCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [days, setDays] = useState<Record<number, DayForm>>({});

  useFocusEffect(
    useCallback(() => {
      if (!tenantId || !allowed) return;
      let live = true;
      getBusiness(tenantId)
        .then((r) => {
          if (!live) return;
          setProfile(r.profile);
          setCanTax(!!r.can?.editTax);
          setState("ok");
        })
        .catch((e) => live && setState((cur) => (cur === "ok" ? cur : isDenied(e) ? "denied" : "error")));
      // ค่าสรุปด้านขวา — ยิงในนามกิจการนี้ · พลาด/ไม่มีสิทธิ์ (เช่น ผู้จัดการอ่านตอบนอกเวลาไม่ได้) = ไม่แสดงค่า
      const opts = { tenantId };
      void Promise.all([
        secGet("secretary/access", undefined, opts).catch(() => null),
        secGet("secretary/rules", undefined, opts).catch(() => null),
        secGet("secretary/after-hours", undefined, opts).catch(() => null),
        secGet("secretary/quota", undefined, opts).catch(() => null),
      ]).then(([acc, rules, ah, q]) => {
        if (!live) return;
        setSummary({
          access: acc ? (acc.items ?? []).filter((i) => i.level !== "OFF").length : null,
          rules: rules ? Object.values(rules.rules ?? {}).filter((r) => r?.enabled).length : null,
          afterHours: ah ? !!ah.reply : null,
          pct: q ? quotaNumbers(q).pct : null,
        });
      });
      return () => {
        live = false;
      };
    }, [tenantId, allowed, tick]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace("/secretary"));
  const retry = () => {
    setState("loading");
    setTick((x) => x + 1);
  };

  // ── ชีตแก้ ──
  const open = (k: Exclude<Edit, null>) => {
    if (!profile) return;
    setNote(null);
    if (k === "basic") {
      setName(profile.name);
      setType(profile.businessType);
    } else if (k === "docs" && profile.docs) {
      const d = profile.docs;
      setAddress(d.address ?? "");
      setPhone(d.phone ?? "");
      setTaxId(d.taxId ?? "");
      setHq((d.branchCode || BIZ_HQ_BRANCH) === BIZ_HQ_BRANCH);
      setBranchCode(d.branchCode === BIZ_HQ_BRANCH ? "" : d.branchCode);
      setBranchName(d.branchName ?? "");
    } else if (k === "hours") {
      const m: Record<number, DayForm> = {};
      const firstOpen = profile.hours.days[0];
      for (const d of WEEK) {
        const hit = profile.hours.days.find((x) => x.d === d);
        m[d] = hit ? { on: true, open: hit.open, close: hit.close } : { on: profile.hours.days.length === 0, open: firstOpen?.open ?? "09:00", close: firstOpen?.close ?? "18:00" };
      }
      setDays(m);
    }
    setEdit(k);
  };
  const close = () => !busyRef.current && setEdit(null);

  const nameLen = Array.from(name.trim()).length;
  const nameOk = nameLen >= NAME_MIN && nameLen <= NAME_MAX;
  const taxDigits = taxId.replace(/[\s-]/g, "");
  const taxOk = taxDigits === "" || isThaiTaxId(taxDigits);
  const branchOk = hq || /^\d{5}$/.test(branchCode.trim());
  const hoursBad = WEEK.find((d) => days[d]?.on && (!TIME_RE.test(days[d].open) || !TIME_RE.test(days[d].close) || days[d].open >= days[d].close));
  const canSave = edit === "basic" ? nameOk || !owner : edit === "docs" ? taxOk && branchOk : edit === "hours" ? hoursBad === undefined : false;

  const save = async () => {
    if (!edit || !profile || !canSave || busyRef.current) return;
    let body: BusinessPatch = {};
    if (edit === "basic") body = { ...(owner && name.trim() !== profile.name ? { name: name.trim() } : {}), ...(type !== profile.businessType ? { businessType: type } : {}) };
    else if (edit === "docs")
      body = {
        address: address.trim() || null,
        phone: phone.trim() || null,
        taxId: taxDigits || null,
        branchCode: hq ? BIZ_HQ_BRANCH : branchCode.trim(),
        branchName: hq ? t("bizset.docs.hqName") : branchName.trim() || null,
      };
    else if (edit === "hours") body = { hours: { days: WEEK.filter((d) => days[d]?.on).map((d): BusinessDay => ({ d, open: days[d].open, close: days[d].close })) } };
    if (Object.keys(body).length === 0) {
      setEdit(null);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      const r = await patchBusiness(tenantId, body);
      setProfile(r.profile);
      setCanTax(!!r.can?.editTax);
      setEdit(null);
      setNote({ text: t("bizset.saved"), warn: false });
      if (body.name !== undefined || body.businessType !== undefined) void refreshMe(); // ชื่อ/ประเภทในรายชื่อกิจการ + แถบบน
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("sec.set.saveFail"), warn: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // ── โลโก้ ──
  const pickLogo = async (from: "camera" | "library") => {
    if (logoBusy) return;
    setAction(null);
    setNote(null);
    const perm = from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote({ text: t(from === "camera" ? "bizset.photo.camPerm" : "help.attach.perm"), warn: true });
      return;
    }
    // ครอปจัตุรัส 1:1 (รูปวงกลมทุกที่) · quality < 1 ⇒ เครื่องเข้ารหัสใหม่เป็น JPEG
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1], exif: false };
    const res = from === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setLogoBusy(true);
    try {
      let mime = (a.mimeType ?? "image/jpeg").toLowerCase();
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(a.uri)).blob();
        if (blob.type) mime = blob.type.toLowerCase();
        if (!LOGO_TYPES.includes(mime)) throw new Error("type");
        if (blob.size > BIZ_LOGO_MAX_BYTES) throw new Error("big");
        form.append("file", blob, `logo.${LOGO_EXT[mime]}`);
      } else {
        if (!LOGO_TYPES.includes(mime)) mime = "image/jpeg"; // quality < 1 ⇒ เครื่องเข้ารหัส JPEG ใหม่ (HEIC → JPEG) · เซิร์ฟเวอร์ตรวจเนื้อไฟล์ซ้ำ
        if ((a.fileSize ?? 0) > BIZ_LOGO_MAX_BYTES) throw new Error("big");
        form.append("file", { uri: a.uri, name: `logo.${LOGO_EXT[mime]}`, type: mime } as unknown as Blob);
      }
      const up = await uploadBusinessLogo(tenantId, form);
      setProfile((p) => (p ? { ...p, logoUrl: up.logoUrl } : p));
      void refreshMe(); // ไอคอนกิจการ (BizIcon) ทุกที่
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setNote({ text: m === "big" ? t("bizset.logo.big") : m === "type" ? t("bizset.logo.type") : (serverNote(e) ?? t("bizset.logo.fail")), warn: true });
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = async () => {
    if (logoBusy) return;
    setAction(null);
    setLogoBusy(true);
    setNote(null);
    try {
      await deleteBusinessLogo(tenantId);
      setProfile((p) => (p ? { ...p, logoUrl: null } : p));
      void refreshMe();
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("bizset.logo.fail"), warn: true });
    } finally {
      setLogoBusy(false);
    }
  };

  // ── แถวเลขา/แพ็กเกจ: หน้าเดิมทำงานกับกิจการ active ⇒ สลับก่อนถ้ายังไม่ได้ใช้อยู่ ──
  const goActive = async (path: Href) => {
    if (!isActive) await switchTenant(tenantId);
    router.push(path);
  };
  // ระบบของร้าน = หน้าเว็บ /app/settings/systems ในแดชบอร์ด (WebView ใช้กิจการ active ⇒ สลับก่อน)
  const openSystems = () => void goActive({ pathname: "/", params: { open: "/app/settings/systems", t: String(Date.now()) } });

  // ── อันตราย (OWNER) ──
  const deletion = profile?.deletion ?? null;
  const openAction = (k: Exclude<Action, null>) => {
    setDangerNote(null);
    setConfirmName("");
    setAction(k);
  };
  const closeAction = () => !dangerBusy && setAction(null);
  const nameMatches = !!profile && confirmName.trim() === profile.name.trim() && confirmName.trim() !== "";
  const doDelete = async () => {
    if (!profile || !nameMatches || dangerBusy) return;
    setDangerBusy(true);
    setDangerNote(null);
    try {
      const r = await requestBusinessDeletion(tenantId, confirmName.trim());
      setProfile((p) => (p ? { ...p, deletion: r.deletion } : p));
      setAction(null);
      setNote({ text: t("bizset.del.done"), warn: false });
    } catch (e) {
      setDangerNote(serverNote(e) ?? t("bizset.del.fail"));
    } finally {
      setDangerBusy(false);
    }
  };
  const doUndelete = async () => {
    if (dangerBusy) return;
    setDangerBusy(true);
    setDangerNote(null);
    try {
      await cancelBusinessDeletion(tenantId);
      setProfile((p) => (p ? { ...p, deletion: null } : p));
      setAction(null);
      setNote({ text: t("bizset.del.cancelled"), warn: false });
    } catch (e) {
      setDangerNote(serverNote(e) ?? t("bizset.del.fail"));
    } finally {
      setDangerBusy(false);
    }
  };
  // ส่งออก = ขอลิงก์ดาวน์โหลดอายุสั้นจากเซิร์ฟเวอร์ แล้วเปิดในเบราว์เซอร์ของเครื่อง (แอปไม่มีโมดูลไฟล์/แชร์ native)
  const doExport = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setNote(null);
    try {
      const { url } = await businessExportLink(tenantId);
      await Linking.openURL(url);
      setNote({ text: t("bizset.export.opened"), warn: false });
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("bizset.export.fail"), warn: true });
    } finally {
      setExportBusy(false);
    }
  };

  const name0 = profile?.name ?? row?.name ?? "";
  const typeLabel = profile?.businessType ? t(`biz.type.${profile.businessType}` as I18nKey) : undefined;
  const docs = profile?.docs ?? null;
  const hoursText = profile ? (profile.hours.available ? (hoursSummary(profile.hours.days) ?? t("bizset.hours.unset")) : undefined) : undefined;
  const secRows: { key: string; icon: IconName; title: I18nKey; path: Href; value?: string }[] = [
    { key: "access", icon: "key", title: "bizset.sec.access", path: "/secretary/settings/access", value: summary.access === null ? undefined : t("bizset.sec.accessN", { n: summary.access }) },
    { key: "rules", icon: "shield", title: "bizset.sec.rules", path: "/secretary/settings/rules", value: summary.rules === null ? undefined : t("bizset.sec.rulesN", { n: summary.rules }) },
    { key: "knowledge", icon: "book-open", title: "bizset.sec.knowledge", path: "/secretary/settings/knowledge" },
    { key: "customers", icon: "message-square", title: "bizset.sec.customers", path: "/secretary/settings/customers", value: summary.afterHours === null ? undefined : t(summary.afterHours ? "bizset.on" : "bizset.off") },
    { key: "quota", icon: "pie-chart", title: "bizset.row.quota", path: "/secretary/settings/quota", value: summary.pct === null ? undefined : t("bizset.quotaPct", { n: summary.pct }) },
    { key: "mysec", icon: "user", title: "bizset.sec.mine", path: "/secretary/settings" },
  ];
  const initials = bizInitials(name0);

  return (
    <AiryScreen testID="biz-set">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SettingsTop testID="biz-set-top" title={t("bizset.title")} subtitle={name0} />
        {!allowed ? (
          <LoadError testID="biz-set-denied" denied message={t("bizset.denied")} />
        ) : state === "loading" ? (
          <Loading testID="biz-set-loading" />
        ) : state !== "ok" || !profile ? (
          <LoadError testID="biz-set-error" denied={state === "denied"} onRetry={retry} />
        ) : (
          <>
            <View style={styles.hero}>
              <Pressable testID="biz-set-logo" accessibilityRole="button" accessibilityLabel={t("bizset.photo.change")} onPress={() => openAction("photo")} style={styles.logoWrap}>
                <View style={[styles.logo, { backgroundColor: profile.logoUrl ? c.surface : bizColor(profile.name, row?.branding?.accent) }]}>
                  {profile.logoUrl ? (
                    <Image source={{ uri: profile.logoUrl }} style={styles.logoImg} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.logoT, { color: row?.branding?.accentFg ?? "#FFFFFF" }]}>{initials}</Text>
                  )}
                </View>
                <View pointerEvents="none" style={[styles.logoEdit, { backgroundColor: c.accent, borderColor: c.surface }]}>
                  <Icon name={logoBusy ? "loader" : "camera"} size={14} color={c.onAccent} />
                </View>
              </Pressable>
              <Pressable testID="biz-set-photo-link" accessibilityRole="button" onPress={() => openAction("photo")} hitSlop={8}>
                <Text style={[styles.link, { color: c.legacy.blue }]}>{t("bizset.photo.change")}</Text>
              </Pressable>
              <Text testID="biz-set-name" style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {profile.name}
              </Text>
              <Text style={[styles.role, { color: c.textMuted }]}>{t(owner ? "bizset.youOwner" : "bizset.youManager")}</Text>
            </View>

            {deletion ? (
              <View testID="biz-set-pending-delete" style={[styles.warnCard, { borderColor: c.danger.bg, backgroundColor: c.legacy.dangerDim }]}>
                <Text style={[styles.warnT, { color: c.danger.bg }]}>{t("bizset.del.pendingTitle", { date: shortDate(deletion.purgeAt, lang) })}</Text>
                <Text style={[styles.warnSub, { color: c.danger.bg }]}>{t("bizset.del.pendingSub", { n: daysUntil(deletion.purgeAt) })}</Text>
                {owner ? (
                  <Pressable testID="biz-set-undelete" accessibilityRole="button" onPress={() => openAction("undelete")} style={[styles.darkBtn, { backgroundColor: c.accent }]}>
                    <Text style={[styles.darkBtnT, { color: c.onAccent }]}>{t("bizset.del.cancel")}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.warnSub, { color: c.textMuted }]}>{t("bizset.del.ownerCancels")}</Text>
                )}
              </View>
            ) : null}

            {note && !edit && !action ? (
              <Note warn={note.warn} testID="biz-set-note">
                {note.text}
              </Note>
            ) : null}

            <SectionLabel>{t("bizset.group.info")}</SectionLabel>
            <SettingRow testID="biz-set-row-basic" icon="briefcase" title={t("bizset.row.basic")} value={typeLabel} onPress={() => open("basic")} />
            <SettingRow
              testID="biz-set-row-docs"
              icon="map-pin"
              title={t("bizset.row.docs")}
              sub={!docs ? t("bizset.docs.noBook") : canTax ? t("bizset.row.docsSub") : t("bizset.docs.noPerm")}
              value={docs?.taxId ? t("bizset.docs.taxSet") : undefined}
              onPress={docs && canTax ? () => open("docs") : undefined}
            />
            <SettingRow
              testID="biz-set-row-hours"
              icon="clock"
              title={t("bizset.row.hours")}
              sub={profile.hours.available ? undefined : t("bizset.hours.noChat")}
              value={hoursText}
              onPress={profile.hours.available ? () => open("hours") : undefined}
            />

            <SectionLabel>{t("bizset.group.sec")}</SectionLabel>
            {!isActive ? <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.switchHint")}</Text> : null}
            <SettingRow
              testID="biz-set-row-systems"
              icon="grid"
              title={t("bizset.sys.title")}
              sub={t("bizset.sys.sub")}
              value={typeof profile.systemCount === "number" ? t("bizset.sec.accessN", { n: profile.systemCount }) : undefined}
              onPress={openSystems}
            />
            {secRows.map((r) => (
              <SettingRow key={r.key} testID={`biz-set-row-${r.key}`} icon={r.icon} title={t(r.title)} value={r.value} onPress={() => void goActive(r.path)} />
            ))}

            {owner ? (
              <>
                <SectionLabel style={{ color: c.danger.bg }} testID="biz-set-danger-label">
                  {t("bizset.group.danger")}
                </SectionLabel>
                <View testID="biz-set-danger" style={[styles.dangerBox, { borderColor: c.danger.bg }]}>
                  <SettingRow testID="biz-set-row-export" icon={exportBusy ? "loader" : "package"} title={t("bizset.export.title")} sub={t("bizset.export.sub")} onPress={() => void doExport()} />
                  {deletion ? null : <SettingRow testID="biz-set-row-delete" icon="trash-2" danger title={t("bizset.del.title")} sub={t("bizset.del.sub")} onPress={() => openAction("delete")} />}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet testID="biz-set-sheet" visible={edit !== null} onClose={close} top={90}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
          {edit === "basic" ? (
            <>
              <Text style={[styles.sh, { color: c.text }]}>{t("bizset.row.basic")}</Text>
              <Text style={[styles.label, { color: c.textDim }]}>{t("biz.name")}</Text>
              <TextInput
                testID="biz-set-in-name"
                value={name}
                onChangeText={setName}
                editable={owner}
                maxLength={NAME_MAX + 10}
                placeholder={t("biz.namePh")}
                placeholderTextColor={c.placeholder}
                style={[styles.input, { color: owner ? c.text : c.textMuted, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
              />
              {!owner ? <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.nameOwnerOnly")}</Text> : !nameOk ? <Note warn>{t("bizset.nameRule", { a: NAME_MIN, b: NAME_MAX })}</Note> : null}
              <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.type")}</Text>
              <View style={styles.chips}>
                {TENANT_TYPES.map((k) => (
                  <Chip key={k} testID={`biz-set-type-${k}`} active={type === k} label={t(`biz.type.${k}` as I18nKey)} onPress={() => setType(k)} />
                ))}
              </View>
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.logoHint")}</Text>
            </>
          ) : edit === "docs" ? (
            <>
              <Text style={[styles.sh, { color: c.text }]}>{t("bizset.row.docs")}</Text>
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.docs.where", { book: docs?.bookName ?? "" })}</Text>
              <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.docs.address")}</Text>
              <TextInput
                testID="biz-set-in-address"
                value={address}
                onChangeText={setAddress}
                multiline
                maxLength={500}
                placeholder={t("bizset.docs.addressPh")}
                placeholderTextColor={c.placeholder}
                style={[styles.input, styles.multi, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
              />
              <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.docs.phone")}</Text>
              <TextInput testID="biz-set-in-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} placeholderTextColor={c.placeholder} style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]} />
              <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.docs.taxId")}</Text>
              <TextInput
                testID="biz-set-in-tax"
                value={taxId}
                onChangeText={setTaxId}
                keyboardType="number-pad"
                maxLength={17}
                placeholder="0000000000000"
                placeholderTextColor={c.placeholder}
                style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
              />
              {!taxOk ? <Note warn testID="biz-set-tax-error">{t("bizset.docs.taxBad")}</Note> : null}
              <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.docs.branch")}</Text>
              <Segment
                testID="biz-set-branch"
                value={hq ? "hq" : "branch"}
                onChange={(k) => setHq(k === "hq")}
                options={[
                  { key: "hq", label: t("bizset.docs.hq") },
                  { key: "branch", label: t("bizset.docs.branchOpt") },
                ]}
              />
              {!hq ? (
                <>
                  <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.docs.branchCode")}</Text>
                  <TextInput testID="biz-set-in-branch" value={branchCode} onChangeText={setBranchCode} keyboardType="number-pad" maxLength={5} placeholder="00001" placeholderTextColor={c.placeholder} style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]} />
                  {!branchOk ? <Note warn>{t("bizset.docs.branchBad")}</Note> : null}
                  <Text style={[styles.label, { color: c.textDim }]}>{t("bizset.docs.branchName")}</Text>
                  <TextInput testID="biz-set-in-branch-name" value={branchName} onChangeText={setBranchName} maxLength={120} placeholderTextColor={c.placeholder} style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]} />
                </>
              ) : null}
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.docs.legal")}</Text>
            </>
          ) : edit === "hours" ? (
            <>
              <Text style={[styles.sh, { color: c.text }]}>{t("bizset.row.hours")}</Text>
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.hours.hint")}</Text>
              {WEEK.map((d) => {
                const f = days[d] ?? { on: false, open: "09:00", close: "18:00" };
                const set = (p: Partial<DayForm>) => setDays((cur) => ({ ...cur, [d]: { ...f, ...p } }));
                return (
                  <View key={d} testID={`biz-set-day-${d}`} style={[styles.day, { borderColor: c.divider }]}>
                    <Text style={[styles.dayT, { color: c.text }]}>{t(DAY_KEYS[d])}</Text>
                    {f.on ? (
                      <View style={styles.times}>
                        <TextInput testID={`biz-set-day-${d}-open`} value={f.open} onChangeText={(v) => set({ open: v })} maxLength={5} keyboardType="numbers-and-punctuation" style={[styles.time, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]} />
                        <Text style={{ color: c.textMuted }}>–</Text>
                        <TextInput testID={`biz-set-day-${d}-close`} value={f.close} onChangeText={(v) => set({ close: v })} maxLength={5} keyboardType="numbers-and-punctuation" style={[styles.time, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]} />
                      </View>
                    ) : (
                      <Text style={[styles.closed, { color: c.textMuted }]}>{t("bizset.hours.closed")}</Text>
                    )}
                    <Toggle testID={`biz-set-day-${d}-on`} value={f.on} onChange={(v) => set({ on: v })} label={t(DAY_KEYS[d])} />
                  </View>
                );
              })}
              {hoursBad !== undefined ? <Note warn testID="biz-set-hours-error">{t("bizset.hours.bad", { day: t(DAY_KEYS[hoursBad]) })}</Note> : null}
            </>
          ) : null}
          {note && edit ? (
            <Note warn={note.warn} testID="biz-set-sheet-note">
              {note.text}
            </Note>
          ) : null}
          <View style={styles.save}>
            <PrimaryButton testID="biz-set-save" label={busy ? t("sec.set.saving") : t("sec.set.save")} disabled={!canSave || busy} onPress={() => void save()} />
          </View>
        </ScrollView>
      </Sheet>
      <Sheet testID="biz-set-action" visible={action !== null} onClose={closeAction} top={action === "photo" ? 380 : 150}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
          {action === "photo" ? (
            <>
              <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.divider }]}>
                <Pressable testID="biz-set-photo-camera" accessibilityRole="button" onPress={() => void pickLogo("camera")} style={styles.menuRow}>
                  <Text style={[styles.menuT, { color: c.text }]}>{t("bizset.photo.camera")}</Text>
                </Pressable>
                <View style={[styles.menuSep, { backgroundColor: c.divider }]} />
                <Pressable testID="biz-set-photo-library" accessibilityRole="button" onPress={() => void pickLogo("library")} style={styles.menuRow}>
                  <Text style={[styles.menuT, { color: c.text }]}>{t("bizset.photo.library")}</Text>
                </Pressable>
                {profile?.logoUrl ? (
                  <>
                    <View style={[styles.menuSep, { backgroundColor: c.divider }]} />
                    <Pressable testID="biz-set-photo-initials" accessibilityRole="button" onPress={() => void removeLogo()} style={styles.menuRow}>
                      <Text style={[styles.menuT, { color: c.danger.bg }]}>{t("bizset.photo.initials", { x: initials })}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("bizset.photo.where")}</Text>
            </>
          ) : action === "delete" && profile ? (
            <>
              <Text style={[styles.sh, { color: c.text }]}>{t("bizset.del.sheetTitle", { name: profile.name })}</Text>
              {(["bizset.del.b1", "bizset.del.b2", "bizset.del.b3"] as const).map((k) => (
                <Text key={k} style={[styles.bullet, { color: c.textDim }]}>
                  {`•  ${t(k)}`}
                </Text>
              ))}
              <TextInput
                testID="biz-set-del-name"
                value={confirmName}
                onChangeText={setConfirmName}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={200}
                placeholder={t("bizset.del.typeName")}
                placeholderTextColor={c.placeholder}
                style={[styles.input, styles.delInput, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
              />
              {dangerNote ? (
                <Note warn testID="biz-set-del-note">
                  {dangerNote}
                </Note>
              ) : null}
              <Pressable
                testID="biz-set-del-confirm"
                accessibilityRole="button"
                accessibilityState={{ disabled: !nameMatches || dangerBusy }}
                disabled={!nameMatches || dangerBusy}
                onPress={() => void doDelete()}
                style={[styles.redBtn, { backgroundColor: nameMatches && !dangerBusy ? c.danger.bg : c.btnOff.bg }]}
              >
                <Text style={[styles.redBtnT, { color: nameMatches && !dangerBusy ? c.danger.fg : c.btnOff.fg }]}>{dangerBusy ? t("bizset.del.busy") : t("bizset.del.confirm")}</Text>
              </Pressable>
              <Pressable testID="biz-set-del-keep" accessibilityRole="button" onPress={closeAction} style={styles.ghostBtn}>
                <Text style={[styles.ghostT, { color: c.textDim }]}>{t("bizset.del.keep")}</Text>
              </Pressable>
            </>
          ) : action === "undelete" && deletion ? (
            <>
              <Text style={[styles.sh, { color: c.text }]}>{t("bizset.del.undoTitle")}</Text>
              <Text style={[styles.bullet, { color: c.textDim }]}>{t("bizset.del.undoBody", { name: profile?.name ?? "" })}</Text>
              {dangerNote ? (
                <Note warn testID="biz-set-undel-note">
                  {dangerNote}
                </Note>
              ) : null}
              <View style={styles.save}>
                <PrimaryButton testID="biz-set-undel-confirm" label={dangerBusy ? t("bizset.del.busy") : t("bizset.del.cancel")} disabled={dangerBusy} onPress={() => void doUndelete()} />
              </View>
              <Pressable testID="biz-set-undel-keep" accessibilityRole="button" onPress={closeAction} style={styles.ghostBtn}>
                <Text style={[styles.ghostT, { color: c.textDim }]}>{t("bizset.del.back")}</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", marginTop: F.v(8) },
  logoWrap: { width: AVATAR, height: AVATAR },
  logo: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: AVATAR, height: AVATAR },
  logoT: { fontSize: 34, fontWeight: "800", letterSpacing: 0.3 },
  logoEdit: { position: "absolute", right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  name: { fontSize: T.lt - 4, fontWeight: "700", marginTop: 6, lineHeight: 28 },
  role: { fontSize: T.cap, marginTop: 2 },
  link: { fontSize: T.cap + 0.5, fontWeight: "600", marginTop: 10 },
  warnCard: { marginTop: F.v(18), borderWidth: 1.5, borderRadius: radii.sugg, paddingVertical: 14, paddingHorizontal: 16 },
  warnT: { fontSize: T.body, fontWeight: "700", lineHeight: 22 },
  warnSub: { fontSize: T.cap, lineHeight: 19, marginTop: 4 },
  darkBtn: { alignSelf: "flex-start", marginTop: 12, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 18 },
  darkBtnT: { fontSize: T.sub, fontWeight: "700" },
  dangerBox: { borderWidth: 1.5, borderRadius: radii.sugg + 4, paddingHorizontal: 4, paddingBottom: 4, marginTop: 6 },
  menu: { borderRadius: radii.sugg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginTop: spacing.xs },
  menuRow: { paddingVertical: 15, paddingHorizontal: 16 },
  menuT: { fontSize: T.body, fontWeight: "500" },
  menuSep: { height: StyleSheet.hairlineWidth },
  bullet: { fontSize: T.sub, lineHeight: 22, marginTop: 6 },
  delInput: { marginTop: F.v(18) },
  redBtn: { height: 54, borderRadius: radii.btn, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  redBtnT: { fontSize: 17, fontWeight: "700" },
  ghostBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  ghostT: { fontSize: T.body, fontWeight: "600" },
  hint: { fontSize: T.cap - 0.5, lineHeight: 18, marginTop: 6, marginLeft: 2 },
  sheetBody: { paddingBottom: spacing.xl },
  sh: { fontSize: T.lt - 6, fontWeight: "700", lineHeight: 28, marginTop: spacing.xs },
  label: { fontSize: T.cap, marginTop: F.v(18), marginBottom: 6, marginLeft: 2 },
  input: { minHeight: 46, borderRadius: radii.segIn + 4, borderWidth: 1, paddingHorizontal: 14, fontSize: T.body, fontWeight: "500" },
  multi: { minHeight: 84, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  day: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  dayT: { width: 64, fontSize: T.body, fontWeight: "600" },
  times: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  time: { width: 70, height: 38, borderRadius: radii.segIn + 2, borderWidth: 1, textAlign: "center", fontSize: T.sub, fontVariant: ["tabular-nums"] },
  closed: { flex: 1, fontSize: T.sub },
  save: { marginTop: spacing.lg },
});
