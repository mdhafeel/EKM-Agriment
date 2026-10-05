# ── Stage 1: Build React frontend ────────────────────────────────────────
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
RUN npm install --ignore-scripts && npm approve-scripts esbuild || true && npm install

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production backend ───────────────────────────────────────────
FROM node:18-alpine AS production

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --ignore-scripts && npm approve-scripts better-sqlite3 || true && npm install

# Copy backend source
COPY backend/ ./

# Copy built frontend into backend's frontend-dist folder
COPY --from=frontend-builder /app/frontend/dist ./frontend-dist

# Create data directory for SQLite
RUN mkdir -p /var/data /app/uploads

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV FRONTEND_DIST=./frontend-dist
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "src/server.js"]
