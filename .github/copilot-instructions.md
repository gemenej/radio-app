# Radio Streaming App — GitHub Copilot Instructions
# Model: claude-sonnet-4 (default) | claude-opus-4 (for architecture decisions)

---

## 🎯 Project overview

A web radio streaming platform with three microfrontends:
- **Mix Editor** — multi-track audio mixer with timeline editing
- **Track Catalog** — hierarchical genre/artist/album/song browser
- **Radio Player** — online streaming and on-demand mix playback

---

## 🏗️ Architecture

### Monorepo structure (Nx)
```
radio-app/
├── .github/
│   └── copilot-instructions.md        ← YOU ARE HERE
├── .vscode/
│   ├── mcp.json                       ← MCP servers config
│   └── settings.json
├── apps/
│   ├── shell/                         ← Angular host (Module Federation)
│   ├── mix-editor/                    ← MF remote: mixer UI
│   ├── catalog/                       ← MF remote: track browser
│   └── radio-player/                  ← MF remote: streaming player
├── services/
│   ├── mix-service/                   ← ffmpeg processing + DASH output
│   ├── catalog-service/               ← track/mix metadata CRUD
│   ├── streaming-service/             ← DASH segment delivery
│   └── auth-service/                  ← JWT, users, roles
├── tools/
│   ├── mcp-ffmpeg/                    ← custom MCP server for audio tools
│   └── shared-schemas/                ← shared TypeScript interfaces
└── data/                              ← JSON flat-file storage (phase 1)
    ├── tracks/
    ├── mixes/
    └── catalog/
```

### Microfrontend rules (Module Federation)
- Each `apps/*` is an independent Angular app and a Module Federation remote
- Shell app (`apps/shell`) is the host — loads remotes at runtime via `remoteEntry.js`
- Remotes expose exactly ONE Angular module: `MixEditorModule`, `CatalogModule`, `RadioPlayerModule`
- Shared singletons (declared in `webpack.config.js` `shared`): `@angular/core`, `@angular/router`, `@angular/common`
- **No direct imports between remote apps** — communicate via shared state service in shell or custom events
- Each remote has its own route prefix: `/editor`, `/catalog`, `/player`

### Microservice rules
- Each service in `services/*` is a standalone Node.js app (Fastify preferred over Express)
- Services communicate via REST (phase 1) → message queue (phase 2)
- Every service owns its own data: no shared databases between services
- Port assignments: mix-service:3001, catalog-service:3002, streaming-service:3003, auth-service:3004
- All routes prefixed with `/api/v1/`
- Health check endpoint required: `GET /health` → `{ status: "ok", service: "<name>", ts: <unix> }`

---

## 🖥️ Frontend stack

### Angular conventions
- **Angular version**: 18+ (use standalone components everywhere — NO NgModules for new code)
- **Reactivity**: Signals-based state (`signal()`, `computed()`, `effect()`) — avoid RxJS Subject for simple state
- **RxJS**: Keep for HTTP streams, WebSocket, and complex async sequences only
- **Component style**: OnPush change detection on all components
- **Templates**: Use `@if`, `@for`, `@switch` (new control flow) — never `*ngIf`, `*ngFor`
- **Dependency injection**: `inject()` function — never constructor injection for new code
- **Forms**: Reactive forms only — never template-driven
- **Routing**: Lazy-loaded routes with `loadComponent()` for standalone

### Angular file naming
```
feature-name/
├── feature-name.component.ts       ← logic
├── feature-name.component.html     ← template
├── feature-name.component.scss     ← styles (scoped)
├── feature-name.service.ts         ← data/business logic
├── feature-name.model.ts           ← interfaces/types
└── feature-name.routes.ts          ← route definitions
```

### Styling
- SCSS with BEM naming: `.block__element--modifier`
- CSS custom properties for design tokens (colors, spacing, typography)
- No inline styles except for dynamic values (e.g., waveform widths)
- Responsive: mobile-first, breakpoints at 768px and 1200px

### Audio libraries (frontend)
- **Wavesurfer.js** + `wavesurfer-multitrack` — waveform display and multi-track timeline
- **Tone.js** — fade in/out, volume control, Web Audio API abstraction
- **dash.js** — DASH/MPD playback in Radio Player
- Import these as lazy-loaded chunks — do NOT include in main bundle

---

## ⚙️ Backend stack

