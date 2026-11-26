import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { projectMembers, type Membership } from '../database/schema.js';
import type { User } from '../users/user.js';
import { ProjectPolicy } from './project.policy.js';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** The user's membership of the project. A project they may not see is a 404, as if it didn't exist. */
  async access(user: User, projectId: string): Promise<Membership | null> {
    const [membership = null] = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)));
    await this.check(user, membership, 'Project not found');
    return membership;
  }

  /** Throws a 404 with `message` unless `membership` lets the user see its project. */
  async check(user: User, membership: Membership | null, message: string): Promise<void> {
    if (!(await this.authorizationService.can(ProjectPolicy, 'view', user, membership))) {
      throw new NotFoundException(message);
    }
  }
}
