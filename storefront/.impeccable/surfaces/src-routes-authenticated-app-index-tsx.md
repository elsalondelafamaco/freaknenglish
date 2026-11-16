---
version: 1
slug: "src-routes-authenticated-app-index-tsx"
primary_target: "src/routes/_authenticated/app.index.tsx"
related_targets: ["src/routes/checkout.index.tsx","src/routes/_authenticated/teacher.index.tsx","src/routes/_authenticated/admin.index.tsx"]
---

## Scope

Redesign of every authenticated and transactional surface except the public home: checkout (plan, schedule, data, payment and all its states, return), auth, student app, teacher app, admin. Mode: Operate. Designed in the Claude Design canvas, then built in code (shipped 2026-11-16).

## Direction contract

THESIS: Freakn's own look carried into every working screen; the next thing to do (next class, pending validation, failed payment) is the one yellow thing on the page. Refuses grey category dashboards and invented visual worlds.

OWN-WORLD: User-pinned incumbent world: cream ground, ink, brand yellow #EBD81A; Bricolage Grotesque uppercase display with the yellow marker on one key word of the H1; Plus Jakarta Sans body; white cards with 2px ink border and hard yellow offset shadow on primary cards only; black pill buttons with cream uppercase text. Selected = ink fill + check; yellow = now/attention only; visible focus (ink outline + yellow halo).

STORY: Students see their next class and teacher first, then their week; teachers see today's classes and what to validate; the owner reads plain-language figures where problems are highlighted.

FIRST VIEWPORT: Student home: logo bar, "Hola, {nombre}", next-class hero card (teacher initials, relative day, time, join), weekly L–V strip, bottom nav of five.

FORM: Pinned by the user over the roll ("Cuaderno con resaltador" was chosen, built as a mockup, then rejected for not matching the brand). seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
