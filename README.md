# Waiting for Paws 🐾

Website, client portal and admin portal for **Waiting for Paws**, a dog walking business in
Ocean Beach, San Diego ([@waitingforpaws](https://www.instagram.com/waitingforpaws/)).

- **Public website**: pages are built from sections the owner can add, reorder, hide and edit.
- **Client portal** (`/portal`): clients sign up, add their pups (with photos), fill out the intake
  form, book through Calendly and pay with Stripe.
- **Admin portal** (`/admin`): edit every page, photo, price, color and intake question without
  code, and manage clients, bookings, messages and payments.

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS 4, Supabase (Postgres, Auth,
Storage), Stripe Checkout and Calendly.

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

The admin can change all six in **Admin → Settings & colors**. Every lighter or darker shade is
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

### 4. Calendly (booking)

- Paste your Calendly link in **Admin → Settings → Booking**. The scheduler is embedded on the
  `/book` page and in the client portal, pre-filled with the client's name and email. Each service
  can also have its own Calendly event link.
- Optional: to sync bookings into the portals, create a Calendly webhook subscription (paid
  Calendly plans) for `invitee.created` and `invitee.canceled` pointing at
  `https://YOUR-DOMAIN/api/webhooks/calendly`, and set `CALENDLY_WEBHOOK_SIGNING_KEY`.

### 5. Stripe (payments)

1. Set `STRIPE_SECRET_KEY` (start with a `sk_test_` key).
2. Add a webhook endpoint for `checkout.session.completed` at
   `https://YOUR-DOMAIN/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET`.
3. Turn on **Clients can pay online** for a service in **Admin → Services**.

Clients then see a **Pay** button in **Portal → Payments**. Checkout is hosted by Stripe and the
amount always comes from the service's price in the database.

**Admin → Integrations** shows the status of each connection and the webhook URLs to copy.

## How the no-code editing works

| What                       | Where it lives                                            |
| -------------------------- | --------------------------------------------------------- |
| Business info, colors, SEO | `site_settings` (one JSON row)                            |
| Pages                      | `pages`, served at `/<slug>` (home is `/`)                |
| Page content               | `sections`: ordered blocks with a `type` and JSON `data`  |
| Services & prices          | `services`                                                |
| Gallery                    | `gallery_photos` + Supabase Storage (`media/gallery/…`)   |
| Intake form questions      | `forms` (JSON field list); answers in `form_submissions`  |

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
  api/webhooks/      Stripe and Calendly webhooks
  auth/              email link callback, sign out
components/
  sections/          public renderers, one per section type
  admin/             page builder, schema-driven forms, gallery, form builder
  portal/            client portal forms
lib/
  content.ts         cached reads of public content (with starter-content fallback)
  defaults.ts        starter copy, services and intake form
  sections.ts        section types and their editable fields
  auth.ts            current user / requireUser / requireAdmin
supabase/migrations/ database schema, RLS and storage policies
proxy.ts             refreshes Supabase sessions and guards /portal and /admin
```

## Security notes

- Row-level security does the enforcing. Clients can only read and write their own profile, pups,
  intake answers, bookings and payments. Only admins can edit site content or see other clients.
  A database trigger stops anyone but an admin from changing a role.
- Clients can only upload photos into `media/pets/<their user id>/`. Only admins can upload site
  photos.
- Admin text is rendered as plain text (paragraphs and bullet lists only, never HTML), and links
  are limited to relative paths, `http(s)`, `mailto:` and `tel:`.
- Theme colors are validated as hex before they are written into CSS.
