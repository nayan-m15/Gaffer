import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { buildCorsOptionsDelegate } from './cors-config';
import { configureSwagger } from './swagger-config';
import { getTrustedOrigins } from './trusted-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  configureSwagger(app);

  app.enableCors(buildCorsOptionsDelegate(new Set(getTrustedOrigins())));

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
