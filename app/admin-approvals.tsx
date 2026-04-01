import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";

export default function AdminApprovalsPage() {
  return (
    <RoleContentPage
      title="Approvals"
      subtitle="Review and approve incoming customer requests."
      activeKey="approvals"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <Text>Approval queue and actions will appear here.</Text>
    </RoleContentPage>
  );
}
