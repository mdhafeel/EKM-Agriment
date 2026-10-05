# AutoShop Manager — EKM Agrimart

A complete offline/online Workshop & Billing Management System for automobile workshops and agri-equipment businesses.

## Features

- 📦 Spare Parts Inventory with Category & Subcategory
- 💰 Sales, Purchases, Expenses tracking
- 👥 Customer & Supplier management
- 💵 Investment tracking with Cash/UPI splits
- 📊 Dashboard with real-time analytics
- 📈 Excel export (ledger-style monthly sheets)
- 🔔 Low stock & payment overdue alerts
- 📱 Fully responsive — works on mobile
- 🔒 Role-based login (Admin / Staff)

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)

## Deploy on Render

See [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) for full instructions.

**Build Command:**
```
npm install --prefix backend && npm install --prefix frontend && npm run build --prefix frontend && cp -r frontend/dist backend/frontend-dist
```

**Start Command:**
```
node backend/src/server.js
```

**Environment Variables:**
- `NODE_ENV=production`
- `RENDER=true`
- `JWT_SECRET=<generate a random string>`

**Disk:** Mount `/var/data` (1 GB) for SQLite persistence.

## Local Development

```bash
# Backend
cd backend && npm install && npm start

# Frontend
cd frontend && npm install && npm run dev
```

Default login: `admin` / `admin123`
