import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";

export default function CustomerMyOrdersPage() {
  return (
    <RoleContentPage
      title="My Orders"
      subtitle="Track your active laboratory submissions and request status updates."
      activeKey="my-orders"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <Text>Orders list and status timeline will appear here.</Text>
    </RoleContentPage>
  );
}
