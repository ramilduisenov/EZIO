# EZIO — landing concept

Interactive one-page landing concept for EZIO, a soda drink for heartburn (Yuria-Pharm), Uzbek / Russian.

- Fizzing bubbles in the hero that follow the cursor
- Interactive 3D bottle (three.js, model generated from product photos, transparent PET shader)
- "Bugun dasturxonda nima bor edi?" feast test
- Mineral composition as interactive bubbles
- EZIO Run — a Chrome-dino style mini-game: jump over samsa, plov and shashlik, duck under heartburn flames
- FAQ and where to buy (placeholders)

Static HTML, no build step. three.js is vendored in `js/vendor`, the model is `models/ezio.glb` (meshopt + WebP, 650 KB). Serve the folder over HTTP (ES modules don't load from file://).
Product images were generated in Flora (GPT Image Sunburst, Nano Banana 2.1). This is a concept, not an official brand site.
