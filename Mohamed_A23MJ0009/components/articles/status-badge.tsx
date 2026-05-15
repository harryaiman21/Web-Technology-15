import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  reviewed: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  published: "bg-green-100 text-green-700 hover:bg-green-100",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_STYLES[status] ?? ""}>
      {status}
    </Badge>
  );
}
