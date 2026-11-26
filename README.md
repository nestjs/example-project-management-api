# Project-management API with NestJS

This is the finished application of the tutorial [Build a project-management API in Node.js](https://docs.nestjs.com/tutorials/project-management-api) in the NestJS documentation. The tutorial builds it step by step and explains every decision; this repository is the result, ready to clone.

## What it does

A REST API for a team's project-management tool:

- Projects with members, each an `admin` or a `member` of that project. Tasks with a status (`todo`, `in_progress`, `done`), an assignee and a due date. Comments on tasks.
- Every request is checked against the record it touches, with `@nestjs/authorization` policies: members read, the assignee or a project admin changes a task, only its author edits a comment. Someone outside a project gets a 404 for everything in it.
- Status changes are conditional updates: the client sends the status it moves the task from, and a move from a status the task has already left is a 409.
- The task list filters by status, assignee and due date, with keyset pagination and an index for each way it is read.
- Changes are pushed to the project's members over Server-Sent Events.
- A scheduled job reminds assignees of tasks due within a day, on one instance, with `@nestjs/locks` (the reminder is logged; sending email is left to you).
- Sign-up, JWT access tokens and rotating refresh tokens with `@nestjs/authentication`, from the [JWT tutorial](https://docs.nestjs.com/tutorials/rest-api-jwt-authentication).

## Run it

You need Node.js 22 or later, and Docker for PostgreSQL.

```bash
git clone https://github.com/nestjs/example-project-management-api.git
cd example-project-management-api
npm install
cp .env.example .env              # then set JWT_SECRET: openssl rand -base64 32
docker compose up -d
npm run db:migrate
npm run start:dev
```

The API listens on http://localhost:3000, with Swagger UI at http://localhost:3000/docs. Check it with `curl localhost:3000/health/ready`. The tutorial's [Try it](https://docs.nestjs.com/tutorials/project-management-api#try-it) section walks through every endpoint with curl.

## Endpoints

Every route except `/auth/*`, `/health/*` and `/docs` needs an `Authorization: Bearer <access token>` header.

| Endpoint | Tutorial section |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](https://docs.nestjs.com/tutorials/project-management-api#start-from-the-jwt-api) |
| `POST /projects`, `GET /projects`, `GET /projects/:projectId/members`, `POST /projects/:projectId/members` | [Share projects with their members](https://docs.nestjs.com/tutorials/project-management-api#share-projects-with-their-members) |
| `POST /projects/:projectId/tasks`, `GET /projects/:projectId/tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `POST /tasks/:id/status` | [Add tasks](https://docs.nestjs.com/tutorials/project-management-api#add-tasks) |
| `GET /tasks/:taskId/comments`, `POST /tasks/:taskId/comments`, `PATCH /comments/:id` | [Comment on tasks](https://docs.nestjs.com/tutorials/project-management-api#comment-on-tasks) |
| `GET /projects/:projectId/events` (Server-Sent Events) | [Stream changes with server-sent events](https://docs.nestjs.com/tutorials/project-management-api#stream-changes-with-server-sent-events) |

The reminder job has no endpoint: see [Remind assignees before tasks are due](https://docs.nestjs.com/tutorials/project-management-api#remind-assignees-before-tasks-are-due).

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.ts` | bootstrap on the Node adapter, JSON logs in production, security headers, CORS, Swagger UI |
| `src/app.module.ts` | NestJS Observe, config, database, authentication, authorization, events, scheduler, locks, rate limits, validation pipe |
| `src/config.ts` | the environment, as a Zod schema checked at startup |
| `src/database/schema.ts` | Drizzle tables: users, projects, project_members, tasks, comments, refresh_tokens, locks |
| `src/database/drizzle-lock.store.ts` | the `@nestjs/locks` store, on PostgreSQL |
| `src/auth/`, `src/users/`, `src/health/` | sign-in, `GET /me` and health checks, from the JWT tutorial |
| `src/projects/` | projects, memberships and the project policy |
| `src/tasks/` | tasks, comments, their policies, and the reminder job |
| `src/activity/` | the Server-Sent Events stream and its membership guard |
| `test/` | e2e tests on PostgreSQL: permissions, racing status changes, paging, the stream, reminders; and the refresh-token store contract |
| `drizzle/` | migrations |

## Tests

```bash
TEST_DATABASE_URL=postgres://postgres:projects@localhost:5432/projects_test npm run test:e2e
```

`docker compose` creates the `projects_test` database. The tests truncate its tables, so never point them at your development database. They need a real PostgreSQL server, because they check what happens when requests race. Without `TEST_DATABASE_URL` they are skipped.

## Stack

[NestJS](https://nestjs.com) 12 on the Node adapter, [Zod](https://zod.dev) validation, [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication), [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization), [Drizzle](https://docs.nestjs.com/data/drizzle) and PostgreSQL, [Server-Sent Events](https://docs.nestjs.com/http/server-sent-events), [`@nestjs/event-emitter`](https://docs.nestjs.com/application/events), [`@nestjs/schedule`](https://docs.nestjs.com/application/task-scheduling), [`@nestjs/locks`](https://docs.nestjs.com/reliability/locks), [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting), [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction), [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus), [NestJS Observe](https://docs.nestjs.com/observability/overview), and Vitest.

## Production

Read the tutorial's [production checklist](https://docs.nestjs.com/tutorials/project-management-api#production-checklist) first. Among other things, the event stream is in-process: with more than one instance, fan the events out between them.

The app is wired for [NestJS Observe](https://docs.nestjs.com/observability/overview), which reports the latency and errors of every route and the runs of the reminder job. It sends nothing until it has a key pair: `npx @nestjs/observe link` writes `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` into `.env`. In production, set them in the platform's environment: `npm run start:prod` doesn't load `.env`.

## License

MIT
