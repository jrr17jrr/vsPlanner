import { cn } from "@/lib/utils";

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
}

export function ResponsiveTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  renderMobileCard,
  className,
}: {
  columns: TableColumn<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  renderMobileCard: (item: T) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left text-xs text-muted-foreground">
              {columns.map((col) => (
                <th key={col.key} className={cn("px-3 py-2 font-medium", col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={item.id}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  "border-b border-border last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-secondary/40"
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-3 py-2.5 align-middle", col.className)}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        {data.map((item) => (
          <div key={item.id} onClick={() => onRowClick?.(item)}>
            {renderMobileCard(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
