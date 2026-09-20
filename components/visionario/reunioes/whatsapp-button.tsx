import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export function WhatsAppButton({
  phone,
  size = "sm",
}: {
  phone: string | null | undefined;
  size?: "sm" | "default";
}) {
  const link = buildWhatsAppLink(phone);
  if (!link) return null;

  return (
    <Button size={size} variant="outline" className="text-success" asChild>
      <a href={link} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </a>
    </Button>
  );
}
