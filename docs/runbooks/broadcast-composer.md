# Runbook — Broadcast composer and channel reach

**What changed.** Marketing → Messages now has one composer (`src/components/staff/BroadcastComposer.tsx`) for promotional, weekly, announcement and community-vote messages over SMS and/or email. It writes `broadcasts.channels`, `broadcast_type`, `email_subject`, `sent_sms_count`, `sent_email_count`.

**Reach.** Read from `v_broadcast_reach` before the send button enables. Default channel = cheapest that reaches anyone (`defaultChannels()` in `src/lib/insights.ts`): email if it reaches >0, else SMS. Both are never pre-ticked.

**Email today.** `reachable_email = 0` and `send-broadcast` handles SMS only. Email is disabled with "0 recipients" and, if ever chosen, is recorded with `sent_email_count = 0`. It does not pretend to send. See OVERNIGHT-AUDIT §4–5.

**Never render** `broadcasts.revenue_generated` or `open_rate`. `BROADCAST_SELECT` in `src/hooks/useBroadcasts.ts` lists columns explicitly; `selectsForbiddenColumn()` is tested. Measured performance is `v_broadcast_summary`, shown in Analytics → Marketing return.

**If a send fails.** The mutation throws before inserting a history row, so there is no phantom record. Check the `send-broadcast` function logs; the n8n side is outside the repo.

**Reversible.** Yes. The old tab is gone from source but the table is unchanged; `git revert` restores it.
