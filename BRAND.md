---
version: 2026-10-06
name: KarmaHouse — brand
description: >
  Brand truth for everything KarmaHouse makes: app, website, videos, motion graphics, posts.
  Taken from the live React site (web/src/index.css, web/src/App.tsx, web/src/ui.tsx) and the app
  theme (src/theme.ts). Warm Havana editorial: limewash cream, Calistoga headlines, the app's blue as
  the one strong accent, and four quiet colours borrowed from a Vedado porch (shutter green,
  terracotta steps, ochre, afternoon sun). Calm and well made, never loud.
unit: the frame — 1080×1920 (9:16) for Reels, Status and TikTok; 1920×1080 and 1080×1080 also valid
principle: atoms are sacred · composition is free · facts come only from the list below

colors:
  blue: "#0153A8"          # the one strong accent; buttons, links, app UI
  blue-deep: "#01438A"
  on-blue: "#FFFFFF"
  soft-blue: "#EAF3FF"
  cal: "#FAF6EE"           # limewash canvas
  arena: "#F2EADC"         # sand panels, incoming chat bubbles
  paper: "#FFFFFF"         # cards
  ink: "#1A2B3B"           # headlines
  body: "#4D5A66"          # running text
  line: "#E6DCCB"          # hairlines
  mar: "#0E2236"           # deep sea navy: dark panels, download section
  espuma: "#D7E2EC"        # text on mar
  sol: "#E3B04B"           # sun: CTA on mar, the accent phrase on dark
  persiana: "#3F6B4F"      # shutter green: trust, checks
  terracota: "#A84C33"     # terracotta steps: location pins, "vender"
  ocre: "#8A5C15"          # ochre: step numerals, "alquilar"
  photo-overlay: "linear-gradient(180deg, rgba(14,34,54,0) 40%, rgba(14,34,54,.78) 100%)"

fonts:
  display: '"Calistoga", Georgia, serif'   # file: web/node_modules/@fontsource/calistoga/files/calistoga-latin-400-normal.woff2
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'

radii:
  pill: "9999px"           # every button and chip is a full pill
  card: "24px"
  panel: "40px"            # big sections (trust, download)
  icon-tile: "16px"
  phone: "40px"
  screen: "30px"

typography:
  h1:        { fontFamily: "{fonts.display}", cqw: 4.6, weight: 400, lineHeight: 1.08, tracking: "-0.02em", color: "ink", wrap: balance }
  h1-accent: { fontFamily: "{fonts.display}", weight: 400, color: "blue", description: "one phrase per headline in colour (not italic): blue on light, sol on mar" }
  h2:        { fontFamily: "{fonts.display}", cqw: 3.0, weight: 400, lineHeight: 1.1, tracking: "-0.02em", color: "ink" }
  eyebrow:   { fontFamily: "{fonts.sans}", cqw: 0.9, weight: 700, tracking: "0.14em", upper: true, color: "blue" }
  body:      { fontFamily: "{fonts.sans}", cqw: 1.2, weight: 400, lineHeight: 1.65, color: "body" }
  numeral:   { fontFamily: "{fonts.display}", cqw: 2.2, weight: 400, color: "ocre", description: "01 02 03 inside a hairline circle" }
  button:    { fontFamily: "{fonts.sans}", cqw: 1.1, weight: 600 }

spacing:
  pad-x: "5cqw"
  gap: "2cqw"

motion:
  ease: "cubic-bezier(.22, 1, .36, 1)"   # --ease-out-soft; the only ease for entrances
  rise: "opacity 0 → 1 and y 24px → 0 over 0.7–0.8s"
  stagger: "0.08s between siblings"
  door: "clip-path inset(100% 0 0 0) → inset(0) over 1.1s; photos open upward like a door"
  mediopunto: "panes of the half-moon window light up from the hub outwards, blue/sol/terracota/persiana"
  verb-rotator: "comprar → vender → permutar → alquilar, one verb swapping in place in the headline"

components:
  cta-button: { backgroundColor: "{colors.blue}", textColor: "{colors.on-blue}", rounded: "{radii.pill}", typography: "{typography.button}", description: "Label + arrow →. On mar: sol fill, mar text." }
  card:       { backgroundColor: "{colors.paper}", border: "1px solid {colors.line}", rounded: "{radii.card}", shadow: "none" }
  sand-panel: { backgroundColor: "{colors.cal}", rounded: "{radii.card}" }
  mar-panel:  { backgroundColor: "{colors.mar}", textColor: "{colors.espuma}", rounded: "{radii.panel}", description: "Closing / download panel: white Calistoga headline with its accent phrase in sol." }
  chip:       { backgroundColor: "rgba(250,246,238,.9)", textColor: "{colors.ink}", rounded: "{radii.pill}", description: "e.g. pin icon in terracota + «Hecho para Cuba»" }
  photo-card: { rounded: "{radii.panel}", caption: "white Calistoga on {colors.photo-overlay}; label illustrative photos" }
  phone-mockup: { frame: "{colors.mar}, radius {radii.phone}", screen: "app UI in {colors.blue}, radius {radii.screen}" }
  losa:       { description: "hydraulic floor-tile pattern (web/src/index.css .losa), 56px repeat, drawn in currentColor at low opacity as texture" }
  mediopunto: { description: "half-moon stained-glass window over a Cuban door (web/src/ui.tsx Mediopunto); the brand's signature ornament" }
