import { requireAccountPage } from "@/lib/modules/account/guard";
import {
  DEFAULT_PERMISSION_SUB,
  PERMISSION_SETTINGS_SUBS,
  permissionSubLabel,
} from "@/lib/modules/account/settings-nav";
import { capLabel, getPermissionSettings, listAccountUsers } from "@/lib/modules/account/permissions-service";
import { cellsToPermissionKeys, permissionKeysToCells } from "@/lib/modules/account/permissions-matrix";
import {
  addRoleAction,
  assignRoleAction,
  revokeAction,
  saveRoleAction,
  setCapAction,
} from "@/lib/modules/account/permissions-actions";
import { SettingsNav } from "@/components/account-v2/SettingsNav";
import { PermissionsPanel, type UserRow } from "@/components/account-v2/PermissionsPanel";

// หน้า "ตั้งค่า › สิทธิ์ผู้ใช้งาน" (SPEC §9.4 · WO 8.3 · เฟรม g13)
// หัวข้อย่อยเลือกด้วย `?s=` (users | matrix) · บทบาทที่กำลังแก้เลือกด้วย `?r=`
export const dynamic = "force-dynamic";

export default async function AccountPermissionsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string; r?: string }>;
}) {
  const { id } = await params;
  const { s: subRaw, r: roleRaw } = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.settings.manage");
  const base = `/app/sys/${id}/account`;
  const ctx = { tenantId, systemId };

  const hasSub = !!subRaw && PERMISSION_SETTINGS_SUBS.some((x) => x.key === subRaw);
  const sub = hasSub ? subRaw! : DEFAULT_PERMISSION_SUB;

  // WO 9.3: อ่านตั้งค่าสิทธิ์ครั้งเดียวแล้วส่งต่อ (เดิมอ่านแถว AccountSettings ซ้ำ 2 คำสั่ง)
  const settings = await getPermissionSettings(ctx);
  const users = await listAccountUsers(ctx, settings);

  const rows: UserRow[] = users.map((u) => ({
    membershipId: u.membershipId,
    name: u.name,
    email: u.email,
    roleLabel: u.roleLabel,
    accountRoleKey: u.accountRoleKey,
    accountRoleName: u.accountRoleName,
    summary: u.summary,
    capText: capLabel(u.capSatang),
    // OWNER/MANAGER มีสิทธิ์ทุกอย่างโดยบทบาทของแพลตฟอร์ม — เปลี่ยนได้ที่หน้าผู้ใช้งานของร้านเท่านั้น
    editable: u.role === "STAFF",
    active: u.active,
  }));

  // 🔴 แสดงตารางจาก "คีย์สิทธิ์จริง" ไม่ใช่จาก JSON ที่เก็บไว้ตรง ๆ — เซลล์ที่ยืมคีย์ร่วมกัน (แถวรายจ่าย)
  //    ต้องติ๊กตามแถวรายรับให้เห็นตรงกับสิ่งที่ระบบบังคับใช้จริง ไม่งั้นหน้าจอโกหกว่า "รายจ่ายดูไม่ได้"
  const rolesForView = settings.roles.map((r) =>
    r.system
      ? r
      : {
          ...r,
          cells: permissionKeysToCells(Object.fromEntries(cellsToPermissionKeys(r.cells).map((k) => [k, true]))),
        },
  );

  const firstCustom = settings.roles.find((x) => !x.system)?.key ?? settings.roles[0]?.key ?? "";
  const activeRoleKey = roleRaw && settings.roles.some((x) => x.key === roleRaw) ? roleRaw : firstCustom;

  return (
    <PermissionsPanel
      systemId={systemId}
      base={base}
      sub={sub}
      subLabel={permissionSubLabel(sub)}
      users={rows}
      roles={rolesForView}
      activeRoleKey={activeRoleKey}
      staffHref="/app/settings/staff"
      saveRole={saveRoleAction}
      addRole={addRoleAction}
      assignRole={assignRoleAction}
      setCap={setCapAction}
      revoke={revokeAction}
      nav={<SettingsNav base={base} activeGroup="permissions" activeSub={sub} />}
      mobileNav={<SettingsNav base={base} activeGroup="permissions" activeSub={hasSub ? sub : ""} />}
      showMobileNavOnly={!hasSub}
    />
  );
}
