import { Policy } from '@nestjs/authorization';
import type { Membership, Task } from '../database/schema.js';
import type { User } from '../users/user.js';

@Policy()
export class TaskPolicy {
  // The assignee or a project admin changes a task. `membership` is the user's, in the task's project.
  update(user: User, task: Task, membership: Membership | null) {
    if (membership?.userId !== user.id || membership.projectId !== task.projectId) {
      return false;
    }
    return membership.role === 'admin' || task.assigneeId === user.id;
  }
}
