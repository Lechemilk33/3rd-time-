/**
 * Terms of Service and Privacy Policy.
 *
 * Clients agree to TERMS_VERSION when they sign up, and the client portal asks anyone who agreed to
 * an older version (or none) to agree again. Change the version after a meaningful change to
 * either document; small wording fixes don't need a new one.
 *
 * The text is the starting content for the /terms and /privacy pages, which the team can edit in
 * Admin → Pages. {business}, {email} and {cancel_hours} are filled in when the page is shown, so
 * the cancellation window always matches the one set in Admin → Schedule.
 */

export const TERMS_VERSION = "2026-10-13";
export const TERMS_HREF = "/terms";
export const PRIVACY_HREF = "/privacy";
export const LEGAL_UPDATED = "Last updated October 13, 2026";

export const TERMS_TEXT = `These terms are an agreement between you and {business} (“we” and “us”). They cover walks, park visits, drop-in visits, meet & greets and anything else you book with us. By creating an account, booking a visit or paying online, you agree to them. If anything here is unclear, ask us at {email}.

## 1. Our services
We offer dog walks, park visits, drop-in visits at your home and meet & greets in and around Ocean Beach, San Diego. Each service, its length and its price are described on our website and when you book. We can decline or stop service to anyone, for example when a pup isn’t a good fit for our walks or for safety reasons.

## 2. Your account and the meet & greet
- Give us accurate information about you, your home and your pup, and keep it up to date in your client portal, especially health, behavior, medications and emergency contacts.
- New clients start with a meet & greet. Regular visits open up once we’ve approved your account.
- Keep your login private. You’re responsible for bookings made from your account.

## 3. Booking and timing
- Most visits are booked in an arrival window (for example, Midday, 11 AM – 2 PM). We arrive sometime inside it, and the visit lasts as long as the length you booked.
- Group walks and park visits can include other dogs at the same time. Drop-in visits are one-on-one.
- Traffic, weather and other visits can affect timing. If we’re running late, we’ll let you know.
- For everyone’s safety we may shorten, move indoors or reschedule a visit in extreme heat, storms, poor air quality or other unsafe conditions.

## 4. Cancellations and changes
- You can cancel or reschedule online, free of charge, until {cancel_hours} hours before a visit starts.
- Closer to the visit, please message us. Late cancellations may be charged in full, and so may visits we can’t complete because we couldn’t get to your pup (for example, a wrong door code or no one home for a pick-up).
- If we have to cancel (illness, an emergency or unsafe conditions), we’ll tell you as soon as we can and you won’t be charged for that visit. If you already paid, we’ll refund it or credit it to a future visit, whichever you prefer.

## 5. Prices and payment
- Prices are shown on our website and when you book. Extras, like a pick-up fee, are shown before you confirm.
- Online payments are processed securely by Stripe. We never see or store your full card number.
- Payment is due when we tell you, or otherwise when the visit is booked. We may pause new bookings on accounts with an unpaid balance.
- We may change our prices. Changes don’t affect visits you’ve already booked and paid for.

## 6. Refunds
If a visit didn’t happen because of us, or something wasn’t right, tell us within 7 days and we’ll make it right with a refund or a credit. Please contact us before disputing a charge with your bank. We’re quick to help.

## 7. Your pup’s health and behavior
By booking, you confirm that your pup:

- is up to date on the vaccines required by law (including rabies) and licensed where required, and you’ll show proof if we ask;
- is healthy enough for the visit you booked, and on flea and tick prevention;
- has no history of biting or serious aggression toward people or other dogs that you haven’t told us about.

Tell us about any change in health or behavior before the next visit. If a pup shows aggressive or unsafe behavior, we may end the visit, keep them out of group walks, or stop service.

## 8. Emergencies and vet care
If your pup is hurt or becomes ill while in our care, we’ll try to reach you and your emergency contact right away. If we can’t reach anyone and you’ve told us we may (on your intake form), we’ll take your pup to your vet or the nearest emergency vet. You authorize that care and agree to pay the vet and related costs. We’ll always act in good faith in your pup’s best interest.

## 9. Your home and keys
- If you give us keys, a lockbox or a door code, we’ll keep them secure and use them only for your visits.
- Tell us about alarms, other pets, other people who may be home and anything else we should know before we come in.
- We’ll lock up and leave things as we found them. We’re not responsible for problems we didn’t cause, like broken locks, appliances or plumbing.

## 10. Leashes, off-leash areas and play
Dogs stay on leash except in designated off-leash areas, such as Ocean Beach Dog Beach, and only if you’ve told us that’s OK. Playing with other dogs carries natural risks (scrapes, nips or a scuffle), even with careful supervision.

## 11. Risks and our responsibility
Caring for animals comes with risks no one can fully remove: injury, illness, a slipped collar or a run-in with another dog. We take reasonable care, and we’re responsible when we’re careless. To the fullest extent the law allows, we aren’t responsible for harm that happens despite reasonable care, for conditions your pup already had, or for indirect losses, and our total responsibility for any claim is limited to the amount you paid for the visit or visits involved. Nothing in these terms limits our responsibility for gross negligence, willful misconduct or anything else the law doesn’t allow us to limit.

## 12. Your responsibility for your pup
You’re responsible for your pup’s actions. You agree to cover the costs of injury or damage your pup causes to people, other animals or property while in our care, including to us, unless it was caused by our own carelessness.

## 13. Photos and updates
We love sending updates. We may take photos and videos of your pup during visits and share them with you, and post some on our website and social media (never your address or last name). If you’d rather we didn’t post your pup, just tell us.

## 14. Messages from us
By creating an account, you agree that we can contact you by email, text or phone about your account and visits. We won’t send you marketing you didn’t ask for.

## 15. Changes to these terms
We may update these terms. If we make important changes, we’ll ask you to agree to the new version the next time you log in. The date at the top shows when they last changed.

## 16. The legal bits
These terms are governed by California law. If we ever disagree, let’s talk first; most things are solved with a quick conversation. Anything we can’t solve together will be handled in the courts of San Diego County, California, and either of us can use small claims court for anything that qualifies. If part of these terms can’t be enforced, the rest still applies. These terms, our Privacy Policy and what you’re shown when you book are our whole agreement.

## Questions
Email us at {email}. We’re happy to explain anything here.`;

