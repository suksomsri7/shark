# Backoffice Admin — backoffice ของแพลตฟอร์ม (BLUEPRINT §6)

> **สถานะ:** Phase 0 กำลังสร้าง (WO-0019) · จำเป็นก่อนเปิดรับร้านจริง — ตอนนี้เจ้าของแพลตฟอร์มยังไม่มีจอดูว่าใครสมัคร
> **หลักการ:** แยกจากฝั่งร้าน**โดยสิ้นเชิง** — user คนละตาราง (PlatformUser) · session คนละ cookie (`bo_session`) · ห้ามปน RBAC ร้าน

## สถาปัตยกรรม

```
/backoffice (route group ใหม่)
  /login            OTP email เท่านั้น (pattern เดียวกับ auth ร้าน แต่คนละตาราง)
  /                 dashboard: metrics รวม
  /tenants          รายชื่อร้านทั้งหมด + จำนวนระบบ + วันสมัคร
  /tenants/[id]     รายละเอียดร้าน (read-only Phase 0)

src/lib/platform/   ← core layer ใหม่ (แบบเดียวกับ ai/, dna/)
  auth.ts           requestPlatformOtp / verifyPlatformOtp / getPlatformUserByToken / requirePlatformRole
  service.ts        listTenantsOverview / platformMetrics / tenantDetail
  actions.ts        server actions (cookie bo_session)
```

**Roles (มีแล้วใน enum PlatformRole):** SUPER_ADMIN (ทุกอย่าง) · SUPPORT (อ่าน + เคส) · FINANCE (billing — Phase หลัง)
**Phase 0 ให้สิทธิ์อ่านทุก role · การกระทำ (ระงับร้าน ฯลฯ) = SUPER_ADMIN — ยังไม่มีใน Phase 0**

## ความปลอดภัย (กฎเหล็ก)
1. PlatformUser สร้างได้ทาง seed script เท่านั้น (bo-seed-admin — Builder สร้างใน WO-0019) — ไม่มีหน้า register
2. ตาราง platform ทั้งหมด axis "platform" ใน scope.ts — tenantDb แตะแล้ว throw (fail-closed)
3. OTP hash ด้วย sha256 แบบเดียวกับ auth ร้าน · TTL 10 นาที · ใช้แล้วทิ้ง (usedAt)
4. email ไม่รู้จัก → ตอบ generic เหมือนสำเร็จ (กัน enumeration) แต่ไม่สร้าง token ไม่ส่งเมล
5. session TTL 7 วัน · cookie `bo_session` httpOnly + secure

## เฟส
- **Phase 0 (WO-0019):** auth + shell + tenant list/detail (read-only) + metrics + seed admin
- **Phase 1:** ระงับ/เปิดร้าน (พร้อม AuditLog) + ประกาศระบบ + support desk (เคสจากปุ่ม help ในแอปร้าน)
- **Phase 2:** billing (custom domain 1,500฿/ปี) + usage metrics ลึก

## ข้อสอบ (oracle qc-backoffice.mts) — Fable เขียน
auth flow ครบ (ขอ OTP/verify ผิด-ถูก/หมดอายุ/ใช้ซ้ำ) · enumeration guard · role guard · listTenants + metrics เห็นข้อมูลจริง
