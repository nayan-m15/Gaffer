import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { buildCorsOptionsDelegate } from './cors-config';
import { configureSwagger } from './swagger-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  configureSwagger(app);

  const allowedOrigins = new Set(
    [
      process.env.FRONTEND_URL,
      'https://gaffer-virid.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
    ]
      .filter((origin): origin is string => Boolean(origin))
      .map((origin) => origin.replace(/\/$/, '')),
  );

  app.enableCors(buildCorsOptionsDelegate(allowedOrigins));

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