### Node.js conventions
- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify (not Express) — use `@fastify/cors`, `@fastify/jwt`, `@fastify/multipart`
- **Async**: `async/await` everywhere — never callbacks, never `.then().catch()` chains
- **Error handling**: Always use structured errors:
```typescript
// CORRECT
throw new AppError('TRACK_NOT_FOUND', `Track ${id} does not exist`, 404);

// WRONG
throw new Error('not found');
```
- **Validation**: Zod schemas for all request/response bodies — define schema BEFORE writing handler
- **Logging**: Pino logger (built into Fastify) — always log at correct level (info/warn/error)
- **Environment**: All config via `process.env` — use `dotenv` locally, never hardcode values

### Service file structure
```
services/mix-service/
├── src/
│   ├── routes/          ← Fastify route handlers
│   ├── services/        ← business logic (no HTTP knowledge)
│   ├── workers/         ← BullMQ job processors
│   ├── schemas/         ← Zod validation schemas
│   ├── errors/          ← AppError classes
│   └── index.ts         ← Fastify app bootstrap
├── package.json
├── tsconfig.json
└── Dockerfile
```

### ffmpeg processing rules
- Use `fluent-ffmpeg` wrapper — never spawn raw ffmpeg process
- All ffmpeg jobs go through **BullMQ queue** named `audio-processing`
- Job types: `CREATE_DASH_MIX`, `APPLY_FADE`, `NORMALIZE`, `ANALYZE`
- Always set timeout: 5 minutes max per job
- Output DASH profile: baseline, 2-second segments, H.264 video passthrough if any
- MPD manifest location: `data/mixes/<mixId>/manifest.mpd`
- Segments location: `data/mixes/<mixId>/segments/`

### ffmpeg filter examples (use these patterns)
```bash
# Fade in 3s at start, fade out 3s at end of 60s track
-af "afade=t=in:st=0:d=3,afade=t=out:st=57:d=3"

# Normalize loudness (EBU R128)
-af "loudnorm=I=-16:TP=-1.5:LRA=11"

# Overlay two tracks (mix)
-filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=3[aout]" -map "[aout]"

# DASH output
-f dash -seg_duration 2 -use_template 1 -use_timeline 1 manifest.mpd
```

---

## 📁 Data layer (Phase 1 — JSON files)

### File locations
```
data/
├── catalog/
│   ├── genres.json          ← genre tree root
│   └── genres/<id>.json     ← genre node with artists[]
├── tracks/
│   └── <trackId>.json       ← track metadata + file path
├── mixes/
│   └── <mixId>/
│       ├── meta.json         ← mix metadata
│       ├── manifest.mpd      ← DASH manifest (generated)
│       └── segments/         ← DASH segments (generated)
└── users/
    └── <userId>.json
```

### Track schema (TypeScript — in `tools/shared-schemas/`)
```typescript
interface Track {
  id: string;               // nanoid(10)
  title: string;
  artist: string;
  album?: string;
  genre: string;            // genre id
  duration: number;         // seconds
  filePath: string;         // relative to data/
  waveformData?: number[];  // normalized 0-1, 200 points
  bpm?: number;
  key?: string;
  addedAt: string;          // ISO 8601
  tags: string[];
}
```

### Mix schema
```typescript
interface Mix {
  id: string;
  title: string;
  createdBy: string;        // userId
  tracks: MixTrack[];
  totalDuration: number;
  status: 'draft' | 'processing' | 'ready' | 'error';
  manifestPath?: string;
  createdAt: string;
  updatedAt: string;
}

interface MixTrack {
  trackId: string;
  startAt: number;          // seconds offset in the mix timeline
  trimStart: number;        // seconds from track beginning
  trimEnd: number;          // seconds from track beginning
  volume: number;           // 0.0 - 1.0
  fadeIn: number;           // seconds
  fadeOut: number;          // seconds
}
```

### Catalog tree schema
```typescript
interface Genre {
  id: string;
  name: string;
  artists: Artist[];
}
interface Artist {
  id: string;
  name: string;
  albums: Album[];
}
interface Album {
  id: string;
  title: string;
  year: number;
  tracks: string[];         // track ids
}
```

---

## 🔌 MCP servers (Copilot agent tools)

MCP config lives in `.vscode/mcp.json`. Available tools for agent mode:

