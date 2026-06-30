import logoAsset from "@/assets/terzi-logo-gold.jpeg.asset.json";

interface Props {
  size?: number;
  withText?: boolean;
  className?: string;
}

/**
 * TERZI gold logo (golden monogram on dark background).
 * Used in sidebar, mobile header, login screen and PDF/estimate header.
 */
export function TerziLogo({ size = 36, withText = false, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoAsset.url}
        alt="TERZI"
        width={size}
        height={size}
        className="rounded-md object-cover shrink-0 ring-1 ring-primary/40"
        style={{ width: size, height: size }}
      />
      {withText && (
        <div className="min-w-0">
          <div className="font-black tracking-tight leading-none text-base">TERZI</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
            Будівельна компанія
          </div>
        </div>
      )}
    </div>
  );
}

export const TERZI_LOGO_URL = logoAsset.url;
