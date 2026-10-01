import { cn } from "@/lib/utils";
export interface StatusBadgeProps {
  status: string;
  className?: string;
}
/**
 * Small colour-coded status pill used on the operator kiosk and admin tables.
 * Colours match the manufacturing status palette defined in src/index.css:
 *   - New     : neutral gray
 *   - Running : green
 *   - Stopped : amber
 *   - Ended   : LGC brand lead colour (dark blue)
 *   - Error   : red
 * Anything else falls back to the neutral "New" style.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    New: "bg-status-new/15 text-status-new border-status-new/30",
    Running:
      "bg-status-running/15 text-status-running border-status-running/40",
    Stopped:
      "bg-status-stopped/15 text-status-stopped border-status-stopped/40",
    Ended: "bg-status-ended/15 text-status-ended border-status-ended/40",
    Error: "bg-status-error/15 text-status-error border-status-error/40",
  };
  const style = styles[status] ?? styles.New;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
        style,
        className,
      )}
      role="status"
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  );
}
