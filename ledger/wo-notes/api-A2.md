# WO A2 — หน้าตั้งค่า "แอปภายนอก/API" ของบัญชี (สร้างคีย์ผูกสมุด + bundle/scope + หมดอายุ + หมุน)

ผู้ทำ: Sonnet (builder UI) · สัญญา: `ledger/ACCOUNT-API-RUN.md` §A2 · oracle: `scripts/qc-account-api-settings.mts` (Fable, ห้ามแตะ — ไม่ได้แก้)

## ไฟล์ที่แก้/เพิ่ม

- `src/lib/api-keys/scopes.ts` — เพิ่ม `bundleLabelForScopes(scopes)` (ที่เดียวที่ตัดสินป้ายไทยของชุด scope: ตรง bundle ไหนพอดี → ป้าย bundle นั้น (เลือกใหญ่สุดถ้าเสมอ) · `[]` → "อ่าน API กลาง (คีย์รุ่นเดิม)" · อื่น ๆ → "กำหนดเอง (n สิทธิ์)"). ใช้ทั้งหน้าบัญชีและหน้าแพลตฟอร์ม กันพิมพ์ตรรกะซ้ำ 2 ที่.
- `src/lib/modules/account/connections-actions.ts` —
  - `createApiKeyAction(fd)`: อ่าน `name`/`bundle`/`scope` (หลายค่า)/`ttlDays`/`systemId` · ถ้าไม่มี `scope` ที่ติ๊กเลยแต่ส่ง `bundle` มา → ใช้ `expandBundles([bundle])` แทน · ตรวจทุก scope ด้วย `isApiScope` (ไม่ผ่าน → reason ไทยตรง ๆ ไม่ throw ดิบ) · `ttlDays==="0"` → `expiresAt=null` (ไม่หมดอายุ) · อื่น ๆ → `Date.now() + ttlDays*86_400_000` · เรียก `createApiKey({tenantId}, name, {scopes, systemId, expiresAt, createdById})` · ยังคง `assertCan(module:"api", action:"api.key.create")` + `assertAccountCan("account.settings.manage")` (ผ่าน `gate()` เดิม) ก่อน
  - `rotateApiKeyAction(fd)` (ใหม่): `id`+`systemId` → `rotateApiKey({tenantId}, id, {createdById})` → คืน `{ok:true, rawKey}` เดียวกับ create · ด่านสิทธิ์เหมือนกัน (ใช้ `api.key.create` ซ้ำ เพราะทะเบียนสิทธิ์ไม่มี action แยกสำหรับหมุน และหมุน = สร้างใหม่+เพิกถอนเก่า) · error → `safeReason` ไทย ไม่ throw ดิบ
  - `revokeApiKeyAction` ไม่แตะ (ของเดิม)
