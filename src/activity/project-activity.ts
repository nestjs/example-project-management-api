import type { Comment, Task } from '../database/schema.js';

/** Something that changed in a project, emitted after the change was written. */
export type ProjectActivity =
  | { type: 'task.created' | 'task.updated'; projectId: string; data: Task }
  | { type: 'comment.created' | 'comment.updated'; projectId: string; data: Comment };
