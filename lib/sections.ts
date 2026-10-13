import type { SectionData } from "@/lib/types";

/**
 * Every section type the page builder knows about. The admin editor renders a
 * form from `fields`, and components/sections renders the public version.
 * To add a new block: add an entry here and a renderer in components/sections.
 */

type BaseField = { key: string; label: string; help?: string; placeholder?: string };

export type FieldDef =
  | (BaseField & {
      type: "text" | "textarea" | "url" | "image" | "images" | "number" | "boolean" | "color" | "strings";
    })
  | (BaseField & { type: "select"; options: { value: string; label: string }[] })
  | (BaseField & { type: "list"; itemLabel: string; fields: FieldDef[] })
  | (BaseField & { type: "group"; fields: FieldDef[] });

export type SectionTypeDef = {
  type: string;
  label: string;
  description: string;
  icon: string;
  fields: FieldDef[];
  defaults: SectionData;
};

export const BACKGROUNDS = [
  { value: "white", label: "White" },
  { value: "sand", label: "Sand" },
  { value: "sea", label: "Light blue" },
];

const background: FieldDef = {
  key: "background",
  label: "Background",
  type: "select",
  options: BACKGROUNDS,
};

const eyebrow: FieldDef = {
  key: "eyebrow",
  label: "Small label above heading",
  type: "text",
  placeholder: "e.g. Ocean Beach, San Diego",
};

const heading: FieldDef = { key: "heading", label: "Heading", type: "text" };

const intro: FieldDef = {
  key: "intro",
  label: "Intro text",
  type: "textarea",
  help: "Leave a blank line between paragraphs. Start a line with “- ” for a bullet.",
};

export const DEFAULT_BOOKING_STEPS = [
  { title: "Create your free account", body: "Add your pup’s info and tell us about your routine." },
  { title: "Book a meet & greet", body: "Pick a time that works — we’ll meet you nearby and learn the ropes." },
  { title: "Book walks anytime", body: "Choose a day and time window, or set up weekly walks. Change plans right from your portal." },
];

