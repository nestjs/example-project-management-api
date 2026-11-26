import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { OnOneInstance } from '@nestjs/locks';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, isNull, lte, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { tasks, users } from '../database/schema.js';

@Injectable()
export class RemindersJob {
  private readonly logger = new Logger(RemindersJob.name);

  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Reminds assignees of open tasks due within a day, once per task. Returns how many it sent. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'task-reminders' })
  @OnOneInstance({ key: 'tasks:due-reminders' })
  async sendReminders(): Promise<number> {
    // Claims the tasks in the statement that finds them: of two runs at once, each task goes to one.
    const due = await this.db
      .update(tasks)
      .set({ remindedAt: new Date() })
      .from(users)
      .where(
        and(
          eq(users.id, tasks.assigneeId),
          isNull(tasks.remindedAt),
          ne(tasks.status, 'done'),
          lte(tasks.dueAt, sql`now() + interval '1 day'`),
        ),
      )
      .returning({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, email: users.email });
    for (const task of due) {
      // Send the email here, for example with @nestjs/mail.
      this.logger.log(`Reminder to ${task.email}: "${task.title}" is due ${task.dueAt?.toISOString()}`);
    }
    return due.length;
  }
}
