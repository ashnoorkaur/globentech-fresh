import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MenuItem } from "../constants/role-menus";

const PANEL_WIDTH = Dimensions.get("window").width * 0.78;

const ICON_MAP: Record<string, string> = {
  home: "home-outline",
  login: "log-in-outline",
  signup: "person-add-outline",
  dashboard: "grid-outline",
  "my-orders": "receipt-outline",
  "order-history": "time-outline",
  "new-order": "add-circle-outline",
  "contact-us": "chatbubble-ellipses-outline",
  approvals: "checkmark-circle-outline",
  calendar: "calendar-outline",
  users: "people-outline",
  equipment: "construct-outline",
  reports: "bar-chart-outline",
  tasks: "list-outline",
  samples: "flask-outline",
  settings: "settings-outline",
  profile: "person-circle-outline",
  chatbot: "sparkles-outline",
  about: "information-circle-outline",
};

type RoleMenuModalProps = {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
  activeKey: string;
  isDark?: boolean;
  colors: {
    surface: string;
    border: string;
    text: string;
    primary: string;
    primarySoft: string;
    textMuted?: string;
    buttonStart: string;
    buttonEnd: string;
    danger: string;
  };
  onLogout?: () => void;
  role?: string;
  displayName?: string;
  onProfilePress?: () => void;
};

export function RoleMenuModal({
  visible,
  onClose,
  items,
  activeKey,
  isDark = false,
  colors,
  onLogout,
  role,
  displayName,
  onProfilePress,
}: RoleMenuModalProps) {
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 180,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -PANEL_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const overlayBg = isDark ? "rgba(7,16,26,0.7)" : "rgba(7,16,26,0.5)";

  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: overlayBg }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <SafeAreaView style={{ flex: 1 }}>
            {/* ── HEADER ── */}
            <LinearGradient
              colors={[colors.buttonStart, colors.buttonEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
              <TouchableOpacity
                style={styles.headerLeft}
                onPress={() => {
                  onClose();
                  (onProfilePress ?? (() => router.push("/profile")))();
                }}
                activeOpacity={0.8}
              >
                <View style={styles.avatarCircle}>
                  <Ionicons name="person" size={22} color="#fff" />
                </View>
                <View style={styles.headerCopy}>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {displayName || role || "User"}
                  </Text>
                  <Text style={styles.headerRole} numberOfLines={1}>
                    {role ?? "User"}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>

            {/* ── MENU ITEMS ── */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.menuList}
              showsVerticalScrollIndicator={false}
            >
              {items.map((item) => {
                const active = item.key === activeKey;
                const iconName = (ICON_MAP[item.key] ??
                  "chevron-forward-outline") as string;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.75}
                    style={[
                      styles.menuItem,
                      {
                        backgroundColor: active
                          ? colors.primarySoft
                          : "transparent",
                        borderLeftColor: active
                          ? colors.primary
                          : "transparent",
                      },
                    ]}
                    onPress={() => {
                      onClose();
                      if (!active) router.push(item.route);
                    }}
                  >
                    <View
                      style={[
                        styles.iconBox,
                        {
                          backgroundColor: active
                            ? colors.primary
                            : colors.primarySoft,
                        },
                      ]}
                    >
                      <Ionicons
                        name={iconName as any}
                        size={18}
                        color={active ? "#fff" : colors.primary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.menuText,
                        {
                          color: active ? colors.primary : colors.text,
                          fontWeight: active ? "800" : "600",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {active && (
                      <View
                        style={[
                          styles.activeDot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── LOGOUT ── */}
            {onLogout ? (
              <TouchableOpacity
                style={[styles.logoutBtn, { borderColor: colors.danger }]}
                activeOpacity={0.75}
                onPress={() => {
                  onClose();
                  onLogout();
                }}
              >
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color={colors.danger}
                />
                <Text style={[styles.logoutText, { color: colors.danger }]}>
                  Logout
                </Text>
              </TouchableOpacity>
            ) : null}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 12,
  },
  header: {
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { gap: 2 },
  headerName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerRole: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  menuList: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderLeftWidth: 3,
    gap: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
