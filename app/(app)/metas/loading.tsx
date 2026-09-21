import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function MetasLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-3 h-2 w-full" />
            <Skeleton className="mt-3 h-8 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
