import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { MembershipsService } from './memberships.service.js';
import { ProjectPolicy } from './project.policy.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [UsersModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, MembershipsService, ProjectPolicy],
  exports: [MembershipsService],
})
export class ProjectsModule {}
