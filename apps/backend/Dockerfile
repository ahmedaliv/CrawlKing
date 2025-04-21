# Base image with Python and Node.js
FROM node:18

# Install Python and required packages
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Set working dir
WORKDIR /usr/src/app

# Copy package files & install deps
COPY package*.json ./
RUN npm install -g pnpm
RUN pnpm install

# Install Playwright deps
RUN pnpm exec playwright install-deps
RUN pnpm exec playwright install

# Copy all project files
COPY . .

# Run Python setup
RUN chmod +x ./jobs/setupPy.sh && ./jobs/setupPy.sh

# Expose port
EXPOSE 3000

# Start app
CMD ["pnpm", "start"]