import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
