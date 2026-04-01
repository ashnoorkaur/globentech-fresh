import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { get, ref } from "firebase/database";
import { useEffect, useState } from "react";
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { ProjectFooter } from "../components/project-footer";
import { RoleMenuModal } from "../components/role-menu-modal";
import { TopStripNav } from "../components/top-strip-nav";
import { FeedbackModal } from "../components/ui/feedback-modal";
import { GradientButton } from "../components/ui/gradient-button";
import { customerMenu } from "../constants/role-menus";
import { auth, db } from "../firebase/config";
import { getIsDarkMode, setDarkMode, useAppTheme } from "../lib/theme";

type ModalState = {
  visible: boolean;
  title: string;
  message: string;
  variant: "info" | "success" | "error";
};

export default function Settings() {
  const theme = useAppTheme();
  const [darkMode, setDarkModeValue] = useState(getIsDarkMode());
  const [menuVisible, setMenuVisible] = useState(false);
  const [profile, setProfile] = useState({
    fullName: "Test Customer",
    email: "customer@globentech.com",
  });
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: "",
    message: "",
    variant: "info",
  });

  useEffect(() => {
    const loadSettings = async () => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      try {
        const snapshot = await get(ref(db, `users/${currentUser.uid}`));
        const userData = snapshot.val();

        setProfile({
          fullName: userData?.name || "Test Customer",
          email:
            userData?.email || currentUser.email || "customer@globentech.com",
        });
      } catch {
        setProfile({
          fullName: "Test Customer",
          email: currentUser.email || "customer@globentech.com",
        });
      }
    };

    loadSettings();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[styles.bubble1, { backgroundColor: theme.colors.primarySoft }]}
      />
      <View
        style={[styles.bubble2, { backgroundColor: theme.colors.primarySoft }]}
      />

      <TopStripNav
        onOpenMenu={() => setMenuVisible(true)}
        rightIcon="home-outline"
        onRightPress={() => router.push("/customer-dashboard")}
        colors={theme.colors}
      />

      <ScrollView
        style={styles.scroll}
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
          <Text style={[styles.heroTitle, { color: theme.colors.primary }]}>
            Account Settings
          </Text>
          <Text style={[styles.heroSub, { color: theme.colors.textMuted }]}>
            Manage your theme, notifications, profile, password, and account.
          </Text>
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
          <Text
            style={[styles.sectionHeading, { color: theme.colors.primary }]}
          >
            Theme
          </Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>
            Choose your preferred colour scheme. Your preference is saved in
            this browser.
          </Text>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: theme.colors.text }]}>
              Dark Mode
            </Text>
            <Switch
              value={darkMode}
              onValueChange={(value) => {
                setDarkMode(value);
                setDarkModeValue(value);
              }}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
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
          <Text
            style={[styles.sectionHeading, { color: theme.colors.primary }]}
          >
            Profile
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            Full Name *
          </Text>
          <TextInput
            value={profile.fullName}
            editable={false}
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.inputBg,
                borderColor: theme.colors.border,
                color: theme.colors.text,
              },
            ]}
          />

          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
            Email
          </Text>
          <TextInput
            value={profile.email}
            editable={false}
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.inputBg,
                borderColor: theme.colors.border,
                color: theme.colors.text,
              },
            ]}
          />
          <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
            Email cannot be changed here. Contact support if needed.
          </Text>

          <GradientButton
            style={styles.primaryButton}
            onPress={() => router.push("/profile")}
          >
            <Text style={styles.primaryButtonText}>Update Personal Info</Text>
          </GradientButton>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              { borderColor: theme.colors.primary },
            ]}
            onPress={() => router.push("/profile")}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: theme.colors.primary },
              ]}
            >
              Change Password
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.dangerButton,
              {
                backgroundColor: theme.colors.dangerSoft,
                borderColor: theme.colors.danger,
              },
            ]}
            onPress={() =>
              setModal({
                visible: true,
                title: "Deactivate Account",
                message:
                  "Use the profile page for account deactivation controls.",
                variant: "info",
              })
            }
          >
            <Text
              style={[styles.dangerButtonText, { color: theme.colors.danger }]}
            >
              Deactivate Account
            </Text>
          </TouchableOpacity>
        </View>

        <ProjectFooter colors={theme.colors} />

        <TouchableOpacity
          style={[styles.logout, { backgroundColor: theme.colors.danger }]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <FeedbackModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        variant={modal.variant}
        onConfirm={() => setModal((prev) => ({ ...prev, visible: false }))}
      />

      <RoleMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={customerMenu}
        activeKey=""
        colors={theme.colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  bubble1: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -70,
    top: -80,
    opacity: 0.45,
  },
  bubble2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    left: -70,
    bottom: -80,
    opacity: 0.35,
  },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 14,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 14,
    overflow: "hidden",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  dangerButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  logout: {
    marginTop: 20,
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#B42318",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
});
