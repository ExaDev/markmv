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
