# Water Together — liquid glass

The approved source `water-glass-source.png` was generated with the built-in
imagegen tool on 2026-10-18. Production derivatives are in `frontend/public/brand`
and `frontend/public/icon-cinematic-*.png`. Run `node scripts/generate-icons.mjs`
to recreate them, including the ICO and transparent 96 px notification badge.

## Final generation prompt

Use case: stylized-concept. Create a finished premium cinematic 3D brand icon for
Water Together, a sophisticated water hydration mobile app. Square 1024x1024
full bleed composition, dark midnight navy smooth background (#061426), centered
single sculptural water droplet made of thick translucent optical glass and
liquid cyan, elegant droplet silhouette immediately readable at small sizes.
A smaller fluid crescent nested inside suggests togetherness, NOT two separate
floating drops. High-end luxury tech product render, sculpted volume, realistic
refraction, rich deep cobalt core, luminous ice-blue rim highlights, subtle teal
caustics below and one restrained soft halo. Main silhouette within central 65%
of square for maskable app icon safe area. Crisp clean studio photography,
cinematic side lighting, exquisite material depth. No text, no letters, no
borders, no rounded-square container, no mockup, no UI, no extra objects,
no sparkles, no busy background, no cartoon.

## Motion

The launch screen combines the raster glass sculpture with CSS transform and
opacity animation: six-second buoyancy, five-second light sweep, staggered
elliptical ripples, and a quiet indeterminate line. It does not simulate loading
percentages. Network requests start immediately, the intro holds for at most
1.05 seconds once data is available, and exit takes 450 ms. Reduced-motion users
skip that hold and animation. Connection errors remain visible with retry.

The opaque color icon is for the launcher and expanded notification. The status
bar uses a separate white-on-transparent alpha silhouette; using the opaque icon
there produces a filled square on Android. Old icon URLs remain available for
existing installations, while new names encourage launcher cache refresh.
