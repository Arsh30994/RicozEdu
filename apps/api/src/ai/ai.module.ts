import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module';
import { IamModule } from '../iam/iam.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [AcademicsModule, IamModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
