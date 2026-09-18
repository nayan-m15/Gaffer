import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationsController } from './locations.controller';
import { WeatherService } from './weather.service';

@Module({
  imports: [AuthModule],
  controllers: [LocationsController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
