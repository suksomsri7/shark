# CRM v2 — PARITY SHOTS INDEX

- Server: http://127.0.0.1:3215 · BUILD_ID `PZ-hmRSPiZ2jzHeITwUCp` · BUILD-STATE `READY 12:10 725f0e0a port=3215 ai=mock webhook-private=on cwd=shark-crm` (server build commit) · tree HEAD at index time `6378b7aa` (branch session/crm)
- Product code diff server-build → HEAD (excluding ledger/): ` 8 files changed, 215 insertions(+), 15 deletions(-)`
- Shooting window (UTC, from summary files): 2026-10-07T23:16:22.637Z → 2026-10-08T01:09:05.827Z · lane start `2026-10-07T23:04:47Z` · index written `2026-10-08T01:24:18Z`
- DB: QC1 (.env.qc, host ep-plain-art) · env CRM_V2_SWITCH=all SHARK_AI_MOCK=1 · viewports desktop 1440x900 @2x, mobile 390x844 @2x, fullPage
- Shots root: `/root/projects/shark-crm/.qc-shots/crm/<WO>/<name>-<role>-<device>.png` · sheets: `/tmp/crm-parity/sheets/` · per-run logs: `/tmp/crm-parity/logs/shot-<WO>-<role>.log`
- Totals: 631 shots · OK 496 · FAIL 135

## Run matrix (visual-crm set × role)

DONE n/m = run finished, n shots OK of m · NOSPEC = shooter has no spec of this set for this role (exit 2 before any work)

| set | owner | manager | nok | thana |
|---|---|---|---|---|
| 0.1 | DONE 0/6 | SKIPPED | SKIPPED | SKIPPED |
| 1.3 | DONE 6/6 | DONE 6/6 | DONE 0/6 | DONE 0/6 |
| 1.4 | DONE 7/7 | DONE 7/7 | DONE 4/7 | DONE 6/7 |
| 1.5 | DONE 12/12 | DONE 10/12 | DONE 12/12 | DONE 10/12 |
| 1.6 | DONE 8/8 | DONE 6/8 | DONE 8/8 | DONE 6/8 |
| 1.7 | DONE 6/6 | DONE 2/6 | DONE 2/6 | DONE 2/6 |
| 1.9 | DONE 8/8 | DONE 6/8 | NOSPEC | NOSPEC |
| 1.10 | DONE 5/5 | DONE 0/5 | DONE 0/5 | DONE 0/5 |
| 1.11 | DONE 30/30 | DONE 21/21 | DONE 10/21 | DONE 12/21 |
| 2.1 | DONE 4/4 | DONE 4/4 | NOSPEC | NOSPEC |
| 2.2 | DONE 12/12 | DONE 12/12 | DONE 2/8 | DONE 4/8 |
| 2.3 | DONE 6/6 | DONE 6/6 | NOSPEC | NOSPEC |
| 2.4 | DONE 6/6 | DONE 6/6 | NOSPEC | NOSPEC |
| 2.5 | DONE 10/10 | DONE 8/10 | DONE 0/6 | DONE 0/6 |
| 2.6 | DONE 10/10 | DONE 10/10 | NOSPEC | NOSPEC |
| 2.7 | DONE 8/8 | DONE 6/8 | NOSPEC | NOSPEC |
| 2.8 | DONE 6/6 | DONE 6/6 | NOSPEC | NOSPEC |
| 2.10 | DONE 6/6 | DONE 6/6 | DONE 6/6 | DONE 6/6 |
| 2.11 | DONE 3/3 | NOSPEC | NOSPEC | NOSPEC |
| 3.1 | DONE 9/9 | DONE 8/8 | DONE 0/8 | DONE 0/8 |
| 3.2 | DONE 5/5 | DONE 3/3 | DONE 0/3 | DONE 2/3 |
| 3.3 | DONE 6/6 | DONE 4/4 | DONE 2/2 | DONE 2/2 |
| 3.4 | DONE 10/10 | DONE 8/8 | DONE 0/6 | DONE 2/4 |
| 3.5 | DONE 2/4 | NOSPEC | NOSPEC | NOSPEC |
| 3.6 | DONE 2/2 | NOSPEC | NOSPEC | NOSPEC |
| 3.7 | DONE 26/26 | DONE 26/26 | DONE 3/3 | DONE 3/3 |
| 3.9 | DONE 6/6 | DONE 2/2 | NOSPEC | NOSPEC |

## FAIL list (as reported by visual-crm)

