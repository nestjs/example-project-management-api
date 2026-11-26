import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import type { User } from '../users/user.js';
import { addMemberSchema, createProjectSchema, type AddMemberDto, type CreateProjectDto } from './projects.schemas.js';
import { ProjectsService } from './projects.service.js';

const projectId = { schema: z.uuid() };

// Every route checks the caller's membership in the service.
@Can.Anyone()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body({ schema: createProjectSchema }) dto: CreateProjectDto) {
    return this.projectsService.create(user, dto);
  }

  @Get()
  findMine(@CurrentUser() user: User) {
    return this.projectsService.findMine(user);
  }

  @Get(':projectId/members')
  members(@CurrentUser() user: User, @Param('projectId', projectId) id: string) {
    return this.projectsService.members(user, id);
  }

  @Post(':projectId/members')
  addMember(
    @CurrentUser() user: User,
    @Param('projectId', projectId) id: string,
    @Body({ schema: addMemberSchema }) dto: AddMemberDto,
  ) {
    return this.projectsService.addMember(user, id, dto);
  }
}
