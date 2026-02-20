# Perf Notes (Next.js App Router)

Top likely causes of slow dev navigation in this repo and what to check next:

1. Repeated server auth/database reads on settings/dashboard routes
- Check for sequential fetches that can be parallelized with `Promise.all`.
- Reuse already loaded user/workspace context in the same request when possible.

2. Client-side `router.refresh()` bursts after mutations
- Check panels that call `router.refresh()` after every action.
- Prefer optimistic local state updates first, then a single refresh when needed.

3. Dynamic rendering where static/cached output would work
- Current forced-dynamic routes are invoice detail/payment and PDF routes.
- Keep dynamic only for pages that must reflect near-real-time payment state.

4. Broad cache revalidation after writes
- Check `revalidatePath` usage in server actions.
- Revalidate the narrowest path set needed (avoid wide dashboard invalidations).

5. Large settings/dashboard trees with many client components
- Check if interactive-only parts can stay client-side while data-heavy sections remain server-rendered.
- Move non-interactive wrappers and copy blocks to server components to reduce client JS in dev.

## Invoice Reminders Throttle Smoke Test

Local trigger:
- `curl -i -H "Authorization: Bearer $REMINDER_CRON_TOKEN" "http://localhost:3000/api/reminders/run?triggeredBy=cron"`
- `curl -i -H "x-reminder-cron-token: $REMINDER_CRON_TOKEN" "http://localhost:3000/api/reminders/run?triggeredBy=cron"`

Recommended local env for quick verification:
- `EMAIL_BATCH_SIZE=3`
- `EMAIL_THROTTLE_MS=2000`
- `EMAIL_MAX_RUN_MS=30000`

How to confirm throttling:
- Tail server logs and check reminder send timestamps are spaced by about `EMAIL_THROTTLE_MS`.
- Confirm API response includes `attempted`, `sent`, `failed`, `skipped`, `hasMore`.
- Set `EMAIL_BATCH_SIZE` below eligible reminders and verify `hasMore=true` in the JSON response.

## Reminder Run Scope Smoke Test

- Trigger a manual run from `/dashboard/reminders` and confirm the new `public.reminder_runs` row has `workspace_id` and `user_email` populated.
- Open `/dashboard/settings/reminders` for that workspace and confirm the run is visible in the workspace-scoped list.
- Trigger a cron run and confirm `workspace_id` is populated when candidates are found, while actor displays as `—`.

## Reminder Log Backfill

- Open `Settings -> Reminders -> Diagnostics`.
- Click `Fix historical rows`.
- Expected result: older cron rows with recoverable scope metadata are backfilled and now appear in the Recent runs table for the active workspace scope.
