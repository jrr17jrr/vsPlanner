import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function TarefasLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-9 w-64" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-3">
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ))}
      </div>
    </div>
  );
}
