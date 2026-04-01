import { Href, router } from "expo-router";
import { ReactNode, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { MenuItem } from "../constants/role-menus";
import { useAppTheme } from "../lib/theme";
import { ProjectFooter } from "./project-footer";
import { RoleMenuModal } from "./role-menu-modal";
import { TopStripNav } from "./top-strip-nav";

type RoleContentPageProps = {
  title: string;
  subtitle: string;
  activeKey: string;
  menuItems: MenuItem[];
  dashboardRoute: Href;
  children?: ReactNode;
};

export function RoleContentPage({
  title,
  subtitle,
  activeKey,
  menuItems,
  dashboardRoute,
  children,
}: RoleContentPageProps) {
  const theme = useAppTheme();
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <SafeAreaView
      style={[styles.page, { backgroundColor: theme.colors.background }]}
    >
      <TopStripNav
        onOpenMenu={() => setMenuVisible(true)}
        rightIcon="home-outline"
        onRightPress={() => router.push(dashboardRoute)}
        colors={theme.colors}
      />

      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {subtitle}
        </Text>
        {children}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.systemTitle, { color: theme.colors.text }]}>
            System Information
          </Text>
          <Text style={[styles.systemLine, { color: theme.colors.textMuted }]}>
            Project: Phase 3 Prototype
          </Text>
          <Text style={[styles.systemLine, { color: theme.colors.textMuted }]}>
            Status: Development
          </Text>
        </View>
        <ProjectFooter colors={theme.colors} />
      </ScrollView>

      <RoleMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
        activeKey={activeKey}
        colors={theme.colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 30, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  bottomBar: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  systemTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  systemLine: { fontSize: 13, lineHeight: 19 },
});
