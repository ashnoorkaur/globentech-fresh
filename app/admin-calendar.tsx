import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";

export default function AdminCalendarPage() {
  return (
    <RoleContentPage
      title="Calendar"
      subtitle="Manage schedules and operational timelines for the lab."
      activeKey="calendar"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <Text>Calendar planning tools will appear here.</Text>
    </RoleContentPage>
  );
}
