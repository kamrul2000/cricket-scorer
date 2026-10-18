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
