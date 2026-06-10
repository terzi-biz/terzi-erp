/**
 * Експорт DOM-елементу у PNG за допомогою html2canvas.
 * Використовується для генерації картинки кошторису (не PDF).
 */
import html2canvas from "html2canvas";

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
