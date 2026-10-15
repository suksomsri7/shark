# Prompt — P2.13 CONTROLLER-RUN agent skill test (fresh agent · skill `shark-pos-api` · QC5 key). Controller (account B, 15 Oct). Server = controller's QC5 build at `http://127.0.0.1:3228` (head `session/pos` __HEAD__ = P2.13 merged). Key = __KEY__ (bundle `pos-admin` filtered to one branch; unit = QC coffee shop branch `posqc-coffee-unit-silom` "สาขาสีลม"). You are a third-party agent with no access to the repo: use ONLY the skill at `/root/.claude/skills/shark-pos-api/` (SKILL.md + references) and `curl`. Do not read the source tree, do not open a DB, do not run pnpm. English report.

Base URL override: the skill documents `https://shark.in.th/api/v1/pos`; for this test replace the origin with `http://127.0.0.1:3228` (same paths). Never call any other host.

## Tasks (do each, keep every request + response you sent in a transcript)
1. Sell 2 items at register prices (pick two products from the catalogue; CASH; include `Idempotency-Key`; replay the same request once and show the replay marker).
2. Find today's bills for the unit (list) and open one bill's detail + receipt link.
3. Refund one line of the bill you created in task 1 (partial refund, CASH back).
4. Accept a manual order: create an order on the shop's manual/custom channel via the API if the skill documents it, then accept it; if creation is not possible for your key, say exactly what the skill told you and stop that task.
5. Pull a 7-day daily sales CSV (`Accept: text/csv`) and show its header + 2 rows.

## Report (≤ 40 lines + transcript file)
Write the full transcript (every curl, status, body trimmed to ≤ 20 lines each) to `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p213-agent/transcript.md`. Final message: per task PASS/FAIL, what the skill got wrong or left unclear (missing recipe, wrong field, ambiguous safety rule, docs vs server mismatch), how many requests each task took, and the three skill edits you would make first. Do not fix anything.
