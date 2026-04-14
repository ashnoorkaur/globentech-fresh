import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { useCachedScreenState } from "../hooks/use-screen-cache";
import {
    addEquipment,
    fetchEquipmentList,
    updateEquipment,
    type EquipmentPayload,
} from "../lib/equipment-api";
import { useAppTheme } from "../lib/theme";

export default function AdminEquipmentPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();
  const [equipment, setEquipment] = useCachedScreenState<EquipmentPayload[]>(
    "admin-equipment:equipment",
    [],
  );
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [processingTime, setProcessingTime] = useState("");
  const [warmupTime, setWarmupTime] = useState("");
  const [dailyCapacity, setDailyCapacity] = useState("");
  const [breakInterval, setBreakInterval] = useState("");
  const [breakDuration, setBreakDuration] = useState("");
  const [lastMaintenance, setLastMaintenance] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [formErrorText, setFormErrorText] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useCachedScreenState(
    "admin-equipment:lastUpdated",
    "",
  );

  const loadEquipment = async () => {
    setErrorText("");
    try {
      const data = await fetchEquipmentList();
      setEquipment(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "Failed to load equipment.",
      );
    }
  };

  useFocusedPolling(loadEquipment, { intervalMs: 12000 });

  const resetForm = () => {
    setName("");
    setEquipmentType("");
    setProcessingTime("");
    setWarmupTime("");
    setDailyCapacity("");
    setBreakInterval("");
    setBreakDuration("");
    setLastMaintenance("");
    setIsAvailable(true);
    setFormErrorText("");
  };

  const fillForm = (item: EquipmentPayload) => {
    setName(item.name || "");
    setEquipmentType(item.equipment_type || "ICP");
    setProcessingTime(String(item.processing_time_per_sample ?? 0));
    setWarmupTime(String(item.warmup_time ?? 0));
    setDailyCapacity(String(item.daily_capacity ?? 0));
    setBreakInterval(String(item.break_interval ?? 0));
    setBreakDuration(String(item.break_duration ?? 0));
    setLastMaintenance(item.last_maintenance || "");
    setIsAvailable(Boolean(item.is_available));
  };

  const buildPayload = (id?: number): EquipmentPayload => ({
    id,
    name: name.trim(),
    equipment_type: equipmentType.trim(),
    processing_time_per_sample: Number(processingTime) || 0,
    warmup_time: Number(warmupTime) || 0,
    break_interval: Number(breakInterval) || 0,
    break_duration: Number(breakDuration) || 0,
    daily_capacity: Number(dailyCapacity) || 0,
    is_available: isAvailable,
    last_maintenance: lastMaintenance.trim() || undefined,
  });

  const canSave = useMemo(() => {
    return (
      name.trim().length > 1 &&
      equipmentType.trim().length > 0 &&
      Number(processingTime) > 0
    );
  }, [name, equipmentType, processingTime]);

  const createEquipment = async () => {
    if (!canSave) {
      setFormErrorText("Name, type, and processing time are required.");
      feedback.showInfo(
        "Missing Fields",
        "Please fill required fields before adding equipment.",
      );
      return;
    }

    try {
      setFormBusy(true);
      setFormErrorText("");
      await addEquipment(buildPayload());
      await loadEquipment();
      resetForm();
      setShowFormModal(false);
      feedback.showSuccess(
        "Equipment Added",
        "New equipment was added successfully.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to add equipment.";
      setFormErrorText(message);
      feedback.showError("Add Failed", message);
    } finally {
      setFormBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !canSave) {
      setFormErrorText("Name, type, and processing time are required.");
      feedback.showInfo(
        "Missing Fields",
        "Please fill required fields before saving changes.",
      );
      return;
    }

    try {
      setFormBusy(true);
      setFormErrorText("");
      await updateEquipment(buildPayload(editingId));
      await loadEquipment();
      setEditingId(null);
      resetForm();
      setShowFormModal(false);
      feedback.showSuccess(
        "Equipment Updated",
        "Equipment details were updated successfully.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update equipment.";
      setFormErrorText(message);
      feedback.showError("Update Failed", message);
    } finally {
      setFormBusy(false);
    }
  };

  const runDelay = async (item: EquipmentPayload) => {
    if (!item.id) return;
    setBusyId(item.id);
    try {
      await updateEquipment({
        ...item,
        is_available: false,
        break_duration: (item.break_duration || 0) + 10,
      });
      await loadEquipment();
      feedback.showSuccess(
        "Delay Applied",
        `${item.name} marked delayed and temporarily unavailable.`,
      );
    } catch (error) {
      feedback.showError(
        "Delay Failed",
        error instanceof Error ? error.message : "Unable to apply delay.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const beginEdit = (item: EquipmentPayload) => {
    if (!item.id) return;
    setEditingId(item.id);
    fillForm(item);
    setShowFormModal(true);
  };

  const openAddModal = () => {
    setEditingId(null);
    resetForm();
    setFormBusy(false);
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    setEditingId(null);
    setFormBusy(false);
    resetForm();
  };

  return (
    <RoleContentPage
      title="Manage Equipment"
      subtitle="Configure equipment settings, processing times, and schedules."
      activeKey="equipment"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
    >
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.updatedText, { color: theme.colors.textMuted }]}>
            Updated {lastUpdated || "--"}
          </Text>
          <View style={styles.topActions}>
            <Pressable
              onPress={openAddModal}
              style={[styles.primaryTopBtn, { overflow: "hidden" }]}
            >
              <LinearGradient
                colors={["#4F7CFF", "#8C5BEA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.submitBtnText}>+ Add Equipment</Text>
            </Pressable>
            <Pressable
              onPress={loadEquipment}
              style={[
                styles.secondaryTopBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.secondaryTopBtnText,
                  { color: theme.colors.text },
                ]}
              >
                Refresh
              </Text>
            </Pressable>
          </View>

          {equipment.map((item, idx) => (
            <View
              key={`${item.id ?? item.name}-${idx}`}
              style={[
                styles.equipmentCard,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                },
              ]}
            >
              <View style={styles.equipmentHead}>
                <Text
                  style={[styles.equipmentName, { color: theme.colors.text }]}
                >
                  {item.name}
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: item.is_available
                        ? theme.colors.success + "22"
                        : theme.colors.dangerSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      {
                        color: item.is_available
                          ? theme.colors.success
                          : theme.colors.danger,
                      },
                    ]}
                  >
                    {item.is_available ? "AVAILABLE" : "UNAVAILABLE"}
                  </Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <Text
                  style={[styles.metaItem, { color: theme.colors.textMuted }]}
                >
                  Type:{" "}
                  <Text
                    style={[styles.metaValue, { color: theme.colors.text }]}
                  >
                    {item.equipment_type}
                  </Text>
                </Text>
                <Text
                  style={[styles.metaItem, { color: theme.colors.textMuted }]}
                >
                  Process:{" "}
                  <Text
                    style={[styles.metaValue, { color: theme.colors.text }]}
                  >
                    {item.processing_time_per_sample} min
                  </Text>
                </Text>
                <Text
                  style={[styles.metaItem, { color: theme.colors.textMuted }]}
                >
                  Warmup:{" "}
                  <Text
                    style={[styles.metaValue, { color: theme.colors.text }]}
                  >
                    {item.warmup_time} min
                  </Text>
                </Text>
                <Text
                  style={[styles.metaItem, { color: theme.colors.textMuted }]}
                >
                  Break:{" "}
                  <Text
                    style={[styles.metaValue, { color: theme.colors.text }]}
                  >
                    {item.break_interval} / {item.break_duration} min
                  </Text>
                </Text>
                <Text
                  style={[styles.metaItem, { color: theme.colors.textMuted }]}
                >
                  Capacity:{" "}
                  <Text
                    style={[styles.metaValue, { color: theme.colors.text }]}
                  >
                    {item.daily_capacity}
                  </Text>
                </Text>
                <Text
                  style={[styles.metaItem, { color: theme.colors.textMuted }]}
                >
                  Last Maintenance:{" "}
                  <Text
                    style={[styles.metaValue, { color: theme.colors.text }]}
                  >
                    {item.last_maintenance || "N/A"}
                  </Text>
                </Text>
              </View>

              <View style={styles.rowActions}>
                <Pressable
                  onPress={() => beginEdit(item)}
                  style={[styles.actionBtn, { overflow: "hidden" }]}
                >
                  <LinearGradient
                    colors={["#4F7CFF", "#8C5BEA"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={styles.actionBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    confirm.openConfirm({
                      title: "Log Equipment Delay",
                      message: `Apply delay to ${item.name}?`,
                      confirmText: "Delay",
                      onConfirm: () => runDelay(item),
                    })
                  }
                  disabled={busyId === item.id}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: theme.colors.secondary,
                      opacity: busyId === item.id ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={styles.actionBtnText}>
                    {busyId === item.id ? "..." : "Delay"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {errorText ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {errorText}
            </Text>
          ) : null}
        </View>

        <Modal
          visible={showFormModal}
          animationType="slide"
          transparent
          onRequestClose={closeFormModal}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                <Text style={[styles.formTitle, { color: theme.colors.text }]}>
                  {editingId ? "Edit Equipment" : "Add Equipment"}
                </Text>
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Name *
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Example: ICP Mass Spectrometer"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Equipment Type *
                </Text>
                <TextInput
                  value={equipmentType}
                  onChangeText={setEquipmentType}
                  placeholder="Example: ICP"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Processing Time per Sample (min) *
                </Text>
                <TextInput
                  value={processingTime}
                  onChangeText={setProcessingTime}
                  keyboardType="numeric"
                  placeholder="Example: 15"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Warmup Time (min)
                </Text>
                <TextInput
                  value={warmupTime}
                  onChangeText={setWarmupTime}
                  keyboardType="numeric"
                  placeholder="Example: 10"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Daily Capacity
                </Text>
                <TextInput
                  value={dailyCapacity}
                  onChangeText={setDailyCapacity}
                  keyboardType="numeric"
                  placeholder="Example: 120"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Break Interval (samples)
                </Text>
                <TextInput
                  value={breakInterval}
                  onChangeText={setBreakInterval}
                  keyboardType="numeric"
                  placeholder="Example: 20"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Break Duration (min)
                </Text>
                <TextInput
                  value={breakDuration}
                  onChangeText={setBreakDuration}
                  keyboardType="numeric"
                  placeholder="Example: 10"
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
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  Last Maintenance (optional)
                </Text>
                <TextInput
                  value={lastMaintenance}
                  onChangeText={setLastMaintenance}
                  placeholder="YYYY-MM-DD"
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
                <View style={styles.toggleRow}>
                  <Text
                    style={[styles.toggleText, { color: theme.colors.text }]}
                  >
                    Available
                  </Text>
                  <Switch
                    value={isAvailable}
                    onValueChange={setIsAvailable}
                    trackColor={{
                      false: theme.colors.border,
                      true: theme.colors.primary,
                    }}
                  />
                </View>
                <View style={styles.formActions}>
                  <Pressable
                    onPress={closeFormModal}
                    disabled={formBusy}
                    style={[
                      styles.submitBtn,
                      {
                        flex: 1,
                        backgroundColor: theme.colors.textMuted,
                        opacity: formBusy ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.submitBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={editingId ? saveEdit : createEquipment}
                    disabled={formBusy}
                    style={[
                      styles.submitBtn,
                      {
                        flex: 1,
                        overflow: "hidden",
                        opacity: formBusy ? 0.7 : 1,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={["#4F7CFF", "#8C5BEA"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.submitBtnText}>
                      {formBusy
                        ? editingId
                          ? "Saving..."
                          : "Adding..."
                        : editingId
                          ? "Save Changes"
                          : "Add Equipment"}
                    </Text>
                  </Pressable>
                </View>
                {!canSave ? (
                  <Text
                    style={[
                      styles.helperText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Required: Name, Equipment Type, and Processing Time.
                  </Text>
                ) : null}
                {formErrorText ? (
                  <Text
                    style={[styles.errorText, { color: theme.colors.danger }]}
                  >
                    {formErrorText}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
      {feedback.modal}
      {confirm.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  updatedText: { fontSize: 12, fontWeight: "700" },
  topActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  primaryTopBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryTopBtn: {
    minWidth: 92,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  secondaryTopBtnText: { fontWeight: "800", fontSize: 12 },
  equipmentCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  equipmentHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  equipmentName: { fontSize: 15, fontWeight: "800", flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  metaGrid: { gap: 4 },
  metaItem: { fontSize: 12, fontWeight: "600" },
  metaValue: { fontWeight: "800" },
  rowActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 14,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: "88%",
    padding: 14,
    gap: 8,
  },
  formTitle: { fontSize: 18, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleText: { fontSize: 14, fontWeight: "700" },
  formActions: { flexDirection: "row", gap: 8 },
  submitBtn: { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  submitBtnText: { color: "#fff", fontWeight: "800" },
  helperText: { fontSize: 12, fontWeight: "600" },
  errorText: { fontSize: 13, fontWeight: "700" },
});
