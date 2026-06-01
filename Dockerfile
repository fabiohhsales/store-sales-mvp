FROM node:20-alpine

# Install libc6-compat (required for Next.js features like SWC compiler) and ffmpeg (for audio conversion)
RUN apk add --no-cache libc6-compat ffmpeg

WORKDIR /app

# Copy package management files to leverage layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies needed for compiling the TypeScript build)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Set environment variables for Next.js build-time configuration
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_URL="https://painel.chatsales.com.br"

# Build the Next.js application
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Expose the default port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations and start the server
CMD ["npm", "run", "start"]
