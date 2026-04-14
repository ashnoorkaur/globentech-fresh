import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import {
    adminMenu,
    customerMenu,
    guestMenu,
    technicianMenu,
} from "../constants/role-menus";
import { useConfirmModal } from "../hooks/use-confirm-modal";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { fetchMyProfile, type ProfileDto } from "../lib/account-api";
import { fetchSessionUser, logoutSession } from "../lib/auth-api";
import { clearChatSession } from "../lib/chatbot-session";
import { clearNotifications } from "../lib/notifications-store";
import { setSessionUser, useSessionState } from "../lib/session-store";
import { getIsDarkMode, setDarkMode, useAppTheme } from "../lib/theme";

const isRolePlaceholderName = (value?: string) => {
  const normalized = (value || "").trim().toLowerCase();
  return (
    normalized === "session" ||
    normalized === "authenticated user" ||
    normalized === "customer" ||
    normalized === "technician" ||
    normalized === "admin" ||
    normalized === "administrator"
  );
};

/**
 * Reusable info row component for displaying profile information
 */
function InfoRow({
  label,
  value,
  backgroundColor,
  borderColor,
  textColor,
  labelColor,
}: {
  label: string;
  value: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  labelColor: string;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        {
          borderColor,
          backgroundColor,
        },
      ]}
    >
      <Text style={[styles.infoLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: textColor }]}>
        {value || "-"}
      </Text>
    </View>
  );
}