| Server | Tool | Purpose |
|---|---|---|
| `mcp-ffmpeg` | `analyze_audio` | Get duration, bitrate, codec, BPM estimate |
| `mcp-ffmpeg` | `create_dash_mix` | Process MixTrack[] → DASH/MPD |
| `mcp-ffmpeg` | `apply_fade` | Apply fade in/out to a segment |
| `mcp-ffmpeg` | `normalize_volume` | EBU R128 loudness normalization |
| `mcp-ffmpeg` | `generate_waveform` | Extract waveform data (200 points) |
| `server-filesystem` | `read_file`, `write_file` | JSON data store operations |
| `server-git` | `git_diff`, `git_log` | Code review context |

When writing code that calls ffmpeg, prefer asking the `mcp-ffmpeg` MCP tool to validate the filter chain before generating the final command.

---

## 🧪 Testing conventions

- **Unit tests**: Vitest for services, Jest for Angular (via `@angular-builders/jest`)
- **E2E**: Playwright — test files in `e2e/` at repo root
- **Test file naming**: `*.spec.ts` alongside source files
- **Coverage target**: 80% for service layer, 60% for components
- Every new service function must have a corresponding `*.spec.ts`
- Mock ffmpeg in tests — never run real ffmpeg in unit tests

```typescript
// Test structure pattern
describe('MixService', () => {
  describe('createMix', () => {
    it('should queue a DASH processing job when tracks are provided', async () => { ... });
    it('should throw VALIDATION_ERROR when tracks array is empty', async () => { ... });
    it('should save mix with status "processing" before job completes', async () => { ... });
  });
});
```

---

## 🚀 CI/CD

- **GitHub Actions** workflow: lint → test → build → docker build → deploy
- **Docker**: each service has its own `Dockerfile` (multi-stage build)
- **Docker Compose**: `docker-compose.yml` at root for local dev (all services + nginx gateway)
- **Nx affected**: CI runs only affected apps/services on PR (`nx affected --target=test`)
- Commit message format: `type(scope): description` — types: feat/fix/chore/docs/refactor/test

---

## 🤖 How to use Copilot agent effectively on this project

### For new features — prompt pattern:
```
Generate a [Angular component | Fastify route | BullMQ worker] for [feature].
Follow the project conventions in copilot-instructions.md.
Use the mcp-ffmpeg tool to validate any ffmpeg commands.
Output: [file path(s)] with full implementation.
```

### For debugging:
```
Analyze the error in [service/component].
Check the MixTrack schema in shared-schemas.
Suggest a fix that follows our error handling conventions.
```

### Model selection guide:
- **claude-sonnet-4** (default): component generation, route handlers, schema definitions, bug fixes, refactoring
- **claude-opus-4** (switch manually): architecture decisions, complex ffmpeg filter chains, Module Federation config, performance optimization

### Avoid asking Copilot to:
- Install packages without your confirmation
- Modify `webpack.config.js` (Module Federation) without explicit instruction
- Change shared schemas without reviewing impact across services
- Run ffmpeg commands directly — always go through BullMQ queue

---

## ⛔ Anti-patterns — never do these

```typescript
// ❌ NgModules for new code
@NgModule({ declarations: [MyComponent] })

// ❌ Constructor injection
constructor(private service: MyService) {}

// ❌ *ngIf / *ngFor
<div *ngIf="show">

// ❌ Callbacks in Node.js
fs.readFile(path, (err, data) => { ... })

// ❌ Raw ffmpeg spawn
import { spawn } from 'child_process';
spawn('ffmpeg', [...args])

// ❌ Shared DB between services
// mix-service connecting to catalog-service's data store

// ❌ Hardcoded config
const PORT = 3001; // should be process.env.PORT

// ❌ Inter-remote Angular imports
// mix-editor importing from catalog app directly
```

---

## ✅ Quick reference — correct patterns

```typescript
// ✅ Standalone component
@Component({ standalone: true, imports: [...] })

// ✅ Signal-based state
readonly tracks = signal<Track[]>([]);
readonly totalDuration = computed(() => this.tracks().reduce(...));

// ✅ New control flow
@if (isLoading()) { <app-spinner /> } @else { <app-track-list /> }

// ✅ inject() function
private readonly mixService = inject(MixService);

// ✅ Structured error
throw new AppError('MIX_NOT_FOUND', `Mix ${id} not found`, 404);

// ✅ Zod schema first
const CreateMixSchema = z.object({
  title: z.string().min(1).max(100),
  tracks: z.array(MixTrackSchema).min(1).max(20),
});

// ✅ ffmpeg via fluent-ffmpeg in BullMQ worker
await mixProcessingQueue.add('CREATE_DASH_MIX', { mixId, tracks });
```