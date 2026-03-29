Review the following code against project conventions:

Check for:
- Angular: signals used correctly, no NgModules, inject() used, new control flow
- Node.js: async/await only, Zod validation present, AppError used
- ffmpeg: goes through BullMQ queue, fluent-ffmpeg used
- Tests: spec file exists, covers happy path + error cases
- No anti-patterns from copilot-instructions.md

Output: list of issues with line references + suggested fixes.