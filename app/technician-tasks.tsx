import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import { fetchTechnicianWorkQueue, type QueueEntry } from "../lib/calendar-api";
import { normalizeOrderStatusForCompare } from "../lib/order-status-normalize";
import { statusLabel, toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

type StatusFilter = "all" | "pending" | "approved" | "processing" | "completed";
type PriorityFilter = "all" | "standard" | "high";

const normalizeStatus = (value?: string): Exclude<StatusFilter, "all"> => {
  const normalized = normalizeOrderStatusForCompare(value);
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "processing") {
    return "processing";
  }
  if (normalized === "approved") {
    return "approved";
  }
  return "pending";
};

const formatText = (value?: string | null, fallback = "Pending sync") => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const formatSampleSummary = (entry: QueueEntry) => {
  const sample = entry.sample_type?.trim();
  const samples = entry.sample_types.filter(Boolean);
  if (sample) return sample;
  if (samples.length > 0) return samples.join(", ");
  return "Sample details pending sync";
};

const formatCustomerCompany = (entry: QueueEntry) => {
  const customer = entry.customer_name?.trim();
  const company = entry.company_name?.trim();
  if (customer && company) return `Customer: ${customer} | Company: ${company}`;
  if (customer) return `Customer: ${customer}`;
  if (company) return `Company: ${company}`;
  return "Customer details pending sync";
};

const formatSampleCompound = (entry: QueueEntry) => {
  const sample = formatSampleSummary(entry);
  const compound = entry.compound_name?.trim();
  return compound ? `Sample: ${sample} | Compound: ${compound}` : `Sample: ${sample}`;
};

const formatQuantity = (entry: QueueEntry) => {
  if (entry.quantity !== undefined && entry.quantity !== null) {
    return `Quantity: ${entry.quantity} ${entry.unit || ""}`.trim();
  }
  return "Quantity pending sync";
};

const technicianDecisionText = (status?: string) => {
  const lifecycle = toLifecycleStatus(status);
  if (lifecycle === "completed" || lifecycle === "results_available") {
    return "Admin accepted this order and technician processing is completed.";
  }
  if (lifecycle === "testing" || lifecycle === "preparation") {
    return "Admin accepted this order and it is currently under technician processing.";
  }
  if (lifecycle === "approved" || lifecycle === "in_queue") {
    return "Admin accepted this order and assigned it to technician queue.";
  }
  return "Awaiting processing transition in technician queue.";
};

