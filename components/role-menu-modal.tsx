import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MenuItem } from "../constants/role-menus";

type RoleMenuModalProps = {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
  activeKey: string;
  colors: {
    surface: string;
    border: string;
    text: string;
    primary: string;
    primarySoft: string;
  };
  onLogout?: () => void;
};

export function RoleMenuModal({
  visible,
  onClose,
  items,
  activeKey,
  colors,
  onLogout,
}: RoleMenuModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>
                GlobenTech
              </Text>
              <Text style={[styles.subtitle, { color: colors.primary }]}>
                Navigation
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeButton, { borderColor: colors.border }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuList}>
            {items.map((item) => {
              const active = item.key === activeKey;

              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.menuItem,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active
                        ? colors.primarySoft
                        : colors.surface,
                    },
                  ]}
                  onPress={() => {
                    onClose();
                    if (!active) {
                      router.push(item.route);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.activeStripe,
                      {
                        backgroundColor: active
                          ? colors.primary
                          : "transparent",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.menuText,
                      { color: active ? colors.primary : colors.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {active ? (
                    <Text
                      style={[styles.activeLabel, { color: colors.primary }]}
                    >
                      Current
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {onLogout ? (
            <TouchableOpacity
              style={[styles.logoutItem, { borderColor: colors.border }]}
              onPress={() => {
                onClose();
                onLogout();
              }}
            >
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.34)",
  },
  panel: {
    flex: 1,
    marginTop: 18,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.4,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  menuList: {
    flex: 1,
    gap: 10,
  },
  menuItem: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1,
    paddingLeft: 18,
    paddingRight: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  activeStripe: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 999,
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  logoutItem: {
    marginTop: 12,
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#FDECEC",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#B42318",
  },
});
