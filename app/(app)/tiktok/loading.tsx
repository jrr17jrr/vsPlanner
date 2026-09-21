import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function TiktokLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-24" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-6 w-16" />
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}
