/**
 * Експорт кошторису у PNG/PDF з фіксованими TERZI-колонтитулами на кожній сторінці.
 *
 * Ключові моменти:
 *  — Захоплення відбувається з КЛОНА елемента фіксованої ширини (A4-пропорція),
 *    тому результат однаковий на iPhone/Android і на desktop (без «з'їхалих» колонок).
 *  — Значення <input> (ручні правки назв, к-сті, цін) переносяться у статичний текст,
 *    інакше html2canvas друкує початкові/порожні значення.
 *  — Мінімальні поля сторінки, контент масштабується по ширині A4.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import headerImg from "@/assets/terzi-header.jpg";
import footerImg from "@/assets/terzi-footer.png";
import { sanitizeColorsDeep } from "@/lib/colorSafe";


/** Ширина «віртуального аркуша» для рендера (px). Відповідає A4 при ~110 DPI. */
const EXPORT_WIDTH = 900;
const CLONE_MARK = "data-terzi-export-root";

const BASE_OPTS = {
  backgroundColor: "#ffffff" as const,
  useCORS: true,
  logging: false,
  imageTimeout: 0,
  removeContainer: true,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/** Замінює поля вводу статичним текстом і фіксує ширину клона. */
function normalizeClone(original: HTMLElement, clonedEl: HTMLElement, clonedDoc: Document) {
  clonedEl.style.width = `${EXPORT_WIDTH}px`;
  clonedEl.style.maxWidth = "none";
  clonedEl.style.minWidth = `${EXPORT_WIDTH}px`;
  clonedEl.style.overflow = "visible";
  // Аркуш друкується «під обріз»: без власних полів, рамок і тіней —
  // поля задає сам PDF, інакше на сторінці зʼявляється зайва біла рамка.
  clonedEl.style.padding = "6px";
  clonedEl.style.margin = "0";
  clonedEl.style.border = "none";
  clonedEl.style.borderRadius = "0";
  clonedEl.style.boxShadow = "none";
  clonedEl.style.background = "#ffffff";

  const origFields = Array.from(
    original.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
  );
  const cloneFields = Array.from(
    clonedEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
  );

  cloneFields.forEach((field, i) => {
    const src = origFields[i];
    const raw = src ? src.value : (field as HTMLInputElement).value;
    const cs = src ? window.getComputedStyle(src) : window.getComputedStyle(field);
    const span = clonedDoc.createElement("span");
    span.textContent = raw ?? "";
    span.style.display = "block";
    span.style.width = "100%";
    span.style.font = cs.font;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.color = cs.color === "rgba(0, 0, 0, 0)" ? "#0f172a" : cs.color;
    span.style.textAlign = cs.textAlign;
    span.style.whiteSpace = "normal";
    span.style.wordBreak = "break-word";
    span.style.lineHeight = "1.25";
    field.replaceWith(span);
  });

  // Ховаємо службові контроли (кнопки додавання/видалення позицій тощо)
  clonedEl.querySelectorAll<HTMLElement>(".print\\:hidden, [data-export-hide]").forEach((el) => {
    el.style.display = "none";
  });

  // html2canvas не парсить oklch() — переводимо всі кольори у rgba()
  sanitizeColorsDeep(clonedEl, clonedDoc);
}


/** Селектори елементів, по нижній межі яких дозволено різати сторінку. */
const BREAK_SELECTOR = "[data-pdf-block], tr, thead, tfoot, h1, h2, h3, header";

/**
 * Захоплення аркуша + точки безпечного розриву сторінок.
 * ВАЖЛИВО: точки міряються всередині КЛОНА (ширина EXPORT_WIDTH), бо там інша
 * розкладка рядків, ніж в оригіналі — інакше розріз потрапляє всередину рядка.
 */
async function captureSheet(
  el: HTMLElement,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; breaks: number[] }> {
  el.setAttribute(CLONE_MARK, "1");
  let breaks: number[] = [];
  try {
    const canvas = await html2canvas(el, {
      ...BASE_OPTS,
      scale,
      width: EXPORT_WIDTH,
      windowWidth: EXPORT_WIDTH + 80,
      onclone: (doc: Document) => {
        const clone = doc.querySelector<HTMLElement>(`[${CLONE_MARK}="1"]`);
        if (!clone) return;
        normalizeClone(el, clone, doc);
        const cloneTop = clone.getBoundingClientRect().top;
        breaks = Array.from(
          new Set(
            Array.from(clone.querySelectorAll<HTMLElement>(BREAK_SELECTOR)).map((b) =>
              Math.ceil((b.getBoundingClientRect().bottom - cloneTop) * scale),
            ),
          ),
        ).sort((a, b) => a - b);
      },
    });
    return {
      canvas,
      breaks: breaks.filter((p) => p > 0 && p < canvas.height),
    };
  } finally {
    el.removeAttribute(CLONE_MARK);
  }
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------- PNG (максимальна якість) ----------
/** Ліміти канви: довша сторона та загальна площа (найсуворіший — iOS Safari). */
const MAX_CANVAS_PX = 16000;
const MAX_CANVAS_AREA = 16_000_000;

/** Створює PNG-blob максимальної якості з готової канви. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => {
    if (typeof canvas.toBlob === "function") canvas.toBlob((b) => res(b), "image/png");
    else {
      // Safari < 14 fallback
      const data = canvas.toDataURL("image/png").split(",")[1];
      const bin = atob(data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      res(new Blob([arr], { type: "image/png" }));
    }
  });
}

export async function savePngBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

// ---------- Розкладка PDF ----------
interface PdfLayout {
  doc: jsPDF;
  /** Позиції розривів (px у координатах canvas), включно з кінцем аркуша. */
  cuts: number[];
  totalPages: number;
  canvasHeight: number;
}

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const SIDE_MARGIN_MM = 5;
/** Роздільність рендера сторінки (px на мм) — ~200 DPI. */
const PAGE_PPM = 8;

interface PagedSheet {
  pages: HTMLCanvasElement[];
  cuts: number[];
  canvasHeight: number;
}

/**
 * Готує готові сторінки A4 (колонтитули + зріз кошторису) як канви.
 * Використовується І для PDF, І для PNG — тому обидва файли ідентичні.
 */
async function buildPageCanvases(el: HTMLElement): Promise<PagedSheet> {
  const [hdr, ftr, sheet] = await Promise.all([
    loadImage(headerImg),
    loadImage(footerImg),
    captureSheet(el, 2),
  ]);
  const { canvas, breaks: points } = sheet;

  const usableW = PAGE_W_MM - SIDE_MARGIN_MM * 2;
  const hdrHmm = (hdr.height / hdr.width) * PAGE_W_MM;
  const ftrHmm = (ftr.height / ftr.width) * PAGE_W_MM;
  const contentTop = hdrHmm + 3;
  const contentBottom = PAGE_H_MM - ftrHmm - 3;
  const contentHmm = contentBottom - contentTop;

  const mkPage = (): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const c = document.createElement("canvas");
    c.width = Math.round(PAGE_W_MM * PAGE_PPM);
    c.height = Math.round(PAGE_H_MM * PAGE_PPM);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    return { c, ctx };
  };

  const drawFrame = (ctx: CanvasRenderingContext2D, pageNum: number, totalPages: number) => {
    ctx.drawImage(hdr, 0, 0, PAGE_W_MM * PAGE_PPM, hdrHmm * PAGE_PPM);
    ctx.drawImage(ftr, 0, (PAGE_H_MM - ftrHmm) * PAGE_PPM, PAGE_W_MM * PAGE_PPM, ftrHmm * PAGE_PPM);
    if (totalPages > 1) {
      ctx.fillStyle = "#787878";
      ctx.font = `${Math.round(2.8 * PAGE_PPM)}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(`${pageNum} / ${totalPages}`, (PAGE_W_MM - SIDE_MARGIN_MM) * PAGE_PPM, (contentBottom + 2.4) * PAGE_PPM);
      ctx.textAlign = "left";
    }
  };

  // ---- Спроба вмістити все на одну сторінку ----
  const naturalHmm = (canvas.height / canvas.width) * usableW;
  if (naturalHmm <= contentHmm / 0.6) {
    const fitW = Math.min(usableW, (contentHmm / naturalHmm) * usableW);
    const fitH = Math.min(contentHmm, naturalHmm);
    const { c, ctx } = mkPage();
    drawFrame(ctx, 1, 1);
    ctx.drawImage(canvas, ((PAGE_W_MM - fitW) / 2) * PAGE_PPM, contentTop * PAGE_PPM, fitW * PAGE_PPM, fitH * PAGE_PPM);
    return { pages: [c], cuts: [canvas.height], canvasHeight: canvas.height };
  }

  // ---- Пагінація по рядках таблиць ----
  const pxPerMm = canvas.width / usableW;
  const contentPx = Math.floor(contentHmm * pxPerMm);

  const snapCut = (targetEnd: number, minStart: number): number => {
    const minAdvance = minStart + contentPx * 0.55;
    let best = -1;
    for (const p of points) {
      if (p >= minAdvance && p <= targetEnd) best = p;
    }
    return best > 0 ? best : targetEnd;
  };

  const cuts: number[] = [];
  let probe = 0;
  while (probe < canvas.height) {
    const target = Math.min(canvas.height, probe + contentPx);
    const cut = target >= canvas.height ? canvas.height : snapCut(target, probe);
    cuts.push(cut);
    if (cut <= probe) break;
    probe = cut;
  }
  const totalPages = cuts.length || 1;

  const pages: HTMLCanvasElement[] = [];
  let offset = 0;
  for (let i = 0; i < cuts.length; i++) {
    const { c, ctx } = mkPage();
    drawFrame(ctx, i + 1, totalPages);
    const cut = cuts[i];
    const sliceH = cut - offset;
    if (sliceH > 0) {
      const drawnHmm = Math.min((sliceH / canvas.width) * usableW, contentHmm);
      ctx.drawImage(
        canvas,
        0, offset, canvas.width, sliceH,
        SIDE_MARGIN_MM * PAGE_PPM, contentTop * PAGE_PPM, usableW * PAGE_PPM, drawnHmm * PAGE_PPM,
      );
    }
    offset = cut;
    pages.push(c);
  }

  return { pages, cuts, canvasHeight: canvas.height };
}

async function buildPdf(el: HTMLElement): Promise<PdfLayout> {
  const { pages, cuts, canvasHeight } = await buildPageCanvases(el);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(page.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
  });
  return { doc: pdf, cuts, totalPages: pages.length || 1, canvasHeight };
}

export async function exportElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const { doc } = await buildPdf(el);
  doc.save(filename);
}

/**
 * PNG — точна копія PDF: ті самі сторінки A4 з колонтитулами,
 * складені вертикально в одне зображення.
 */
export async function exportElementAsPng(el: HTMLElement, filename: string): Promise<void> {
  const { pages } = await buildPageCanvases(el);
  const gap = pages.length > 1 ? Math.round(4 * PAGE_PPM) : 0;
  const out = document.createElement("canvas");
  out.width = pages[0]?.width ?? Math.round(PAGE_W_MM * PAGE_PPM);
  out.height = pages.reduce((h, p) => h + p.height, 0) + gap * Math.max(0, pages.length - 1);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const p of pages) {
    ctx.drawImage(p, 0, y);
    y += p.height + gap;
  }
  const blob = await canvasToPngBlob(out);
  if (blob) await savePngBlob(blob, filename);
}
