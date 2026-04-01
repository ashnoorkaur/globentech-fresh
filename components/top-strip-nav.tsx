import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type TopStripNavProps = {
  onOpenMenu: () => void;
  rightLabel?: string;
  rightIcon?: "home-outline" | "person-circle-outline";
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
  rightLabel,
  rightIcon = "home-outline",
  onRightPress,
  colors,
}: TopStripNavProps) {
  return (
    <View
      style={[
        styles.strip,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <TouchableOpacity style={styles.iconWrap} onPress={onOpenMenu}>
        <Ionicons name="menu" size={25} color={colors.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.rightButton, { borderColor: colors.border }]}
        onPress={onRightPress ?? (() => router.push("/"))}
      >
        <Ionicons name={rightIcon} size={22} color={colors.primary} />
        {rightLabel ? (
          <Text style={[styles.rightText, { color: colors.primary }]}>
            {rightLabel}
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rightButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  rightText: {
    fontSize: 14,
    fontWeight: "800",
  },
});
