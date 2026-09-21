import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function VisionarioOverviewLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-16" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-24 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
