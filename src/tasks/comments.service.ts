import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ProjectActivity } from '../activity/project-activity.js';
import { comments, projectMembers, tasks, type Comment } from '../database/schema.js';
import { MembershipsService } from '../projects/memberships.service.js';
import type { User } from '../users/user.js';
import { CommentPolicy } from './comment.policy.js';
import type { CommentDto } from './tasks.schemas.js';
import { TasksService } from './tasks.service.js';

@Injectable()
export class CommentsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly tasksService: TasksService,
    private readonly memberships: MembershipsService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** The task's comments, oldest first, for members of its project. */
  async list(user: User, taskId: string): Promise<Comment[]> {
    await this.tasksService.load(user, taskId);
    return this.db.select().from(comments).where(eq(comments.taskId, taskId)).orderBy(asc(comments.createdAt)).limit(200);
  }

  /** Any member comments on a task. */
  async create(user: User, taskId: string, { body }: CommentDto): Promise<Comment> {
    const { task } = await this.tasksService.load(user, taskId);
    const [comment] = await this.db.insert(comments).values({ taskId, authorId: user.id, body }).returning();
    this.emit({ type: 'comment.created', projectId: task.projectId, data: comment });
    return comment;
  }

  /** Only the author edits a comment. */
  async update(user: User, id: string, { body }: CommentDto): Promise<Comment> {
    const [row] = await this.db
      .select({ comment: comments, projectId: tasks.projectId, membership: projectMembers })
      .from(comments)
      .innerJoin(tasks, eq(tasks.id, comments.taskId))
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, user.id)))
      .where(eq(comments.id, id));
    if (!row) {
      throw new NotFoundException('Comment not found');
    }
    await this.memberships.check(user, row.membership, 'Comment not found');
    await this.authorizationService.authorize(CommentPolicy, 'edit', user, row.comment);
    const [updated] = await this.db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(comments.id, id), eq(comments.authorId, user.id)))
      .returning();
    if (!updated) {
      throw new NotFoundException('Comment not found');
    }
    this.emit({ type: 'comment.updated', projectId: row.projectId, data: updated });
    return updated;
  }

  private emit(activity: ProjectActivity) {
    this.eventEmitter.emit(activity.type, activity);
  }
}