- `src/components/account-v2/ConnectionsPanel.tsx` — ส่วน "แอปภายนอก / API" (`ApiSection`) เขียนใหม่ทั้งฟอร์มสร้างคีย์และตารางคีย์ ส่วน Webhook/เชื่อมกับแอปอื่นไม่แตะ:
  - state: `bundleId` (default `issue-and-collect`) · `checkedScopes: Set<string>` (default = `expandBundles([DEFAULT_BUNDLE_ID])`) · `scopesOpen` (ปุ่มกาง/หุบ — mount แบบ conditional `{scopesOpen && (...)}`; state สิทธิ์ที่ติ๊กอยู่ที่ parent เสมอ ไม่หายตอนหุบ/กางใหม่)
  - เลือก bundle radio → **reset** `checkedScopes` เป็นชุดของ bundle นั้นเป๊ะ (ไม่ union กับที่ติ๊กไว้เดิม) ตรงสัญญา S1.8 ของ oracle
  - ติ๊ก/ถอด scope รายตัว → แก้ `checkedScopes` เฉย ๆ ไม่แตะ `bundleId` (แถวจะกลายเป็น "กำหนดเอง (n)" เพราะไม่ตรง bundle ไหนพอดีอีกต่อไป)
  - checkbox `name="scope"` ใช้ native `checked` ควบคุมด้วย React state ⇒ `FormData(form)` เก็บเฉพาะตัวที่ติ๊กจริงให้เอง (ไม่ต้องเก็บ manual)
  - ตารางคีย์เปลี่ยนจาก `<table>` เป็นแถว flex ที่ wrap ได้ (ไม่ใช้ 2 ชุด DOM แยกมือถือ/เดสก์ท็อป — ป้องกัน `data-testid` ซ้ำ 2 จุดที่จะทำให้ query ได้ค่าผิด element เวลาทดสอบข้ามอุปกรณ์) ใช้ label ย่อ (`sm:hidden`) กำกับแต่ละช่องตอนพับเป็นการ์ดบนมือถือ
  - ปุ่ม "หมุน" (`api-key-rotate-<id>`) เรียก `p.rotateKey` แล้วโชว์ rawKey ใหม่ใน `api-key-new` กล่องเดียวกับตอนสร้าง
  - ปุ่ม "สร้างคีย์" สูง `min-h-[40px]` บนมือถือ (`sm:min-h-0` กลับเป็นขนาดปกติบนเดสก์ท็อป)
  - คำอธิบายท้ายฟอร์ม: คีย์ผูกสมุดนี้เสมอ + ลิงก์ `/developers/account` (`target=_blank`, ตัวอักษรที่โชว์ = URL ตรง ๆ เพื่อให้ข้อความปรากฏจริงบนหน้าให้ oracle ภาพจับได้)
  - `ApiKeyRow` type เพิ่ม `scopes`/`systemLabel`/`expiresLabel`/`lastUsedLabel` · `ConnectionsPanelProps` เพิ่ม `rotateKey`
- `src/app/app/sys/[id]/account/settings/connections/page.tsx` — ดึง `sys` (ชื่อสมุดปัจจุบัน) จาก `requireAccountPage` มาด้วย · หาชื่อสมุดของ `systemId` อื่น ๆ ที่คีย์ผูกอยู่ (คีย์ของทั้ง tenant ไม่ได้กรองเฉพาะเล่มนี้) ผ่าน `prisma.appSystem.findMany` · ประกอบ `systemLabel`/`expiresLabel`/`lastUsedLabel` ด้วย `formatDateTh` ก่อนส่งลง client component (ฟอร์แมตวันที่ทำที่ server เหมือนแบบเดิมของไฟล์นี้) · ส่ง `rotateKey={rotateApiKeyAction}`
- `src/app/app/settings/api/page.tsx` (แพลตฟอร์ม) — เพิ่มบรรทัด "ขอบเขต: … · หมดอายุ …" ต่อคีย์ (`data-testid="api-key-row-scopes-<id>"`, ใช้ `bundleLabelForScopes` ตัวเดียวกับหน้าบัญชี) + ย่อหน้าลิงก์ไปหน้าคีย์บัญชี (`platform-api-key-account-link`) — หา ACCOUNT AppSystem ตัวแรกของ tenant; ถ้าไม่มีให้ลิงก์ไป `/app` พร้อมข้อความให้เปิดระบบบัญชีก่อน · ฟอร์มสร้างคีย์เดิม (`ApiKeyForm`/`actions.ts`) ไม่แตะ — คีย์จากหน้านี้ยัง `scopes: []` เหมือนเดิม
- `scripts/visual-acc-v2.mts` — เพิ่มคีย์ `"api-A2"`: `settings-api-keys` (เดสก์ท็อป), `settings-api-keys-scopes` (เดสก์ท็อป + `click` เปิดปุ่ม `api-key-scopes-toggle` ก่อนถ่าย — harness รองรับ `click: string[]` อยู่แล้ว ใช้แบบเดียวกับ `settings-connections-menu`), `settings-api-keys-mobile` (มือถือ 390) — **ยังไม่ได้ถ่ายจริง** (ไม่มี QC server รันอยู่ตอนทำงาน ตามกติกาเครื่อง 2 core ห้าม build/รัน browser oracle เอง) รอ Fable build+ยิง

