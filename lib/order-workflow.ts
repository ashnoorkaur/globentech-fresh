export type OrderLifecycleStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "in_queue"
  | "testing"
  | "preparation"
  | "results_available"
  | "completed";

export const ORDER_LIFECYCLE_FLOW: OrderLifecycleStatus[] = [
  "submitted",
  "approved",
  "in_queue",
  "testing",
  "results_available",
  "completed",
];

const statusLabelMap: Record<OrderLifecycleStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  in_queue: "In Queue",
  testing: "Testing",
  preparation: "Preparation",
  results_available: "Results Ready",
  completed: "Completed",
};

const aliases: Record<string, OrderLifecycleStatus> = {
  pending: "submitted",
  approved: "approved",
  rejected: "rejected",
  reject: "rejected",
  disapproved: "rejected",
  declined: "rejected",
  denied: "rejected",
  not_approved: "rejected",
  queued: "in_queue",
  in_queue: "in_queue",
  queue: "in_queue",
  processing: "testing",
  testing: "testing",
  preparation: "preparation",
  in_progress: "testing",
  progress: "testing",
  result_ready: "results_available",
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
