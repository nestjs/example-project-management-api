import { Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { z } from 'zod';
import { MembershipsService } from '../projects/memberships.service.js';
import type { User } from '../users/user.js';

/**
 * Checks that the user is a member of the route's project before the handler runs.
 * An `@Sse()` route sends its headers before an async handler settles, so a 404
 * thrown there would reach the client as an `error` event on a 200 stream.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly memberships: MembershipsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context.switchToHttp().getRequest<{ user: User; params: { projectId: string } }>();
    // Guards run before pipes, so the id isn't validated yet.
    if (!z.uuid().safeParse(params.projectId).success) {
      throw new NotFoundException('Project not found');
    }
    await this.memberships.access(user, params.projectId);
    return true;
  }
}
