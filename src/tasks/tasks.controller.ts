import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import type { User } from '../users/user.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  updateTaskSchema,
  type CreateTaskDto,
  type ListTasksQuery,
  type MoveTaskDto,
  type UpdateTaskDto,
} from './tasks.schemas.js';
import { TasksService } from './tasks.service.js';

const uuid = { schema: z.uuid() };

// Every route checks the caller's permissions in the service, against the task.
@Can.Anyone()
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('projects/:projectId/tasks')
  create(
    @CurrentUser() user: User,
    @Param('projectId', uuid) projectId: string,
    @Body({ schema: createTaskSchema }) dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user, projectId, dto);
  }

  @Get('projects/:projectId/tasks')
  list(
    @CurrentUser() user: User,
    @Param('projectId', uuid) projectId: string,
    @Query({ schema: listTasksQuerySchema }) query: ListTasksQuery,
  ) {
    return this.tasksService.list(user, projectId, query);
  }

  @Get('tasks/:id')
  findOne(@CurrentUser() user: User, @Param('id', uuid) id: string) {
    return this.tasksService.findOne(user, id);
  }

  @Patch('tasks/:id')
  update(@CurrentUser() user: User, @Param('id', uuid) id: string, @Body({ schema: updateTaskSchema }) dto: UpdateTaskDto) {
    return this.tasksService.update(user, id, dto);
  }

  @Post('tasks/:id/status')
  @HttpCode(200)
  move(@CurrentUser() user: User, @Param('id', uuid) id: string, @Body({ schema: moveTaskSchema }) dto: MoveTaskDto) {
    return this.tasksService.move(user, id, dto);
  }
}
