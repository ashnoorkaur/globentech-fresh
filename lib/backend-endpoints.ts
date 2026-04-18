import Constants from "expo-constants";

type EndpointConfig = {
  calendarData?: string;
  calendarReschedule?: string;
  calendarReorder?: string;
  orderComplete?: string;
  orderStartProcessing?: string;
  getCalendarEvents?: string;
  equipmentAdd?: string;
  equipmentUpdate?: string;
  equipmentList?: string;
  contactSend?: string;
  contactNotificationCreate?: string;
  adminContactNotifications?: string;
  adminPendingOrders?: string;
  adminApproveOrder?: string;
  adminRejectOrder?: string;
  adminUsersList?: string;
  adminChangeRole?: string;
  reportsGenerate?: string;
  customerCreateOrder?: string;
  customerMyOrders?: string;
  customerOrderHistory?: string;
  authLogin?: string;
  authRegister?: string;
  authLogout?: string;
  authSession?: string;
  accountProfile?: string;
  accountUpdateProfile?: string;
  accountChangePassword?: string;
  accountDeactivateSelf?: string;
  accountAdminUsers?: string;
  accountAdminChangeRole?: string;
  accountAdminActivateUser?: string;
  accountAdminDeactivateUser?: string;
  orderAssignTechnician?: string;
  orderAssignEquipment?: string;
};

type ExpoExtraConfig = {
  apiEndpoints?: EndpointConfig;
};

const defaultEndpoints: Required<EndpointConfig> = {
  calendarData: "/api.php?endpoint=calendar-data",
  calendarReschedule: "/api.php?endpoint=calendar-reschedule",
  calendarReorder: "/api.php?endpoint=calendar-reorder",
  orderComplete: "/api.php?endpoint=order-complete",
  orderStartProcessing: "/api.php?endpoint=order-start-processing",
  getCalendarEvents: "/api.php?endpoint=calendar-data",
  equipmentAdd: "/api.php?endpoint=equipment-add",
  equipmentUpdate: "/api/equipment-update.php",
  equipmentList: "/api/equipment-list.php",
  contactSend: "/api/contact-send.php",
  contactNotificationCreate: "/api/contact-notification-create.php",
  adminContactNotifications: "/api/admin-contact-notifications.php",
  adminPendingOrders: "/api/admin-pending-orders.php",
  adminApproveOrder: "/api/admin-approve-order.php",
  adminRejectOrder: "/api/admin-reject-order.php",
  adminUsersList: "/api/admin-users.php",
  adminChangeRole: "/api/admin-change-role.php",
  reportsGenerate: "/api/reports-generate.php",
  customerCreateOrder: "/api/customer-create-order.php",
  customerMyOrders: "/api/customer-my-orders.php",
  customerOrderHistory: "/api/customer-order-history.php",
  authLogin: "/public/pages/api/login.php",
  authRegister: "/api/auth-register.php",
  authLogout: "/api/auth-logout.php",
  authSession: "/api/auth-session.php",
  accountProfile: "/api/account-profile.php",
  accountUpdateProfile: "/api/account-update-profile.php",
  accountChangePassword: "/api/account-change-password.php",
  accountDeactivateSelf: "/api/account-deactivate-self.php",
  accountAdminUsers: "/api/account-admin-users.php",
  accountAdminChangeRole: "/api/account-admin-change-role.php",
  accountAdminActivateUser: "/api/account-admin-activate-user.php",
  accountAdminDeactivateUser: "/api/account-admin-deactivate-user.php",
  orderAssignTechnician: "/api/order-assign-technician.php",
  orderAssignEquipment: "/api/order-assign-equipment.php",
};

const normalizePath = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const normalizeLiveCalendarEndpoint = (path: string) => {
  const normalized = normalizePath(path);

  switch (normalized) {
    case "/api/calendar-data.php":
    case "/get_calendar_events.php":
      return "/api.php?endpoint=calendar-data";
    case "/api/calendar-reschedule.php":
      return "/api.php?endpoint=calendar-reschedule";
    case "/api/calendar-reorder.php":
      return "/api.php?endpoint=calendar-reorder";
    case "/api/order-complete.php":
      return "/api.php?endpoint=order-complete";
    case "/api/order-start-processing.php":
      return "/api.php?endpoint=order-start-processing";
    default:
      return normalized;
  }
};

