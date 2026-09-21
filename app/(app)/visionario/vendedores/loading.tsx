import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function VendedoresLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-16" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-3 h-16 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
