import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { onTestFinished } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { tasks } from '../src/database/schema.js';
import { RemindersJob } from '../src/tasks/reminders.job.js';

// A real PostgreSQL with a pool, so concurrent requests really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Project management API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, projects, refresh_tokens, locks CASCADE`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    // The stream test reads a real response, so the application listens.
    await app.listen(0, '127.0.0.1');
    // The test runs the reminder job itself.
    app.get(SchedulerRegistry).getCronJob('task-reminders').stop();
  });

  afterAll(() => app.close()); // closes the pool too

  let clients = 0;

  /** Signs a user up. Each user has an address of their own: requests are rate-limited per IP address. */
  async function signUp(name: string) {
    const remoteAddress = `10.0.0.${++clients}`;
    const payload = { email: `${name}@example.com`, password: 'correct horse battery' };
    const res = await app.inject({ method: 'POST', url: '/auth/sign-up', payload, remoteAddress });
    const headers = { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
    const me = await app.inject({ method: 'GET', url: '/me', headers, remoteAddress });
    return { id: me.json<{ id: string }>().id, headers, remoteAddress };
  }
  type Client = Awaited<ReturnType<typeof signUp>>;

  const call = ({ headers, remoteAddress }: Client, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers, remoteAddress, payload });

  /** A project of `admin`'s, with `members` added. */
  async function createProject(admin: Client, ...members: string[]) {
    const { id } = (await call(admin, 'POST', '/projects', { name: 'Website relaunch' })).json<{ id: string }>();
    for (const name of members) {
      await call(admin, 'POST', `/projects/${id}/members`, { email: `${name}@example.com` });
    }
    return id;
  }

  async function createTask(client: Client, projectId: string, payload: object = {}) {
    const res = await call(client, 'POST', `/projects/${projectId}/tasks`, { title: 'Write the launch post', ...payload });
    return res.json<{ id: string }>().id;
  }

  let ada: Client, bob: Client, carol: Client, eve: Client;
  beforeAll(async () => {
    [ada, bob, carol, eve] = await Promise.all(['ada', 'bob', 'carol', 'eve'].map(signUp));
  });

  it('checks every request against the project, the task or the comment', async () => {
    const projectId = await createProject(ada, 'bob', 'carol');
    const taskId = await createTask(ada, projectId, { assigneeId: bob.id });
    const rename = (client: Client) => call(client, 'PATCH', `/tasks/${taskId}`, { title: 'Write the launch post, v2' });

    expect((await call(eve, 'GET', `/projects/${projectId}/tasks`)).statusCode).toBe(404); // not a member
    expect((await call(bob, 'POST', `/projects/${projectId}/members`, { email: 'eve@example.com' })).statusCode).toBe(403);
    expect((await rename(eve)).statusCode).toBe(404);
    expect((await rename(carol)).statusCode).toBe(403); // a member, but not the assignee
    expect((await rename(bob)).statusCode).toBe(200);
    expect((await rename(ada)).statusCode).toBe(200); // an admin
    expect((await call(ada, 'PATCH', `/tasks/${taskId}`, { assigneeId: eve.id })).statusCode).toBe(400);

    const comment = await call(carol, 'POST', `/tasks/${taskId}/comments`, { body: 'Looks good' });
    const commentUrl = `/comments/${comment.json<{ id: string }>().id}`;
    expect((await call(bob, 'GET', `/tasks/${taskId}/comments`)).json()).toHaveLength(1);
    expect((await call(eve, 'GET', `/tasks/${taskId}/comments`)).statusCode).toBe(404);
    expect((await call(ada, 'PATCH', commentUrl, { body: 'Edited by an admin' })).statusCode).toBe(403);
    expect((await call(carol, 'PATCH', commentUrl, { body: 'Looks great' })).statusCode).toBe(200);
  });

  it('moves a task once when ten moves from the same status race', async () => {
    const projectId = await createProject(ada, 'bob');
    const taskId = await createTask(ada, projectId, { assigneeId: bob.id });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        call(i % 2 ? ada : bob, 'POST', `/tasks/${taskId}/status`, { from: 'todo', to: i % 2 ? 'in_progress' : 'done' }),
      ),
    );

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, ...Array(9).fill(409)]);
  });

  it('pages through tasks created at the same instant without gaps or repeats', async () => {
    const projectId = await createProject(ada);
    // One statement: all five rows get the same created_at.
    await db.insert(tasks).values(Array.from({ length: 5 }, (_, i) => ({ projectId, title: `Task ${i}`, description: '' })));

    const seen: string[] = [];
    let after = '';
    do {
      const res = await call(ada, 'GET', `/projects/${projectId}/tasks?limit=2${after && `&after=${after}`}`);
      const page = res.json<{ items: { id: string }[]; nextCursor: string | null }>();
      seen.push(...page.items.map((task) => task.id));
      after = page.nextCursor ?? '';
    } while (after);

    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5);
  });

  it("streams a project's changes to its members, and nobody else's", async () => {
    const [projectA, projectB] = [await createProject(ada, 'bob'), await createProject(ada)];
    const [taskA, taskB] = [await createTask(ada, projectA), await createTask(ada, projectB)];

    expect((await fetch(`${await app.getUrl()}/projects/${projectA}/events`, { headers: eve.headers })).status).toBe(404);

    const stream = await openStream(bob, projectA);
    await stream.readUntil(': connected');
    // A change in a project Bob isn't in, then one in his.
    await call(ada, 'PATCH', `/tasks/${taskB}`, { title: 'Not for Bob' });
    await call(ada, 'PATCH', `/tasks/${taskA}`, { title: 'For Bob' });

    const received = await stream.readUntil(`"id":"${taskA}"`);
    expect(received).toContain('event: task.updated');
    expect(received).not.toContain(taskB);
  });

  it('reminds each assignee once, however many runs overlap', async () => {
    const job = app.get(RemindersJob);
    await job.sendReminders(); // takes the job's lease: from here on, every call on this instance runs
    const projectId = await createProject(ada, 'bob');
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await createTask(ada, projectId, { assigneeId: bob.id, dueAt });
    const doneTask = await createTask(ada, projectId, { assigneeId: bob.id, dueAt });
    await call(bob, 'POST', `/tasks/${doneTask}/status`, { from: 'todo', to: 'done' });

    const sent = await Promise.all([1, 2, 3].map(() => job.sendReminders()));

    expect(sent.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(await job.sendReminders()).toBe(0);
  });

  /** Opens a project's event stream as `client`. */
  async function openStream(client: Client, projectId: string) {
    const controller = new AbortController();
    // Closed when the test ends, pass or fail: an open response would keep app.close() waiting.
    onTestFinished(() => controller.abort());
    const url = `${await app.getUrl()}/projects/${projectId}/events`;
    const res = await fetch(url, { headers: client.headers, signal: controller.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let received = '';
    return {
      /** Reads until `text` has arrived, and returns everything received. */
      async readUntil(text: string) {
        while (!received.includes(text)) {
          const { value, done } = await reader.read();
          if (done) {
            throw new Error('The stream ended');
          }
          received += value;
        }
        return received;
      },
    };
  }
});
