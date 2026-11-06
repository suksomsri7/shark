# HR V2 RUN — metrics per WO (from 6 Nov 2026; compare against H1.x of 22 Oct: ≈2.1 h/WO, 6–8 spawns, 4 full regression runs)
| WO | start→merge (UTC) | spawns (role·tokens·min) | control runs (mode·steps·min) | fix rounds | notes |
|---|---|---|---|---|---|
| H1.1 (old rules) | 22 Oct 13:52→19:09 (5h17) | oracle · builder ×3 rounds · reviewer ×2 · addendum oracle | control1+2 (38 steps ≈33 min each) + postmerge 12 | 2 | baseline |
| H1.3 (old rules) | 22 Oct 15:16→22:10 (6h54, lane shared) | oracle · builder · reviewer | control1 38 steps 33 min + postmerge | 1 (S6.5 oracle-edit) | baseline |
| H2.1 (new rules, resumed) | 6 Nov 13:40→(paused 14:2x) | reviewer·163k·4 · hunter·197k·9 · builder r2·230k·33 (paused before typecheck) | control1 lean 36 steps 30 min (typecheck pending) | 1 (combined R-1..R-3+F4) | build itself was 22 Oct |
