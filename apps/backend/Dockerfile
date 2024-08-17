# Use the official Node.js image as a base image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available) to the working directory
COPY package*.json ./

# Install pnpm
RUN npm install -g pnpm

# Install the project dependencies
RUN pnpm install

# Install Playwright and its dependencies
RUN pnpm add playwright
RUN pnpm exec playwright install
RUN pnpm exec playwright install-deps
# Copy the rest of the project files into the container
COPY . .

# Expose the port that the app runs on
EXPOSE 3000

# Define the command to run the app
CMD ["pnpm", "start"]
