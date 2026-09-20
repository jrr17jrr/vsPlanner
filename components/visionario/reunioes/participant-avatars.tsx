import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { initials } from "@/lib/format";

export function ParticipantAvatars({
  names,
  max = 4,
}: {
  names: string[];
  max?: number;
}) {
  if (names.length === 0) {
    return <span className="text-xs text-muted-foreground">Sem participantes</span>;
  }

  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  return (
    <TooltipProvider>
      <div className="flex items-center -space-x-2">
        {shown.map((name) => (
          <Tooltip key={name}>
            <TooltipTrigger asChild>
              <Avatar className="h-7 w-7 border-2 border-card">
                <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <Avatar className="h-7 w-7 border-2 border-card">
            <AvatarFallback className="bg-secondary text-[10px] text-secondary-foreground">
              +{extra}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </TooltipProvider>
  );
}
