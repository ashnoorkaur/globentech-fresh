import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";

export default function TechnicianCalendarPage() {
  return (
    <RoleContentPage
      title="Calendar"
      subtitle="Review schedules and upcoming technician assignments."
      activeKey="calendar"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <Text>Technician calendar and planning view will appear here.</Text>
    </RoleContentPage>
  );
}
