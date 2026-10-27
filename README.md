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
| Deploy (BE) | AWS Lambda (ECR container image) |

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

### Backend → AWS Lambda (ECR)

Push to `main` (or run **Actions → Deploy backend to AWS (ECR → Lambda)**). The workflow builds a container image, pushes it to ECR, and updates the `projectflow-backend` Lambda. The function URL prints `hello`.

**One-time AWS setup**

1. IAM user for GitHub Actions with ECR, Lambda, `iam:GetRole`, and `kms:DescribeKey` on `alias/aws/lambda`. Put the keys in GitHub secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
2. IAM role **`projectflow-backend-lambda-role`** — the backend deploy creates this if it is missing. To create it by hand: IAM → Roles → Create role → AWS service → Lambda → attach **AWSLambdaBasicExecutionRole** → role name `projectflow-backend-lambda-role`. The GitHub IAM user needs `iam:CreateRole`, `iam:AttachRolePolicy`, `iam:GetRole`, and `iam:PassRole`.
3. MongoDB Atlas → **Network Access** → allow `0.0.0.0/0` (Lambda IPs are not static).

**GitHub secrets**

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM user for deploy |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Strong random secret |
| `ENCRYPTION_KEY` | Stable 64-character hex key |
| `CRON_SECRET` | Same value used by the digest/report workflows |
| `FRONTEND_URL` | Frontend origin only, e.g. `https://projectflow.supporticon.com` |
| `ALLOWED_ORIGINS` | Optional comma-separated extra origins |
| `CUSTOM_DOMAIN` | Optional; used as `https://…` if `FRONTEND_URL` is unset |

After deploy, the job summary prints the Lambda URL. Open it in a browser — you should see **hello**. Then set `VITE_API_URL` and `BACKEND_URL` to that URL (no trailing slash) and redeploy the frontend.

**CORS:** Origin must match exactly. Set `FRONTEND_URL` or `ALLOWED_ORIGINS` to the live frontend origin (`https://support-icon.github.io` without `/Project-Management-Tool/`).

### Frontend → GitHub Pages

1. Push your code to GitHub
2. Go to **Settings → Secrets and Variables → Actions**
3. Add the following secrets:
   - `VITE_API_URL` — Lambda function URL from the backend deploy (e.g. `https://xxxx.lambda-url.us-east-1.on.aws`)
   - `BACKEND_URL` — same Lambda URL (used by daily digest / report crons)
   - `CRON_SECRET` — exactly the same value configured on Lambda
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
│       ├── deploy.yml              # Frontend → GitHub Pages
│       └── deploy-backend.yml      # Backend → ECR → Lambda
├── scripts/                        # Lambda adapter, function URL, ECR cleanup
├── backend/
│   ├── config/db.js            # MongoDB connection
│   ├── middleware/auth.js       # JWT middleware
│   ├── models/                  # Mongoose models
│   ├── routes/                  # Express routes
│   ├── server.js               # Express entry point
│   ├── Dockerfile              # Lambda container image
│   └── .env.example
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
| `VITE_API_URL` | Lambda function URL (no trailing slash), e.g. `https://xxxx.lambda-url.us-east-1.on.aws` |
| `BACKEND_URL` | Same Lambda URL (daily digest / weekly report crons) |
| `CRON_SECRET` | Same long random secret configured as `CRON_SECRET` on Lambda |
| `MONGODB_URI` | MongoDB Atlas URI (used by the backend Lambda deploy) |

## Gmail and Daily Reminders

1. Enable 2-Step Verification on the Gmail sender account.
2. Create a 16-character Gmail App Password.
3. Log in as admin → **Settings**.
4. Enter the Gmail address, App Password, daily time, and company timezone.
5. Save and use **Send test**.

GitHub Actions checks for due **morning digests** and **evening manager reports** hourly.
A company configured for 19:30 IST receives the person-wise report on the first hourly run
at or after 7:30 PM. Admins can change that time under **Settings → Evening daily report**.

> **Note:** `MONGODB_URI` is a GitHub Actions secret. The backend deploy copies it onto the Lambda function environment — it is not baked into the Docker image.
