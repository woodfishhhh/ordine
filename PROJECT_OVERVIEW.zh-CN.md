# Ordine 项目介绍与源码说明

本文档基于当前仓库 `forge-town/ordine` 的 README、内置文档和本地运行验证整理，面向第一次接触该项目的人，帮助快速理解它是什么、怎么跑、代码怎么组织。

## 1. 项目定位

Ordine 是一个 AI-first 的元编排引擎。它要解决的问题是：把代码审查、文档生成、质量检查、自动修复等自动化任务抽象成可组合的工作流，而不是每个场景都重新写一套调度逻辑。

它的核心思路是：

- 用 Object 表示流水线输入，例如文件夹、单个代码文件、GitHub 仓库。
- 用 Operation 表示一个原子任务，例如让 AI agent 检查代码，或执行脚本。
- 用 Pipeline 把多个节点连成 DAG，有依赖的顺序执行，同一层节点可并行执行。
- 用 Job 跟踪一次运行的状态、日志、结果和 trace。
- 用 Skill/Plugin 扩展 AI 能力和领域知识。

当前项目处于 Preview 阶段，README 明确说明 API、数据模型和工作流在 beta 前都可能变化。

## 2. 本机运行方式

当前项目已在这台机器上跑通，目录为：

```text
C:\Users\woodfish\Desktop\ordine
```

依赖：

- Node.js 20+
- Bun
- Docker Desktop
- PostgreSQL，本机用 Docker 容器 `ordine-postgres`

本机使用的数据库连接：

```text
postgresql://postgres:mysecretpassword@localhost:5432/ordine
```

启动顺序：

```powershell
cd C:\Users\woodfish\Desktop\ordine
bun install

Copy-Item apps\app\.env.example apps\app\.env
Copy-Item apps\server\.env.example apps\server\.env

docker run --name ordine-postgres `
  -e POSTGRES_PASSWORD=mysecretpassword `
  -e POSTGRES_DB=ordine `
  -p 5432:5432 `
  -d postgres:16-alpine

cd apps\app
bun run db:push
```

开发服务：

```powershell
# API server
cd C:\Users\woodfish\Desktop\ordine\apps\server
bun run dev

# Web app
cd C:\Users\woodfish\Desktop\ordine\apps\app
bun run dev
```

访问地址：

- Web 应用：http://localhost:9430
- API 服务：http://localhost:9433
- API health：http://localhost:9433/health

本次验证结果：

- `docker info` 可连接 Docker Desktop Server 29.4.1。
- PostgreSQL 容器 `ordine-postgres` 已启动并映射到 `5432`。
- `bun run db:push` 已成功应用数据库 schema。
- `http://localhost:9430/` 返回 HTTP 200。
- `http://localhost:9433/health` 返回 `{"status":"ok"}`。
- `http://localhost:9433/api/jobs` 返回 HTTP 200 和空数组。
- 数据库 public schema 下已有 17 张表。

## 3. 仓库结构

这是一个 Bun + Turborepo monorepo。

```text
apps/
  app/      主 Web 应用，React + Vite + TanStack Router/Start + tRPC
  server/   独立 API 服务，Hono
  docs/     VitePress 文档站点
  cli/      命令行入口
  scripts/  种子数据和维护脚本

packages/
  db/              Drizzle 数据库连接
  db-schema/       PostgreSQL 表结构定义
  models/          DAO 层，封装数据库读写
  services/        业务服务层，组合 DAO 和 pipeline/agent 逻辑
  schemas/         Zod schema 和共享类型
  pipeline-engine/ DAG 调度和节点执行核心
  agent/           Claude、Codex、Mastra 等 agent 适配
  agent-engine/    agent 执行抽象
  plugin/          插件定义和注册机制
  plugins/         内置插件，例如 GitHub project plugin
  ui/              共享 UI 组件
  utils/           文件系统等工具函数
```

根目录还有 `skills/`，里面是 Ordine 自带的一组技能说明文件，例如创建 pipeline、运行 pipeline、管理 job 等。这些技能可作为 AI agent 能力描述，也会出现在项目文档中。

## 4. 核心概念

### Object

Object 是流水线输入。内置类型包括：

- `folder`：一个文件夹树。
- `code-file`：一个单独代码文件。
- `github-project`：一个 GitHub 仓库。

它们通常是 DAG 的起点，读取到的内容会以 `NodeCtx` 的形式向下游节点传递。

### Operation

Operation 是一个原子任务。它由执行器配置和任务描述组成。执行器主要有两类：

- `agent`：调用 Claude、Codex 或其他 agent，根据 prompt/skill 执行。
- `script`：执行脚本命令。

Agent 模式又分为：

- `skill`：引用一个已注册 Skill。
- `prompt`：直接使用 prompt 执行。

### Pipeline

Pipeline 是由节点和边组成的 DAG。常见节点包括：

- `folder`
- `code-file`
- `github-project`
- `operation`
- `output-local-path`
- `compound`

执行时，pipeline engine 会做拓扑排序，把节点分成多个 execution level。同一 level 的节点可并行执行，后续节点接收上游节点输出。

### Job

