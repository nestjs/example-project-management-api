import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import type { User } from '../users/user.js';
import { commentSchema, type CommentDto } from './tasks.schemas.js';
import { CommentsService } from './comments.service.js';

const uuid = { schema: z.uuid() };

@Can.Anyone()
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('tasks/:taskId/comments')
  list(@CurrentUser() user: User, @Param('taskId', uuid) taskId: string) {
    return this.commentsService.list(user, taskId);
  }

  @Post('tasks/:taskId/comments')
  create(@CurrentUser() user: User, @Param('taskId', uuid) taskId: string, @Body({ schema: commentSchema }) dto: CommentDto) {
    return this.commentsService.create(user, taskId, dto);
  }

  @Patch('comments/:id')
  update(@CurrentUser() user: User, @Param('id', uuid) id: string, @Body({ schema: commentSchema }) dto: CommentDto) {
    return this.commentsService.update(user, id, dto);
  }
}
