import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { CommentPolicy } from './comment.policy.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { RemindersJob } from './reminders.job.js';
import { TaskPolicy } from './task.policy.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [TasksController, CommentsController],
  providers: [TasksService, CommentsService, TaskPolicy, CommentPolicy, RemindersJob],
})
export class TasksModule {}
