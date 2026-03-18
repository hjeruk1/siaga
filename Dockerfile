# Build stage — compile frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY frontend/package.json ./frontend/
RUN npm install --prefix frontend
COPY frontend/ ./frontend/
RUN npm run build --prefix frontend

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install backend dependencies only
COPY backend/package.json ./backend/
RUN npm install --prefix backend --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy frontend build dari stage sebelumnya
COPY --from=builder /app/frontend/dist ./frontend/dist

# Folder untuk database (di-mount sebagai volume)
RUN mkdir -p /data

EXPOSE 3001
CMD ["node", "backend/server.js"]
