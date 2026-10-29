# Manual checks before a release

The automated tests (`npx jest`) cover the scoring rules, storage, backup validation and
restore. These checks cover what only a real phone can show. Run them on the **release APK**
(see [ANDROID_BUILD.md](ANDROID_BUILD.md)), not in Expo Go. Tick each one.

## Setup

- [ ] Create at least 6 players and two teams of 3, plus two full teams of 11.

## Closing and reopening during a match

- [ ] Start a 2-over, 3-a-side match. Score a few balls including a wide and a wicket.
- [ ] Swipe the app away from the recent-apps list. Reopen it. Matches > the match shows
      "Resume", and the score, batters, bowler and recent balls are exactly as before.
- [ ] Undo once, close the app again, reopen: the undo is still in effect.
- [ ] Finish the match, close and reopen: it is listed under Completed with the right result.

## Rapid repeated taps

- [ ] On the scoring screen, tap "1" five times as fast as possible. Each recorded ball
      appears once in the over strip; no error banner stays on screen.
- [ ] Double-tap "Start match", "Start second innings" and a new-batter name: each happens once.

## Save errors (development build only)

- [ ] Settings > "Make the next save fail", then score a ball. A "Not saved" banner with
      Retry and Discard appears, and the score did not change.
- [ ] Press Back: "Leave without saving?" appears. Choose Stay, then Retry: the ball is saved once.
- [ ] Repeat, and this time choose Discard: the ball is not recorded.

## Backup and restore

- [ ] Settings > Backup and restore > "Save to a folder…", choose Downloads. A success message
      names the file; a file manager shows it in Downloads.
- [ ] "Share (Drive, email…)": the share sheet opens; save it to Google Drive or send it by email.
- [ ] "Choose backup file…" and pick a photo or other non-backup file: it is rejected and
      "Nothing was changed" is shown.
- [ ] Create a new player, then restore the earlier backup. The confirmation shows the backup's
      contents and the current data that will be replaced. Confirm: the new player is gone and
      all matches are back. Resume the in-progress match and score a ball.
- [ ] Development build: arm "Make the next save fail", restore again: "Restore failed.
      Nothing was changed", and the data is as it was.
- [ ] "Check stored data" reports no problems.
- [ ] Uninstall the app, reinstall the APK, restore the backup from Downloads or Drive:
      everything is back.

## Airplane mode with the standalone APK

- [ ] Install the release APK. Turn on airplane mode (Wi-Fi and mobile data off).
- [ ] Cold-start the app, create two teams, play a complete match to the result, view the
      scorecard, and save a backup to a folder. Nothing asks for a connection.

## Android back button

- [ ] In the new-match wizard, Back goes to the previous step, then leaves the wizard.
- [ ] On the scoring screen, Back returns to Matches; the match is listed as Resume.
- [ ] Scorecard > Resume scoring > Scorecard > Back > Back returns to Matches (no pile-up).

## Swap batsmen and abandon

- [ ] Mid-over, tap "Swap batsmen", confirm: the ON STRIKE marker moves; score, balls and
      figures do not change. The next ball is credited to the new striker.
- [ ] After a wicket (new batter needed), "Swap batsmen" is disabled with an explanation.
- [ ] Undo removes the swap. Close and reopen the app: swaps and undos are as left.
- [ ] "Abandon match (no result)": confirm; the result reads "No result (match abandoned)".
      Undo reopens the match.

## Teams, logos, captains and substitutes

- [ ] Edit a team: choose a logo from the gallery (a large photo too), add a description, pick a
      captain and vice-captain. The logo shows in the Teams list.
- [ ] Untick the captain from the squad: the captain choice clears.
- [ ] Turn on airplane mode, delete the original photo from the gallery, reopen the app: the
      logo still shows (it was copied into the app).
- [ ] New match: captain/vice-captain default from the team; pick substitutes. A substitute
      cannot be chosen as opener, new batter, bowler, catcher or keeper. The scorecard shows
      (c), (vc) and the substitutes.

## Scorecard, awards and exports

