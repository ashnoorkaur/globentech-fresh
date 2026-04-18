import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import { adminMenu } from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { useCachedScreenState } from "../hooks/use-screen-cache";
import {
    assignOrderTechnician,
    fetchAdminOrderHistory,
    fetchAdminUsers,
    type AdminOrderHistoryDto,
    type AdminUserDto,
} from "../lib/admin-api";
import { assignOrderEquipment } from "../lib/calendar-api";
import { formatBackendDateTime } from "../lib/date-time";
import { fetchEquipmentList, type EquipmentPayload } from "../lib/equipment-api";
import { toLifecycleStatus } from "../lib/order-workflow";
import { useAppTheme } from "../lib/theme";

const formatDate = (value?: string | null) => {
  return formatBackendDateTime(value, "-");
};

const hasValue = (value?: string | number | null) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return value.trim().length > 0 && value.trim() !== "-";
};

const formatDisplayCase = (value?: string | null) => {
  if (!value) return "";
  return value.trim().replace(/\b[a-z]/g, (char) => char.toUpperCase());
};

const formatQuantityText = (quantity?: number, unit?: string | null, sampleCount?: number) => {
  if (typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0) {
    return `${quantity} ${unit || ""}`.trim();
  }
  if (typeof sampleCount === "number" && sampleCount > 1) {
    return `${sampleCount} sample(s)`;
  }
  return "Not provided";
};

const getRequestSummary = (row: AdminOrderHistoryDto) => {
  const parts = [
    hasValue(row.sample_type) ? `Type: ${formatDisplayCase(row.sample_type)}` : null,
    hasValue(row.compound_name) ? `Compound: ${formatDisplayCase(row.compound_name)}` : null,
    `Quantity: ${formatQuantityText(row.quantity, row.unit, displaySampleCount(row))}`,
  ].filter(Boolean);

  return parts.join(" • ") || "Customer request synced from submitted order.";
};

const canAssignTechnician = (status?: string | null) => {
  const lifecycle = toLifecycleStatus(status);
  return (
    lifecycle === "in_queue" ||
    lifecycle === "testing" ||
    lifecycle === "preparation" ||
    lifecycle === "results_available"
  );
};

const canAssignEquipment = (status?: string | null) => {
  const lifecycle = toLifecycleStatus(status);
  return (
    lifecycle === "approved" ||
    lifecycle === "payment_pending" ||
    lifecycle === "in_queue" ||
    lifecycle === "testing" ||
    lifecycle === "preparation" ||
    lifecycle === "results_available"
  );
};

const displaySampleCount = (row: AdminOrderHistoryDto) => {
  if (typeof row.sample_count === "number" && row.sample_count > 1) {
    return row.sample_count;
  }
  if (
    typeof row.quantity === "number" &&
    Number.isFinite(row.quantity) &&
    row.quantity >= 1 &&
    row.quantity <= 50 &&
    Math.abs(row.quantity - Math.round(row.quantity)) < 0.0001
  ) {
    return Math.round(row.quantity);
  }
  return row.sample_count || 1;
};

type NormalizedStage =
  | "submitted"
  | "approved"
  | "payment"
  | "processing"
  | "completed"
  | "rejected";

