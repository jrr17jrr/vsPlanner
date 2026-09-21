import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function HistoricoLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </Card>
        ))}
      </div>
    </div>
  );
}
