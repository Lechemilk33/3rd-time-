import { DEFAULT_BOOKING_STEPS } from "@/lib/sections";
import { DEFAULT_THEME } from "@/lib/theme";
import type { DurationOption, FormDefinition, Handoff, Page, Section, Service, SiteSettings } from "@/lib/types";

/**
 * Starter content. The public site shows this until the admin clicks
 * “Load starter content” in the admin portal, which copies it into the
 * database where every word and photo becomes editable.
 */

export const INSTAGRAM_URL = "https://www.instagram.com/waitingforpaws/";

export const DEFAULT_SETTINGS: SiteSettings = {
  businessName: "Waiting for Paws",
  tagline: "Dog walking & pet visits in Ocean Beach, San Diego",
  logoUrl: "",
  phone: "",
  email: "",
  instagramUrl: INSTAGRAM_URL,
  serviceAreaSummary: "Ocean Beach & nearby San Diego neighborhoods",
  hours: "",
  headerCtaLabel: "Book a walk",
  headerCtaHref: "/book",
  footerBlurb: "Local, loving dog walks for Ocean Beach pups. Salty paws, happy tails.",
  announcement: {
    enabled: true,
    text: "🐾 Now welcoming new pups in Ocean Beach — book a meet & greet!",
    href: "/book",
  },
  seo: {
    title: "Waiting for Paws · Ocean Beach Dog Walking",
    description:
      "Friendly, reliable dog walks and pet visits in Ocean Beach, San Diego. Book online, manage your pup’s info, and pay securely in the client portal.",
    imageUrl: "",
  },
  theme: DEFAULT_THEME,
};

const SERVICE_AREAS = [
  "Ocean Beach",
  "Point Loma",
  "Sunset Cliffs",
  "Loma Portal",
  "Mission Beach",
  "Pacific Beach",
];

type DefaultPage = Omit<Page, "id"> & { sections: Omit<Section, "id" | "page_id" | "position">[] };

const serviceArea = {
  type: "service_area",
  visible: true,
  data: {
    eyebrow: "Where we walk",
    heading: "Proudly serving OB and nearby",
    body: "Based in Ocean Beach, we walk dogs throughout the neighborhood and close by. Not sure if you’re in range? Just ask!",
    areas: SERVICE_AREAS,
    background: "sea",
  },
};

