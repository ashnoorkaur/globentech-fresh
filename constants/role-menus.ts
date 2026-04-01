import { Href } from "expo-router";

export type MenuItem = {
  key: string;
  label: string;
  route: Href;
};

export const customerMenu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", route: "/customer-dashboard" },
  { key: "my-orders", label: "My Orders", route: "/customer-my-orders" },
  {
    key: "order-history",
    label: "Order History",
    route: "/customer-order-history",
  },
  { key: "new-order", label: "New Order", route: "/customer-new-order" },
  { key: "contact-us", label: "Contact Us", route: "/customer-contact" },
];

export const adminMenu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", route: "/admin-dashboard" },
  { key: "approvals", label: "Approvals", route: "/admin-approvals" },
  { key: "calendar", label: "Calendar", route: "/admin-calendar" },
  {
    key: "order-history",
    label: "Order History",
    route: "/admin-order-history",
  },
  { key: "users", label: "Users", route: "/admin-users" },
  { key: "equipment", label: "Equipment", route: "/admin-equipment" },
  { key: "reports", label: "Reports", route: "/admin-reports" },
];

export const technicianMenu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", route: "/technician-dashboard" },
  { key: "tasks", label: "Assigned Tasks", route: "/technician-tasks" },
  { key: "equipment", label: "Equipment", route: "/technician-equipment" },
  { key: "samples", label: "Samples", route: "/technician-samples" },
  { key: "calendar", label: "Calendar", route: "/technician-calendar" },
];
