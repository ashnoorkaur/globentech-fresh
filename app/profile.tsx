import { router } from "expo-router";
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    signOut,
    updatePassword,
} from "firebase/auth";
import { get, ref, update } from "firebase/database";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { FeedbackModal } from "../components/ui/feedback-modal";
import { auth, db } from "../firebase/config";
import { getIsDarkMode, setDarkMode, useAppTheme } from "../lib/theme";

type ModalVariant = "info" | "success" | "error";

type ModalState = {
  visible: boolean;
  title: string;
  message: string;
  variant: ModalVariant;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

type UserItem = {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  role: string;
  status?: string;
};

const roleOptions = ["customer", "technician", "admin"] as const;

const initialModalState: ModalState = {
  visible: false,
  title: "",
  message: "",
  variant: "info",
};

export default function Profile() {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(getIsDarkMode());
  const [role, setRole] = useState("customer");
  const [status, setStatus] = useState("active");
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    address: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [users, setUsers] = useState<UserItem[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(initialModalState);

  useEffect(() => {
    const loadData = async () => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      try {
        const snapshot = await get(ref(db, `users/${currentUser.uid}`));

        if (!snapshot.exists()) {
          router.replace("/login");
          return;
        }

        const userData = snapshot.val();
        const nextRole = userData.role || "customer";
        const nextStatus = userData.status || "active";

        setProfile({
          fullName: userData.name || "",
          email: userData.email || currentUser.email || "",
          phone: userData.phone || "",
          company: userData.company || "",
          address: userData.address || "",
        });
        setRole(nextRole);
        setStatus(nextStatus);

        if (nextRole === "admin") {
          const usersSnapshot = await get(ref(db, "users"));

          if (usersSnapshot.exists()) {
            const nextUsers = Object.values(
              usersSnapshot.val() as Record<string, UserItem>,
            )
              .map((item) => ({
                uid: item.uid,
                name: item.name || "Unknown User",
                email: item.email || "No email",
                phone: item.phone || "",
                company: item.company || "",
                address: item.address || "",
                role: item.role || "customer",
                status: item.status || "active",
              }))
              .sort((left, right) => left.name.localeCompare(right.name));

            setUsers(nextUsers);
          }
        }
      } catch {
        router.replace("/login");
        return;
      }

      setLoading(false);
    };

    loadData();
  }, []);

  const showModal = (next: Partial<ModalState>) => {
    setModal({
      ...initialModalState,
      ...next,
      visible: true,
    });
  };

  const handleModalCancel = () => {
    const cancelAction = modal.onCancel;
    setModal(initialModalState);
    cancelAction?.();
  };

  const handleModalConfirm = () => {
    const confirmAction = modal.onConfirm;
    setModal(initialModalState);
    confirmAction?.();
  };

  const handleProfileFieldChange = (
    field: keyof typeof profile,
    value: string,
  ) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handlePasswordFieldChange = (
    field: keyof typeof passwordForm,
    value: string,
  ) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handleUpdateProfile = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      router.replace("/login");
      return;
    }

    if (!profile.fullName.trim()) {
      showModal({
        title: "Full Name Required",
        message: "Enter your full name before saving your profile.",
        variant: "error",
      });
      return;
    }

    if (!/^[A-Za-z\s]+$/.test(profile.fullName.trim())) {
      showModal({
        title: "Invalid Name",
        message: "Full name should contain letters and spaces only.",
        variant: "error",
      });
      return;
    }

    if (profile.phone.trim() && !/^\d+$/.test(profile.phone.trim())) {
      showModal({
        title: "Invalid Phone",
        message: "Phone number must contain digits only.",
        variant: "error",
      });
      return;
    }

    setSavingProfile(true);

    try {
      await update(ref(db, `users/${currentUser.uid}`), {
        name: profile.fullName.trim(),
        phone: profile.phone.trim(),
        company: profile.company.trim(),
        address: profile.address.trim(),
      });

      setUsers((current) =>
        current.map((item) =>
          item.uid === currentUser.uid
            ? {
                ...item,
                name: profile.fullName.trim(),
                phone: profile.phone.trim(),
                company: profile.company.trim(),
                address: profile.address.trim(),
              }
            : item,
        ),
      );

      showModal({
        title: "Profile Updated",
        message: "Your account details were updated successfully.",
        variant: "success",
      });
    } catch {
      showModal({
        title: "Update Failed",
        message: "Unable to update profile right now. Please try again.",
        variant: "error",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleThemeChange = (value: boolean) => {
    setDarkMode(value);
    setIsDark(value);
  };

  const handleChangePassword = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || !currentUser.email) {
      router.replace("/login");
      return;
    }

    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      showModal({
        title: "Missing Password Fields",
        message: "Fill in all password fields before submitting.",
        variant: "error",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      showModal({
        title: "Weak Password",
        message: "New password must be at least 6 characters long.",
        variant: "error",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showModal({
        title: "Password Mismatch",
        message: "New password and confirmation do not match.",
        variant: "error",
      });
      return;
    }

    setChangingPassword(true);

    try {
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        passwordForm.currentPassword,
      );
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, passwordForm.newPassword);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      showModal({
        title: "Password Changed",
        message: "Your password has been updated successfully.",
        variant: "success",
      });
    } catch {
      showModal({
        title: "Password Change Failed",
        message: "Check your current password and try again.",
        variant: "error",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const updateUserList = (targetUid: string, patch: Partial<UserItem>) => {
    setUsers((current) =>
      current.map((item) =>
        item.uid === targetUid ? { ...item, ...patch } : item,
      ),
    );
  };

  const handleRoleUpdate = async (
    targetUid: string,
    nextRole: (typeof roleOptions)[number],
  ) => {
    setUpdatingUserId(targetUid);

    try {
      await update(ref(db, `users/${targetUid}`), { role: nextRole });
      updateUserList(targetUid, { role: nextRole });
      showModal({
        title: "Role Updated",
        message: `The selected user is now assigned as ${nextRole}.`,
        variant: "success",
      });
    } catch {
      showModal({
        title: "Role Update Failed",
        message: "Unable to update role right now. Please try again.",
        variant: "error",
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleUserStatus = async (target: UserItem) => {
    const nextStatus =
      (target.status || "active") === "active" ? "inactive" : "active";
    setUpdatingUserId(target.uid);

    try {
      await update(ref(db, `users/${target.uid}`), { status: nextStatus });
      updateUserList(target.uid, { status: nextStatus });

      if (target.uid === auth.currentUser?.uid) {
        setStatus(nextStatus);
      }

      showModal({
        title: "Status Updated",
        message: `${target.name} is now ${nextStatus}.`,
        variant: "success",
      });
    } catch {
      showModal({
        title: "Status Update Failed",
        message: "Unable to update account status right now.",
        variant: "error",
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const confirmDeactivateOwnAccount = () => {
    showModal({
      title: "Deactivate My Account",
      message:
        "Deactivating your account will log you out and prevent future logins. Your data is retained. Contact an administrator to reactivate.",
      variant: "error",
      confirmText: "Deactivate",
      cancelText: "Cancel",
      onConfirm: async () => {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          router.replace("/login");
          return;
        }

        try {
          await update(ref(db, `users/${currentUser.uid}`), {
            status: "inactive",
          });
          await signOut(auth);
          router.replace("/login");
        } catch {
          showModal({
            title: "Deactivate Failed",
            message: "Unable to deactivate your account right now.",
            variant: "error",
          });
        }
      },
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (loading) {
    return (
      <View
        style={[styles.loader, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.bgGlowTop,
          { backgroundColor: theme.colors.primarySoft },
        ]}
      />
      <View
        style={[
          styles.bgGlowBottom,
          { backgroundColor: theme.colors.primarySoft },
        ]}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.kicker, { color: theme.colors.primary }]}>
            ACCOUNT
          </Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Account Settings
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Manage your profile, password, and account.
          </Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.rolePill,
                { backgroundColor: theme.colors.primarySoft },
              ]}
            >
              <Text
                style={[styles.rolePillText, { color: theme.colors.primary }]}
              >
                Role: {role}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    status === "active"
                      ? theme.colors.success
                      : theme.colors.danger,
                },
              ]}
            >
              <Text style={styles.statusPillText}>{status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Profile
          </Text>

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Full Name *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={profile.fullName}
            onChangeText={(value) =>
              handleProfileFieldChange("fullName", value)
            }
            placeholder="Enter your full name"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Email
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.disabledInput,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
                color: theme.colors.textMuted,
              },
            ]}
            value={profile.email}
            editable={false}
          />
          <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
            Email cannot be changed here. Contact support if needed.
          </Text>

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Phone
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={profile.phone}
            onChangeText={(value) =>
              handleProfileFieldChange("phone", value.replace(/[^\d]/g, ""))
            }
            placeholder="Enter phone number"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Company Name
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={profile.company}
            onChangeText={(value) => handleProfileFieldChange("company", value)}
            placeholder="Enter company name"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Address
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={profile.address}
            onChangeText={(value) => handleProfileFieldChange("address", value)}
            placeholder="Enter address"
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.primary },
              savingProfile && styles.buttonDisabled,
            ]}
            onPress={handleUpdateProfile}
            disabled={savingProfile}
          >
            <Text style={styles.primaryButtonText}>
              {savingProfile ? "Saving..." : "Update Profile"}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Theme
          </Text>
          <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
            Choose your preferred colour scheme. Your preference is saved in
            this browser.
          </Text>

          <View style={styles.themeToggleRow}>
            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: !isDark
                    ? theme.colors.primary
                    : theme.colors.surfaceMuted,
                },
              ]}
              onPress={() => handleThemeChange(false)}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  { color: !isDark ? "#FFFFFF" : theme.colors.text },
                ]}
              >
                Light
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: isDark
                    ? theme.colors.primary
                    : theme.colors.surfaceMuted,
                },
              ]}
              onPress={() => handleThemeChange(true)}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  { color: isDark ? "#FFFFFF" : theme.colors.text },
                ]}
              >
                Dark
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Change Password
          </Text>

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Current Password *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={passwordForm.currentPassword}
            onChangeText={(value) =>
              handlePasswordFieldChange("currentPassword", value)
            }
            placeholder="Current Password"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>
            New Password *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={passwordForm.newPassword}
            onChangeText={(value) =>
              handlePasswordFieldChange("newPassword", value)
            }
            placeholder="New Password"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>
            Confirm New Password *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.inputBg,
                color: theme.colors.text,
              },
            ]}
            value={passwordForm.confirmPassword}
            onChangeText={(value) =>
              handlePasswordFieldChange("confirmPassword", value)
            }
            placeholder="Confirm New Password"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
          />

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.primary },
              changingPassword && styles.buttonDisabled,
            ]}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            <Text style={styles.primaryButtonText}>
              {changingPassword ? "Updating..." : "Change Password"}
            </Text>
          </TouchableOpacity>
        </View>

        {role === "admin" ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Manage Users (Admin)
            </Text>
            <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
              Assign roles and activate/deactivate user accounts.
            </Text>

            <View
              style={[
                styles.tableHeader,
                { borderBottomColor: theme.colors.border },
              ]}
            >
              <Text
                style={[
                  styles.tableHeaderText,
                  { color: theme.colors.textMuted },
                ]}
              >
                NAME
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  { color: theme.colors.textMuted },
                ]}
              >
                EMAIL
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  { color: theme.colors.textMuted },
                ]}
              >
                ROLE
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  { color: theme.colors.textMuted },
                ]}
              >
                STATUS
              </Text>
              <Text
                style={[
                  styles.tableHeaderText,
                  { color: theme.colors.textMuted },
                ]}
              >
                ACTIONS
              </Text>
            </View>

            {users.map((item) => {
              const itemStatus = item.status || "active";
              const isUpdating = updatingUserId === item.uid;

              return (
                <View
                  key={item.uid}
                  style={[
                    styles.userRow,
                    { borderBottomColor: theme.colors.border },
                  ]}
                >
                  <Text
                    style={[styles.userLineTitle, { color: theme.colors.text }]}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.userLine, { color: theme.colors.textMuted }]}
                  >
                    {item.email}
                  </Text>

                  <View style={styles.roleOptionsWrap}>
                    {roleOptions.map((roleOption) => {
                      const selected = item.role === roleOption;

                      return (
                        <TouchableOpacity
                          key={`${item.uid}-${roleOption}`}
                          style={[
                            styles.roleOption,
                            {
                              borderColor: selected
                                ? theme.colors.primary
                                : theme.colors.border,
                              backgroundColor: selected
                                ? theme.colors.primarySoft
                                : theme.colors.surfaceMuted,
                            },
                          ]}
                          disabled={isUpdating}
                          onPress={() => handleRoleUpdate(item.uid, roleOption)}
                        >
                          <Text
                            style={[
                              styles.roleOptionText,
                              {
                                color: selected
                                  ? theme.colors.primary
                                  : theme.colors.textMuted,
                              },
                            ]}
                          >
                            {roleOption}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.userActionRow}>
                    <View
                      style={[
                        styles.inlineStatusPill,
                        {
                          backgroundColor:
                            itemStatus === "active"
                              ? theme.colors.success
                              : theme.colors.danger,
                        },
                      ]}
                    >
                      <Text style={styles.inlineStatusText}>
                        {itemStatus.toUpperCase()}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.statusButton,
                        {
                          backgroundColor:
                            itemStatus === "active"
                              ? theme.colors.dangerSoft
                              : theme.colors.primarySoft,
                        },
                      ]}
                      disabled={isUpdating}
                      onPress={() => handleToggleUserStatus(item)}
                    >
                      <Text
                        style={[
                          styles.statusButtonText,
                          {
                            color:
                              itemStatus === "active"
                                ? theme.colors.danger
                                : theme.colors.primary,
                          },
                        ]}
                      >
                        {isUpdating
                          ? "Saving..."
                          : itemStatus === "active"
                            ? "Deactivate"
                            : "Activate"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Deactivate Account
          </Text>
          <Text style={[styles.helpText, { color: theme.colors.textMuted }]}>
            Deactivating your account will log you out and prevent future
            logins. Your data is retained. Contact an administrator to
            reactivate.
          </Text>
          <TouchableOpacity
            style={[
              styles.dangerButton,
              {
                borderColor: theme.colors.danger,
                backgroundColor: theme.colors.dangerSoft,
              },
            ]}
            onPress={confirmDeactivateOwnAccount}
          >
            <Text
              style={[styles.dangerButtonText, { color: theme.colors.danger }]}
            >
              Deactivate My Account
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.footerCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.footerBrand, { color: theme.colors.text }]}>
            GlobenTech
          </Text>
          <Text
            style={[styles.footerSubtitle, { color: theme.colors.textMuted }]}
          >
            Laboratory Order Management System
          </Text>

          <Text style={[styles.footerHeading, { color: theme.colors.text }]}>
            Project Information
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            Course: CPSY 301-D
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            Phase 3 Prototype
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            SAIT - 2025
          </Text>

          <Text style={[styles.footerHeading, { color: theme.colors.text }]}>
            Client
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            GMJ Global Energy
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            Astra Agus Pramana
          </Text>

          <Text style={[styles.footerHeading, { color: theme.colors.text }]}>
            Team Members
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            Bhavya Bhavya, Evan Di Placido, Ahmad Fakhry
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            Gaganpreet Kaur, Ashnoor Kaur, Justice Mazerolle
          </Text>
          <Text style={[styles.footerLine, { color: theme.colors.textMuted }]}>
            Ravneet Kaur
          </Text>

          <Text
            style={[styles.footerCopyright, { color: theme.colors.textMuted }]}
          >
            © 2026 GlobenTech. School Project - All rights reserved.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: theme.colors.primary },
          ]}
          onPress={handleLogout}
        >
          <Text style={styles.primaryButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <FeedbackModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        variant={modal.variant}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        onCancel={modal.cancelText ? handleModalCancel : undefined}
        onConfirm={handleModalConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bgGlowTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -90,
    top: -100,
    opacity: 0.5,
  },
  bgGlowBottom: {
    position: "absolute",
    width: 270,
    height: 270,
    borderRadius: 135,
    left: -120,
    bottom: -130,
    opacity: 0.35,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 22,
    marginBottom: 16,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
  },
  statusRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    flexWrap: "wrap",
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 12,
  },
  disabledInput: {
    opacity: 0.82,
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  themeToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  themeOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 4,
    flexWrap: "wrap",
    gap: 8,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  userRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  userLineTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  userLine: {
    fontSize: 13,
    marginBottom: 10,
  },
  roleOptionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  roleOption: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  userActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  inlineStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  inlineStatusText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dangerButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  footerCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  footerBrand: {
    fontSize: 24,
    fontWeight: "800",
  },
  footerSubtitle: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  footerHeading: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 6,
  },
  footerLine: {
    fontSize: 13,
    lineHeight: 20,
  },
  footerCopyright: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
});
