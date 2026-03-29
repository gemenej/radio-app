export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "shell",
        "mix-editor",
        "catalog",
        "radio-player",
        "mix-service",
        "catalog-service",
        "streaming-service",
        "auth-service",
        "mcp-ffmpeg",
        "shared",
        "ci",
        "deps",
      ],
    ],
  },
};