## FormData contract (ตรงกับที่ oracle คาดหวัง)

`createApiKeyAction`: `name`, `bundle` (1 ค่า, ใช้เป็น fallback เมื่อไม่มี `scope` ติ๊กเลย), `scope` (0..n ค่า — ชุดที่ติ๊กจริงในตอนกดส่ง), `ttlDays` (`"30"|"90"|"365"|"0"`), `systemId` (hidden, ตั้งจาก `p.systemId` เสมอ)
`rotateApiKeyAction`: `id`, `systemId`

## เช็ค data-testid ที่ oracle อ้างถึง (grep ทั้ง 2 ทาง — ครบทุกตัว)

- `connections-api` ✓ (`ConnectionsPanel.tsx:421`)
- `api-key-bundle-<bundleId>` ×5 ✓ (`:552`, วนจาก `API_SCOPE_BUNDLES` — ครบ `read-only/issue-and-collect/accountant/danger/settings`)
- `api-key-ttl` ✓ (`:566`, `defaultValue="365"`)
- `api-key-scopes-toggle` ✓ (`:576`)
- `api-key-scope-<permissionKey>` ✓ (`:593`, วนจาก `ACCOUNT_SCOPE_KEYS`)
- `api-key-name` ✓ (`:536`)
- `api-key-submit` ✓ (`:605`)
- `api-key-new` ✓ (`:437`)
- `api-key-row-<id>` ✓ (`:447`)
- `api-key-row-bundle-<id>` ✓ (`:456`)
- `api-key-row-expires-<id>` ✓ (`:464`)
- `api-key-row-system-<id>` ✓ (`:460`)
- `api-key-rotate-<id>` ✓ (`:479`, ซ่อนเมื่อเพิกถอนแล้ว)
- `api-key-revoke-<id>` ✓ (`:497`)
- `platform-api-key-account-link` ✓ (`src/app/app/settings/api/page.tsx:49,57`)
- `api-key-row-scopes-<id>` ✓ (`src/app/app/settings/api/page.tsx:92`)

## หมายเหตุพฤติกรรม/การออกแบบ

- แถวคีย์เป็น flex เดียวที่ wrap เอง (ไม่ใช่ตาราง + การ์ดมือถือแยกชุด) — กันปัญหา `data-testid` ซ้ำ 2 ที่ในหน้าเดียวกันซึ่งจะทำให้ query ผิด element เวลาทดสอบข้ามอุปกรณ์ และให้ state/markup มีที่เดียว
- checklist สิทธิ์รายตัวใช้ conditional mount (`{scopesOpen && (...)}`) ไม่ใช่ CSS-hide-เสมอ — ปลอดภัยเพราะ source of truth ของสิทธิ์ที่ติ๊กอยู่ที่ `checkedScopes` (state ระดับ `ApiSection` ไม่ใช่ local ของ checklist) ไม่หายตอนหุบ/กางใหม่
- คีย์ที่ seed ไว้ก่อน (`"สำนักงานบัญชี"`, `scopes:[]`, `expiresAt:null`) จะโชว์ "อ่าน API กลาง (คีย์รุ่นเดิม)" และ "ไม่หมดอายุ" อัตโนมัติ — ใช้อันนี้เป็นหลักฐานว่า literal string ที่ visual harness คาดหวัง (`"ไม่หมดอายุ"`) ปรากฏจริงแม้ไม่ได้สร้างคีย์ใหม่ระหว่างถ่ายภาพ
- `rotateApiKeyAction` ใช้ scope `api.key.create` ซ้ำกับ create (ทะเบียนสิทธิ์ไม่มี action แยกสำหรับหมุน และหมุนก็คือสร้างใหม่+เพิกถอนเก่าในทางปฏิบัติ) — ถ้าต้องการแยกสิทธิ์ในอนาคตต้องเพิ่ม `api.key.rotate` ในทะเบียน `permissions.ts` ก่อน