export default function TechnicianTasksPage() {
  const theme = useAppTheme();
  const [queue, setQueue] = useCachedScreenState<QueueEntry[]>(
    "technician-tasks:queue",
    [],
  );
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("technician-tasks:queue"),
  );
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "technician-tasks:lastUpdated",
    "",
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [draftStatus, setDraftStatus] = useState<StatusFilter>("all");
  const [draftPriority, setDraftPriority] = useState<PriorityFilter>("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);

  const loadTasks = useCallback(async () => {
    if (queue.length === 0) {
      setLoading(true);
    }
    try {
      const data = await fetchTechnicianWorkQueue();
      setQueue(data.queue ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setLoading(false);
    }
  }, [queue.length, setLastUpdated, setQueue]);

  useFocusedPolling(loadTasks, { intervalMs: 12000 });

  const stats = useMemo(() => {
    const completed = queue.filter(
      (q) => normalizeStatus(q.order_status) === "completed",
    ).length;
    const active = queue.length - completed;
    const high = queue.filter(
      (q) => (q.priority || "").toLowerCase() === "high",
    ).length;
    return { active, high, completed };
  }, [queue]);

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      const normalizedStatus = normalizeStatus(item.order_status);
      const statusPass =
        statusFilter === "all" || normalizedStatus === statusFilter;
      const normalizedPriority: PriorityFilter =
        (item.priority || "").toLowerCase() === "high" ? "high" : "standard";
      const priorityPass =
        priorityFilter === "all" || normalizedPriority === priorityFilter;
      return statusPass && priorityPass;
    });
  }, [priorityFilter, queue, statusFilter]);

  const assignedTasks = useMemo(
    () =>
      filteredQueue.filter(
        (item) => normalizeStatus(item.order_status) !== "completed",
      ),
    [filteredQueue],
  );

  const completedTasks = useMemo(
    () =>
      filteredQueue.filter(
        (item) => normalizeStatus(item.order_status) === "completed",
      ),
    [filteredQueue],
  );

  return (
    <RoleContentPage
      title="Assigned Tasks"
      subtitle="Live technician queue synchronized with admin assignment and calendar scheduling."
      role="Technician"
      activeKey="tasks"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>
            Updated {lastUpdated || "--"}
          </Text>
          <Pressable
            onPress={loadTasks}
            style={[
              styles.refreshBtn,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text style={styles.refreshBtnText}>
              {loading ? "Syncing..." : "Refresh"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View
            style={[
              styles.stat,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Active
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {stats.active}
            </Text>
          </View>
          <View
            style={[
              styles.stat,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              High Priority
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.danger }]}>
              {stats.high}
            </Text>
          </View>
          <View
            style={[
              styles.stat,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Completed
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>
              {stats.completed}
            </Text>
          </View>
        </View>

        <View style={styles.selectorsRow}>
          <View style={styles.selectorWrap}>
            <Pressable
              onPress={() => {
                setStatusOpen((v) => !v);
                setPriorityOpen(false);
              }}
              style={[
                styles.selectorBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <View style={styles.selectorInner}>
                <Text
                  style={[styles.selectorText, { color: theme.colors.text }]}
                >
                  Status: {draftStatus.toUpperCase()}
                </Text>
                <Ionicons
                  name={statusOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.colors.textMuted}
                />
              </View>
            </Pressable>
            {statusOpen ? (
              <View
                style={[
                  styles.dropdown,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                {(
                  [
                    "all",
                    "pending",
                    "approved",
                    "processing",
                    "completed",
                  ] as StatusFilter[]
                ).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setDraftStatus(value);
                      setStatusOpen(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      {
                        backgroundColor:
                          draftStatus === value
                            ? theme.colors.primarySoft
                            : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        { color: theme.colors.text },
                      ]}
                    >
                      {value.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.selectorWrap}>
            <Pressable
              onPress={() => {
                setPriorityOpen((v) => !v);
                setStatusOpen(false);
              }}
              style={[
                styles.selectorBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <View style={styles.selectorInner}>
                <Text
                  style={[styles.selectorText, { color: theme.colors.text }]}
                >
                  Priority: {draftPriority.toUpperCase()}
                </Text>
                <Ionicons
                  name={priorityOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.colors.textMuted}
                />
              </View>
            </Pressable>
            {priorityOpen ? (
              <View
                style={[
                  styles.dropdown,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                {(["all", "standard", "high"] as PriorityFilter[]).map(
                  (value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setDraftPriority(value);
                        setPriorityOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        {
                          backgroundColor:
                            draftPriority === value
                              ? theme.colors.primarySoft
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          { color: theme.colors.text },
                        ]}
                      >
                        Priority: {value.toUpperCase()}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={() => {
            setStatusFilter(draftStatus);
            setPriorityFilter(draftPriority);
            setStatusOpen(false);
            setPriorityOpen(false);
          }}
          style={[styles.applyBtn, { backgroundColor: theme.colors.secondary }]}
        >
          <Text style={styles.applyBtnText}>Filter</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Assigned Tasks ({assignedTasks.length})
          </Text>
        </View>
        {assignedTasks.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            No assigned tasks for selected filters.
          </Text>
        ) : (
          assignedTasks.slice(0, 12).map((item) => {
            const lifecycle = toLifecycleStatus(item.order_status);
            return (
              <View
                key={item.queue_id}
                style={[
                  styles.row,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.title, { color: theme.colors.text }]}>
                  {item.order_number}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  {statusLabel(lifecycle)} - Position #{item.position}
                </Text>
                <Text style={[styles.subStrong, { color: theme.colors.info }]}>
                  {technicianDecisionText(item.order_status)}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  Priority: {(item.priority || "standard").toUpperCase()}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  {formatCustomerCompany(item)}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  {formatSampleCompound(item)}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  {formatQuantity(item)}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  Order ID: {item.order_id} | Queue ID: {item.queue_id}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  Samples: {formatText(item.sample_types?.join(", "), "Pending sync")}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  Equipment: {formatText(item.equipment_name, "Pending assignment")}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  Start: {item.scheduled_start || "Not scheduled"}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                  ETA:{" "}
                  {item.estimated_completion || item.scheduled_end || "Pending"}
                </Text>
                {item.notes ? (
                  <Text style={[styles.subStrong, { color: theme.colors.text }]}>Notes: {item.notes}</Text>
                ) : null}
              </View>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Completed Tasks ({completedTasks.length})
          </Text>
        </View>
        {completedTasks.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            No completed tasks for selected filters.
          </Text>
        ) : (
          completedTasks.slice(0, 12).map((item) => (
            <View
              key={`completed-${item.queue_id}`}
              style={[
                styles.row,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {item.order_number}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.success }]}>
                COMPLETED
              </Text>
              <Text style={[styles.subStrong, { color: theme.colors.success }]}>
                {technicianDecisionText(item.order_status)}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                Order ID: {item.order_id} | Queue ID: {item.queue_id}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                {formatCustomerCompany(item)}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                {formatSampleCompound(item)}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                Samples: {formatText(item.sample_types?.join(", "), "Pending sync")}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
                Finished:{" "}
                {item.scheduled_end || item.estimated_completion || "Pending sync"}
              </Text>
              {item.notes ? (
                <Text style={[styles.subStrong, { color: theme.colors.text }]}>Notes: {item.notes}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  updatedText: { fontSize: 12, fontWeight: "700" },
  refreshBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10 },
  statLabel: { fontSize: 11, fontWeight: "700" },
  statValue: { marginTop: 4, fontSize: 20, fontWeight: "800" },
  selectorsRow: { flexDirection: "row", gap: 8 },
  selectorWrap: { flex: 1, zIndex: 3 },
  selectorBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  selectorInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorText: { fontSize: 12, fontWeight: "700" },
  dropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: { paddingHorizontal: 10, paddingVertical: 8 },
  dropdownItemText: { fontSize: 12, fontWeight: "700" },
  applyBtn: { borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  applyBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  sectionHeader: { marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  empty: { fontSize: 12, fontWeight: "700" },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  title: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12 },
  subStrong: { fontSize: 12, fontWeight: "700" },
});
