# Mascot provenance

## Bloque, the KarmaHouse mascot

- Assets: `bloque-lamina.png` (the six-pose model sheet as generated) and one transparent PNG per pose:
  `bloque-base.png`, `bloque-saluda.png`, `bloque-senala.png`, `bloque-sorprendida.png`, `bloque-celebra.png`, `bloque-piensa.png`.
- Nature: AI-generated original character, a voxel house born from the KarmaHouse mark (roof and chimney, the
  infinity swoosh as a scarf, a mediopunto fanlight as the forehead). Not based on any existing mascot.
- Method: Codex CLI `codex exec` with the built-in `image_gen` tool (`$imagegen`), with `assets/karmahouse-mark.png`
  attached as the reference. The tool returned real alpha. The pose PNGs are the six 512×512 cells of the sheet,
  trimmed to the figure plus 12 px; no other raster editing.
- Generated: 2026-10-18. Chosen by the user from three concepts (Casita, Lazo, Bloque); the other two and the
  comparison sheet are kept outside git in `artifacts/instagram/mascota/`.
- Use: social posts and videos (BRAND.md «Redes y video»). It is a character, not the logo: it can change pose,
  colour or props. Never place it as a replacement for the logo.

### Prompt

```text
Attached image: the KarmaHouse logo mark (a blue pitched house roof with a small chimney, sitting on a blue infinity-loop swoosh). KarmaHouse is a free app to buy, sell, swap or rent a home in Cuba.

Task: use $imagegen (the built-in image_gen tool) exactly once to create ONE character model sheet for an ORIGINAL mascot that is clearly born from this mark. Do not write code or scripts. When the image is ready, copy the generated PNG file into the current working directory with the file name given at the end, and reply with its path.

Sheet layout: landscape 1536x1024, 3 columns x 2 rows, six full-body figures of the SAME character at the same scale, evenly spaced, nothing touching or overlapping, each figure fully inside its cell:
1. neutral front view, friendly smile (hero pose)
2. waving hello with one hand (greets)
3. pointing with one arm to the right side of the frame, as if pointing at a headline
4. surprised: eyes wide, mouth open in an O, hands up near the face
5. celebrating: jumping, both arms up, a few small yellow and terracotta confetti pieces
6. thinking: one hand on the chin, eyes looking up, slight head tilt

Character rules: big expressive eyes, simple strong silhouette readable at small size on a phone, warm and kind, appealing for adults and kids, Cuban warmth without cliches. Palette: KarmaHouse blue #0153A8 dominant, limewash cream #FAF6EE, small accents of sun yellow #E3B04B and terracotta #A84C33. No green anywhere on the character. Keep identical proportions, colours and details in all six figures.

Background: genuinely transparent (alpha). If transparency is not possible, use a perfectly flat solid pure green #00FF00 background with no floor, no shadow, no gradient, no texture. No text, no letters, no labels, no numbers, no logos, no watermark anywhere in the image. Not a copy of any existing mascot or brand character.

Concept "Bloque" (the voxel house): a cute voxel character built from small cubes, like a tiny 3D pixel-art house come alive: blue voxel pitched roof with the chimney from the mark, cream voxel facade as the body, a half-moon stained-glass fanlight window (Cuban mediopunto) in blue, yellow and terracotta panes as its forehead, big square pixel eyes and a small pixel smile on the facade, the blue infinity swoosh as a voxel scarf around the base, short blocky arms and legs. Render style: crisp 3D voxel render with tiny bevels, warm afternoon light from the left, soft rim light, high quality.

Save as: concepto-3-bloque.png
```

## The second character (persona)

- Assets: `persona-lamina.png` and `persona-base.png`, `persona-cansada.png`, `persona-sorprendida.png`,
  `persona-pulgar.png`, `persona-senala.png`, `persona-saluda.png`.
- Nature: AI-generated fictional person who lives in Bloque's voxel world: a young Cuban woman with a phone. She is
  not a real person and has no name, and she is never presented as a customer or a testimonial.
- Method: same as Bloque, with `bloque-lamina.png` attached as the style reference; cells trimmed the same way.
- Generated: 2026-10-18.

### Prompt

```text
The attached image is the model sheet of "Bloque", the voxel mascot of KarmaHouse (a free app to buy, sell, swap or rent a home in Cuba). Use it only as the STYLE reference: same crisp 3D voxel render with tiny bevels, same cube size logic, same warm afternoon light and quality.

Task: use $imagegen (the built-in image_gen tool) exactly once. Do not write code or scripts. When the image is ready, copy the generated PNG into the current working directory with the file name given at the end, and reply with its path.

Create ONE character model sheet for a SECOND character who lives in the same voxel world as Bloque: a fictional young Cuban woman, about 30, warm brown skin, dark curly hair in a voxel bun, friendly face with simple pixel eyes like Bloque, casual clothes: sun-yellow #E3B04B t-shirt, blue jeans, terracotta sneakers. Same voxel build, render style and light as Bloque. She is a fictional person, not anyone real.

Sheet layout: landscape 1536x1024, 3 columns x 2 rows, six full-body figures of the SAME character at the same scale, evenly spaced, nothing touching or overlapping, each figure fully inside its cell:
1. neutral, holding a smartphone, smiling
2. tired and frustrated, typing on the smartphone with a sigh
3. surprised, looking at the smartphone, eyes wide
4. happy, thumbs up, phone in the other hand
5. pointing with one arm to the right side of the frame
6. waving hello

Keep identical proportions, colours and details in all six figures. Background: genuinely transparent (alpha). If transparency is not possible, use a perfectly flat solid pure green #00FF00 background with no floor, no shadow, no gradient. No text, no letters, no labels, no numbers, no logos, no watermark.

Save as: persona.png
```

## New poses

Generate them the same way, attaching `bloque-lamina.png` (or `persona-lamina.png`) and asking for a new sheet of the
same character with the poses you need. Add each new file and its prompt here.
