import Constants from "expo-constants";

type WebRoutes = {
  login: string;
  signup: string;
  about: string;
  customerDashboard: string;
  technicianDashboard: string;
  adminDashboard: string;
  accountSettings: string;
  createOrder: string;
  myOrders: string;
  orderHistory: string;
  contact: string;
  adminApprovals: string;
  adminEquipment: string;
  adminReports: string;
  adminUsers: string;
  adminCalendar: string;
  technicianCalendar: string;
  technicianEquipment: string;
  technicianSamples: string;
  technicianTasks: string;
  technicianOrderHistory: string;
  home: string;
};

type ExtraConfig = {
  webRoutes?: Partial<WebRoutes>;
};

const defaults: WebRoutes = {
  login: "/auth/login.php",
  signup: "/auth/register.php",
  about: "/index.php#about",
  customerDashboard: "/dashboard/index.php",
  technicianDashboard: "/dashboard/index.php",
  adminDashboard: "/admin/approvals.php",
  accountSettings: "/account/settings.php",
  createOrder: "/orders/create-order.php",
  myOrders: "/orders/my-orders.php",
  orderHistory: "/orders/order-history.php",
  contact: "/contact/index.php",
  adminApprovals: "/admin/approvals.php",
  adminEquipment: "/admin/equipment.php",
  adminReports: "/admin/reports.php",
  adminUsers: "/admin/users.php",
  adminCalendar: "/calendar/index.php",
  technicianCalendar: "/calendar/index.php",
  technicianEquipment: "/dashboard/index.php",
  technicianSamples: "/dashboard/index.php",
  technicianTasks: "/dashboard/index.php",
  technicianOrderHistory: "/orders/order-history.php",
  home: "/index.php",
};

const normalizePath = (value: string) =>
  value.startsWith("/") ? value : `/${value}`;

export const getWebRoutes = (): WebRoutes => {
  const extra = Constants.expoConfig?.extra as ExtraConfig | undefined;
  const configured = extra?.webRoutes ?? {};

  const output = { ...defaults, ...configured };

  return {
    login: normalizePath(output.login),
    signup: normalizePath(output.signup),
    about: normalizePath(output.about),
    customerDashboard: normalizePath(output.customerDashboard),
    technicianDashboard: normalizePath(output.technicianDashboard),
    adminDashboard: normalizePath(output.adminDashboard),
    accountSettings: normalizePath(output.accountSettings),
    createOrder: normalizePath(output.createOrder),
    myOrders: normalizePath(output.myOrders),
    orderHistory: normalizePath(output.orderHistory),
    contact: normalizePath(output.contact),
    adminApprovals: normalizePath(output.adminApprovals),
    adminEquipment: normalizePath(output.adminEquipment),
    adminReports: normalizePath(output.adminReports),
    adminUsers: normalizePath(output.adminUsers),
    adminCalendar: normalizePath(output.adminCalendar),
    technicianCalendar: normalizePath(output.technicianCalendar),
    technicianEquipment: normalizePath(output.technicianEquipment),
    technicianSamples: normalizePath(output.technicianSamples),
    technicianTasks: normalizePath(output.technicianTasks),
    technicianOrderHistory: normalizePath(output.technicianOrderHistory),
    home: normalizePath(output.home),
  };
};
