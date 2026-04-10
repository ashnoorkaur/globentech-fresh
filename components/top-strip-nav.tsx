import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type TopStripNavProps = {
  onOpenMenu?: () => void;
  role?: string;
  onProfilePress?: () => void;
  leftMode?: "menu" | "back";
  onLeftPress?: () => void;
  hideBrand?: boolean;
  rightMode?: "profile" | "home";
  onRightPress?: () => void;
  colors: {
    surface: string;
    border: string;
    text: string;
    primary: string;
  };
};

export function TopStripNav({
  onOpenMenu,
  role,
  onProfilePress,
  leftMode = "menu",
  onLeftPress,
  hideBrand = false,
  rightMode = "profile",
  onRightPress,
  colors,
}: TopStripNavProps) {
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.sideBtn,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
        onPress={onLeftPress ?? onOpenMenu}
        activeOpacity={0.7}
      >
        <Ionicons
          name={leftMode === "back" ? "arrow-back" : "menu-outline"}
          size={24}
          color={colors.primary}
        />
      </TouchableOpacity>

      <View style={styles.centerWrap}>
        {!hideBrand ? (
          <Text style={[styles.brand, { color: colors.primary }]}>
            GLOBENTECH
          </Text>
        ) : null}
      </View>

      <View style={styles.rightWrap}>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={
            onRightPress ??
            (rightMode === "home"
              ? () => router.push("/admin-dashboard")
              : (onProfilePress ?? (() => router.push("/profile"))))
          }
          activeOpacity={0.7}
        >
          <Ionicons
            name={
              rightMode === "home" ? "home-outline" : "person-circle-outline"
            }
            size={30}
            color={colors.primary}
          />
          {rightMode === "profile" && role ? (
            <Text style={[styles.roleLabel, { color: colors.primary }]}>
              {role}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 20,
  },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 3.5,
  },
  profileBtn: {
    width: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  rightWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    marginTop: 1,
  },
});
