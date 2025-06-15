## [1.21.0](https://github.com/ExaDev/markmv/compare/v1.20.3...v1.21.0) (2025-06-15)

### Features

* add CLI flags for index command directory scoping ([b97df0c](https://github.com/ExaDev/markmv/commit/b97df0c57c8436c468e1a664ee77574667ac4e10)), closes [#12](https://github.com/ExaDev/markmv/issues/12)
* add directory scoping options to index command ([98fafdd](https://github.com/ExaDev/markmv/commit/98fafdd0ef112e4ceab40612a587eb56083e68ac)), closes [#12](https://github.com/ExaDev/markmv/issues/12)
* split publishing into separate independent steps ([639b730](https://github.com/ExaDev/markmv/commit/639b7305f3be9b53d7ff3db984fbbf1ad8e79b15))

### Styles

* auto-fix linting issues ([28e307a](https://github.com/ExaDev/markmv/commit/28e307ae5cdd25c59f9af734111efd3b463f9b6b))

### Chores

* trigger CI to verify clean build after auto-fixes ([dd6ed3b](https://github.com/ExaDev/markmv/commit/dd6ed3b5c17c6d0692ec87d956927b0798c3a16b))

## [1.20.3](https://github.com/ExaDev/markmv/compare/v1.20.2...v1.20.3) (2025-06-12)

### Bug Fixes

* remove Node 18.x from CI matrix due to semantic-release compatibility ([200f540](https://github.com/ExaDev/markmv/commit/200f540a130b837ad0a8e4fa725c8be42c3d866f))
* switch from GitHub App token to GITHUB_TOKEN for npm packages ([029d64a](https://github.com/ExaDev/markmv/commit/029d64ad5268955506fd66be80ead89ccc640002))
* switch to user-scoped package for GitHub Packages publishing ([ce366a8](https://github.com/ExaDev/markmv/commit/ce366a8659e33b052689a7e74f96155fa1927b5e))

## [1.20.2](https://github.com/ExaDev/markmv/compare/v1.20.1...v1.20.2) (2025-06-12)

### Bug Fixes

* use correct GitHub organization case for scoped package ([f7b6d06](https://github.com/ExaDev/markmv/commit/f7b6d0634fef59dbefaa04fdffed9fdf3e521666))

## [1.20.1](https://github.com/ExaDev/markmv/compare/v1.20.0...v1.20.1) (2025-06-12)

### Tests

* retrigger CI after GitHub App packages permission update ([da7c2b8](https://github.com/ExaDev/markmv/commit/da7c2b8e9f4d88ffb4237b920453ef2a82991df4))

## [1.20.0](https://github.com/ExaDev/markmv/compare/v1.19.8...v1.20.0) (2025-06-12)

### Features

* use GitHub App token for GitHub Packages authentication ([5bd26b0](https://github.com/ExaDev/markmv/commit/5bd26b0c672d247057f5671950f70f91b02f53b1))

## [1.19.8](https://github.com/ExaDev/markmv/compare/v1.19.7...v1.19.8) (2025-06-12)

### Bug Fixes

* use correct GitHub organization case for scoped package ([26a8002](https://github.com/ExaDev/markmv/commit/26a80020ba24dadafce129373e4430d43b7156f4))

## [1.19.7](https://github.com/ExaDev/markmv/compare/v1.19.6...v1.19.7) (2025-06-12)

### Bug Fixes

* copy .npmrc to dist-github for GitHub Packages authentication ([5888156](https://github.com/ExaDev/markmv/commit/588815630610a8c9e91633d2635416d795c82c78))

## [1.19.6](https://github.com/ExaDev/markmv/compare/v1.19.5...v1.19.6) (2025-06-12)

### Tests

* verify GitHub Packages publishing with updated permissions ([91f891a](https://github.com/ExaDev/markmv/commit/91f891ac045c7ef18b1deceb429a06d2eb878703))

## [1.19.5](https://github.com/ExaDev/markmv/compare/v1.19.4...v1.19.5) (2025-06-12)

### Bug Fixes

* correct GitHub Packages publishing command syntax ([8f444b4](https://github.com/ExaDev/markmv/commit/8f444b42279c1b71a04cba4f795b150155591d25))

## [1.19.4](https://github.com/ExaDev/markmv/compare/v1.19.3...v1.19.4) (2025-06-12)

### Bug Fixes

* improve GitHub Packages publishing with fallback strategy ([c3ce0aa](https://github.com/ExaDev/markmv/commit/c3ce0aa9e6240bb251587e6759382c9c4541ed25))

## [1.19.3](https://github.com/ExaDev/markmv/compare/v1.19.2...v1.19.3) (2025-06-12)

### Bug Fixes

* improve GitHub Packages binary file copying and validation ([77b8ab2](https://github.com/ExaDev/markmv/commit/77b8ab2efca020d5bc1ac1f777972d43d05b0dd5))

## [1.19.2](https://github.com/ExaDev/markmv/compare/v1.19.1...v1.19.2) (2025-06-12)

### Bug Fixes

* remove prepublishOnly script from GitHub Packages publishing ([5f918d0](https://github.com/ExaDev/markmv/commit/5f918d0effa3c29b9450c895ee91f177765793a6))

## [1.19.1](https://github.com/ExaDev/markmv/compare/v1.19.0...v1.19.1) (2025-06-12)

### Bug Fixes

* correct parallel publishing configuration for GitHub Packages ([b44817b](https://github.com/ExaDev/markmv/commit/b44817b433a45f2fe3a70ec787de125605077091))

### Continuous Integration

* use legacy peer deps to resolve npm-multiple plugin conflicts ([640e4c6](https://github.com/ExaDev/markmv/commit/640e4c6fd15efb69ccb7243c15b6a6539662d5b8))

## [1.19.0](https://github.com/ExaDev/markmv/compare/v1.18.1...v1.19.0) (2025-06-12)

### Features

* add parallel publishing to GitHub Packages ([d2585f0](https://github.com/ExaDev/markmv/commit/d2585f084a604d0ae10fb030666664e9914d1622))

## [1.18.1](https://github.com/ExaDev/markmv/compare/v1.18.0...v1.18.1) (2025-06-12)

### Continuous Integration

* configure NPM attestations and SBOM publishing ([b61e170](https://github.com/ExaDev/markmv/commit/b61e170663b85fe70d0d79cd5d676f82495d8f75))

## [1.18.0](https://github.com/ExaDev/markmv/compare/v1.17.3...v1.18.0) (2025-06-12)

### Features

* include README and badges directly in release commit ([0e26003](https://github.com/ExaDev/markmv/commit/0e260031527f44706e1530d3c2f14d44a9dfd3c8))

### Documentation

* update README and coverage badges for release ([7f7f079](https://github.com/ExaDev/markmv/commit/7f7f079f3d964d862e03cf468c70e8049eabf49b))

## [1.17.3](https://github.com/ExaDev/markmv/compare/v1.17.2...v1.17.3) (2025-06-12)

### Bug Fixes

* use fetch and merge instead of pull with rebase for README updates ([8bb1fb1](https://github.com/ExaDev/markmv/commit/8bb1fb1be546220231d55506ec6cdad5949ade5e))

## [1.17.2](https://github.com/ExaDev/markmv/compare/v1.17.1...v1.17.2) (2025-06-12)

### Bug Fixes

* use follow-up commit instead of amending release commit ([8644eb7](https://github.com/ExaDev/markmv/commit/8644eb7dbbdcd6176b8867dabeb341fa6afce9ca))

## [1.17.1](https://github.com/ExaDev/markmv/compare/v1.17.0...v1.17.1) (2025-06-12)

### Continuous Integration

* consolidate README and badge updates into release commit ([d81b7c6](https://github.com/ExaDev/markmv/commit/d81b7c6382bdcd487c7ba0f28a0de201256d82a0))

## [1.17.0](https://github.com/ExaDev/markmv/compare/v1.16.0...v1.17.0) (2025-06-12)

### Features

* enhance convert command CLI help with examples and format descriptions ([3c7fc34](https://github.com/ExaDev/markmv/commit/3c7fc34354d3ba6d22461197e49d8ef69a3d262e))

### Bug Fixes

* replace any types with proper type annotations in tests ([a05576e](https://github.com/ExaDev/markmv/commit/a05576ec25ce2e7b712320056d1e92f0025a69ae))

### Documentation

* add comprehensive convert command documentation and examples ([5106927](https://github.com/ExaDev/markmv/commit/51069272c5290105d04841a8f074975e02c7d863))
* auto-generate README from TypeScript documentation ([53bd46d](https://github.com/ExaDev/markmv/commit/53bd46dc7b4fe858abbbeec27b49e95a5d7e226b))

### Continuous Integration

* update coverage badges ([1e8aa63](https://github.com/ExaDev/markmv/commit/1e8aa633ecf670a81f4fbefa5ce1cb982b1ccfb1))

## [1.16.0](https://github.com/ExaDev/markmv/compare/v1.15.0...v1.16.0) (2025-06-12)

### Features

* add convert command for link format conversion ([c76e3bf](https://github.com/ExaDev/markmv/commit/c76e3bf9a7aad25a0dbf3d3212e82d1a92622487)), closes [#10](https://github.com/ExaDev/markmv/issues/10)
* add types for link format conversion functionality ([683d264](https://github.com/ExaDev/markmv/commit/683d264c297699f594e607e3b24214bba77f5ab6)), closes [#10](https://github.com/ExaDev/markmv/issues/10) [#10](https://github.com/ExaDev/markmv/issues/10)
* export convert functionality for programmatic use ([149535d](https://github.com/ExaDev/markmv/commit/149535d0b926dc1e8bc156253752f10f4fe2c6cd)), closes [#10](https://github.com/ExaDev/markmv/issues/10)
* implement LinkConverter core class for format conversion ([8ff5321](https://github.com/ExaDev/markmv/commit/8ff53213d4453b1521a943a259e33d88487893d6)), closes [#10](https://github.com/ExaDev/markmv/issues/10)
* integrate convert command into CLI interface ([12bcfbc](https://github.com/ExaDev/markmv/commit/12bcfbc47fbcd3b2ec3d95ab679f0a446cc0fc5b)), closes [#10](https://github.com/ExaDev/markmv/issues/10)

### Bug Fixes

* remove unused error variable in test catch blocks ([5cc7331](https://github.com/ExaDev/markmv/commit/5cc7331e9b17cd61c538c9e64775570ea36d9e0c))
* resolve linting errors in convert functionality ([ae2085d](https://github.com/ExaDev/markmv/commit/ae2085de82f45a0ca9f17be4b361b7b211380696)), closes [#10](https://github.com/ExaDev/markmv/issues/10)
* resolve test failures in convert command tests ([c17da04](https://github.com/ExaDev/markmv/commit/c17da046722fbb00cbd96bffb736b0c6854c380e)), closes [#10](https://github.com/ExaDev/markmv/issues/10)

### Documentation

* auto-generate README from TypeScript documentation ([be30fe0](https://github.com/ExaDev/markmv/commit/be30fe0fbe5d054af5df4d173f0f684e87aad768))

### Styles

* auto-fix linting issues ([859084a](https://github.com/ExaDev/markmv/commit/859084aa277ab7ddaac747b4f09fe4ef7a43cfe1))

### Tests

* add comprehensive tests for convert command ([588b3bc](https://github.com/ExaDev/markmv/commit/588b3bc41842233f499796d4226aa6b232681e30)), closes [#10](https://github.com/ExaDev/markmv/issues/10)

### Continuous Integration

* update coverage badges ([a22ba20](https://github.com/ExaDev/markmv/commit/a22ba208f2d4795b1e93aeff7a865ab3a70cbefe))

## [1.15.0](https://github.com/ExaDev/markmv/compare/v1.14.0...v1.15.0) (2025-06-11)

### Features

* add API documentation extraction script ([7442f93](https://github.com/ExaDev/markmv/commit/7442f93feb55e8a4ed70db1372750a688b02da3d))
* add automatic README generation to CI pipeline ([8805859](https://github.com/ExaDev/markmv/commit/8805859fac0e9bac9d0b82c0c18c453158779627))
* add complete README generation script ([af97cd5](https://github.com/ExaDev/markmv/commit/af97cd5eca236aabb771d76bdf36d69796405a02))
* add TypeDoc markdown configuration ([b4d3b37](https://github.com/ExaDev/markmv/commit/b4d3b37ae236e146cc9a7e68bd891450373a6142))
* add typedoc-plugin-markdown for README generation ([c888681](https://github.com/ExaDev/markmv/commit/c888681ec4263c6391fed2caad35d8528bb153c5))

### Bug Fixes

* resolve README generation and badge update conflicts ([8e034da](https://github.com/ExaDev/markmv/commit/8e034dad189f92db286c42e7649e1fbd58560d18))

### Documentation

* auto-generate README from TypeScript documentation ([5a58237](https://github.com/ExaDev/markmv/commit/5a582379940aabdd8f1c2df755aae57c745a32c1))
* update README with generated content from TypeScript ([6ce1aca](https://github.com/ExaDev/markmv/commit/6ce1acaa55f3f0b0d36ca7d15e2ccc6338978aae))

### Continuous Integration

* update coverage badges ([10d5bec](https://github.com/ExaDev/markmv/commit/10d5bec1360ecb3fe59808f82ac2168e2dde4815))

### Chores

* ignore generated markdown documentation ([1fcb780](https://github.com/ExaDev/markmv/commit/1fcb780e19328b6b2cf44138bd5b6ee49fb4f06f))

## [1.14.0](https://github.com/ExaDev/markmv/compare/v1.13.2...v1.14.0) (2025-06-11)

### Features

* enforce strict TypeScript type safety rules ([19bb510](https://github.com/ExaDev/markmv/commit/19bb51042543dc0196d2cde76cad1fe6b530226a))

### Bug Fixes

* allow test file warnings in CI linting ([7b2ccc5](https://github.com/ExaDev/markmv/commit/7b2ccc5f87a6e7b51d387da86e52c61811fadfd2))
* eliminate all any types and type assertions from production code ([6195794](https://github.com/ExaDev/markmv/commit/61957942d9e99cd689f1c98f5f4a324ce074673b))

### Styles

* auto-fix linting issues ([17d9646](https://github.com/ExaDev/markmv/commit/17d96462de91e964e0df8877804396607c2bfd0c))

### Continuous Integration

* update coverage badges ([aabfe6c](https://github.com/ExaDev/markmv/commit/aabfe6c718f10fcac38b690cc110cd00397bffe7))

## [1.13.2](https://github.com/ExaDev/markmv/compare/v1.13.1...v1.13.2) (2025-06-10)

### Bug Fixes

* disable treatWarningsAsErrors in TypeDoc config ([4f52a46](https://github.com/ExaDev/markmv/commit/4f52a4691e2cb8be93b0b45b919d8a29d6477e95))

### Continuous Integration

* update coverage badges ([dc5b8aa](https://github.com/ExaDev/markmv/commit/dc5b8aab18055e20cf74e01ec4bc5c6514158a0b))

## [1.13.1](https://github.com/ExaDev/markmv/compare/v1.13.0...v1.13.1) (2025-06-10)

### Bug Fixes

* remove unnecessary permissions from update-badges job ([7710b33](https://github.com/ExaDev/markmv/commit/7710b33ca477e0c5db87970ea7c4609aebe3da5e))

### Continuous Integration

* update coverage badges ([e2c9f41](https://github.com/ExaDev/markmv/commit/e2c9f4121b9ed2f10c6be7d97960b8d00d751009))

### Reverts

* simplify badge updates to direct push after branch protection removal ([aa3bd3d](https://github.com/ExaDev/markmv/commit/aa3bd3dfce256cd962f379a1927f33ddd3082db4))

## [1.13.0](https://github.com/ExaDev/markmv/compare/v1.12.1...v1.13.0) (2025-06-10)

### Features

* add graceful handling for branch protection in badge updates ([e680eac](https://github.com/ExaDev/markmv/commit/e680eacdc6c119b1185cdaf7b71cb941357cff26))
* consolidate CI/CD into single workflow pipeline ([8bd3930](https://github.com/ExaDev/markmv/commit/8bd39308e67f70f4a162b25741310ab89a4658b4))
* reorder pipeline to build docs after version updates ([2b8b107](https://github.com/ExaDev/markmv/commit/2b8b10793a15827ac333a0d6be04cd48f344c3ac))

### Bug Fixes

* resolve documentation coverage JSON parsing in CI ([7d3eb66](https://github.com/ExaDev/markmv/commit/7d3eb66a93ebf7f96a33cd915d8bfd27b3943173))
* resolve YAML syntax error in consolidated workflow ([d467976](https://github.com/ExaDev/markmv/commit/d467976feb566eca4ad38f46dda2f97c74e966dd))

## [1.12.1](https://github.com/ExaDev/markmv/compare/v1.12.0...v1.12.1) (2025-06-10)

### Bug Fixes

* implement proper TypeScript configuration support ([244bd4e](https://github.com/ExaDev/markmv/commit/244bd4e8543666e3b7e142a7fa813e6006014853))
* resolve JSON output format for docs coverage CI ([7489094](https://github.com/ExaDev/markmv/commit/74890940b6d633729ac93fa323712dc1d12baa33))

## [1.12.0](https://github.com/ExaDev/markmv/compare/v1.11.0...v1.12.0) (2025-06-10)

### Features

* add Dependabot configuration for automated dependency updates ([b5e98de](https://github.com/ExaDev/markmv/commit/b5e98de797e84158865aa809fb4c1fc0819f3d6c))
* add dynamic coverage badge updates via CI ([7c6d8c5](https://github.com/ExaDev/markmv/commit/7c6d8c5fea91a5defa44deffc41aa63ea1a6afd2))

### Bug Fixes

* ensure docs build after coverage badges update ([5f135a9](https://github.com/ExaDev/markmv/commit/5f135a94ef507c6e56283ae69e82b8fb054bc94f))

### Documentation

* add static coverage badges for commit 1e91f84 ([3c1a066](https://github.com/ExaDev/markmv/commit/3c1a066723dbeae81d329987ad00e952fa7959ed))

## [1.11.0](https://github.com/ExaDev/markmv/compare/v1.10.0...v1.11.0) (2025-06-10)

### Features

* add ESLint and Prettier configuration with JSDoc support ([63737d5](https://github.com/ExaDev/markmv/commit/63737d5cdd376aedc55796e43c6acd35baf1973c))
* implement TypeScript configuration for ESLint and Prettier ([1e91f84](https://github.com/ExaDev/markmv/commit/1e91f84329f2362f76ff705366b84000ccbcdaf0))
* remove biome configuration and dependencies ([ae22bb6](https://github.com/ExaDev/markmv/commit/ae22bb6cf869f10adfbf76840049d43bf39ed521))

### Bug Fixes

* rename eslint config to .mjs for ES module compatibility ([afe1dc6](https://github.com/ExaDev/markmv/commit/afe1dc604661b0c17552ef433571e3b89c85cd52))

### Documentation

* add comprehensive TypeDoc documentation to command interfaces ([557c157](https://github.com/ExaDev/markmv/commit/557c157926f77ce32b6c0732397b584d9a97a5c1))
* add comprehensive TypeDoc documentation to strategy classes ([ed4ddcb](https://github.com/ExaDev/markmv/commit/ed4ddcb3ae591938e1a80cd0f612e6f0c1a74dd9))
* add comprehensive TypeDoc documentation to type definitions ([7107a66](https://github.com/ExaDev/markmv/commit/7107a66983fe2f55dac03a037ba1ef1f0d74ad03))
* add comprehensive TypeDoc documentation to utility classes ([2d92950](https://github.com/ExaDev/markmv/commit/2d929502e1013bb092294a8396c0857fe19b398f))

### Styles

* apply ESLint and Prettier formatting to codebase ([1708b57](https://github.com/ExaDev/markmv/commit/1708b57d6c37ca953dafd569f86341bf08fa155f))
* auto-fix linting issues ([#4](https://github.com/ExaDev/markmv/issues/4)) ([231eedd](https://github.com/ExaDev/markmv/commit/231eedd853c99d7b697ce2696a159a28267f2870))

### Continuous Integration

* update GitHub Actions workflow for ESLint and Prettier ([ea6ecf4](https://github.com/ExaDev/markmv/commit/ea6ecf4b1a603416aaa78d09ff59ab0a1629329a))

## [1.10.0](https://github.com/ExaDev/markmv/compare/v1.9.0...v1.10.0) (2025-06-10)

### Features

* integrate documentation coverage reporting with GitHub CI ([f39973a](https://github.com/ExaDev/markmv/commit/f39973a0e6b9c7ad067885481b9d2d47b0e62563))

### Documentation

* add comprehensive TypeDoc documentation for ContentJoiner class ([c2efa8b](https://github.com/ExaDev/markmv/commit/c2efa8b5d2a786711e2daf742a4475ad0c27f28f))
* add comprehensive TypeDoc documentation for ContentSplitter and DependencyGraph ([757c385](https://github.com/ExaDev/markmv/commit/757c385ce4be2c489201b1c56ae1ab14dc64efeb))
* add comprehensive TypeDoc documentation for LinkRefactorer and LinkValidator ([a607243](https://github.com/ExaDev/markmv/commit/a60724301f82d2c8e6cd557cb2ad2f21af4ae537))

## [1.9.0](https://github.com/ExaDev/markmv/compare/v1.8.4...v1.9.0) (2025-06-10)

### Features

* add comprehensive documentation coverage analysis tool ([5a89435](https://github.com/ExaDev/markmv/commit/5a89435e45c93b4d0ec92669fde4a874a7543326))
* enable strict TypeDoc validation for better documentation quality ([02d97ba](https://github.com/ExaDev/markmv/commit/02d97ba1ed4600435d456fd8447b1ef21ba7ead8))

### Chores

* update package-lock.json for typedoc-plugin-coverage ([42278bf](https://github.com/ExaDev/markmv/commit/42278bf9ca91eb3b8c6e8f84d2d938711ad8efbb))

## [1.8.4](https://github.com/ExaDev/markmv/compare/v1.8.3...v1.8.4) (2025-06-10)

### Bug Fixes

* correct GitHub username link in README ([4ba5b10](https://github.com/ExaDev/markmv/commit/4ba5b102794ae7789ffbcca63afbd70f31f3ccde))
* improve TypeDoc theme for proper light/dark/OS mode support ([4408c7d](https://github.com/ExaDev/markmv/commit/4408c7d9df667596a47830255a75269c143fa9ee))

## [1.8.3](https://github.com/ExaDev/markmv/compare/v1.8.2...v1.8.3) (2025-06-10)

### Bug Fixes

* add cache busting to TypeDoc configuration to prevent CSS caching issues ([76dd588](https://github.com/ExaDev/markmv/commit/76dd588cb9e3168d61d69b8a74723f2b86a73988))

## [1.8.2](https://github.com/ExaDev/markmv/compare/v1.8.1...v1.8.2) (2025-06-10)

### Bug Fixes

* improve lint-fix CI job robustness ([ade2727](https://github.com/ExaDev/markmv/commit/ade2727b20e0f13f4f99767266538ecaa101e07a))
* improve test directory creation robustness in link-parser tests ([d54616e](https://github.com/ExaDev/markmv/commit/d54616e34a8296a5e50f13fe00f9e2ca60d9baab))

## [1.8.1](https://github.com/ExaDev/markmv/compare/v1.8.0...v1.8.1) (2025-06-10)

### Bug Fixes

* remove invalid comment from typedoc.json ([43c90c0](https://github.com/ExaDev/markmv/commit/43c90c0f36180f7a969529c84b8693fa7072196a))

### Documentation

* trigger documentation rebuild for v1.8.0 ([f96358a](https://github.com/ExaDev/markmv/commit/f96358adccf51f2d070650bb3f351d13098b7e84))

## [1.8.0](https://github.com/ExaDev/markmv/compare/v1.7.0...v1.8.0) (2025-06-10)

### Features

* add comprehensive glob support for CLI move command ([2530da1](https://github.com/ExaDev/markmv/commit/2530da10dd637543b7cd1ab36d4e69d55c145daa))
* add support for moving files to directories ([1adbc6d](https://github.com/ExaDev/markmv/commit/1adbc6d2f7a517f81f5e6c1a786f1d56e231014f))
* configure TypeDoc for comprehensive API documentation ([94e82a1](https://github.com/ExaDev/markmv/commit/94e82a101fb7784a6e3cf8b625afde1218089dbe))
* implement comprehensive programmatic API ([edd5549](https://github.com/ExaDev/markmv/commit/edd55491f591eaac5acf888461a942855d63249a))
* install TypeDoc for API documentation generation ([348ad30](https://github.com/ExaDev/markmv/commit/348ad309320803ffa0e387a3cd1bd1b6cd8176d2))

### Bug Fixes

* add missing OperationResult import in move command ([d7c98b3](https://github.com/ExaDev/markmv/commit/d7c98b3de234b6164a026c5e8cd382969d4077e0))
* resolve linting issues in move command ([d80ff99](https://github.com/ExaDev/markmv/commit/d80ff99b1862aea5822a970e081747568f6ae5b0))

### Documentation

* add comprehensive JSDoc comments to core classes ([77a059f](https://github.com/ExaDev/markmv/commit/77a059f41eb47ee3d89958d457a7e19cdc3994b8))
* enhance README with comprehensive API documentation and examples ([c4ef1b8](https://github.com/ExaDev/markmv/commit/c4ef1b85f2982ec19d59a5708368723f0de553cc))

### Styles

* auto-fix linting issues ([0050cb9](https://github.com/ExaDev/markmv/commit/0050cb9e0b768b93c7d113b0951999da03f3036f))

### Continuous Integration

* add GitHub Actions workflow for documentation deployment ([aa09cfa](https://github.com/ExaDev/markmv/commit/aa09cfa5717c53d3ee475858bcae202ad89d21f5))

### Chores

* add docs/ to .gitignore for generated documentation ([361ff1c](https://github.com/ExaDev/markmv/commit/361ff1ce127d5bdc2e623f80f93774ceb896e280))

## [1.7.0](https://github.com/ExaDev/markmv/compare/v1.6.1...v1.7.0) (2025-06-10)

### Features

* implement comprehensive programmatic API with TypeDoc documentation ([32a76c8](https://github.com/ExaDev/markmv/commit/32a76c8675185c7b38271ab092c53d68799f2a89))

## [1.6.1](https://github.com/ExaDev/markmv/compare/v1.6.0...v1.6.1) (2025-06-10)

### Bug Fixes

* remove non-existent labels from auto-fix PR creation ([8662702](https://github.com/ExaDev/markmv/commit/86627027e2cab8ceb391e41d61b6f05265eae2e6))

## [1.6.0](https://github.com/ExaDev/markmv/compare/v1.5.2...v1.6.0) (2025-06-10)

### Features

* implement dual auto-fix strategy for protected and non-protected branches ([7ba70f3](https://github.com/ExaDev/markmv/commit/7ba70f390222749134bcef1776350c05d519328f))

### Bug Fixes

* auto-commit linting fixes on source branch only ([9cdb358](https://github.com/ExaDev/markmv/commit/9cdb3585745274cef633a9e4b88ba2192625bad3))
* correct YAML syntax for multiline PR body in workflow ([393f197](https://github.com/ExaDev/markmv/commit/393f197d917e9fb2f8bc3358fde59b74339b02af))
* run CI on all branch pushes for auto-fix testing ([e83e0fc](https://github.com/ExaDev/markmv/commit/e83e0fc2f4d3d53bb8f7851c0dd7bb543d79750a))
* run CI on all branch pushes for auto-fix testing ([488b145](https://github.com/ExaDev/markmv/commit/488b14593298cf6b2693c0be13d40d1d8cbc1c3e))

### Styles

* auto-fix linting issues ([26596d2](https://github.com/ExaDev/markmv/commit/26596d2cbcbe1e30c907ec01be05aa9c26120dfd))

### Tests

* add trailing whitespace to test auto-fix on feature branch ([34291e0](https://github.com/ExaDev/markmv/commit/34291e037a6dd7a8e73b992cf9c74272a397aeff))
* add trailing whitespace to test PR creation on main ([6027e5c](https://github.com/ExaDev/markmv/commit/6027e5c7d79628eaa50101c28d01bca32f94c761))

## [1.5.2](https://github.com/ExaDev/markmv/compare/v1.5.1...v1.5.2) (2025-06-10)

### Bug Fixes

* auto-commit linting fixes on source branch only ([f465ba0](https://github.com/ExaDev/markmv/commit/f465ba073735f3fe8a8111f576e27cfb728e08c6))

## [1.5.1](https://github.com/ExaDev/markmv/compare/v1.5.0...v1.5.1) (2025-06-10)

### Bug Fixes

* create PR for auto-fixes instead of direct push ([8ca3af4](https://github.com/ExaDev/markmv/commit/8ca3af47a057d0740a6e1f390522f5ac6070fd7a))

## [1.5.0](https://github.com/ExaDev/markmv/compare/v1.4.0...v1.5.0) (2025-06-10)

### Features

* add automatic linting fix job to CI workflow ([2dcebad](https://github.com/ExaDev/markmv/commit/2dcebadd3a06b7638a87f4566b543212d7722c67))

### Bug Fixes

* improve linting fix detection in CI workflow ([266aca4](https://github.com/ExaDev/markmv/commit/266aca4bc437a6f0d4801dba5b846e9016277684))

### Tests

* add trailing whitespace to test auto-fix CI ([d6fbadd](https://github.com/ExaDev/markmv/commit/d6fbadd3d73dba4cec06ffc86c5787711c88b09e))

## [1.4.0](https://github.com/ExaDev/markmv/compare/v1.3.2...v1.4.0) (2025-06-10)

### Features

* implement index command for markdown documentation organization ([331c6a4](https://github.com/ExaDev/markmv/commit/331c6a44f870ec774df8e10aa4b25a96432a60d3))

### Bug Fixes

* correct terminology and add embed support for index command ([a08ae99](https://github.com/ExaDev/markmv/commit/a08ae99cd4fdfc9c25e9f3483cbefe88b0973c4b))
* resolve linting issues in index command implementation ([3bfffe6](https://github.com/ExaDev/markmv/commit/3bfffe6f93716b00a59d30418275f661ce28be48))

### Tests

* add comprehensive tests for index command functionality ([d52a125](https://github.com/ExaDev/markmv/commit/d52a125b04794ab386ecee2acd37b75334862aa6))

## [1.3.2](https://github.com/ExaDev/markmv/compare/v1.3.1...v1.3.2) (2025-06-10)

### Documentation

* add npx command at top of README for immediate visibility ([5fc562d](https://github.com/ExaDev/markmv/commit/5fc562d56c943ee175e2430ecf8eb4833a3567f4))

## [1.3.1](https://github.com/ExaDev/markmv/compare/v1.3.0...v1.3.1) (2025-06-10)

### Documentation

* fix README inaccuracies and align with actual implementation ([b80c8cf](https://github.com/ExaDev/markmv/commit/b80c8cf7eeda3e7249ba8a6b3d082ed5d2771cd0))
* update installation and usage examples to promote npx usage ([85b121c](https://github.com/ExaDev/markmv/commit/85b121c866c6c5209ac9a9aeb96b806c0307abfb))

### Performance Improvements

* improve CI caching and build performance ([98bd414](https://github.com/ExaDev/markmv/commit/98bd414ebcdca5bc3153dbd4fe5b0e7b393bf175))

## [1.3.0](https://github.com/ExaDev/markmv/compare/v1.2.1...v1.3.0) (2025-06-10)

### Features

* add homepage and bugs URL fields to package.json ([37fdf87](https://github.com/ExaDev/markmv/commit/37fdf871307c7d34a3e7c61db362aaffffbdf256))

### Documentation

* update badges and repository URLs to reflect ExaDev organisation ([0cccfd4](https://github.com/ExaDev/markmv/commit/0cccfd428717f0c32af4173bc80283ef10d8e402))

## [1.2.1](https://github.com/ExaDev/markmv/compare/v1.2.0...v1.2.1) (2025-06-10)

### Bug Fixes

* remove redundant publish workflow to prevent duplicate npm publishing ([b075d01](https://github.com/ExaDev/markmv/commit/b075d012ba6017b0f401bffc9d0316e1c1373d42))

## [1.2.0](https://github.com/ExaDev/markmv/compare/v1.1.0...v1.2.0) (2025-06-10)

### Features

* add build attestation, SBOM generation, and npm provenance ([7a4f0e3](https://github.com/ExaDev/markmv/commit/7a4f0e33dcaecf7dc59ed9d9fbbc121b6358a93d))

### Bug Fixes

* add attestations write permission for build provenance ([615ce6a](https://github.com/ExaDev/markmv/commit/615ce6a8159ea5b4040cd800876e70075c559e87))

## [1.1.0](https://github.com/ExaDev/markmv/compare/v1.0.0...v1.1.0) (2025-06-10)

### Features

* re-enable semantic-release git plugin with bypass token support ([5d2fbe9](https://github.com/ExaDev/markmv/commit/5d2fbe9bc1fc90f24e8aaccfd366814aaecdc6a8))

### Bug Fixes

* test semantic-release with bypass token for automatic package and changelog updates ([4e8eb66](https://github.com/ExaDev/markmv/commit/4e8eb66f9df6ca738eb0486e853527f5860623dd))