const normalizeStage = (value?: string | null): NormalizedStage => {
  const s = (value || "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("complete") || s.includes("result")) return "completed";
  if (s.includes("payment")) return "payment";
  if (s.includes("process") || s.includes("test") || s.includes("prep")) {
    return "processing";
  }
  if (s.includes("approve") || s.includes("queue")) return "approved";
  return "submitted";
};

const stageMeaning = (stage: NormalizedStage) => {
  if (stage === "submitted") return "Waiting for admin review.";
  if (stage === "approved") return "Approved by admin.";
  if (stage === "payment") return "Customer payment is pending before technician work begins.";
  if (stage === "processing") return "Technician is handling the order.";
  if (stage === "completed") return "Technician finished the order and the workflow is complete.";
  return "Order was rejected.";
};

const stageStep = (stage: NormalizedStage) => {
  if (stage === "submitted") return 1;
  if (stage === "approved") return 2;
  if (stage === "payment") return 3;
  if (stage === "processing") return 4;
  if (stage === "completed") return 5;
  return 0;
};

const adminHistoryRowsFingerprint = (rows: AdminOrderHistoryDto[]) =>
  rows
    .map((r) =>
      [
        r.id,
        (r.order_number || "").trim().toUpperCase(),
        (r.status || "").trim().toLowerCase(),
        (r.priority || "").trim().toLowerCase(),
      ].join("\t"),
    )
    .sort()
    .join("|");

export default function AdminOrderHistoryPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const params = useLocalSearchParams<{ search?: string }>();
  const [rows, setRows] = useCachedScreenState<AdminOrderHistoryDto[]>(
    "admin-order-history:rows:v10",
    [],
  );
  const [technicians, setTechnicians] = useCachedScreenState<AdminUserDto[]>(
    "admin-order-history:technicians:v1",
    [],
  );
  const [equipmentRows, setEquipmentRows] = useCachedScreenState<EquipmentPayload[]>(
    "admin-order-history:equipment:v1",
    [],
  );
  const [search, setSearch] = useState(
    typeof params.search === "string" ? params.search : "",
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "processing" | "payment" | "pending" | "approved" | "rejected"
  >("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<
    "all" | "completed" | "processing" | "payment" | "pending" | "approved" | "rejected"
  >("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-order-history:lastUpdated:v10",
    "",
  );
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [technicianTarget, setTechnicianTarget] = useState<AdminOrderHistoryDto | null>(null);
  const [equipmentTarget, setEquipmentTarget] = useState<AdminOrderHistoryDto | null>(null);

  const loadHistory = useCallback(async () => {
    setSyncing(true);
    try {
      const [historyResult, usersResult, equipmentResult] = await Promise.allSettled([
        fetchAdminOrderHistory(),
        fetchAdminUsers(),
        fetchEquipmentList(),
      ]);

      if (historyResult.status === "fulfilled") {
        const next = historyResult.value;
        setRows((prev) => {
          if (adminHistoryRowsFingerprint(prev) === adminHistoryRowsFingerprint(next)) {
            return prev;
          }
          queueMicrotask(() => setLastUpdated(new Date().toLocaleTimeString()));
          return next;
        });
      }

      if (usersResult.status === "fulfilled") {
        setTechnicians(
          usersResult.value.filter(
            (user) => user.role === "technician" && user.is_active !== false,
          ),
        );
      }

      if (equipmentResult.status === "fulfilled") {
        setEquipmentRows(equipmentResult.value);
      }
    } catch {
      // Keep the last successful snapshot visible.
    } finally {
      setSyncing(false);
    }
  }, [setEquipmentRows, setLastUpdated, setRows, setTechnicians]);

  useFocusedPolling(loadHistory, {
    intervalMs: 0,
    minGapMs: 400,
    subscribeToLiveData: false,
    pollWhileFocused: false,
    reloadOnAppActive: false,
    runOnMount: false,
    runOnFocus: true,
  });

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const normalizedStatus = normalizeStage(row.status);

      if (statusFilter !== "all") {
        if (statusFilter === "pending" && normalizedStatus !== "submitted") {
          return false;
        }
        if (statusFilter !== "pending" && normalizedStatus !== statusFilter) {
          return false;
        }
      }

      const q = search.trim().toLowerCase();
      const bySearch = q
        ? [
            row.order_number,
            row.status,
            row.customer_name,
            row.company_name || "",
            row.priority || "",
            row.compound_name || "",
            row.equipment_name || "",
            row.assigned_technician_name || "",
            row.technician_status_note || "",
            row.technician_status_updated_by || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        : true;

      const completedAt = row.estimated_completion || row.created_at || "";
      const byFrom = fromDate.trim() ? completedAt >= fromDate.trim() : true;
      const byTo = toDate.trim()
        ? completedAt <= `${toDate.trim()} 23:59:59`
        : true;

      return bySearch && byFrom && byTo;
    });
  }, [rows, search, fromDate, toDate, statusFilter]);

  const clearFilters = () => {
    setSearch("");
    setFromDate("");
    setToDate("");
    setDraftStatusFilter("all");
    setStatusFilter("all");
  };

  const summary = useMemo(() => {
    const submitted = rows.filter(
      (r) => normalizeStage(r.status) === "submitted",
    ).length;
    const approved = rows.filter(
      (r) => normalizeStage(r.status) === "approved",
    ).length;
    const payment = rows.filter(
      (r) => normalizeStage(r.status) === "payment",
    ).length;
    const processing = rows.filter(
      (r) => normalizeStage(r.status) === "processing",
    ).length;
    const completed = rows.filter(
      (r) => normalizeStage(r.status) === "completed",
    ).length;
    const rejected = rows.filter(
      (r) => normalizeStage(r.status) === "rejected",
    ).length;
    return {
      submitted,
      approved,
      payment,
      processing,
      completed,
      rejected,
    };
  }, [rows]);

  const actionGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];
  const mutedGradient: [string, string] = ["#64748B", "#94A3B8"];
  const successGradient: [string, string] = ["#16A34A", "#22C55E"];

  const runAssignTechnician = async (
    row: AdminOrderHistoryDto,
    technician: AdminUserDto,
  ) => {
    setBusyOrderId(row.id);
    try {
      await assignOrderTechnician(row, technician);
      await loadHistory();
      setTechnicianTarget(null);
      feedback.showSuccess(
        "Technician Assigned",
        `${row.order_number} is now assigned to ${technician.full_name}.`,
      );
    } catch (error) {
      feedback.showError(
        "Assignment Failed",
        error instanceof Error ? error.message : "Unable to assign technician.",
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  const runAssignEquipment = async (
    row: AdminOrderHistoryDto,
    equipment: EquipmentPayload,
  ) => {
    setBusyOrderId(row.id);
    try {
      await assignOrderEquipment(
        {
          orderId: row.id,
          orderNumber: row.order_number,
          firebaseKey: row.firebase_key,
          status: row.status,
          scheduledStart: row.scheduled_start,
          scheduledEnd: row.scheduled_end || row.estimated_completion,
        },
        { id: equipment.id, name: equipment.name },
      );
      await loadHistory();
      setEquipmentTarget(null);
      feedback.showSuccess(
        "Equipment Assigned",
        `${row.order_number} is now linked to ${equipment.name}.`,
      );
    } catch (error) {
      feedback.showError(
        "Assignment Failed",
        error instanceof Error ? error.message : "Unable to assign equipment.",
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <RoleContentPage
      title="Order Timeline"
      subtitle="Live order list and workflow details."
      role="Admin"
      activeKey="order-history"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <View style={{ paddingBottom: 8 }}>
        <View style={styles.summaryRow}>
          {[
            ["Submitted", summary.submitted, theme.colors.primary],
            ["Approved", summary.approved, theme.colors.secondary],
            ["Payment Due", summary.payment, theme.colors.info],
            ["Processing", summary.processing, theme.colors.warning],
            ["Completed", summary.completed, theme.colors.success],
            ["Rejected", summary.rejected, theme.colors.danger],
          ].map(([label, value, color]) => (
            <View
              key={String(label)}
              style={[
                styles.summaryCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                {String(label)}
              </Text>
              <Text style={[styles.summaryValue, { color: String(color) }]}> 
                {Number(value)}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.syncRow}>
            <Text style={[styles.sectionSub, { color: theme.colors.textMuted, marginBottom: 0 }]}>
              Updated {lastUpdated || "--"}
            </Text>
            <Pressable
              onPress={() => void loadHistory()}
              disabled={syncing}
              style={[
                styles.refreshBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: syncing ? theme.colors.border : theme.colors.primary,
                },
              ]}
            >
              <Text style={styles.refreshBtnText}>{syncing ? "Syncing…" : "Refresh"}</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search order, customer, company, technician, equipment"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
              },
            ]}
          />
          <View style={styles.rowInputs}>
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="From date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.inputHalf,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
            />
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="To date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.inputHalf,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.inputBg,
                },
              ]}
            />
          </View>
          <View style={styles.actions}>
            <View style={styles.statusWrap}>
              <Pressable
                style={[
                  styles.statusBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
                onPress={() => setStatusOpen((v) => !v)}
              >
                <Text style={[styles.statusBtnText, { color: theme.colors.text }]}> 
                  Status: {draftStatusFilter.toUpperCase()}
                </Text>
                <Ionicons
                  name={statusOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.colors.textMuted}
                />
              </Pressable>
              {statusOpen ? (
                <View
                  style={[
                    styles.statusDropdown,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {(
                    [
                      "all",
                      "completed",
                      "processing",
                      "payment",
                      "pending",
                      "approved",
                      "rejected",
                    ] as const
                  ).map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setDraftStatusFilter(value);
                        setStatusOpen(false);
                      }}
                      style={[
                        styles.statusItem,
                        {
                          backgroundColor:
                            draftStatusFilter === value
                              ? theme.colors.primarySoft
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[styles.statusItemText, { color: theme.colors.text }]}
                      >
                        {value.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <GradientButton
              style={styles.btn}
              onPress={() => setStatusFilter(draftStatusFilter)}
              colors={actionGradient}
              compact
            >
              <Text style={styles.btnText}>Apply</Text>
            </GradientButton>
            <GradientButton
              style={styles.btn}
              onPress={clearFilters}
              colors={mutedGradient}
              compact
            >
              <Text style={styles.btnText}>Clear</Text>
            </GradientButton>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}> 
            Orders and Timeline
          </Text>
          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}> 
            This page shows the full order list and workflow progress.
          </Text>
          <View
            style={[
              styles.guideWrap,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text style={[styles.guideTitle, { color: theme.colors.text }]}> 
              Stage Guide
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}> 
              Submitted: waiting for admin review
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}> 
              Approved: accepted by admin
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}> 
              Payment Pending: customer payment happens before technician work begins
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}> 
              Processing: technician is working on it
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}> 
              Completed: technician finished the work and no more assignment changes are needed
            </Text>
          </View>

          {filtered.slice(0, 20).map((row) => {
            const stage = normalizeStage(row.status);
            const step = stageStep(stage);
            const labels = ["Submitted", "Approved", "Payment", "Processing", "Completed"] as const;
            const pillColor =
              stage === "completed"
                ? theme.colors.success
                : stage === "processing"
                  ? theme.colors.warning
                  : stage === "approved"
                    ? theme.colors.secondary
                    : stage === "rejected"
                      ? theme.colors.danger
                      : theme.colors.primary;

            return (
              <View
                key={`${row.id}-${row.order_number}`}
                style={[
                  styles.orderCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <View style={styles.orderTopRow}>
                  <Text style={[styles.orderNumber, { color: theme.colors.text }]}> 
                    {row.order_number}
                  </Text>
                  <Text
                    style={[
                      styles.statusPill,
                      {
                        color: pillColor,
                        backgroundColor: pillColor + "1A",
                      },
                    ]}
                  >
                    {(row.status || "submitted").toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Customer: {row.customer_name} | Company: {row.company_name || "-"}</Text>
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Requested Details: {getRequestSummary(row)}</Text>
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Assigned Technician: {row.assigned_technician_name || "Not assigned"}</Text>
                <Text style={[styles.stageMeaning, { color: pillColor }]}> 
                  {stageMeaning(stage)}
                </Text>
                <Text style={[styles.stageDecision, { color: pillColor }]}> 
                  {stage === "rejected"
                    ? `Decision: Rejected - ${row.rejection_reason || `${row.order_number} did not pass admin review.`}`
                    : `Decision: Accepted - ${row.order_number} passed admin review.`}
                </Text>
                <View
                  style={[
                    styles.stageRow,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {labels.map((label, index) => {
                    const chipStep = index + 1;
                    const active = step >= chipStep && stage !== "rejected";
                    return (
                      <View
                        key={`${row.id}-${label}`}
                        style={[
                          styles.stageChip,
                          {
                            borderColor: active
                              ? theme.colors.success
                              : theme.colors.border,
                            backgroundColor: active
                              ? theme.colors.success + "14"
                              : "transparent",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.stageChipText,
                            {
                              color: active
                                ? theme.colors.success
                                : theme.colors.textMuted,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Priority</Text>
                  <Text
                    style={[
                      styles.kvValue,
                      {
                        color:
                          row.priority?.toLowerCase() === "high"
                            ? theme.colors.danger
                            : theme.colors.warning,
                      },
                    ]}
                  >
                    {(row.priority || "standard").toUpperCase()}
                  </Text>
                </View>
                {hasValue(row.sample_type) ? (
                  <View style={styles.kvRow}>
                    <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Sample Type</Text>
                    <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDisplayCase(row.sample_type)}</Text>
                  </View>
                ) : null}
                {hasValue(row.compound_name) ? (
                  <View style={styles.kvRow}>
                    <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Compound</Text>
                    <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDisplayCase(row.compound_name)}</Text>
                  </View>
                ) : null}
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Quantity</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatQuantityText(row.quantity, row.unit, displaySampleCount(row))}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Equipment</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{row.equipment_name || "Unassigned"}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Submitted</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDate(row.created_at)}</Text>
                </View>
                {row.notes ? (
                  <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Notes: {row.notes}</Text>
                ) : null}
                {row.technician_status_note ? (
                  <Text style={[styles.rowSub, { color: theme.colors.primary }]}>Technician Update: {row.technician_status_note}</Text>
                ) : null}
                {row.technician_status_updated_at ? (
                  <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Updated {formatDate(row.technician_status_updated_at)}{row.technician_status_updated_by ? ` by ${row.technician_status_updated_by}` : ""}</Text>
                ) : null}

                <View style={styles.orderActionRow}>
                  {canAssignEquipment(row.status) ? (
                    <GradientButton
                      style={styles.assignBtn}
                      onPress={() => setEquipmentTarget(row)}
                      colors={actionGradient}
                      compact
                      disabled={busyOrderId === row.id}
                    >
                      <Text style={styles.btnText}>
                        {row.equipment_name ? "Change Equipment" : "Assign Equipment"}
                      </Text>
                    </GradientButton>
                  ) : null}

                  {canAssignTechnician(row.status) ? (
                    <GradientButton
                      style={styles.assignBtn}
                      onPress={() => setTechnicianTarget(row)}
                      colors={successGradient}
                      compact
                      disabled={busyOrderId === row.id}
                    >
                      <Text style={styles.btnText}>
                        {row.assigned_technician_name ? "Change Technician" : "Assign Technician"}
                      </Text>
                    </GradientButton>
                  ) : stage !== "rejected" && stage !== "completed" ? (
                    <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Technician assignment becomes available after customer payment is completed.</Text>
                  ) : null}
                </View>
              </View>
            );
          })}

          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}> 
              No matching orders found.
            </Text>
          ) : null}
        </View>
      </View>

      <Modal
        visible={Boolean(technicianTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setTechnicianTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Assign Technician</Text>
            <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}>Select a technician for {technicianTarget?.order_number}.</Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {technicians.map((tech) => (
                <Pressable
                  key={`${tech.id}-${tech.email}`}
                  onPress={() => technicianTarget ? void runAssignTechnician(technicianTarget, tech) : undefined}
                  style={[styles.techOption, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}
                >
                  <Text style={[styles.techName, { color: theme.colors.text }]}>{tech.full_name}</Text>
                  <Text style={[styles.techMeta, { color: theme.colors.textMuted }]}>{tech.email}</Text>
                </Pressable>
              ))}
              {technicians.length === 0 ? (
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>No active technicians are available right now.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setTechnicianTarget(null)}
                style={[styles.modalSecondaryBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(equipmentTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setEquipmentTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Assign Equipment</Text>
            <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}>Select equipment for {equipmentTarget?.order_number}.</Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {equipmentRows.map((item) => (
                <Pressable
                  key={`${item.id || item.name}-${item.name}`}
                  onPress={() => equipmentTarget ? void runAssignEquipment(equipmentTarget, item) : undefined}
                  style={[styles.techOption, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}
                >
                  <Text style={[styles.techName, { color: theme.colors.text }]}>{item.name}</Text>
                  <Text style={[styles.techMeta, { color: theme.colors.textMuted }]}>{item.equipment_type || "General"}</Text>
                </Pressable>
              ))}
              {equipmentRows.length === 0 ? (
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>No equipment is available right now.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEquipmentTarget(null)}
                style={[styles.modalSecondaryBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  summaryCard: {
    width: "31%",
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: { fontSize: 20, fontWeight: "800", marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  rowInputs: { flexDirection: "row", gap: 8 },
  inputHalf: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
  },
  actions: { flexDirection: "row", gap: 4, alignItems: "flex-start" },
  statusWrap: { flex: 1, zIndex: 3 },
  statusBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBtnText: { fontSize: 12, fontWeight: "700" },
  statusDropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  statusItem: { paddingHorizontal: 10, paddingVertical: 8 },
  statusItemText: { fontSize: 12, fontWeight: "700" },
  btn: {
    flex: 0,
    minWidth: 88,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  sectionSub: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  refreshBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  guideWrap: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  guideTitle: { fontSize: 12, fontWeight: "800", marginBottom: 2 },
  guideLine: { fontSize: 11, fontWeight: "700" },
  orderCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  orderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderNumber: { fontSize: 14, fontWeight: "800", flex: 1 },
  statusPill: {
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  stageMeaning: { fontSize: 12, fontWeight: "700" },
  stageDecision: { fontSize: 11, fontWeight: "700" },
  stageRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    flexDirection: "row",
    gap: 6,
  },
  stageChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  stageChipText: { fontSize: 10, fontWeight: "800" },
  rowSub: { fontSize: 11, fontWeight: "600", lineHeight: 18 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kvKey: { fontSize: 11, fontWeight: "700" },
  kvValue: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: "62%",
    textAlign: "right",
  },
  assignBtn: {
    borderRadius: 10,
    flex: 1,
    minWidth: 148,
  },
  orderActionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  empty: { fontSize: 12, fontWeight: "700", marginTop: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalSub: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  modalList: { maxHeight: 280 },
  modalListContent: { gap: 8, paddingBottom: 4 },
  techOption: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  techName: { fontSize: 14, fontWeight: "800" },
  techMeta: { fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: { fontSize: 13, fontWeight: "800" },
  modalPrimaryBtn: { flex: 1, borderRadius: 10, paddingVertical: 11 },
});
