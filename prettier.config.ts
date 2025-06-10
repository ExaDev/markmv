import type { Config } from 'prettier';

const config: Config = {
  plugins: ['prettier-plugin-jsdoc'],
  singleQuote: true,
  trailingComma: 'es5',
  semi: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',
  // JSDoc plugin options
  jsdocSeparateReturnsFromParam: true,
  jsdocSeparateTagGroups: true,
  jsdocPreferCodeFences: true,
};

export default config;