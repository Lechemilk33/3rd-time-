/**
 * Neighborhood pages and local guides: the starting content for pages that help people nearby find
 * us on Google ("dog walker Point Loma", "dog beach rules San Diego"). Each one is written for its
 * own area, not a copy with the name swapped, and they link to each other and to booking.
 * The team can edit any of them in Admin → Pages.
 *
 * Dog rules follow the City of San Diego's dog beach page
 * (sandiego.gov/park-and-recreation/parks/dogs/bchdog), checked October 2026.
 */

export type LocalPage = {
  slug: string;
  /** Neighborhood name, for area pages (also used in structured data). */
  area?: string;
  /** Page title and search title. */
  title: string;
  /** Short name for links ("Point Loma", "Dog beach guide"). */
  linkLabel: string;
  seo: string;
  eyebrow: string;
  heading: string;
  intro: string;
  body: string;
  faq?: { question: string; answer: string }[];
};

export const GUIDE_DATE = "Updated October 2026";

export const AREA_PAGES: LocalPage[] = [
  {
    slug: "dog-walking-ocean-beach",
    area: "Ocean Beach",
    title: "Dog Walking in Ocean Beach, San Diego",
    linkLabel: "Ocean Beach",
    seo: "Friendly, reliable dog walks, park trips and pet visits in Ocean Beach and Sunset Cliffs, from neighbors who live in OB.",
    eyebrow: "Ocean Beach · Sunset Cliffs",
    heading: "Dog walking in Ocean Beach",
    intro: "Your neighbors in OB. Walks, park trips and pet visits, from Dog Beach to Sunset Cliffs.",
    body: `Ocean Beach is home. We walk these streets every day, so we know where the shade is on a hot afternoon, which blocks are quiet enough for a nervous pup, and where the tempting fish-taco scraps tend to end up.

## Where we walk in OB
- Neighborhood loops around Voltaire, Newport and Sunset Cliffs Boulevard, at whatever pace suits your pup.
- Leashed strolls along Sunset Cliffs, with lots of sniff stops and a safe distance from the edge.
- [Dog Beach](/san-diego-dog-beach-guide) at the north end of OB, for pups you’ve told us can run off-leash.
- The flat path along the San Diego River behind Dog Beach, easy on older legs.

## Beach time, done right
Dog Beach is one of only two places in the city where dogs can be off-leash by the water, and we only take pups there with your OK. Most other beaches don’t allow dogs in the middle of the day, so beach walks happen early in the morning or in the evening. Here’s our [San Diego dog beach guide](/san-diego-dog-beach-guide).

## Hot days
OB sidewalks heat up fast. On warm afternoons we stick to shady streets, keep walks shorter and always carry water. More in our [hot weather tips](/hot-weather-dog-walking-san-diego).

## Nearby
We also walk dogs all over [Point Loma](/dog-walking-point-loma), and up the coast in [Mission Beach](/dog-walking-mission-beach) and [Pacific Beach](/dog-walking-pacific-beach).`,
    faq: [
      {
        question: "Do you take dogs to Dog Beach?",
        answer: "Only if you tell us it’s OK and your pup comes back when called. We’ll talk it through at the meet & greet.",
      },
      {
        question: "Do you walk along Sunset Cliffs?",
        answer: "Yes, on leash, keeping well back from the cliff edges and sticking to the paths.",
      },
      {
        question: "How do I get started?",
        answer: "Create a free account, add your pup and book a meet & greet. Once we’ve met, you can book walks online anytime.",
      },
    ],
  },
  {
    slug: "dog-walking-point-loma",
    area: "Point Loma",
    title: "Dog Walking in Point Loma, San Diego",
    linkLabel: "Point Loma",
    seo: "Dog walks, park trips and drop-in visits across Point Loma, Loma Portal and Liberty Station, from a local Ocean Beach walker.",
    eyebrow: "Point Loma · Loma Portal · Liberty Station",
    heading: "Dog walking in Point Loma",
    intro: "Hill walks for the energetic, flat strolls for the seniors, and a friendly face at your door.",
    body: `Point Loma is right next door to our home base in Ocean Beach, so we’re in the neighborhood every day, from the hills above the bay to the flatter streets of Loma Portal.

## Walks that fit your dog
- High-energy pups love Point Loma’s hills. A 60-minute walk here is a real workout.
- Seniors and little legs do better on the flatter streets of Loma Portal and the wide, grassy spaces around Liberty Station.
- Nervous or reactive dogs get quieter routes and one-on-one time. Tell us at the meet & greet and we’ll plan around it.

## Park trips with pick-up
Short on time? Book a park visit and we can pick your pup up from home, or you can bring them to us. Pups cleared for off-leash play can join us at [Dog Beach](/san-diego-dog-beach-guide).

## Drop-in visits
Not every day needs a long walk. A drop-in visit covers a potty break, fresh water, meals or meds and some quality cuddle time while you’re at work.

## Nearby
We’re based in [Ocean Beach](/dog-walking-ocean-beach) and also walk in [Mission Beach](/dog-walking-mission-beach) and [Pacific Beach](/dog-walking-pacific-beach).`,
    faq: [
      {
        question: "Do you cover Loma Portal and Liberty Station?",
        answer: "Yes. They’re a few minutes from our home base in Ocean Beach.",
      },
      {
        question: "Can you pick my dog up for a park trip?",
        answer: "Yes. When you book a park visit you can choose pick-up from home or bring your pup to us.",
      },
      {
        question: "My dog doesn’t love other dogs. Can you still help?",
        answer: "Absolutely. We’ll keep their walks one-on-one and pick quieter routes. Just let us know at the meet & greet.",
      },
    ],
  },
  {
    slug: "dog-walking-mission-beach",
    area: "Mission Beach",
    title: "Dog Walking in Mission Beach, San Diego",
    linkLabel: "Mission Beach",
    seo: "Dog walks and park trips in Mission Beach, planned around San Diego’s beach and Mission Bay dog rules, with Fiesta Island trips for off-leash fun.",
    eyebrow: "Mission Beach · Mission Bay",
    heading: "Dog walking in Mission Beach",
    intro: "Walks planned around the beach rules, quiet bay-side mornings and off-leash fun on Fiesta Island.",
    body: `Mission Beach sits between the ocean and Mission Bay, which makes for great walks if you know the rules and the busy times.

## Planned around the rules
Dogs aren’t allowed on most city beaches or around Mission Bay in the middle of the day: from 9 AM to 6 PM between April and October, and from 9 AM to 4 PM between November and March. Outside those hours they’re welcome on a leash. So we plan bay-side walks for early mornings and evenings, and keep midday walks to the quieter residential streets. The details are in our [San Diego dog beach guide](/san-diego-dog-beach-guide).

## Fiesta Island
A short drive away, Fiesta Island is the city’s big leash-optional space on Mission Bay, open to dogs from 4 AM to 10 PM. Pups you’ve cleared for off-leash play can run there on a park visit. Some areas close for nesting birds from April 15 to September 15, and we always respect the fences.

## Busy summer days
Summer weekends get crowded and the pavement gets hot. We keep walks shorter when it’s warm, carry water and choose shade. More in our [hot weather tips](/hot-weather-dog-walking-san-diego).

## Nearby
We’re based in [Ocean Beach](/dog-walking-ocean-beach), and also walk in [Pacific Beach](/dog-walking-pacific-beach) and [Point Loma](/dog-walking-point-loma).`,
    faq: [
      {
        question: "Can my dog go on the beach in Mission Beach?",
        answer: "On a leash, early in the morning or in the evening. City rules keep dogs off most beaches and the Mission Bay shore from 9 AM to 6 PM in April through October, and 9 AM to 4 PM in November through March.",
      },
      {
        question: "Do you go to Fiesta Island?",
        answer: "Yes, on park visits with pups you’ve cleared for off-leash play. It’s open to dogs from 4 AM to 10 PM.",
      },
      {
        question: "Can you pick my dog up?",
        answer: "Yes. Park visits come with the option of pick-up from home or dropping your pup off with us.",
      },
    ],
  },
  {
    slug: "dog-walking-pacific-beach",
    area: "Pacific Beach",
    title: "Dog Walking in Pacific Beach, San Diego",
    linkLabel: "Pacific Beach",
    seo: "Reliable dog walks, park trips and pet visits in Pacific Beach, on calm routes away from the busy strip.",
    eyebrow: "Pacific Beach",
    heading: "Dog walking in Pacific Beach",
    intro: "Calm routes away from the busy strip, early bay-side walks and a walker who shows up when we say we will.",
    body: `Pacific Beach is a fun place to be a dog, as long as someone knows how to steer clear of the crowds. We do.

## Calm routes
- Quiet residential streets instead of the busy stretch of Garnet Avenue, especially on weekends.
- Early-morning and evening walks near Mission Bay, when dogs are allowed on a leash.
- Plenty of sniff time. A good walk is as much about the nose as the legs.

## Off-leash fun
Pups you’ve cleared for off-leash play can come along on a park visit to Fiesta Island or [Dog Beach in Ocean Beach](/san-diego-dog-beach-guide). We can pick them up from home.

## While you’re at work
Long day? A drop-in visit covers a potty break, fresh water, meals or meds and some attention, so your pup isn’t waiting all day.

## Nearby
We also walk in [Mission Beach](/dog-walking-mission-beach), [Ocean Beach](/dog-walking-ocean-beach) and [Point Loma](/dog-walking-point-loma).`,
    faq: [
      {
        question: "Do you walk in Pacific Beach every day?",
        answer: "Yes, on the days we work. Book online to see every open time for the days you need.",
      },
      {
        question: "My dog pulls toward every other dog. Is that OK?",
        answer: "Totally normal. We’ll pick quieter routes and work on loose-leash walking along the way.",
      },
      {
        question: "How do I start?",
        answer: "Create a free account, add your pup and book a meet & greet. After that you can book walks online anytime.",
      },
    ],
  },
];

