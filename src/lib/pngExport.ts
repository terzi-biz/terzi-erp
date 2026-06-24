/**
 * Експорт DOM-елементу у PNG/PDF.
 * Розумна пагінація: cut snap до найближчого "безпечного" Y-офсету
 * (елементи з data-pdf-block), щоб не різати таблиці/секції посередині.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

function collectSafeBreakpoints(root: HTMLElement, scale: number): number[] {
  const rootTop = root.getBoundingClientRect().top;
  const els = root.querySelectorAll<HTMLElement>("[data-pdf-block], tr");
  const points: number[] = [];
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    // bottom edge of each block, у координатах canvas
    points.push(Math.round((r.bottom - rootTop) * scale));
  });
  return Array.from(new Set(points)).sort((a, b) => a - b);
}

function snapCut(targetEnd: number, points: number[], minStart: number, scale: number): number {
  // Шукаємо найбільшу безпечну точку <= targetEnd та > minStart + 50*scale (щоб не зациклитися)
  const minAdvance = minStart + 80 * scale;
  let best = targetEnd;
  for (const p of points) {
    if (p > minStart && p <= targetEnd && p >= minAdvance) {
      if (p > best - 1 || best === targetEnd) best = p;
    }
  }
  // Якщо немає підходящих → лишаємо targetEnd як було
  return best;
}

export async function exportElementAsPng(el: HTMLElement, filename: string): Promise<void> {
  const scale = 2;
  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff", scale, useCORS: true, logging: false,
  });
  // Якщо контент дуже високий — ріжемо на кілька PNG.
  const MAX = 6000;
  if (canvas.height <= MAX) {
    triggerDownload(canvas.toDataURL("image/png"), filename);
    return;
  }
  const points = collectSafeBreakpoints(el, scale);
  let offset = 0, part = 1;
  while (offset < canvas.height) {
    const proposed = Math.min(canvas.height, offset + MAX);
    const cut = snapCut(proposed, points, offset, scale);
    const sliceH = cut - offset;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -offset);
    triggerDownload(slice.toDataURL("image/png"), filename.replace(/\.png$/i, `-part${part}.png`));
    offset = cut;
    part++;
  }
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const scale = 2;
  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff", scale, useCORS: true, logging: false,
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210, pageH = 297, margin = 8;
  const usableW = pageW - margin * 2;
  const pxPerMm = canvas.width / usableW;
  const pageContentHmm = pageH - margin * 2;
  const pageContentPx = pageContentHmm * pxPerMm;

  const ratio = canvas.height / canvas.width;
  const imgHmm = usableW * ratio;

  if (imgHmm <= pageContentHmm) {
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, usableW, imgHmm);
    pdf.save(filename);
    return;
  }

  const points = collectSafeBreakpoints(el, scale);
  let offset = 0;
  let first = true;
  while (offset < canvas.height) {
    const proposed = Math.min(canvas.height, offset + pageContentPx);
    const cut = snapCut(proposed, points, offset, scale);
    const sliceH = cut - offset;
    if (sliceH <= 0) break; // safety
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -offset);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, usableW, (sliceH / canvas.width) * usableW);
    first = false;
    offset = cut;
  }
  pdf.save(filename);
}
