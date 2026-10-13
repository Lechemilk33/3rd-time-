export type ThemeColors = {
  sea: string;
  ocean: string;
  ink: string;
  sun: string;
  sand: string;
  coral: string;
};

export type SiteSettings = {
  businessName: string;
  tagline: string;
  logoUrl: string;
  phone: string;
  email: string;
  instagramUrl: string;
  serviceAreaSummary: string;
  hours: string;
  headerCtaLabel: string;
  headerCtaHref: string;
  footerBlurb: string;
  announcement: {
    enabled: boolean;
    text: string;
    href: string;
  };
  seo: {
    title: string;
    description: string;
    imageUrl: string;
    /** Google Search Console "HTML tag" verification code. */
    googleVerification?: string;
    /** Bing Webmaster Tools "meta tag" verification code. */
    bingVerification?: string;
  };
  theme: ThemeColors;
};

export type Page = {
  id: string;
  slug: string;
  title: string;
  nav_label: string | null;
  show_in_nav: boolean;
  published: boolean;
  position: number;
  seo_description: string | null;
};

export type SectionData = Record<string, unknown>;

export type Section = {
  id: string;
  page_id: string;
  type: string;
  position: number;
  visible: boolean;
  data: SectionData;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  price_label: string | null;
  duration_minutes: number | null;
  image_url: string | null;
  booking_url: string | null;
  active: boolean;
  allow_online_payment: boolean;
  position: number;
  /** Clients can book it from the portal. */
  bookable: boolean;
  /** everyone = any client (meet & greet); approved = clients an admin approved. */
  audience: "everyone" | "approved";
  /** instant = booked right away; request = an admin confirms it. */
  confirmation: "instant" | "request";
  max_pets: number;
  /** How it's booked: a visit in a time window, a set-time appointment, a full day or an overnight stay. */
  kind: ServiceKind;
  /** What the price is per. */
  price_unit: PriceUnit;
  /** Full-day / overnight services: how many can be booked per day (per night). Null = no limit. */
  daily_capacity: number | null;
  /** Full-day / overnight services: drop-off / check-in and pick-up / check-out (minutes after midnight). */
  start_minute: number | null;
  end_minute: number | null;
  /** Overnight services: allowed stay length. */
  min_nights: number;
  max_nights: number;
  /** Lengths clients pick from (a 30- or 60-minute walk), each with its own price. Empty = always duration_minutes. */
  duration_options: DurationOption[];
  /** How the pup gets to us: picked up from home and/or brought by the client. Empty = it happens at home. */
  handoff_options: Handoff[];
  /** Extra per booking when we pick the pup up. */
  pickup_fee_cents: number | null;
  /** Where/when clients bring their pup, shown when they choose that. */
  bring_details: string | null;
  /** Group visit: other dogs can be out with the walker at the same time (walks, park trips). */
  shared: boolean;
};

export type ServiceKind = "window" | "time" | "day" | "stay";
export type DurationOption = { minutes: number; price_cents: number | null };
/** pickup = we collect the pup from home; bring = the client drops their pup off. */
export type Handoff = "pickup" | "bring";
export type PriceUnit = "visit" | "hour" | "day" | "night" | "flat";

export type GalleryPhoto = {
  id: string;
  image_url: string;
  storage_path: string | null;
  caption: string | null;
  position: number;
  visible: boolean;
};

export type FormFieldType =
  | "heading"
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkboxes"
  | "yesno"
  | "agreement";

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  /** Only ask clients who signed up for one of these services (service ids). Empty = everyone. */
  services?: string[];
  /** once = on the intake form (default); each = every time one of `services` is booked. */
  ask?: "once" | "each";
  /** Adds an optional notes box under the answer ("Tell us more"), saved as `<id>__details`. */
  details?: boolean;
};

export type FormDefinition = {
  slug: string;
  title: string;
  description: string | null;
  fields: FormField[];
};

export type FormAnswers = Record<string, string | string[] | boolean>;

export type SubmissionStatus = "submitted" | "reviewed" | "approved";

export type FormSubmission = {
  id: string;
  form_slug: string;
  user_id: string;
  answers: FormAnswers;
  /** Services the client signed up for. */
  service_ids: string[];
  status: SubmissionStatus;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  access_notes: string | null;
  /** May we take their pup to a vet if we can't reach anyone? Null until asked. */
  vet_care_ok: boolean | null;
  role: "client" | "admin";
  /** An admin approved this client for regular visits. */
  booking_approved: boolean;
  /** Version of the Terms of Service / Privacy Policy they agreed to, and when. */
  terms_version: string | null;
  terms_accepted_at: string | null;
  /** How they first found the site (flyer, google, instagram…). */
  source: string | null;
  /** When we emailed them asking for a Google review (once). */
  review_requested_at: string | null;
  created_at: string;
};

export type Pet = {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  sex: string | null;
  birthday: string | null;
  weight_lbs: number | null;
  spayed_neutered: boolean | null;
  photo_url: string | null;
  temperament: string | null;
  walking_notes: string | null;
  medical_notes: string | null;
  medications: string | null;
  feeding_notes: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  /** Vaccine records, as checked by the team (see lib/records.ts). */
  rabies_until: string | null;
  distemper_until: string | null;
  bordetella_until: string | null;
  records_checked_at: string | null;
  records_note: string | null;
  created_at: string;
};

export type BookingStatus = "requested" | "scheduled" | "completed" | "canceled" | "declined";

export type Booking = {
  id: string;
  user_id: string | null;
  service_id: string | null;
  title: string;
  start_time: string;
  end_time: string | null;
  status: BookingStatus;
  source: "portal" | "manual";
  kind: ServiceKind;
  service_date: string;
  /** Last day (check-out day for stays). Same as service_date for single-day visits. */
  end_date: string;
  window_id: string | null;
  /** "HH:MM:SS" local time an admin pinned, if any. */
  arrival_time: string | null;
  /** Window visits: where the scheduler fit the visit into the walker's hours (minutes after midnight). */
  planned_minute: number | null;
  duration_minutes: number;
  walker_id: string | null;
  series_id: string | null;
  /** Visit notes from the team (the client can see these). */
  notes: string | null;
  /** What the client wrote when booking. */
  client_note: string | null;
  /** Answers to the service's "every booking" questions. */
  answers: FormAnswers;
  /** How the pup gets to us, for services that ask. */
  handoff: Handoff | null;
  cancel_reason: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  /** Paid online (card) or marked paid by the team (cash/other). See lib/payments.ts. */
  paid_at: string | null;
  paid_cents: number | null;
  paid_via: "card" | "cash" | "other" | null;
  payment_id: string | null;
  refunded_cents: number;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  user_id: string | null;
  service_id: string | null;
  description: string | null;
  amount_cents: number;
  currency: string;
  quantity: number;
  status: string;
  customer_email: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  /** Visits this payment covered. */
  booking_ids: string[];
  refunded_cents: number;
  created_at: string;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  handled: boolean;
  created_at: string;
};

export type ActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};
