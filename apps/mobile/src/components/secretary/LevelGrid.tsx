// ระดับสิทธิ์ต่อระบบ ปิด/ดู/ใช้งาน (ใบ S2.21 G2 · S2.22 G3 · แบบ sec-g.jpg หน้า 2–3) — **ที่เดียวของแอปที่แปลง ระดับ → คีย์สิทธิ์**
//   ตาราง LEVEL_KEYS = สำเนาของ `levelsAvailableFor` + `permissionsForLevel` ฝั่งเซิร์ฟเวอร์ (src/lib/staff/levels.ts · RESOLUTIONS §P R-S1.25e/f/g)
//   สร้างจากทะเบียน PERMISSION_MODULES (คีย์อ่อนไหว `isSensitiveKey` + คีย์ลิมิต `_…` ตัดออกแล้ว) วันที่ 5 พ.ย. 2026 — ทะเบียนเปลี่ยน ⇒ สร้างใหม่ (ดู wo-notes sec-s2.21 §4)
//     l = ระดับที่โมดูลมี (O = ปิด · V = ดู · U = ใช้งาน) · r = คีย์อ่าน (VIEW) · w = คีย์เขียนที่ระดับให้ได้ (USE = r + w) · คีย์เขียนแบบย่อ (ตัดชื่อโมดูลหน้าจุดแรก)
//   ใช้ 2 ทาง:
//     G3 (PUT staff/[membershipId]) ส่ง `levels` ตรง ๆ — เซิร์ฟเวอร์แปลงเอง · ตารางนี้ใช้แค่ "แสดงเฉพาะระดับที่มี" + ล็อกโมดูลที่มีแต่ OFF
//     G2 (POST staff/invite) รับแค่ `permissions` (คีย์) ⇒ `permissionsFromLevels` แปลงด้วยตารางนี้ (เซิร์ฟเวอร์ตรวจคีย์ซ้ำ: คีย์ไม่รู้จัก/ยกสิทธิ์เกินตัว ⇒ 400 bad_permissions)
//   🔴 คีย์อ่อนไหว (เงิน/ลบ/แอดมิน) ไม่มีในตาราง — ไม่มีระดับใดให้ (R-S1.25e) · แชทใช้ CHAT_KEYS 3 ระดับเท่านั้น (R-S1.25h)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Glass, Icon } from "@/src/components/airy";
import { sysColor, sysLabelKey, sysShortKey } from "@/src/components/secretary/sys";
import type { ChatLevel } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { shadow, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

export type ModuleLevel = "OFF" | "VIEW" | "USE";
export const MODULE_LEVELS: readonly ModuleLevel[] = ["OFF", "VIEW", "USE"];

/** คีย์ของแชท 3 ระดับ (CHAT_LEVELS ของเซิร์ฟเวอร์ · R-K14 + R-S1.25a/h) — VIEW มี markRead · REPLY มี markRead+setStatus */
export const CHAT_KEYS: Record<ChatLevel, readonly string[]> = {
  NONE: [],
  VIEW: ["chat.conversation.read", "chat.conversation.markRead"],
  REPLY: ["chat.conversation.read", "chat.conversation.markRead", "chat.message.send", "chat.conversation.setStatus"],
};

type Row = { l: string; r: readonly string[]; w: readonly string[] };
const LEVEL_KEYS: Record<string, Row> = {
  pos: { l: "OVU", r: ["report.view", "sale.read"], w: ["sale.create", "product.manage", "shift.operate", "shift.manage", "report.anomaly", "stock.count", "device.manage", "staff.manage", "sale.manage", "taxinvoice.issue", "channel.manage", "price.rule", "order.accept", "order.reject", "offline.sync"] },
  restaurant: { l: "OU", r: [], w: ["zone.create", "zone.archive", "table.create", "table.archive", "table.setStatus", "table.rotateQr", "category.create", "category.archive", "item.create", "item.duplicate", "item.archive", "item.setStock", "item.resetStock", "optionGroup.create", "optionGroup.archive", "choice.setStock", "station.create", "session.open", "session.close", "session.move", "session.linkMember", "order.create", "order.confirm", "order.rush", "kds.advance", "kds.recall", "kitchen.pause", "request.ack", "request.done", "checkout.create"] },
  shop: { l: "OU", r: [], w: ["product.create", "product.update", "order.confirm"] },
  delivery: { l: "OU", r: [], w: ["shipment.create", "shipment.update"] },
  booking: { l: "OVU", r: ["report.view"], w: ["appointment.create", "appointment.setStatus", "service.create", "service.update", "service.setDeposit", "staff.create", "hours.set", "queue.operate", "checkin", "walkin.create", "job.run", "job.runAny", "devices.manage", "appointment.reschedule", "customer.notes"] },
  hotel: { l: "OU", r: [], w: ["reservation.create", "reservation.checkIn", "reservation.checkOut", "room.create", "room.setStatus", "roomType.create"] },
  dorm: { l: "OVU", r: ["view", "meter.read"], w: ["bill.run", "lease.manage", "bill.send", "moveout.manage", "repair.manage", "announce", "parcel.manage"] },
  queue: { l: "OU", r: [], w: ["type.create", "counter.create", "counter.open", "counter.close", "counter.setTypes", "display.create", "display.revoke", "ticket.issue", "ticket.callNext", "ticket.recall", "ticket.recallSkipped", "ticket.serve", "ticket.done", "ticket.skip", "ticket.transfer"] },
  ticket: { l: "OU", r: [], w: ["event.create", "event.setStatus", "event.archive", "type.create", "order.create", "checkin.scan"] },
  rental: { l: "OU", r: [], w: ["asset.create", "asset.update", "booking.create", "booking.update", "booking.return"] },
  clinic: { l: "OU", r: [], w: ["patient.create", "visit.create", "appointment.confirm", "appointment.reject", "appointment.complete", "dispense", "bill"] },
  school: { l: "OU", r: [], w: ["course.create", "course.update", "class.create", "enrollment.create", "attendance.mark"] },
  member: { l: "OVU", r: ["customer.read", "tier.read", "point.read", "loyalty.read", "promo.read", "review.read", "report.view"], w: ["customer.create", "customer.update", "tier.manage", "tier.setManual", "loyalty.manage", "loyalty.stamp", "loyalty.fulfil", "promo.issue", "promo.manage", "review.reply", "referral.manage", "tier.update", "plan.create", "plan.update", "subscription.create"] },
  point: { l: "O", r: [], w: [] },
  reward: { l: "OU", r: [], w: ["redemption.create", "redemption.fulfill"] },
  coupon: { l: "OU", r: [], w: ["coupon.create", "coupon.toggle"] },
  crm: { l: "OVU", r: ["contact.read", "company.read", "deal.read", "activity.read", "email.read", "record.read", "commission.view", "report.view"], w: ["contact.create", "contact.update", "contact.convert", "company.create", "company.update", "deal.create", "deal.update", "deal.move", "deal.quote", "deal.reassign", "deal.lines", "deal.forecast", "activity.create", "activity.complete", "email.send", "sequence.manage", "sequence.enroll", "automation.manage", "score.manage", "assignment.manage", "record.create", "record.update", "quota.manage", "report.team", "report.all", "tracking.manage", "portal.manage"] },
  marketing: { l: "OU", r: [], w: ["campaign.create", "campaign.send"] },
  inventory: { l: "OVU", r: ["item.read"], w: ["item.create", "item.update", "location.create", "movement.receive", "movement.consume", "movement.transfer", "movement.adjust", "lot.expiring", "supplier.create", "supplier.update", "po.create", "po.order", "po.receive"] },
  hr: { l: "OVU", r: ["leave.read"], w: ["employee.create", "attendance.clock", "leave.request", "leave.decide"] },
  account: { l: "OVU", r: ["doc.view", "journal.view", "tax.view", "report.view"], w: ["doc.create", "doc.issue", "doc.public_link", "contact.manage", "product.manage", "document.manage", "chart.manage", "mapping.manage", "asset.manage", "asset.register", "reconcile", "approve.limit"] },
  approval: { l: "OU", r: [], w: ["request.decide"] },
  kanban: { l: "OVU", r: ["board.read", "report.view"], w: ["board.create", "board.rename", "board.member.manage", "column.create", "card.create", "card.update", "card.move", "card.comment", "card.attach", "label.manage", "automation.manage", "template.manage"] },
  meeting: { l: "OU", r: [], w: ["channel.create", "channel.invite", "channel.join", "channel.leave", "message.post", "message.edit"] },
  kb: { l: "OU", r: [], w: ["article.create", "article.update"] },
  forms: { l: "OU", r: [], w: ["form.create", "form.update"] },
  calendar: { l: "OV", r: ["event.read"], w: [] },
  reports: { l: "OU", r: [], w: ["report.run", "report.save"] },
  dashboard: { l: "OU", r: [], w: ["layout.update"] },
  pages: { l: "OU", r: [], w: ["page.manage"] },
  ai: { l: "OU", r: [], w: ["chat.send", "schedule.create"] },
  automation: { l: "OU", r: [], w: ["rule.create"] },
  settings: { l: "O", r: [], w: [] },
  payments: { l: "O", r: [], w: [] },
  systems: { l: "O", r: [], w: [] },
  system: { l: "O", r: [], w: [] },
  api: { l: "O", r: [], w: [] },
  webhook: { l: "O", r: [], w: [] },
  branding: { l: "O", r: [], w: [] },
  marketplace: { l: "OU", r: [], w: ["template.install"] },
};

/** ระดับที่โมดูลนี้มีจริง (= levelsAvailableFor) · ไม่รู้จัก ⇒ [OFF] · แชท ⇒ [] (ใช้ ChatLevelPicker) */
export function levelsAvailable(module: string): ModuleLevel[] {
  if (module === "chat") return [];
  const row = LEVEL_KEYS[module];
  if (!row) return ["OFF"];
  return MODULE_LEVELS.filter((l) => row.l.includes(l[0]!));
}

/** โมดูลนี้ให้ได้แค่ "ปิด" (มีแต่คีย์อ่อนไหว) — แสดงเป็นแถวล็อก */
export function offOnly(module: string): boolean {
  const a = levelsAvailable(module);
  return a.length === 1 && a[0] === "OFF";
}

/** คีย์ที่ระดับนี้ให้ (ไม่รวมคีย์อ่อนไหว) */
export function keysForLevel(module: string, level: ModuleLevel): string[] {
  const row = LEVEL_KEYS[module];
  if (!row || level === "OFF" || !levelsAvailable(module).includes(level)) return [];
  const full = (k: string) => `${module}.${k}`;
  return level === "VIEW" ? row.r.map(full) : [...row.r, ...row.w].map(full);
}

/** สิทธิ์เริ่มต้นของคำเชิญ (POST staff/invite `permissions`) จากระดับต่อโมดูล + แชท — ระดับที่โมดูลไม่มี = ไม่ให้อะไร */
export function permissionsFromLevels(levels: Record<string, ModuleLevel>, chat: ChatLevel): Record<string, true> {
  const out: Record<string, true> = {};
  for (const [m, l] of Object.entries(levels)) for (const k of keysForLevel(m, l)) out[k] = true;
  for (const k of CHAT_KEYS[chat]) out[k] = true;
  return out;
}

/** ระดับที่แสดงของโมดูล — ค่าจากเซิร์ฟเวอร์ที่โมดูลไม่มี ⇒ ปิด */
export function levelOf(levels: Record<string, string>, module: string): ModuleLevel {
  const v = levels[module];
  return v === "VIEW" || v === "USE" ? (levelsAvailable(module).includes(v) ? v : "OFF") : "OFF";
}

/** โมดูลที่แสดงในกริด: ระบบที่กิจการเปิด (GET secretary/access) + โมดูลที่คนนี้มีระดับอยู่แล้ว · ไม่มีแชท · เรียงตามที่มา */
export function gridModules(accessModules: readonly string[], current: Record<string, string> = {}): string[] {
  const out: string[] = [];
  const add = (m: string) => {
    if (m && m !== "chat" && LEVEL_KEYS[m] && !out.includes(m)) out.push(m);
  };
  accessModules.forEach(add);
  Object.entries(current).forEach(([m, l]) => l !== "OFF" && add(m));
  return out;
}

const LEVEL_LABEL: Record<ModuleLevel, I18nKey> = { OFF: "perm.level.OFF", VIEW: "perm.level.VIEW", USE: "perm.level.USE" };

/** แถวปุ่ม 3 ช่อง (ช่องที่เลือก = พื้นทึบ) — ใช้ร่วมกับ ChatLevelPicker */
export function LevelButtons<K extends string>({
  testID,
  options,
  value,
  onChange,
  disabled = false,
}: {
  testID: string;
  options: { key: K; label: string }[];
  value: K;
  onChange?: (k: K) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.btns}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            testID={`${testID}-${o.key}`}
            key={o.key}
            disabled={disabled}
            onPress={() => onChange?.(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            style={[styles.btn, on ? [{ backgroundColor: c.accent }, shadow(c.tabShadow)] : { backgroundColor: c.seg.track }, disabled && !on && styles.dim]}
          >
            <Text style={[styles.btnT, { color: on ? c.onAccent : c.seg.fg }, on && styles.on]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** หัวแถวระบบ: ป้ายย่อสีระบบ + ชื่อ + คำอธิบายขวา */
export function SysHead({ module, hint }: { module: string; hint?: string }) {
  const { c } = useTheme();
  const t = useT();
  const lk = sysLabelKey(module);
  return (
    <View style={styles.head}>
      <View style={[styles.k, { backgroundColor: c.sys[sysColor(module)] }]}>
        <Text style={[styles.kt, { color: c.onSys }]} numberOfLines={1}>
          {t(sysShortKey(module))}
        </Text>
      </View>
      <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
        {lk ? t(lk) : module === "ai" ? t("perm.mod.ai") : module}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color: c.textMuted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * กริดระดับต่อระบบ — แสดงเฉพาะระดับที่โมดูลมี (levelsAvailable) · โมดูลที่มีแต่ปิด = แถวล็อก (กดไม่ได้)
 * testID: `<testID>` กล่อง · `<testID>-<module>` แถว · `<testID>-<module>-<OFF|VIEW|USE>` ปุ่ม · `<testID>-<module>-locked` ล็อก
 */
export function LevelGrid({
  testID,
  modules,
  levels,
  onChange,
  disabled = false,
}: {
  testID: string;
  modules: readonly string[];
  levels: Record<string, string>;
  onChange?: (module: string, level: ModuleLevel) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={styles.grid}>
      {modules.map((m) => {
        const avail = levelsAvailable(m);
        const locked = offOnly(m);
        return (
          <Glass key={m} testID={`${testID}-${m}`} radius={radii.sugg} pad={{ v: 12, h: 14 }}>
            <SysHead module={m} />
            {locked ? (
              <View testID={`${testID}-${m}-locked`} style={[styles.lock, { backgroundColor: c.seg.track }]}>
                <Icon name="lock" size={14} color={c.textMuted} />
                <Text style={[styles.lockT, { color: c.textMuted }]}>{t("perm.offOnly")}</Text>
              </View>
            ) : (
              <LevelButtons
                testID={`${testID}-${m}`}
                options={avail.map((l) => ({ key: l, label: t(LEVEL_LABEL[l]) }))}
                value={levelOf(levels, m)}
                disabled={disabled}
                onChange={(l) => onChange?.(m, l)}
              />
            )}
          </Glass>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  k: { minWidth: 20, height: 16, borderRadius: 4, paddingHorizontal: 3, alignItems: "center", justifyContent: "center" },
  kt: { fontSize: 8.5, fontWeight: "700" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  name: { fontSize: T.body - 0.5, fontWeight: "600", flexShrink: 1 },
  hint: { fontSize: T.cap - 1, marginLeft: "auto", flexShrink: 1 },
  btns: { flexDirection: "row", gap: 6 },
  btn: { flex: 1, height: 38, borderRadius: radii.segIn - 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  btnT: { fontSize: 13.5 },
  on: { fontWeight: "700" },
  dim: { opacity: 0.55 },
  lock: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: radii.segIn - 2 },
  lockT: { fontSize: 13 },
});
