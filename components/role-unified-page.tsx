import { Href, router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { MenuItem } from "../constants/role-menus";
import { useAppTheme } from "../lib/theme";
import { RoleContentPage } from "./role-content-page";
import { GradientButton } from "./ui/gradient-button";

type RolePageAction = {
  label: string;
  route: Href;
};

type RoleUnifiedPageProps = {
  title: string;
  subtitle: string;
  role: string;
  activeKey: string;
  menuItems: MenuItem[];
  dashboardRoute: Href;
  sectionTitle: string;
  sectionDescription: string;
  actions: RolePageAction[];
};

export function RoleUnifiedPage({
  title,
  subtitle,
  role,
  activeKey,
  menuItems,
  dashboardRoute,
  sectionTitle,
  sectionDescription,
  actions,
}: RoleUnifiedPageProps) {
  const theme = useAppTheme();

  return (
    <RoleContentPage
      title={title}
      subtitle={subtitle}
      activeKey={activeKey}
      menuItems={menuItems}
      dashboardRoute={dashboardRoute}
      role={role}
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
        <Text style={[styles.heading, { color: theme.colors.text }]}>
          {sectionTitle}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {sectionDescription}
        </Text>

        {actions.map((action, index) => (
          <GradientButton
            key={`${action.label}-${index}`}
            onPress={() => router.push(action.route as never)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{action.label}</Text>
          </GradientButton>
        ))}
      </View>
    </RoleContentPage>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
  },
});
