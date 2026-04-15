import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
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
import { fetchEquipmentList, type EquipmentPayload } from "../lib/equipment-api";
import { useAppTheme } from "../lib/theme";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

type NormalizedStage =
  | "submitted"
  | "approved"
  | "processing"
  | "completed"
  | "rejected";

const normalizeStage = (value?: string | null): NormalizedStage => {
  const s = (value || "").toLowerCase();
  if (s.includes("reject")) return "rejected";
  if (s.includes("complete") || s.includes("result")) return "completed";
  if (s.includes("process") || s.includes("test") || s.includes("prep")) {
    return "processing";
  }
  if (s.includes("approve") || s.includes("queue")) return "approved";
  return "submitted";
};

const stageMeaning = (stage: NormalizedStage) => {
  if (stage === "submitted") return "Waiting for admin review.";
  if (stage === "approved") return "Approved and ready for technician assignment.";
  if (stage === "processing") return "Technician is handling the order.";
  if (stage === "completed") return "Technician finished the order and the workflow is complete.";
  return "Order was rejected.";
};

const stageStep = (stage: NormalizedStage) => {
  if (stage === "submitted") return 1;
  if (stage === "approved") return 2;
  if (stage === "processing") return 3;
  if (stage === "completed") return 4;
  return 0;
};

const rowStatusForAssignment = (status?: string | null) => {
  const stage = normalizeStage(status);
  if (stage === "processing") return "Processing";
  if (stage === "completed") return "Completed";
  if (stage === "rejected") return "Rejected";
  return "Approved";
};

