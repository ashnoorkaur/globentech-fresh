# Mobile Workflow Reference

## 1. User And Role Flow

1. Guest opens login/signup.
2. Auth/session is established through backend APIs.
3. User is routed to role-specific dashboard behavior:

- Customer
- Technician
- Administrator

## 2. Core Business Workflow (Order Lifecycle)

1. Customer submits order and sample details.
2. Admin reviews pending requests.
3. Admin approves/rejects and order state changes.
4. Approved orders move into queue/calendar scheduling.
5. Technician executes queue and calendar operations.
6. Completion updates order to results available/completed and can trigger notifications.

Lifecycle model used in mobile app:
submitted -> approved/rejected -> in_queue -> testing/preparation -> results_available/completed

## 3. Main Screens By Role

1. Customer:

- Dashboard, My Orders, Order History
- New Order
- Contact + settings/profile

2. Technician:

- Dashboard
- Tasks + Calendar + Equipment
- Samples + settings/profile

3. Admin:

- Dashboard
- Approvals, Users, Equipment, Reports
- Settings/profile

## 4. Data/Logic Layers

1. Auth/user roles
2. Orders and status history
3. Queue and scheduling
4. Equipment and utilization
5. Sample metadata
6. Notification/email layer
7. DB/session bootstrap

Auth and account APIs used in mobile:

- `/api/auth-login.php`
- `/api/auth-session.php`
- `/api/auth-logout.php`
- `/api/account-profile.php`
- `/api/account-update-profile.php`
- `/api/account-change-password.php`
- `/api/account-deactivate-self.php`
- `/api/account-admin-users.php`
- `/api/account-admin-change-role.php`
- `/api/account-admin-activate-user.php`
- `/api/account-admin-deactivate-user.php`

## 5. Demo Notes

1. Role dashboards include live refresh indicators and synced timestamps.
2. Customer/technician/admin pages use shared lifecycle labels and status progression.
3. UI is consistent across pages (single shell, single nav/menu behavior, role-aware routes).
4. Admin approval actions in mobile follow the same backend contract used by admin.php (`approve_order`, `reject_order`, `order_id`, `rejection_reason`) via `/api/admin-approve-order.php` and `/api/admin-reject-order.php`.
5. Customer order pages can use dedicated JSON endpoints when available:
   - `/api/customer-create-order.php`
   - `/api/customer-my-orders.php`
   - `/api/customer-order-history.php`
     If these are not deployed yet, screens gracefully fallback to existing approval queue feeds.