export const GUIDE_PAGES: LocalPage[] = [
  {
    slug: "san-diego-dog-beach-guide",
    title: "San Diego Dog Beach Guide: Where Dogs Can Run (and When)",
    linkLabel: "Dog beach guide",
    seo: "Where dogs can be off-leash at the beach in San Diego, the hours dogs are allowed on other beaches and Mission Bay, and tips for Dog Beach in Ocean Beach.",
    eyebrow: "Local guide",
    heading: "San Diego dog beach guide",
    intro: "Where your dog can run free, when leashed dogs are welcome, and how to make beach days easy.",
    body: `San Diego has plenty of sand, but only two city spots by the water where dogs can be off-leash. Here’s where they are, the rules everywhere else, and what we’ve learned from a lot of beach days.

## Dog Beach, Ocean Beach
Dog Beach sits at the north end of Ocean Beach, where the San Diego River meets the ocean (at the west end of the river channel, past the end of Voltaire Street). It’s leash-free, wide and usually full of happy dogs.

- Go at low tide for the most room to run.
- There’s no shade, so bring water and a bowl.
- In warmer months, stingrays can be in the shallows. Shuffle your feet when you wade in.
- Rinse the salt and sand off afterwards, especially between toes and under collars.
- Bring bags and pick up after your dog. Leave only footprints.

## Fiesta Island, Mission Bay
Fiesta Island is the city’s other leash-optional space by the water: the shoreline and interior are open to dogs from 4 AM to 10 PM every day.

- Two nesting areas for California least terns are fenced off all year.
- Two buffer zones around them close from April 15 to September 15. They’re marked; please keep out.
- Dogs aren’t allowed at the Youth Aquatic Center, on or off leash.

## Every other beach and Mission Bay
Everywhere else, dogs have to be on a leash, and they aren’t allowed in the middle of the day:

- April through October: no dogs from 9 AM to 6 PM.
- November through March: no dogs from 9 AM to 4 PM.

Outside those hours, leashed dogs are welcome. Service animals are exempt. Park rangers, police, lifeguards and the San Diego Humane Society can write tickets, so it’s worth following the signs.

Rules and hours change from time to time, so check the [City of San Diego’s dog beach page](https://www.sandiego.gov/park-and-recreation/parks/dogs/bchdog) before you go.

## How we do beach days
We only take dogs off-leash when their families say it’s OK and they reliably come when called. Beach walks happen in the cool of the morning or evening, and every pup gets a towel-off before going home. Want to add beach time to your dog’s week? [Book a meet & greet](/book).

More nearby: dog walking in [Ocean Beach](/dog-walking-ocean-beach), [Mission Beach](/dog-walking-mission-beach) and [Pacific Beach](/dog-walking-pacific-beach).`,
  },
  {
    slug: "hot-weather-dog-walking-san-diego",
    title: "Hot Weather Dog Walking in San Diego: Paws, Pavement and Heat Safety",
    linkLabel: "Hot weather tips",
    seo: "How to walk your dog safely in San Diego’s heat: the pavement test, the best times to walk, signs of heatstroke and what to do.",
    eyebrow: "Local guide",
    heading: "Hot weather dog walking",
    intro: "San Diego is mild most of the year, but sidewalks and heat waves can still catch a dog out. Here’s how we keep walks safe.",
    body: `The coast stays pleasant most of the year, but sunny sidewalks get far hotter than the air, and late-summer and fall heat waves can push temperatures up fast, even near the beach.

## The seven-second test
Put the back of your hand flat on the pavement for seven seconds. If it’s too hot for your hand, it’s too hot for paws. Dark asphalt and sunny sidewalks are the worst; grass, dirt and shaded streets stay much cooler.

## Pick the right time
- Walk early in the morning or after the sun goes down on hot days.
- Keep midday outings short: a potty break and some shade, not a long hike.
- On heat-wave days, swap long walks for sniff walks and games at home. A tired nose works just as well as tired legs.

## Who needs extra care
Flat-faced breeds (pugs, bulldogs, Frenchies), puppies, seniors, overweight dogs and pups with thick double coats all overheat more easily. Shorter walks and more breaks are the rule for them.

## Water, shade, rest
Bring water on any walk longer than a few minutes, stop in the shade, and let your dog set the pace. Never leave a dog in a parked car, even with the windows cracked.

## Signs of heatstroke
Heavy panting that doesn’t settle, thick drool, bright red gums, wobbliness, vomiting or collapse are an emergency.

- Move your dog into the shade or air conditioning right away.
- Wet them with cool (not ice-cold) water, especially the belly and paws, and offer small sips.
- Call your vet or the nearest emergency vet immediately, even if they seem to recover.

## How we handle hot days
We check the forecast every morning, shift walks to cooler parts of the day where we can, choose shady routes, carry water for every dog and shorten walks when it’s hot. If it isn’t safe, we’ll tell you and swap in a drop-in visit instead. Questions about your pup? [Get in touch](/contact).

More nearby: dog walking in [Ocean Beach](/dog-walking-ocean-beach), [Point Loma](/dog-walking-point-loma) and [Pacific Beach](/dog-walking-pacific-beach), and our [San Diego dog beach guide](/san-diego-dog-beach-guide).`,
  },
];

/** Neighborhoods the service area lists, mapped to the page that covers them. */
export const AREA_LINKS: Record<string, string> = {
  "Ocean Beach": "/dog-walking-ocean-beach",
  "Sunset Cliffs": "/dog-walking-ocean-beach",
  "Point Loma": "/dog-walking-point-loma",
  "Loma Portal": "/dog-walking-point-loma",
  "Mission Beach": "/dog-walking-mission-beach",
  "Pacific Beach": "/dog-walking-pacific-beach",
};