export default function ProfilePage() {
  const theme = useAppTheme();
  const session = useSessionState();
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [darkMode, setDarkModeState] = useState(getIsDarkMode());
  const feedback = useFeedbackModal();
  const confirm = useConfirmModal();

  const loadData = useCallback(async () => {
    try {
      const p = await fetchMyProfile();
      setProfile({
        ...p,
        role: session.user?.role || p.role,
      });
      // Sync session store with fetched profile data
      const resolvedName = !isRolePlaceholderName(p.full_name)
        ? p.full_name
        : "";
      setSessionUser({
        id: p.id,
        full_name: resolvedName,
        email: p.email,
        role: session.user?.role || p.role,
      });
    } catch {
      // Customer profile endpoint can occasionally fail on some backend paths;
      // keep profile fields populated from session user instead of showing blanks.
      try {
        const sessionUser = await fetchSessionUser();
        const resolvedId =
          sessionUser.id > 0
            ? sessionUser.id
            : session.user?.id && session.user.id > 0
              ? session.user.id
              : 0;
        const resolvedEmail =
          sessionUser.email && sessionUser.email !== "session@local"
            ? sessionUser.email
            : session.user?.email || "";
        const resolvedName =
          sessionUser.full_name && !isRolePlaceholderName(sessionUser.full_name)
            ? sessionUser.full_name
            : session.user?.full_name || "";

        setSessionUser({
          ...sessionUser,
          id: resolvedId,
          email: resolvedEmail,
          full_name: resolvedName,
        });
        setProfile((prev) => ({
          id: resolvedId,
          full_name: resolvedName,
          email: resolvedEmail,
          role: session.user?.role || sessionUser.role,
          is_active: prev?.is_active ?? true,
          phone: prev?.phone,
          company_name: prev?.company_name,
          address: prev?.address,
        }));
      } catch {
        setProfile((prev) => {
          if (prev) return prev;
          if (!session.user) return null;
          return {
            id: session.user.id,
            full_name: session.user.full_name,
            email: session.user.email,
            role: session.user.role,
            is_active: true,
          };
        });
      }
    }
  }, [session.user]);

  useFocusedPolling(loadData, { intervalMs: 25000 });

  const menuItems = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return adminMenu;
    if (role === "technician") return technicianMenu;
    if (role === "customer") return customerMenu;
    return guestMenu;
  }, [session.user?.role]);

  const dashboardRoute = useMemo(() => {
    const role = session.user?.role;
    if (role === "administrator") return "/admin-dashboard" as const;
    if (role === "technician") return "/technician-dashboard" as const;
    if (role === "customer") return "/customer-dashboard" as const;
    return "/login" as const;
  }, [session.user?.role]);

  const roleLabel = useMemo(() => {
    const role = session.user?.role || profile?.role;
    if (!role) return "Guest";
    if (role === "administrator") return "Admin";
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [session.user?.role, profile?.role]);

  const statusBadgeColor =
    profile?.is_active !== false ? theme.colors.success : theme.colors.danger;

  const resolvedProfileId =
    profile?.id && profile.id > 0
      ? profile.id
      : session.user?.id && session.user.id > 0
        ? session.user.id
        : null;
  const resolvedProfileName =
    (!isRolePlaceholderName(profile?.full_name) && profile?.full_name) ||
    (!isRolePlaceholderName(session.user?.full_name) &&
      session.user?.full_name) ||
    "";
  const resolvedProfileEmail =
    profile?.email && profile.email !== "session@local"
      ? profile.email
      : session.user?.email && session.user.email !== "session@local"
        ? session.user.email
        : "";

  const logoutNow = () => {
    confirm.openConfirm({
      title: "Log Out?",
      message: "You will be signed out from this device.",
      confirmText: "Log Out",
      cancelText: "Stay Signed In",
      variant: "error",
      onConfirm: async () => {
        try {
          await logoutSession();
        } finally {
          clearChatSession();
          clearNotifications();
          setSessionUser(null);
          router.replace("/login");
        }
      },
    });
  };

  const toggleTheme = (value: boolean) => {
    setDarkMode(value);
    setDarkModeState(value);
  };

  return (
    <RoleContentPage
      title="Profile"
      subtitle="View your account details, switch theme, and control your account."
      role={roleLabel}
      activeKey="profile"
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
      leftActionMode="back"
      onLeftActionPress={() => router.push(dashboardRoute)}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 20 }}
      >
        {/* Account Overview Section */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Account Overview
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusBadgeColor },
              ]}
            >
              <Text style={styles.statusText}>
                {profile?.is_active !== false ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

          {/* Theme Toggle */}
          <View style={styles.themeSection}>
            <View style={styles.themeLabelRow}>
              <Text style={[styles.themeTitle, { color: theme.colors.text }]}>
                Theme Preference
              </Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                Saved on this device across app restarts
              </Text>
            </View>
            <View style={styles.themeRow}>
              <View style={styles.modeItem}>
                <Ionicons
                  name="sunny-outline"
                  size={16}
                  color={theme.colors.warning}
                />
                <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                  Light
                </Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={toggleTheme}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                accessibilityLabel="Theme toggle"
                accessibilityHint="Switch between light and dark mode"
              />
              <View style={styles.modeItem}>
                <Ionicons
                  name="moon-outline"
                  size={16}
                  color={theme.colors.info}
                />
                <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                  Dark
                </Text>
              </View>
            </View>
          </View>

          {/* Profile Info Grid */}
          <View style={styles.infoGrid}>
            <InfoRow
              label="User ID"
              value={resolvedProfileId != null ? String(resolvedProfileId) : ""}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
            <InfoRow
              label="Full Name"
              value={resolvedProfileName}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
            <InfoRow
              label="Email"
              value={resolvedProfileEmail}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
            <InfoRow
              label="Role"
              value={roleLabel}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
            <InfoRow
              label="Phone"
              value={profile?.phone || ""}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
            <InfoRow
              label="Company"
              value={profile?.company_name || ""}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
            <InfoRow
              label="Address"
              value={profile?.address || ""}
              backgroundColor={theme.colors.surfaceMuted}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              labelColor={theme.colors.textMuted}
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.actionGrid}>
            <GradientButton
              onPress={() => router.push("/change-password")}
              variant="secondary"
              style={styles.primaryAction}
              accessibilityLabel="Change account password"
            >
              Change Password
            </GradientButton>
          </View>

          {/* Logout Button */}
          <GradientButton
            onPress={logoutNow}
            variant="danger"
            colors={[theme.colors.danger, theme.colors.danger]}
            accessibilityLabel="Logout from account"
          >
            Log Out
          </GradientButton>
        </View>
      </ScrollView>
      {feedback.modal}
      {confirm.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  themeTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  themeSection: {
    gap: 8,
  },
  themeLabelRow: {
    paddingHorizontal: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
    textTransform: "uppercase",
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    paddingHorizontal: 4,
  },
  modeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoGrid: {
    gap: 8,
  },
  infoRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  actionGrid: {
    gap: 10,
    marginTop: 4,
  },
  primaryAction: {
    alignSelf: "stretch",
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
