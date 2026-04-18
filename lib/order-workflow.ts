export type OrderLifecycleStatus =
  | "submitted"
  | "approved"
  | "payment_pending"
  | "rejected"
  | "in_queue"
  | "testing"
  | "preparation"
  | "results_available"
  | "completed";

export const ORDER_LIFECYCLE_FLOW: OrderLifecycleStatus[] = [
  "submitted",
  "approved",
  "payment_pending",
  "in_queue",
  "testing",
  "results_available",
  "completed",
];

const statusLabelMap: Record<OrderLifecycleStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  payment_pending: "Payment Pending",
  rejected: "Rejected",
  in_queue: "In Queue",
  testing: "Testing",
  preparation: "Preparation",
  results_available: "Results Ready",
  completed: "Completed",
};

const aliases: Record<string, OrderLifecycleStatus> = {
  pending: "submitted",
  submitted: "submitted",
  payment_pending: "payment_pending",
  awaiting_payment: "payment_pending",
  payment_due: "payment_pending",
  approved: "approved",
  paid: "in_queue",
  payment_received: "in_queue",
  customer_paid: "in_queue",
  rejected: "rejected",
  reject: "rejected",
  disapproved: "rejected",
  declined: "rejected",
  denied: "rejected",
  not_approved: "rejected",
  cancelled: "rejected",
  canceled: "rejected",
  cancel: "rejected",
  queued: "in_queue",
  in_queue: "in_queue",
  queue: "in_queue",
  processing: "testing",
  testing: "testing",
  preparation: "preparation",
  in_progress: "testing",
  progress: "testing",
  result_ready: "results_available",
  results_ready: "results_available",
  results_available: "results_available",
  completed: "completed",
  done: "completed",
};

export function toLifecycleStatus(raw?: string | null): OrderLifecycleStatus {
  const normalized = (raw || "submitted")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return aliases[normalized] || "submitted";
}

export function statusLabel(status: OrderLifecycleStatus) {
  return statusLabelMap[status];
}

export function getLifecycleProgress(status: OrderLifecycleStatus) {
  if (status === "rejected") return 0;
  const index = ORDER_LIFECYCLE_FLOW.indexOf(status);
  if (index === -1) return 0;
  return Math.round(((index + 1) / ORDER_LIFECYCLE_FLOW.length) * 100);
}

export function canTransitionTo(
  current: OrderLifecycleStatus,
  next: OrderLifecycleStatus,
) {
  if (current === "rejected" || current === "completed") return false;
  if (next === "rejected")
    return current === "submitted" || current === "approved";
  if (current === next) return true;

  const currentIndex = ORDER_LIFECYCLE_FLOW.indexOf(current);
  const nextIndex = ORDER_LIFECYCLE_FLOW.indexOf(next);
  return nextIndex === currentIndex + 1;
}

export type QueuePriority = "standard" | "high";

/**
 * Normalize API / form priority strings. Does not treat the substring "priority"
 * alone as high (avoids false positives like "standard priority" or CSS class names).
 */
export function normalizeOrderPriorityValue(raw: unknown): QueuePriority {
  if (raw === true) return "high";
  if (raw === false) return "standard";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw === 2) return "high";
    if (raw === 1) return "standard";
  }
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "standard";
  if (s === "priority") return "high";
  if (/\b(standard|normal|regular|low|std)\b/.test(s)) return "standard";
  if (/\b(high|urgent|rush|critical|important)\b/.test(s)) return "high";
  if (s === "h" || s === "p1") return "high";
  if (s === "s" || s === "p0") return "standard";
  return "standard";
}
