# Backend Connectivity Troubleshooting Guide

> **For your teacher demonstration**: Use this guide to diagnose and fix backend issues proving the system's reliability.

## Quick Diagnosis

Run the diagnostic tool to identify issues:

```bash
npm run test:backend
node scripts/diagnose-backend.mjs
```

---

## Common Issues & Solutions

### Issue 1: "Request Timed Out" on Order Creation

**Symptoms:**

- Order form hangs for 12 seconds then shows "Request timed out"
- Happens when clicking "Submit Order"
- Other pages work fine

**Root Cause:**
The PHP backend script (`/api/customer-create-order.php`) is hanging during execution—likely in the authentication check or before it returns a response.

**Fix Steps:**

1. **Check if `session_start()` is present** in `/api/customer-create-order.php`:

   ```php
   <?php
   // THIS MUST be at the TOP of the file
   session_start();
   error_reporting(E_ALL);
   ini_set('display_errors', 1);

   if (!isset($_SESSION['user_id'])) {
       http_response_code(401);
       die(json_encode(['error' => 'Unauthorized']));
   }
   // ... rest of code
   ?>
   ```

2. **Add error logging** to track where it's hanging:

   ```php
   error_log("Order creation started");
   error_log("User ID: " . $_SESSION['user_id']);
   error_log("About to query database");
   // Your database query here
   error_log("Database query complete");
   ```

3. **Check PHP error logs**:
   - XAMPP: `C:\xampp\apache\logs\error.log`
   - WAMP: `C:\wamp\logs\apache_error.log`
   - Linux: `/var/log/apache2/error.log`

4. **Add timeout handling** to database connections:

   ```php
   $conn = new mysqli($servername, $username, $password, $dbname);
   mysqli_set_charset($conn, "utf8");
   $conn->options(MYSQLI_OPT_CONNECT_TIMEOUT, 5); // 5 second timeout
   ```

5. **Common hanging points:**
   - Missing environment variables for database connection
   - SELECT query on large table without index
   - JOIN query without proper indexes
   - Circular record loops

---

### Issue 2: "Unauthorized" When Submitting Orders

**Symptoms:**

- Test script shows HTTP 401
- In app, times out instead of showing 401

**Root Cause:**
Session is not being established or maintained between login and API calls.

**Fix Steps:**

1. **Verify PHP form login sets session correctly** in `login.php`:

   ```php
   session_start();

   // Verify credentials
   if ($email === $dbEmail && password_verify($password, $dbHash)) {
       $_SESSION['user_id'] = $user_id;
       $_SESSION['role'] = $role;
       $_SESSION['email'] = $email;
       header("Location: dashboard.php");
       exit;
   }
   ```

2. **Ensure session persistence** in PHP config (php.ini):

   ```ini
   session.save_path = "/tmp"
   session.use_cookies = On
   session.cookie_httponly = On
   session.cookie_samesite = "Lax"
   ```

3. **Verify session cookie is being sent:**
   - Open browser DevTools > Network tab
   - Look for `Set-Cookie` header in login response
   - Check subsequent requests have `Cookie` header with session ID

4. **Test session directly** with curl:

   ```bash
   # Get session cookie during login
   curl -c cookies.txt -d "email=admin@globentech.com&password=test123" \
     http://localhost/Capstone-project/login.php

   # Use cookie in order request
   curl -b cookies.txt -X POST \
     http://localhost/Capstone-project/api/customer-create-order.php \
     -d '{"sample_type":"ore"}'
   ```

---

### Issue 3: Contact Messages Not Reaching Admins

**Symptoms:**

- Contact form says "Message Sent"
- Admins don't see the message
- No admin notifications appear

**Fix Steps:**

1. **Verify contact form endpoint exists** at `/api/contact-submit.php`:

   ```php
   <?php
   session_start();

   $input = json_decode(file_get_contents('php://input'), true);

   // Log receipt
   error_log("Contact received: " . $input['subject']);

   // Save to database
   $stmt = $conn->prepare("INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)");
   $stmt->bind_param("sss", $input['name'], $input['email'], $input['message']);
   if ($stmt->execute()) {
       http_response_code(200);
       echo json_encode(['success' => true, 'ticket_number' => $conn->insert_id]);
   } else {
       http_response_code(500);
       echo json_encode(['error' => 'Database insert failed']);
   }
   ?>
   ```

2. **Add admin notification trigger** after saving contact:

   ```php
   // After successful insert, notify admins
   $adminEmails = $conn->query("SELECT email FROM users WHERE role='administrator'");
   while ($admin = $adminEmails->fetch_assoc()) {
       mail($admin['email'],
            "New Support Request: " . $input['subject'],
            "From: {$input['name']}\nMessage: {$input['message']}");
   }
   ```

3. **Verify admin queue endpoint** at `/api/admin-order-queue.php`:

   ```php
   <?php
   session_start();

   // Check user is admin
   if ($_SESSION['role'] !== 'administrator') {
       http_response_code(403);
       die(json_encode(['error' => 'Not authorized']));
   }

   // Return pending orders
   $result = $conn->query("SELECT * FROM orders WHERE status='pending'");
   $orders = $result->fetch_all(MYSQLI_ASSOC);
   echo json_encode(['data' => $orders, 'success' => true]);
   ?>
   ```

