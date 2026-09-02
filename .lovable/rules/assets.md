---
description: "Brand assets shipped by the TERZI ERP system  design system (logos, icons, illustrations, photography, fonts, videos) with exact import paths. Read before adding any logo, icon, illustration, image, video, or font to the app: use these real assets instead of placeholders, stock photos, or generated images."
---

# TERZI ERP system  — Assets

These files are copied into `src/design-system/{slug}/assets/` in this project — never generate, placeholder, or substitute an asset that exists here.

Raw files import directly, e.g. `import logo from "@/design-system/{slug}/assets/logos/logo.svg"`.
R2 pointer files (`.asset.json`) are imported as JSON — use the `url` property, e.g. `import hero from "@/design-system/{slug}/assets/hero.png.asset.json"` then `<img src={hero.url} />`.
The full machine-readable catalog lives in this library's `design-system.json` (`assets` array).

## Logos

- `@/design-system/{slug}/assets/terzi-logo-gold.jpeg.asset.json` (jpeg, R2 pointer)
- `@/design-system/{slug}/assets/terzi-logo.jpeg.asset.json` (jpeg, R2 pointer)

## Images

- `@/design-system/{slug}/assets/terzi-footer.png` (png)
- `@/design-system/{slug}/assets/terzi-header.jpg` (jpg)
- `@/design-system/{slug}/assets/terzi-hero.jpeg.asset.json` (jpeg, R2 pointer)

