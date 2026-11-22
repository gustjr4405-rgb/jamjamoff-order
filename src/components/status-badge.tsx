import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/constants";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return <Badge className={cn(STATUS_STYLE[status], className)}>{STATUS_LABEL[status]}</Badge>;
}