export const DEFAULT_PAGES: DefaultPage[] = [
  {
    slug: "home",
    title: "Home",
    nav_label: "Home",
    show_in_nav: false,
    published: true,
    position: 0,
    seo_description: null,
    sections: [
      {
        type: "hero",
        visible: true,
        data: {
          eyebrow: "Ocean Beach · San Diego",
          heading: "Happy dogs. Salty paws. Zero worry.",
          subheading:
            "Friendly, reliable dog walks and pet visits for Ocean Beach pups — fresh air, good sniffs, and sunshine while you’re busy.",
          image: "",
          primaryLabel: "Book a walk",
          primaryHref: "/book",
          secondaryLabel: "Services & pricing",
          secondaryHref: "/services",
          badges: ["Locals who know OB", "Updates after every visit", "Easy online booking"],
        },
      },
      {
        type: "features",
        visible: true,
        data: {
          eyebrow: "Why Waiting for Paws",
          heading: "Walks your pup will wait by the door for",
          intro: "",
          items: [
            {
              icon: "🌊",
              title: "Local to Ocean Beach",
              body: "We live here too, so we know the shady streets, the busy corners to skip, and every good patch of grass.",
            },
            {
              icon: "📸",
              title: "Updates after every visit",
              body: "A quick note and a photo or two so you always know how your pup’s day went.",
            },
            {
              icon: "🐾",
              title: "Personal, consistent care",
              body: "Familiar faces and a steady routine. Your dog gets to know us — and we get to know them.",
            },
            {
              icon: "📅",
              title: "Easy online booking",
              body: "Book, update your pup’s info, and pay — all from your client portal.",
            },
          ],
          background: "white",
        },
      },
      {
        type: "services",
        visible: true,
        data: {
          eyebrow: "Services",
          heading: "Walks & visits",
          intro: "Simple, friendly pricing. Not sure what fits? Book a meet & greet and we’ll figure it out together.",
          showBookButton: true,
          background: "sand",
        },
      },
      {
        type: "text_image",
        visible: true,
        data: {
          eyebrow: "Hi, neighbor!",
          heading: "We’re your OB dog walkers",
          body: "Waiting for Paws is a small, local dog walking business right here in Ocean Beach. We started it because we’re happiest with a leash in one hand and a pup leading the way.\n\nEvery walk is built around your dog — their pace, their quirks, their favorite sniff spots. Zoomie-prone puppy or distinguished senior, they’ll get patience, attention, and plenty of love.",
          image: "",
          imageSide: "right",
          buttonLabel: "More about us",
          buttonHref: "/about",
          background: "white",
        },
      },
      {
        type: "gallery",
        visible: true,
        data: {
          eyebrow: "Happy tails",
          heading: "Recent adventures",
          intro: "A few of our favorite faces around the neighborhood.",
          limit: 8,
          buttonLabel: "Follow @waitingforpaws",
          buttonHref: INSTAGRAM_URL,
          background: "white",
        },
      },
      serviceArea,
      {
        type: "testimonials",
        visible: false,
        data: {
          eyebrow: "Kind words",
          heading: "What pup parents say",
          items: [
            {
              quote: "Replace this with a real review from a happy client, then turn this section on.",
              name: "Client name",
              pup: "Pup’s name",
            },
          ],
          background: "sand",
        },
      },
      {
        type: "faq",
        visible: true,
        data: {
          eyebrow: "FAQ",
          heading: "Good questions",
          items: [
            {
              question: "How do I get started?",
              answer:
                "Create a free client account, add your pup’s details, fill out the intake form, and book a meet & greet. That’s it!",
            },
            {
              question: "What areas do you serve?",
              answer:
                "We’re based in Ocean Beach and walk dogs in OB and nearby neighborhoods. If you’re not sure you’re in range, send us a message.",
            },
            {
              question: "What about hot days?",
              answer:
                "We check the pavement, stick to shady routes and cooler times of day, and always bring water.",
            },
            {
              question: "How does payment work?",
              answer: "Once you’re set up, you can pay securely online from your client portal.",
            },
          ],
          background: "white",
        },
      },
      {
        type: "cta",
        visible: true,
        data: {
          heading: "Ready to meet your new walking buddy?",
          body: "Create a free client account, tell us about your pup, and book a meet & greet in minutes.",
          buttonLabel: "Get started",
          buttonHref: "/signup",
          secondaryLabel: "Ask a question",
          secondaryHref: "/contact",
          style: "ocean",
        },
      },
    ],
  },
  {
    slug: "services",
    title: "Services",
    nav_label: "Services",
    show_in_nav: true,
    published: true,
    position: 1,
    seo_description: "Dog walks, adventure walks, and drop-in pet visits in Ocean Beach, San Diego.",
    sections: [
      {
        type: "page_header",
        visible: true,
        data: {
          eyebrow: "Services",
          heading: "Walks, visits & a whole lot of love",
          intro: "Every visit includes fresh water, lots of praise, and a quick update for you afterward.",
          background: "sea",
        },
      },
      {
        type: "services",
        visible: true,
        data: { eyebrow: "", heading: "What we offer", intro: "", showBookButton: true, background: "white" },
      },
      {
        type: "features",
        visible: true,
        data: {
          eyebrow: "How it works",
          heading: "Getting started is easy",
          intro: "",
          items: [
            { icon: "🐶", title: "Create your account", body: "Sign up and add your pup’s details in the client portal." },
            { icon: "📝", title: "Fill out the intake form", body: "Tell us about routines, quirks, and how to get in." },
            { icon: "👋", title: "Meet & greet", body: "We’ll come say hi so your pup can get to know us." },
            { icon: "📅", title: "Book walks", body: "Schedule online and pay securely from your portal." },
          ],
          background: "sand",
        },
      },
      {
        type: "cta",
        visible: true,
        data: {
          heading: "Not sure which service fits?",
          body: "We’re happy to help you figure out the best routine for your pup.",
          buttonLabel: "Contact us",
          buttonHref: "/contact",
          secondaryLabel: "",
          secondaryHref: "",
          style: "sea",
        },
      },
    ],
  },
  {
    slug: "about",
    title: "About",
    nav_label: "About",
    show_in_nav: true,
    published: true,
    position: 2,
    seo_description: "Meet Waiting for Paws, Ocean Beach locals who love dogs.",
    sections: [
      {
        type: "page_header",
        visible: true,
        data: {
          eyebrow: "About us",
          heading: "Ocean Beach locals who love dogs",
          intro: "",
          background: "sea",
        },
      },
      {
        type: "text_image",
        visible: true,
        data: {
          eyebrow: "",
          heading: "Our story",
          body: "We’re Ocean Beach locals who love dogs, and we care for every pup like our own.\n\nWhether it’s a midday stroll, a drop-in visit or a sleepover, your pup gets a familiar face, plenty of patience and lots of praise — and you get a quick update afterward.",
          image: "",
          imageSide: "left",
          buttonLabel: "",
          buttonHref: "",
          background: "white",
        },
      },
      {
        type: "features",
        visible: true,
        data: {
          eyebrow: "Our promise",
          heading: "What every pup can count on",
          intro: "",
          items: [
            { icon: "💛", title: "Patience first", body: "Every dog moves at their own pace. We never rush a nervous pup or a slow sniffer." },
            { icon: "🛡️", title: "Safety always", body: "Secure leashes, careful routes, hot-pavement checks, and fresh water." },
            { icon: "📸", title: "You’re in the loop", body: "A quick update after each visit so you never have to wonder." },
            { icon: "🏡", title: "Respect for your home", body: "Doors locked and everything left just the way we found it." },
          ],
          background: "sand",
        },
      },
      {
        type: "cta",
        visible: true,
        data: {
          heading: "Let’s be friends",
          body: "Book a meet & greet and introduce us to your best buddy.",
          buttonLabel: "Book a meet & greet",
          buttonHref: "/book",
          secondaryLabel: "",
          secondaryHref: "",
          style: "ocean",
        },
      },
    ],
  },
  {
    slug: "gallery",
    title: "Gallery",
    nav_label: "Gallery",
    show_in_nav: true,
    published: true,
    position: 3,
    seo_description: "Photos of happy Ocean Beach pups out on their walks.",
    sections: [
      {
        type: "page_header",
        visible: true,
        data: {
          eyebrow: "Gallery",
          heading: "Happy tails from around OB",
          intro: "Beach days, sniff breaks, and very good boys and girls.",
          background: "sea",
        },
      },
      {
        type: "gallery",
        visible: true,
        data: {
          eyebrow: "",
          heading: "",
          intro: "",
          limit: 0,
          buttonLabel: "See more on Instagram",
          buttonHref: INSTAGRAM_URL,
          background: "white",
        },
      },
    ],
  },
  {
    slug: "contact",
    title: "Contact",
    nav_label: "Contact",
    show_in_nav: true,
    published: true,
    position: 4,
    seo_description: "Get in touch with Waiting for Paws, dog walking in Ocean Beach, San Diego.",
    sections: [
      {
        type: "page_header",
        visible: true,
        data: {
          eyebrow: "Contact",
          heading: "Say hi!",
          intro: "New pup, a question, or just want to talk dogs? We’d love to hear from you.",
          background: "sea",
        },
      },
      {
        type: "contact",
        visible: true,
        data: { eyebrow: "", heading: "Send us a message", intro: "", showForm: true, background: "white" },
      },
      serviceArea,
    ],
  },
  {
    slug: "book",
    title: "Book",
    nav_label: "Book",
    show_in_nav: false,
    published: true,
    position: 5,
    seo_description: "Book a dog walk or meet & greet in Ocean Beach, San Diego.",
    sections: [
      {
        type: "page_header",
        visible: true,
        data: {
          eyebrow: "Booking",
          heading: "Book a walk or meet & greet",
          intro: "New here? Start with a meet & greet so we can get to know your pup.",
          background: "sea",
        },
      },
      {
        type: "booking",
        visible: true,
        data: {
          eyebrow: "",
          heading: "Booking is easy",
          intro: "",
          steps: DEFAULT_BOOKING_STEPS,
          buttonLabel: "Get started",
          background: "white",
        },
      },
      {
        type: "cta",
        visible: true,
        data: {
          heading: "Already a client?",
          body: "Log in to manage your pups, fill out your intake form, and see upcoming walks.",
          buttonLabel: "Client login",
          buttonHref: "/portal",
          secondaryLabel: "",
          secondaryHref: "",
          style: "sea",
        },
      },
    ],
  },
];