4. **Check database tables exist**:

   ```sql
   -- Verify these tables exist:
   SHOW TABLES LIKE 'orders';
   SHOW TABLES LIKE 'contacts';
   SHOW TABLES LIKE 'users';

   -- Check contacts table has columns:
   DESCRIBE contacts;
   -- Should have: id, name, email, subject, message, created_at
   ```

---

## Testing Endpoints Directly

### Test Create Order Endpoint

```bash
# Install curl if needed
# Windows: https://curl.se/windows/

# 1. First, login to get session
curl -c cookies.txt \
  -d "login=1&email=customer@globentech.com&password=test123" \
  http://localhost/Capstone-project/login.php

# 2. Then create order with session cookie
curl -b cookies.txt -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "priority": "standard",
    "sample_type": "ore",
    "compound_name": "Iron Oxide",
    "quantity": 100,
    "unit": "g",
    "sample_count": 1
  }' \
  http://localhost/Capstone-project/api/customer-create-order.php
```

### Test Contact Endpoint

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "Test",
    "message": "This is a test message"
  }' \
  http://localhost/Capstone-project/api/contact-submit.php
```

---

## Admin Queue Implementation

To show orders in the admin dashboard, implement `/api/admin-order-queue.php`:

```php
<?php
session_start();
header('Content-Type: application/json');

// Verify admin role
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'administrator') {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Get pending orders
$query = "SELECT o.*, u.full_name as customer_name
          FROM orders o
          LEFT JOIN users u ON o.user_id = u.id
          WHERE o.status = 'pending'
          ORDER BY o.created_at DESC
          LIMIT 50";

$result = $conn->query($query);
$orders = $result->fetch_all(MYSQLI_ASSOC);

// Return JSON
http_response_code(200);
echo json_encode([
    'success' => true,
    'data' => $orders,
    'count' => count($orders)
]);
?>
```

Then in admin-dashboard, fetch and display:

```typescript
async function fetchOrderQueue() {
  const response = await apiRequest("/api/admin-order-queue.php");
  return response.data;
}
```

---

## Verification Checklist for Your Demo

Use this checklist to prove everything works:

- [ ] **Backend Server Running**
  - [ ] XAMPP/WAMP is started
  - [ ] Apache is running
  - [ ] MySQL/Database is running
  - [ ] Test: `curl http://localhost/Capstone-project/` returns HTML

- [ ] **Authentication Works**
  - [ ] Login with test account succeeds
  - [ ] Session cookie is set
  - [ ] Session persists across pages
  - [ ] Test: `node scripts/seed-test-accounts.mjs` succeeds

- [ ] **Order Creation**
  - [ ] Customer can submit order without timeout
  - [ ] Order appears in database
  - [ ] Admin sees order in queue
  - [ ] Test: `npm run test:backend` shows all order endpoints pass

- [ ] **Contact Messages**
  - [ ] Customer can send support message
  - [ ] Message is saved to database
  - [ ] Admin is notified
  - [ ] Admin can see message in contact list
  - [ ] Test: Submit message, check MySQL: `SELECT * FROM contacts;`

- [ ] **Admin Notifications**
  - [ ] New order triggers admin alert
  - [ ] New contact message triggers notification
  - [ ] Admin dashboard shows pending queue
  - [ ] Test: Create order and refresh admin dashboard

---

## Quick Fix Script

Create `fix-backend.sh` to auto-check and report issues:

```bash
#!/bin/bash
echo "🏥 Backend Health Check"
echo "======================="
echo ""
echo "1. Checking server reachability..."
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost/Capstone-project/

echo ""
echo "2. Checking login endpoint..."
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost/Capstone-project/login.php

echo ""
echo "3. Checking database connection..."
# Add your DB health check here

echo ""
echo "✓ Quick health check complete"
```

Run: `chmod +x fix-backend.sh && ./fix-backend.sh`

---

## Help Resources

- **PHP Debugging**: https://www.php.net/manual/en/function.error-log.php
- **Session Management**: https://www.php.net/manual/en/book.session.php
- **MySQL Debugging**: Run `SHOW PROCESSLIST;` to see hanging queries
- **XAMPP Logs**: `C:\xampp\apache\logs\error.log`

**Got stuck?** Run:

```bash
node scripts/diagnose-backend.mjs
```

This will generate a `diagnostics-*.json` file with detailed findings.

---

## Proving It Works to Your Teacher

1. **Demo 1 - Connectivity Check**

   ```bash
   npm run test:backend
   # Shows: ✓ 11/11 tests passing
   ```

2. **Demo 2 - Create Order**
   - Log in as customer
   - Fill order form
   - Submit
   - Show it appears in admin queue

3. **Demo 3 - Contact Messages**
   - Submit support message
   - Check database: `SELECT * FROM contacts;`
   - Show notification reached admin

4. **Demo 4 - Diagnostics**
   ```bash
   node scripts/diagnose-backend.mjs
   # Shows all endpoints responding
   ```

This proves the backend is working properly! 🎉
