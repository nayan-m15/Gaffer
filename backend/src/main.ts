import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('Sport Coaching Tool API')
    .setDescription('API foundation for the Sport Coaching Tool backend.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

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

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (e.g. server-to-server, mobile, curl)
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS.'), false);
    },
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