export const PRIVACY_TEXT = `This policy explains what information {business} collects through our website and client portal, how we use it, and the choices you have. We’re a small local business, and we only collect what we need to take good care of your pup.

## What we collect
- Account details: your name, email, phone number and address.
- Your pup’s details: name, breed, age, photos, health and medication notes, vet information, behavior and routines.
- Home access: entry instructions, lockbox or door codes and anything else you tell us so we can get in safely.
- Emergency contacts you give us.
- Your bookings, payment history, intake form answers and the messages you send us.
- Payment details are collected and processed by Stripe. We receive a record of each payment (amount, date and status), never your full card number.
- Basic technical information our hosting providers log automatically, like your browser type and IP address, to keep the site secure.

## How we use it
- To schedule and provide visits, and to care for your pup safely.
- To contact you about bookings, changes, reminders and emergencies.
- To take payments and keep business records.
- To keep our website and your account secure.

We don’t sell your information, and we don’t use it for advertising.

## Who we share it with
Only the services we use to run the business, and only what they need to do their job:

- Supabase (our secure database and logins)
- Vercel (website hosting and anonymous visit counts)
- Resend (booking emails)
- Stripe (online payments)

We may also share information with a veterinarian in an emergency, with your emergency contact if we can’t reach you, or when the law requires it.

## Cookies and visit stats
We use a small number of essential cookies to keep you logged in and keep the site secure. To see which pages are useful, we count visits with Vercel Web Analytics, which doesn’t use cookies and doesn’t identify you. When you first visit, your browser also remembers how you found us (for example a flyer or a Google search); if you create an account, that’s saved with it so we know which of our efforts are working. We don’t use advertising or cross-site tracking, so there’s nothing to turn off, and we treat “Do Not Track” browser signals the same way.

## How we protect it
Your information is stored with reputable providers and sent over encrypted connections, and only our team can see client and pup details. Home access information is used only for your visits.

## How long we keep it
We keep your information while you have an account with us. After that we keep only what we need for records the law requires, like payments, and remove the rest when you ask.

## Your choices
- You can see and update most of your information in your client portal at any time.
- Email {email} to get a copy of your information, correct it, or close your account and have your information removed.
- California residents can ask what personal information we’ve collected and ask us to remove it. We’ll never treat you differently for asking.

## Children
Our services are for adults. We don’t knowingly collect information from children under 13.

## Changes
If we change this policy, we’ll update the date at the top and let you know about important changes.

## Contact
Questions about your privacy? Email {email}.`;
