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
- **Backend**: Node.js, Express, JSON Web Tokens (JWT), Bcrypt.js, CORS, Dotenv
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
| **Student / Faculty** | Self-register on the `/register` page | Any (min 6 characters) |

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Create a student, faculty, or researcher account
- `POST /api/auth/login` - Authenticate and receive JWT token
- `GET /api/auth/me` - Retrieve current session user profile

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