---

# KarmaHouse — brand

## Who we are

KarmaHouse is a free Android app to buy, sell, swap (permuta) or rent a home in Cuba, talking
directly with whoever publishes. Tagline on the site: «Un espacio para encontrar tu lugar».

Look: a warm Havana editorial. Limewash cream, Calistoga headlines with one phrase in blue, white
cards with sand hairlines, a deep-sea navy panel to close, and Cuban architecture as ornament (the
*mediopunto* window, the *losa hidráulica* floor tile, a door opening). Calm, crafted, never loud.

Voice: Cuban Spanish, *tú*, short sentences, concrete benefits. Careful and honest like the site:
no hype, no promises the app does not keep, no clichés (old cars, cigars, flags as decoration).
Site lines to reuse: «Tu casa en Cuba, para comprar, vender, permutar o alquilar» ·
«Cada hogar, un nuevo comienzo.» · «Del mapa a la conversación. Todo más cerca.» ·
«Tu búsqueda, también en tu bolsillo.» · «Tu confianza también tiene su lugar.»

## Facts — the only claims we may make

Checked against the live site (karmahouse.site, formerly karmahouse.vercel.app) on 2026-10-06; domain and version rechecked 2026-10-11. The live site wins if it differs.

- Compra, vende, permuta o alquila en Cuba, y habla directamente con quien publica.
- Publicar, buscar y conversar es gratis. KarmaHouse no cobra comisión; la negociación y el cierre son entre las partes.
- Los anuncios se revisan antes de publicarse. The review does not certify ownership: never say "verificado" or "garantizado".
- Las 15 provincias y la Isla de la Juventud (say "toda Cuba"; never "16 provincias").
- Chat privado: otros usuarios no ven tu teléfono ni tu correo; puedes reportar, bloquear o eliminar tu cuenta.
- Quien publica decide si muestra la ubicación exacta o aproximada; las viviendas se ven en el mapa.
- Visitas y ofertas se proponen y responden dentro del chat.
- «Pegar anuncio»: pegas el texto de un anuncio y el formulario se rellena solo.
- Publicar con ayuda: KarmaHouse puede preparar el anuncio contigo por correo, con tu autorización.
- Fotos optimizadas y ahorro de datos.
- **Ya disponible para Android**: KarmaHouse 0.1.25, Android 7 o superior, APK oficial en karmahouse.site. CTA: «Descarga KarmaHouse para Android».
- **También en el navegador**: app.karmahouse.site, con la misma cuenta, en el teléfono o el ordenador. Los avisos en el teléfono, por ahora, solo llegan con la app de Android. No anunciar iPhone hasta probarlo en un iPhone real.

Never invent user counts, listing counts, real prices, testimonials, partners or awards. Label
illustrative photos and example chats: «Imagen ilustrativa», «Ejemplo de uso».

## Assets (paths from the repo root)

- `assets/karmahouse-logo.png` — mark + wordmark, blue on transparent. Light grounds only; on dark
  grounds render it white (`filter: brightness(0) invert(1)`). Never recolor it to another hue.
- `assets/karmahouse-mark.png` — the house/infinity mark alone, same rules.
- `assets/karmahouse-icon.png` — app icon (blue square).
- `web/public/vedado.jpg`, `web/public/interior.jpg` — AI-generated fictional homes
  (`assets/images/PROVENANCE.md`). Mood only, labelled «Imagen ilustrativa»; never a real listing.
- `artifacts/phone/*.png` — real app screenshots. Check each for real names, emails, phones or chats before use.
- Calistoga font: `web/node_modules/@fontsource/calistoga/files/calistoga-latin-400-normal.woff2`.

## Motion

Motion should feel like the site: soft, confident, architectural. Everything enters on
`cubic-bezier(.22,1,.36,1)`; nothing bounces or spins. Signature moves: a photo opening upward
like a door (clip-path), the mediopunto window lighting pane by pane, the verb in the headline
swapping in place, siblings rising in a 0.08 s stagger, a thin sol → terracota → blue line drawing
left to right. Cuts land on the music. Texture comes from light (warm afternoon glow, soft grain,
the losa pattern at low opacity), not from effects.

## Do / Don't

- Do keep blue as the single strong accent; sol, persiana, terracota and ocre stay small (icons, numerals, one phrase on mar).
- Do use one coloured phrase per headline, not more. Calistoga is weight 400 only; never fake-bold it.
- Do make every button and chip a full pill.
- Don't add other saturated colours, rainbow gradients, neon, glitch or lens flares.
- Don't put text on a photo without the mar overlay.
- Don't show third-party logos (Revolico, WhatsApp, Google Play).
