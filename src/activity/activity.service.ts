import { Injectable, type MessageEvent } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { filter, interval, map, merge, of, Subject, type Observable } from 'rxjs';
import type { ProjectActivity } from './project-activity.js';

@Injectable()
export class ActivityService {
  // One listener for the whole application; each stream filters it.
  private readonly activity$ = new Subject<ProjectActivity>();

  @OnEvent('task.*')
  onTask(activity: ProjectActivity) {
    this.activity$.next(activity);
  }

  @OnEvent('comment.*')
  onComment(activity: ProjectActivity) {
    this.activity$.next(activity);
  }

  /** The project's activity as server-sent events. */
  stream(projectId: string): Observable<MessageEvent> {
    return merge(
      // Tells the client the stream is open: changes from here on reach it.
      of({ comment: 'connected' }),
      this.activity$.pipe(
        filter((activity) => activity.projectId === projectId),
        map(({ type, data }) => ({ type, data })),
      ),
      // Proxies close connections that stay silent; a comment every 20 seconds keeps it open.
      interval(20_000).pipe(map(() => ({ comment: 'keep-alive' }))),
    );
  }
}
