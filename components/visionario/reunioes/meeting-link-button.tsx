import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function MeetingLinkButton({
  link,
  size = "sm",
}: {
  link: string | null | undefined;
  size?: "sm" | "default";
}) {
  if (!link || !isSafeHttpUrl(link)) return null;

  return (
    <Button size={size} asChild>
      <a href={link} target="_blank" rel="noopener noreferrer">
        <Video className="h-4 w-4" /> Entrar na reunião
      </a>
    </Button>
  );
}
