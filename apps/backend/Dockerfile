# Use the official Node.js image as a base image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available) to the working directory
COPY package*.json ./

# Install pnpm (with no cache)
RUN npm install -g pnpm --no-cache

# Install the project dependencies (with no cache)
RUN pnpm install --no-cache

# Install Playwright and its dependencies (with no cache)
RUN pnpm add playwright --no-cache
RUN pnpm exec playwright install --no-cache
RUN pnpm exec playwright install-deps --no-cache

# Copy the rest of the project files into the container
COPY . .

# Expose the port that the app runs on
EXPOSE 3000

# Define the command to run the app
CMD ["pnpm", "start"]
