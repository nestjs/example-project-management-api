import { Policy } from '@nestjs/authorization';
import type { Comment } from '../database/schema.js';
import type { User } from '../users/user.js';

@Policy()
export class CommentPolicy {
  // Only its author edits a comment: an admin can't edit someone else's either.
  edit(user: User, comment: Comment) {
    return comment.authorId === user.id;
  }
}