| design | set | shot | role | device | reason | file |
|---|---|---|---|---|---|---|
| 05 | 0.1 | crm-v1-contacts | owner | desktop | missing form input[name='name'],form input[name='phone'],form input[name='source'] | `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-contacts-owner-desktop.png` |
| 05 | 0.1 | crm-v1-contacts | owner | mobile | missing form input[name='name'],form input[name='phone'],form input[name='source'] | `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-contacts-owner-mobile.png` |
| - | 0.1 | crm-v1-deals | owner | desktop | missing form select[name='contactId'],form input[name='title'],form input[name='value'] | `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-deals-owner-desktop.png` |
| - | 0.1 | crm-v1-deals | owner | mobile | missing form select[name='contactId'],form input[name='title'],form input[name='value'] | `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-deals-owner-mobile.png` |
| 08 | 0.1 | crm-v1-activities | owner | desktop | missing h2 | `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-activities-owner-desktop.png` |
| 08 | 0.1 | crm-v1-activities | owner | mobile | missing h2 | `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-activities-owner-mobile.png` |
| 04 | 1.3 | crm-companies-list | nok | desktop | HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-count]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-list-nok-desktop.png` |
| 04 | 1.3 | crm-companies-list | nok | mobile | HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-count]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-list-nok-mobile.png` |
| 04 | 1.3 | crm-companies-new | nok | desktop | HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-new-nok-desktop.png` |
| 04 | 1.3 | crm-companies-new | nok | mobile | HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-new-nok-mobile.png` |
| 04 | 1.3 | crm-company-360 | nok | desktop | HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[data-testid=company-360-tabs]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-company-360-nok-desktop.png` |
| 04 | 1.3 | crm-company-360 | nok | mobile | HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[data-testid=company-360-tabs]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-company-360-nok-mobile.png` |
| 04 | 1.3 | crm-companies-list | thana | desktop | HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-count]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-list-thana-desktop.png` |
| 04 | 1.3 | crm-companies-list | thana | mobile | HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-count]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-list-thana-mobile.png` |
| 04 | 1.3 | crm-companies-new | thana | desktop | HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-new-thana-desktop.png` |
| 04 | 1.3 | crm-companies-new | thana | mobile | HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-new-thana-mobile.png` |
| 04 | 1.3 | crm-company-360 | thana | desktop | HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[data-testid=company-360-tabs]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-company-360-thana-desktop.png` |
| 04 | 1.3 | crm-company-360 | thana | mobile | HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[data-testid=company-360-tabs]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-company-360-thana-mobile.png` |
| 05 | 1.4 | crm-contact-360 | nok | desktop | HTTP 404; missing [data-testid=contact-360],[data-testid=contact-360-header],[data-testid=contact-360-timeline]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.4/crm-contact-360-nok-desktop.png` |
| 05 | 1.4 | crm-contact-360 | nok | mobile | HTTP 404; missing [data-testid=contact-360],[data-testid=contact-360-header],[data-testid=contact-360-timeline]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.4/crm-contact-360-nok-mobile.png` |
| 05 | 1.4 | crm-contact-convert | nok | desktop | HTTP 404; missing [data-testid=contact-convert-company-section],[data-testid=contact-convert-deal-section]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.4/crm-contact-convert-nok-desktop.png` |
| 05 | 1.4 | crm-contact-convert | thana | desktop | missing [data-testid=contact-convert-company-section],[data-testid=contact-convert-deal-section] | `/root/projects/shark-crm/.qc-shots/crm/1.4/crm-contact-convert-thana-desktop.png` |
| 03 | 1.5 | crm-deal-360 | manager | desktop | HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.5/crm-deal-360-manager-desktop.png` |
| 03 | 1.5 | crm-deal-360 | manager | mobile | HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.5/crm-deal-360-manager-mobile.png` |
| 03 | 1.5 | crm-deal-360 | thana | desktop | HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.5/crm-deal-360-thana-desktop.png` |
| 03 | 1.5 | crm-deal-360 | thana | mobile | HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.5/crm-deal-360-thana-mobile.png` |
| 03 | 1.6 | crm-deal-360-activity | manager | desktop | HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.6/crm-deal-360-activity-manager-desktop.png` |
| 03 | 1.6 | crm-deal-360-activity | manager | mobile | HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.6/crm-deal-360-activity-manager-mobile.png` |
| 03 | 1.6 | crm-deal-360-activity | thana | desktop | HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.6/crm-deal-360-activity-thana-desktop.png` |
| 03 | 1.6 | crm-deal-360-activity | thana | mobile | HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.6/crm-deal-360-activity-thana-mobile.png` |
| 10 | 1.7 | crm-teams | manager | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/settings/teams | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-manager-desktop.png` |
| 10 | 1.7 | crm-teams | manager | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/settings/teams | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-manager-mobile.png` |
| 10 | 1.7 | crm-visibility | manager | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-visibility-manager-desktop.png` |
| 10 | 1.7 | crm-visibility | manager | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-visibility-manager-mobile.png` |
| 10 | 1.7 | crm-teams | nok | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/settings/teams | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-nok-desktop.png` |
| 10 | 1.7 | crm-teams | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/settings/teams | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-nok-mobile.png` |
| 10 | 1.7 | crm-visibility | nok | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-visibility-nok-desktop.png` |
| 10 | 1.7 | crm-visibility | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-visibility-nok-mobile.png` |
| 10 | 1.7 | crm-teams | thana | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/settings/teams | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-thana-desktop.png` |
| 10 | 1.7 | crm-teams | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/settings/teams | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-thana-mobile.png` |
| 10 | 1.7 | crm-visibility | thana | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-visibility-thana-desktop.png` |
| 10 | 1.7 | crm-visibility | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-visibility-thana-mobile.png` |
| 06 | 1.9 | crm-objects-settings | manager | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.9/crm-objects-settings-manager-desktop.png` |
| 06 | 1.9 | crm-objects-settings | manager | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.9/crm-objects-settings-manager-mobile.png` |
| - | 1.10 | crm-settings | manager | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-manager-desktop.png` |
| - | 1.10 | crm-settings | manager | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-manager-mobile.png` |
| 14 | 1.10 | crm-settings-api | manager | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-manager-desktop.png` |
| 14 | 1.10 | crm-settings-api | manager | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-manager-mobile.png` |
| 14 | 1.10 | crm-settings-api-new-key | manager | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-new-key-manager-desktop.png` |
| - | 1.10 | crm-settings | nok | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-nok-desktop.png` |
| - | 1.10 | crm-settings | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-nok-mobile.png` |
| 14 | 1.10 | crm-settings-api | nok | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-nok-desktop.png` |
| 14 | 1.10 | crm-settings-api | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-nok-mobile.png` |
| 14 | 1.10 | crm-settings-api-new-key | nok | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-new-key-nok-desktop.png` |
| - | 1.10 | crm-settings | thana | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-thana-desktop.png` |
| - | 1.10 | crm-settings | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-thana-mobile.png` |
| 14 | 1.10 | crm-settings-api | thana | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-thana-desktop.png` |
| 14 | 1.10 | crm-settings-api | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-thana-mobile.png` |
| 14 | 1.10 | crm-settings-api-new-key | thana | desktop | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-new-key-thana-desktop.png` |
| - | 1.11 | crm-import | nok | desktop | HTTP 404; missing [data-testid=crm-import-page],[data-testid=crm-import-file]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-import-nok-desktop.png` |
| - | 1.11 | crm-import | nok | mobile | HTTP 404; missing [data-testid=crm-import-page],[data-testid=crm-import-file]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-import-nok-mobile.png` |
| 05 | 1.11 | crm-contact-duplicates | nok | desktop | HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-contact-duplicates-nok-desktop.png` |
| 05 | 1.11 | crm-contact-duplicates | nok | mobile | HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-contact-duplicates-nok-mobile.png` |
| 04 | 1.11 | crm-company-duplicates | nok | desktop | HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-company-duplicates-nok-desktop.png` |
| 04 | 1.11 | crm-company-duplicates | nok | mobile | HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-company-duplicates-nok-mobile.png` |
| 05 | 1.11 | crm-390-contact-360 | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-contact-360-nok-mobile.png` |
| 04 | 1.11 | crm-390-companies | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-companies-nok-mobile.png` |
| 04 | 1.11 | crm-390-companies-new | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-companies-new-nok-mobile.png` |
| 04 | 1.11 | crm-390-company-360 | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-company-360-nok-mobile.png` |
| 03 | 1.11 | crm-390-deal-360 | nok | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-deal-360-nok-mobile.png` |
| - | 1.11 | crm-import | thana | desktop | HTTP 404; missing [data-testid=crm-import-page],[data-testid=crm-import-file]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-import-thana-desktop.png` |
| - | 1.11 | crm-import | thana | mobile | HTTP 404; missing [data-testid=crm-import-page],[data-testid=crm-import-file]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-import-thana-mobile.png` |
| 05 | 1.11 | crm-contact-duplicates | thana | desktop | HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-contact-duplicates-thana-desktop.png` |
| 05 | 1.11 | crm-contact-duplicates | thana | mobile | HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-contact-duplicates-thana-mobile.png` |
| 04 | 1.11 | crm-company-duplicates | thana | desktop | HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-company-duplicates-thana-desktop.png` |
| 04 | 1.11 | crm-company-duplicates | thana | mobile | HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-company-duplicates-thana-mobile.png` |
| 04 | 1.11 | crm-390-companies | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-companies-thana-mobile.png` |
| 04 | 1.11 | crm-390-companies-new | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-companies-new-thana-mobile.png` |
| 04 | 1.11 | crm-390-company-360 | thana | mobile | HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-company-360-thana-mobile.png` |
| 07 | 2.2 | crm-sequences | nok | desktop | HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequences-nok-desktop.png` |
| 07 | 2.2 | crm-sequences | nok | mobile | HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequences-nok-mobile.png` |
| 07 | 2.2 | crm-sequence-editor | nok | desktop | HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-stats],[data-testid=crm-seq-enrollments]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequence-editor-nok-desktop.png` |
| 07 | 2.2 | crm-sequence-editor | nok | mobile | HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-stats],[data-testid=crm-seq-enrollments]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequence-editor-nok-mobile.png` |
| 07 | 2.2 | crm-contact-360-sequences | nok | desktop | HTTP 404; missing [data-testid=contact-360-sequences]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-contact-360-sequences-nok-desktop.png` |
| 07 | 2.2 | crm-contact-360-sequences | nok | mobile | HTTP 404; missing [data-testid=contact-360-sequences]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-contact-360-sequences-nok-mobile.png` |
| 07 | 2.2 | crm-sequences | thana | desktop | HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequences-thana-desktop.png` |
| 07 | 2.2 | crm-sequences | thana | mobile | HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequences-thana-mobile.png` |
| 07 | 2.2 | crm-sequence-editor | thana | desktop | HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-stats],[data-testid=crm-seq-enrollments]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequence-editor-thana-desktop.png` |
| 07 | 2.2 | crm-sequence-editor | thana | mobile | HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-stats],[data-testid=crm-seq-enrollments]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.2/crm-sequence-editor-thana-mobile.png` |
| 08 | 2.5 | crm-emails-unmatched | manager | desktop | missing [data-testid=crm-emails-tab-unmatched] | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-emails-unmatched-manager-desktop.png` |
| 08 | 2.5 | crm-emails-unmatched | manager | mobile | missing [data-testid=crm-emails-tab-unmatched] | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-emails-unmatched-manager-mobile.png` |
| 08 | 2.5 | crm-emails | nok | desktop | HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-emails-nok-desktop.png` |
| 08 | 2.5 | crm-emails | nok | mobile | HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-emails-nok-mobile.png` |
| 08 | 2.5 | crm-email-thread | nok | desktop | HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email-send]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-thread-nok-desktop.png` |
| 08 | 2.5 | crm-email-thread | nok | mobile | HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email-send]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-thread-nok-mobile.png` |
| 08 | 2.5 | crm-email-composer | nok | desktop | HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-composer-nok-desktop.png` |
| 08 | 2.5 | crm-email-composer | nok | mobile | HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-composer-nok-mobile.png` |
| 08 | 2.5 | crm-emails | thana | desktop | HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-emails-thana-desktop.png` |
| 08 | 2.5 | crm-emails | thana | mobile | HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-emails-thana-mobile.png` |
| 08 | 2.5 | crm-email-thread | thana | desktop | HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email-send]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-thread-thana-desktop.png` |
| 08 | 2.5 | crm-email-thread | thana | mobile | HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email-send]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-thread-thana-mobile.png` |
| 08 | 2.5 | crm-email-composer | thana | desktop | HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-composer-thana-desktop.png` |
| 08 | 2.5 | crm-email-composer | thana | mobile | HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-composer-thana-mobile.png` |
| - | 2.7 | pos-register-deal-select | manager | desktop | console error x1: Failed to load resource: the server responded with a status of 500 (Internal Server Error) @ http://127.0.0.1:3215/app/sys/cmuy1cvr6000fpgkz | `/root/projects/shark-crm/.qc-shots/crm/2.7/pos-register-deal-select-manager-desktop.png` |
| - | 2.7 | pos-register-deal-select | manager | mobile | console error x1: Failed to load resource: the server responded with a status of 500 (Internal Server Error) @ http://127.0.0.1:3215/app/sys/cmuy1cvr6000fpgkz | `/root/projects/shark-crm/.qc-shots/crm/2.7/pos-register-deal-select-manager-mobile.png` |
| 09 | 3.1 | crm-report-overview | nok | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab-scores],[data-testid=crm-report-filters],[data-testid=crm-report-exp; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-overview-nok-desktop.png` |
| 09 | 3.1 | crm-report-overview | nok | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab-scores],[data-testid=crm-report-filters],[data-testid=crm-report-exp; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-overview-nok-mobile.png` |
| 09 | 3.1 | crm-report-forecast | nok | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-forecast-nok-desktop.png` |
| 09 | 3.1 | crm-report-forecast | nok | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-forecast-nok-mobile.png` |
| 09 | 3.1 | crm-report-funnel | nok | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-funnel-nok-desktop.png` |
| 09 | 3.1 | crm-report-funnel | nok | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-funnel-nok-mobile.png` |
| 09 | 3.1 | crm-report-sources | nok | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-sources-nok-desktop.png` |
| 09 | 3.1 | crm-report-sources | nok | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-sources-nok-mobile.png` |
| 09 | 3.1 | crm-report-overview | thana | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab-scores],[data-testid=crm-report-filters],[data-testid=crm-report-exp; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-overview-thana-desktop.png` |
| 09 | 3.1 | crm-report-overview | thana | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab-scores],[data-testid=crm-report-filters],[data-testid=crm-report-exp; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-overview-thana-mobile.png` |
| 09 | 3.1 | crm-report-forecast | thana | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-forecast-thana-desktop.png` |
| 09 | 3.1 | crm-report-forecast | thana | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-forecast-thana-mobile.png` |
| 09 | 3.1 | crm-report-funnel | thana | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-funnel-thana-desktop.png` |
| 09 | 3.1 | crm-report-funnel | thana | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-funnel-thana-mobile.png` |
| 09 | 3.1 | crm-report-sources | thana | desktop | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-sources-thana-desktop.png` |
| 09 | 3.1 | crm-report-sources | thana | mobile | HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-sources-thana-mobile.png` |
| 01 | 3.2 | crm-home-v2 | nok | desktop | missing [data-testid=crm-home-kpi-open],[data-testid=crm-home-kpi-won],[data-testid=crm-home-kpi-hot],[data-testid=crm-home-leaderboard],[data-testid=crm-home-sources] | `/root/projects/shark-crm/.qc-shots/crm/3.2/crm-home-v2-nok-desktop.png` |
| 01 | 3.2 | crm-home-v2 | nok | mobile | missing [data-testid=crm-home-kpi-open],[data-testid=crm-home-kpi-won],[data-testid=crm-home-kpi-hot],[data-testid=crm-home-leaderboard],[data-testid=crm-home-sources] | `/root/projects/shark-crm/.qc-shots/crm/3.2/crm-home-v2-nok-mobile.png` |
| 01 | 3.2 | crm-home-filters | nok | desktop | missing [data-testid=crm-home-filter-form],[data-testid=crm-home-filter-range],[data-testid=crm-home-filter-apply],[data-testid=crm-home-saved-view] | `/root/projects/shark-crm/.qc-shots/crm/3.2/crm-home-filters-nok-desktop.png` |
| 01 | 3.2 | crm-home-filters | thana | desktop | missing [data-testid=crm-home-filter-form],[data-testid=crm-home-filter-range],[data-testid=crm-home-filter-apply],[data-testid=crm-home-saved-view] | `/root/projects/shark-crm/.qc-shots/crm/3.2/crm-home-filters-thana-desktop.png` |
| 03 | 3.4 | crm-ai-deal | nok | desktop | HTTP 404; missing [data-testid=crm-ai-deal-summary],[data-testid=crm-ai-deal-risk],[data-testid=crm-ai-deal-next-step],[data-testid=crm-ai-deal-draft-email]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-deal-nok-desktop.png` |
| 03 | 3.4 | crm-ai-deal | nok | mobile | HTTP 404; missing [data-testid=crm-ai-deal-summary],[data-testid=crm-ai-deal-risk],[data-testid=crm-ai-deal-next-step],[data-testid=crm-ai-deal-draft-email]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-deal-nok-mobile.png` |
| 05 | 3.4 | crm-ai-contact | nok | desktop | HTTP 404; missing [data-testid=contact-360-ai],[data-testid=crm-ai-contact-why-hot],[data-testid=crm-ai-contact-closing]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-contact-nok-desktop.png` |
| 05 | 3.4 | crm-ai-contact | nok | mobile | HTTP 404; missing [data-testid=contact-360-ai],[data-testid=crm-ai-contact-why-hot],[data-testid=crm-ai-contact-closing]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-contact-nok-mobile.png` |
| 04 | 3.4 | crm-ai-company | nok | desktop | HTTP 404; missing [data-testid=crm-ai-company-summary],[data-testid=crm-ai-company-upsell]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-company-nok-desktop.png` |
| 04 | 3.4 | crm-ai-company | nok | mobile | HTTP 404; missing [data-testid=crm-ai-company-summary],[data-testid=crm-ai-company-upsell]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/app/sys/cmuy1gmlm0000jikz45h7xblz/crm | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-company-nok-mobile.png` |
| 03 | 3.4 | crm-ai-deal | thana | desktop | missing [data-testid=crm-ai-deal-next-step] | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-deal-thana-desktop.png` |
| 03 | 3.4 | crm-ai-deal | thana | mobile | missing [data-testid=crm-ai-deal-next-step] | `/root/projects/shark-crm/.qc-shots/crm/3.4/crm-ai-deal-thana-mobile.png` |
| 12 | 3.5 | portal-login | owner | desktop | HTTP 404; missing [data-testid=portal-login],[data-testid=portal-login-tab-email]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/b/siam-dive-member-qc/login | `/root/projects/shark-crm/.qc-shots/crm/3.5/portal-login-owner-desktop.png` |
| 12 | 3.5 | portal-login | owner | mobile | HTTP 404; missing [data-testid=portal-login],[data-testid=portal-login-tab-email]; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ http://127.0.0.1:3215/b/siam-dive-member-qc/login | `/root/projects/shark-crm/.qc-shots/crm/3.5/portal-login-owner-mobile.png` |

## Per design

### 01 — `/root/projects/shark-crm/ledger/design-crm/01-crm-home.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>` | 3.2 | `crm-home-v2` **(primary)** | ✅/✅ | ✅/✅ | ❌/❌ | ✅/✅ | ❌ nok/desktop: missing [data-testid=crm-home-kpi-open],[data-testid=crm-home-kpi-won],[data-testid=crm-home-kpi-hot],[data-te · nok/mobile: missing [data-testid=crm-home-kpi-open],[data-testid=crm-home-kpi-won],[data-testid=crm-home-kpi-hot],[data-te |
| `/app/sys/<sys>` | 1.11 | `crm-home` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>` | 2.10 | `crm-home-stale` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>?period=<id>-Q3` | 3.2 | `crm-home-filters` | ✅/- | ✅/- | ❌/- | ❌/- | ❌ nok/desktop: missing [data-testid=crm-home-filter-form],[data-testid=crm-home-filter-range],[data-testid=crm-home-filter-ap · thana/desktop: missing [data-testid=crm-home-filter-form],[data-testid=crm-home-filter-range],[data-testid=crm-home-filter-ap |
| `/app/sys/<sys>` | 3.4 | `crm-ai-home` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-home` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-home-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/01-desktop-owner-PRIMARY-3.2-crm-home-v2.png`
- [desktop-pair] `/tmp/crm-parity/sheets/01-desktop-owner-1.11-crm-home.png`
- [desktop-pair] `/tmp/crm-parity/sheets/01-desktop-owner-2.10-crm-home-stale.png`
- [desktop-pair] `/tmp/crm-parity/sheets/01-desktop-owner-3.2-crm-home-filters.png`
- [desktop-pair] `/tmp/crm-parity/sheets/01-desktop-owner-3.4-crm-ai-home.png`
- [mobile] `/tmp/crm-parity/sheets/01-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/01-mobile-owner-02.png`
- [roles] `/tmp/crm-parity/sheets/01-roles-desktop-3.2-crm-home-v2.png`
- [roles] `/tmp/crm-parity/sheets/01-roles-desktop-1.11-crm-home.png`
- [roles] `/tmp/crm-parity/sheets/01-roles-desktop-2.10-crm-home-stale.png`
- [roles] `/tmp/crm-parity/sheets/01-roles-desktop-3.2-crm-home-filters.png`
- [roles] `/tmp/crm-parity/sheets/01-roles-desktop-3.4-crm-ai-home.png`

### 02 — `/root/projects/shark-crm/ledger/design-crm/02-pipeline-board.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/deals` | 1.5 | `crm-v2-deals-board` **(primary)** | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/deals` | 1.7 | `crm-v2-deals-board` **(primary)** | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/deals` | 1.11 | `crm-390-deals-board` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/deals/new` | 1.11 | `crm-390-deals-new` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/deals?view=table` | 1.11 | `crm-390-deals-table` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/pipelines` | 1.11 | `crm-390-pipelines` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `?` | 1.11 | `crm-390-settings-lost-reasons` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-pipelines` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-stages` | -/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/deals/new` | 1.5 | `crm-deals-new` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/pipelines` | 1.5 | `crm-pipelines` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/deals?view=forecast` | 1.5 | `crm-v2-deals-forecast` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/deals?view=table` | 1.5 | `crm-v2-deals-table` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.5/crm-v2-deals-board-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/02-desktop-owner-PRIMARY-1.5-crm-v2-deals-board.png`
- [desktop-pair] `/tmp/crm-parity/sheets/02-desktop-owner-PRIMARY-1.7-crm-v2-deals-board.png`
- [desktop-pair] `/tmp/crm-parity/sheets/02-desktop-owner-1.5-crm-deals-new.png`
- [desktop-pair] `/tmp/crm-parity/sheets/02-desktop-owner-1.5-crm-pipelines.png`
- [desktop-pair] `/tmp/crm-parity/sheets/02-desktop-owner-1.5-crm-v2-deals-forecast.png`
- [desktop-pair] `/tmp/crm-parity/sheets/02-desktop-owner-1.5-crm-v2-deals-table.png`
- [mobile] `/tmp/crm-parity/sheets/02-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/02-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/02-mobile-owner-03.png`
- [mobile] `/tmp/crm-parity/sheets/02-mobile-owner-04.png`
- [roles] `/tmp/crm-parity/sheets/02-roles-desktop-1.5-crm-v2-deals-board.png`
- [roles] `/tmp/crm-parity/sheets/02-roles-desktop-1.7-crm-v2-deals-board.png`
- [roles] `/tmp/crm-parity/sheets/02-roles-desktop-1.5-crm-deals-new.png`
- [roles] `/tmp/crm-parity/sheets/02-roles-desktop-1.5-crm-pipelines.png`
- [roles] `/tmp/crm-parity/sheets/02-roles-desktop-1.5-crm-v2-deals-forecast.png`
- [roles] `/tmp/crm-parity/sheets/02-roles-desktop-1.5-crm-v2-deals-table.png`

### 03 — `/root/projects/shark-crm/ledger/design-crm/03-deal-360.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/deals/<id>` | 1.5 | `crm-deal-360` **(primary)** | ✅/✅ | ❌/❌ | ✅/✅ | ❌/❌ | ❌ manager/desktop: HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resou · manager/mobile: HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resou · thana/desktop: HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resou · thana/mobile: HTTP 404; missing [data-testid=deal-360],[data-testid=deal-360-header]; console error x1: Failed to load resou |
| `/app/sys/<sys>/crm/deals/<id>` | 1.11 | `crm-390-deal-360` | -/✅ | -/✅ | -/❌ | -/✅ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/deals/<id>?tab=activities` | 1.6 | `crm-deal-360-activity` | ✅/✅ | ❌/❌ | ✅/✅ | ❌/❌ | ❌ manager/desktop: HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server resp · manager/mobile: HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server resp · thana/desktop: HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server resp · thana/mobile: HTTP 404; missing [data-testid=crm-activity-block]; console error x1: Failed to load resource: the server resp |
| `/app/sys/<sys>/crm/deals/<id>` | 2.7 | `crm-deal-money` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/deals/<id>` | 3.4 | `crm-ai-deal` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-ai-deal-summary],[data-testid=crm-ai-deal-risk],[data-testid=crm-ai-deal-ne · nok/mobile: HTTP 404; missing [data-testid=crm-ai-deal-summary],[data-testid=crm-ai-deal-risk],[data-testid=crm-ai-deal-ne · thana/desktop: missing [data-testid=crm-ai-deal-next-step] · thana/mobile: missing [data-testid=crm-ai-deal-next-step] |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.5/crm-deal-360-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/03-desktop-owner-PRIMARY-1.5-crm-deal-360.png`
- [desktop-pair] `/tmp/crm-parity/sheets/03-desktop-owner-1.6-crm-deal-360-activity.png`
- [desktop-pair] `/tmp/crm-parity/sheets/03-desktop-owner-2.7-crm-deal-money.png`
- [desktop-pair] `/tmp/crm-parity/sheets/03-desktop-owner-3.4-crm-ai-deal.png`
- [mobile] `/tmp/crm-parity/sheets/03-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/03-mobile-owner-02.png`
- [roles] `/tmp/crm-parity/sheets/03-roles-desktop-1.5-crm-deal-360.png`
- [roles] `/tmp/crm-parity/sheets/03-roles-desktop-1.6-crm-deal-360-activity.png`
- [roles] `/tmp/crm-parity/sheets/03-roles-desktop-2.7-crm-deal-money.png`
- [roles] `/tmp/crm-parity/sheets/03-roles-desktop-3.4-crm-ai-deal.png`

### 04 — `/root/projects/shark-crm/ledger/design-crm/04-company-360.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/companies/<id>` | 1.3 | `crm-company-360` **(primary)** | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[d · nok/mobile: HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[d · thana/desktop: HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[d · thana/mobile: HTTP 404; missing [data-testid=company-360],[data-testid=company-360-header],[data-testid=company-360-kpis],[d |
| `/app/sys/<sys>/crm/companies` | 1.11 | `crm-390-companies` | -/✅ | -/✅ | -/❌ | -/❌ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/companies/new` | 1.11 | `crm-390-companies-new` | -/✅ | -/✅ | -/❌ | -/❌ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/companies/<id>` | 1.11 | `crm-390-company-360` | -/✅ | -/✅ | -/❌ | -/❌ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/companies/duplicates` | 1.11 | `crm-company-duplicates` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the se · nok/mobile: HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the se · thana/desktop: HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the se · thana/mobile: HTTP 404; missing [data-testid=crm-company-duplicates-page]; console error x1: Failed to load resource: the se |
| `/app/sys/<sys>/crm/companies` | 1.3 | `crm-companies-list` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-coun · nok/mobile: HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-coun · thana/desktop: HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-coun · thana/mobile: HTTP 404; missing [data-testid=companies-page],[data-testid=companies-filter-form],[data-testid=companies-coun |
| `/app/sys/<sys>/crm/companies/new` | 1.3 | `crm-companies-new` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 ( · nok/mobile: HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 ( · thana/desktop: HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 ( · thana/mobile: HTTP 404; missing form; console error x1: Failed to load resource: the server responded with a status of 404 ( |
| `/app/sys/<sys>/crm/companies/<id>` | 3.4 | `crm-ai-company` | ✅/✅ | ✅/✅ | ❌/❌ | -/- | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-ai-company-summary],[data-testid=crm-ai-company-upsell]; console error x1:  · nok/mobile: HTTP 404; missing [data-testid=crm-ai-company-summary],[data-testid=crm-ai-company-upsell]; console error x1:  |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.3/crm-companies-list-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/04-desktop-owner-PRIMARY-1.3-crm-company-360.png`
- [desktop-pair] `/tmp/crm-parity/sheets/04-desktop-owner-1.11-crm-company-duplicates.png`
- [desktop-pair] `/tmp/crm-parity/sheets/04-desktop-owner-1.3-crm-companies-list.png`
- [desktop-pair] `/tmp/crm-parity/sheets/04-desktop-owner-1.3-crm-companies-new.png`
- [desktop-pair] `/tmp/crm-parity/sheets/04-desktop-owner-3.4-crm-ai-company.png`
- [mobile] `/tmp/crm-parity/sheets/04-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/04-mobile-owner-02.png`
- [roles] `/tmp/crm-parity/sheets/04-roles-desktop-1.3-crm-company-360.png`
- [roles] `/tmp/crm-parity/sheets/04-roles-desktop-1.11-crm-company-duplicates.png`
- [roles] `/tmp/crm-parity/sheets/04-roles-desktop-1.3-crm-companies-list.png`
- [roles] `/tmp/crm-parity/sheets/04-roles-desktop-1.3-crm-companies-new.png`
- [roles] `/tmp/crm-parity/sheets/04-roles-desktop-3.4-crm-ai-company.png`

### 05 — `/root/projects/shark-crm/ledger/design-crm/05-contact-360-convert.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/contacts/<id>` | 1.4 | `crm-contact-convert` **(primary)** | ✅/- | ✅/- | ❌/- | ❌/- | ❌ nok/desktop: HTTP 404; missing [data-testid=contact-convert-company-section],[data-testid=contact-convert-deal-section]; co · thana/desktop: missing [data-testid=contact-convert-company-section],[data-testid=contact-convert-deal-section] |
| `/app/sys/<sys>/crm/contacts` | 0.1 | `crm-v1-contacts` | ❌/❌ | -/- | -/- | -/- | ❌ owner/desktop: missing form input[name='name'],form input[name='phone'],form input[name='source'] · owner/mobile: missing form input[name='name'],form input[name='phone'],form input[name='source'] |
| `/app/sys/<sys>/crm/contacts/<id>` | 1.11 | `crm-390-contact-360` | -/✅ | -/✅ | -/❌ | -/✅ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/contacts` | 1.11 | `crm-390-contacts` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/contacts/new` | 1.11 | `crm-390-contacts-new` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/contacts/duplicates` | 1.11 | `crm-contact-duplicates` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the se · nok/mobile: HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the se · thana/desktop: HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the se · thana/mobile: HTTP 404; missing [data-testid=crm-contact-duplicates-page]; console error x1: Failed to load resource: the se |
| `/app/sys/<sys>/crm/contacts/<id>` | 1.4 | `crm-contact-360` | ✅/✅ | ✅/✅ | ❌/❌ | ✅/✅ | ❌ nok/desktop: HTTP 404; missing [data-testid=contact-360],[data-testid=contact-360-header],[data-testid=contact-360-timeline · nok/mobile: HTTP 404; missing [data-testid=contact-360],[data-testid=contact-360-header],[data-testid=contact-360-timeline |
| `/app/sys/<sys>/crm/contacts` | 1.4 | `crm-contacts-list` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/contacts/new` | 1.4 | `crm-contacts-new` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/contacts/<id>` | 2.4 | `crm-contact-360-call` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/contacts/<id>` | 2.6 | `crm-contact360-web` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/contacts/<id>` | 2.8 | `crm-contact-360-score` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/scoring` | 2.8 | `crm-scoring` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/scoring` | 2.8 | `crm-scoring-rule-editor` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/contacts/<id>` | 3.4 | `crm-ai-contact` | ✅/✅ | ✅/✅ | ❌/❌ | ✅/✅ | ❌ nok/desktop: HTTP 404; missing [data-testid=contact-360-ai],[data-testid=crm-ai-contact-why-hot],[data-testid=crm-ai-contac · nok/mobile: HTTP 404; missing [data-testid=contact-360-ai],[data-testid=crm-ai-contact-why-hot],[data-testid=crm-ai-contac |
| `?` | 3.7 | `c37-390-report-scores` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-scoring` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-contacts-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-PRIMARY-1.4-crm-contact-convert.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-0.1-crm-v1-contacts.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-1.11-crm-contact-duplicates.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-1.4-crm-contact-360.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-1.4-crm-contacts-list.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-1.4-crm-contacts-new.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-2.4-crm-contact-360-call.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-2.6-crm-contact360-web.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-2.8-crm-contact-360-score.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-2.8-crm-scoring.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-2.8-crm-scoring-rule-editor.png`
- [desktop-pair] `/tmp/crm-parity/sheets/05-desktop-owner-3.4-crm-ai-contact.png`
- [mobile] `/tmp/crm-parity/sheets/05-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/05-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/05-mobile-owner-03.png`
- [mobile] `/tmp/crm-parity/sheets/05-mobile-owner-04.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-1.4-crm-contact-convert.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-0.1-crm-v1-contacts.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-1.11-crm-contact-duplicates.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-1.4-crm-contact-360.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-1.4-crm-contacts-list.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-1.4-crm-contacts-new.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-2.4-crm-contact-360-call.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-2.6-crm-contact360-web.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-2.8-crm-contact-360-score.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-2.8-crm-scoring.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-2.8-crm-scoring-rule-editor.png`
- [roles] `/tmp/crm-parity/sheets/05-roles-desktop-3.4-crm-ai-contact.png`

### 06 — `/root/projects/shark-crm/ledger/design-crm/06-custom-objects.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/objects?object=contract` | 1.9 | `crm-objects-settings` **(primary)** | ✅/✅ | ❌/❌ | -/- | -/- | ❌ manager/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · manager/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `?` | 1.11 | `crm-390-objects` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-objects` | -/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/objects` | 1.9 | `crm-objects-index` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/objects/contract` | 1.9 | `crm-objects-list` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/objects/contract/<id>` | 1.9 | `crm-objects-record` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.9/crm-objects-settings-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/06-desktop-owner-PRIMARY-1.9-crm-objects-settings.png`
- [desktop-pair] `/tmp/crm-parity/sheets/06-desktop-owner-1.9-crm-objects-index.png`
- [desktop-pair] `/tmp/crm-parity/sheets/06-desktop-owner-1.9-crm-objects-list.png`
- [desktop-pair] `/tmp/crm-parity/sheets/06-desktop-owner-1.9-crm-objects-record.png`
- [mobile] `/tmp/crm-parity/sheets/06-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/06-mobile-owner-02.png`
- [roles] `/tmp/crm-parity/sheets/06-roles-desktop-1.9-crm-objects-settings.png`
- [roles] `/tmp/crm-parity/sheets/06-roles-desktop-1.9-crm-objects-index.png`
- [roles] `/tmp/crm-parity/sheets/06-roles-desktop-1.9-crm-objects-list.png`
- [roles] `/tmp/crm-parity/sheets/06-roles-desktop-1.9-crm-objects-record.png`

### 07 — `/root/projects/shark-crm/ledger/design-crm/07-automation-sequence.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/automation` | 2.1 | `crm-automation` **(primary)** | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/automation` | 2.1 | `crm-automation-builder` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/contacts/<id>` | 2.2 | `crm-contact-360-sequences` | ✅/✅ | ✅/✅ | ❌/❌ | ✅/✅ | ❌ nok/desktop: HTTP 404; missing [data-testid=contact-360-sequences]; console error x1: Failed to load resource: the server r · nok/mobile: HTTP 404; missing [data-testid=contact-360-sequences]; console error x1: Failed to load resource: the server r |
| `/app/sys/<sys>/crm/contacts` | 2.2 | `crm-contacts-bulk-enroll` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/settings/sequences/<id>` | 2.2 | `crm-sequence-editor` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-sta · nok/mobile: HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-sta · thana/desktop: HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-sta · thana/mobile: HTTP 404; missing [data-testid=crm-sequence-editor-page],[data-testid=crm-seq-editor],[data-testid=crm-seq-sta |
| `/app/sys/<sys>/crm/settings/sequences` | 2.2 | `crm-sequences` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to loa · nok/mobile: HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to loa · thana/desktop: HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to loa · thana/mobile: HTTP 404; missing [data-testid=crm-sequences-page],[data-testid=crm-seq-list]; console error x1: Failed to loa |
| `/app/sys/<sys>/crm/settings/holidays` | 2.2 | `crm-sequences-holidays` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/sequences` | 2.2 | `crm-sequences-new` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/assignment` | 2.3 | `crm-assignment` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/assignment` | 2.3 | `crm-assignment-editor` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/assignment` | 2.3 | `crm-assignment-rule-editor` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/sequences` | 3.7 | `c37-390-sequence-editor` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-assignment` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-automation` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-sequences` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/2.1/crm-automation-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-PRIMARY-2.1-crm-automation.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.1-crm-automation-builder.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.2-crm-contact-360-sequences.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.2-crm-contacts-bulk-enroll.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.2-crm-sequence-editor.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.2-crm-sequences.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.2-crm-sequences-holidays.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.2-crm-sequences-new.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.3-crm-assignment.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.3-crm-assignment-editor.png`
- [desktop-pair] `/tmp/crm-parity/sheets/07-desktop-owner-2.3-crm-assignment-rule-editor.png`
- [mobile] `/tmp/crm-parity/sheets/07-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/07-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/07-mobile-owner-03.png`
- [mobile] `/tmp/crm-parity/sheets/07-mobile-owner-04.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.1-crm-automation.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.1-crm-automation-builder.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.2-crm-contact-360-sequences.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.2-crm-contacts-bulk-enroll.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.2-crm-sequence-editor.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.2-crm-sequences.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.2-crm-sequences-holidays.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.2-crm-sequences-new.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.3-crm-assignment.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.3-crm-assignment-editor.png`
- [roles] `/tmp/crm-parity/sheets/07-roles-desktop-2.3-crm-assignment-rule-editor.png`

### 08 — `/root/projects/shark-crm/ledger/design-crm/08-activity-call-email-calendar.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/calendar?view=week&scope=team` | 2.4 | `crm-calendar-merged` **(primary)** | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/activities` | 0.1 | `crm-v1-activities` | ❌/❌ | -/- | -/- | -/- | ❌ owner/desktop: missing h2 · owner/mobile: missing h2 |
| `/app/sys/<sys>/crm/activities` | 1.11 | `crm-390-activities` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/calendar` | 1.11 | `crm-390-calendar` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/activities?scope=team` | 1.6 | `crm-activities` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/calendar?view=month&scope=team` | 1.6 | `crm-calendar-month` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/calendar?view=week&scope=team` | 1.6 | `crm-calendar-week` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/emails/<id>` | 2.5 | `crm-email-composer` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to l · nok/mobile: HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to l · thana/desktop: HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to l · thana/mobile: HTTP 404; missing [data-testid=crm-email-composer],[data-testid=crm-email-body]; console error x1: Failed to l |
| `/app/sys/<sys>/crm/emails/<id>` | 2.5 | `crm-email-thread` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email- · nok/mobile: HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email- · thana/desktop: HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email- · thana/mobile: HTTP 404; missing [data-testid=crm-email-thread-page],[data-testid=crm-email-composer],[data-testid=crm-email- |
| `/app/sys/<sys>/crm/emails` | 2.5 | `crm-emails` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search] · nok/mobile: HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search] · thana/desktop: HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search] · thana/mobile: HTTP 404; missing [data-testid=crm-emails-page],[data-testid=crm-emails-inbox],[data-testid=crm-emails-search] |
| `/app/sys/<sys>/crm/emails?box=unmatched` | 2.5 | `crm-emails-unmatched` | ✅/✅ | ❌/❌ | -/- | -/- | ❌ manager/desktop: missing [data-testid=crm-emails-tab-unmatched] · manager/mobile: missing [data-testid=crm-emails-tab-unmatched] |
| `/app/sys/<sys>/crm/emails` | 3.7 | `c37-390-email-thread` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-emails` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-activities` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-email` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/0.1/crm-v1-activities-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-PRIMARY-2.4-crm-calendar-merged.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-0.1-crm-v1-activities.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-1.6-crm-activities.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-1.6-crm-calendar-month.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-1.6-crm-calendar-week.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-2.5-crm-email-composer.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-2.5-crm-email-thread.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-2.5-crm-emails.png`
- [desktop-pair] `/tmp/crm-parity/sheets/08-desktop-owner-2.5-crm-emails-unmatched.png`
- [mobile] `/tmp/crm-parity/sheets/08-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/08-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/08-mobile-owner-03.png`
- [mobile] `/tmp/crm-parity/sheets/08-mobile-owner-04.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-2.4-crm-calendar-merged.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-0.1-crm-v1-activities.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-1.6-crm-activities.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-1.6-crm-calendar-month.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-1.6-crm-calendar-week.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-2.5-crm-email-composer.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-2.5-crm-email-thread.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-2.5-crm-emails.png`
- [roles] `/tmp/crm-parity/sheets/08-roles-desktop-2.5-crm-emails-unmatched.png`

### 09 — `/root/projects/shark-crm/ledger/design-crm/09-reports-forecast.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/reports/forecast` | 3.1 | `crm-report-forecast` **(primary)** | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to loa · nok/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to loa · thana/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to loa · thana/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-forecast]; console error x1: Failed to loa |
| `/app/sys/<sys>/crm/reports/funnel` | 3.1 | `crm-report-funnel` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to l · nok/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to l · thana/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to l · thana/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-funnel]; console error x1: Failed to l |
| `/app/sys/<sys>/crm/reports` | 3.1 | `crm-report-overview` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab- · nok/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab- · thana/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab- · thana/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-overview],[data-testid=crm-report-tab- |
| `/app/sys/<sys>/crm/reports/reps` | 3.1 | `crm-report-schedule` | ✅/- | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/reports/sources` | 3.1 | `crm-report-sources` | ✅/✅ | ✅/✅ | ❌/❌ | ❌/❌ | ❌ nok/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to  · nok/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to  · thana/desktop: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to  · thana/mobile: HTTP 404; missing [data-testid=crm-reports],[data-testid=crm-report-tab-sources]; console error x1: Failed to  |
| `?` | 3.7 | `c37-390-report-forecast` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-funnel` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-lost` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-overview` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-reps` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-sources` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-reports` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/3.1/crm-report-overview-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/09-desktop-owner-PRIMARY-3.1-crm-report-forecast.png`
- [desktop-pair] `/tmp/crm-parity/sheets/09-desktop-owner-3.1-crm-report-funnel.png`
- [desktop-pair] `/tmp/crm-parity/sheets/09-desktop-owner-3.1-crm-report-overview.png`
- [desktop-pair] `/tmp/crm-parity/sheets/09-desktop-owner-3.1-crm-report-schedule.png`
- [desktop-pair] `/tmp/crm-parity/sheets/09-desktop-owner-3.1-crm-report-sources.png`
- [mobile] `/tmp/crm-parity/sheets/09-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/09-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/09-mobile-owner-03.png`
- [roles] `/tmp/crm-parity/sheets/09-roles-desktop-3.1-crm-report-forecast.png`
- [roles] `/tmp/crm-parity/sheets/09-roles-desktop-3.1-crm-report-funnel.png`
- [roles] `/tmp/crm-parity/sheets/09-roles-desktop-3.1-crm-report-overview.png`
- [roles] `/tmp/crm-parity/sheets/09-roles-desktop-3.1-crm-report-schedule.png`
- [roles] `/tmp/crm-parity/sheets/09-roles-desktop-3.1-crm-report-sources.png`

### 10 — `/root/projects/shark-crm/ledger/design-crm/10-teams-quota-commission.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/settings/teams` | 1.7 | `crm-teams` **(primary)** | ✅/✅ | ❌/❌ | ❌/❌ | ❌/❌ | ❌ manager/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · manager/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `?` | 1.11 | `crm-390-settings-visibility` | -/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/visibility` | 1.7 | `crm-visibility` | ✅/✅ | ❌/❌ | ❌/❌ | ❌/❌ | ❌ manager/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · manager/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/settings/quotas` | 3.2 | `crm-quota-settings` | ✅/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/commissions` | 3.3 | `crm-commission-mine` | ✅/✅ | ✅/✅ | ✅/✅ | ✅/✅ | ✅ |
| `/app/sys/<sys>/crm/settings/commissions` | 3.3 | `crm-commission-rule-editor` | ✅/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/commissions` | 3.3 | `crm-commission-settings` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-commissions` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `?` | 3.7 | `c37-390-settings-commissions` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-quotas` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.7/crm-teams-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/10-desktop-owner-PRIMARY-1.7-crm-teams.png`
- [desktop-pair] `/tmp/crm-parity/sheets/10-desktop-owner-1.7-crm-visibility.png`
- [desktop-pair] `/tmp/crm-parity/sheets/10-desktop-owner-3.2-crm-quota-settings.png`
- [desktop-pair] `/tmp/crm-parity/sheets/10-desktop-owner-3.3-crm-commission-mine.png`
- [desktop-pair] `/tmp/crm-parity/sheets/10-desktop-owner-3.3-crm-commission-rule-editor.png`
- [desktop-pair] `/tmp/crm-parity/sheets/10-desktop-owner-3.3-crm-commission-settings.png`
- [mobile] `/tmp/crm-parity/sheets/10-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/10-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/10-mobile-owner-03.png`
- [roles] `/tmp/crm-parity/sheets/10-roles-desktop-1.7-crm-teams.png`
- [roles] `/tmp/crm-parity/sheets/10-roles-desktop-1.7-crm-visibility.png`
- [roles] `/tmp/crm-parity/sheets/10-roles-desktop-3.2-crm-quota-settings.png`
- [roles] `/tmp/crm-parity/sheets/10-roles-desktop-3.3-crm-commission-mine.png`
- [roles] `/tmp/crm-parity/sheets/10-roles-desktop-3.3-crm-commission-rule-editor.png`
- [roles] `/tmp/crm-parity/sheets/10-roles-desktop-3.3-crm-commission-settings.png`

### 11 — `/root/projects/shark-crm/ledger/design-crm/11-web-email-tracking.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/forms` | 2.6 | `crm-forms` **(primary)** | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/tracking` | 2.6 | `crm-link-qr` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-forms` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/2.6/crm-forms-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/11-desktop-owner-PRIMARY-2.6-crm-forms.png`
- [desktop-pair] `/tmp/crm-parity/sheets/11-desktop-owner-2.6-crm-link-qr.png`
- [mobile] `/tmp/crm-parity/sheets/11-mobile-owner-01.png`
- [roles] `/tmp/crm-parity/sheets/11-roles-desktop-2.6-crm-forms.png`
- [roles] `/tmp/crm-parity/sheets/11-roles-desktop-2.6-crm-link-qr.png`

### 12 — `/root/projects/shark-crm/ledger/design-crm/12-portal-b2b.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/portal` | 3.5 | `crm-portal-settings` **(primary)** | ✅/✅ | -/- | -/- | -/- | ✅ |
| `/b/<slug>/login` | 3.5 | `portal-login` | ❌/❌ | -/- | -/- | -/- | ❌ owner/desktop: HTTP 404; missing [data-testid=portal-login],[data-testid=portal-login-tab-email]; console error x1: Failed to · owner/mobile: HTTP 404; missing [data-testid=portal-login],[data-testid=portal-login-tab-email]; console error x1: Failed to |
| `?` | 3.7 | `c37-390-settings-portal` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/3.5/crm-portal-settings-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/12-desktop-owner-PRIMARY-3.5-crm-portal-settings.png`
- [desktop-pair] `/tmp/crm-parity/sheets/12-desktop-owner-3.5-portal-login.png`
- [mobile] `/tmp/crm-parity/sheets/12-mobile-owner-01.png`
- [roles] `/tmp/crm-parity/sheets/12-roles-desktop-3.5-crm-portal-settings.png`
- [roles] `/tmp/crm-parity/sheets/12-roles-desktop-3.5-portal-login.png`

### 13 — `/root/projects/shark-crm/ledger/design-crm/13-mobile-staff-crm.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/deals` | 1.11 | `crm-390-deals-board` **(primary)** | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/activities` | 1.11 | `crm-390-activities` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/calendar` | 1.11 | `crm-390-calendar` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/companies` | 1.11 | `crm-390-companies` | -/✅ | -/✅ | -/❌ | -/❌ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/companies/new` | 1.11 | `crm-390-companies-new` | -/✅ | -/✅ | -/❌ | -/❌ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/companies/<id>` | 1.11 | `crm-390-company-360` | -/✅ | -/✅ | -/❌ | -/❌ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/contacts/<id>` | 1.11 | `crm-390-contact-360` | -/✅ | -/✅ | -/❌ | -/✅ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/contacts` | 1.11 | `crm-390-contacts` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/contacts/new` | 1.11 | `crm-390-contacts-new` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/deals/<id>` | 1.11 | `crm-390-deal-360` | -/✅ | -/✅ | -/❌ | -/✅ | ❌ nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/deals/new` | 1.11 | `crm-390-deals-new` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/deals?view=table` | 1.11 | `crm-390-deals-table` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `?` | 1.11 | `crm-390-objects` | -/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/pipelines` | 1.11 | `crm-390-pipelines` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `?` | 1.11 | `crm-390-settings-api` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-lost-reasons` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-objects` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-pipelines` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-stages` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 1.11 | `crm-390-settings-visibility` | -/✅ | -/- | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-commissions` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `/app/sys/<sys>/crm/emails` | 3.7 | `c37-390-email-thread` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-emails` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-home` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `?` | 3.7 | `c37-390-report-activities` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-forecast` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-funnel` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-lost` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-overview` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-reps` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-scores` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-report-sources` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-reports` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/sequences` | 3.7 | `c37-390-sequence-editor` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-assignment` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-automation` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-commissions` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-email` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-forms` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-holidays` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-notifications` | -/✅ | -/✅ | -/✅ | -/✅ | ✅ |
| `?` | 3.7 | `c37-390-settings-portal` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-quotas` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-scoring` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-sequences` | -/✅ | -/✅ | -/- | -/- | ✅ |
| `?` | 3.7 | `c37-390-settings-tracking` | -/✅ | -/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.11/crm-390-contacts-owner-mobile.png`)

Sheets:
- [mobile-mockup] `/tmp/crm-parity/sheets/13-mobile-owner-00-MOCKUP.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-01.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-02.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-03.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-04.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-05.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-06.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-07.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-08.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-09.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-10.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-11.png`
- [mobile] `/tmp/crm-parity/sheets/13-mobile-owner-12.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-deals-board.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-activities.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-calendar.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-companies.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-companies-new.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-company-360.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-contact-360.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-contacts.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-contacts-new.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-deal-360.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-deals-new.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-deals-table.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-objects.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-pipelines.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-settings-api.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-settings-lost-reasons.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-settings-objects.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-settings-pipelines.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-settings-stages.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-1.11-crm-390-settings-visibility.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-commissions.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-email-thread.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-emails.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-home.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-activities.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-forecast.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-funnel.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-lost.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-overview.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-reps.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-scores.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-report-sources.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-reports.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-sequence-editor.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-assignment.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-automation.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-commissions.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-email.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-forms.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-holidays.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-notifications.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-portal.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-quotas.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-scoring.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-sequences.png`
- [roles] `/tmp/crm-parity/sheets/13-roles-mobile-3.7-c37-390-settings-tracking.png`

### 14 — `/root/projects/shark-crm/ledger/design-crm/14-ai-api-webhook.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/api` | 1.10 | `crm-settings-api` **(primary)** | ✅/✅ | ❌/❌ | ❌/❌ | ❌/❌ | ❌ manager/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · manager/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/mobile: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `/app/sys/<sys>/crm/settings/api` | 1.10 | `crm-settings-api-new-key` | ✅/- | ❌/- | ❌/- | ❌/- | ❌ manager/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · nok/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h · thana/desktop: HTTP 404; console error x1: Failed to load resource: the server responded with a status of 404 (Not Found) @ h |
| `?` | 1.11 | `crm-390-settings-api` | -/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/api` | 2.11 | `crm-settings-api-c211` | ✅/✅ | -/- | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/api` | 2.11 | `crm-settings-api-c211-bundles` | ✅/- | -/- | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/1.10/crm-settings-api-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/14-desktop-owner-PRIMARY-1.10-crm-settings-api.png`
- [desktop-pair] `/tmp/crm-parity/sheets/14-desktop-owner-1.10-crm-settings-api-new-key.png`
- [desktop-pair] `/tmp/crm-parity/sheets/14-desktop-owner-2.11-crm-settings-api-c211.png`
- [desktop-pair] `/tmp/crm-parity/sheets/14-desktop-owner-2.11-crm-settings-api-c211-bundles.png`
- [mobile] `/tmp/crm-parity/sheets/14-mobile-owner-01.png`
- [roles] `/tmp/crm-parity/sheets/14-roles-desktop-1.10-crm-settings-api.png`
- [roles] `/tmp/crm-parity/sheets/14-roles-desktop-1.10-crm-settings-api-new-key.png`
- [roles] `/tmp/crm-parity/sheets/14-roles-desktop-2.11-crm-settings-api-c211.png`
- [roles] `/tmp/crm-parity/sheets/14-roles-desktop-2.11-crm-settings-api-c211-bundles.png`

### 15 — `/root/projects/shark-crm/ledger/design-crm/15-email-routing-settings.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/email` | 2.5 | `crm-email-settings` **(primary)** | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/2.5/crm-email-settings-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/15-desktop-owner-PRIMARY-2.5-crm-email-settings.png`
- [mobile] `/tmp/crm-parity/sheets/15-mobile-owner-01.png`
- [roles] `/tmp/crm-parity/sheets/15-roles-desktop-2.5-crm-email-settings.png`

### 16 — `/root/projects/shark-crm/ledger/design-crm/16-web-tracking-consent.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/tracking` | 2.6 | `crm-tracking` **(primary)** | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |
| `/app/sys/<sys>/crm/settings/tracking` | 2.6 | `crm-tracking-preview` | ✅/✅ | ✅/✅ | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/2.6/crm-tracking-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/16-desktop-owner-PRIMARY-2.6-crm-tracking.png`
- [desktop-pair] `/tmp/crm-parity/sheets/16-desktop-owner-2.6-crm-tracking-preview.png`
- [mobile] `/tmp/crm-parity/sheets/16-mobile-owner-01.png`
- [roles] `/tmp/crm-parity/sheets/16-roles-desktop-2.6-crm-tracking.png`
- [roles] `/tmp/crm-parity/sheets/16-roles-desktop-2.6-crm-tracking-preview.png`

### 17 — `/root/projects/shark-crm/ledger/design-crm/17-integration-map.png`

| page URL | set | shot | owner D/M | manager D/M | nok D/M | thana D/M | result |
|---|---|---|---|---|---|---|---|
| `/app/sys/<sys>/crm/settings/integrations` | 3.6 | `crm-integrations` **(primary)** | ✅/✅ | -/- | -/- | -/- | ✅ |

Shot files: `/root/projects/shark-crm/.qc-shots/crm/<set>/<shot>-<role>-<desktop|mobile>.png` (e.g. `/root/projects/shark-crm/.qc-shots/crm/3.6/crm-integrations-owner-desktop.png`)

Sheets:
- [desktop-pair] `/tmp/crm-parity/sheets/17-desktop-owner-PRIMARY-3.6-crm-integrations.png`
- [mobile] `/tmp/crm-parity/sheets/17-mobile-owner-01.png`
- [roles] `/tmp/crm-parity/sheets/17-roles-desktop-3.6-crm-integrations.png`

## Shots with no design (01–17) mapped

- 0.1 `crm-v1-deals` → `/app/sys/<sys>/crm/deals` · D/M: owner ❌❌ · manager -- · nok -- · thana --
- 1.10 `crm-settings` → `/app/sys/<sys>/crm/settings` · D/M: owner ✅✅ · manager ❌❌ · nok ❌❌ · thana ❌❌
- 1.11 `crm-import` → `/app/sys/<sys>/crm/contacts/import` · D/M: owner ✅✅ · manager ✅✅ · nok ❌❌ · thana ❌❌
- 1.11 `crm-switch` → `/app/sys/<sys>/crm/settings` · D/M: owner ✅✅ · manager -- · nok -- · thana --
- 2.10 `crm-notify-mine` → `/app/sys/<sys>/crm/settings/notifications` · D/M: owner ✅✅ · manager ✅✅ · nok ✅✅ · thana ✅✅
- 2.10 `crm-notify-settings` → `/app/sys/<sys>/crm/settings/notifications` · D/M: owner ✅✅ · manager ✅✅ · nok ✅✅ · thana ✅✅
- 2.4 `crm-call-log-modal` → `/app/sys/<sys>/crm/contacts/<id>` · D/M: owner ✅✅ · manager ✅✅ · nok -- · thana --
- 2.7 `acc-doc-crm-deal` → `/app/sys/<id>/account/docs/QUOTATION/<id>` · D/M: owner ✅✅ · manager ✅✅ · nok -- · thana --
- 2.7 `pos-register-deal-select` → `POS_REGISTER` · D/M: owner ✅✅ · manager ❌❌ · nok -- · thana --
- 2.7 `pos-register-no-deal` → `POS_REGISTER` · D/M: owner ✅✅ · manager ✅✅ · nok -- · thana --
- 3.4 `crm-team-room` → `/app/sys/<sys>/crm/settings` · D/M: owner ✅✅ · manager -- · nok -- · thana --
- 3.9 `crm-contact-erase-panel` → `/app/sys/<sys>/crm/contacts/<id>` · D/M: owner ✅✅ · manager -- · nok -- · thana --
- 3.9 `crm-contact-privacy` → `/app/sys/<sys>/crm/contacts/<id>` · D/M: owner ✅✅ · manager ✅✅ · nok -- · thana --
- 3.9 `crm-privacy-settings` → `/app/sys/<sys>/crm/settings` · D/M: owner ✅✅ · manager -- · nok -- · thana --
