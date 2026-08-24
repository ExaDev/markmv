import type { Configuration } from "lint-staged";

const config: Configuration = {
  "*.ts": "eslint --fix",
  "*.{ts,md,json,yml,yaml}": "prettier --write",
};

export default config;
