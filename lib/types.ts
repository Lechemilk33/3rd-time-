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
};

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
  role: "client" | "admin";
  /** An admin approved this client for regular visits. */
  booking_approved: boolean;
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
  service_date: string;
  window_id: string | null;
  /** "HH:MM:SS" local time an admin pinned, if any. */
  arrival_time: string | null;
  duration_minutes: number;
  walker_id: string | null;
  series_id: string | null;
  /** Visit notes from the team (the client can see these). */
  notes: string | null;
  /** What the client wrote when booking. */
  client_note: string | null;
  cancel_reason: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
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