Job 是一次运行记录，保存：

- 状态：`queued`、`running`、`done`、`failed` 等。
- 关联 pipeline。
- 日志和 trace。
- 结构化结果。
- 开始和结束时间。

Web UI 的 Jobs 页面和 API `/api/jobs` 都围绕这些数据工作。

### Skill 和 Plugin

Skill 是 agent 可使用的能力说明，例如代码审查、创建 pipeline、运行 pipeline。Plugin 用来扩展领域能力，比如内置的代码质量相关实体、操作和规则。

## 5. 后端数据流

项目的后端分层比较清楚：

```text
API / tRPC router
  -> services
    -> models / DAO
      -> db-schema
        -> PostgreSQL
```

关键路径：

- `packages/db/src/db.ts` 创建 Drizzle 数据库连接。
- `packages/db-schema/src/tables/` 定义表结构。
- `packages/models/src/daos/` 封装具体表的增删改查。
- `packages/services/src/` 组合 DAO，形成业务能力。
- `apps/app/src/integrations/trpc/routers/` 提供 Web 应用内的 tRPC API。
- `apps/server/src/routes/` 提供独立 REST API。

本次为了让项目跑通，修复了 `apps/app` 和 `apps/server` 对 service 层的初始化方式：当前 service 层导出的是 `createXxxService(db)` 函数，而不是 `serviceFactory` 对象，所以入口侧需要显式传入 `db`。

## 6. Pipeline 执行流

Pipeline 执行大致分为几步：

1. UI 或 API 调用运行接口，例如 pipeline 的 run action。
2. `pipelineRunnerService.startRun()` 创建 Job。
3. `pipelineRunExecutor.run()` 调用 pipeline engine。
4. engine 按 DAG level 执行节点。
5. Object 节点读取输入内容。
6. Operation 节点调用 agent 或 script executor。
7. Output 节点写出结果。
8. Job trace 和 agent span 写入数据库，供 Jobs 页面查看。

这个设计让 Ordine 不只服务代码质量，也可以迁移到其他自动化场景：只要定义新的对象、操作、插件或技能，就能复用同一套 DAG 调度和 Job 追踪机制。

## 7. 前端功能入口

主应用在 `apps/app`，页面路由主要在：

```text
apps/app/src/routes/
apps/app/src/pages/
apps/app/src/integrations/trpc/
```

重要页面包括：

- Pipelines：管理和运行流水线。
- Canvas：可视化编辑 pipeline DAG。
- Operations：创建和编辑原子操作。
- Jobs：查看运行记录、日志和 trace。
- Skills：管理 agent 技能。
- Rules：规则配置。
- Best Practices：代码质量插件相关知识库。
- Settings：配置默认 agent、模型、API key、输出路径等。

## 8. API 概览

独立 Hono server 挂载的主要 REST 路由：

```text
/api/best-practices
/api/checklist-items
/api/code-snippets
/api/distillations
/api/filesystem
/api/jobs
/api/operations
/api/pipelines
/api/recipes
/api/rules
/api/skills
/health
```

Web app 内部还使用 tRPC router，覆盖 jobs、operations、pipelines、settings、rules、skills、recipes、distillations、filesystem 等模块。

## 9. 本次本地修复记录

为了让当前仓库在本机可构建、可启动，做了这些最小修复：

- `apps/app/src/integrations/trpc/services.ts`：改为从 `@repo/db` 引入 `db`，并用 `createXxxService(db)` 初始化 service。
- `apps/server/src/services.ts`：同样修复 server 侧 service 初始化。
- `packages/agent/src/claude/runClaude.ts`：补充子进程 stdio null 保护，并调整为符合 lint 的 `const` 风格。
- `packages/services/src/refinementsService/createRefinementsService.ts`：把 distillation 的 `mode/status` 改成 schema 允许的 `pipeline/draft`。
- `packages/services/src/settingsService/createSettingsService.unit.test.ts`：修复未定义的 `mockDb`。

验证命令：

```powershell
bun run check-types
bun run build
```

这两项均已通过。`bun run lint -- -- --threads=1` 目前仍会在 `packages/services` 暴露多处仓库既有风格问题，例如 `no-let` 和函数表达式规则。这些问题不阻塞本次启动，但如果要把仓库质量门禁完全跑绿，需要单独做一轮 services 层 lint 清理。

## 10. 注意事项

- README 使用 `bun dev` 作为总入口，但单独启动 `apps/server` 和 `apps/app` 更容易定位问题。
- `.env` 文件不应提交，当前只是本地运行配置。
- `LLM_API_KEY` 为空时，基础页面和 CRUD/API 能跑；真正执行 AI agent 类 operation 时需要配置可用 key。
- Docker Desktop 如果报 Hyper-V `无效命名空间`，可以优先检查 `%APPDATA%\Docker\settings-store.json` 里的 `WslEngineEnabled` 是否为 `true`。本机这次就是从 Hyper-V 后端切回 WSL2 后端后恢复。
- 项目当前处于 Preview，数据结构和 API 仍可能变化，后续更新仓库后建议重新跑 `bun run check-types` 和 `bun run build`。
