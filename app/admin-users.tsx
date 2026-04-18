import { useCallback, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
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
import {
    hasCachedScreenState,
    useCachedScreenState,
} from "../hooks/use-screen-cache";
import {
    adminActivateUser,
    adminChangeRole,
    adminDeactivateUser,
    fetchAdminUserList,
    type ProfileDto,
} from "../lib/account-api";
import { fetchAdminUsers } from "../lib/admin-api";
import { formatBackendDateTime } from "../lib/date-time";
import { useAppTheme } from "../lib/theme";

const roles: ProfileDto["role"][] = ["customer", "technician", "administrator"];
type ManagedUser = ProfileDto & { last_login?: string };

const normalizeManagedRole = (role?: string): ProfileDto["role"] => {
  const value = (role || "").trim().toLowerCase();
  if (value === "administrator" || value === "admin") {
    return "administrator";
  }
  if (value === "technician" || value === "tech") {
    return "technician";
  }
  return "customer";
};

const roleLabel = (role: ProfileDto["role"]) => {
  if (role === "administrator") return "Admin";
  if (role === "technician") return "Technician";
  return "Customer";
};

export default function AdminUsersPage() {
  const theme = useAppTheme();
  const feedback = useFeedbackModal();
  const [users, setUsers] = useCachedScreenState<ManagedUser[]>(
    "admin-users:users:v2",
    [],
  );
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<ProfileDto["role"] | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [draftRoleFilter, setDraftRoleFilter] = useState<
    ProfileDto["role"] | "all"
  >("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [loading, setLoading] = useState(
    () => !hasCachedScreenState("admin-users:users:v2"),
  );
  const [errorText, setErrorText] = useState("");
  const [rolePickerId, setRolePickerId] = useState<number | null>(null);
  const [rolePickerVisible, setRolePickerVisible] = useState(false);
  const primaryGradient: [string, string] = ["#4F7CFF", "#8C5BEA"];

  const loadUsers = useCallback(async () => {
    if (users.length === 0) {
      setLoading(true);
    }
    setErrorText("");
    try {
      const [profileResult, adminResult] = await Promise.allSettled([
        fetchAdminUserList(),
        fetchAdminUsers(),
      ]);

      const merged = new Map<string, ManagedUser>();

      if (profileResult.status === "fulfilled") {
        profileResult.value.forEach((row) => {
          const key = String(row.id || row.email || "").toLowerCase();
          merged.set(key, {
            id: row.id,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone || "",
            company_name: row.company_name || "",
            address: row.address || "",
            role: normalizeManagedRole(row.role),
            is_active: row.is_active,
          });
        });
      }

      if (adminResult.status === "fulfilled") {
        adminResult.value.forEach((row) => {
          const key = String(row.id || row.email || "").toLowerCase();
          const existing = merged.get(key);
          merged.set(key, {
            id: row.id,
            full_name: row.full_name || existing?.full_name || "User",
            email: row.email || existing?.email || "",
            phone: existing?.phone || "",
            company_name: row.company_name || existing?.company_name || "",
            address: existing?.address || "",
            role: normalizeManagedRole(row.role || existing?.role),
            is_active: row.is_active,
            last_login: row.last_login,
          });
        });
      }

      const allUsers = Array.from(merged.values()).sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || ""),
      );

      if (allUsers.length === 0) {
        setErrorText("No users found yet.");
      }
      setUsers(allUsers);

      if (
        profileResult.status === "rejected" &&
        adminResult.status === "rejected"
      ) {
        setErrorText("Failed to load users from backend.");
      }
    } catch {
      setErrorText("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [setUsers, users.length]);

  useFocusedPolling(loadUsers, { intervalMs: 25000 });

  const filteredUsers = useMemo(() => {
    let result = users;

    // Apply search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((user) => {
        const name = (user.full_name || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        const id = String(user.id || "").toLowerCase();
        return name.includes(q) || email.includes(q) || id.includes(q);
      });
    }

    // Apply role filter
    if (roleFilter !== "all") {
      result = result.filter(
        (user) => normalizeManagedRole(user.role) === roleFilter,
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      const isActive = statusFilter === "active";
      result = result.filter((user) => user.is_active === isActive);
    }

    return result;
  }, [search, roleFilter, statusFilter, users]);

  const setRole = async (userId: number, role: ProfileDto["role"]) => {
    try {
      await adminChangeRole(userId, role);
      await loadUsers();
      feedback.showSuccess(
        "Role Updated",
        `User role changed to ${roleLabel(role)}.`,
      );
    } catch (error) {
      feedback.showError(
        "Role Update Failed",
        error instanceof Error ? error.message : "Unable to update role.",
      );
    }
  };

  const setActive = async (user: ManagedUser) => {
    try {
      if (user.is_active) {
        await adminDeactivateUser(user.id);
      } else {
        await adminActivateUser(user.id);
      }
      await loadUsers();
      feedback.showSuccess(
        "User Updated",
        `${user.full_name} has been ${user.is_active ? "disabled" : "enabled"}.`,
      );
    } catch (error) {
      feedback.showError(
        "Account Update Failed",
        error instanceof Error
          ? error.message
          : "Unable to update account status.",
      );
    }
  };

  return (
    <RoleContentPage
      title="Manage Users"
      subtitle="All users are listed here for role and account status control."
      activeKey="users"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
      role="Admin"
    >
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Info Banner */}
        <View
          style={[
            styles.infoBanner,
            {
              backgroundColor: theme.colors.primarySoft,
              borderColor: theme.colors.primary,
            },
          ]}
        >
          <Text style={[styles.infoText, { color: theme.colors.primary }]}>
            New users register as Customer by default. Only administrators can
            assign roles.
          </Text>
        </View>

        {/* Search Section */}
        <View style={styles.searchSection}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search users by ID, name, or email"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                backgroundColor: theme.colors.inputBg,
                borderColor: theme.colors.border,
              },
            ]}
          />
          <GradientButton
            onPress={loadUsers}
            style={styles.searchBtn}
            colors={primaryGradient}
            compact
          >
            <Text style={styles.searchBtnText}>
              {loading ? "Loading" : "Search"}
            </Text>
          </GradientButton>
        </View>

        {/* Filter Section */}
        <View style={styles.filterSection}>
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.colors.text }]}>
              Role
            </Text>
            <View style={styles.filterDropdownWrap}>
              <Pressable
                onPress={() => {
                  setRoleFilterOpen((v) => !v);
                  setStatusFilterOpen(false);
                }}
                style={[
                  styles.filterDropdown,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterDropdownText,
                    { color: theme.colors.text },
                  ]}
                >
                  {draftRoleFilter === "all"
                    ? "All Roles"
                    : roleLabel(draftRoleFilter)}
                </Text>
                <Text
                  style={[
                    styles.dropdownArrow,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {roleFilterOpen ? "▲" : "▼"}
                </Text>
              </Pressable>
              {roleFilterOpen ? (
                <View
                  style={[
                    styles.dropdownList,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {(
                    ["all", "customer", "technician", "administrator"] as const
                  ).map((role) => (
                    <Pressable
                      key={role}
                      onPress={() => {
                        setDraftRoleFilter(role as ProfileDto["role"] | "all");
                        setRoleFilterOpen(false);
                      }}
                      style={[
                        styles.dropdownListItem,
                        {
                          backgroundColor:
                            draftRoleFilter === role
                              ? theme.colors.primarySoft
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownListItemText,
                          { color: theme.colors.text },
                        ]}
                      >
                        {role === "all"
                          ? "All Roles"
                          : roleLabel(role as ProfileDto["role"])}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.colors.text }]}>
              Status
            </Text>
            <View style={styles.filterDropdownWrap}>
              <Pressable
                onPress={() => {
                  setStatusFilterOpen((v) => !v);
                  setRoleFilterOpen(false);
                }}
                style={[
                  styles.filterDropdown,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterDropdownText,
                    { color: theme.colors.text },
                  ]}
                >
                  {draftStatusFilter === "all"
                    ? "All Status"
                    : draftStatusFilter.charAt(0).toUpperCase() +
                      draftStatusFilter.slice(1)}
                </Text>
                <Text
                  style={[
                    styles.dropdownArrow,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {statusFilterOpen ? "▲" : "▼"}
                </Text>
              </Pressable>
              {statusFilterOpen ? (
                <View
                  style={[
                    styles.dropdownList,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {(["all", "active", "inactive"] as const).map((status) => (
                    <Pressable
                      key={status}
                      onPress={() => {
                        setDraftStatusFilter(status);
                        setStatusFilterOpen(false);
                      }}
                      style={[
                        styles.dropdownListItem,
                        {
                          backgroundColor:
                            draftStatusFilter === status
                              ? theme.colors.primarySoft
                              : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownListItemText,
                          { color: theme.colors.text },
                        ]}
                      >
                        {status === "all"
                          ? "All Status"
                          : status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <GradientButton
            onPress={() => {
              setRoleFilter(draftRoleFilter);
              setStatusFilter(draftStatusFilter);
              setRoleFilterOpen(false);
              setStatusFilterOpen(false);
            }}
            style={styles.applyFilterBtn}
            colors={primaryGradient}
            compact
          >
            <Text style={styles.applyFilterBtnText}>Apply Filters</Text>
          </GradientButton>
        </View>

        {/* Stats Section */}
        <View
          style={[
            styles.statsGrid,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {users.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Total Users
            </Text>
          </View>
          <View
            style={[
              styles.statDivisor,
              { backgroundColor: theme.colors.border },
            ]}
          />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.colors.secondary }]}>
              {filteredUsers.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Displayed
            </Text>
          </View>
        </View>

        {/* Error Alert */}
        {errorText && (
          <View
            style={[
              styles.alertBox,
              {
                backgroundColor: theme.colors.dangerSoft,
                borderLeftColor: theme.colors.danger,
              },
            ]}
          >
            <Text style={[styles.alertText, { color: theme.colors.danger }]}>
              {errorText}
            </Text>
          </View>
        )}

        {/* Users List */}
        {filteredUsers.length === 0 && !errorText ? (
          <View style={styles.emptyState}>
            <Text
              style={[styles.emptyStateText, { color: theme.colors.textMuted }]}
            >
              No users found
            </Text>
          </View>
        ) : null}
        <View style={styles.usersListWrap}>
          {filteredUsers.map((user) => (
            <View
              key={String(user.id)}
              style={[
                styles.userCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  shadowColor: theme.colors.text,
                },
              ]}
            >
              {/* User Profile Section */}
              <View style={styles.userProfile}>
                <View style={styles.userDetails}>
                  <Text
                    style={[styles.userName, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {user.full_name}
                  </Text>
                  <Text
                    style={[
                      styles.userEmail,
                      { color: theme.colors.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {user.email}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusIndicator,
                    {
                      backgroundColor: user.is_active
                        ? theme.colors.success
                        : theme.colors.danger,
                    },
                  ]}
                />
              </View>

              {/* User Meta Information */}
              <View style={styles.metaInfo}>
                <View
                  style={[
                    styles.roleTag,
                    { backgroundColor: theme.colors.primarySoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleTagText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {roleLabel(user.role)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.idTag,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.idTagText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    ID: {user.id}
                  </Text>
                </View>
                {user.last_login ? (
                  <Text
                    style={[
                      styles.lastLoginText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Last Login: {formatBackendDateTime(user.last_login, "Never")}
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.lastLoginText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Last Login: Never
                  </Text>
                )}
              </View>

              {/* Role Assignment Dropdown */}
              <View style={styles.roleSection}>
                <Text
                  style={[styles.sectionLabel, { color: theme.colors.text }]}
                >
                  Role Assignment
                </Text>
                <Pressable
                  onPress={() => {
                    setRolePickerId(user.id);
                    setRolePickerVisible(true);
                  }}
                  style={[
                    styles.roleDropdown,
                    {
                      backgroundColor: theme.colors.inputBg,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleDropdownText,
                      { color: theme.colors.text },
                    ]}
                  >
                    {roleLabel(user.role)}
                  </Text>
                  <Text
                    style={[
                      styles.dropdownArrow,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    ▼
                  </Text>
                </Pressable>
                <Text
                  style={[styles.roleNote, { color: theme.colors.textMuted }]}
                >
                  Only administrators can modify user roles
                </Text>
              </View>

              {/* Account Control */}
              <Pressable
                onPress={() => setActive(user)}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: user.is_active
                      ? theme.colors.danger
                      : theme.colors.success,
                    shadowColor: theme.colors.text,
                  },
                ]}
              >
                <Text style={styles.actionBtnText}>
                  {user.is_active ? "Disable" : "Enable"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Role Picker Modal */}
        <Modal
          transparent
          visible={rolePickerVisible}
          onRequestClose={() => setRolePickerVisible(false)}
          animationType="fade"
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setRolePickerVisible(false)}
          >
            <View
              style={[
                styles.modalContent,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Select Role
              </Text>
              <View style={styles.roleOptionsContainer}>
                {roles.map((role) => (
                  <Pressable
                    key={role}
                    onPress={() => {
                      if (rolePickerId) {
                        setRole(rolePickerId, role);
                      }
                      setRolePickerVisible(false);
                    }}
                    style={[
                      styles.roleOptionModal,
                      {
                        backgroundColor: theme.colors.inputBg,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleOptionModalText,
                        { color: theme.colors.text },
                      ]}
                    >
                      {roleLabel(role)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Modal>
      </View>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  // Info Banner
  infoBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },

  // Search Section
  searchSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
  },
  searchBtn: {
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 38,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    backgroundColor: "#6A73F6",
  },
  searchBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 11,
  },

  // Filter Section
  filterSection: {
    gap: 16,
    marginBottom: 16,
  },
  filterGroup: {
    gap: 8,
  },
  filterDropdownWrap: {
    zIndex: 3,
  },
  filterDropdown: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterDropdownText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownListItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dropdownListItemText: {
    fontSize: 12,
    fontWeight: "600",
  },
  applyFilterBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  applyFilterBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterButtons: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Stats Section
  statsGrid: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  stat: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  statDivisor: {
    width: 1,
  },

  // Alert Box
  alertBox: {
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: "rgba(220, 38, 38, 0.05)",
  },
  alertText: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },

  // List Container
  usersListWrap: {
    gap: 12,
    paddingBottom: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: "500",
  },

  // User Card
  userCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },

  // User Profile Section
  userProfile: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 12,
    fontWeight: "400",
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 12,
  },

  // Meta Information
  metaInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  idTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  idTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  lastLoginText: {
    fontSize: 11,
    fontWeight: "400",
    flexShrink: 1,
    width: "100%",
    lineHeight: 16,
  },

  // Role Section
  roleSection: {
    gap: 9,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  roleDropdown: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roleDropdownText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownArrow: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Role Note
  roleNote: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 6,
    fontStyle: "italic",
  },

  // Action Button
  actionBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    alignSelf: "flex-start",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderRadius: 16,
    padding: 20,
    width: "80%",
    maxWidth: 300,
    elevation: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  roleOptionsContainer: {
    gap: 10,
  },
  roleOptionModal: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  roleOptionModalText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
