import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";

export default function AdminReportsPage() {
  return (
    <RoleContentPage
      title="Reports"
      subtitle="View analytics and reporting dashboards for operations."
      activeKey="reports"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <Text>Report charts and analytics will appear here.</Text>
    </RoleContentPage>
  );
}