export const getApiEndpoints = () => {
  const extra = Constants.expoConfig?.extra as ExpoExtraConfig | undefined;
  const fromConfig = extra?.apiEndpoints ?? {};

  return {
    calendarData: normalizeLiveCalendarEndpoint(
      fromConfig.calendarData || defaultEndpoints.calendarData,
    ),
    calendarReschedule: normalizeLiveCalendarEndpoint(
      fromConfig.calendarReschedule || defaultEndpoints.calendarReschedule,
    ),
    calendarReorder: normalizeLiveCalendarEndpoint(
      fromConfig.calendarReorder || defaultEndpoints.calendarReorder,
    ),
    orderComplete: normalizeLiveCalendarEndpoint(
      fromConfig.orderComplete || defaultEndpoints.orderComplete,
    ),
    orderStartProcessing: normalizeLiveCalendarEndpoint(
      fromConfig.orderStartProcessing || defaultEndpoints.orderStartProcessing,
    ),
    getCalendarEvents: normalizeLiveCalendarEndpoint(
      fromConfig.getCalendarEvents || defaultEndpoints.getCalendarEvents,
    ),
    equipmentAdd: normalizePath(
      fromConfig.equipmentAdd || defaultEndpoints.equipmentAdd,
    ),
    equipmentUpdate: normalizePath(
      fromConfig.equipmentUpdate || defaultEndpoints.equipmentUpdate,
    ),
    equipmentList: normalizePath(
      fromConfig.equipmentList || defaultEndpoints.equipmentList,
    ),
    contactSend: normalizePath(
      fromConfig.contactSend || defaultEndpoints.contactSend,
    ),
    contactNotificationCreate: normalizePath(
      fromConfig.contactNotificationCreate ||
        defaultEndpoints.contactNotificationCreate,
    ),
    adminContactNotifications: normalizePath(
      fromConfig.adminContactNotifications ||
        defaultEndpoints.adminContactNotifications,
    ),
    adminPendingOrders: normalizePath(
      fromConfig.adminPendingOrders || defaultEndpoints.adminPendingOrders,
    ),
    adminApproveOrder: normalizePath(
      fromConfig.adminApproveOrder || defaultEndpoints.adminApproveOrder,
    ),
    adminRejectOrder: normalizePath(
      fromConfig.adminRejectOrder || defaultEndpoints.adminRejectOrder,
    ),
    adminUsersList: normalizePath(
      fromConfig.adminUsersList || defaultEndpoints.adminUsersList,
    ),
    adminChangeRole: normalizePath(
      fromConfig.adminChangeRole || defaultEndpoints.adminChangeRole,
    ),
    reportsGenerate: normalizePath(
      fromConfig.reportsGenerate || defaultEndpoints.reportsGenerate,
    ),
    customerCreateOrder: normalizePath(
      fromConfig.customerCreateOrder || defaultEndpoints.customerCreateOrder,
    ),
    customerMyOrders: normalizePath(
      fromConfig.customerMyOrders || defaultEndpoints.customerMyOrders,
    ),
    customerOrderHistory: normalizePath(
      fromConfig.customerOrderHistory || defaultEndpoints.customerOrderHistory,
    ),
    authLogin: normalizePath(
      fromConfig.authLogin || defaultEndpoints.authLogin,
    ),
    authRegister: normalizePath(
      fromConfig.authRegister || defaultEndpoints.authRegister,
    ),
    authLogout: normalizePath(
      fromConfig.authLogout || defaultEndpoints.authLogout,
    ),
    authSession: normalizePath(
      fromConfig.authSession || defaultEndpoints.authSession,
    ),
    accountProfile: normalizePath(
      fromConfig.accountProfile || defaultEndpoints.accountProfile,
    ),
    accountUpdateProfile: normalizePath(
      fromConfig.accountUpdateProfile || defaultEndpoints.accountUpdateProfile,
    ),
    accountChangePassword: normalizePath(
      fromConfig.accountChangePassword ||
        defaultEndpoints.accountChangePassword,
    ),
    accountDeactivateSelf: normalizePath(
      fromConfig.accountDeactivateSelf ||
        defaultEndpoints.accountDeactivateSelf,
    ),
    accountAdminUsers: normalizePath(
      fromConfig.accountAdminUsers || defaultEndpoints.accountAdminUsers,
    ),
    accountAdminChangeRole: normalizePath(
      fromConfig.accountAdminChangeRole ||
        defaultEndpoints.accountAdminChangeRole,
    ),
    accountAdminActivateUser: normalizePath(
      fromConfig.accountAdminActivateUser ||
        defaultEndpoints.accountAdminActivateUser,
    ),
    accountAdminDeactivateUser: normalizePath(
      fromConfig.accountAdminDeactivateUser ||
        defaultEndpoints.accountAdminDeactivateUser,
    ),
    orderAssignTechnician: normalizePath(
      fromConfig.orderAssignTechnician ||
        defaultEndpoints.orderAssignTechnician,
    ),
    orderAssignEquipment: normalizePath(
      fromConfig.orderAssignEquipment ||
        defaultEndpoints.orderAssignEquipment,
    ),
  };
};
