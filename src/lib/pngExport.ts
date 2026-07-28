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

/** Ширина «віртуального аркуша» для рендера (px). Відповідає A4 при ~110 DPI. */
const EXPORT_WIDTH = 1000;
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
  clonedEl.style.padding = "18px";

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
}

async function captureSheet(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  el.setAttribute(CLONE_MARK, "1");
  try {
    return await html2canvas(el, {
      ...BASE_OPTS,
      scale,
      width: EXPORT_WIDTH,
      windowWidth: EXPORT_WIDTH + 80,
      onclone: (doc: Document) => {
        const clone = doc.querySelector<HTMLElement>(`[${CLONE_MARK}="1"]`);
        if (clone) normalizeClone(el, clone, doc);
      },
    });
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

// ---------- PNG ----------
export async function exportElementAsPng(el: HTMLElement, filename: string): Promise<void> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await captureSheet(el, 3);
  } catch {
    canvas = await captureSheet(el, 2);
  }
  await new Promise<void>((res) => {
    canvas.toBlob((blob) => {
      if (!blob) { res(); return; }
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      res();
    }, "image/png");
  });
}

// ---------- PDF ----------
export async function exportElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const scale = 2;
  const [hdr, ftr, canvas] = await Promise.all([
    loadImage(headerImg),
    loadImage(footerImg),
    captureSheet(el, scale),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210, pageH = 297;
  const sideMargin = 8;              // поля лише для контенту
  const usableW = pageW - sideMargin * 2;

  // Колонтитули — на всю ширину аркуша (без білих границь)
  const hdrHmm = (hdr.height / hdr.width) * pageW;
  const ftrHmm = (ftr.height / ftr.width) * pageW;
  const contentTop = hdrHmm + 3;
  const contentBottom = pageH - ftrHmm - 3;
  const contentHmm = contentBottom - contentTop;

  const drawFrame = (pageNum: number, totalPages: number) => {
    pdf.addImage(hdr, "JPEG", 0, 0, pageW, hdrHmm);
    pdf.addImage(ftr, "PNG", 0, pageH - ftrHmm, pageW, ftrHmm);
    if (totalPages > 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`${pageNum} / ${totalPages}`, pageW - sideMargin, contentBottom + 2.4, { align: "right" });
    }
  };

  // ---- Спроба вмістити все на одну сторінку (зменшенням масштабу до 60%) ----
  const naturalHmm = (canvas.height / canvas.width) * usableW;
  if (naturalHmm <= contentHmm / 0.6) {
    const fitW = Math.min(usableW, (contentHmm / naturalHmm) * usableW);
    const fitH = Math.min(contentHmm, naturalHmm);
    drawFrame(1, 1);
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.94),
      "JPEG",
      (pageW - fitW) / 2,
      contentTop,
      fitW,
      fitH,
    );
    pdf.save(filename);
    return;
  }

  // ---- Інакше — пагінація по рядках таблиць ----
  const pxPerMm = canvas.width / usableW;
  const contentPx = Math.floor(contentHmm * pxPerMm);
  const originalWidth = el.getBoundingClientRect().width || EXPORT_WIDTH;
  const k = (EXPORT_WIDTH / originalWidth) * scale;
  const rootTop = el.getBoundingClientRect().top;
  const breakEls = Array.from(el.querySelectorAll<HTMLElement>("[data-pdf-block], tr, thead, tfoot, h1, h2, h3, header"));
  const points = Array.from(
    new Set(breakEls.map((b) => Math.floor((b.getBoundingClientRect().bottom - rootTop) * k))),
  ).filter((p) => p > 0 && p < canvas.height).sort((a, b) => a - b);

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

  let offset = 0;
  for (let i = 0; i < cuts.length; i++) {
    if (i > 0) pdf.addPage();
    drawFrame(i + 1, totalPages);
    const cut = cuts[i];
    const sliceH = cut - offset;
    if (sliceH <= 0) continue;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -offset);
    const drawnHmm = (sliceH / canvas.width) * usableW;
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.92),
      "JPEG",
      sideMargin,
      contentTop,
      usableW,
      Math.min(drawnHmm, contentHmm),
    );
    offset = cut;
  }

  pdf.save(filename);
}

