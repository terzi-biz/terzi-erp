/** Швидкий перехід у чат з клієнтом: Telegram, WhatsApp, Viber. */
import { MessageCircle, Send } from "lucide-react";

export function messengerUrls(phone?: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return {
    telegram: `https://t.me/+${d}`,
    whatsapp: `https://wa.me/${d}`,
    viber: `viber://chat?number=%2B${d}`,
  };
}

export function MessengerLinks({ phone, className = "" }: { phone?: string | null; className?: string }) {
  const u = messengerUrls(phone);
  const base = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold hover:bg-muted";
  const off = "pointer-events-none opacity-40";
  const items = [
    { key: "telegram", label: "Telegram", icon: Send, href: u?.telegram },
    { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, href: u?.whatsapp },
    { key: "viber", label: "Viber", icon: MessageCircle, href: u?.viber },
  ];
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {items.map((i) => (
        <a key={i.key} href={i.href} target="_blank" rel="noreferrer" aria-disabled={!i.href}
          className={`${base} ${i.href ? "" : off}`} title={i.href ? `Написати в ${i.label}` : "Немає номера телефону"}>
          <i.icon className="h-4 w-4" /> {i.label}
        </a>
      ))}
    </div>
  );
}
