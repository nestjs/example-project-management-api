import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { projectMembers, projects, users } from '../database/schema.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';
import { MembershipsService } from './memberships.service.js';
import { ProjectPolicy } from './project.policy.js';
import type { AddMemberDto, CreateProjectDto } from './projects.schemas.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly memberships: MembershipsService,
    private readonly authorizationService: AuthorizationService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /** Creates the project with its creator as its first admin, or neither. */
  create(user: User, dto: CreateProjectDto) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx.insert(projects).values(dto).returning();
      await tx.insert(projectMembers).values({ projectId: project.id, userId: user.id, role: 'admin' });
      return { ...project, role: 'admin' as const };
    });
  }

  /** The projects the user is a member of, with their role in each. */
  findMine(user: User) {
    return this.db
      .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, user.id))
      .orderBy(asc(projects.name));
  }

  async members(user: User, projectId: string) {
    await this.memberships.access(user, projectId);
    return this.db
      .select({ userId: users.id, email: users.email, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.email));
  }

  async addMember(user: User, projectId: string, { email, role }: AddMemberDto) {
    const membership = await this.memberships.access(user, projectId);
    await this.authorizationService.authorize(ProjectPolicy, 'manage', user, membership);
    const member = await this.usersRepository.findByEmail(email);
    if (!member) {
      throw new NotFoundException('No user with this email');
    }
    const [added] = await this.db
      .insert(projectMembers)
      .values({ projectId, userId: member.id, role })
      .onConflictDoNothing()
      .returning();
    if (!added) {
      throw new ConflictException('Already a member');
    }
    return { userId: member.id, email: member.email, role: added.role };
  }
}
