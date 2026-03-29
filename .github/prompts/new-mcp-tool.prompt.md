Add a new tool to tools/mcp-ffmpeg/index.js: $TOOL_NAME

Rules:
- Tool must use fluent-ffmpeg (never spawn)
- Input validated with Zod
- Output paths relative to AUDIO_DATA_PATH env
- Include error handling with descriptive messages
- Add JSDoc comment with input/output description

Output: updated tool definition + handler function.