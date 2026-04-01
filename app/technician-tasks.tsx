import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";

export default function TechnicianTasksPage() {
  return (
    <RoleContentPage
      title="Assigned Tasks"
      subtitle="Track and complete active technician tasks."
      activeKey="tasks"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <Text>Assigned task list and status actions will appear here.</Text>
    </RoleContentPage>
  );
}
