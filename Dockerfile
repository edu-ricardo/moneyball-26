# Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# Production Environment
FROM node:20-alpine
WORKDIR /app

# Copy compiled backend
COPY --from=backend-builder /app/server/dist ./server/dist
COPY --from=backend-builder /app/server/package*.json ./server/

# Copy compiled frontend
COPY --from=frontend-builder /app/client/dist ./client/dist

# Install production dependencies for backend
WORKDIR /app/server
RUN npm install --omit=dev

# Create uploads directory (for SQLite DB and uploads)
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads

# Expose the port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Run as non-root user
USER node

# Start the server
CMD ["npm", "start"]
