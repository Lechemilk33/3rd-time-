import type { SectionData } from "@/lib/types";

/**
 * Every section type the page builder knows about. The admin editor renders a
 * form from `fields`, and components/sections renders the public version.
 * To add a new block: add an entry here and a renderer in components/sections.
 */

type BaseField = { key: string; label: string; help?: string; placeholder?: string };

export type FieldDef =
  | (BaseField & {
      type: "text" | "textarea" | "url" | "image" | "number" | "boolean" | "color" | "strings";
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
        key: "image",
        label: "Photo",
        type: "image",
        help: "Leave empty to show the beach illustration.",
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
      image: "",
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
    description: "Embeds your Calendly scheduler (set the link in Settings).",
    icon: "📅",
    fields: [
      eyebrow,
      heading,
      intro,
      {
        key: "bookingUrl",
        label: "Calendly link for this section (optional)",
        type: "url",
        help: "Leave empty to use the booking link from Settings.",
      },
      {
        key: "fallbackText",
        label: "Text when online booking isn’t set up",
        type: "textarea",
      },
      background,
    ],
    defaults: {
      eyebrow: "Booking",
      heading: "Book a time",
      intro: "",
      bookingUrl: "",
      fallbackText: "Online booking is coming soon — send us a message and we’ll get you scheduled.",
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
