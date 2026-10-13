# Waiting for Paws 🐾

Website, client portal and admin portal for **Waiting for Paws**, a dog walking business in
Ocean Beach, San Diego ([@waitingforpaws](https://www.instagram.com/waitingforpaws/)).

- **Public website**: pages are built from sections the owner can add, reorder, hide and edit.
- **Client portal** (`/portal`): clients sign up, add their pups (with photos and vaccine
  records), book a meet & greet, then walks, appointments, full days or overnight stays (one-off or
  weekly), reschedule or cancel, and pay with Stripe.
- **Admin portal** (`/admin`): a live team calendar (day, week, month and agenda views with hover
  cards and drag-and-drop), booking for any client with search by pup, owner, phone or address,
  walkers’ availability and time off, plus editing every page, photo, price, color and intake
  question without code.

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS 4, Supabase (Postgres, Auth,
Storage, Realtime, pg_cron, pg_net), Resend and Stripe Checkout.

## Brand colors

Dogs are dichromats: they see blues and yellows well, while reds and greens look muddy to them.
The palette leans into that, and into Ocean Beach itself.

| Token   | Default   | Used for                                           |
| ------- | --------- | -------------------------------------------------- |
| `sea`   | `#8ECDF0` | Light blue: backgrounds, highlights (main color)   |
| `ocean` | `#1A6FA0` | Links and secondary buttons (AA contrast on white) |
| `ink`   | `#0F2B3F` | Headings, body text, footer                        |
| `sun`   | `#FFC845` | Tennis-ball yellow: main call-to-action buttons    |
| `sand`  | `#FFF7EA` | Warm section backgrounds                           |
| `coral` | `#FF8A65` | Small sunset accents                               |

The admin can change all six in **Admin → Website → Site settings**. Every lighter or darker shade is
derived from them with `color-mix()` in `app/globals.css`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev
```

The site runs without any environment variables and shows the built-in starter content, so you
can preview the design before connecting anything. Logins need Supabase.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (the free plan is fine).
2. Run the SQL files in `supabase/migrations/` in order, using the SQL editor or `supabase db push`.
   They create the tables, row-level security policies and the public `media` storage bucket.
3. Under **Authentication → URL Configuration**, set the **Site URL** to your live domain and
   add `https://YOUR-DOMAIN/auth/callback` (plus `http://localhost:3000/auth/callback` for local
   development) to **Redirect URLs**.
4. Email: Supabase's built-in email sender only delivers to your own team's addresses and is heavily
   rate limited. Before clients sign up, either connect a real SMTP provider (Resend, Postmark, …)
   under **Authentication → Emails → SMTP**, or turn off **Confirm email** so new accounts log in
   right away.
5. Copy the project URL, publishable key and secret key into your environment variables.

### 2. Become the admin

Set `ADMIN_EMAILS` to the owner's email (comma-separate several) together with
`SUPABASE_SECRET_KEY`, sign up on the site, and you're promoted the first time you log in.
Alternatively, after signing up, run this in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Then open `/admin` and click **Load starter content**. That copies the starter pages, services and
intake form into the database, and from then on everything is editable.

### 3. Deploy on Vercel

Import the repo into Vercel and add the environment variables from `.env.example`. No other
configuration is needed.

### 4. Booking

Booking is built in — no third-party scheduler.

- **Service types:** in **Admin → Services** each service picks how it’s booked:

  | Type                   | Clients pick                                   | Capacity                              |
  | ---------------------- | ---------------------------------------------- | ------------------------------------- |
  | Visit in a time window | a day and a window (e.g. Midday, 11 AM – 2 PM) | walkers’ visits per window            |
  | Set-time appointment   | a day and an exact start time (every 30 min)   | a walker free for the whole length    |
  | Full day               | one or more days (drop-off / pick-up times)    | spots per day (blank = no limit)      |
  | Overnight stay         | check-in and check-out dates (min/max nights)  | spots per night (check-out day free)  |

  Prices can be per visit, hour, day, night or flat, and the booking summary estimates the total.
- **How clients book:** pick a service, their pup(s), then the dates and times for that type;
  window visits and appointments can repeat weekly. New clients can only book services marked
  “Anyone with an account” (the Meet & Greet); everything else unlocks once an admin approves them
  (toggle on the client’s profile, or approve their answers). The overview lists clients whose
  meet & greet has happened and are ready to approve.
- **Onboarding asks only what the next step needs.** Sign-up is name, email and password. New
  clients see two steps: add their pup (only the name is required) and book the meet & greet,
  which asks for their phone and address if we don’t have them. The first time they book a visit
  we make without them, the booking flow asks how to get in, an emergency contact and whether we
  may take their pup to a vet, and saves them to their profile (`lib/client-details.ts`). Service
  questions come up the first time that service is booked.
- **Vaccine records:** clients add a photo or PDF of their pup’s shot records when they add the
  pup or later (camera on phones, drag and drop on computers). It’s optional and never blocks
  booking. Files are stored in the private `pet-records` bucket, which only the client and admins
  can open. On the client’s admin page the team opens the files, enters how long rabies, DHPP and
  Bordetella are good for, and marks them checked. Clients get one reminder email a few weeks
  before a checked shot runs out, and see a nudge in the portal. Rabies is required by California
  law for dogs over 4 months; DHPP and Bordetella are what dog walkers usually ask for, especially
  for group walks. Approving a client without them is the team’s call.
- **Hours:** in **Admin → Schedule** each walker draws the hours they work on a weekly calendar
  (drag to add, drag to move or resize, click to edit) and sets how many dogs they can have out at
  once in each block, e.g. 4 for a Saturday park run. A block can be limited to certain services.
  Services marked **Group visit** (walks, park trips) share the walker's time up to that limit;
  everything else (drop-ins, meet & greets) gets the walker to themselves. A family's dogs always
  go together. Arrival-window visits are slotted at the earliest spot that fits
  (`bookings.planned_minute`), so the calendar shows real load and clients still see their window.
  Days off block dates for one walker or everyone. Bookings are checked and assigned atomically in
  the database (`book_visits`), so two people can never take the last spot. Clients keep the
  walker they know when possible.
- **Calendar:** **Admin → Calendar** shows every booking color-coded by walker. Full days and
  stays sit in an all-day lane (bars across the week, or across the month) and in the agenda as
  check-in / night N / check-out. Hover for details, click for the full card (client, pups,
  access notes, booking answers, actions), drag to pin an exact time, move days (stays keep their
  length) or reassign walkers (Day view), click an empty slot to book. Updates live via Supabase
  Realtime. Each admin can subscribe to a private iCal feed (`/api/calendar/<token>`) from
  Google or Apple Calendar.
- **Services** are booked in a time window, at a set time, for a full day or overnight. A service
  can let clients pick how long (e.g. a 30- or 60-minute walk, each with its own price) and how the
  pup gets there (picked up from home, with an optional fee, or dropped off). Intake questions can
  carry an optional “Tell us more” notes box.
- **Emails** (confirmations, requests, changes, cancellations, evening-before reminders, each
  walker’s next-day schedule, “you’re approved” for new clients, and a heads-up when a request
  expires unconfirmed) are sent from the database with Resend through `pg_net`, so they go
  out no matter where a change comes from. Store a sending-only Resend key in Supabase Vault:

  ```sql
  select vault.create_secret('re_…', 'resend_api_key', 'Resend key for booking emails');
  ```

  Reminders run from a `pg_cron` job every hour. Use **Send a test** in Schedule to
  check delivery.
- **Search & tracking:** `/robots.txt` and `/sitemap.xml` are generated; the home page carries
  schema.org `LocalBusiness` data (service areas from the home page's Service area section,
  services and prices, logo, Instagram); every page has a canonical URL. Paste the Google Search
  Console "HTML tag" code in Admin → Site settings → Search & sharing. Visits are counted with Vercel
  Web Analytics (cookie-free; turn it on in the Vercel project's Analytics tab). The first time
  someone visits, their browser remembers where they came from (`?src=flyer` on QR codes, or the
  referring site such as Google or Instagram) and sign-up saves it as `profiles.source`; the admin
  overview shows how new clients found you.
- **Growing traffic:** neighborhood pages (`/dog-walking-ocean-beach`, `-point-loma`,
  `-mission-beach`, `-pacific-beach`) and local guides (`/san-diego-dog-beach-guide`,
  `/hot-weather-dog-walking-san-diego`) ship as built-in pages from `lib/local-pages.ts`, each with
  its own content, FAQ and structured data, linked from the footer and the Service area chips; edit
  them in Admin → Pages. Long text supports `[label](/page)` links. Add the Google review link in
  Admin → Schedule → Booking rules: every client then gets one review request the morning after
  their second finished visit, and the site footer and client portal show a review button.
  Approved clients get a personal invite link in the portal (`?src=friend-…`); sign-ups through it
  show "Referred by …" on their admin page.
- **Terms & privacy:** `/terms` and `/privacy` ship with plain-English starting text
  (`lib/legal.ts`) and are linked from the footer, sign-up, booking and payments. The cancellation
  window in the terms is filled in live from Admin → Schedule. Edit either page in Admin → Pages.
  New clients tick “I agree” when they sign up; existing clients are asked once in the portal. Each
  profile records the version and date they agreed to (shown on the client's admin page). Bump
  `TERMS_VERSION` after a meaningful change to ask everyone again.
- **Booking questions:** in **Admin → Booking questions** each service has its own tab. A
  service’s questions are asked either **once** (the first time the client books it) or **every
  time they book** it (saved on that booking, e.g. “Feeding schedule for this stay”). “Everyone”
  questions come up before a client’s first regular visit, never at sign-up. Clients only answer
  what applies to them.

### 5. Stripe (payments)

1. Set `STRIPE_SECRET_KEY` (start with a `sk_test_` key).
2. Add a webhook endpoint for `checkout.session.completed` at
   `https://YOUR-DOMAIN/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET`.
3. Turn on **Clients can pay online** for a service in **Admin → Services**.

Clients then see a **Pay** button in **Portal → Payments**. Checkout is hosted by Stripe and the
amount always comes from the service's price in the database.

### 6. Instagram feed (optional)

The home page has an **Instagram feed** section (also in the page editor) that shows the latest
posts from the business account through Instagram’s official API (Instagram API with Instagram
Login, free, for business or creator accounts). Until it’s connected, it shows a “Follow
@waitingforpaws” card instead.

1. Run `supabase/migrations/20261013100000_instagram_feed.sql` and set `SUPABASE_SECRET_KEY`.
2. Create an app at [developers.facebook.com](https://developers.facebook.com/apps) with the use
   case “Manage messaging & content on Instagram”. Under **Instagram → API setup with Instagram
   login**, copy the Instagram app ID and secret into `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`,
   and add `https://YOUR-DOMAIN/api/instagram/callback` as a redirect URL for business login.
3. Under **App roles → Roles**, add the Instagram account as an *Instagram Tester* and accept the
   invite in Instagram (Settings → Apps and websites → Tester invites).
4. The owner clicks **Connect Instagram** in **Admin → Integrations**.

The token is stored in Supabase Vault (only the server can read it) and renewed every few days, so
it never hits its 60-day expiry. Posts are cached for an hour and never stored, because Instagram’s
image links expire. To skip the app ID and secret, generate a token in the Meta dashboard
(Generate access tokens → Add account) and paste it into the same Integrations card instead.

**Admin → Integrations** shows the status of each connection and the webhook URLs to copy.

## How the no-code editing works

| What                       | Where it lives                                            |
| -------------------------- | --------------------------------------------------------- |
| Business info, colors, SEO | `site_settings` (one JSON row)                            |
| Pages                      | `pages`, served at `/<slug>` (home is `/`)                |
| Page content               | `sections`: ordered blocks with a `type` and JSON `data`  |
| Services & prices          | `services`                                                |
| Gallery                    | `gallery_photos` + Supabase Storage (`media/gallery/…`)   |
| Instagram connection       | `private.instagram_account` + Vault (token, server only)  |
| Intake form questions      | `forms` (JSON field list); answers in `form_submissions`  |
| Booking rules & windows    | `booking_settings`, `booking_windows`                     |
| Walkers & hours            | `walkers`, `walker_hours`, `time_off`                     |
| Visits                     | `bookings` + `booking_pets`                               |

Public pages are cached with `"use cache"` and tagged `site-content`. Every admin save calls
`updateTag("site-content")`, so changes show up on the live site immediately. Photos are resized
to WebP in the browser before they're uploaded.

### Adding a new section type

1. Describe its fields in `lib/sections.ts`. The admin editor builds its form from that list.
2. Add a renderer in `components/sections/` and register it in `components/sections/index.tsx`.

## Project layout

```
app/
  (site)/            public website: home + /[slug] pages built from sections
  (auth)/            login, signup, forgot password
  portal/            client portal
  admin/             admin portal (+ _actions/ server actions)
  api/webhooks/      Stripe webhook
  api/calendar/      private iCal feeds for admins
  auth/              email link callback, sign out
components/
  sections/          public renderers, one per section type
  admin/             page builder, schema-driven forms, gallery, form builder, schedule
  booking/           booking wizard, day/time/stay pickers, client & pup search
  calendar/          admin calendar (time grid, month, agenda, hover card, drawer)
  portal/            client portal forms and visit list
lib/
  content.ts         cached reads of public content (with starter-content fallback)
  defaults.ts        starter copy, services and intake form
  sections.ts        section types and their editable fields
  booking.ts         booking types and helpers (dates in lib/dates.ts)
  intake.ts          which intake questions apply to which services
  auth.ts            current user / requireUser / requireAdmin
supabase/migrations/ database schema, RLS and storage policies
proxy.ts             refreshes Supabase sessions and guards /portal and /admin
```

## Security notes

- Row-level security does the enforcing. Clients can only read and write their own profile, pups,
  intake answers, bookings and payments. Only admins can edit site content or see other clients.
  A database trigger stops anyone but an admin from changing a role.
- Clients can only upload photos into `media/pets/<their user id>/`. Only admins can upload site
  photos. Vaccine records go in the private `pet-records/<their user id>/` folder, open only to
  them and admins through links that expire after an hour. Only admins can mark records checked
  (enforced by a trigger).
- Clients can’t write bookings directly; every booking change goes through security-definer
  functions that check ownership, approval, notice and cancellation cutoffs, and capacity.
  Approval and intake review status can only be changed by admins (enforced by triggers).
- Admin text is rendered as plain text (paragraphs and bullet lists only, never HTML), and links
  are limited to relative paths, `http(s)`, `mailto:` and `tel:`.
- Theme colors are validated as hex before they are written into CSS.
