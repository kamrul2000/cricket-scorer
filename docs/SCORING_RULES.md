# Cricket Scorer: supported scoring rules (version 1)

This app is a scorebook for **casual and club limited-overs cricket**. It follows the MCC
Laws of Cricket where it implements a situation, and it rejects situations it does not
implement. **It does not claim compliance with any professional competition's
playing conditions.**

- Laws checked against: *The Laws of Cricket, 2017 Code, 4th Edition (2026)*, MCC
  ([PDF from lords.org](https://www.lords.org/getmedia/1d908298-5c44-468d-b6a7-e1414a1296e0/Laws-of-Cricket-2017-Code-4th-Edition-(2026)_3.pdf)).
- Free hit checked against: ICC Men's T20I Playing Conditions clause 21.19, as quoted on
  [icc-cricket.com](https://icc-cricket.com/news/mens-t20i-match-clause-21-no-ball).
- The rules are implemented in `src/domain/scoring.ts`. They are tested in `__tests__/domain/`.

## 1. Match format

| Rule | Behaviour | Source |
|---|---|---|
| Innings | One innings per side, plus Super Overs after a tie if the scorer chooses (section 18). | Law 13.1.2 (agreement) |
| Overs | A positive whole number of overs per innings, chosen at setup (max 100). It can be changed until the first ball (section 21), and reduced during the match (section 22). | Match agreement |
| Balls per over | 6 valid balls. | Law 17.1 |
| Players per side | 2 to 11 for each team (default 11). The two teams may have **different** numbers (for example 11 v 10). The players need not all be named at the start (section 19). | **Local override.** The Laws assume 11 (Law 1.1), but allow other numbers by agreement. |
| All out | When the batting side's players per side − 1 wickets have fallen, or when a batter is needed, nobody is left who may bat and the lineup is full (sections 15 and 19). "Last batter stands" is **not** supported. | Law 13.3 |
| Result | Higher total wins (Law 16.2). Equal totals with both innings complete is a tie (Law 16.5.1). Margins are in runs (side batting first) or wickets (side batting second, = that side's players − 1 − wickets lost). An abandoned match has no result (section 11). With a revised target, the chase is measured against it (section 22). | Law 16 |
| Match end | The match ends the instant the target is reached (see section 6). | Law 16.6 |

## 2. Counting balls

Overs are stored as an **integer count of legal balls**. "12.3" on screen means 12 overs and
3 balls. It is never stored or calculated as a decimal.

| Delivery | Counts toward the over? (Law 17.3) | Counts as a ball faced by the striker? |
|---|---|---|
| Fair (including byes and leg byes) | Yes | Yes |
| No-ball | No (Law 21.16) | Yes |
| Wide | No (Law 22.8) | No |

"Ball faced" is a **scoring convention**, not a Law. The convention used here is the common one.

## 3. Runs and extras

| Situation | Team | Batter | Extras | Debited to bowler | Source |
|---|---|---|---|---|---|
| Runs off the bat | runs | runs | — | runs | Law 18.10.1, 18.10.3 |
| Byes / leg byes (fair ball) | runs | 0 | byes / leg byes | **0** | Law 23, 18.10.3 |
| Wide | 1 + runs completed (or + boundary 4) | 0 | all as wides | **all** | Law 22.6, 22.7 |
| No-ball, runs off the bat | 1 + runs | runs | 1 no-ball | 1 + runs | Law 21.14, 21.15 |
| No-ball with byes / leg byes | 1 + runs | 0 | 1 no-ball + byes / leg byes | **1 only** | Law 18.10.2, 21.15 |

**Boundaries:**

| Kind | Runs | Ends | Source |
|---|---|---|---|
| Four (ordinary) | 4 | Batters return to original ends. | Law 19.7, 18.11.2 |
| Six | 6, **only from a ball struck by the bat**. | Original ends. | Law 19.7.1 |
| Overthrow four | 4 + runs completed at the instant of the throw. | By runs completed (odd = ends changed). | Law 19.8 |
| Byes / leg-byes / wide to the boundary | 4 as that extra type. | Original ends. | Law 19.7.2 |

A "four" in the batter's 4s column is an ordinary four off the bat only. Overthrow fours and
bye or leg-bye fours are not counted there.

**Not supported:** batters completing *more* runs than the boundary allowance before an
ordinary boundary (Law 19.7.3.2/19.7.4). Short runs (Law 18.3 to 18.5) and 5-run penalty
awards (Law 41) are also not supported.

## 4. Strike and ends

Strike is worked out from **runs physically completed**, never from team runs:

- Odd runs completed → batters changed ends. Even runs → same ends.
- Ordinary four or six → original ends (Law 18.11.2).
- End of over → the next over is bowled from the other end, so the striker changes (Law 17.1).
- After the striker is bowled, caught, LBW, stumped or hit wicket → the not-out batter stays
  at their original end. The new batter comes in at the striker's end (Law 18.11.1).
- After a run out → see below.

## 5. Dismissals

| Dismissal | Fair ball | Wide | No-ball | Runs on that ball | Bowler credited | Source |
|---|---|---|---|---|---|---|
| Bowled | ✔ | ✘ | ✘ | none | ✔ | Laws 32, 21.17, 22.9 |
| Caught | ✔ | ✘ | ✘ | none | ✔ | Laws 33, 18.8 |
| LBW | ✔ | ✘ | ✘ | none | ✔ | Law 36 |
| Stumped | ✔ | ✔ (wide penalty stands) | ✘ | penalty only | ✔ | Laws 39, 39.4 |
| Hit wicket | ✔ | ✔ (wide penalty stands) | ✘ | penalty only | ✔ | Laws 35, 35.3 |
| Run out | ✔ | ✔ | ✔ | runs completed before the wicket was broken + penalty | ✘ | Laws 38.5, 38.6 |

**Run outs** require the scorer to record:
1. **who is out** (striker or non-striker),
2. **the end where the wicket was broken**, and
3. runs completed before it (the run in progress does not count),
4. optionally, the fielder.

The not-out batter finishes at the other end, and the new batter comes in at the broken
wicket's end (Laws 38.4, 18.12). A run out cannot happen on a delivery that reached the boundary.

Caught requires the catcher, and stumped requires the wicket-keeper (who cannot be the bowler).
Fielders must be in the fielding lineup.

Retired out (Law 25.4.3) is recorded between deliveries, see section 15.

**Not supported** (the app rejects or cannot record them):
- obstructing the field
- hit the ball twice
- timed out
- non-striker run out before delivery (Law 38.3)
- dead-ball re-bowls
- substitute or runner rules (substitutes can be named, see section 14)

## 6. Winning the match (Law 16.6)

In the second innings:

- **The penalty alone can win.** If the wide or no-ball penalty alone reaches the target, no
  further runs or dismissal can be recorded on that delivery (Laws 16.6.1, 39.4).
- **Running.** Batters cannot run more runs than needed. The match ends when the winning run
  is completed.
- **Boundaries.** A winning boundary counts in full (Law 16.6.3). An overthrow four is
  rejected if the winning run had already been completed before the throw.
- **Run outs.** A run out is rejected if the winning run had already been completed.

## 7. Bowlers

- A bowler may not bowl two consecutive overs (Law 17.6). This is enforced.
- **Optional competition rule:** maximum overs per bowler (e.g. 4 in T20). This is not an MCC
  Law. The app also blocks a choice that would make it impossible to finish the innings
  without breaking Law 17.6 or the limit.
- Maiden = a completed over with no runs debited to the bowler. Byes and leg byes do not spoil
  a maiden; wides and no-balls do. An over shared by two bowlers (section 16) is not a maiden.
- The maximum overs limit counts balls: a bowler may start an over only if a full over still
  fits under the limit.

## 8. Free hit: competition rule, optional

The free hit is **not** in the MCC Laws. It is an ICC limited-overs playing condition (clause
21.19), and many local leagues use it. It is a per-match setting, on by default.

- The delivery after **any** no-ball is a free hit.
- If the free-hit delivery is a wide or a no-ball, the next delivery is also a free hit.
- On a free hit, the striker can only be dismissed in ways possible from a no-ball, even if it
  is a wide. Of the dismissals this app supports, that means **run out only**.
- Field-placement restrictions on a free hit are not tracked.

## 9. Undo

Undo removes the most recent event: a delivery, a new-batter choice, a new-bowler choice, an
innings start, a batter swap, an abandon, a retirement, a bowler replacement, ending an innings
(either way), changing the overs or starting a Super Over. The match state is always recomputed from the remaining events, so
undo reverses everything that event caused. That includes over completion, free hits, innings
completion and the match result. To correct an older delivery without undoing what came after
it, edit it (section 17).

## 10. Scorer corrections: swap batsmen

"Swap batsmen" exchanges the striker and non-striker **without a delivery**. It is a scorer
correction (for example when the wrong batter was shown on strike), not a cricket event:
no ball, run, extra or statistic changes. It is stored as its own event, shown in the
ball-by-ball history as a correction, and can be undone.

It is allowed whenever both batters are at the crease in an unfinished innings (including
between overs). It is refused while a new batter has to be chosen, and after the innings.

## 11. Abandoned matches (no result)

"Abandon match" ends the match immediately with **no result** (for example rain or bad
light). The score so far is kept, the current innings is marked as ended by abandonment, and
no further deliveries can be recorded. It can be undone. If play can continue with fewer overs,
change the overs instead (section 22). Abandoned matches are listed under **Abandoned** on the
Matches tab.

## 12. Statistics shown

All figures come from the scoring engine's state; screens, the PDF and the image never
recalculate them.

| Figure | Definition |
|---|---|
| Overs | Legal balls ÷ 6, shown as "overs.balls" (never a decimal). |
| Run rate | Team runs × 6 ÷ legal balls. "-" before the first legal ball. |
| Strike rate | Batter runs × 100 ÷ balls faced, 1 decimal. "-" with no balls faced. |
| Economy | Runs debited to the bowler × 6 ÷ legal balls, 2 decimals. |
| Required rate | Runs needed × 6 ÷ legal balls remaining. |
| Partnership | Team runs (including extras) while two batters were together, from when the second arrived until a wicket. Balls = balls faced by the pair (wides excluded). Each batter's share is their runs off the bat. "Unbroken" = no wicket ended it. A batter swap does not start a new partnership. |
| Over by over | Team runs and wickets in each over, and the team score at the end of it. Wides and no-balls belong to the over in which they were bowled. |
| Batting average (career) | Runs ÷ times dismissed. "-" until dismissed once. Retired hurt counts as not out; retired out as a dismissal. |
| Bowling average (career) | Runs conceded ÷ wickets. "-" until a wicket. |
| Best bowling (career) | Most wickets in one innings, then fewest runs. |

Averages are only shown across matches (on the player screen): one innings is not a
meaningful sample. Super Over figures are not included in career figures or the automatic
awards (as in official records), but they are on the scorecard. Displayed values are rounded with JavaScript's `toFixed`, which rounds the
binary value, so an exact halfway case (such as 1.005) can round down. Only the display is
rounded; counts of runs and balls are always whole numbers.

**Not supported:** 5-run penalty awards (Law 41) and other penalty runs.

## 13. Match awards (app rules, not official)

**Best Batter** (automatic). Every player who batted is eligible. Ranked by: 1. most runs;
2. fewest balls faced; 3. not out ahead of out; 4. most fours plus sixes; 5. batting earlier
(first innings, then batting position). No automatic award when nobody scored.

**Best Bowler** (automatic). Bowlers with at least one legal ball are eligible. If anyone
bowled a full over, only bowlers with at least one full over are. Ranked by: 1. most
wickets; 2. lowest economy; 3. most legal balls; 4. most maidens; 5. bowling earlier.

**Player of the Match** is chosen by the scorer. The scorer may also override Best Batter or
Best Bowler. Only players in the playing lineups (not substitutes) are eligible, and an
override must be a player who batted (or an eligible bowler). Awards can be set once the
match is complete.

## 14. Lineups, captains and substitutes

- Each team plays the number of players chosen for it (2 to 11; the two teams may differ). A
  player can appear only once per match, in one team, either in the playing lineup or as a
  substitute. The lineup may name fewer players at the start (section 19).
- The captain and vice-captain (optional) must be in the playing lineup and be different
  players. They default to the team's captain and vice-captain.
- **Substitutes** are recorded and shown on the scorecard, but **cannot bat, bowl, or be
  recorded as fielders** (catches, stumpings, run outs). Substitute, replacement and runner
  rules (Law 24, Law 25.5) are not supported in this version.

## 15. Retirements (Law 25.4)

A batter at the crease can retire between deliveries (also between overs), but not while a new
batter still has to be chosen. A new batter takes their place, on strike if the retiring batter
was on strike.

| | Retired hurt (not out) | Retired out |
|---|---|---|
| Wicket? | No. Not in the fall of wickets. | Yes, with a fall of wicket. Not credited to the bowler. |
| Partnership | Ends, marked "(retired hurt)". The next one is for the same wicket. | Broken, as by any wicket. |
| Can bat again? | Yes, whenever a new batter is needed later, continuing the same innings (runs and balls carry on). Not to fill the vacancy their own retirement left (Law 25.4.2). | No. |
| Scorecard | "retired hurt" (if they did not resume); not out in career figures. | "retired out"; a dismissal in career figures. |

When a new batter is needed and nobody may bat (everyone else is out, at the crease, or has just
retired) and the lineup is full, the innings ends as all out. When only retired-hurt batters are
left and none of them can resume, the scorer ends the innings with "No one else can bat: end
innings".

## 16. A bowler who cannot finish an over (Law 17.8)

"Change bowler" during an over: another bowler finishes it.

- Balls already bowled stay in the first bowler's figures; the rest are the new bowler's.
- The new bowler must not have bowled (part of) the previous over or of this over.
- **Neither** bowler may bowl the next over (Law 17.6: no parts of two consecutive overs).
- The over is no one's maiden. The over-by-over summary lists both bowlers.
- The maximum-overs limit, if set, also applies to the balls the new bowler will bowl.

Before the first ball of an over, "Change bowler" only corrects who is bowling it: the bowler
who never bowled is forgotten and is not blocked from the next over.

## 17. Editing an earlier delivery

Any delivery can be opened again ("Edit a ball", or tap a ball in the current over) and changed:
ball type, runs, extras, boundary and wicket. The engine then replays the rest of the match:

- Later deliveries keep what the scorer recorded (runs, extras, wickets), but their striker,
  non-striker and bowler come from the corrected match, because an edit can change who was on
  strike (for example 1 run corrected to 2).
- If a later action no longer fits, the edit is refused and nothing changes. Examples: removing
  a wicket after which a new batter was chosen, turning a wide into a fair ball in an over that
  has already finished, or a run that would have won the match earlier than recorded. Undo back
  to that ball and score again instead.
- The edited history is saved in one transaction. A changed first innings changes the target.

## 18. Super Over (ICC playing conditions, optional)

When the match is tied, the scorer may play a Super Over ("Play a Super Over"; the match stays
tied if they do not).

- Each side bats one over. An innings ends after 2 wickets (or 1 with only 2 players), at the
  end of the over, or when the target is reached.
- The side that batted second in the match bats first. The target is their Super Over score + 1.
- If the Super Over is also tied, another may be played. The side that batted second in the
  previous Super Over bats first. A player dismissed in any earlier Super Over may not bat, and a
  bowler of the previous Super Over may not bowl.
- Result: "Match tied · Alpha won the Super Over" (or "… the 2nd Super Over").
- A Super Over that is abandoned leaves the match tied.
- Super Over figures are on the scorecard, but not in career figures or the automatic awards.
- Boundary-count and other tie-breaks are not supported.

## 19. Naming players during the match (app rule)

A team's **players per side** is fixed when the match is set up, but its lineup can name fewer
players then, even none. The rest join while scoring, when they are needed:

- Teams can be created on the new-match screen, and players added there by name. The openers
  and opening bowler can be picked from the team's players or typed in.
- When a new batter, the next bowler, a replacement bowler or a fielder (catch, stumping, run
  out) is needed, the choice also lists the team's players who are not in the match yet, and a
  box for a new name. A new name becomes a player on that team's roster.
- Joining the lineup is its own action in the match history ("Rahim added to the Tigers
  lineup"), so it can be undone like any other. Undo takes the player out of the lineup again;
  they stay on the team's roster.
- A lineup can never have more players than the team's players per side, and a player can be in
  only one lineup per match.
- All out is decided by the players per side, not by how many players have been named: with 11
  a side, the 10th wicket ends the innings. If a new batter is needed and nobody named can bat,
  the innings does **not** end on its own while places are free: the scorer adds the next batter,
  or, if nobody else is coming, ends it with "No one else can bat: end innings" (all out).
- The maximum-overs check counts the places still free as bowlers who have not bowled yet.
- Players joining later never change how earlier balls are replayed: the lineup at each point of
  the history is the one recorded up to then. An earlier ball can therefore only be edited to
  name a fielder who was in the lineup at that time.

## 20. Ending an innings early (app rule)

"More… > End innings now" closes the innings in progress at any point between deliveries: by
agreement, a declaration, the batting side giving up, or any other reason. It is its own action
in the match history and can be undone.

- The innings counts as complete. After the first innings, the second innings needs the runs
  scored + 1, in the full overs (or the reduced overs, section 22). After the second innings, the
  result is decided on the runs scored: the side batting first wins by the runs short of the
  target, or the match is tied.
- The scorecard notes "Innings ended early". The batters at the crease are not out.
- This is different from "No one else can bat: end innings" (section 19), which counts as all out.

## 21. Changing match settings before the first ball (app rule)

Until the first ball of the match is bowled, "More… > Edit match settings" changes the overs per
innings, each team's players per side, the maximum overs per bowler and the free-hit rule. The
recorded actions so far (openers, players added) are checked again with the new settings, so a
team cannot be made smaller than the players already named. The toss and the openers cannot be
changed here. From the first ball on, only the overs can be changed (section 22).

## 22. Reduced overs and revised targets (app rule)

"More… > Change overs" records an interruption (rain, bad light, a late start) that costs overs:

- **First innings:** the new number of overs applies to both innings. The target stays the first
  innings runs + 1.
- **Innings break and second innings:** the second innings gets the new overs and a **revised
  target**. The app suggests one in proportion to the overs (the "average run rate" method):
  first innings runs × second innings overs ÷ first innings overs, rounded down, + 1. The scorer
  can type any target the captains agree. The **DLS method is not supported**.
- Overs already started cannot be taken away, and the overs can never be more than the match was
  set up with. A Super Over's overs cannot be changed.
- If the new overs have all been bowled, the innings ends at once. If the chasing side has already
  reached the revised target, it wins at once.
- The maximum overs per bowler can be changed at the same time (in shortened matches it is often
  a fifth of the overs). The change is refused if the bowler of the current over could not finish
  it, or if the remaining overs could no longer be bowled without someone bowling two in a row.
- The result says "(revised target)" when the target was revised, for example "Bravo won by 6
  wickets (12 balls left) (revised target)". Runs margins are counted from the revised target.
- The scorecard notes "Reduced to 15 overs (from 20)" and "Revised target 121".

## 23. Pausing a match and match status (app rule)

"Pause" stops scoring until "Resume match", for example for rain, bad light or a break; a reason
is optional. Pausing is not part of the match history (it changes no score and is not undone): it
is stored with the match, and while it lasts the scoring pad is replaced by a Resume panel. The
overs can still be changed, and the match abandoned, while it is paused.

The Matches tab lists matches as **Upcoming** (scheduled, or cancelled), **Live**, **Paused**,
**Completed** and **Abandoned**, and has a search box for team names, venue, date (for example
"8 Nov"), result or pause reason.
