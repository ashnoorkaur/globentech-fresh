import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { technicianMenu } from "../constants/role-menus";

export default function TechnicianSamplesPage() {
  return (
    <RoleContentPage
      title="Samples"
      subtitle="Manage sample intake, handling status, and updates."
      activeKey="samples"
      menuItems={technicianMenu}
      dashboardRoute="/technician-dashboard"
    >
      <Text>Sample tracking workflow will appear here.</Text>
    </RoleContentPage>
  );
}
