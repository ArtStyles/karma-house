# Vedado demo image provenance

- Asset: `vedado-demo.png`
- Nature: AI-generated fictional property. It does not depict a real listing or a documented real house.
- Method: OpenAI built-in `image_gen` tool; the generated PNG was copied into the project without raster editing or post-processing.
- Generated: 2026-09-16

## Prompt

```text
Use case: photorealistic-natural
Asset type: horizontal real-estate editorial photograph for the KarmaHouse project
Primary request: A realistic architectural photograph of one fictional modest but beautiful 1940s Havana-style house in Vedado, Havana.
Scene/backdrop: Quiet residential Vedado setting with carefully maintained tropical landscaping, mature palms and restrained lush greenery around the house.
Subject: Cream-painted stucco house with subtle sage-green details, a welcoming front terrace with period-appropriate columns, authentic but well-kept 1940s Cuban residential character. Clearly a comfortable, attainable home rather than an extravagant mansion.
Style/medium: Photorealistic natural architectural and real-estate editorial photography; believable materials, proportions, aging, and fine texture; polished but not over-staged.
Composition/framing: Single continuous image, landscape 3:2 aspect ratio, eye-level wide architectural framing showing the facade, terrace, garden, and a little context. Straight verticals and natural lens perspective.
Lighting/mood: Warm natural late-afternoon daylight, inviting and calm, realistic soft shadows.
Color palette: Warm cream, muted sage, natural terracotta and rich tropical greens.
Constraints: No people, no text, no logos, no watermark, no signage. One house and one photograph only. No collage, no split screen, no border.
Avoid: palace, luxury mansion, oversized estate, resort, fantasy architecture, exaggerated HDR, CGI or illustration look, cars dominating the frame.
```

## Interior demo image provenance

- Asset: `interior-demo.png`
- Nature: AI-generated fictional property interior. It does not depict a real listing or a documented real apartment.
- Method: OpenAI built-in `image_gen` tool; the generated PNG was copied into the project without raster editing or post-processing.
- Generated: 2026-09-16

### Prompt

```text
Use case: photorealistic-natural
Asset type: horizontal real-estate editorial photograph for the KarmaHouse project
Primary request: A realistic photograph of the bright living room in a fictional Havana apartment.
Scene/backdrop: Well-kept Cuban apartment interior with authentic residential character, generous ceiling height and natural ventilation.
Subject: Airy living room with high ceilings, traditional patterned mosaic tile floor, sage-green wooden louvered shutters, restrained comfortable furniture, and one healthy tropical houseplant. Modest, tasteful and lived-in, suitable for a believable property listing.
Style/medium: Photorealistic natural interior and real-estate editorial photography; believable proportions, materials, surface texture and restrained styling.
Composition/framing: Single continuous image, landscape 3:2 aspect ratio, eye-level wide interior framing showing the room coherently. Natural lens perspective and straight verticals.
Lighting/mood: Abundant warm natural daylight entering through the shutters, calm and inviting, with realistic soft shadows.
Color palette: Warm off-white, muted sage green, natural wood, subdued earth tones and patterned mosaic accents.
Constraints: No people, no text, no logos, no watermark, no signage. One room and one photograph only. No collage, no split screen, no border.
Avoid: luxury penthouse, extravagant mansion decor, hotel lobby, sterile showroom, excessive ornament, exaggerated HDR, CGI or illustration look.
```

## House walk (web/public/casa)

- Assets: `web/public/casa/NNN-720.webp`, `NNN-1280.webp` (70 photos), `NNN-d.webp` (depth maps), `hero-*.webp` (first photo in the pause duotone).
- Nature: AI-generated fictional 1940s Havana house, seen as one continuous walk from the porch to the rooftop and the sea. It does not depict a real listing or a documented real house. The page labels it «Imagen ilustrativa».
- Method: Codex CLI `exec` with the built-in image generation tool, October 2026. Each photo was generated from the previous one, with the porch photo as a colour reference; photos in between were generated with both neighbours as references. Depth maps come from Depth Anything V2 Small, run locally. `web/scripts/tour-assets.py` pulls the colour of the photos before the rooftop toward the porch photo, resizes them and saves WebP. The source PNGs, the camera script (`steps.txt`) and the generation scripts are kept outside git in `artifacts/tour/casa/`.

### Prompt for each step (`<step>` is one line of the camera script)

```text
The attached image is one photograph from a continuous walk through a single fictional 1940s Havana house (Vedado). Generate the NEXT photograph of this walk, taken by the same photographer a moment later, after the photographer <step>. Keep everything that is still visible exactly the same: architecture, hydraulic floor tiles and their pattern, furniture, plants, objects, colours, materials, and the warm late-afternoon light direction and shadows. Anything that newly comes into view belongs to the same house: same style, materials, palette (cream limewashed walls, sage-green louvered shutters, terracotta and sage hydraulic tiles) and the same light. Same lens (about 24 mm) and eye height (about 1.5 m) unless the step says otherwise, straight verticals. Extreme photographic quality: ultra-detailed, tack-sharp, realistic textures and natural light, like a high-end architectural photograph taken with a full-frame camera; no softening, no blur, no plastic or CGI look. The SECOND attached image is only a style reference: match its natural colour grading, exposure, contrast and level of realism exactly. Restrained, natural colours: no oversaturation, no orange cast, no HDR or glossy look; a modest, lived-in family home, not a resort or luxury hotel. Landscape 3:2. No people, no animals, no text, no logos, no watermark. Single photograph, no collage, no border.
```