- [ ] Scorecard shows partnerships and over-by-over for each innings.
- [ ] After the match: Awards card shows automatic Best Batter and Best Bowler; choose a Player
      of the Match and override one award; reopen: the choices are kept.
- [ ] "Share scorecard": Save PDF to a folder, open it in a PDF viewer: both innings, logos,
      awards; a 20-over match continues over several pages with column headings on each.
- [ ] Share PDF and Share image through WhatsApp or Drive. Save image to Pictures.
- [ ] Repeat the exports in airplane mode.

## Upcoming matches and posters

- [ ] Schedule match: two teams, date and time (Android pickers), venue, T10 format. It shows
      under Upcoming on the Matches tab, soonest first.
- [ ] Edit it; cancel it (it moves to the end, marked Cancelled); restore it.
- [ ] Match poster: both templates look right with and without logos and with a long venue;
      save the PNG to Pictures and share it. Check the PNG is 1080 × 1350.
- [ ] Start scoring from the upcoming match: teams, overs and venue are filled in. After
      starting, the upcoming entry disappears and the match is In progress.
- [ ] Open the upcoming match again (e.g. with Back) and tap Start scoring: it says the match
      has already started instead of creating a second one.

## Retirements, bowler changes, edits, unequal teams and Super Overs

- [ ] New match with "Teams have different numbers of players" on: 4 v 3. Each lineup step asks
      for its own number; the scorecard shows "4 v 3 players". The 3-player side is all out after
      2 wickets.
- [ ] "Retire batter" > striker > Retired hurt: the new batter is asked for and takes strike. The
      retired batter is listed under "Retired hurt" and is not offered for their own place.
      After the next wicket they are offered ("retired hurt: resumes") and their score continues.
- [ ] "Retire batter" > Retired out: counts as a wicket and in the fall of wickets, "retired out"
      on the scorecard, no wicket for the bowler.
- [ ] Retire everyone you can until only retired-hurt batters are left: "No one else can bat: end
      innings" ends the innings.
- [ ] After 2 balls of an over, "Change bowler": the second bowler finishes the over. The
      over-by-over shows both names, and neither is allowed to bowl the next over.
- [ ] Before the first ball of an over, "Change bowler" just swaps the bowler; the first one is not
      on the scorecard.
- [ ] Tap a ball in the current over, change 1 run to 2: the preview shows the new score
      ("was …"). Save: the strike and the later balls follow the correction. Close and reopen the
      app: the edit is still there.
- [ ] "Edit a ball", choose a wicket that was followed by a new batter, set "No wicket": it is
      refused with an explanation and nothing changes.
- [ ] Settings > "Make the next save fail", then edit a ball: "Edit not saved" with Retry; Retry
      saves it once.
- [ ] Play a match to a tie: "Play a Super Over" appears. The side that batted second bats
      first, the innings stops after 1 over or 2 wickets, the chase shows the target, and the
      result reads "Match tied · … won the Super Over". Super Over runs are not in career figures.
- [ ] Tie the Super Over too: "Play a 2nd Super Over" appears; a batter dismissed and the bowlers
      of the first Super Over are shown as not allowed.
- [ ] PDF and image exports of a Super Over match show the Super Over innings.

## Icon, splash screen and intro (release APK)

- [ ] The home-screen icon is the white batter with the gold ball on green, in round and
      rounded-square launchers, and in Android 13+ themed icons (single colour).
- [ ] Opening the app shows the batter on dark green (splash), with no white flash after it.
- [ ] First launch after installing: the intro plays (logo, app name, "Developed by…", the ground,
      the two match photos) and fades into the app. Close and reopen: it does not play again.
- [ ] Skip, and the Android back button, both end the intro at once.
- [ ] Settings > "Play the intro" plays it again.
- [ ] With Android "Remove animations" on, a still title card shows briefly instead.

## Upgrading from the Stage 4 app

- [ ] Install the Stage 4 APK, score part of a match, then install this version over it
      (same signing key). Everything is still there, the match resumes, and a Stage 4 backup
      file restores.
