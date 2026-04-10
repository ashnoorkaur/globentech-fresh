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
  login: "/login.php",
  signup: "/register.php",
  about: "/about.php",
  customerDashboard: "/dashboard.php",
  technicianDashboard: "/dashboard.php",
  adminDashboard: "/admin.php",
  accountSettings: "/account-settings.php",
  createOrder: "/create-order.php",
  myOrders: "/my-orders.php",
  orderHistory: "/order-history.php",
  contact: "/contact.php",
  adminApprovals: "/admin.php?tab=approvals",
  adminEquipment: "/admin.php?tab=equipment",
  adminReports: "/admin.php?tab=reports",
  adminUsers: "/admin.php?tab=users",
  adminCalendar: "/calendar.php",
  technicianCalendar: "/calendar.php",
  technicianEquipment: "/dashboard.php",
  technicianSamples: "/dashboard.php",
  technicianTasks: "/dashboard.php",
  technicianOrderHistory: "/order-history.php",
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
