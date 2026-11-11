// ชีตเพิ่มคนเข้าห้องงาน (ใบ S2.10 · แบบ D3 sec-d.jpg หน้า 3) — เปิดจากห้องร่วม (ปุ่ม user-plus / เมนู ⋯ "เพิ่มคน" · เฉพาะ OWNER/ผู้เปิดห้อง = canManage)
//   รายชื่อ: GET secretary/staff (พนักงานที่รับคำเชิญแล้ว · active) ตัดคนที่อยู่ในห้องแล้ว ผู้เปิดห้อง และตัวเราเอง · ติ๊กได้หลายคน
//   สวิตช์ "ให้เห็นข้อความเก่าในห้องนี้" = seeHistory · ปริยาย **ปิด** (เห็นเฉพาะหลังถูกเพิ่ม — server กรองใน listMessages · §J)
//   ยืนยัน ⇒ POST secretary/rooms/[id]/members {userId, seeHistory} ทีละคน (ข้อความไทยของเซิร์ฟเวอร์ต่อคนที่ล้ม เช่น 409 เต็ม/อยู่แล้ว)
//   ถอด (ส่วน "อยู่ในห้องแล้ว") ⇒ ชีตยืนยัน ⇒ DELETE secretary/rooms/[id]/members/[userId]
//   เพิ่มซ้ำหลังถูกถอด = แถวใหม่ตาม seeHistory ที่เลือก (R-S1.6d) · ชื่อห้อง/บริบทของห้องผู้ถูกเพิ่มเห็นได้แม้ seeHistory ปิด (หนี้ที่ยอมรับ §J)
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, PrimaryButton, Sheet } from "@/src/components/airy";
import { normalizeStaff, secDeleteRoomMember, secGet, secPostId, serverNote, type StaffPerson } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";
import { Avatar } from "./MemberBubble";
import { sysName } from "./RoomCard";
import { Toggle } from "./SettingRow";

export type RoomMember = { userId: string; name: string | null; role: string; seeHistory: boolean };
export type AddMemberIds = { sheet: string; row: string; history: string; confirm: string; member: string; remove: string; removeSheet: string };

type TFn = ReturnType<typeof useT>;
export function roleLabel(t: TFn, role: string): string {
  return role === "OWNER" || role === "MANAGER" || role === "STAFF" ? t(`sec.role.${role}` as I18nKey) : role;
}

/** สิทธิ์โดยย่อของคนในรายการ: เจ้าของ/ผู้จัดการ = ดูทุกระบบ · อนุมัติได้ · พนักงาน = ระบบที่ดู/ใช้ได้ (staffViewOf.levels) */
export function permSummary(t: TFn, p: Pick<StaffPerson, "role" | "levels">): string {
  if (p.role === "OWNER" || p.role === "MANAGER") return t("sec.staff.perm.full");
  const mods = Object.entries(p.levels)
    .filter(([, l]) => l === "VIEW" || l === "USE")
    .map(([m]) => sysName(t, m));
  return mods.length ? t("sec.staff.perm.some", { list: mods.slice(0, 3).join(" · ") }) : t("sec.staff.perm.none");
}

