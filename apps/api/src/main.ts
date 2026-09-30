import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function validateProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;

  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  const secrets = [accessSecret, refreshSecret];
  if (
    secrets.some(
      (secret) =>
        !secret || secret.length < 32 || secret.startsWith('replace-with-'),
    ) ||
    accessSecret === refreshSecret
  ) {
    throw new Error(
      'Production requires distinct JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values of at least 32 characters.',
    );
  }
}

async function bootstrap() {
  validateProductionSecrets();
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = [
    ...(process.env.FRONTEND_URL ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...(process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://localhost:3002']),
  ];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((error) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});

