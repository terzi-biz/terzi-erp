/**
 * Бренд TERZI v2: логотипи для бічної панелі, екрану входу й мобільного хедера.
 * Файли — оброблені оригінали (виправлений підпис «Будівельна компанія»).
 */
import wordmarkWhite from "@/assets/brand/terzi-wordmark-white.png";
import wordmarkNavy from "@/assets/brand/terzi-wordmark-navy.png";
import logoVertical from "@/assets/brand/terzi-logo-vertical.png";
import mark from "@/assets/brand/terzi-mark.png";

/** Горизонтальний логотип: білий (на navy) або navy (на світлому). */
export function BrandWordmark({ tone = "white", width = 176, className = "" }: { tone?: "white" | "navy"; width?: number; className?: string }) {
  return (
    <img
      src={tone === "white" ? wordmarkWhite : wordmarkNavy}
      alt="TERZI — Будівельна компанія"
      width={width}
      height={Math.round((width * 269) / 897)}
      className={`block h-auto select-none ${className}`}
      style={{ width }}
      draggable={false}
    />
  );
}

/** Вертикальний логотип (екран входу). */
export function BrandVertical({ width = 180, className = "" }: { width?: number; className?: string }) {
  return (
    <img
      src={logoVertical}
      alt="TERZI — Будівельна компанія"
      width={width}
      height={Math.round((width * 457) / 550)}
      className={`block h-auto select-none ${className}`}
      style={{ width }}
      draggable={false}
    />
  );
}

/** Золота іконка-знак (фавікон, згорнуте меню). */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <img src={mark} alt="TERZI" width={size} className={`block h-auto select-none ${className}`} style={{ width: size }} draggable={false} />;
}
