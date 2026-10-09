# AI TEAM — measured cost per task (WO T0.1)

- provider: **real** · run `mv020zi9wtlv` · started 2026-10-08T21:34:27.777Z · finished 2026-10-08T21:45:25.580Z
- tenant: seed tenant AT1 · actor: the seed owner · model routing: automatic (the service picks the model per message) · price markup ×1
- figures are list price from AiCreditTxn; the provider bill can be lower (cache)
- unit: micro = one millionth of a US dollar, as charged to the shop's AI credit wallet. One run = one user turn in a new conversation, sent through the normal chat path.
- **STOPPED BY CAP** after 29 of 30 runs: the cumulative spend 4038957 micro reached the cap 3900000 micro before the next run started. Statistics and pack math below cover the measured runs only.

## 1. Runs

| # | type | round | model | tool calls | tokensIn | tokensOut | cached | micro | wall ms |
|---|---|---|---|---|---|---|---|---|---|
| 1 | chat-short | 1 | anthropic/claude-haiku-4.5 | 4 | 74114 | 670 | - | 77464 | 25403 |
| 2 | chat-history | 1 | anthropic/claude-haiku-4.5 | 0 | 8638 | 226 | - | 9768 | 8793 |
| 3 | quotation | 1 | anthropic/claude-sonnet-5 | 1 | 69503 | 683 | - | 218754 | 28299 |
| 4 | stalled-deals | 1 | anthropic/claude-haiku-4.5 | 1 | 53479 | 470 | - | 55829 | 16602 |
| 5 | follow-up-silent | 1 | anthropic/claude-haiku-4.5 | 1 | 25805 | 783 | - | 29720 | 14200 |
| 6 | fb-post | 1 | anthropic/claude-sonnet-5 | 0 | 33082 | 603 | - | 108291 | 18007 |
| 7 | review-reply | 1 | anthropic/claude-sonnet-5 | 0 | 8554 | 973 | - | 40257 | 19697 |
| 8 | invoice-from-quotation | 1 | anthropic/claude-sonnet-5 | 2 | 100265 | 469 | - | 307830 | 22498 |
| 9 | daily-summary | 1 | anthropic/claude-sonnet-5 | 6 | 93436 | 1448 | - | 302028 | 28399 |
| 10 | teach-back | 1 | anthropic/claude-sonnet-5 | 2 | 26681 | 818 | - | 92313 | 20798 |
| 11 | chat-short | 2 | anthropic/claude-haiku-4.5 | 5 | 133109 | 802 | - | 137119 | 23499 |
| 12 | chat-history | 2 | anthropic/claude-haiku-4.5 | 0 | 8794 | 240 | - | 9994 | 9095 |
| 13 | quotation | 2 | anthropic/claude-sonnet-5 | 1 | 69971 | 596 | - | 218853 | 21301 |
| 14 | stalled-deals | 2 | anthropic/claude-haiku-4.5 | 1 | 54005 | 467 | - | 56340 | 15700 |
| 15 | follow-up-silent | 2 | anthropic/claude-haiku-4.5 | 1 | 26330 | 1046 | - | 31560 | 18199 |
| 16 | fb-post | 2 | anthropic/claude-sonnet-5 | 0 | 8715 | 1024 | - | 41505 | 16499 |
| 17 | review-reply | 2 | anthropic/claude-sonnet-5 | 1 | 17546 | 1150 | - | 69888 | 25101 |
| 18 | invoice-from-quotation | 2 | anthropic/claude-sonnet-5 | 4 | 132188 | 518 | - | 404334 | 27800 |
| 19 | daily-summary | 2 | anthropic/claude-sonnet-5 | 6 | 93904 | 1356 | - | 302052 | 27299 |
| 20 | teach-back | 2 | anthropic/claude-sonnet-5 | 0 | 8770 | 429 | - | 32746 | 11290 |
| 21 | chat-short | 3 | anthropic/claude-haiku-4.5 | 4 | 74650 | 614 | - | 77720 | 24600 |
| 22 | chat-history | 3 | anthropic/claude-haiku-4.5 | 0 | 8794 | 243 | - | 10009 | 8101 |
| 23 | quotation | 3 | anthropic/claude-sonnet-5 | 2 | 100882 | 1796 | - | 329586 | 38598 |
| 24 | stalled-deals | 3 | anthropic/claude-haiku-4.5 | 1 | 54010 | 460 | - | 56310 | 15601 |
| 25 | follow-up-silent | 3 | anthropic/claude-haiku-4.5 | 1 | 26236 | 783 | - | 30151 | 14694 |
| 26 | fb-post | 3 | anthropic/claude-sonnet-5 | 1 | 58257 | 1709 | - | 200406 | 32297 |
| 27 | review-reply | 3 | anthropic/claude-sonnet-5 | 1 | 17648 | 1090 | - | 69294 | 24492 |
| 28 | invoice-from-quotation | 3 | anthropic/claude-sonnet-5 | 3 | 132188 | 1172 | - | 414144 | 32094 |
| 29 | daily-summary | 3 | anthropic/claude-sonnet-5 | 6 | 93904 | 1532 | - | 304692 | 28495 |

