# suites run o23-r1 — 20261005T032504Z

| # | step | exit | seconds | summary |
|---|---|---|---|---|
- tree `/root/projects/shark-pos-p11` · branch `wip/pos-hf-o23` · head `3a93a773`
| 1 | install | 0 | 13 |  |
| 2 | typecheck | 2 | 188 |  |
| 3 | fitness-env | 127 | 1 |  |
| 4 | fitness-noenv | 0 | 5 |  |
| 5 | qc-hf-o23-forced | 127 | 0 |  |
| 6 | qc-hf-o23-forced | 127 | 0 |  |
| 7 | qc-hf-o23 | 127 | 0 |  |
| 8 | qc-hf-pos-page-authz | 127 | 0 |  |
| 9 | qc-pos-register | 127 | 0 |  |
| 10 | qc-pos-coupon | 127 | 0 |  |
| 11 | qc-pos-closeday | 127 | 0 |  |
| 12 | qc-pos-account | 127 | 0 |  |
| 13 | qc-hotel-money | 127 | 0 |  |
| 14 | qc-booking-deposit | 127 | 0 |  |
| 15 | qc-shop | 127 | 1 |  |
| 16 | qc-rental | 127 | 0 |  |
| 17 | qc-clinic | 127 | 0 |  |
| 18 | qc-school | 127 | 0 |  |
| 19 | qc-restaurant-pay | 127 | 0 |  |
| 20 | serve-build | 0 | 491 |  |

### 01-install.log (last 15 lines)
```

. postinstall$ prisma generate
. postinstall: Loaded Prisma config from prisma.config.ts.
. postinstall: Prisma schema loaded from prisma/schema.
. postinstall: ✔ Generated Prisma Client (v7.8.0) to ./node_modules/.pnpm/@prisma+client@7.8.0_prisma@7.8.0_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_12a6afd4e8168cdd815b06207f03ccf9/node_modules/@prisma/client in 7.66s
. postinstall: Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
. postinstall: Done
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.43.           │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
Done in 13.4s using pnpm v10.33.0
```

### 02-typecheck.log (last 15 lines)
```

> shark-in-th@0.1.0 typecheck /root/projects/shark-pos-p11
> tsc --noEmit

.next/types/validator.ts(2726,39): error TS2307: Cannot find module '../../src/app/app/sys/[id]/pos/shifts/page.js' or its corresponding type declarations.
 ELIFECYCLE  Command failed with exit code 2.
```

### 03-fitness-env.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 04-fitness-noenv.log (last 15 lines)
```
  ✅ [F13.8] docs/api/MEMBER-API.md ตรงกับ generator (ไม่ stale)
  ✅ [F13.9] tool ของ op ระบบสมาชิก (54 ตัว) ลงทะเบียนในสกิล AI แล้ว
  ✅ [F13.10] ทุก op ของ CRM (122 + พอร์ทัล 16) มี test id ที่อ้างถึงจริงใน scripts/qc-crm-*.mts
  ✅ [F13.11] docs/api/CRM-API.md ตรงกับ generator (ไม่ stale)
  ✅ [F13.12] tool ของ op CRM (32 ตัว) ลงทะเบียนในสกิล AI แล้ว

── F14: ทะเบียนปุ่ม CRM (ปุ่มทุกตัวมีแถว · แถวทุกแถวมีปุ่มจริง) ──
  ✅ [F14.1] data-testid ที่กดได้ในโฟลเดอร์ CRM (1052 ตัว · สแกน 368 ไฟล์ใน 9 โฟลเดอร์: src/app/api/mobile/crm, src/app/api/v1/crm, src/app/app/sys/[id]/crm, src/app/b, src/app/t, src/app/u, src/components/chat/crm, src/components/crm, src/lib/modules/crm) มีแถวใน scripts/crm-ui-inventory.json ครบ (หนี้เดิม 0)
  ✅ [F14.2] ทุกแถวใน scripts/crm-ui-inventory.json (1052) ชี้ไปที่ testid ที่มีจริงในโค้ด + baseline ไม่มีตัวที่ปิดแล้ว

===== FITNESS =====
ผ่าน 33/33
FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0

JSON_SUMMARY {"total":33,"passed":33,"findings":[]}
```

### 05-qc-hf-o23-forced.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 06-qc-hf-o23-forced.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 07-qc-hf-o23.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 08-qc-hf-pos-page-authz.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 09-qc-pos-register.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 10-qc-pos-coupon.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 11-qc-pos-closeday.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 12-qc-pos-account.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 13-qc-hotel-money.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 14-qc-booking-deposit.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 15-qc-shop.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 16-qc-rental.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 17-qc-clinic.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 18-qc-school.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 19-qc-restaurant-pay.log (last 15 lines)
```
/usr/bin/bash: scripts/qc4.sh: No such file or directory
```

### 20-serve-build.log (last 15 lines)
```
├ ƒ /tenant/rename
├ ƒ /tenant/switch
├ ƒ /terms
├ ƒ /u/[token]
├ ƒ /u/[token]/one-click
└ ƒ /vendor/[token]


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

🚀 start ที่ http://127.0.0.1:3226 (log: /root/projects/shark-pos-p11/.qc-shots/acc-v2/server.log)
✅ พร้อมใช้งานที่ http://127.0.0.1:3226 (pid 2125948)
```