## คำสั่งที่รัน + ผลลัพธ์

```
export DATABASE_URL=... DIRECT_URL=... (QC ep-plain-art) APP_ENV=development
pnpm exec tsx scripts/qc-acc-v2-permissions.mts   → ผ่าน 160/160 (0 findings)
pnpm exec tsx scripts/qc-public-api.mts           → ผ่าน 18/18 (0 findings)
pnpm exec tsx scripts/qc-account-api-keys.mts     → ผ่าน 51/51 (0 findings)
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck   → 1 error (ดูหมายเหตุด้านล่าง — ไม่ใช่จากงานนี้)
pnpm fitness                                       → ผ่าน 20/20 (0 findings, รวม F13)
```

`scripts/qc-account-api-settings.mts` (browser oracle ของ WO นี้) **ไม่ได้รัน** — ไม่มี QC server (`bash scripts/acc-v2-serve.sh status` = "ไม่ได้ทำงาน") และกติกาเครื่อง 2 core/5GB ห้าม builder รัน `next build`/browser oracle เอง ให้ Fable build+รันตรวจรับ ได้ทำ static self-check testid ครบแล้วด้านบน

### ⚠️ typecheck ไม่ใช่ 0 — สาเหตุอยู่นอกงาน A2

```
scripts/qc-account-api-write-docs.mts(95,114): error TS2345: Argument of type 'string | boolean' is not assignable to parameter of type 'boolean'.
```

ไฟล์นี้ (`qc-account-api-write-docs.mts`, พร้อม `qc-account-api-write-master.mts`, `qc-account-api-write-payments.mts`) เป็นไฟล์ **untracked ใหม่ที่ไม่ได้อยู่ใน git diff ของ WO A2** — สร้าง/แก้ล่าสุดระหว่างที่งานนี้กำลังทำ (timestamp 08:05–08:12 UTC วันนี้ ขณะ session นี้เริ่มทำงานก่อนหน้านั้น) ตรงกับ oracle ของ WO ถัดไป (B4/C1 ตามที่ `ledger/ACCOUNT-API-RUN.md` ถูกแก้ไขพร้อมกันในช่วงเวลาเดียวกัน — ดูเหมือน Fable กำลังเตรียม oracle ของเฟส B/C ควบคู่ไปด้วย) ไม่ใช่ไฟล์ที่ WO A2 แตะ และตามกติกา "builder ห้ามแก้ oracle" จึงไม่ได้เข้าไปแก้ให้ — import ทั้งหมดในไฟล์นั้นเป็น dynamic import + `as string`/`Record<string, Any>` ไม่มีจุดเชื่อมกับ type ที่ WO A2 แก้ (`scopes.ts`/`service.ts`/`ConnectionsPanel.tsx`) เลย ยืนยันว่าไม่ใช่ผลจากการเปลี่ยนของฉัน แนะนำให้ Fable รัน `pnpm typecheck` ซ้ำหลังไฟล์นั้นเสร็จสมบูรณ์

## สรุปผลด่าน (gate summary)

1. `qc-acc-v2-permissions` → **160/160 ✅**
2. `qc-public-api` → **18/18 ✅**
3. `qc-account-api-keys` → **51/51 ✅**
4. `typecheck` → **1 error (นอกขอบเขต WO A2 — ดูหมายเหตุ · โค้ดของ A2 เองไม่มี error)**
5. `fitness` → **20/20 ✅**

ต้นไม้ปล่อย dirty ตามกติกา — ยังไม่ commit