export function AddMemberSheet({
  visible,
  roomId,
  members,
  exclude,
  canManage,
  tenantName,
  secretaryName,
  ids,
  onClose,
  onChanged,
}: {
  visible: boolean;
  roomId: string;
  members: RoomMember[];
  /** userId ที่ไม่ให้เลือก (ผู้เปิดห้อง · ตัวเรา) */
  exclude: string[];
  canManage: boolean;
  tenantName: string;
  secretaryName: string;
  ids: AddMemberIds;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [people, setPeople] = useState<StaffPerson[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [seeHistory, setSeeHistory] = useState(false); // ปริยายปิด (D3)
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // กันกดซ้ำ (R-S2.4e)
  const [err, setErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RoomMember | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPicked([]);
    setSeeHistory(false);
    setErr(null);
    let live = true;
    secGet("secretary/staff")
      .then((r) => live && setPeople(normalizeStaff(r).people))
      .catch((e) => {
        if (!live) return;
        setPeople([]);
        setErr(serverNote(e) ?? t("sec.staff.add.loadErr"));
      });
    return () => {
      live = false;
    };
  }, [visible, t]);

  const inRoom = new Set(members.map((m) => m.userId));
  const skip = new Set(exclude);
  const candidates = (people ?? []).filter((p) => p.active && !p.me && !inRoom.has(p.userId) && !skip.has(p.userId));

  const toggle = (userId: string) => setPicked((s) => (s.includes(userId) ? s.filter((x) => x !== userId) : [...s, userId]));

  const add = useCallback(async () => {
    if (busyRef.current || picked.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    const fails: string[] = [];
    try {
      for (const userId of picked) {
        try {
          await secPostId("secretary/rooms/[id]/members", roomId, { userId, seeHistory });
        } catch (e) {
          const who = people?.find((p) => p.userId === userId)?.name ?? "";
          fails.push(`${who}: ${serverNote(e) ?? t("sec.staff.add.addErr")}`);
        }
      }
      onChanged();
      if (fails.length) setErr(fails.join("\n"));
      else onClose();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [picked, roomId, seeHistory, people, onChanged, onClose, t]);

  const remove = useCallback(async () => {
    if (!removing || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      await secDeleteRoomMember(roomId, removing.userId);
      setRemoving(null);
      onChanged();
    } catch (e) {
      setRemoving(null);
      setErr(serverNote(e) ?? t("sec.staff.add.removeErr"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [removing, roomId, onChanged, t]);

  return (
    <>
      <Sheet visible={visible && !removing} onClose={busy ? undefined : onClose} testID={ids.sheet} top={210}>
        <Text style={[styles.h, { color: c.text }]}>{t("sec.staff.add.title")}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.staff.add.sub", { shop: tenantName })}</Text>
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {people === null ? <Text style={[styles.empty, { color: c.textMuted }]}>{t("sec.staff.add.loading")}</Text> : null}
          {people !== null && candidates.length === 0 ? <Text style={[styles.empty, { color: c.textMuted }]}>{t("sec.staff.add.none")}</Text> : null}
          {candidates.map((p) => {
            const on = picked.includes(p.userId);
            return (
              <Pressable
                testID={ids.row}
                key={p.userId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: busy }}
                disabled={busy}
                onPress={() => toggle(p.userId)}
                style={[glassStyle(c, radii.sugg), styles.row]}
              >
                <Avatar name={p.name} seed={p.userId} />
                <View style={styles.rowX}>
                  <Text style={[styles.nm, { color: c.text }]} numberOfLines={1}>
                    {p.name}
                    <Text style={[styles.role, { color: c.textMuted }]}>{`  ${roleLabel(t, p.role)}`}</Text>
                  </Text>
                  <Text style={[styles.perm, { color: c.textDim }]} numberOfLines={1}>
                    {permSummary(t, p)}
                  </Text>
                </View>
                <View style={[styles.check, on ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.iconDim }]}>
                  {on ? <Icon name="check" size={14} color={c.onAccent} /> : null}
                </View>
              </Pressable>
            );
          })}

          <View style={[glassStyle(c, radii.sugg), styles.row]}>
            <View style={styles.rowX}>
              <Text style={[styles.nm, { color: c.text }]}>{t("sec.staff.add.history")}</Text>
              <Text style={[styles.perm, { color: c.textDim }]}>{seeHistory ? t("sec.staff.add.historyOn") : t("sec.staff.add.historyOff")}</Text>
            </View>
            <Toggle testID={ids.history} value={seeHistory} onChange={setSeeHistory} disabled={busy} label={t("sec.staff.add.history")} />
          </View>

          <Text style={[styles.warn, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>{t("sec.staff.add.note", { name: secretaryName })}</Text>
          {err ? (
            <Text testID={`${ids.sheet}-err`} style={[styles.warn, { color: c.text, backgroundColor: c.chip.bg }]}>
              {err}
            </Text>
          ) : null}
          <View style={styles.cta}>
            <PrimaryButton
              testID={ids.confirm}
              label={busy ? t("sec.staff.add.adding") : picked.length ? t("sec.staff.add.add", { n: picked.length }) : t("sec.staff.add.pick")}
              disabled={busy || picked.length === 0 || !canManage}
              onPress={() => void add()}
            />
          </View>

          {members.length > 0 ? (
            <>
              <Text style={[styles.sec, { color: c.textFaint }]}>{t("sec.staff.add.inRoom", { n: members.length })}</Text>
              {members.map((m) => (
                <View testID={ids.member} key={m.userId} style={[glassStyle(c, radii.sugg), styles.row]}>
                  <Avatar name={m.name} seed={m.userId} size={30} />
                  <View style={styles.rowX}>
                    <Text style={[styles.nm, { color: c.text }]} numberOfLines={1}>
                      {m.name ?? t("sec.room.someone")}
                      <Text style={[styles.role, { color: c.textMuted }]}>{`  ${roleLabel(t, m.role)}`}</Text>
                    </Text>
                    <Text style={[styles.perm, { color: c.textDim }]}>{m.seeHistory ? t("sec.staff.add.historyOn") : t("sec.staff.add.historyOff")}</Text>
                  </View>
                  {canManage ? (
                    <Pressable testID={ids.remove} accessibilityRole="button" disabled={busy} onPress={() => setRemoving(m)} style={[styles.rm, { borderColor: c.divider }]}>
                      <Text style={[styles.rmT, { color: c.bad.fg }]}>{t("sec.staff.add.remove")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </Sheet>

      <Sheet visible={visible && !!removing} onClose={busy ? undefined : () => setRemoving(null)} testID={ids.removeSheet} top={500}>
        <Text style={[styles.h, { color: c.text }]}>{t("sec.staff.add.removeTitle", { name: removing?.name ?? t("sec.room.someone") })}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.staff.add.removeBody")}</Text>
        <View style={styles.acts}>
          <Pressable testID={`${ids.removeSheet}-cancel`} accessibilityRole="button" disabled={busy} onPress={() => setRemoving(null)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.c2.cancel")}</Text>
          </Pressable>
          <Pressable testID={`${ids.removeSheet}-ok`} accessibilityRole="button" disabled={busy} onPress={() => void remove()} style={[styles.btn, styles.main, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.staff.add.removeOk")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: T.h + 3, fontWeight: "700", lineHeight: 30 },
  sub: { fontSize: T.sub - 0.5, lineHeight: 20, marginTop: 4 },
  list: { flexGrow: 0, flexShrink: 1, marginTop: spacing.md },
  empty: { fontSize: T.sub, lineHeight: 21, marginVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8 },
  rowX: { flex: 1, minWidth: 0 },
  nm: { fontSize: T.body - 1, fontWeight: "700", lineHeight: 22 },
  role: { fontSize: T.cap, fontWeight: "400" },
  perm: { fontSize: T.cap, lineHeight: 18, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  warn: { fontSize: T.cap, lineHeight: 18, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12, overflow: "hidden", textAlign: "center" },
  cta: { marginTop: spacing.md },
  sec: { fontSize: 12, fontWeight: "600", letterSpacing: 1, marginTop: spacing.lg, marginLeft: 4 },
  rm: { height: 34, borderRadius: 17, paddingHorizontal: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rmT: { fontSize: T.cap + 0.5, fontWeight: "600" },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
});
