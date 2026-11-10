# VOLMERRA

The official website of a fictional story universe — one universe, one continuing
story, told in chapters. Static, dependency-free, mobile-first.

## Stack

Plain HTML, CSS and vanilla JavaScript. No frameworks, no build step, no
dependencies. Open `index.html` in a browser or serve the folder with any
static file server.

## Structure

```
index.html          Homepage — guest and authenticated layouts (one file, toggled by session)
pages/
  story.html        Story + published chapters (grouped by season)
  chapter.html      Cinematic chapter detail page (?id=…): cover hero + info + "Okumaya Başla"
  read.html         Dedicated reading page (?id=…): parsed TXT, adjustable text size
  characters.html   Character catalogue: portrait + name cards, clickable to profiles
  character.html    Character profile (?id=…): portrait (season-aware), bio, facts (compact catalogue grid)
  places.html       Places: regions as cards, linked to region detail pages
  place.html        Region detail (?region=…): the locations of one region
  location.html     Location detail (?id=…)
  universe.html     World reference (places, lore)
  gallery.html      Official artwork
  about.html        What the site is, accounts, roadmap
  login.html        Login form
  signup.html       Registration form
  profile.html      Display name, profile picture, sign out (session-guarded)
admin/
  index.html        CMS dashboard: stats, quick access, scheduled chapters, recent updates
  chapters.html     Chapter management: filter by season, search, publish/draft/delete/preview
  chapter.html      Publish/edit form: title, cover, description, season, auto number, .txt content, schedule
  characters.html   Character management (name, image, description, age, affiliations, season)
  locations.html    Location management (name, images, region, description)
  lore.html         Universe & lore entries (history, mythology, powers, stones, magical systems, other)
  gallery.html      Gallery management (images, titles, descriptions, categories)
  publishing.html   Publishing: drafts, published, scheduled (prototype) with countdowns
  website.html      Featured content, homepage section ordering/visibility, announcements, season settings
  seasons.html      Season release management: publication status, dates, theme preview per season
  community.html    Registered users (read-only), comment moderation, reported content
assets/css/
  tokens.css        Design tokens: type, spacing, radii, motion, light/dark palettes, season accents
  base.css          Reset, typography, layout primitives
  components.css    Reusable components (buttons, header/nav, cards, forms, footer…)
  pages.css         Page-level layouts (hero, member home, gallery, profile, admin, reader…)
                    + an isolated ≤640px mobile layer (touch targets, reflowed rows, 16px
                    form fields to prevent iOS zoom, safe-area padding). Desktop is untouched.
assets/js/
  theme.js          Light/dark switching, persisted, system preference fallback
  season.js         Seasonal accent system: applies data-season (S1–S8) on the current page
  seasons.js        Season release & visibility: publication status (S1–S8), central visibility rule
  auth.js           Registration, login/logout, profile updates, admin role
                    (localStorage fallback + swappable Supabase backend)
  supabase.js       Real backend adapter: Supabase Auth, profiles, chapters,
                    CMS, comments, library (attached when config.js exists)
  config.example.js Template for assets/js/config.js (Supabase URL + anon key)
  store.js          Personal library per user: progress, favorites, saved, history
  comments.js       Chapter comments data layer: replies, likes, ownership rules
  chapters.js       Chapter data layer + SXBX numbering, swappable storage adapter
  cms.js            CMS data layer: characters, locations, lore, gallery, settings, activity log
  admin.js          Admin controller: dashboard, all management sections, shared shell and guard
  story.js          Renders published chapters on the Story page
  places.js         Places / region / location public pages (CMS locations, exact region grouping)
  characters.js     Character catalogue + dedicated profile pages (seasonal portraits)

  The Characters overview shows only portrait + name per character in a
  compact multi-column grid; every card opens the dedicated profile page
  (pages/character.html?id=…) with the season-aware portrait, name,
  biography, age, affiliations and other stored info, plus a season
  selector when the character has portraits in more than one released
  season. Unreleased seasons are never shown publicly.
  reader.js         Chapter detail controller: cinematic hero (?id=…)
  read.js           Reading page controller: parsed TXT, text size, progress tracking
  ui.js             Shared header + footer injected into every page via #site-header/#site-footer
  home.js           Chooses guest vs. member homepage and fills the member panels
  forms.js          Wires login/signup/profile forms and the profile page guard
```