export const SECTION_TYPES: SectionTypeDef[] = [
  {
    type: "hero",
    label: "Hero banner",
    description: "Big welcome at the top of a page with a photo and buttons.",
    icon: "🌅",
    fields: [
      eyebrow,
      heading,
      { key: "subheading", label: "Subheading", type: "textarea" },
      {
        key: "images",
        label: "Photos",
        type: "images",
        placeholder: "Pup’s name (optional)",
        help: "Add as many as you like; they fade from one to the next. The first one shows first, the rest in a shuffled order. Add the pup’s name and it shows on the card beside the photo. Leave empty for the beach illustration.",
      },
      {
        key: "seconds",
        label: "Switch photos every",
        type: "select",
        options: [
          { value: "4", label: "4 seconds" },
          { value: "5", label: "5 seconds" },
          { value: "7", label: "7 seconds" },
          { value: "10", label: "10 seconds" },
        ],
      },
      { key: "primaryLabel", label: "Main button text", type: "text" },
      { key: "primaryHref", label: "Main button link", type: "url", placeholder: "/book" },
      { key: "secondaryLabel", label: "Second button text", type: "text" },
      { key: "secondaryHref", label: "Second button link", type: "url", placeholder: "/services" },
      {
        key: "badges",
        label: "Highlights",
        type: "strings",
        help: "One per line. Shown as little checkmarks under the buttons.",
      },
    ],
    defaults: {
      eyebrow: "Ocean Beach, San Diego",
      heading: "Your pup’s favorite part of the day",
      subheading: "Friendly, reliable dog walks and visits around OB.",
      images: [],
      seconds: "5",
      primaryLabel: "Book a walk",
      primaryHref: "/book",
      secondaryLabel: "See services",
      secondaryHref: "/services",
      badges: [],
    },
  },
  {
    type: "page_header",
    label: "Page title",
    description: "A simple title and intro for the top of an inner page.",
    icon: "🏷️",
    fields: [eyebrow, heading, intro, background],
    defaults: { eyebrow: "", heading: "Page title", intro: "", background: "sea" },
  },
  {
    type: "document",
    label: "Long text (policies)",
    description: "A readable column of text with headings, for terms, policies and FAQs-style pages.",
    icon: "📄",
    fields: [
      { key: "updated", label: "Date line", type: "text", placeholder: "Last updated October 13, 2026" },
      {
        key: "body",
        label: "Text",
        type: "textarea",
        help: "Start a line with “## ” for a heading and “- ” for a bullet. {business}, {email} and {cancel_hours} fill in your business name, email and cancellation window.",
      },
      background,
    ],
    defaults: { updated: "", body: "", background: "white" },
  },
  {
    type: "features",
    label: "Highlights grid",
    description: "Icon cards for reasons to choose you, how it works, etc.",
    icon: "✨",
    fields: [
      eyebrow,
      heading,
      intro,
      {
        key: "items",
        label: "Cards",
        type: "list",
        itemLabel: "card",
        fields: [
          { key: "icon", label: "Emoji", type: "text", placeholder: "🐾" },
          { key: "title", label: "Title", type: "text" },
          { key: "body", label: "Text", type: "textarea" },
        ],
      },
      background,
    ],
    defaults: {
      eyebrow: "",
      heading: "Why pups love us",
      intro: "",
      items: [{ icon: "🐾", title: "Highlight", body: "Tell visitors something great." }],
      background: "white",
    },
  },
  {
    type: "services",
    label: "Services & prices",
    description: "Shows the services you manage under Admin → Services.",
    icon: "🦮",
    fields: [
      eyebrow,
      heading,
      intro,
      { key: "showBookButton", label: "Show “Book” buttons", type: "boolean" },
      background,
    ],
    defaults: {
      eyebrow: "Services",
      heading: "Walks & visits",
      intro: "",
      showBookButton: true,
      background: "white",
    },
  },
  {
    type: "text_image",
    label: "Text + photo",
    description: "A story block with a photo on one side.",
    icon: "📝",
    fields: [
      eyebrow,
      heading,
      {
        key: "body",
        label: "Text",
        type: "textarea",
        help: "Leave a blank line between paragraphs. Start a line with “- ” for a bullet.",
      },
      { key: "image", label: "Photo", type: "image" },
      {
        key: "imageSide",
        label: "Photo side",
        type: "select",
        options: [
          { value: "right", label: "Right" },
          { value: "left", label: "Left" },
        ],
      },
      { key: "buttonLabel", label: "Button text", type: "text" },
      { key: "buttonHref", label: "Button link", type: "url" },
      background,
    ],
    defaults: {
      eyebrow: "",
      heading: "Heading",
      body: "",
      image: "",
      imageSide: "right",
      buttonLabel: "",
      buttonHref: "",
      background: "white",
    },
  },
  {
    type: "gallery",
    label: "Photo gallery",
    description: "Shows photos from Admin → Gallery.",
    icon: "📸",
    fields: [
      eyebrow,
      heading,
      intro,
      { key: "limit", label: "How many photos (0 = all)", type: "number" },
      { key: "buttonLabel", label: "Button text", type: "text" },
      { key: "buttonHref", label: "Button link", type: "url" },
      background,
    ],
    defaults: {
      eyebrow: "Gallery",
      heading: "Happy tails",
      intro: "",
      limit: 0,
      buttonLabel: "",
      buttonHref: "",
      background: "white",
    },
  },
  {
    type: "instagram_feed",
    label: "Instagram feed",
    description: "Your latest Instagram posts, with a Follow button.",
    icon: "📷",
    fields: [
      eyebrow,
      heading,
      intro,
      {
        key: "limit",
        label: "How many posts",
        type: "select",
        options: [
          { value: "4", label: "4 (one row)" },
          { value: "6", label: "6" },
          { value: "8", label: "8 (two rows)" },
          { value: "12", label: "12" },
        ],
        help: "Posts come from the account connected in Admin → Integrations. Until then, visitors see a “Follow us” card.",
      },
      {
        key: "buttonLabel",
        label: "Button text",
        type: "text",
        placeholder: "Follow @waitingforpaws",
        help: "Leave empty to use your Instagram handle.",
      },
      background,
    ],
    defaults: {
      eyebrow: "On Instagram",
      heading: "Fresh from our walks",
      intro: "",
      limit: "8",
      buttonLabel: "",
      background: "white",
    },
  },
  {
    type: "service_area",
    label: "Service area",
    description: "Neighborhoods you cover, shown as tags.",
    icon: "📍",
    fields: [
      eyebrow,
      heading,
      { key: "body", label: "Text", type: "textarea" },
      { key: "areas", label: "Neighborhoods", type: "strings", help: "One per line." },
      background,
    ],
    defaults: {
      eyebrow: "Where we walk",
      heading: "Service area",
      body: "",
      areas: ["Ocean Beach"],
      background: "sea",
    },
  },
  {
    type: "testimonials",
    label: "Reviews",
    description: "Quotes from happy pup parents.",
    icon: "💬",
    fields: [
      eyebrow,
      heading,
      {
        key: "items",
        label: "Reviews",
        type: "list",
        itemLabel: "review",
        fields: [
          { key: "quote", label: "Quote", type: "textarea" },
          { key: "name", label: "Name", type: "text" },
          { key: "pup", label: "Pup", type: "text", placeholder: "e.g. Luna, golden retriever" },
        ],
      },
      background,
    ],
    defaults: {
      eyebrow: "Kind words",
      heading: "What pup parents say",
      items: [],
      background: "sand",
    },
  },
  {
    type: "faq",
    label: "FAQ",
    description: "Questions and answers that open on tap.",
    icon: "❓",
    fields: [
      eyebrow,
      heading,
      {
        key: "items",
        label: "Questions",
        type: "list",
        itemLabel: "question",
        fields: [
          { key: "question", label: "Question", type: "text" },
          { key: "answer", label: "Answer", type: "textarea" },
        ],
      },
      background,
    ],
    defaults: {
      eyebrow: "FAQ",
      heading: "Good questions",
      items: [{ question: "Question?", answer: "Answer." }],
      background: "white",
    },
  },
  {
    type: "cta",
    label: "Call to action",
    description: "A bold colored band that sends visitors somewhere.",
    icon: "📣",
    fields: [
      heading,
      { key: "body", label: "Text", type: "textarea" },
      { key: "buttonLabel", label: "Button text", type: "text" },
      { key: "buttonHref", label: "Button link", type: "url" },
      { key: "secondaryLabel", label: "Second button text", type: "text" },
      { key: "secondaryHref", label: "Second button link", type: "url" },
      {
        key: "style",
        label: "Color",
        type: "select",
        options: [
          { value: "ocean", label: "Ocean blue" },
          { value: "sun", label: "Sunshine yellow" },
          { value: "sea", label: "Light blue" },
        ],
      },
    ],
    defaults: {
      heading: "Ready for a walk?",
      body: "",
      buttonLabel: "Book now",
      buttonHref: "/book",
      secondaryLabel: "",
      secondaryHref: "",
      style: "ocean",
    },
  },
  {
    type: "booking",
    label: "Online booking",
    description: "How booking works, with buttons to sign up or log in and book.",
    icon: "📅",
    fields: [
      eyebrow,
      heading,
      intro,
      {
        key: "steps",
        label: "Steps",
        type: "list",
        itemLabel: "step",
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "body", label: "Text", type: "textarea" },
        ],
      },
      { key: "buttonLabel", label: "Button text", type: "text", placeholder: "Book now" },
      background,
    ],
    defaults: {
      eyebrow: "Booking",
      heading: "Booking is easy",
      intro: "",
      steps: DEFAULT_BOOKING_STEPS,
      buttonLabel: "Get started",
      background: "white",
    },
  },
  {
    type: "contact",
    label: "Contact",
    description: "Your contact details and a message form.",
    icon: "✉️",
    fields: [
      eyebrow,
      heading,
      intro,
      { key: "showForm", label: "Show message form", type: "boolean" },
      background,
    ],
    defaults: {
      eyebrow: "Say hi",
      heading: "Get in touch",
      intro: "",
      showForm: true,
      background: "white",
    },
  },
];

export const SECTION_TYPE_MAP: Record<string, SectionTypeDef> = Object.fromEntries(
  SECTION_TYPES.map((def) => [def.type, def]),
);
