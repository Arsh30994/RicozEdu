import { Module } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { PeopleController } from './people.controller';

@Module({
  controllers: [PeopleController],
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PeopleModule {}
