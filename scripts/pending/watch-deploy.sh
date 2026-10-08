#!/usr/bin/env bash
# controller: watch Vercel prod deploy for a sha · writes to .qc-shots/crm/deploy-<sha>.log · 28 Sep
cd /root/projects/shark-crm
SHA="$1"; L=.qc-shots/crm/deploy-$SHA.log; : > "$L"
gv(){ grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
T=$(gv SHARK_VERCEL_TOKEN); TM=$(gv SHARK_VERCEL_TEAM); P=$(gv SHARK_VERCEL_PROJECT); prev=""
for i in $(seq 1 120); do
  cur=$(curl -s -H "Authorization: Bearer $T" "https://api.vercel.com/v6/deployments?projectId=$P&teamId=$TM&limit=5&target=production" | python3 -c "
import json,sys
for x in json.load(sys.stdin).get('deployments',[]):
  if (x.get('meta') or {}).get('githubCommitSha','').startswith('$SHA'): print(x['uid'], x['state']); break
" 2>/dev/null)
  [ "$cur" != "$prev" ] && echo "$(date -u +%H:%M) $cur" >> "$L"; prev="$cur"
  case "$cur" in *READY) echo "LIVE paths=$(curl -s https://shark.in.th/api/v1/crm/openapi.json | grep -oE '"/[a-z/{}._-]+"' | sort -u | wc -l)" >> "$L"; echo DONE >> "$L"; exit 0;; *ERROR|*CANCELED) echo FAILED >> "$L"; echo DONE >> "$L"; exit 1;; esac
  sleep 30
done; echo "TIMEOUT $prev" >> "$L"; echo DONE >> "$L"
