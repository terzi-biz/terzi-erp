/**
 * Завантаження TTF-шрифтів Noto Sans з підтримкою кирилиці у jsPDF.
 * Викликається лазі при першій генерації PDF; результат кешується.
 */
import notoRegularUrl from "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url";
import notoBoldUrl from "@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url";
import type jsPDF from "jspdf";

let cachedRegular: string | null = null;
let cachedBold: string | null = null;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function attachCyrillicFonts(doc: jsPDF): Promise<void> {
  if (!cachedRegular) cachedRegular = await fetchAsBase64(notoRegularUrl);
  if (!cachedBold) cachedBold = await fetchAsBase64(notoBoldUrl);

  doc.addFileToVFS("NotoSans-Regular.ttf", cachedRegular);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", cachedBold);
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  doc.setFont("NotoSans", "normal");
}
