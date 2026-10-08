import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PublicApiModule } from './public-api/public-api.module';

/** Public documentation is available in every environment, including production. */
export function configureSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Gaffer Public API')
    .setDescription(
      'Public, read-only football data. No account, API key or token is required.',
    )
    .setVersion('0.1.0')
    .addTag(
      'Public API',
      'Externally accessible, unauthenticated GET endpoints.',
    )
    .build();
  // Document only the explicitly public controllers; protected application
  // routes retain their existing guards and are outside this public contract.
  const document = SwaggerModule.createDocument(app, config, {
    include: [PublicApiModule],
  });
  SwaggerModule.setup('api/docs', app, document);
}