## Seasonal accent system

Each Volmerra season (S1–S8) has its own accent color, applied through
`data-season="s1"…"s8"` on `<html>` (S8 is a neutral placeholder until its
palette is decided). All accents are defined once in `tokens.css` as custom
properties — `--season-accent`, `-hover`, `-text`, plus derived `-soft` and
`-border` values computed with `color-mix()` — and work in both light and
dark mode (darker accents are lifted in dark mode for contrast). Changing
the season updates every component; the neutral black/white/gray foundation
never changes. A compact season picker sits in the footer.

## Conventions

- Every page sets `data-root` on `<html>` (`""` at the root, `../` inside
  `pages/`) so shared scripts can build correct links.
- Every page loads `theme.js` in `<head>` (avoids a theme flash), then
  `auth.js` → `ui.js` at the end of `<body>`.
- Navigation is defined once in `ui.js` (`NAV_LINKS`); pages mark the mount
  points `#site-header` / `#site-footer`.
- Placeholder story content is always visibly marked (`.badge`,
  `.placeholder`, `.empty-state`). No story details, characters or chapter
  titles are invented anywhere in the codebase.

## Accounts, sessions and the library

`auth.js` and `store.js` run on two interchangeable backends behind one
API:

- **Supabase backend (default when configured)** — real accounts via
  Supabase Auth, profiles in the `profiles` table, the admin role
  (`profiles.is_admin`) enforced by Row Level Security, the library
  stored per user in the `library` table. See "Supabase backend" below.
- **localStorage backend (fallback)** — honest client-side scaffold so
  the interface still works without a server: accounts and sessions live
  in `localStorage`, are **not secure**, and passwords are hashed in the
  browser only. Used when `assets/js/config.js` does not exist.
- There are **no demo accounts** — every profile is created by a real
  registration, and the member homepage only appears for a genuine
  session.
- Library data (continue reading, reading history, favorites, saved
  chapters) is stored per user id — in the backend row, or in
  `volmerra:library:<id>` on the fallback.

## Supabase backend

The site keeps its swappable adapter architecture: `assets/js/
supabase.js` attaches real backends to `VolmerraAuth`, `VolmerraCh
apters`, `VolmerraCMS`, `VolmerraComments` and `VolmerraLibrary`
without touching any UI code. `auth.js` loads `config.js` → the
vendored Supabase client library (`assets/js/vendor/supabase.js`,
no external CDN — some networks block CDNs) → `supabase.js`
automatically on every page; without `config.js` the localStorage
adapters stay active.

