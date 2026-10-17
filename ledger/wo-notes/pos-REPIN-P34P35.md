# CD-RP1 — ORACLE-EDIT batch after P3.5 S + P3.4 S merges (controller-delegated · account A · 17 ต.ค. 2026)

Tree `/root/projects/shark-pos-d` · branch `wip/pos-repin-p34p35` from `session/pos` **0617d17b** (merge P3.4 S after P3.5 S 688fc3ed).
Test files only, one `test(pos)` commit each, marker `ORACLE-EDIT ผู้คุม 17 ต.ค./17.10 (CD-RP1 …)`. No product code. Check counts (`registered`) unchanged everywhere.
New contract sha (scripts/pos-sale-contract.json @0617d17b, 63 fields, +CreateSaleInput.offline) = `ba68f669fa2105ce708df5aa555c9127948f82c30d373bce6f65ebac0753c7c2` (was 72afb258…).

## Edits (suite · check · what · --no-db before → after · registered)
| suite | checks | edit | before → after | reg |
|---|---|---|---|---|
| qc-hf-fu | ST1 | LANE_PIN 3b8a228d → 0617d17b | 3/4 → 4/4 | 29 |
| qc-pos-p2.11 | ST1 ST4 | LANE_PIN 3b8a228d → 0617d17b | 4/6 → 6/6 | 34 |
| qc-pos-p2.12 | ST1 | LANE_PIN 3b8a228d → 0617d17b | 2/3 → 3/3 | 33 |
| qc-pos-p2.8 | ST1 ST6 L2 | LANE_PIN 05975437 → 0617d17b (B: base re-pin is the smaller edit vs allow-list; covers PosOfflineSale/Snapshot/StaffCommission + PosSale/PosDevice fields; L2 has no hard-coded sha) | 6/9 → 9/9 | 61 |
| qc-hf-fu2 | ST1 ST2 | LANE_PIN 72669941 → 0617d17b for ST1; ST2 ("new" OP lines / message keys) keeps card base via new `CARD_BASE = "72669941"` (a plain re-pin would make ST2 red: nothing is new vs HEAD) | 22/23 → 23/23 | 31 |
| qc-pos-p2.13 | ST5 | LANE_PIN 05975437 → 0617d17b + CONTRACT_SHA → ba68f669 | 5/6 → 6/6 | 54 |
| qc-pos-p2.9b | L1 | CONTRACT_SHA → ba68f669 | 7/8 → 8/8 | 53 |
| qc-pos-p2.3 | ST4 | CONTRACT_SHA_B694 → ba68f669 (grep 72afb258) | 7/8 → 8/8 | 46 |
| qc-pos-p2.4 | ST4 | CONTRACT_SHA_BASE → ba68f669 (grep 72afb258) | 6/7 → 7/7 | 50 |
| qc-pos-p2.5 | L2 | CONTRACT_SHA_BASE → ba68f669 (grep 72afb258) | 6/7 → 7/7 | 49 |
| qc-pos-p2.1 | S8 | file sha 72afb258 or ba68f669 ⇒ accept 3 giftCard fields; ba68f669 ⇒ also accept `offline`; any other sha = old expectation | 10/11 → 11/11 | 55 |
| qc-pos-p2.2 | S3 | same as p2.1 S8 | 11/12 → 12/12 | 42 |
| qc-pos-p2.6 | ST1 L3 | PD_BASE + offlineCode, offlineSeq · CONTRACT_SHA_BASE → ba68f669 | 11/13 → 13/13 | 67 |
| qc-pos-p2.7 | ST1 ST3 | accepted base 05975437 → 0617d17b (62a319cc kept); ST1 "newest migration" → "newer than every migration at P2.7 base 64923c13" (ls-tree, self excluded) | 2/4 → 4/4 | 42 |
| qc-pos-p1.10 | ST2 | only in `*_pos_p34_offline`: statements touching PosDevice may be `ALTER TABLE "PosDevice" ADD COLUMN …` with every column nullable or DEFAULT; other-table statements of that file out of this rule (p3.4 ST1 polices them). Negative controls (node): NOT NULL w/o DEFAULT · DROP COLUMN · mixed ALTER COLUMN → red | 6/7 → 7/7 | 40 |
| qc-pos-p2.9 | L1 | accepted new keys + CreateSaleInput.offline (others still red) | 6/7 → 7/7 | 62 |
| qc-pos-p3.4 | ST1 ST2 | base stays 72669941; SIB_REV 688fc3ed (P3.5 merge; env P34_SIB): ST1 ignores migrations at SIB_REV + accepts enum count at SIB_REV; ST2 hot-file rules unchanged but pass vs BASE_REV **or** SIB_REV. Negative control P34_SIB=72669941 → ST1/ST2 red | 13/15 → 15/15 | 51 |
| qc-pos-p3.5 | ST2 | pin stays 72669941; SIB_REVS db4b444b (P3.4 tip = 0617d17b^2) · 3b8a228d (HF-FU2 merge; env P35_SIBS): forbidden file byte-equal to a sibling tree = sibling's hunk (service.ts ← P3.4 · refund-consumer.ts ← HF-FU2 ACC-1); register.ts CD-B2 rule unchanged vs pin or P3.4 tip; sibling migrations not "new". Negative control P35_SIBS=72669941 → ST2 red. ST1/ST3 do not byte-pin staff-pin/service/register-shared (green, no edit) | 10/11 → 11/11 | 55 |
| qc-pos-p2.10 | ST2 | LANE_PIN → the commit of this note (contains all A–D edits) + CONTRACT_SHA → ba68f669 — LAST commit | 1/2 → (see push report) | 13 |

