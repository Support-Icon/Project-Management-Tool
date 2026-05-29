# 🚀 ProjectFlow — Project Management Tool

A full-stack project management tool with a **Kanban board**, company-based multi-tenancy, admin-controlled user management, and auto-login via localStorage.

---

## ✨ Features

- **Kanban Board** — Drag-and-drop tasks across To Do / In Progress / Review / Done columns
- **Company-based Tenancy** — All data scoped by company name
- **Role System** — First user per company is Admin; only admins can create team members
- **Auto-Login** — Session persisted in Chrome localStorage using JWT
- **No Email Required** — Username + password only
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
   - `FRONTEND_URL` — your GitHub Pages URL (`https://YOUR_USERNAME.github.io/YOUR_REPO`)
7. Copy your Render URL (e.g. `https://project-management-api.onrender.com`)

### Frontend → GitHub Pages

1. Push your code to GitHub
2. Go to **Settings → Secrets and Variables → Actions**
3. Add the following secrets:
   - `VITE_API_URL` — your Render backend URL (e.g. `https://project-management-api.onrender.com`)
4. Go to **Settings → Pages** → Source: **gh-pages** branch
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
| `VITE_API_URL` | Your Render backend URL |

> **Note:** `MONGODB_URI` should be set directly in Render.com's environment variables panel — NOT as a GitHub Secret — to keep it secure.
