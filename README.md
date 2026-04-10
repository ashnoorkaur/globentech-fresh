# GlobenTech Mobile (Expo)

React Native + Expo mobile client for GlobenTech.

## Run locally

1. Install dependencies

```bash
npm install
```

2. Start Expo

```bash
npx expo start
```

## Connect to Laragon + PHP backend

This app supports your existing PHP/MySQL backend and can render your current PHP pages directly in mobile using a WebView bridge.

Base URL priority:

1. `EXPO_PUBLIC_API_BASE_URL` environment variable
2. `expo.extra.apiBaseUrl` in `app.json`
3. Fallback: `http://localhost/Capstone-project`

Set for current shell (PowerShell):

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://localhost/Capstone-project"
```

Important local-network notes:

- Android emulator cannot use `localhost` from host machine. Use `http://10.0.2.2/Capstone-project`.
- iOS simulator can use `localhost`.
- Physical devices must use your PC LAN IP, for example `http://192.168.1.25/Capstone-project`.

API endpoint paths are configurable in app.json under expo.extra.apiEndpoints:

```json
{
  "calendarData": "/api/calendar-data.php",
  "calendarReorder": "/api/calendar-reorder.php",
  "calendarReschedule": "/api/calendar-reschedule.php",
  "orderComplete": "/api/order-complete.php",
  "orderStartProcessing": "/api/order-start-processing.php",
  "getCalendarEvents": "/get_calendar_events.php",
  "equipmentAdd": "/api/equipment-add.php",
  "equipmentUpdate": "/api/equipment-update.php"
}
```

If your PHP files use different names (for example `get_calendar_queue.php`), only change the path values in `app.json`.

Web page route paths are configurable in app.json under expo.extra.webRoutes.
These routes are used by mobile screens that embed existing PHP pages.

## Mobile WebView Backend Bridge

Reusable bridge component:

- components/php-webview-page.tsx

Centralized route mapping:

- lib/web-routes.ts

Edit only app.json -> expo.extra.webRoutes to retarget any screen without changing mobile code.

## Backend-driven Screens

The following screens are connected to your same web backend through configured routes:

- app/login.tsx
- app/signup.tsx
- app/profile.tsx
- app/settings.tsx
- app/customer-dashboard.tsx
- app/customer-new-order.tsx
- app/customer-my-orders.tsx
- app/customer-order-history.tsx
- app/customer-contact.tsx
- app/chatbot.tsx
- app/admin-dashboard.tsx
- app/admin-approvals.tsx
- app/admin-calendar.tsx
- app/admin-equipment.tsx
- app/admin-order-history.tsx
- app/admin-reports.tsx
- app/admin-users.tsx
- app/technician-dashboard.tsx
- app/technician-calendar.tsx
- app/technician-equipment.tsx
- app/technician-samples.tsx
- app/technician-tasks.tsx
- app/(tabs)/create-order.tsx
- app/(tabs)/my-orders.tsx
- app/(tabs)/orders.tsx
- app/(tabs)/explore.tsx

## Notes

- Session cookies are enabled for WebView and API calls.
- If a specific role screen should point to a different PHP page, update only the matching key in app.json -> expo.extra.webRoutes.
