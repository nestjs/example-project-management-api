import { Policy } from '@nestjs/authorization';
import type { Membership } from '../database/schema.js';
import type { User } from '../users/user.js';

/** `membership` is the user's membership of the project, or `null` if they have none. */
@Policy()
export class ProjectPolicy {
  // Members see the project, its tasks and their comments.
  view(user: User, membership: Membership | null) {
    return membership?.userId === user.id;
  }

  // Admins add members.
  manage(user: User, membership: Membership | null) {
    return membership?.userId === user.id && membership.role === 'admin';
  }
}
