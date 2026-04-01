import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";

export default function AdminEquipmentPage() {
  return (
    <RoleContentPage
      title="Equipment"
      subtitle="Configure and monitor laboratory equipment resources."
      activeKey="equipment"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <Text>Equipment configuration and status tools will appear here.</Text>
    </RoleContentPage>
  );
}
