# TopKing live games: security patch and deployment notes

## Changes in this archive
- Greedy and Teen Patti call the `settleLiveGame` Firebase callable function instead of directly incrementing/decrementing wallet Stars from the client.
- Cloud Function validates the signed-in user, bet keys, integer amounts and 10,000-Star round cap; it shuffles Teen Patti cards server-side and chooses Greedy outcomes server-side.
- Wallet debit and payout happen in one Firestore transaction. A per-user settlement ledger makes retries idempotent. Room-round outcome documents allow callers with the same room/game/round ID to receive the same outcome.
- Added `functions/`, `firebase.json`, and Firestore rules that deny client access to the server-only round/settlement collections.
- Teen Patti uses a time-bucket round ID; players who settle in different time buckets can still land in different rounds if their local timers drift. For a fully synchronized live room, the host/room must publish a server-owned round ID and betting deadline; this package does not yet add that room-level lifecycle.

## Required before production
1. Confirm Firebase project `kingofftop-2af35` is the intended production project and back up the currently deployed Firestore rules.
2. Install Firebase CLI and sign in with an account authorized for that project.
3. Cloud Functions deployment generally requires the Firebase project's Blaze billing plan. Review budget alerts before enabling it.
4. From this project folder run `cd functions`, `npm install`, then return to project root and run `firebase deploy --only functions`.
5. Review `firestore.rules` against the currently deployed rules before deploying rules. This ZIP does not automatically deploy Firestore rules.
6. Run two authenticated test accounts in a Firebase Emulator or staging project. Verify low-balance rejection, maximum bet, one payout on retry, same room-round outcome, app close/reopen, and concurrent calls.
7. Test the Android release build and inspect function logs before publishing. Do not use real user Stars until staging checks pass.

## Important limitations
- No Firebase credentials are available in this workspace, so functions cannot be deployed to your project from here.
- The app's room/game countdown is still client-driven. The included time-bucket fallback is not a substitute for a server-owned room round/deadline.
- Code syntax was checked for the Cloud Function; Android bundling, emulator tests, and production integration have not been run here.
- Payouts use fixed, documented multipliers/weights, not user-specific outcome manipulation. Review local law and Google Play policy before offering games involving paid/convertible virtual currency.


## Wallet settlement / payout behavior
- The game UI now displays the authoritative balance returned by `settleLiveGame` and avoids showing a fake local Greedy winner when server settlement fails.
- If a round shows a settlement error, no wallet debit/payout was confirmed by the server; check Firebase Functions logs and deployment before allowing real Stars play.
- Settlement idempotency keys include the room ID so the same user can play the same time-bucket round in a different room without colliding with a prior room's settlement.
- Deploy the `functions/` code from the project root with `firebase deploy --only functions` after selecting the correct Firebase project. Do not deploy Firestore rules without reviewing them against the current app.

## v2 fix: lag + "haar ke baad Stars wapas aa jate the"

### Asli wajah (bugs)
1. **Teen Patti**: har player ka timer apne-aap shuru hota tha aur round ID `time-bucket` se banta tha. Round 34s+network delay ka hota tha, isliye
   bucket repeat/skip hota tha -> server "already settled" ya "round expired" deta tha -> **Stars kate hi nahi** (haarne ke baad bhi wapas).
2. **Greedy**: settlement result phase (round ke aakhri 4s) me jaata tha. Function slow/cold ho ya round badal jaye to "expired" error aata tha,
   aur panel band karne par bet gayab ho jati thi -> Stars wapas.
3. **Lag**: Greedy poora panel har 100ms re-render karta tha; server ka winner aate hi wheel ka target badalta tha (jhatka);
   sab players ek hi Firestore document par transaction karte the (lock contention); bina bet wale players bhi wallet transaction chalate the.

### Kya badla
- `components/live/liveGameServer.js` (NEW): server clock sync, safe retry, friendly error messages.
- Dono games ab **server-synced clock** se chalte hain (room me sabka round/timer same). Settlement **bet band hote hi** jaati hai
  (Greedy: spin start, Teen Patti: deal phase) aur panel band hone par bhi cancel nahi hoti.
- Greedy: memoized cells, wheel constant speed se ghumta hai aur server ka winner aate hi smoothly us par rukta hai; history ab server winners se banti hai.
- Functions: round ID +-1 bucket tolerance, shared round transaction ke bahar banta hai (no contention), bina bet wale players ke liye wallet untouched,
  naya `getServerTime` callable. Deploy: `firebase deploy --only functions` (dono functions deploy honge).
- Optional speed: `REGION` (functions/index.js) aur `FUNCTIONS_REGION` (liveGameServer.js) dono `asia-south1` karo (Firestore ka location bhi same ho to best).
  Cold start hata na ho to function me `minInstances: 1` jodo (billing lagti hai).