export default function AdminOrderHistoryPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const [rows, setRows] = useCachedScreenState<AdminOrderHistoryDto[]>(
    "admin-order-history:rows",
    [],
  );
  const [technicians, setTechnicians] = useCachedScreenState<AdminUserDto[]>(
    "admin-order-history:technicians",
    [],
  );
  const [equipmentOptions, setEquipmentOptions] = useCachedScreenState<
    EquipmentPayload[]
  >("admin-order-history:equipment", []);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "processing" | "pending" | "approved" | "rejected"
  >("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<
    "all" | "completed" | "processing" | "pending" | "approved" | "rejected"
  >("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-order-history:lastUpdated",
    "",
  );
  const [assignTarget, setAssignTarget] = useState<AdminOrderHistoryDto | null>(
    null,
  );
  const [equipmentTarget, setEquipmentTarget] = useState<AdminOrderHistoryDto | null>(
    null,
  );
  const [assignBusyId, setAssignBusyId] = useState<number | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const [historyResult, techniciansResult, equipmentResult] = await Promise.allSettled([
        fetchAdminOrderHistory(),
        fetchAdminUsers({ role: "technician", status: "active" }),
        fetchEquipmentList(),
      ]);

      if (historyResult.status === "fulfilled") {
        setRows(historyResult.value);
      }

      if (techniciansResult.status === "fulfilled") {
        setTechnicians(
          techniciansResult.value.filter(
            (item) => item.role === "technician" && item.is_active,
          ),
        );
      }

      if (equipmentResult.status === "fulfilled") {
        setEquipmentOptions(equipmentResult.value);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Keep the last successful snapshot visible.
    }
  }, [setEquipmentOptions, setLastUpdated, setRows, setTechnicians]);

  useFocusedPolling(loadHistory, { intervalMs: 10000, minGapMs: 250 });

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
    const processing = rows.filter(
      (r) => normalizeStage(r.status) === "processing",
    ).length;
    const completed = rows.filter(
      (r) => normalizeStage(r.status) === "completed",
    ).length;
    const rejected = rows.filter(
      (r) => normalizeStage(r.status) === "rejected",
    ).length;
    const assigned = rows.filter((r) => Boolean(r.assigned_technician_name)).length;
    const unassignedActive = rows.filter((r) => {
      const stage = normalizeStage(r.status);
      return stage !== "completed" && stage !== "rejected" && !r.assigned_technician_name;
    }).length;
    return {
      submitted,
      approved,
      processing,
      completed,
      rejected,
      assigned,
      unassignedActive,
    };
  }, [rows]);

  const runAssignment = async (
    order: AdminOrderHistoryDto,
    technician: Pick<AdminUserDto, "firebase_uid" | "full_name" | "email"> | null,
  ) => {
    if (normalizeStage(order.status) === "rejected") {
      setAssignTarget(null);
      return;
    }

    setAssignBusyId(order.id);
    try {
      await assignOrderTechnician(
        {
          id: order.id,
          firebase_key: order.firebase_key,
          order_number: order.order_number,
          status: rowStatusForAssignment(order.status),
        },
        technician,
      );
      await loadHistory();
      setAssignTarget(null);
      feedback.showSuccess(
        technician ? "Technician Assigned" : "Assignment Cleared",
        technician
          ? `${order.order_number} is now assigned to ${technician.full_name}.`
          : `${order.order_number} is no longer assigned to a technician.`,
      );
    } catch (error) {
      feedback.showError(
        "Assignment Failed",
        error instanceof Error
          ? error.message
          : "Unable to update technician assignment.",
      );
    } finally {
      setAssignBusyId(null);
    }
  };

  const runEquipmentAssignment = async (
    order: AdminOrderHistoryDto,
    equipment: Pick<EquipmentPayload, "id" | "name"> | null,
  ) => {
    const stage = normalizeStage(order.status);
    if (stage === "rejected" || stage === "completed") {
      setEquipmentTarget(null);
      return;
    }

    setAssignBusyId(order.id);
    try {
      await assignOrderEquipment(
        {
          orderId: order.id,
          orderNumber: order.order_number,
          firebaseKey: order.firebase_key,
          status: rowStatusForAssignment(order.status),
        },
        equipment,
      );
      await loadHistory();
      setEquipmentTarget(null);
      feedback.showSuccess(
        equipment ? "Equipment Assigned" : "Equipment Cleared",
        equipment
          ? `${order.order_number} is now linked to ${equipment.name}.`
          : `${order.order_number} no longer has assigned equipment.`,
      );
    } catch (error) {
      feedback.showError(
        "Equipment Update Failed",
        error instanceof Error
          ? error.message
          : "Unable to update equipment assignment.",
      );
    } finally {
      setAssignBusyId(null);
    }
  };

  const actionGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];
  const mutedGradient: [string, string] = ["#64748B", "#94A3B8"];

  return (
    <RoleContentPage
      title="Orders & Assignments"
      subtitle="Merged admin timeline, queue detail, and technician assignment management."
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
            ["Processing", summary.processing, theme.colors.warning],
            ["Completed", summary.completed, theme.colors.success],
            ["Rejected", summary.rejected, theme.colors.danger],
            ["Assigned", summary.assigned, theme.colors.info],
            ["Unassigned Active", summary.unassignedActive, theme.colors.warning],
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
          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>
            Updated {lastUpdated || "--"}
          </Text>
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
            Orders, Timeline, and Technician Assignment
          </Text>
          <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}> 
            This page replaces the separate admin queue screen. Assign active orders here and the matched technician dashboard updates live.
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
              Approved: accepted and ready for technician assignment
            </Text>
            <Text style={[styles.guideLine, { color: theme.colors.textMuted }]}> 
              Assignment: choose the technician responsible before technician execution begins
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
            const canAssignTechnician =
              stage !== "rejected" && stage !== "completed";
            const canAssignEquipment =
              stage !== "rejected" && stage !== "completed";
            const labels = ["Submitted", "Approved", "Processing", "Completed"] as const;
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
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Sample: {row.sample_type || "-"} | Compound: {row.compound_name || "-"}</Text>
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>Quantity: {row.quantity ?? "-"} {row.unit || ""}</Text>
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
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Samples</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{row.sample_count}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Equipment</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{row.equipment_name || "Unassigned"}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Submitted</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDate(row.created_at)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Scheduled Start</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDate(row.scheduled_start)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>Scheduled End</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDate(row.scheduled_end)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={[styles.kvKey, { color: theme.colors.textMuted }]}>ETA</Text>
                  <Text style={[styles.kvValue, { color: theme.colors.text }]}>{formatDate(row.estimated_completion)}</Text>
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
                {canAssignTechnician || canAssignEquipment ? (
                  <View style={styles.orderActionRow}>
                    {canAssignTechnician ? (
                      <GradientButton
                        onPress={() => setAssignTarget(row)}
                        style={styles.assignBtn}
                        colors={
                          row.assigned_technician_name
                            ? ["#0891B2", "#0EA5E9"]
                            : actionGradient
                        }
                        compact
                      >
                        <Text style={styles.btnText}>
                          {row.assigned_technician_name
                            ? "Reassign Technician"
                            : "Assign Technician"}
                        </Text>
                      </GradientButton>
                    ) : null}
                    {canAssignEquipment ? (
                      <GradientButton
                        onPress={() => setEquipmentTarget(row)}
                        style={styles.assignBtn}
                        colors={
                          row.equipment_name
                            ? ["#0F766E", "#14B8A6"]
                            : ["#2563EB", "#38BDF8"]
                        }
                        compact
                      >
                        <Text style={styles.btnText}>
                          {row.equipment_name
                            ? "Reassign Equipment"
                            : "Assign Equipment"}
                        </Text>
                      </GradientButton>
                    ) : null}
                  </View>
                ) : null}
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
        visible={Boolean(
          assignTarget &&
            normalizeStage(assignTarget.status) !== "rejected" &&
            normalizeStage(assignTarget.status) !== "completed",
        )}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Assign Technician</Text>
            <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}> 
              {assignTarget?.order_number} will appear on the selected technician dashboard and calendar.
            </Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {technicians.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No active technician accounts were found.</Text>
              ) : (
                technicians.map((technician) => {
                  const selected =
                    assignTarget?.assigned_technician_uid === technician.firebase_uid;
                  return (
                    <Pressable
                      key={technician.id}
                      disabled={assignBusyId === assignTarget?.id}
                      onPress={() => {
                        if (!assignTarget) return;
                        void runAssignment(assignTarget, technician);
                      }}
                      style={[
                        styles.techOption,
                        {
                          borderColor: selected
                            ? theme.colors.primary
                            : theme.colors.border,
                          backgroundColor: selected
                            ? theme.colors.primarySoft
                            : theme.colors.surfaceMuted,
                          opacity: assignBusyId === assignTarget?.id ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.techName, { color: theme.colors.text }]}>{technician.full_name}</Text>
                      <Text style={[styles.techMeta, { color: theme.colors.textMuted }]}>{technician.email}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setAssignTarget(null)}
                style={[
                  styles.modalSecondaryBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
              <GradientButton
                onPress={() => {
                  if (!assignTarget) return;
                  void runAssignment(assignTarget, null);
                }}
                disabled={!assignTarget || assignBusyId === assignTarget.id}
                style={styles.modalPrimaryBtn}
                colors={["#DC2626", "#F97316"]}
                compact
              >
                <Text style={styles.btnText}>Clear Assignment</Text>
              </GradientButton>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(
          equipmentTarget &&
            normalizeStage(equipmentTarget.status) !== "rejected" &&
            normalizeStage(equipmentTarget.status) !== "completed",
        )}
        transparent
        animationType="fade"
        onRequestClose={() => setEquipmentTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Assign Equipment</Text>
            <Text style={[styles.modalSub, { color: theme.colors.textMuted }]}> 
              {equipmentTarget?.order_number} will use the selected equipment across admin, technician, and customer views.
            </Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {equipmentOptions.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>No equipment entries were found.</Text>
              ) : (
                equipmentOptions.map((equipment) => {
                  const selected =
                    equipmentTarget?.equipment_id === equipment.id ||
                    equipmentTarget?.equipment_name === equipment.name;
                  return (
                    <Pressable
                      key={equipment.id ?? equipment.name}
                      disabled={assignBusyId === equipmentTarget?.id}
                      onPress={() => {
                        if (!equipmentTarget) return;
                        void runEquipmentAssignment(equipmentTarget, equipment);
                      }}
                      style={[
                        styles.techOption,
                        {
                          borderColor: selected
                            ? theme.colors.primary
                            : theme.colors.border,
                          backgroundColor: selected
                            ? theme.colors.primarySoft
                            : theme.colors.surfaceMuted,
                          opacity: assignBusyId === equipmentTarget?.id ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.techName, { color: theme.colors.text }]}>{equipment.name}</Text>
                      <Text style={[styles.techMeta, { color: theme.colors.textMuted }]}>
                        {equipment.equipment_type || "Equipment"} | {equipment.is_available ? "Available" : "Busy"}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEquipmentTarget(null)}
                style={[
                  styles.modalSecondaryBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
              <GradientButton
                onPress={() => {
                  if (!equipmentTarget) return;
                  void runEquipmentAssignment(equipmentTarget, null);
                }}
                disabled={!equipmentTarget || assignBusyId === equipmentTarget.id}
                style={styles.modalPrimaryBtn}
                colors={["#DC2626", "#F97316"]}
                compact
              >
                <Text style={styles.btnText}>Clear Equipment</Text>
              </GradientButton>
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
