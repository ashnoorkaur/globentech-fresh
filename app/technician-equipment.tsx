import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";

export default function TechnicianEquipmentPage() {
  return (
    <RoleContentPage
      title="Equipment"
      subtitle="Update equipment progress and maintenance details."
      activeKey="equipment"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <Text>Equipment updates and logs will appear here.</Text>
    </RoleContentPage>
  );
}
