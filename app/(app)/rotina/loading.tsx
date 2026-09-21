import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function RotinaLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-9 w-48" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-3">
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  );
}
