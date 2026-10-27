# 🚀 ProjectFlow — Project Management Tool

A full-stack project management tool with a **Kanban board**, company-based multi-tenancy, admin-controlled user management, and auto-login via localStorage.

---

## ✨ Features

- **Kanban Board** — Drag-and-drop tasks across To Do / In Progress / Review / Done columns
- **Task duration (IST)** — Assign work as “2 hours” or “1 day”; deadline is calculated in Indian time
- **In-app notifications** — Sound + desktop alert when a task is assigned
- **Company chat + DMs** — Message everyone in the company or a person directly, including document attachments
- **Roles** — Admin creates Managers and Team Leads; managers see all people, team leads see their team
- **Evening daily report** — Configurable (default 7:30 PM IST): managers get every person, team leads get their members
- **Daily Task Updates** — Assignees record progress, percentage, blockers, and next steps until completion
- **Analytics charts** — Trend lines, status mix, and per-person compliance
- **Email notifications** — Assignment alerts and daily reminder emails
- **Company-based Tenancy** — All data scoped by company name
- **Auto-Login** — Session persisted in Chrome localStorage using JWT
- **Beautiful UI** — Modern glassmorphism design with Tailwind CSS

---

## 🏗️ Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Backend  | Node.js + Express.js |
| Database | MongoDB Atlas |
| Auth     | JWT (stored in localStorage) |
| Drag & Drop | @hello-pangea/dnd |
| Deploy (FE) | GitHub Pages |
| Deploy (BE) | Render.com |

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd project_management_tool

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/projectflow
JWT_SECRET=your-super-secret-key-change-this
PORT=5000
FRONTEND_URL=http://localhost:5173
ENCRYPTION_KEY=64-character-random-hex-value
CRON_SECRET=a-long-random-secret
```

### 3. Run Locally

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Frontend: http://localhost:5173  
Backend API: http://localhost:5000

---

## ☁️ Deployment

### Backend → Render.com

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Set **Root Directory** to `backend`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Add Environment Variables:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — a strong random secret
   - `FRONTEND_URL` — **origin only, no path**. For a custom domain use `https://your.domain.com`. For github.io use `https://support-icon.github.io` (NOT `/Project-Management-Tool/`). Multiple origins: comma-separated in `ALLOWED_ORIGINS`.
   - `ENCRYPTION_KEY` — stable 64-character hex key used to encrypt Gmail App Passwords
   - `CRON_SECRET` — long random value; use the same value in GitHub Actions
7. Copy your Render URL (e.g. `https://project-management-tool-c6f9.onrender.com`)

**MongoDB Atlas (required for Render):**
1. Atlas → **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`)
2. Atlas → **Database Access** → user with read/write on your database
3. If the password has special characters, URL-encode it in `MONGODB_URI`

**CORS troubleshooting:** Origin must match exactly (custom domain ≠ `*.github.io`). Set `FRONTEND_URL` or `ALLOWED_ORIGINS` on Render to your live frontend origin.

### Frontend → GitHub Pages

1. Push your code to GitHub
2. Go to **Settings → Secrets and Variables → Actions**
3. Add the following secrets:
   - `VITE_API_URL` — your Render backend URL (e.g. `https://project-management-api.onrender.com`)
   - `CRON_SECRET` — exactly the same value configured on Render
   - `CUSTOM_DOMAIN` (optional) — e.g. `app.yourdomain.com` so deploys keep the Pages custom domain
   - Do **not** set `VITE_BASE_URL` when using a custom domain (build uses `/`). Only set `VITE_BASE_URL=/Project-Management-Tool/` if you use the github.io project URL without a custom domain.
4. Go to **Settings → Pages** → Source: **gh-pages** branch → set Custom domain
5. Push to `main` branch — GitHub Actions will auto-deploy

Your app will be live at: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

---

## 🔐 First-Time Setup

1. Open the app → click **Get Started**
2. Enter your **Company Name**, **Username**, and **Password**
3. You'll automatically become the **Admin**
4. Go to **Team Members** to add more users
5. Create your first project from the Dashboard

---

## 📁 Project Structure

```
project_management_tool/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Auto-deploy to GitHub Pages
├── backend/
│   ├── config/db.js            # MongoDB connection
│   ├── middleware/auth.js       # JWT middleware
│   ├── models/                  # Mongoose models
│   ├── routes/                  # Express routes
│   ├── server.js               # Express entry point
│   ├── .env.example
│   └── render.yaml             # Render.com config
├── frontend/
│   ├── src/
│   │   ├── api/axios.js         # Axios with auth headers
│   │   ├── context/AuthContext  # Auto-login logic
│   │   ├── pages/               # Login, Dashboard, Kanban, Users
│   │   └── components/          # Layout, TaskCard, Modals
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## 🔑 GitHub Secrets Required

| Secret | Value |
|--------|-------|
| `VITE_API_URL` | Your Render backend URL (no trailing slash), e.g. `https://project-management-tool-c6f9.onrender.com` |
| `CRON_SECRET` | Same long random secret configured as `CRON_SECRET` on Render |

## Gmail and Daily Reminders

1. Enable 2-Step Verification on the Gmail sender account.
2. Create a 16-character Gmail App Password.
3. Log in as admin → **Settings**.
4. Enter the Gmail address, App Password, daily time, and company timezone.
5. Save and use **Send test**.

GitHub Actions checks for due **morning digests** and **evening manager reports** hourly.
A company configured for 19:30 IST receives the person-wise report on the first hourly run
at or after 7:30 PM. Admins can change that time under **Settings → Evening daily report**.

> **Note:** `MONGODB_URI` should be set directly in Render.com's environment variables panel — NOT as a GitHub Secret — to keep it secure.
