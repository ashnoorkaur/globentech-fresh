import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { get, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ProjectFooter } from "../components/project-footer";
import { RoleMenuModal } from "../components/role-menu-modal";
import {
  adminMenu,
  customerMenu,
  technicianMenu,
  type MenuItem,
} from "../constants/role-menus";
import { auth, db } from "../firebase/config";
import { getIsDarkMode, setDarkMode, useAppTheme } from "../lib/theme";

type UserRole = "customer" | "technician" | "admin";

export default function Settings() {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [darkMode, setDarkModeValue] = useState(getIsDarkMode());
  const [role, setRole] = useState<UserRole>("customer");
  const [profile, setProfile] = useState({
    fullName: "Test Customer",
    email: "customer@globentech.com",
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
        const nextRole = (userData?.role || "customer") as UserRole;

        setProfile({
          fullName: userData?.name || "Test Customer",
          email:
            userData?.email || currentUser.email || "customer@globentech.com",
        });
        setRole(nextRole);
      } catch {
        setProfile({
          fullName: "Test Customer",
          email: currentUser.email || "customer@globentech.com",
        });
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const menuItems = useMemo<MenuItem[]>(() => {
    if (role === "admin") {
      return adminMenu;
    }

    if (role === "technician") {
      return technicianMenu;
    }

    return customerMenu;
  }, [role]);

  const handleThemeToggle = (value: boolean) => {
    setDarkMode(value);
    setDarkModeValue(value);
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
        style={[styles.bubble1, { backgroundColor: theme.colors.primarySoft }]}
      />
      <View
        style={[styles.bubble2, { backgroundColor: theme.colors.primarySoft }]}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[
              styles.iconButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => setMenuVisible(true)}
          >
            <Ionicons name="menu" size={24} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.profileBadge,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => router.push("/profile")}
          >
            <Ionicons
              name="person-circle-outline"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              style={[styles.profileBadgeText, { color: theme.colors.primary }]}
            >
              {role}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[styles.heroCard, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={styles.heroLabel}>PREFERENCES</Text>
          <Text style={styles.heroTitle}>Settings</Text>
          <Text style={styles.heroSub}>
            Manage your account and app preferences.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
          ACCOUNT
        </Text>

        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
        >
          <View style={styles.cardInner}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Profile
            </Text>
            <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              {profile.fullName} • {profile.email}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>
            ›
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
        >
          <View style={styles.cardInner}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Account Settings
            </Text>
            <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              Manage your profile, password, and account.
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>
            ›
          </Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
          APPEARANCE
        </Text>

        <View
          style={[
            styles.cardRow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.cardInner}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Dark Mode
            </Text>
            <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              Choose your preferred colour scheme. Your preference is saved in
              this browser.
            </Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={handleThemeToggle}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
          SUPPORT
        </Text>

        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => router.push("/chatbot")}
          activeOpacity={0.8}
        >
          <View style={styles.cardInner}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Chat
            </Text>
            <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              Open the assistant for quick support and navigation help.
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>
            ›
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
        >
          <View style={styles.cardInner}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Privacy & Security
            </Text>
            <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              Manage password changes and account controls.
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>
            ›
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.logout, { backgroundColor: theme.colors.danger }]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <ProjectFooter colors={theme.colors} />
      </ScrollView>

      <RoleMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
        activeKey=""
        colors={theme.colors}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bubble1: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -80,
    top: -90,
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  profileBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  heroCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroLabel: {
    color: "#DBEAFE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSub: {
    color: "#E2E8F0",
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardInner: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    lineHeight: 19,
  },
  chevron: {
    fontSize: 26,
    marginLeft: 12,
  },
  logout: {
    marginTop: 18,
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#B42318",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: 16,
  },
  logoutText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
});
