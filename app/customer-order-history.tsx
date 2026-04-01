import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";

export default function CustomerOrderHistoryPage() {
  return (
    <RoleContentPage
      title="Order History"
      subtitle="Review all completed orders and previous reports in one place."
      activeKey="order-history"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <Text>Completed order records and report history will appear here.</Text>
    </RoleContentPage>
  );
}
