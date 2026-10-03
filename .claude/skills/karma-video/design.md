---
version: alpha
name: KarmaHouse — design spec for video
description: >
  Brand truth for KarmaHouse videos, taken from the live landing (web/public/style.css, redesigned
  2026-10-02) and the app theme (src/theme.ts). Editorial and warm: Georgia serif headlines at
  weight 600 with tight tracking and one italic phrase in blue, the system sans for everything
  else, a cream canvas with white cards and navy panels, blue #0756A2 as the only strong accent and
  muted gold for small numerals. The app UI keeps its own blue #0153A8 inside phone screens.
unit: the frame — 1080×1920 (9:16) for Reels, Status and TikTok; 1920×1080 and 1080×1080 also valid
principle: atoms are sacred · composition is free · facts come only from the list below

colors:
  primary: "#0756A2"
  primary-deep: "#064380"
  app-blue: "#0153A8"
  navy: "#132D47"
  ink: "#172A3C"
  text: "#526170"
  muted: "#637180"
  line: "#DFE4E8"
  paper: "#FFFFFF"
  canvas: "#FAF8F3"
  soft: "#F1F4F8"
  gold: "#94712D"
  gold-light: "#E6C580"
  positive: "#227A46"
  on-dark: "#FFFFFF"
  photo-overlay: "linear-gradient(180deg, rgba(19,45,71,0) 40%, rgba(19,45,71,.78) 100%)"

fonts:
  display: 'Georgia, "Times New Roman", serif'
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'

radii:
  button: "8px"
  card: "12px"
  panel: "16px"
  phone: "40px"
  screen: "30px"
  circle: "50%"

typography:
  h1:         { fontFamily: "{fonts.display}", cqw: 4.6, weight: 600, lineHeight: 1.06, tracking: "-0.055em", color: "ink" }
  h1-accent:  { fontFamily: "{fonts.display}", style: italic, weight: 600, color: "primary", description: "the one emphasised phrase inside a headline" }
  h2:         { fontFamily: "{fonts.display}", cqw: 3.0, weight: 600, lineHeight: 1.15, tracking: "-0.035em", color: "ink" }
  eyebrow:    { fontFamily: "{fonts.sans}", cqw: 0.9, weight: 700, tracking: "0.14em", upper: true, color: "primary" }
  body:       { fontFamily: "{fonts.sans}", cqw: 1.2, weight: 400, lineHeight: 1.6, color: "text" }
  numeral:    { fontFamily: "{fonts.display}", cqw: 2.2, weight: 400, color: "gold", description: "step numbers such as 01 02 03" }
  button:     { fontFamily: "{fonts.sans}", cqw: 1.1, weight: 600 }

spacing:
  pad-x: "5cqw"
  gap: "2cqw"

components:
  cta-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{radii.button}"
    typography: "{typography.button}"
    description: "On navy panels invert it: white fill, navy text."
  card:
    backgroundColor: "{colors.paper}"
    border: "1px solid {colors.line}"
    rounded: "{radii.card}"
    shadow: "none"
  soft-panel:
    backgroundColor: "{colors.soft}"
    rounded: "{radii.panel}"
  navy-panel:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-dark}"
    rounded: "{radii.panel}"
    description: "Closing / download panel: white serif headline with its italic phrase in gold-light."
  photo-card:
    rounded: "{radii.panel}"
    shadow: "0 20px 60px rgba(21,43,65,.09)"
    caption: "white Georgia 400 on {colors.photo-overlay}; label illustrative photos as such"
  phone-mockup:
    frame: "{colors.navy}, radius {radii.phone}"
    screen: "app UI in {colors.app-blue}, radius {radii.screen}"
---

# KarmaHouse — design spec for video

## Overview

KarmaHouse is a free app to buy, sell, swap (permuta) or rent a home in Cuba, talking directly with
whoever publishes. The look is editorial and warm, like a well-made magazine about homes: cream
canvas, white cards with hairline borders, navy panels, Georgia headlines with one italic phrase in
blue ("Tu próximo hogar *empieza aquí.*"), and the system sans for small text. Calm, never loud.

Voice: Cuban Spanish, *tú*, short sentences, concrete benefits. Careful and honest, like the live
site: no hype, no promises the app does not keep, no Cuban clichés (old cars, cigars or flags as
decoration).

## Facts — the only claims a video may make

Checked against the live site (karmahouse.vercel.app) on 2026-10-03.

- Compra, vende, permuta o alquila en Cuba, y habla directamente con quien publica.
- Publicar, buscar y conversar es gratis. KarmaHouse no cobra comisión ni interviene en la negociación entre las partes.
- Anuncios revisados antes de publicarse. (La revisión no certifica la propiedad: never say "verificado" or "garantizado".)
- Para las provincias de Cuba y la Isla de la Juventud. (Do not say "16 provincias".)
- Tu teléfono y tu correo no se muestran a otros usuarios; la conversación ocurre dentro de la app; puedes bloquear o reportar.
- Quien publica decide si muestra la ubicación exacta o aproximada; las viviendas se ven en el mapa.
- Visitas y ofertas se proponen y responden dentro del chat.
- «Pegar anuncio»: pegas el texto de un anuncio y el formulario se rellena solo; los datos de contacto se quitan.
- Fotos optimizadas y ahorro de datos.
- Hecho para Cuba. Android 7 o superior.
- **The Android APK is not publicly available yet** ("próxima versión en preparación"). Do not say "descarga" or "ya disponible"; close with "Muy pronto en Android" and/or karmahouse.vercel.app until the site says otherwise.

Never invent user counts, listing counts, real prices, testimonials, partners or awards. Follow the
site's disclosure habit: illustrative photos and example conversations carry a small label
("Imagen ilustrativa", "Ejemplo de uso").

## Assets (paths from the repo root)

- `assets/karmahouse-logo.png` — mark + wordmark, blue on transparent. Light grounds only; on dark
  grounds render it white with `filter: brightness(0) invert(1)`. Never recolor it to another hue.
- `assets/karmahouse-mark.png` — the house/infinity mark alone, same rules.
- `assets/karmahouse-icon.png` — app icon (blue square).
- `web/public/vedado.jpg`, `web/public/interior.jpg` — AI-generated fictional homes
  (`assets/images/PROVENANCE.md`). Mood only, labelled "Imagen ilustrativa"; never a real listing.

## Do / Don't

- Do keep blue as the single strong accent; gold only for small numerals or the italic phrase on navy.
- Do use one italic serif phrase per headline, not more.
- Don't add other saturated accents, rainbow gradients or neon.
- Don't put text on a photo without the navy overlay.
- Don't show third-party logos (Revolico, WhatsApp, Google Play).
