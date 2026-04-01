import { Text } from "react-native";
import { RoleContentPage } from "../components/role-content-page";
import { customerMenu } from "../constants/role-menus";

export default function CustomerContactPage() {
  return (
    <RoleContentPage
      title="Contact Us"
      subtitle="Get support from GlobenTech for account, order, or report-related help."
      activeKey="contact-us"
      menuItems={customerMenu}
      dashboardRoute="/customer-dashboard"
    >
      <Text>Support channels and contact workflow will appear here.</Text>
    </RoleContentPage>
  );
}
