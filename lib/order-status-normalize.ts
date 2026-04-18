export function normalizeOrderStatusForCompare(value?: string | null): string {
  const s = (value || "pending").toLowerCase().trim().replace(/\s+/g, "_");

  if (
    s.includes("reject") ||
    s.includes("disapprov") ||
    s.includes("declin") ||
    s.includes("deni") ||
    s.includes("not_approved") ||
    (s.includes("cancel") && !s.includes("payment"))
  ) {
    return "rejected";
  }
  if (s.includes("payment")) {
    return "payment_pending";
  }
  if (s.includes("complete") || s.includes("result") || s.includes("done")) {
    return "completed";
  }
  if (
    s.includes("process") ||
    s.includes("progress") ||
    s.includes("test") ||
    s.includes("preparation")
  ) {
    return "processing";
  }
  if (s.includes("approve") || s.includes("queue") || s.includes("assigned")) {
    return "approved";
  }

  return "pending";
}
