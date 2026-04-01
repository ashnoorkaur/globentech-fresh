import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";

export default function CustomerNewOrderPage() {
  return (
    <RoleContentPage
      title="New Order"
      subtitle="Create a new testing request by entering sample and project details."
      activeKey="new-order"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <Text>
        New order form fields and submission actions will appear here.
      </Text>
    </RoleContentPage>
  );
}
