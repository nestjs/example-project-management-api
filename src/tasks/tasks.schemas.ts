import { z } from 'zod';

const title = z.string().trim().min(1).max(200);
const description = z.string().max(10_000);
const status = z.enum(['todo', 'in_progress', 'done']);
// An instant with its offset, such as 2026-12-01T17:00:00Z.
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createTaskSchema = z.object({
  title,
  description: description.default(''),
  assigneeId: z.uuid().optional(),
  dueAt: instant.optional(),
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

// `null` unassigns a task or clears its due date. Strict: a `status` here is a 400, not ignored.
export const updateTaskSchema = z
  .strictObject({ title, description, assigneeId: z.uuid().nullable(), dueAt: instant.nullable() })
  .partial();
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
});
export type CommentDto = z.infer<typeof commentSchema>;

// The client says which status it moves the task from: the status it showed the user.
export const moveTaskSchema = z
  .object({ from: status, to: status })
  .refine(({ from, to }) => from !== to, { message: 'from and to must differ', path: ['to'] });
export type MoveTaskDto = z.infer<typeof moveTaskSchema>;

export interface TaskCursor {
  createdAt: string;
  id: string;
}

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/** The position after the last task of a page, opaque to the client. */
export const encodeCursor = ({ createdAt, id }: { createdAt: Date; id: string }) =>
  Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');

const cursor = z.string().max(200).transform((value, ctx): TaskCursor => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {}
  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
    return z.NEVER;
  }
  const [createdAt, id] = parsed.data;
  return { createdAt, id };
});

export const listTasksQuerySchema = z.object({
  status: status.optional(),
  assigneeId: z.uuid().optional(),
  dueBefore: instant.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  after: cursor.optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