Setup:

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql` (tables, Row Level
   Security policies, RPCs, the profile-on-signup trigger).
3. **Authentication → Providers → Email**: disable "Confirm email" for
   instant sign-in during development (otherwise registration requires
   email confirmation before the first login).
4. Copy **Project Settings → API → Project URL** and the **anon public**
   key into `assets/js/config.js` (template: `config.example.js`). The
   anon key is public by design and ships with the site; the
   service_role key must never be committed. `.env.example` mirrors
   the same values for tooling.
5. The first registered account can claim administrator access once
   from any admin page (`admin/index.html` → "Claim administrator
   access"). The claim closes itself after the first admin exists;
   roles are then granted/revoked from the Supabase dashboard
   (`profiles.is_admin`).
6. **One-time migration**: chapters and CMS entries created before the
   backend was connected still live in the browser that made them.
   Open the admin dashboard **on that browser** and use
   **"Import this browser's data"** — it merges the localStorage
   chapters/characters/locations/lore/gallery/settings into the
   database by id (existing backend entries are never overwritten).
   Every change made *after* the backend is connected syncs to every
   device automatically.

Security model (enforced by RLS in `supabase/schema.sql`, not by the
client):

- Guests read published/scheduled chapters, CMS content and all
  comments; every write requires a signed-in account.
- Comment edit/delete is restricted to the author by RLS policies; one
  like per user per comment; replies cascade with their parent.
- Only administrators can write chapters/CMS data (`site_state`); public
  reads go through the `read_state()` RPC, which hides drafts and
  internal moderation data.
- Scheduled publication runs server-side via `publish_due_chapters()`
  (SECURITY DEFINER), so a visitor's browser can trigger it without
  any write access.
- The user library is a per-user row only the owner can read or write.

## Chapters, admin panel and the data layer

`chapters.js` is the single data layer for story chapters. Every method is
async and routed through a **swappable storage adapter** (`setAdapter`); the
default adapter persists to the browser, so the admin panel and the public
pages are fully usable today.

**Limits of the localStorage fallback (no config.js):**

- Chapters and covers are stored client-side, per browser. They are not a
  database: content will not sync between devices or survive a cleared
  browser store. Adding `assets/js/config.js` (Supabase backend) is the
  one change needed for real persistence.
- On the fallback the admin gate (`VolmerraAuth.isAdmin`) is enforced in
  the client only; on the Supabase backend the role lives in
  `profiles.is_admin` and every admin write is authorized server-side by
  Row Level Security (see "Supabase backend" above).

### Automatic chapter numbering (SXBX)

The chapter code is always derived from the season + number
(`S1B1`, `S1B4`…). Rules implemented in `chapters.js`:

- The form suggests the next free number in the selected season
  (a counter that follows the highest number ever used), but the
  admin can set any whole number instead — manual numbering is
  fully supported.
- Manual numbers must be unique within their season (duplicates
  are rejected with a clear error).
- The number is assigned atomically at create time through a
  serialized mutation queue; cross-client concurrency must be
  enforced transactionally by the backend adapter.

### Public integration

Published chapters appear automatically on the Story page (grouped by
season, in numerical order), in the homepage's "Recently published"
sections, and as a cinematic chapter detail page (`pages/chapter.html?id=…`
— full-width cover hero with the title over it, then a clean info section
with the "Okumaya Başla" button). The button opens the dedicated reading
page (`pages/read.html?id=…`), which renders the uploaded TXT in the
site's reading layout — never as a raw file — with adjustable text size
and reading-progress tracking for signed-in readers. Drafts and
unreleased-season chapters are never visible to visitors — only
administrators can preview them.

## Admin panel as a CMS

The admin panel (`/admin/`) is a unified management system with its own
horizontally scrollable sub-navigation, shared guard (guest → log-in prompt,
non-admin → denial, one-time first-run ownership claim) and two data-layer
modules with swappable storage adapters (`chapters.js`, `cms.js`):

- **Chapters** — management list (season filter, search) plus the
  publish/edit form with automatic SXBX numbering, cover, .txt upload,
  draft/publish and scheduling.
- **Characters** — one profile per character (name, biography, age,
  affiliations, default portrait) with a built-in seasonal gallery: eight
  independent portrait slots (S1–S8), each uploaded, replaced and removed
  separately. Public character cards show the portrait for the selected
  season, falling back to the closest earlier season with a portrait, then
  the default portrait, then a placeholder; visitors can switch seasons
  with a selector on the Characters page, which renders from this
  collection.
- **Locations / Universe & Lore / Gallery** — full CRUD through
  one generic, field-configured collection manager (text, textarea, select,
  season and image fields with previews). Location entries are grouped in
  the admin list by their exact region value, with an "Unassigned
  Locations" group for entries without a region.
- **Places (public)** — `pages/places.html` shows every region as a card
  (representative cover from its locations, location count), linking to
  region detail pages (`pages/place.html?region=…`) that list that
  region's locations, each opening a location detail page
  (`pages/location.html?id=…`). Grouping uses exact canonical region
  strings — never fuzzy name matching — and locations are read from the
  CMS data layer, so adding, editing or deleting a location in the admin
  panel updates the public pages automatically; unreleased-season
  content stays filtered out.
- **Publishing** — drafts, published chapters and scheduled chapters with
  upcoming dates, self-updating countdowns, publish-now and cancel-schedule.
- **Website** — featured chapter/character, announcement, homepage section
  visibility and ordering, and the active season accent.
- **Community** — registered users (read-only), comment and report
  moderation lists.

**Prototype vs. backend, stated honestly:**

- Everything runs on the client-side storage adapters: data is per browser,
  not a database. Swapping `setAdapter` in `chapters.js` / `cms.js` for a
  backend API adapter is the single change needed for real persistence.
- Scheduled publishing is a prototype: dates are validated (must be a valid
  future date and time, published chapters cannot be re-scheduled) and
  stored, countdowns update on their own, and scheduled chapters become
  published — with their numbers intact — only while the admin panel or the
  public website is open in a browser. A countdown alone does not publish a
  chapter; reliable publication when nobody has the website open requires a
  server-side scheduler.
- The admin gate is enforced in the client only and is not securely
  protected; every admin operation must be authorized server-side in
  production.
- Public-facing pages are intentionally unchanged: homepage featured
  content, section ordering, announcements and the new collections will be
  consumed by the public pages when those are wired to the data layer in a
  later task.

## Season release & visibility

`seasons.js` is the single centralized season visibility system. Each
season (S1–S8) has an independent publication status — unreleased,
coming-soon, published, archived — and a season existing in the database
never makes it public: only published (or once-released, archived) seasons
are public. S1 ships published by default so existing content stays
visible; everything else ships unreleased.

- **Data-level protection** — chapters.js and cms.js register seasons.js'
  rule through `setVisibility`. Every public read (`published`,
  `publishedBySeason`, `get`, `list`) filters out unreleased-season content
  there, so chapters, characters and their seasonal portraits, locations,
  lore, gallery entries, and season-bound announcements can never reach a
  public page — including via direct URLs (`?id=…` returns nothing for
  non-public content). Admin pages read unfiltered via `opts.all` for
  private previews.
- **Portraits** — the seasonal fallback never crosses an unreleased
  season: a character viewed publicly shows the latest published season's
  portrait, then earlier published seasons, then the default portrait.
- **Automatic theme** — the public accent automatically follows the latest
  published season; the footer shows a read-only "Active season"
  indicator. Unreleased seasons never activate their accent publicly. The
  admin panel can preview any theme; the preview is session-scoped, applied
  only on admin pages, and never affects visitors.
- **Admin** — Season Management (`admin/seasons.html`) shows each season's
  status, publication date, accent, and chapter/character/entry counts,
  with publish-now, schedule (validated future date), change date, archive
  and theme preview controls. Scheduled seasons release automatically while
  the website is open — reliable release when nobody has it open requires
  the future server-side scheduler.

### Cinematic homepage hero (countdown & feature)

The homepage hero is chapter-aware, driven entirely by the existing
scheduling system (`chapters.js` `upcoming()`/`publishDue()` — real
scheduled ISO dates, timezone-safe, nothing hardcoded):

- Next scheduled chapter ≤7 days out → cinematic countdown hero replaces
  the normal hero: full-width cover, black gradient, "YENİ BÖLÜM YAKINDA"
  label, title, season/number, and a live GÜN : SAAT : DAKİKA : SANİYE
  countdown ticking every second. Under 24 hours the numerals switch to
  the season accent and scale up.
- >7 days out → normal hero plus a compact teaser strip with a smaller
  live countdown.
- At zero → the chapter publishes through the existing `publishDue()`
  mechanism, the countdown disappears, and the new chapter becomes the
  featured hero (cover, "YENİ BÖLÜM", "Okumaya Başla") for its first
  week; afterwards the normal hero returns.

Honest limit: as with the publishing system, the release flip at zero runs
only while the website is open in a browser — reliable publication without
a visitor requires the future server-side scheduler.

### Homepage chapter gallery & SON YAYINLANAN BÖLÜM

The homepage no longer lists chapter names as flat rows:

- **Chapter gallery** — every published chapter is a horizontal cover
  strip (several visible on desktop, horizontal scroll on mobile). Only
  the chapter code shows below each cover; the title is hidden normally
  and fades in over the cover on hover (desktop) or tap (mobile), with a
  glowing frame in the chapter's own season color and a slight scale-up.
  Tapping an unselected cover selects it on touch devices; tapping the
  selected cover opens the chapter page.
- **SON YAYINLANAN BÖLÜM** — a separate, prominent section featuring the
  newest published chapter (newest by publication date, NOT by chapter
  number): large cover, title, code, description and an "Okumaya Başla"
  button linking straight to the reading page. It re-renders
  automatically whenever a chapter publishes, and shows a proper empty
  state when nothing is published yet.

### Mobile system, search, notifications & page banners

- **Mobile navigation** — on ≤640px the header becomes a compact top bar
  (VOLMERRA logo, search, notifications, profile, menu; the theme toggle
  lives in the hamburger menu) and a fixed bottom navigation appears
  (Home / Story / Cast / Places / You, safe-area aware, active page
  highlighted). Desktop navigation is unchanged. The mobile menu holds
  the remaining pages plus Account / Account Settings / Sign out.
- **Your Account vs Account Settings** — `pages/account.html` shows the
  reader's avatar, name, email, an editable bio, reading statistics and
  library links; `pages/settings.html` holds display name, avatar,
  email, a working chapter-release notification preference, sign-out
  and clearly-labeled backend-required notes for password/email and
  privacy/security. Both are session-guarded. `auth.js` stores `bio`.
- **Page banners** — Admin → Page Banners uploads a wide banner per main
  page (story, characters, places, universe, gallery, about) with
  preview, remove, focus position and optional gradient; banners persist
  via the CMS settings and render above each page's hero via
  `data-banner` on the page body. Pages without a banner render nothing.
  The homepage countdown/feature hero system is separate and unaffected.
- **Search** — `search.js` adds an overlay opened from the navbar search
  buttons (desktop + mobile). It searches published chapters,
  characters, places, lore and the site's own pages, groups results by
  type and links to them. Unreleased content is filtered by the data
  layers themselves.
- **Notifications** — `notifications.js` keeps a per-account
  notification list in the existing storage. New chapter releases
  (auto-release flips and admin publishes) add entries for the signed-in
  reader who witnesses them on the site; the bell shows an unread badge
  and the panel supports mark-all-read. Real delivery to users who are
  offline requires the backend.
- **Mobile countdown** — on ≤640px the countdown hero restacks: cover on
  top (16:9, no overlay text), title and description below, four equal
  countdown boxes, and a full-width CTA. The real scheduled date and
  live ticker are untouched; desktop is unchanged.
- **Publish + cover fix** — uploaded images (covers, portraits,
  locations, gallery, banners) are downscaled through a canvas (max
  1600–2000px, JPEG) before storage. Large phone photos previously
  filled localStorage and made publishing fail with a quota error; the
  storage adapter now also reports quota failures with a clear message,
  the form shows a processing state and keeps entered data on failure.

### Continue Reading & Reading History

Both sections validate every library reference against the current
chapter collection before rendering: entries pointing at deleted,
unpublished or no-longer-accessible (unreleased season) chapters are
pruned from the stored library itself — valid progress is never reset.
Cards render from the live chapter records (current covers, titles and
codes), never from cached titles. Continue Reading shows the resumable
chapter (cover, title, code, progress bar, "Continue Reading" action);
Reading History is a chronological archive (covers, codes, last-read
dates, completed status) with no duplicate entries — re-reading a
chapter refreshes its last-read date. Empty states: "Your next
adventure awaits." and "Your reading journey will appear here."

**Persistence note (important):** `VolmerraLibrary.prune` treats any
truthy map value as valid — the earlier strict `=== true` check against
the chapter-object map silently deleted every library entry on each
homepage load (this was the root cause of "reading activity doesn't
stick" and "save/favorite state disappears"). Save, favorite, progress
and history all write through `VolmerraLibrary` to the same per-user
store and read back from it on every page — one source of truth. The
reading page records the chapter on open (history + Continue Reading),
saves scroll progress (≥5% steps), and its "Bitirdim" button marks the
chapter completed (100%, removed from Continue Reading, kept in History
with a "Completed" badge). Interactions on the chapter pages always bind
to the canonical chapter id from the data layer — including the
no-id fallback visits, which resolve to the latest published chapter.

## Next stages

1. Move chapter covers and CMS images from base64-in-JSONB to Supabase
   Storage buckets (larger images, cacheable URLs).
2. Real-time comment updates (Supabase Realtime) and comment moderation
   actions for administrators.
3. Notifications on new chapter releases delivered to offline users
   (server-side scheduling + email/push).
