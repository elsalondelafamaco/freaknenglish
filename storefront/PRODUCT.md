# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students (primary):** adults, mostly in Colombia (some abroad, in other time zones), taking live 1-on-1 English classes with a fixed teacher, 3 to 5 days a week. Many arrive from Instagram / Meta ads and use the site on their phone, often inside the Instagram in-app browser.
- **Teachers ("profes"):** manage their weekly availability, class calendar, assigned students, learning content and materials, and run the live class on a shared whiteboard ("boards").
- **Admin / owner:** runs the business: users, schedules and teacher assignment, payments and abandoned carts, payroll, site content, notifications, surveys, storage, and promotions. Not a technical user.

## Product Purpose

Freakn English sells monthly subscriptions to live 1-on-1 English classes and operates them end to end. Success means a visitor pays, the student attends their weekly classes, and they visibly progress (interactive lessons, extra activities, checkpoints, reports).

## Operating Context

- Purchase flow: pick a plan (days per week), pick a fixed weekly schedule (2-step picker with suggestions), enter data, pay inside the site with Wompi (card, Nequi, PSE, Bancolombia, Daviplata). Prices are shown in USD and charged in COP at the live exchange rate (TRM).
- Students: home with upcoming and rescheduled classes, calendar, learning modules and checkpoints, materials, reports, settings, renewal.
- Teachers: home, availability painting, calendar, students and their progress, content and materials, live boards.
- Admin: dashboard, calendar, schedule and schedule health, users, plans and prices, promotions, carts, payroll, content, site, notifications, surveys, storage, cleanup.
- Sales and support fallback is WhatsApp.

## Capabilities and Constraints

- Web app (TanStack Start + React + Tailwind), mobile-first for students; teachers and admin also use desktop.
- All UI copy in Spanish ("tú" form), Colombia as the reference time zone (America/Bogota) while showing students their own zone.
- Project is connected to Lovable; the public home page is out of scope for the current redesign.

## Brand Commitments

- Name **Freakn English / FreaknEnglish** and the existing Freakn logo (`public/logo-freakn.svg`) stay.
- Spanish copy, warm and direct tone.
- Visual language is pinned by the owner (2026-11-16): every screen uses the established Freakn look of the home and checkout — cream ground, ink, brand yellow #EBD81A, Bricolage Grotesque uppercase display with the yellow marker highlight on one key word, Plus Jakarta Sans body, white cards with 2px ink border and hard yellow offset shadow, black pill buttons. New visual worlds are out of scope; refine within this one.
- Interaction rules adopted in the redesign: selected = ink fill + check; yellow = now/attention only; visible focus (ink outline + yellow halo).

## Evidence on Hand

- Real plans and prices come from the API; no testimonials, metrics, or student counts should be invented.
- Demo accounts exist only in the local seed.

## Product Principles

1. The student's next class is always the first thing they see.
2. Paying and scheduling must survive the real phone context (in-app browsers, leaving to Nequi or the bank, flaky networks).
3. Teachers and admin screens favor speed and clarity over decoration.
4. One student, one fixed teacher, one fixed weekly schedule: the UI reinforces that continuity.
