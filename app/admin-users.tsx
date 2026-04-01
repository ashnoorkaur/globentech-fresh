import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";

export default function AdminUsersPage() {
  return (
    <RoleContentPage
      title="Users"
      subtitle="Manage user roles, permissions, and account status."
      activeKey="users"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <Text>User administration tools will appear here.</Text>
    </RoleContentPage>
  );
}
