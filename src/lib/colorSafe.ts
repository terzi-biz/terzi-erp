/**
 * Конвертація сучасних CSS-кольорів (oklch/oklab/lab/lch) у rgb().
 * Потрібна тому, що html2canvas 1.x не вміє парсити oklch() — саме через це
 * експорт PNG/PDF падав з помилкою на темі TERZI (усі токени в oklch).
 */

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function gamma(c: number) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(clamp01(v) * 255);
}

function oklabToRgb(L: number, a: number, b: number, alpha: number): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const A = alpha >= 1 ? 1 : Math.max(0, alpha);
  return `rgba(${gamma(r)}, ${gamma(g)}, ${gamma(bl)}, ${A})`;
}

function parseNums(body: string): { nums: number[]; alpha: number } {
  const [main, alphaPart] = body.split("/");
  const nums = main
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t)));
  let alpha = 1;
  if (alphaPart != null) {
    const a = alphaPart.trim();
    alpha = a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
    if (!Number.isFinite(alpha)) alpha = 1;
  }
  return { nums, alpha };
}

/** Замінює всі oklch()/oklab()/lch()/lab() у CSS-значенні на rgba(). */
export function toSafeColor(value: string): string {
  if (!value || !/(oklch|oklab|lch|lab)\(/i.test(value)) return value;
  return value.replace(/(oklch|oklab|lch|lab)\(([^()]*)\)/gi, (_m, fn: string, body: string) => {
    const { nums, alpha } = parseNums(body);
    if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) return "rgba(0, 0, 0, 0)";
    const f = fn.toLowerCase();
    if (f === "oklch") {
      const [L, C, H] = nums;
      const h = (H * Math.PI) / 180;
      return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h), alpha);
    }
    if (f === "oklab") return oklabToRgb(nums[0], nums[1], nums[2], alpha);
    if (f === "lch") {
      const [L, C, H] = nums;
      const h = (H * Math.PI) / 180;
      return oklabToRgb(L / 100, (C / 100) * Math.cos(h) * 0.4, (C / 100) * Math.sin(h) * 0.4, alpha);
    }
    // lab()
    return oklabToRgb(nums[0] / 100, nums[1] / 250, nums[2] / 250, alpha);
  });
}

const COLOR_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "column-rule-color",
  "fill",
  "stroke",
  "background-image",
  "box-shadow",
] as const;

/**
 * Проходить по клонованому дереву і замінює всі непідтримувані кольори
 * інлайновими rgba() значеннями (інлайн має пріоритет для html2canvas).
 */
export function sanitizeColorsDeep(root: HTMLElement, doc: Document) {
  const win = doc.defaultView ?? window;
  const nodes: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of nodes) {
    let cs: CSSStyleDeclaration;
    try {
      cs = win.getComputedStyle(el);
    } catch {
      continue;
    }
    for (const prop of COLOR_PROPS) {
      const raw = cs.getPropertyValue(prop);
      if (!raw || !/(oklch|oklab|lch|lab)\(/i.test(raw)) continue;
      el.style.setProperty(prop, toSafeColor(raw));
    }
  }
}