cached = `-`: the provider layer does not report cached prompt tokens today. tool calls = business tools the model called in the turn.

## 2. Per type (micro, nearest rank)

| type | category | path | runs | p50 | p95 | mean |
|---|---|---|---|---|---|---|
| chat-short | chat | mobile | 3 | 77720 | 137119 | 97434.3 |
| chat-history | chat | service | 3 | 9994 | 10009 | 9923.7 |
| quotation | quotation | service | 3 | 218853 | 329586 | 255731.0 |
| stalled-deals | summaries | service | 3 | 56310 | 56340 | 56159.7 |
| follow-up-silent | summaries | service | 3 | 30151 | 31560 | 30477.0 |
| fb-post | content | service | 3 | 108291 | 200406 | 116734.0 |
| review-reply | content | service | 3 | 69294 | 69888 | 59813.0 |
| invoice-from-quotation | quotation | service | 3 | 404334 | 414144 | 375436.0 |
| daily-summary | summaries | service | 3 | 302052 | 304692 | 302924.0 |
| teach-back | teach | service | 2 | 32746 | 92313 | 62529.5 |

## 3. Expected mix (weights) and weighted mean

| category | weight | categoryMeanMicro | types |
|---|---|---|---|
| chat | 0.5 | 53679.0 | chat-short, chat-history |
| quotation | 0.1 | 315583.5 | quotation, invoice-from-quotation |
| summaries | 0.2 | 129853.6 | stalled-deals, follow-up-silent, daily-summary |
| content | 0.1 | 88273.5 | fb-post, review-reply |
| teach | 0.1 | 62529.5 | teach-back |

categoryMeanMicro[c] = arithmetic mean of micro over all runs whose type belongs to category c.

weightedMeanMicro = ceil( Σ weights[c] × categoryMeanMicro[c] ) = **99449** micro per task (about 3.58 THB at list price).

## 4. Pack math

- revenueMicro = round( priceThb / thbPerUsd × 1000000 ), with thbPerUsd = 36
- allowanceMicro = floor( revenueMicro × (1 − margin) ), with margin = 0.5 (gross margin of at least 50 % on list price)
- approxTasks = floor( allowanceMicro / weightedMeanMicro )

| priceThb | revenueMicro | allowanceMicro | approxTasks |
|---|---|---|---|
| 490 | 13611111 | 6805555 | 68 |
| 1490 | 41388889 | 20694444 | 208 |
| 3990 | 110833333 | 55416666 | 557 |

## 5. FREE trial allowance (R-A5) — one proposal and two alternatives

| option | allowanceMicro | approxTasks | USD per shop per month | THB per shop per month | why |
|---|---|---|---|---|---|
| proposed | 9944900 | 100 | 9.9449 | 358.02 | about 100 tasks of the expected mix per month: an owner can use the team every working day for a month before deciding to buy (generous trial, R-A5) |
| alternative 1 | 4972450 | 50 | 4.9725 | 179.01 | about 50 tasks per month (the figure drawn in the mockups): half the platform cost per free shop, but daily use runs out in about two weeks |
| alternative 2 | 1361111 | 13 | 1.3611 | 49.00 | one fifth of the allowance of the 490 THB pack: follows the pack price instead of a task count, so the free tier never competes with the smallest paid pack |

approxTasks uses the same formula as the packs. The cost columns are what one free shop costs the platform per month at list price if it uses the whole allowance.

## 6. Totals and cleanup

