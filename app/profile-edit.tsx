import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { GradientButton } from "../components/ui/gradient-button";
import {
  adminMenu,
  customerMenu,
  guestMenu,
  technicianMenu,
} from "../constants/role-menus";
import { useFeedbackModal } from "../hooks/use-feedback-modal";
import { useFocusedPolling } from "../hooks/use-focused-polling";
import { fetchMyProfile, updateMyProfile } from "../lib/account-api";
import { setSessionUser, useSessionState } from "../lib/session-store";
import { useAppTheme } from "../lib/theme";

/**
 * Input field wrapper component for consistent styling
 */
function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  multiline = false,
  inputBgColor,
  borderColor,
  textColor,
  placeholderTextColor,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable?: boolean;
  multiline?: boolean;
  inputBgColor: string;
  borderColor: string;
  textColor: string;
  placeholderTextColor: string;
}) {
  return (
    <View style={styles.formGroup}>
      {label && (
        <Text style={[styles.label, { color: textColor }]}>
          {label} {label?.includes("*") ? "" : ""}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        editable={editable}
        multiline={multiline}
        style={[
          styles.input,
          {
            color: editable ? textColor : placeholderTextColor,
            borderColor,
            backgroundColor: inputBgColor,
          },
          multiline && styles.textarea,
        ]}
      />
    </View>
  );
}

export default function ProfileEditPage() {
  const theme = useAppTheme();
  const session = useSessionState();
  const feedback = useFeedbackModal();
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      const profile = await fetchMyProfile();
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setCompanyName(profile.company_name || "");
      setAddress(profile.address || "");
      setEmail(profile.email || session.user?.email || "");
      setSessionUser({
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
      });
    } catch {
      setEmail(session.user?.email || "");
    }
  }, [session.user?.email]);

  useFocusedPolling(loadProfile, { intervalMs: 25000 });

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
    if (session.user?.role === "administrator") return "Admin";
    if (session.user?.role === "technician") return "Technician";
    if (session.user?.role === "customer") return "Customer";
    return "Guest";
  }, [session.user?.role]);

  const onSave = async () => {
    setBusy(true);
    try {
      await updateMyProfile({
        full_name: fullName,
        phone,
        company_name: companyName,
        address,
      });

      // Pull the canonical profile right after save and sync the global session
      // so header/menu labels update immediately across the app.
      const refreshed = await fetchMyProfile();
      setSessionUser({
        id: refreshed.id,
        full_name: refreshed.full_name,
        email: refreshed.email,
        role: refreshed.role,
      });

      feedback.showSuccess("Profile Updated", "Your profile has been updated.");
      router.replace("/profile");
    } catch (error) {
      feedback.showError(
        "Update Failed",
        error instanceof Error ? error.message : "Unable to update profile.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <RoleContentPage
      title="Update Profile"
      subtitle="Edit your account details and save changes securely."
      role={roleLabel}
      activeKey="profile"
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
      leftActionMode="back"
      onLeftActionPress={() => router.replace("/profile")}
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
        {/* Header */}
        <View style={styles.headerRow}>
          <Ionicons
            name="person-circle-outline"
            size={24}
            color={theme.colors.primary}
          />
          <Text style={[styles.headerText, { color: theme.colors.text }]}>
            Edit Account Details
          </Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formSection}>
          <FormInput
            label="Full Name *"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your full name"
            inputBgColor={theme.colors.inputBg}
            borderColor={theme.colors.border}
            textColor={theme.colors.text}
            placeholderTextColor={theme.colors.textMuted}
          />

          <FormInput
            label="Email (Read-only)"
            value={email}
            onChangeText={() => {}}
            placeholder="Email"
            editable={false}
            inputBgColor={theme.colors.surfaceMuted}
            borderColor={theme.colors.border}
            textColor={theme.colors.textMuted}
            placeholderTextColor={theme.colors.textMuted}
          />
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            Email cannot be changed because it is tied to your login session.
          </Text>

          <FormInput
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            inputBgColor={theme.colors.inputBg}
            borderColor={theme.colors.border}
            textColor={theme.colors.text}
            placeholderTextColor={theme.colors.textMuted}
          />

          <FormInput
            label="Company Name"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Enter your company name"
            inputBgColor={theme.colors.inputBg}
            borderColor={theme.colors.border}
            textColor={theme.colors.text}
            placeholderTextColor={theme.colors.textMuted}
          />

          <FormInput
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Enter your address"
            multiline
            inputBgColor={theme.colors.inputBg}
            borderColor={theme.colors.border}
            textColor={theme.colors.text}
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonGroup}>
          <GradientButton
            onPress={onSave}
            disabled={busy}
            loading={busy}
            variant="primary"
            accessibilityLabel="Save profile changes"
          >
            {busy ? "Saving..." : "Save Changes"}
          </GradientButton>
          <GradientButton
            onPress={() => router.replace("/profile")}
            disabled={busy}
            variant="outline"
            accessibilityLabel="Cancel and return to profile"
          >
            Cancel
          </GradientButton>
        </View>
      </View>
      {feedback.modal}
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  formSection: {
    gap: 12,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "500",
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    marginTop: -4,
  },
  buttonGroup: {
    gap: 10,
    marginTop: 8,
  },
});
