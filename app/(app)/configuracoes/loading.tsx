import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function ConfiguracoesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-20 w-full" />
        </Card>
      ))}
    </div>
  );
}
