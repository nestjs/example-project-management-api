import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const ms = (name: string) => timestamp(name, { withTimezone: true, mode: 'date', precision: 3 });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    // "My projects" looks memberships up by user.
    index('project_members_user_id_idx').on(table.userId),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: ['todo', 'in_progress', 'done'] }).notNull().default('todo'),
    assigneeId: uuid('assignee_id'),
    dueAt: at('due_at'),
    remindedAt: at('reminded_at'),
    // To the millisecond, like a JavaScript Date, so a page cursor round-trips exactly.
    createdAt: ms('created_at').notNull().defaultNow(),
    updatedAt: ms('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // The assignee is a member of the task's project, whatever the application does.
    foreignKey({
      name: 'tasks_assignee_is_member_fk',
      columns: [table.projectId, table.assigneeId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    // One index per way the list is read: all tasks, by status, by assignee.
    index('tasks_project_id_created_at_idx').on(table.projectId, table.createdAt, table.id),
    index('tasks_project_id_status_created_at_idx').on(table.projectId, table.status, table.createdAt, table.id),
    index('tasks_project_id_assignee_id_created_at_idx').on(
      table.projectId,
      table.assigneeId,
      table.createdAt,
      table.id,
    ),
    // The reminder job's scan: open tasks that haven't been reminded yet.
    index('tasks_due_at_unreminded_idx')
      .on(table.dueAt)
      .where(sql`${table.remindedAt} is null and ${table.status} <> 'done'`),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [index('comments_task_id_created_at_idx').on(table.taskId, table.createdAt)],
);

// What @nestjs/authentication keeps for refresh tokens, stored by their SHA-256.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    familyExpiresAt: at('family_expires_at').notNull(),
    usedAt: at('used_at'),
    // A family is revoked when any of its tokens is.
    revoked: boolean('revoked').notNull().default(false),
    claims: jsonb('claims').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('refresh_tokens_family_id_idx').on(table.familyId),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_expires_at_idx').on(table.familyExpiresAt),
  ],
);

// What @nestjs/locks keeps, through DrizzleLockStore: one row per lock key.
export const locks = pgTable('locks', {
  key: text('key').primaryKey(),
  /** The holder's id; null once released. */
  owner: text('owner'),
  fencingToken: bigint('fencing_token', { mode: 'number' }).notNull(),
  /** On the database's clock: every instance agrees on it. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Fencing tokens for every key: a sequence never goes back, so they only grow. */
export const locksFencingTokenSeq = pgSequence('locks_fencing_token_seq');

export type Project = typeof projects.$inferSelect;
export type Membership = typeof projectMembers.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Comment = typeof comments.$inferSelect;
