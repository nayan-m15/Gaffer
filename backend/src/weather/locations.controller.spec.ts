import { BadRequestException } from '@nestjs/common';
import { LocationsController } from './locations.controller';

describe('LocationsController', () => {
  const controller = new LocationsController();

  it.each([undefined, ['Johannesburg', 'Pretoria'], { city: 'Johannesburg' }])(
    'rejects a non-string location query: %p',
    async (query) => {
      await expect(controller.search(query)).rejects.toThrow(
        BadRequestException,
      );
    },
  );
});
