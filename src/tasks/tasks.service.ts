import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import type { ProjectActivity } from '../activity/project-activity.js';
import { projectMembers, tasks, type Task } from '../database/schema.js';
import { MembershipsService } from '../projects/memberships.service.js';
import type { User } from '../users/user.js';
import { TaskPolicy } from './task.policy.js';
import {
  encodeCursor,
  type CreateTaskDto,
  type ListTasksQuery,
  type MoveTaskDto,
  type UpdateTaskDto,
} from './tasks.schemas.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly memberships: MembershipsService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Any member adds a task to the project. */
  async create(user: User, projectId: string, dto: CreateTaskDto): Promise<Task> {
    await this.memberships.access(user, projectId);
    const [task] = await this.db
      .insert(tasks)
      .values({ ...dto, projectId })
      .returning()
      .catch(assigneeNotMember);
    this.emit({ type: 'task.created', projectId, data: task });
    return task;
  }

  /** A page of the project's tasks, newest first. */
  async list(user: User, projectId: string, { status, assigneeId, dueBefore, limit, after }: ListTasksQuery) {
    await this.memberships.access(user, projectId);
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          status ? eq(tasks.status, status) : undefined,
          assigneeId ? eq(tasks.assigneeId, assigneeId) : undefined,
          dueBefore ? lt(tasks.dueAt, dueBefore) : undefined,
          // Keyset pagination: the tasks after the cursor's, in the index's order.
          after
            ? sql`(${tasks.createdAt}, ${tasks.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]) : null };
  }

  async findOne(user: User, id: string): Promise<Task> {
    return (await this.load(user, id)).task;
  }

  /** The assignee or an admin changes the task's fields. */
  async update(user: User, id: string, dto: UpdateTaskDto): Promise<Task> {
    const { task, membership } = await this.load(user, id);
    await this.authorizationService.authorize(TaskPolicy, 'update', user, task, membership);
    const [updated] = await this.db
      .update(tasks)
      // A new due date gets a new reminder.
      .set({ ...dto, remindedAt: dto.dueAt === undefined ? undefined : null, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()
      .catch(assigneeNotMember);
    if (!updated) {
      throw new NotFoundException('Task not found');
    }
    this.emit({ type: 'task.updated', projectId: updated.projectId, data: updated });
    return updated;
  }

  /** Moves the task from the status the client saw to another, or answers 409 if it has moved since. */
  async move(user: User, id: string, { from, to }: MoveTaskDto): Promise<Task> {
    const { task, membership } = await this.load(user, id);
    await this.authorizationService.authorize(TaskPolicy, 'update', user, task, membership);
    // Conditional: of two moves from the same status, one wins.
    const [moved] = await this.db
      .update(tasks)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.status, from)))
      .returning();
    if (!moved) {
      throw new ConflictException(`Task is no longer ${from}`);
    }
    this.emit({ type: 'task.updated', projectId: moved.projectId, data: moved });
    return moved;
  }

  /** The task with the user's membership of its project, in one query. */
  async load(user: User, id: string) {
    const [row] = await this.db
      .select({ task: tasks, membership: projectMembers })
      .from(tasks)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, user.id)))
      .where(eq(tasks.id, id));
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    // A task in a project the user isn't in is as missing as one that doesn't exist.
    await this.memberships.check(user, row.membership, 'Task not found');
    return row;
  }

  private emit(activity: ProjectActivity) {
    this.eventEmitter.emit(activity.type, activity);
  }
}

/** The assignee foreign key's violation as a 400, rather than a 500. */
function assigneeNotMember(error: unknown): never {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof DatabaseError && cause.constraint === 'tasks_assignee_is_member_fk') {
    throw new BadRequestException('The assignee is not a member of this project');
  }
  throw error;
}