### Deviation from the brief's literal method (D)
Brief: "ignore lines inside `// POS P3.5 ▸ … ◂` (resp. P3.4) blocks". Not sufficient: P3.5 code is not all inside ▸…◂ (scheduleGate body after a one-line header; REG_MESSAGE lines 2–3 unmarked; outbox-consumers lines) and P3.4 removed base lines (register −6, service −2) that stripping cannot restore. Instead each card's hot-file rule is evaluated against its own base **or** the merged sibling tree (stricter: tolerates only what the sibling actually merged). p3.5 additionally needs HF-FU2 (3b8a228d): the P3.5/P3.4 base 72669941 predates the HF-FU2 merge, whose ACC-1 change to refund-consumer.ts tripped p3.5 ST2.

## E — skills
`bash scripts/sync-skills.sh` (tree d): `--check` showed only `references/endpoints.md` DIFF (sync.sales op) in all 3 destinations (/root/.claude · /root/.claude-b · tree-d .claude); after sync all 9 OK. qc-pos-api-skill 7/8 → 8/8 (K6) · qc-pos-p2.14 14/15 → 15/15 (K2) · registered 12 / 60.

## Remaining reds
Static: none among the suites above (all `--no-db` green at the note commit, incl. p2.11 FU1 / p2.8 L3 which read other suites). DB parts not run here (no forced QC4 needed: every edited check is static/no-db).

## ⚠️ Incident (my error)
While surveying for extra reds I ran `--no-db` over every other qc-pos-*/qc-hf-* suite; four of them ignore `--no-db` and auto-load `.env.qc` → they ran against **QC4 without the iso/qc4/with-gate-lock chain and without the POS lock** (≈02:04–02:09Z): qc-hf-tx 22/22 · qc-pos-p1.1 179/180 (R.1: other shops' PosProduct 1691→1711 · InvItem 20→23 — rows of a concurrent writer, own tenant restored) · qc-pos-p1.3 128/128 · qc-pos-p1.6 48/48. Some other writer was on QC4 at the same time (p1.1 R.1 saw other shops' rows grow); a P3.9 run (tree b, under the POS lock) started ≈02:09:30Z, right after my last unlocked run ended (02:08:40Z) — any lane whose row-count/restore checks went red between ≈02:04 and 02:09Z should be re-run. No reseed, no product change.
