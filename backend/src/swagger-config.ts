import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** HARD-002: interactive docs and raw schemas are for local development only. */
export function configureSwagger(app: INestApplication): void {
  // Fail closed when the deployment environment is missing or unrecognised.
  if (process.env.NODE_ENV !== 'development') return;

  const config = new DocumentBuilder()
    .setTitle('Sport Coaching Tool API')
    .setDescription('API foundation for the Sport Coaching Tool backend.')
    .setVersion('0.1.0')
    .addTag(
      'Public API',
      'Externally accessible, unauthenticated GET endpoints.',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
