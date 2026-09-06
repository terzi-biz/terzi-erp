/**
 * Клієнтські теги аналітики: Google Analytics 4 (gtag.js) і Google Tag Manager.
 * Вантажаться лише у браузері й лише коли задано відповідні ідентифікатори.
 */

export const GA_MEASUREMENT_ID: string | undefined =
  import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY;

/** Container ID GTM (GTM-XXXXXXX). Порожньо — тег не вантажиться. */
export const GTM_CONTAINER_ID = "";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

function push(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

let started = false;

/** Одноразова ініціалізація тегів. Безпечно викликати повторно. */
export function initTags() {
  if (started || typeof window === "undefined") return;
  started = true;

  if (GA_MEASUREMENT_ID) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(s);
    push("js", new Date());
    push("config", GA_MEASUREMENT_ID, { send_page_view: false });
  }

  if (GTM_CONTAINER_ID) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
    document.head.appendChild(s);
  }
}

/** Перегляд сторінки у SPA. */
export function trackPageView(path: string) {
  if (typeof window === "undefined") return;
  if (GA_MEASUREMENT_ID) push("event", "page_view", { page_path: path, page_location: window.location.href });
  if (GTM_CONTAINER_ID) window.dataLayer?.push({ event: "spa_page_view", page_path: path });
}

/** Довільна подія (наприклад, створення заявки). */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (GA_MEASUREMENT_ID) push("event", name, params ?? {});
  if (GTM_CONTAINER_ID) window.dataLayer?.push({ event: name, ...(params ?? {}) });
}
