import { Href } from "expo-router";

export type MenuItem = {
  key: string;
  label: string;
  route: Href;
};

export const guestMenu: MenuItem[] = [
  { key: "home", label: "Home", route: "/" },
  { key: "login", label: "Login", route: "/login" },
  { key: "signup", label: "Sign Up", route: "/signup" },
  { key: "about", label: "About", route: "/about" },
];

export const customerMenu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", route: "/customer-dashboard" },
  { key: "my-orders", label: "My Orders", route: "/customer-my-orders" },
  { key: "new-order", label: "New Order", route: "/customer-new-order" },
  { key: "contact-us", label: "Contact Us", route: "/customer-contact" },
  { key: "about", label: "About", route: "/about" },
];

export const adminMenu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", route: "/admin-dashboard" },
  { key: "approvals", label: "Approvals", route: "/admin-approvals" },
  {
    key: "order-history",
    label: "Orders & Assignments",
    route: "/admin-order-history",
  },
  { key: "users", label: "Manage Users", route: "/admin-users" },
  { key: "equipment", label: "Equipment", route: "/admin-equipment" },
  { key: "reports", label: "Reports", route: "/admin-reports" },
  { key: "about", label: "About", route: "/about" },
];

export const technicianMenu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", route: "/technician-dashboard" },
  { key: "tasks", label: "Assigned Tasks", route: "/technician-tasks" },
  { key: "calendar", label: "Calendar", route: "/technician-calendar" },
  { key: "contact-us", label: "Contact Us", route: "/technician-contact" },
  { key: "about", label: "About", route: "/about" },
];
