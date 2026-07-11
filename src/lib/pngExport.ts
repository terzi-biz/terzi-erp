/**
 * Експорт кошторису у PNG/PDF з фіксованими TERZI-колонтитулами на кожній сторінці.
 * — PNG: єдине зображення (без поділу на half-файли), 3× DPI.
 * — PDF: header/footer як зображення на кожній A4-сторінці, контент нарізається
 *   між ними по «безпечних» точках (block-заголовки, subtotals, tr) на цілих
 *   піксельних межах, щоб не було зсуву ліній таблиць.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import headerImg from "@/assets/terzi-header.jpg";
import footerImg from "@/assets/terzi-footer.png";

const HTML2CANVAS_OPTS = {
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

function collectSafeBreakpoints(root: HTMLElement, scale: number): number[] {
  const rootTop = root.getBoundingClientRect().top;
  const els = root.querySelectorAll<HTMLElement>(
    "[data-pdf-block], thead, tfoot, tr, header, footer, h1, h2, h3",
  );
  const pts = new Set<number>();
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    // Округлюємо ДОНИЗУ до цілого пікселя, щоб різ по границі не роздвоював border.
    pts.add(Math.floor((r.bottom - rootTop) * scale));
  });
  return Array.from(pts).sort((a, b) => a - b);
}

function snapCut(targetEnd: number, points: number[], minStart: number, scale: number): number {
  const minAdvance = minStart + 120 * scale;
  let best = -1;
  for (const p of points) {
    if (p >= minAdvance && p <= targetEnd) best = p;
  }
  return best > 0 ? best : targetEnd;
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
  // Пробуємо scale=3 (крашно), при OOM/помилці — fallback на 2.
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, { ...HTML2CANVAS_OPTS, scale: 3 });
  } catch {
    canvas = await html2canvas(el, { ...HTML2CANVAS_OPTS, scale: 2 });
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
    html2canvas(el, { ...HTML2CANVAS_OPTS, scale }),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210, pageH = 297, margin = 8;
  const usableW = pageW - margin * 2;
  const pxPerMm = canvas.width / usableW;

  const hdrHmm = (hdr.height / hdr.width) * usableW;
  const ftrHmm = (ftr.height / ftr.width) * usableW;
  const contentTop = margin + hdrHmm + 3;
  const contentBottom = pageH - margin - ftrHmm - 3;
  const contentHmm = contentBottom - contentTop;
  const contentPx = Math.floor(contentHmm * pxPerMm);

  const points = collectSafeBreakpoints(el, scale);

  const drawFrame = (pageNum: number, totalPages: number) => {
    pdf.addImage(hdr, "JPEG", margin, margin, usableW, hdrHmm);
    pdf.addImage(ftr, "PNG", margin, pageH - margin - ftrHmm, usableW, ftrHmm);
    // Page number badge поверх футера
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`${pageNum} / ${totalPages}`, pageW - margin - 2, pageH - margin - 1.5, { align: "right" });
  };

  // Спочатку розраховуємо пороги, щоб знати total pages
  const cuts: number[] = [];
  let probe = 0;
  while (probe < canvas.height) {
    const target = Math.min(canvas.height, probe + contentPx);
    const cut = snapCut(target, points, probe, scale);
    cuts.push(cut);
    if (cut <= probe) break; // safety
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
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -offset);
    const drawnHmm = (sliceH / canvas.width) * usableW;
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.92),
      "JPEG",
      margin,
      contentTop,
      usableW,
      Math.min(drawnHmm, contentHmm),
    );
    offset = cut;
  }

  pdf.save(filename);
}
