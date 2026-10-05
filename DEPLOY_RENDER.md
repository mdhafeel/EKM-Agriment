# Deploy to Render.com

## Quick Deploy (5 minutes)

### Step 1 — Push code to GitHub

```bash
# In the workshop-manager folder
git init
git add .
git commit -m "Initial commit — AutoShop Manager"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/autoshop-manager.git
git push -u origin main
```

### Step 2 — Create a Render account
Go to https://render.com and sign up for free.

### Step 3 — Deploy with render.yaml (one click)
1. In Render dashboard → **New** → **Blueprint**
2. Connect your GitHub repo
3. Render will read `render.yaml` and configure everything automatically
4. Click **Apply**

---

## Manual Deploy (if Blueprint doesn't work)

### Create a Web Service on Render:

| Setting | Value |
|---------|-------|
| **Runtime** | Node |
| **Root Directory** | `.` (leave blank) |
| **Build Command** | `npm install --prefix backend && npm install --prefix frontend && npm run build --prefix frontend && cp -r frontend/dist backend/frontend-dist` |
| **Start Command** | `npm start --prefix backend` |
| **Plan** | Free |

### Environment Variables (add these in Render dashboard):

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `RENDER` | `true` |
| `JWT_SECRET` | *(click Generate)* |
| `FRONTEND_DIST` | `/opt/render/project/src/backend/frontend-dist` |

### Add a Persistent Disk:
- **Mount Path:** `/var/data`
- **Size:** 1 GB (free tier)

This is where SQLite database and uploads are stored permanently.

---

## After Deploy

Your app will be live at: `https://autoshop-manager.onrender.com`

**Default login:**
- Username: `admin`
- Password: `admin123`

> ⚠️ Change your password immediately after first login!

---

## Important Notes

- **Free tier** spins down after 15 minutes of inactivity — first load may take ~30 seconds
- **SQLite** is stored on the persistent disk at `/var/data/workshop.db`
- **Upgrades** — pushing to GitHub automatically redeploys
- For production use, consider upgrading to Render's **Starter plan** ($7/month) for always-on service
