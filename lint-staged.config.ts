import type { Configuration } from "lint-staged";

const config: Configuration = {
  "*.{ts,json}": "eslint --fix",
  "*.{ts,md,yml,yaml}": "prettier --write",
};

export default config;
