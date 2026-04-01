import { router } from "expo-router";
import {
    Modal,
    Pressable,
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
        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>GlobenTech</Text>
          {items.map((item) => {
            const active = item.key === activeKey;

            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.menuItem,
                  active && {
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => {
                  onClose();
                  if (!active) {
                    router.push(item.route);
                  }
                }}
              >
                <Text
                  style={[
                    styles.menuText,
                    { color: active ? colors.primary : colors.text },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {onLogout ? (
            <TouchableOpacity
              style={[styles.menuItem, styles.logoutItem]}
              onPress={() => {
                onClose();
                onLogout();
              }}
            >
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(37, 99, 235, 0.16)",
    justifyContent: "flex-start",
    paddingTop: 88,
    paddingHorizontal: 16,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 6,
  },
  menuText: {
    fontSize: 15,
    fontWeight: "700",
  },
  logoutItem: {
    marginTop: 6,
    backgroundColor: "#FDECEC",
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B42318",
  },
});
