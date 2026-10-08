# T3.4 — Pack & usage screens C1 · C2 · C3 (closed) · D4 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A2, R-A5, R-C3, R-C8 first. Contract: AI-TEAM-RUN §2 T3.4. Mockups `airy-c.jpg` pages 1–3, `airy-d.jpg` page 4 (+ dark). HTML:
- C1: "แพ็กฟรี · คุณสุข · โควตาใช้ร่วมกัน 3 กิจการ" · big ring 62% · "ใช้ไปแล้ว · รอบใหม่ 1 ต.ค. (อีก 4 วัน)" · ✓ "พอใช้ถึงรอบใหม่" · "ดูแพ็กทั้งหมด" · "ใช้ไปกับใคร · The Bean Café" bars per employee (น้องมะลิ 24% …) · "ถ้าโควตาหมดก่อนรอบใหม่ · พักทีมจนรอบใหม่" (read-only).
- C2: "แพ็ก · ทุกแพ็กจ้าง AI ได้ไม่จำกัด · ตอนนี้เปิดให้ใช้แพ็กฟรี" · FREE card "ใช้อยู่ ฿0/เดือน · งานประจำ n · ผู้อนุมัติ n" · Starter/Pro/Business cards greyed "เร็ว ๆ นี้" with price · note "แพ็กเสียเงินยังไม่เปิดขายในรุ่นนี้" · button "แจ้งฉันเมื่อเปิดขาย".
- C3: "เติมโควตา" · banner "ยังไม่เปิดให้เติมในรุ่นนี้ · จะเปิดพร้อมแพ็กเสียเงิน" · 3 greyed amounts (+10% ฿190 …) · payment rows greyed · disabled button "ยังไม่เปิดให้เติม".
- D4: header · "โควตาเดือนนี้หมดแล้ว" · "แพ็กฟรี · ใช้ครบ · รอบใหม่ 1 พ.ย. (อีก 12 วัน)" · 3 stats · note "น้องมะลิพักงานอยู่ · … งานที่ค้างจะทำต่อทันทีเมื่อมีโควตา" · Starter card greyed · "ตกลง · รอรอบใหม่" · "แจ้งฉันเมื่อเปิดขายแพ็กเสียเงิน".

## Data
`GET quota` (snapshot incl. `sharedAcrossTenants`, `tenantCount`, `perEmployee`) · `GET packs` (new route: `PACKS` with `approxTasks` possibly null — add to T1.10 addendum or this WO's server part) · `POST sale-notify { pack }` (T3.6; stub returns 501 until merged — the button shows a toast "บันทึกแล้ว" only on 200).

## Deliverables
`app/(app)/plan/{index,packs,topup,exhausted}.tsx` · `QuotaRing` large variant · `EmployeeUsageBars` · `PackCard` (greyed state, "เร็ว ๆ นี้" chip; task line only when `approxTasks !== null`) · C3 is an informational screen: **no** payment component, no card entry, no network calls except `packs` (oracle intercepts) · D4 shown automatically from A1 when `quota.state === EXHAUSTED` (banner → screen), "ตกลง" returns · "แจ้งฉัน…" → `saleNotify`.
testIDs `plan-ring`, `plan-all-packs`, `plan-emp-<id>`, `plan-overflow`, `packs-card-<key>`, `packs-notify`, `topup-amount-<k>`, `topup-disabled`, `exh-ok`, `exh-notify`.

## Acceptance (oracle `qc-ai-t3.4`)
S1 pairs ×4 light/dark · S2 C2 approxTasks gating · S3 C3 no payment network, button disabled · S4 D4 on EXHAUSTED, ok returns · S5 per-employee pct · S6 testIDs/i18n · typecheck · residue. Regression T2.11.
