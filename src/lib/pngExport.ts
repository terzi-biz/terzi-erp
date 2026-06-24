/**
 * Експорт DOM-елементу у PNG/PDF за допомогою html2canvas + jsPDF.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportElementAsPng(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;
  const margin = 8;
  const usableW = pageW - margin * 2;
  const ratio = canvas.height / canvas.width;
  const imgWmm = usableW;
  const imgHmm = usableW * ratio;

  if (imgHmm <= pageH - margin * 2) {
    pdf.addImage(img, "PNG", margin, margin, imgWmm, imgHmm);
  } else {
    // Slice the canvas into A4 page chunks.
    const pxPerMm = canvas.width / usableW;
    const pageContentHmm = pageH - margin * 2;
    const pageContentPx = pageContentHmm * pxPerMm;
    let offsetPx = 0;
    while (offsetPx < canvas.height) {
      const sliceH = Math.min(pageContentPx, canvas.height - offsetPx);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, -offsetPx);
      const sliceImg = slice.toDataURL("image/png");
      if (offsetPx > 0) pdf.addPage();
      pdf.addImage(sliceImg, "PNG", margin, margin, imgWmm, (sliceH / canvas.width) * usableW);
      offsetPx += sliceH;
    }
  }
  pdf.save(filename);
}
