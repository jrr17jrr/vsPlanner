import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function HojeLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-4 w-24" />
          <Card className="p-4">
            <Skeleton className="h-4 w-1/2" />
          </Card>
        </div>
      ))}
    </div>
  );
}
