# JASHxp Buy Tracker

A minimal, responsive purchase and repair tracker for GitHub Pages + Supabase.

## Included
- Handwritten starter list (12 items)
- Public read-only website; authenticated owner-only add/edit/delete
- Purchase status workflow: Planning, Purchased, Repair needed, Under repair, Repaired, Retired/sold
- Planned and actual price, INR budget summary, purchase date, warranty date
- Item detail view with multiple links, repair log, repair costs, price history, ratings and notes
- Days-since-repair counters computed from saved completion dates
- Optional image upload to Supabase Storage
- JSON and CSV export
- Search, category filter, sort, responsive layout
- Browser-only demo mode if Supabase is not configured

## A. Create the Supabase project
1. Create a project at https://supabase.com/.
2. In **Authentication → Users**, create your owner user using email and password. If sign-up is disabled, creating the user as an admin is fine.
3. Open that user and copy its **User UID**.
4. Open **SQL Editor → New query**. Open `supabase-setup.sql`, replace `OWNER_AUTH_USER_UUID` with that UID (keep the single quotes), then run the script.
5. In **Project Settings → API** (or API Keys), copy the **Project URL** and the public **publishable key** (`sb_publishable_…`) or legacy `anon` key. Never use `service_role` or a secret key in browser code.
6. In the SQL Editor, optionally run `select public.is_tracker_owner();` after signing into the website is not possible from SQL Editor, so this may return false/null in SQL Editor; that is expected. The owner check is evaluated in the signed-in browser session.

## B. Configure the website
Recommended: edit `app.js` and set the two constants near the top:

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-PUBLISHABLE-OR-ANON-KEY";
```

These are public client values protected by Row Level Security. Do **not** put a service-role key here.

Alternative: leave them blank and enter the URL and key from **Settings & account** in the running website. That option stores them in that browser's local storage.

## C. Publish on GitHub Pages
1. Create a **new public repository** named `JASHxpBuyTracker`.
2. Upload these files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `supabase-setup.sql` (kept as setup documentation; the browser does not run it)
   - `.nojekyll`
   - `README.md`
3. Commit the files.
4. Open repository **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**; select `main` and `/(root)`, then Save.
6. Wait for the Pages deployment. Your site will be at:
   `https://YOUR-GITHUB-USERNAME.github.io/JASHxpBuyTracker/`
7. Open the website, go to **Settings & account**, connect if you didn't configure `app.js`, then sign in with the owner email/password.
8. Check that the owner can add an item and that a signed-out/private browser can only view the list.

## D. Important security notes
- GitHub Pages is public hosting. Anyone can view the website and all item data returned by the public read policy.
- This setup deliberately allows public reads and restricts database mutations to the one Supabase Auth user UUID configured in `tracker_config`.
- Do not put personal or sensitive information, private invoices, home addresses, serial numbers or private notes in this public tracker.
- The photo bucket is public so images display without signed URLs. Upload product photos only; do not upload private receipts. If you need private photos, change the bucket and app to use authenticated private storage/signed URLs.
- Never share a Supabase service-role/secret key. The publishable/anon key is intended for browser use with RLS enabled.
- Enable email confirmation or strong password policy in Supabase if appropriate. If you use email confirmation, complete it before sign-in.
- Keep a backup: use **Export data** to download JSON regularly.

## E. How to use
- **Add item** creates a tracker record.
- Open any card to see its detail page/dialog.
- **Change status** to move an item between sections. A purchase date is set automatically when an item leaves Planning if no date exists.
- **Log repair** saves repair start/completion date, cost, description and notes. Completed repair dates drive the “days since repaired” counter.
- **Add link** saves shopping, price comparison, review, manual or warranty URLs.
- **Price record** records historical price points.
- **Rate item** records overall, quality, value and durability ratings.
- **Export data** downloads a JSON backup; CSV export is in Settings.
- Search and filters work across the current list.

## F. Notes and limitations
- The website uses a single `tracker_items` table; links, repairs and price history are JSON arrays in each row. This keeps setup simple and ensures each item’s history is updated atomically.
- The item URL is shareable via a hash fragment (`#item=...`) for deep linking in this starter version.
- Demo mode uses local browser storage and is not cloud-synced. Connect Supabase for cross-device persistence.
- GitHub Pages may take a few minutes to publish after the first commit.