const WINDOW_VISIT = {
  kind: "window",
  price_unit: "visit",
  daily_capacity: null,
  start_minute: null,
  end_minute: null,
  min_nights: 1,
  max_nights: 14,
  duration_options: [] as DurationOption[],
  handoff_options: [] as Handoff[],
  pickup_fee_cents: null,
  bring_details: null,
} as const;

export const DEFAULT_SERVICES: Omit<Service, "id">[] = [
  {
    name: "Dog Walk",
    description: "A sniff-and-stroll around the neighborhood. Pick 30 minutes for a midday break or a full hour for high-energy pups.",
    price_cents: 2500,
    price_label: "per walk",
    duration_minutes: 30,
    image_url: null,
    booking_url: null,
    active: true,
    allow_online_payment: true,
    bookable: true,
    audience: "approved",
    confirmation: "instant",
    max_pets: 3,
    ...WINDOW_VISIT,
    duration_options: [
      { minutes: 30, price_cents: 2500 },
      { minutes: 60, price_cents: 4000 },
    ],
    position: 0,
  },
  {
    name: "Park Visit",
    description: "Playtime at a local park. We’ll pick your pup up from home, or you can drop them off with us.",
    price_cents: null,
    price_label: "Ask us",
    duration_minutes: 30,
    image_url: null,
    booking_url: null,
    active: true,
    allow_online_payment: false,
    bookable: true,
    audience: "approved",
    confirmation: "request",
    max_pets: 3,
    ...WINDOW_VISIT,
    duration_options: [
      { minutes: 30, price_cents: null },
      { minutes: 60, price_cents: null },
    ],
    handoff_options: ["pickup", "bring"],
    position: 1,
  },
  {
    name: "Drop-In Visit",
    description: "A quick visit at your home: a potty break, fresh water, meals or meds, and some quality cuddle time.",
    price_cents: 2200,
    price_label: "per visit",
    duration_minutes: 30,
    image_url: null,
    booking_url: null,
    active: true,
    allow_online_payment: true,
    bookable: true,
    audience: "approved",
    confirmation: "instant",
    max_pets: 3,
    ...WINDOW_VISIT,
    position: 2,
  },
  {
    name: "Meet & Greet",
    description: "Let’s meet! We’ll get to know your pup, your routine, and how to get in. No commitment.",
    price_cents: 0,
    price_label: null,
    duration_minutes: 20,
    image_url: null,
    booking_url: null,
    active: true,
    allow_online_payment: false,
    bookable: true,
    audience: "everyone",
    confirmation: "request",
    max_pets: 5,
    ...WINDOW_VISIT,
    kind: "time",
    position: 3,
  },
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const DEFAULT_INTAKE_FORM: FormDefinition = {
  slug: "intake",
  title: "New client intake",
  description:
    "Help us get to know you and your pup. Only you and the Waiting for Paws team can see your answers.",
  fields: [
    { id: "h-home", type: "heading", label: "Your home" },
    {
      id: "access_method",
      type: "radio",
      label: "How will we get in?",
      required: true,
      options: ["Lockbox", "Door code / smart lock", "Key hidden on the property", "Someone will be home", "Other"],
    },
    {
      id: "access_details",
      type: "textarea",
      label: "Access details",
      help: "Lockbox or gate codes, where the key is, alarm instructions, parking tips.",
    },
    { id: "h-routine", type: "heading", label: "Your pup’s routine" },
    { id: "walk_days", type: "checkboxes", label: "Which days do you usually need walks?", options: WEEKDAYS },
    {
      id: "walk_times",
      type: "checkboxes",
      label: "Preferred time of day",
      options: ["Morning", "Midday", "Afternoon", "Evening"],
    },
    { id: "leash_gear", type: "text", label: "What does your pup walk in?", help: "Harness, collar, gentle leader…" },
    {
      id: "behaviors",
      type: "checkboxes",
      label: "Anything we should watch for on walks?",
      options: [
        "Pulls on leash",
        "Reactive to other dogs",
        "Nervous around people",
        "Escape artist",
        "Eats things off the ground",
        "Scared of loud noises / skateboards",
      ],
      details: true,
    },
    {
      id: "dog_greetings",
      type: "radio",
      label: "Does your pup play well with other dogs?",
      options: ["Yes, loves other dogs", "Depends on the dog", "No, please keep them apart"],
      details: true,
    },
    { id: "treats_ok", type: "yesno", label: "Are treats OK?", help: "Mention any allergies or favorites below.", details: true },
    { id: "h-emergency", type: "heading", label: "Just in case" },
    { id: "emergency_contact", type: "text", label: "Emergency contact (name & phone)", required: true },
    {
      id: "vet_authorization",
      type: "yesno",
      label: "If your pup needs urgent care and we can’t reach you, may we take them to a vet?",
      required: true,
      details: true,
    },
    { id: "h-more", type: "heading", label: "A little more" },
    {
      id: "referral",
      type: "select",
      label: "How did you hear about us?",
      options: ["Instagram", "Friend or neighbor", "Google", "Nextdoor", "Saw you around OB", "Other"],
    },
    { id: "anything_else", type: "textarea", label: "Anything else we should know?" },
    {
      id: "agreement",
      type: "agreement",
      label: "I confirm this information is accurate and I agree to the Waiting for Paws service policies.",
      required: true,
    },
  ],
};
