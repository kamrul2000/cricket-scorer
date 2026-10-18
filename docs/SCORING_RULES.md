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
| Innings | One innings per side. | Law 13.1.2 (agreement) |
| Overs | A positive whole number of overs per innings, chosen at setup (max 100). | Match agreement |
| Balls per over | 6 valid balls. | Law 17.1 |
| Players per side | Equal for both teams, 2 to 11 (default 11). | **Local override.** The Laws assume 11 (Law 1.1), but allow other numbers by agreement. |
| All out | When `playersPerSide - 1` wickets have fallen. "Last batter stands" is **not** supported. | Law 13.3 |
| Result | Higher total wins (Law 16.2). Equal totals with both innings complete is a tie (Law 16.5.1). Margins are in runs (side batting first) or wickets (side batting second, = players − 1 − wickets lost). | Law 16 |
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

**Not supported** (the app rejects or cannot record them):
- obstructing the field
- hit the ball twice
- timed out
- retired (hurt or out)
- non-striker run out before delivery (Law 38.3)
- a bowler changing mid-over (Law 17.8)
- dead-ball re-bowls
- substitute or runner rules

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
  a maiden; wides and no-balls do.

## 8. Free hit: competition rule, optional

The free hit is **not** in the MCC Laws. It is an ICC limited-overs playing condition (clause
21.19), and many local leagues use it. It is a per-match setting, on by default.

- The delivery after **any** no-ball is a free hit.
- If the free-hit delivery is a wide or a no-ball, the next delivery is also a free hit.
- On a free hit, the striker can only be dismissed in ways possible from a no-ball, even if it
  is a wide. Of the dismissals this app supports, that means **run out only**.
- Field-placement restrictions on a free hit are not tracked.

## 9. Undo

Undo removes the most recent event: a delivery, a new-batter choice, a new-bowler choice, or
an innings start. The match state is always recomputed from the remaining events, so undo
reverses everything that event caused. That includes over completion, free hits, innings
completion and the match result.
