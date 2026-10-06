# ── Stage 1: Build React frontend ────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install — force install react-is explicitly for recharts compatibility
RUN npm install --legacy-peer-deps && npm install react-is --legacy-peer-deps

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production backend ───────────────────────────────────────────
FROM node:22-alpine AS production

# Install build tools needed for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies (builds better-sqlite3 from source)
RUN npm install --legacy-peer-deps

# Copy backend source code
COPY backend/src ./src

# Copy built React frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend-dist

# Create persistent data directories
RUN mkdir -p /var/data /app/uploads

# Environment defaults (override in Render dashboard)
ENV NODE_ENV=production
ENV PORT=3001
ENV FRONTEND_DIST=./frontend-dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:'+process.env.PORT+'/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Start server
CMD ["node", "src/server.js"]