- runs 29 · tokensIn 1613458 · tokensOut 24170 · spent 4038957 micro (4.038957 USD) · cap 3900000 micro
- conversations deleted: 29 · wallet refunded with one ADJUST row `qc-ai-t0.1-refund-mv020zi9wtlv` of 4038957 micro · wallet before 10000000 → after 10000000
- other rows removed: AiMessage 88 · AiMemory 1
- rows left in the tenant after cleanup: none (every tenant table has the row count it had before the run; the credit ledger keeps its rows by design)

## 7. Machine-readable data (read by scripts/qc-ai-t0.1.mts)

```json probe-data
{
 "version": 1,
 "runId": "mv020zi9wtlv",
 "provider": "real",
 "startedAt": "2026-10-08T21:34:27.777Z",
 "finishedAt": "2026-10-08T21:45:25.580Z",
 "tenantId": "cmuz8037t0004wvkzsd9uy0e8",
 "actorUserId": "cmuz802ak0000wvkzh97w7qxz",
 "capUsd": 3.9,
 "capMicro": 3900000,
 "rounds": 3,
 "stoppedByCap": true,
 "thbPerUsd": 36,
 "margin": 0.5,
 "routing": "auto",
 "priceMarkup": 1,
 "types": [
  {
   "key": "chat-short",
   "category": "chat",
   "path": "mobile"
  },
  {
   "key": "chat-history",
   "category": "chat",
   "path": "service"
  },
  {
   "key": "quotation",
   "category": "quotation",
   "path": "service"
  },
  {
   "key": "stalled-deals",
   "category": "summaries",
   "path": "service"
  },
  {
   "key": "follow-up-silent",
   "category": "summaries",
   "path": "service"
  },
  {
   "key": "fb-post",
   "category": "content",
   "path": "service"
  },
  {
   "key": "review-reply",
   "category": "content",
   "path": "service"
  },
  {
   "key": "invoice-from-quotation",
   "category": "quotation",
   "path": "service"
  },
  {
   "key": "daily-summary",
   "category": "summaries",
   "path": "service"
  },
  {
   "key": "teach-back",
   "category": "teach",
   "path": "service"
  }
 ],
 "weights": {
  "chat": 0.5,
  "quotation": 0.1,
  "summaries": 0.2,
  "content": 0.1,
  "teach": 0.1
 },
 "rows": [
  {
   "n": 1,
   "type": "chat-short",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~1bf09428f163a70a27345588",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 4,
   "tokensIn": 74114,
   "tokensOut": 670,
   "cachedTokens": null,
   "micro": 77464,
   "wallMs": 25403,
   "txnIds": [
    "cmv021xay0003jnkz1qd2tmpo",
    "cmv021zun0004jnkzpbxvpl7e"
   ]
  },
  {
   "n": 2,
   "type": "chat-history",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~d084c1b67f99d437322f550f",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 0,
   "tokensIn": 8638,
   "tokensOut": 226,
   "cachedTokens": null,
   "micro": 9768,
   "wallMs": 8793,
   "txnIds": [
    "cmv0226y5000ijnkzs2uawi7e"
   ]
  },
  {
   "n": 3,
   "type": "quotation",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~a2c9c0be893498a608563e1e",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 1,
   "tokensIn": 69503,
   "tokensOut": 683,
   "cachedTokens": null,
   "micro": 218754,
   "wallMs": 28299,
   "txnIds": [
    "cmv022t6d000mjnkz3yziidiu"
   ]
  },
  {
   "n": 4,
   "type": "stalled-deals",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~7b9831e6cd73ac9f4197dbbe",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 1,
   "tokensIn": 53479,
   "tokensOut": 470,
   "cachedTokens": null,
   "micro": 55829,
   "wallMs": 16602,
   "txnIds": [
    "cmv0235tr000qjnkz3r3lo2xn"
   ]
  },
  {
   "n": 5,
   "type": "follow-up-silent",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~c7ac9fd821d4b9dff5914bc4",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 1,
   "tokensIn": 25805,
   "tokensOut": 783,
   "cachedTokens": null,
   "micro": 29720,
   "wallMs": 14200,
   "txnIds": [
    "cmv023h8w000ujnkzjc8tkq7i"
   ]
  },
  {
   "n": 6,
   "type": "fb-post",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~b4d653210659aa2f483cb495",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 0,
   "tokensIn": 33082,
   "tokensOut": 603,
   "cachedTokens": null,
   "micro": 108291,
   "wallMs": 18007,
   "txnIds": [
    "cmv023v7r000yjnkzbxw1o1h4"
   ]
  },
  {
   "n": 7,
   "type": "review-reply",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~8a38ba8671df35e8cd39b940",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 0,
   "tokensIn": 8554,
   "tokensOut": 973,
   "cachedTokens": null,
   "micro": 40257,
   "wallMs": 19697,
   "txnIds": [
    "cmv024akf0012jnkzwd9tvau9"
   ]
  },
  {
   "n": 8,
   "type": "invoice-from-quotation",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~81c740943198fa9ce4403715",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 2,
   "tokensIn": 100265,
   "tokensOut": 469,
   "cachedTokens": null,
   "micro": 307830,
   "wallMs": 22498,
   "txnIds": [
    "cmv024s050016jnkzc75bg769"
   ]
  },
  {
   "n": 9,
   "type": "daily-summary",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~aeb3f8bac00a25dc61bcf983",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 6,
   "tokensIn": 93436,
   "tokensOut": 1448,
   "cachedTokens": null,
   "micro": 302028,
   "wallMs": 28399,
   "txnIds": [
    "cmv025e5e001ajnkz00jk9lqi"
   ]
  },
  {
   "n": 10,
   "type": "teach-back",
   "round": 1,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~c2984db4b891664ebe75d0dc",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 2,
   "tokensIn": 26681,
   "tokensOut": 818,
   "cachedTokens": null,
   "micro": 92313,
   "wallMs": 20798,
   "txnIds": [
    "cmv025ucs001ejnkz6wh2l821"
   ]
  },
  {
   "n": 11,
   "type": "chat-short",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~33b6f47190e9b17e6c7213ad",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 5,
   "tokensIn": 133109,
   "tokensOut": 802,
   "cachedTokens": null,
   "micro": 137119,
   "wallMs": 23499,
   "txnIds": [
    "cmv026akc001ijnkzs2h239ne",
    "cmv026cep001jjnkzrz9idewy"
   ]
  },
  {
   "n": 12,
   "type": "chat-history",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~7028b79d5c86ecfb7fa4201e",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 0,
   "tokensIn": 8794,
   "tokensOut": 240,
   "cachedTokens": null,
   "micro": 9994,
   "wallMs": 9095,
   "txnIds": [
    "cmv026jl5001xjnkzskwpctzh"
   ]
  },
  {
   "n": 13,
   "type": "quotation",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~ed1a677bbf9a23d277132fd8",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 1,
   "tokensIn": 69971,
   "tokensOut": 596,
   "cachedTokens": null,
   "micro": 218853,
   "wallMs": 21301,
   "txnIds": [
    "cmv02706a0021jnkz9f0b7fms"
   ]
  },
  {
   "n": 14,
   "type": "stalled-deals",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~c25df96e6c74e05132148d93",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 1,
   "tokensIn": 54005,
   "tokensOut": 467,
   "cachedTokens": null,
   "micro": 56340,
   "wallMs": 15700,
   "txnIds": [
    "cmv027c4v0025jnkz5qhdt4ye"
   ]
  },
  {
   "n": 15,
   "type": "follow-up-silent",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~0df0666e98c36b9d8ab11044",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 1,
   "tokensIn": 26330,
   "tokensOut": 1046,
   "cachedTokens": null,
   "micro": 31560,
   "wallMs": 18199,
   "txnIds": [
    "cmv027qez0029jnkzin57j39n"
   ]
  },
  {
   "n": 16,
   "type": "fb-post",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~742ea9ab1bc5ff4cc2c73fa1",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 0,
   "tokensIn": 8715,
   "tokensOut": 1024,
   "cachedTokens": null,
   "micro": 41505,
   "wallMs": 16499,
   "txnIds": [
    "cmv0283dd002djnkz8jaf3tdn"
   ]
  },
  {
   "n": 17,
   "type": "review-reply",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~0fc6182304904a0f97e03d05",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 1,
   "tokensIn": 17546,
   "tokensOut": 1150,
   "cachedTokens": null,
   "micro": 69888,
   "wallMs": 25101,
   "txnIds": [
    "cmv028mtd002hjnkz0hyj1qa0"
   ]
  },
  {
   "n": 18,
   "type": "invoice-from-quotation",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~69ceb50fcdd4ce986243cbe1",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 4,
   "tokensIn": 132188,
   "tokensOut": 518,
   "cachedTokens": null,
   "micro": 404334,
   "wallMs": 27800,
   "txnIds": [
    "cmv02989n002ljnkzxy4bhw01"
   ]
  },
  {
   "n": 19,
   "type": "daily-summary",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~07e760e9cd77ea9b6c6292fc",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 6,
   "tokensIn": 93904,
   "tokensOut": 1356,
   "cachedTokens": null,
   "micro": 302052,
   "wallMs": 27299,
   "txnIds": [
    "cmv029tby002pjnkzujei1ljd"
   ]
  },
  {
   "n": 20,
   "type": "teach-back",
   "round": 2,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~81458c51a3a63575682ccb4f",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 0,
   "tokensIn": 8770,
   "tokensOut": 429,
   "cachedTokens": null,
   "micro": 32746,
   "wallMs": 11290,
   "txnIds": [
    "cmv02a2a6002tjnkzc7ieubws"
   ]
  },
  {
   "n": 21,
   "type": "chat-short",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~82dcad83a9330414d2eb9bb5",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 4,
   "tokensIn": 74650,
   "tokensOut": 614,
   "cachedTokens": null,
   "micro": 77720,
   "wallMs": 24600,
   "txnIds": [
    "cmv02aj0x002xjnkzuc3eff8j",
    "cmv02akvm002yjnkz7tqdwhxu"
   ]
  },
  {
   "n": 22,
   "type": "chat-history",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~89eb39a5f4ca5c3d1d9066fb",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 0,
   "tokensIn": 8794,
   "tokensOut": 243,
   "cachedTokens": null,
   "micro": 10009,
   "wallMs": 8101,
   "txnIds": [
    "cmv02arij003cjnkz3abxqnwf"
   ]
  },
  {
   "n": 23,
   "type": "quotation",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~8229f095444c94afde2fc099",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 2,
   "tokensIn": 100882,
   "tokensOut": 1796,
   "cachedTokens": null,
   "micro": 329586,
   "wallMs": 38598,
   "txnIds": [
    "cmv02blom003gjnkzjyrnrjjk"
   ]
  },
  {
   "n": 24,
   "type": "stalled-deals",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~4885f51d51803beacc32a709",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 1,
   "tokensIn": 54010,
   "tokensOut": 460,
   "cachedTokens": null,
   "micro": 56310,
   "wallMs": 15601,
   "txnIds": [
    "cmv02bxq8003kjnkzw8jpy6lq"
   ]
  },
  {
   "n": 25,
   "type": "follow-up-silent",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~0e4edfac0caccb42a0ace1f1",
   "model": "anthropic/claude-haiku-4.5",
   "toolCalls": 1,
   "tokensIn": 26236,
   "tokensOut": 783,
   "cachedTokens": null,
   "micro": 30151,
   "wallMs": 14694,
   "txnIds": [
    "cmv02c9am003ojnkzt4smj84t"
   ]
  },
  {
   "n": 26,
   "type": "fb-post",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~9a4f88d1f74eaf99416e4b65",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 1,
   "tokensIn": 58257,
   "tokensOut": 1709,
   "cachedTokens": null,
   "micro": 200406,
   "wallMs": 32297,
   "txnIds": [
    "cmv02cxwr003sjnkzaif6mdc1"
   ]
  },
  {
   "n": 27,
   "type": "review-reply",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~93373516cd3a6ceaac8cf159",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 1,
   "tokensIn": 17648,
   "tokensOut": 1090,
   "cachedTokens": null,
   "micro": 69294,
   "wallMs": 24492,
   "txnIds": [
    "cmv02dhfi003wjnkzlcj6mfw4"
   ]
  },
  {
   "n": 28,
   "type": "invoice-from-quotation",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~a0c83ea225d18f2e3473642e",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 3,
   "tokensIn": 132188,
   "tokensOut": 1172,
   "cachedTokens": null,
   "micro": 414144,
   "wallMs": 32094,
   "txnIds": [
    "cmv02e64e0040jnkz3j9w95ao"
   ]
  },
  {
   "n": 29,
   "type": "daily-summary",
   "round": 3,
   "conversationId": "u~cmuz802ak0000wvkzh97w7qxz~54a2ea2176211b81b293816c",
   "model": "anthropic/claude-sonnet-5",
   "toolCalls": 6,
   "tokensIn": 93904,
   "tokensOut": 1532,
   "cachedTokens": null,
   "micro": 304692,
   "wallMs": 28495,
   "txnIds": [
    "cmv02es730044jnkzcgjj49ha"
   ]
  }
 ],
 "perType": [
  {
   "type": "chat-short",
   "n": 3,
   "p50Micro": 77720,
   "p95Micro": 137119,
   "meanMicro": 97434.33333333333
  },
  {
   "type": "chat-history",
   "n": 3,
   "p50Micro": 9994,
   "p95Micro": 10009,
   "meanMicro": 9923.666666666666
  },
  {
   "type": "quotation",
   "n": 3,
   "p50Micro": 218853,
   "p95Micro": 329586,
   "meanMicro": 255731
  },
  {
   "type": "stalled-deals",
   "n": 3,
   "p50Micro": 56310,
   "p95Micro": 56340,
   "meanMicro": 56159.666666666664
  },
  {
   "type": "follow-up-silent",
   "n": 3,
   "p50Micro": 30151,
   "p95Micro": 31560,
   "meanMicro": 30477
  },
  {
   "type": "fb-post",
   "n": 3,
   "p50Micro": 108291,
   "p95Micro": 200406,
   "meanMicro": 116734
  },
  {
   "type": "review-reply",
   "n": 3,
   "p50Micro": 69294,
   "p95Micro": 69888,
   "meanMicro": 59813
  },
  {
   "type": "invoice-from-quotation",
   "n": 3,
   "p50Micro": 404334,
   "p95Micro": 414144,
   "meanMicro": 375436
  },
  {
   "type": "daily-summary",
   "n": 3,
   "p50Micro": 302052,
   "p95Micro": 304692,
   "meanMicro": 302924
  },
  {
   "type": "teach-back",
   "n": 2,
   "p50Micro": 32746,
   "p95Micro": 92313,
   "meanMicro": 62529.5
  }
 ],
 "categoryMeanMicro": {
  "chat": 53679,
  "quotation": 315583.5,
  "summaries": 129853.55555555556,
  "content": 88273.5,
  "teach": 62529.5
 },
 "weightedMeanMicro": 99449,
 "packs": [
  {
   "priceThb": 490,
   "revenueMicro": 13611111,
   "allowanceMicro": 6805555,
   "approxTasks": 68
  },
  {
   "priceThb": 1490,
   "revenueMicro": 41388889,
   "allowanceMicro": 20694444,
   "approxTasks": 208
  },
  {
   "priceThb": 3990,
   "revenueMicro": 110833333,
   "allowanceMicro": 55416666,
   "approxTasks": 557
  }
 ],
 "freeTrial": {
  "proposed": {
   "allowanceMicro": 9944900,
   "approxTasks": 100,
   "note": "about 100 tasks of the expected mix per month: an owner can use the team every working day for a month before deciding to buy (generous trial, R-A5)"
  },
  "alternatives": [
   {
    "allowanceMicro": 4972450,
    "approxTasks": 50,
    "note": "about 50 tasks per month (the figure drawn in the mockups): half the platform cost per free shop, but daily use runs out in about two weeks"
   },
   {
    "allowanceMicro": 1361111,
    "approxTasks": 13,
    "note": "one fifth of the allowance of the 490 THB pack: follows the pack price instead of a task count, so the free tier never competes with the smallest paid pack"
   }
  ]
 },
 "totals": {
  "runs": 29,
  "tokensIn": 1613458,
  "tokensOut": 24170,
  "spentMicro": 4038957,
  "spentUsd": 4.038957
 },
 "cleanup": {
  "conversationsDeleted": 29,
  "refundRef": "qc-ai-t0.1-refund-mv020zi9wtlv",
  "refundMicro": 4038957,
  "walletBeforeMicro": 10000000,
  "walletAfterMicro": 10000000,
  "unlistedUsageMicro": 0,
  "deleted": {
   "AiMessage": 88,
   "AiMemory": 1
  },
  "residue": [],
  "problems": []
 },
 "failure": null
}
```
