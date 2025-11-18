# CamiReads - Personal Reading Tracker

A cozy, personal reading tracker app with a warm, bookish aesthetic. Built with Next.js 16 and designed for mobile-first use.

## Features

- Track your reading journey with book reviews and ratings
- Search books using the Open Library API
- Filter and search through your reviews
- Mobile-first design with bottom navigation
- Spanish language interface

## Running with Docker

### Prerequisites

- Docker and Docker Compose installed on your system
- A running CamiReads backend API (Spring Boot)

### Quick Start

1. **Build and run the container:**

\`\`\`bash
docker compose up --build
\`\`\`

The frontend will be available at `http://localhost:3000`

2. **Configure the backend API URL:**

Edit the `docker-compose.yml` file to set your backend URL:

\`\`\`yaml
environment:
  - NEXT_PUBLIC_API_URL=http://your-backend-host:8080
\`\`\`

### Environment Variables

- `NEXT_PUBLIC_API_URL`: The base URL for your CamiReads backend API
  - Default: `http://localhost:8080`
  - For Docker networks: `http://camireads-api:8080`
  - For external hosts: `http://your-server-ip:8080`

### Docker Commands

\`\`\`bash
# Build and start the container
docker compose up --build

# Run in detached mode (background)
docker compose up -d

# Stop the container
docker compose down

# View logs
docker compose logs -f camireads-web

# Rebuild after code changes
docker compose up --build --force-recreate
\`\`\`

### Integration with Backend

To connect with your Spring Boot backend:

1. Ensure both services are on the same Docker network
2. Update the `NEXT_PUBLIC_API_URL` in `docker-compose.yml`
3. If your backend is also in Docker Compose, you can reference it by service name:

\`\`\`yaml
services:
  camireads-api:
    # Your Spring Boot backend configuration
    ...
  
  camireads-web:
    environment:
      - NEXT_PUBLIC_API_URL=http://camireads-api:8080
    depends_on:
      - camireads-api
\`\`\`

## Development

To run locally without Docker:

\`\`\`bash
npm install
npm run dev
\`\`\`

Set the backend URL in `.env.local`:

\`\`\`
NEXT_PUBLIC_API_URL=http://localhost:8080
\`\`\`

## Tech Stack

- Next.js 16 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui components
- Open Library API integration
