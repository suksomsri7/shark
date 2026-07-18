// QC — Meeting: เชิญสมาชิกเข้าห้อง (โดยเฉพาะ PRIVATE) + policy การเชิญ
// persona: หัวหน้าทีม (admin ห้อง) สร้างห้องลับ "ฝ่ายบัญชี" แล้วเชิญพนักงานเข้าทีละคน
// พิสูจน์ addChannelMember: สิทธิ์ (admin/creator เท่านั้น) · idempotent · re-join · staff guard · PRIVATE เห็นหลังเชิญ · cross-tenant

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const m = await import("@/lib/modules/meeting/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

const stamp = Date.now();
let tenantAId = "";
let tenantBId = "";
const userIds: string[] = [];

async function mkStaff(tenantId: string, label: string, accepted = true) {
  const u = await prisma.user.create({
    data: { email: `qc-mi-${label}-${stamp}@example.com`, name: `QC ${label}` },
  });
  userIds.push(u.id);
  await prisma.membership.create({
    data: { userId: u.id, tenantId, role: "STAFF", acceptedAt: accepted ? new Date() : null },
  });
  return u.id;
}

async function memberIdsOf(systemId: string, channelId: string) {
  const rows = await m.listChannelMembers(systemId, channelId);
  return new Set(rows.map((r) => r.userId));
}

try {
  console.log("── setup: tenant A + ระบบ Meeting + staff (admin/target/member/nonStaff) ──");
  const tA = await prisma.tenant.create({ data: { name: "QC Meeting Invite A", slug: `qc-mi-a-${stamp}` } });
  tenantAId = tA.id;
  const sysA = await prisma.appSystem.create({ data: { tenantId: tA.id, type: "MEETING", name: "แชทภายใน" } });
  const systemId = sysA.id;

  const adminUser = await mkStaff(tA.id, "admin");     // ผู้สร้างห้อง = admin
  const targetUser = await mkStaff(tA.id, "target");   // staff จะถูกเชิญ
  const memberUser = await mkStaff(tA.id, "member");   // staff เป็นสมาชิกห้องแต่ไม่ใช่ admin
  const nonStaffUser = await mkStaff(tA.id, "nonstaff", false); // Membership ยังไม่ accept

  console.log("\n── สร้างห้อง PRIVATE (ผู้สร้าง=admin) ──");
  const created = await m.createChannel({
    tenantId: tA.id, systemId, name: `บัญชีลับ-${stamp}`, kind: "PRIVATE", createdByUserId: adminUser,
  });
  chk("MI-0.1", "สร้างห้อง PRIVATE สำเร็จ", created.ok === true, "ok", JSON.stringify(created).slice(0, 60));
  if (!created.ok) throw new Error("createChannel failed");
  const chId = created.id;
  chk("MI-0.2", "ผู้สร้างเป็น admin ของห้อง", (await prisma.meetingChannelMember.findUnique({ where: { channelId_userId: { channelId: chId, userId: adminUser } } }))?.isAdmin === true, "true", "see");

  console.log("\n── PRIVATE: ก่อนเชิญ target มองไม่เห็นห้อง ──");
  const visBefore = await m.listVisibleChannels(tA.id, systemId, targetUser);
  chk("MI-1.1", "ก่อนเชิญ → target ไม่เห็นห้อง PRIVATE", !visBefore.some((c) => c.id === chId), "ไม่เห็น", visBefore.map((c) => c.id).join(","));

  console.log("\n── admin เชิญ target → เป็นสมาชิก ──");
  const inv1 = await m.addChannelMember(systemId, chId, adminUser, targetUser);
  chk("MI-2.1", "admin เชิญ target → ok", inv1.ok === true, "ok", JSON.stringify(inv1).slice(0, 60));
  chk("MI-2.2", "listChannelMembers เห็น target", (await memberIdsOf(systemId, chId)).has(targetUser), "มี target", "see");
  chk("MI-2.3", "isChannelMember(target)=true", (await m.isChannelMember(chId, targetUser)) === true, "true", "see");

  console.log("\n── PRIVATE: หลังเชิญ target เห็นห้องแล้ว ──");
  const visAfter = await m.listVisibleChannels(tA.id, systemId, targetUser);
  chk("MI-3.1", "หลังเชิญ → target เห็นห้อง PRIVATE + isMember", visAfter.some((c) => c.id === chId && c.isMember), "เห็น+member", JSON.stringify(visAfter.find((c) => c.id === chId)) ?? "null");

  console.log("\n── idempotent: เชิญซ้ำ target → ไม่เบิ้ล ──");
  const before = (await memberIdsOf(systemId, chId)).size;
  const inv2 = await m.addChannelMember(systemId, chId, adminUser, targetUser);
  const after = (await memberIdsOf(systemId, chId)).size;
  chk("MI-4.1", "เชิญซ้ำ → ok (no-op)", inv2.ok === true, "ok", JSON.stringify(inv2).slice(0, 40));
  chk("MI-4.2", "จำนวนสมาชิกไม่เพิ่ม", before === after, String(before), String(after));
  const rowCount = await prisma.meetingChannelMember.count({ where: { channelId: chId, userId: targetUser } });
  chk("MI-4.3", "ไม่มีแถวสมาชิกซ้ำ (1 แถว/คน)", rowCount === 1, "1", String(rowCount));

  console.log("\n── re-invite: target ออกห้อง แล้วเชิญกลับ → leftAt=null ──");
  await m.leaveChannel(systemId, chId, targetUser);
  chk("MI-5.1", "หลังออก isChannelMember=false", (await m.isChannelMember(chId, targetUser)) === false, "false", "see");
  const inv3 = await m.addChannelMember(systemId, chId, adminUser, targetUser);
  chk("MI-5.2", "เชิญกลับ → ok", inv3.ok === true, "ok", JSON.stringify(inv3).slice(0, 40));
  chk("MI-5.3", "กลับเข้าห้อง (leftAt=null, isChannelMember=true)", (await m.isChannelMember(chId, targetUser)) === true, "true", "see");
  chk("MI-5.4", "ยังเป็น 1 แถว (re-join ล้าง leftAt ไม่สร้างใหม่)", (await prisma.meetingChannelMember.count({ where: { channelId: chId, userId: targetUser } })) === 1, "1", String(await prisma.meetingChannelMember.count({ where: { channelId: chId, userId: targetUser } })));

  console.log("\n── policy: non-admin member เชิญ → ปฏิเสธ ──");
  await m.joinChannel(tA.id, systemId, chId, memberUser); // member เข้าห้องเอง (ไม่ใช่ admin)
  const invByMember = await m.addChannelMember(systemId, chId, memberUser, nonStaffUser);
  chk("MI-6.1", "non-admin เชิญ → ปฏิเสธ", invByMember.ok === false, "false", JSON.stringify(invByMember).slice(0, 60));
  chk("MI-6.2", "ผู้เชิญที่ไม่อยู่ในห้องเลย → ปฏิเสธ", (await m.addChannelMember(systemId, chId, "ไม่มี-user", targetUser)).ok === false, "false", "see");

  console.log("\n── staff guard: target ไม่ใช่ staff accepted → ปฏิเสธ ──");
  const invNonStaff = await m.addChannelMember(systemId, chId, adminUser, nonStaffUser);
  chk("MI-7.1", "เชิญคนที่ Membership ยังไม่ accept → ปฏิเสธ", invNonStaff.ok === false, "false", JSON.stringify(invNonStaff).slice(0, 60));
  chk("MI-7.2", "nonStaff ไม่ถูกเพิ่มเป็นสมาชิก", !(await memberIdsOf(systemId, chId)).has(nonStaffUser), "ไม่มี", "see");

  console.log("\n── legacy fallback: ห้องไม่มี admin → ผู้สร้างเชิญได้ · member ธรรมดาเชิญไม่ได้ ──");
  const legacy = await prisma.meetingChannel.create({
    data: { tenantId: tA.id, systemId, name: `legacy-${stamp}`, kind: "PRIVATE", createdByUserId: adminUser },
  });
  // สร้างสมาชิกแบบ legacy: ทั้งหมด isAdmin=false (ไม่มี admin เลย)
  await prisma.meetingChannelMember.create({ data: { tenantId: tA.id, systemId, channelId: legacy.id, userId: adminUser, isAdmin: false } });
  await prisma.meetingChannelMember.create({ data: { tenantId: tA.id, systemId, channelId: legacy.id, userId: memberUser, isAdmin: false } });
  const legacyByCreator = await m.addChannelMember(systemId, legacy.id, adminUser, targetUser);
  chk("MI-8.1", "ห้องไม่มี admin → ผู้สร้างเชิญได้", legacyByCreator.ok === true, "ok", JSON.stringify(legacyByCreator).slice(0, 60));
  const legacyByMember = await m.addChannelMember(systemId, legacy.id, memberUser, nonStaffUser);
  chk("MI-8.2", "ห้องไม่มี admin + ผู้เชิญไม่ใช่ผู้สร้าง → ปฏิเสธ (conservative)", legacyByMember.ok === false, "false", JSON.stringify(legacyByMember).slice(0, 60));

  console.log("\n── cross-tenant: staff ร้าน A เชิญเข้าห้องร้าน B ไม่ได้ ──");
  const tB = await prisma.tenant.create({ data: { name: "QC Meeting Invite B", slug: `qc-mi-b-${stamp}` } });
  tenantBId = tB.id;
  const sysB = await prisma.appSystem.create({ data: { tenantId: tB.id, type: "MEETING", name: "แชทภายใน B" } });
  const adminB = await mkStaff(tB.id, "adminB");
  const chB = await m.createChannel({ tenantId: tB.id, systemId: sysB.id, name: `ห้อง-B-${stamp}`, kind: "PRIVATE", createdByUserId: adminB });
  if (!chB.ok) throw new Error("createChannel B failed");
  // adminB (admin ห้อง B) เชิญ targetUser (staff ของ A ไม่ใช่ B) → staff guard ปฏิเสธ
  const crossStaff = await m.addChannelMember(sysB.id, chB.id, adminB, targetUser);
  chk("MI-9.1", "เชิญ staff ต่างร้านเข้าห้อง → ปฏิเสธ (staff guard)", crossStaff.ok === false, "false", JSON.stringify(crossStaff).slice(0, 60));
  // adminUser (ร้าน A ไม่อยู่ห้อง B) เชิญ adminB → inviter ไม่ใช่สมาชิกห้อง B → ปฏิเสธ
  const crossInviter = await m.addChannelMember(sysB.id, chB.id, adminUser, adminB);
  chk("MI-9.2", "ผู้เชิญไม่ได้อยู่ในห้อง (ต่างร้าน) → ปฏิเสธ", crossInviter.ok === false, "false", JSON.stringify(crossInviter).slice(0, 60));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 140) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  for (const tid of [tenantAId, tenantBId]) {
    if (!tid) continue;
    await del(() => prisma.meetingMessage.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.meetingChannelMember.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.meetingChannel.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC Meeting Invite (เชิญสมาชิก + policy) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id })) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
