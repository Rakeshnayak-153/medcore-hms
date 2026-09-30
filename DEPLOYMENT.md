# Production Deployment

This deployment uses Docker Compose on a Linux VPS, with Caddy terminating HTTPS and routing `/api` to the API container. PostgreSQL and Redis are private to the Compose network.

## Prerequisites

- A Linux server with Docker Engine and the Docker Compose plugin.
- A DNS `A` record for your domain pointing to the server.
- Inbound ports 80 and 443 allowed by the host firewall/security group.
- A separate, persistent disk or backup policy for the PostgreSQL volume.

## Configure

Copy `.env.production.example` to `.env.production` and set `DOMAIN` to the DNS name. Replace all four secret placeholders with distinct values. Generate each with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env.production` private; it is ignored by Git. Do not use the development credentials from `.env.example`.

## Deploy

From the repository root on the VPS:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml config
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

The API container waits for healthy PostgreSQL and Redis, applies tracked Prisma migrations, then starts NestJS. Caddy obtains and renews the HTTPS certificate after DNS and ports are ready.

Verify `https://your-domain/` and `https://your-domain/api/health`. Keep the PostgreSQL and Caddy volumes when updating the application. Back up the database volume before upgrades or migration changes.

## Notes

- `NEXT_PUBLIC_API_URL` is compiled into the web image as `https://<DOMAIN>/api`; rebuild the web image if the domain changes.
- The production Compose file does not publish database or Redis ports.
- This is a single-host deployment, not a high-availability setup. Configure off-server database backups before using real patient data.
