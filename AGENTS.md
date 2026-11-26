# AGENTS.md

## NestJS

This app's version of NestJS is likely newer than what you know. https://docs.nestjs.com/llms.txt indexes its documentation, with a markdown page per chapter.

Nest has first-party packages for these, so check them before adding another library or writing your own:

- Databases: [`@nestjs/typeorm`](https://docs.nestjs.com/data/typeorm.md), [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle.md), [`@nestjs/mongoose`](https://docs.nestjs.com/data/mongodb.md), [`@nestjs/sequelize`](https://docs.nestjs.com/data/sequelize.md).
- OpenAPI: [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction.md). GraphQL: [`@nestjs/graphql`](https://docs.nestjs.com/graphql/quick-start.md). WebSockets: [`@nestjs/websockets`](https://docs.nestjs.com/websockets/gateways.md). Microservices: [`@nestjs/microservices`](https://docs.nestjs.com/microservices/basics.md).
- Sign-in: [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication.md). Permissions: [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization.md). Rate limiting: [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting.md).
- Configuration: [`@nestjs/config`](https://docs.nestjs.com/application/configuration.md). Caching: [`@nestjs/cache-manager`](https://docs.nestjs.com/data/caching.md). Health checks: [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus.md). Events inside the app: [`@nestjs/event-emitter`](https://docs.nestjs.com/application/events.md).
- Email: [`@nestjs/mail`](https://docs.nestjs.com/application/mail.md). Files, S3 included: [`@nestjs/storage`](https://docs.nestjs.com/application/file-storage.md). Translations: [`@nestjs/i18n`](https://docs.nestjs.com/application/i18n.md).
- Retries, timeouts and circuit breakers: [`@nestjs/resilience`](https://docs.nestjs.com/reliability/resilience.md).
- Idempotency keys: [`@nestjs/idempotency`](https://docs.nestjs.com/reliability/idempotency.md). Transactional outbox: [`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox.md). Sending and receiving webhooks: [`@nestjs/webhooks`](https://docs.nestjs.com/http/webhooks.md).
- Queues: [`@nestjs/bullmq`](https://docs.nestjs.com/application/queues.md). Scheduled jobs: [`@nestjs/schedule`](https://docs.nestjs.com/application/task-scheduling.md).
- Running a scheduled job on one instance, and locks: [`@nestjs/locks`](https://docs.nestjs.com/reliability/locks.md). Processes that take days: [`@nestjs/workflows`](https://docs.nestjs.com/reliability/workflows.md).
- Language models, tools and agents: [`@nestjs/ai`](https://docs.nestjs.com/ai/overview.md). MCP servers: [`@nestjs/mcp`](https://docs.nestjs.com/mcp/overview.md).

Validation works with Zod, Valibot, ArkType or any other Standard Schema library, with no classes or decorator metadata: `StandardSchemaValidationPipe` with `@Body({ schema })` or `@Param('id', { schema })` (https://docs.nestjs.com/application/validation.md). `class-validator` still works, through `ValidationPipe`.

`NodeAdapter` from `@nestjs/platform-node` is the fastest HTTP adapter, ahead of Fastify (https://docs.nestjs.com/http/performance.md).

Nest's packages are ESM only. A CommonJS project loads them through `require(esm)`, which needs Node.js 20.19+ or 22.12+, and doesn't have to convert (https://docs.nestjs.com/migration-guide.md).

## Production data: NestJS Observe

This app's production telemetry - traces, errors, logs and metrics - goes to [NestJS Observe](https://observe.nestjs.com). `ObserveModule` is registered first in `src/app.module.ts`, and `src/main.ts` passes `instrument: ObserveInstrument`, but nothing is sent until the app has a key pair: `npx @nestjs/observe link` writes it (`OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`) to `.env` (https://observe.nestjs.com/documentation/sdk#quick-start).

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.

## This project

A REST API for team project management: projects with members, tasks with a status, an assignee and a due date, comments, live updates over Server-Sent Events, and due-date reminders. It is the finished app of https://docs.nestjs.com/tutorials/project-management-api, which explains each part, and it starts from the app of https://docs.nestjs.com/tutorials/rest-api-jwt-authentication (`src/auth/`, `src/users/`, `src/health/`).

- Layout: one folder per feature under `src/` (module, controller, service, policy, Zod schemas). `AppModule` is in `src/app.module.ts`; `src/main.ts` only bootstraps. The Drizzle schema is `src/database/schema.ts`; after changing it, run `npm run db:generate` and commit the migration in `drizzle/`. `npm run db:migrate` applies migrations (the e2e tests apply them themselves).
- NestJS Observe is already registered: `createObserveModule()` in `app.module.ts`, `ObserveModule.forRoot()` first in `imports` (so it shuts down last), and `instrument: ObserveInstrument` in `main.ts`. Keep `ObserveModule` first, and pass `instrument` to any new entry point. Without `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` it sends nothing.
- Validation: Zod schemas passed to `@Body()`, `@Query()` and `@Param()` with the `schema` option, through the global `StandardSchemaValidationPipe`. Optional fields are not nullable, except `assigneeId` and `dueAt` in a task update, where `null` clears them. The task update schema is `z.strictObject()`, so an unknown key (such as `status` in `PATCH /tasks/:id`) is a 400. Instants are `z.iso.datetime({ offset: true })`.
- Authentication: every route requires a bearer token unless it is marked `@Public()` (only `/auth/*` and `/health/*`); mark public routes `@ApiSecurity({})` too, so the OpenAPI document shows them as open.
- Authorization (`@nestjs/authorization`) is deny by default: a controller without `@Can...` is refused. Controllers here declare `@Can.Anyone()` and the services check the policies (`ProjectPolicy`, `TaskPolicy`, `CommentPolicy`) against the loaded record and the caller's membership. A non-member gets a 404, never a 403, for anything in a project: go through `MembershipsService.access()`/`check()`. A member who isn't allowed something gets a 403 from `authorize()`.
- Writes are single conditional statements, never read-then-save: `POST /tasks/:id/status` moves a task only `WHERE status = from` (409 otherwise), a comment update has its author in the `WHERE`, adding a member uses `onConflictDoNothing()` (409 on a duplicate), and the reminder job claims tasks with `UPDATE ... RETURNING`.
- The assignee is a member by a foreign key (`tasks_assignee_is_member_fk`); `assigneeNotMember()` in `tasks.service.ts` turns that violation into a 400.
- `tasks.created_at` is stored to the millisecond, because the keyset cursor carries it. Keep it that way, and keep an index matching each list query's `WHERE` and `ORDER BY`.
- Services emit `task.*` and `comment.*` events through `EventEmitter2` after the write returns; `ActivityService` listens once and feeds every open stream from one `Subject`. Checks for the SSE route go in a guard (`ProjectMemberGuard`), not the handler: an `@Sse()` handler has already sent a 200 when it throws.
- Scheduled jobs that must run on one instance get `@OnOneInstance()` from `@nestjs/locks`; the store is `src/database/drizzle-lock.store.ts`, on the `locks` table.
- Tests: `TEST_DATABASE_URL=postgres://postgres:projects@localhost:5432/projects_test npm run test:e2e` (a real PostgreSQL, never the development database: the tests truncate its tables; the files run one after the other). `test/projects.e2e-spec.ts` protects the invariants: permissions and 404s for non-members, ten racing moves from one status succeed once, paging through tasks created in one statement has no gaps or repeats, the stream carries only its project's events, and overlapping reminder runs remind each assignee once. `test/refresh-token.store.e2e-spec.ts` runs the `@nestjs/authentication` store contract.

This project is ESM: relative imports end in `.js`, and `__dirname` doesn't exist (use `import.meta.dirname`).
