# November reliability and Bunker update

Route presentation correction: route status and catalogues are host-only at the
database boundary. Players do not request or render them. The host sees two
compact rows with card counts and collapsed card lists. No quest-like outcome,
threat or limitation blocks are rendered. All 324 non-author route variants
now use short bare traits without boilerplate about manual checks. Matching
already dealt cards are updated in place; host-edited text and all other card
state are preserved. Apply `supabase/route-privacy-and-short-text.sql` last.

Personal goals follow-up: 150 scenario-independent goals are stored in
`content/general-goals.json`; apply `supabase/general-goals.sql` after the existing
deal updates. New random deals default to one neutral goal per player. Explicit
opt-out, preset goals and already dealt cards are preserved. Goals remain private
to their owner and host, except the existing special peek mechanism. Completion
is discussed at the final review; it does not automatically change the verdict.
GOALS.md documents the content and installation. SQL probes cover privacy,
late join/reconnection, opt-out and presets; all 90 route deals also include goals.

Scenario alignment follow-up: nine narratives now agree with the six route
catalogues and baseline equipment. SC08 is excluded on server and client;
its text and original rules are unchanged. No historical data is deleted.
New medieval random deals receive max(8, 4 * planned survivors) litres once,
capped by player count; existing manually set resources are preserved.
Apply `supabase/scenario-alignment.sql` once after v2.

Latest follow-up: scenario-routes-v2.sql adds six specific routes per scenario,
two selected per game, explicit outcomes/limits and interchangeable components.
Mafia media identity now follows participant permissions instead of game revisions.
Full catalogue: SCENARIO-ROUTES.md. Apply v2 once after the initial migrations.

## Database

Applied to alive-project on 2026-11-14. The historical Cron table was reduced
from approximately 701 MiB to 16 KiB; the full database fell from 718 MiB to
17 MiB immediately after cleanup. Game content and game audit were preserved.
`operational-history-retention` runs hourly inside PostgreSQL. Successes expire
after six hours; failures after seven days. At most 20,000 expired rows are
removed per run. No extra Edge Functions or browser cleanup requests.

For another installation apply once in order: `supabase/cron-retention.sql`,
`supabase/bunker-combos.sql`, `supabase/combo-verdict.sql` (after the existing
release/medieval/participants migrations). Do not reapply seed migration to an
already upgraded database. The Cron script explicitly clears operational run
history and keeps up to 500 recent failures; it never removes scheduled jobs.

## Bunker

- `host.html` is a dedicated full-width host workspace using the existing
  authenticated room and server permissions; open it from the in-game task bar.
- Current-task guide, compact density, larger text, reduced motion, and visible
  personalized card borders. Chat fills available space below the player table.
- Every new random deal contains two three-card survival routes. Variants are
  chosen server-side: care needs skill/materials/safe handling; water needs
  skill/equipment/source. Medieval cards remain inside the medieval tag.
- The six required categories must be enabled. The lobby validates them before
  saving; the server rejects an incompatible deal atomically.
- Routes fit within the configured survivor capacity (up to three holders),
  respect room uniqueness, and cannot be removed by the balancing pass. Normal
  trait sums finish between -1 and +1 per player. Goals/specials are excluded.
- Late entrants also receive balanced random cards. Existing games are not
  redealt. Preset characters retain their existing behavior.
- The host sees current live components; a player sees only their own or
  publicly revealed cards. Changing/removing/swapping a card affects the check.
- A victory with a missing component requires an alternative plan of at least
  20 characters; the explanation is recorded in the room/journal. Completing
  routes does not waive other scenario threats or automatically grant victory.

## Mafia

- Three connection attempts with increasing delay, then explicit retry; device
  and credential errors stop immediately. Requests have timeouts, and transient
  room recovery errors retain the saved room.
- Automatic owners cannot see individual night submission status. Only the
  separate moderator receives it. Unauthorized night-reset commands are denied.
- Role correction removes the previous action/clan votes. Editing a role or
  clearing an action after night resolution is rejected rather than silently
  leaving already calculated effects in place.
- A server-controlled five-second sleep preparation precedes the first role.
  Existing five-second intervals between roles remain; wake cue plays once.
- Actions check the sender's camera instead of scanning every participant.
- Expanded chronicle has dialog semantics, keyboard focus containment and Escape.

## Validation

90 rollback-only SQL deals across nine route scenarios and the excluded author
scenario, 2/4/12 players: unique cards, sum balance, six guaranteed components
within survivor capacity, private owners, medieval water and verdict validation.
Author exclusion and preset switching also pass in the browser.
Engine/media/handler/roles/nomination/moderation/signal tests and
desktop/mobile browser flows pass. Regression probes now assert that automatic
retries stop, initial preparation blocks actions and hidden night actors stay
hidden. Browser media uses a provider fixture; real multiplayer devices and
unstable networks still require a live test.
