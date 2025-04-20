# Use Playwright base image (comes with Node, Python, and deps preinstalled)
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Set working directory
WORKDIR /usr/src/app

# Copy package manager files
COPY package*.json ./

# Install pnpm globally
RUN npm install -g pnpm

# Install Node.js dependencies
RUN pnpm install

# Install Playwright and its system dependencies
RUN pnpm exec playwright install-deps
RUN pnpm exec playwright install

# Copy the rest of the project (including setupPy.sh)
COPY . .

# Run your Python environment setup script
RUN chmod +x ./jobs/setupPy.sh && ./jobs/setupPy.sh

# Expose app port
EXPOSE 3000

# Run the app
CMD ["pnpm", "start"]
