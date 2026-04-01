import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { adminMenu } from "../constants/role-menus";

export default function AdminOrderHistoryPage() {
  return (
    <RoleContentPage
      title="Order History"
      subtitle="Browse historical order records and report outcomes."
      activeKey="order-history"
      menuItems={adminMenu}
      dashboardRoute="/admin-dashboard"
    >
      <Text>Historical order records will appear here.</Text>
    </RoleContentPage>
  );
}
