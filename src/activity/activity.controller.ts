import { Controller, Param, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import type { Observable } from 'rxjs';
import { ActivityService } from './activity.service.js';
import { ProjectMemberGuard } from './project-member.guard.js';

@Can.Anyone()
@UseGuards(ProjectMemberGuard)
@Controller('projects/:projectId/events')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  // Only members get here: ProjectMemberGuard checked the project before the stream started.
  @Sse()
  stream(@Param('projectId') projectId: string): Observable<MessageEvent> {
    return this.activityService.stream(projectId);
  }
}
