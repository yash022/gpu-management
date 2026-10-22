# GPU Resource Reservation & Management System
**Manipal University Jaipur (MUJ) — Software Engineering Lab Project**
*Course Code: CSE3132*

---

## 📌 Project Overview
A web-based platform designed to manage and allocate high-performance computing GPU resources fairly among students, faculty, and researchers.

Developed according to IEEE 830-1998 Software Requirements Specification (SRS) standards, implementing:
1. **User Authentication & Access Control** (Role-based: Student, Faculty, Researcher, Admin)
2. **GPU Availability Management** (Real-time hardware status, VRAM, and lab location tracking)
3. **Reservation & Booking Management** (Time slot allocation with automated overlap conflict prevention)
4. **Queue & Waitlist Management** (Automated queueing when slots are occupied; notifications upon cancellation)
5. **Notification System** (Real-time alerts for booking confirmation, cancellations, and waitlist progress)
6. **Usage Monitoring & Analytics** (Hardware utilization metrics, role distribution)
7. **Administration & Inventory Management** (CRUD GPU catalog, user role management, system monitoring)

---

## 🛠️ Technology Stack
- **Frontend**: React 19, Vite, React Router v7, Axios, Modern CSS3 Design System
- **Backend**: Node.js, Express, HttpOnly cookie sessions, Bcrypt.js, CORS, Dotenv
- **Database**: PostgreSQL (with automatic zero-dependency in-memory fallback via `pg-mem` for offline lab evaluation)

---

## 🚀 Quick Start Guide

### 1. Backend Setup
```bash
cd backend
npm install
npm start
```
The backend server runs on `http://localhost:5000`.

> **Note:** The backend automatically connects to a local/remote PostgreSQL database if configured in `backend/.env`. If PostgreSQL is not currently running, it automatically initializes an in-memory database with pre-seeded GPU hardware and admin credentials so the entire system works instantly.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Access the client application in your browser at:
`http://localhost:5173`

---

## 🔑 Default Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Administrator** | `admin@muj.manipal.edu` | `admin123` |
| **Student / Faculty** | Self-register on the `/register` page | Minimum 8 characters (maximum 72 UTF-8 bytes) |

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Create a student, faculty, or researcher account
- `POST /api/auth/login` - Authenticate and create a server-side session
- `GET /api/auth/me` - Retrieve current user, CSRF token, and expiry
- `POST /api/auth/logout` - Revoke current session and clear cookie
- `POST /api/auth/logout-all` - Revoke all sessions for the current account

### GPU Hardware (`/api/gpus`)
- `GET /api/gpus` - Fetch all registered GPUs
- `GET /api/gpus/:id` - Fetch single GPU specifications
- `POST /api/gpus` - Add GPU (Admin only)
- `PUT /api/gpus/:id` - Update GPU details/status (Admin only)
- `DELETE /api/gpus/:id` - Remove GPU (Admin only)

### Reservations (`/api/reservations`)
- `GET /api/reservations` - User's active and past reservations
- `GET /api/reservations/all` - Complete reservation history (Admin only)
- `POST /api/reservations` - Book a GPU slot (with conflict detection)
- `PUT /api/reservations/:id/cancel` - Cancel reservation & auto-notify queued users

### Waitlist Queue (`/api/queue`)
- `GET /api/queue` - User's waitlist positions
- `GET /api/queue/gpu/:gpuId` - Waitlist length for a GPU
- `POST /api/queue` - Join waitlist for a busy GPU
- `DELETE /api/queue/:id` - Leave waitlist

### Notifications (`/api/notifications`)
- `GET /api/notifications` - Fetch user's notification feed
- `PUT /api/notifications/:id/read` - Mark single notification as read
- `PUT /api/notifications/read-all` - Mark all notifications as read

### Admin & Analytics (`/api/admin`)
- `GET /api/admin/stats` - System overview metrics
- `GET /api/admin/users` - View all registered accounts
- `PUT /api/admin/users/:id/role` - Update user role
- `DELETE /api/admin/users/:id` - Delete user account
- `GET /api/admin/reports` - Hardware utilization and booking analytics

## UI and security update

GPUspace provides a responsive campus workspace, searchable/filterable GPU catalog,
VRAM sorting, loading and retry states, and consistent booking and account screens.
Booking dates and times are interpreted in **India Standard Time**.

Self-registration cannot create administrators. Sessions use random opaque HttpOnly
cookies and PostgreSQL records containing only the hash of the cookie credential.
Logout revokes the session on the server, and "Sign out on all devices" revokes all
sessions for that account. Protected requests check the current database role.
CSRF tokens, origin checks, and shared database-backed authentication limits protect
mutations. No bearer credentials are kept in browser storage.

Default sessions expire after 8 hours or 30 minutes without activity. The optional
"Keep me signed in" choice lasts up to 30 days with a 7-day idle limit. Browser
session restoration behavior varies; server-side expiry always applies. Notification
polling and session checks do not extend idle expiry. Closing a tab is not logout.

The in-memory fallback and demo users are for local evaluation only.
`NODE_ENV=production` requires a working `DATABASE_URL`, migrated schema, and an
explicit HTTPS `FRONTEND_ORIGIN`. Production cookies use the `__Host-` prefix,
`Secure`, `HttpOnly`, and `SameSite=Lax`. Old JWT sessions are intentionally invalid
following this migration. Provision production administrators separately.

Serve the frontend and `/api` under the same HTTPS origin. Development uses Vite's
proxy. A same-site API subdomain can use `VITE_API_URL` plus an explicit allowed
frontend origin; cross-site third-party-cookie deployments are not supported.
See [DEPLOYMENT.md](DEPLOYMENT.md) for migration, connection limits, and rollout.

## Repeatable checks

Backend (Node 22 or newer):
```bash
cd backend
npm ci
npm test
npm audit
```

Frontend:
```bash
cd frontend
npm ci
npx playwright install chromium
npm test
npm run build
npm run lint
npm audit
```

Browser tests start isolated servers on ports 5001 and 5174 and use disposable
in-memory data. They cover desktop and mobile viewports. To use an installed
Chrome browser instead, set `PLAYWRIGHT_CHANNEL=chrome`. Screenshots and failure
traces are written to `frontend/test-results/` (ignored by Git).

See [TESTING.md](TESTING.md) for coverage and remaining validation limits.
