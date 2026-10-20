# Auth emails with an opening-door GIF

Approved by the user on 2026-10-20.

## Goal

Make the Supabase Auth emails (confirm sign-up, reset password) feel more crafted with one light
animated header: a Cuban door opening into a home.

## GIF

- Built by `infra/email-templates/puerta-gif.py` with Pillow (frames) and FFmpeg (palette and GIF),
  from `web/public/interior.jpg` (AI-generated fictional interior, «Imagen ilustrativa»).
- Cream limewash facade, a two-leaf door in persiana green `#3F6B4F` under a *mediopunto*
  fanlight, closed louvered shutters on each side.
- 0–0.4 s: closed door. 0.4–1.2 s: fanlight panes light one by one (sol, terracota, blue). 1.2–2.4 s: leaves swing inward
  on `cubic-bezier(.22,1,.36,1)` and reveal the room. Plays once and stays open.
- First frame (what Outlook desktop shows) is the closed door, complete on its own.
- 480×400 px (1x, 128 colours, 15 fps), about 133 KB, served from `https://www.karmahouse.site/email/puerta.gif`
  (`web/public/email/puerta.gif`).

## Emails

- Same GIF in both emails, at the top of the card, with alt text and a visible «Imagen ilustrativa».
- A thin sol → terracota → blue line built from table cells, no extra image.
- Everything else stays: heading with one blue phrase, pill button, one-use link note, support footer.
  `{{ .ConfirmationURL }}` stays untouched.

## Checks

GIF weight and key frames; both emails in the browser at 360 and 640 px with no horizontal overflow.
