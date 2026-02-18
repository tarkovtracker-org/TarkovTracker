## [1.8.1](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.8.0...v1.8.1) (2026-02-18)


### Bug Fixes

* **streamer:** avoid false private overlay on protected internal fetch ([0c761c3](https://github.com/tarkovtracker-org/TarkovTracker/commit/0c761c3b7a759d80df4c86a8ca091dbb72b1c664))

# [1.8.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.7.0...v1.8.0) (2026-02-18)


### Bug Fixes

* **api:** harden shared profile and team endpoint caching ([6659dcd](https://github.com/tarkovtracker-org/TarkovTracker/commit/6659dcdf7832ac569eb632aecc95b0442124b688))
* **app:** harden supabase sync and oauth login flows ([6a5cd53](https://github.com/tarkovtracker-org/TarkovTracker/commit/6a5cd53af1a265828963b79dbd2382ad137ee3b8))
* **maps:** link objective tooltip title to wiki ([28ee9f1](https://github.com/tarkovtracker-org/TarkovTracker/commit/28ee9f15a7304938a5d7136b6ea2d65765b4a4be))
* **tasks:** override Duck Hunt duck pate objective icon ([f7a305d](https://github.com/tarkovtracker-org/TarkovTracker/commit/f7a305dcc5ebf4f65ee7ce2c343a37a10a37ae2e))


### Features

* **app:** add client and server error monitoring pipeline ([9d5637b](https://github.com/tarkovtracker-org/TarkovTracker/commit/9d5637ba4e26f16bd1119f0c50bc0c0c6aae1fce))
* **app:** add storyline chapter tracking and chapter card refactor ([c2ff064](https://github.com/tarkovtracker-org/TarkovTracker/commit/c2ff064fbd8960bbb2c9b5e263ec17aa076aa67d))

# [1.7.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.6.1...v1.7.0) (2026-02-17)


### Features

* **needed-items:** centralize settings and separate handover state ([4189ae2](https://github.com/tarkovtracker-org/TarkovTracker/commit/4189ae2dd8405d83c5b88074f43ca0e6c893d16f))

## [1.6.1](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.6.0...v1.6.1) (2026-02-17)


### Bug Fixes

* **import:** map memberCategory 1024 to unheard only ([79ae93f](https://github.com/tarkovtracker-org/TarkovTracker/commit/79ae93fb33d7a3cf6cd2296c9393e07786b2585f))

# [1.6.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.5.0...v1.6.0) (2026-02-17)


### Features

* show collapsible instructions on linked profile import card ([3678d53](https://github.com/tarkovtracker-org/TarkovTracker/commit/3678d534068bde0ae381927b881589aa303048e3))

# [1.5.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.4.0...v1.5.0) (2026-02-17)


### Features

* add tarkov.dev profile import, profile tabs, and map TS hardening ([6636661](https://github.com/tarkovtracker-org/TarkovTracker/commit/66366618b49e6ee84927a21f05c9f3be38008466))

# [1.4.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.6...v1.4.0) (2026-02-16)


### Features

* **maps:** add adjustable zone overlay opacity setting ([1c365e6](https://github.com/tarkovtracker-org/TarkovTracker/commit/1c365e6856bc8b25e5b5be397672d676786e410a))

## [1.3.6](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.5...v1.3.6) (2026-02-15)


### Bug Fixes

* **streamer:** forward host header on internal $fetch to pass API protection ([b1792fa](https://github.com/tarkovtracker-org/TarkovTracker/commit/b1792fab21e8bd18d191cba8011d837461abe844))

## [1.3.5](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.4...v1.3.5) (2026-02-15)


### Bug Fixes

* **profile:** align stats logic and add targeted tests ([e3e5970](https://github.com/tarkovtracker-org/TarkovTracker/commit/e3e59706a7ad7bd4dd94671d36d1f1eef70c84d1))

## [1.3.4](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.3...v1.3.4) (2026-02-15)


### Bug Fixes

* **profile:** exclude invalid/unreachable tasks from progression totals ([110807b](https://github.com/tarkovtracker-org/TarkovTracker/commit/110807b5e7857fa76a080e5d1d65c02a9ce24373))

## [1.3.3](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.2...v1.3.3) (2026-02-15)


### Bug Fixes

* **i18n:** add missing profile_sharing locale keys ([7a0b400](https://github.com/tarkovtracker-org/TarkovTracker/commit/7a0b4002d377a59162dd5346c5a8d1748bf90e1f))
* resolve shouldLog redeclaration conflicts ([ef259a0](https://github.com/tarkovtracker-org/TarkovTracker/commit/ef259a06fe4f2d976951a1ac940c718f28f0645b))

## [1.3.2](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.1...v1.3.2) (2026-02-15)


### Bug Fixes

* accept SB service key alias in runtime config ([c909493](https://github.com/tarkovtracker-org/TarkovTracker/commit/c909493a06b332250d13ad78709efedbd1a290ff))

## [1.3.1](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.3.0...v1.3.1) (2026-02-15)


### Bug Fixes

* **test:** add missing mock properties for useSupabaseSync return type ([0d56fc4](https://github.com/tarkovtracker-org/TarkovTracker/commit/0d56fc4ebf2d76fb12e6cfd7bc722c1dc47dca5b))

# [1.3.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.2.1...v1.3.0) (2026-02-15)


### Bug Fixes

* address remaining PR review issues ([ad0dc1c](https://github.com/tarkovtracker-org/TarkovTracker/commit/ad0dc1c81277b48879684282f03a9cbc36f55a0a))
* **tasks:** prevent early returns from skipping sort/sortDir sync ([37355f8](https://github.com/tarkovtracker-org/TarkovTracker/commit/37355f86db49d6a140647d4d2f712692016ade59))
* **tarkov-store:** stop repeated local ignored toast on refresh ([76ba925](https://github.com/tarkovtracker-org/TarkovTracker/commit/76ba9250c56229b260c37b98e04c69555e805fb7))


### Features

* **neededitems:** add filter type and sort validators ([5f8c138](https://github.com/tarkovtracker-org/TarkovTracker/commit/5f8c138742ae37df5e8ef2979d6431fefd27ba0c))
* add generic useRouteFilters composable ([6b22386](https://github.com/tarkovtracker-org/TarkovTracker/commit/6b223865d178c406d166633c497420da8d430924))
* **types:** add sort mode and direction validators ([2fe96d8](https://github.com/tarkovtracker-org/TarkovTracker/commit/2fe96d84dddfe0384d833ccafe54969bdad68fd1))
* **hideout:** add useHideoutRouteSync for URL filter state ([34f1a31](https://github.com/tarkovtracker-org/TarkovTracker/commit/34f1a317b3b7e2fd7af374efe98d315a421e267d))
* **hideout:** integrate URL filter sync into hideout page ([a995461](https://github.com/tarkovtracker-org/TarkovTracker/commit/a995461bc0679752e618bf717628f57799e5d84e))

## [1.2.1](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.2.0...v1.2.1) (2026-02-15)


### Bug Fixes

* **tasks:** address PR review — revert objective.item, truncate instead of drop, rename constant ([bdc2b5e](https://github.com/tarkovtracker-org/TarkovTracker/commit/bdc2b5e8733043fdf1c7f9f3bc37ad85a6ae80d8))
* **tasks:** cap any/sell objective item rendering ([23ba8b0](https://github.com/tarkovtracker-org/TarkovTracker/commit/23ba8b081f957fb464d9e0b68a16eeab781bef62))
* **tasks:** include objective.item in equipment aggregation ([210188c](https://github.com/tarkovtracker-org/TarkovTracker/commit/210188c5c299a458ed4e9c1738184839c16912ae))

# [1.2.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.1.0...v1.2.0) (2026-02-15)


### Bug Fixes

* add cycle detection to critical path walker and fix relative import ([c1a524d](https://github.com/tarkovtracker-org/TarkovTracker/commit/c1a524deba114371617d4c35ca6f748f93f3a5fd))
* **tests:** restore originalFetch assignment in kappa.test.ts ([3d72a29](https://github.com/tarkovtracker-org/TarkovTracker/commit/3d72a2938c388705cfb6ae95b9ba330134e6b176))


### Features

* add profile sharing, streamer overlay enhancements, and security hardening ([b745d63](https://github.com/tarkovtracker-org/TarkovTracker/commit/b745d6333bd41b24675b1e7ab98c273953b16f30))
* **settings:** create TaskDisplayCard, MapSettingsCard, and PrivacyCard components ([fc17b0b](https://github.com/tarkovtracker-org/TarkovTracker/commit/fc17b0b988df104af1eeb77c1c511d8a8230689a))
* implement confidence rating and pace dampening helpers ([4ac632e](https://github.com/tarkovtracker-org/TarkovTracker/commit/4ac632eac6ddbba174d6b7f8d3c432cd32c4835e))
* implement critical path floor calculation for kappa tasks ([7e2cb3b](https://github.com/tarkovtracker-org/TarkovTracker/commit/7e2cb3b4809c02211d6093428e0a3f946b17cbbe))
* **settings:** move API tokens to account page, add redirect notice ([02af671](https://github.com/tarkovtracker-org/TarkovTracker/commit/02af6710ebe399853d986e625413e71296e26ac8))
* **streamer:** polish overlay widget CSS — spacing, typography, animations ([f872177](https://github.com/tarkovtracker-org/TarkovTracker/commit/f87217769675a03baacf931ab3e0817a40d1379f))
* **ui:** restructure streamer tools config page into focused card sections ([c7f10ef](https://github.com/tarkovtracker-org/TarkovTracker/commit/c7f10ef4100f8b65dcda0d6801ab936cd4eb7679))
* **settings:** rewrite page as vertical card flow ([4f93d53](https://github.com/tarkovtracker-org/TarkovTracker/commit/4f93d53e1129e259165c0ac14a4378b366f8dc7f))
* wire critical path floor, dampening, and confidence into kappa projection ([1938dec](https://github.com/tarkovtracker-org/TarkovTracker/commit/1938dec8f97d0fe1c0d7d1002b6d252609938614))

# [1.1.0](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.0.4...v1.1.0) (2026-02-13)


### Bug Fixes

* **tasks:** catch map objective jump errors ([b0df877](https://github.com/tarkovtracker-org/TarkovTracker/commit/b0df877b64e44a47abf79d66c6a00d83b652a3ef))
* **tasks:** re-expand map panel on objective jump ([6ce11d3](https://github.com/tarkovtracker-org/TarkovTracker/commit/6ce11d3c7e5db4101c561bb0cd1c75b26f1ba392))


### Features

* **tasks:** add collapsible map panel and map time badges ([bae249f](https://github.com/tarkovtracker-org/TarkovTracker/commit/bae249f214c6ecc9b48aaa301053e1d66b3981b4))
* **app:** allow collapsing tasks in map view ([590fc84](https://github.com/tarkovtracker-org/TarkovTracker/commit/590fc84785eee633fc9c0f9d02fc505979f80c2a))
* **app:** allow collapsing tasks in map view ([bee55eb](https://github.com/tarkovtracker-org/TarkovTracker/commit/bee55eb9ddd71e2b7c01c7b4a850b04ee1cd3226))

## [1.0.4](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.0.3...v1.0.4) (2026-02-13)


### Bug Fixes

* **ci:** sync api-gateway lockfile with worker deps ([636e685](https://github.com/tarkovtracker-org/TarkovTracker/commit/636e685436c53a72f80c71a54ff2c510253eb11d))

## [1.0.3](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.0.2...v1.0.3) (2026-02-13)


### Bug Fixes

* **app:** differentiate objective defaults and harden user_system admin writes ([64fa239](https://github.com/tarkovtracker-org/TarkovTracker/commit/64fa239c48fa1319ade3175b1261fb66da7d3f4f)), closes [#98](https://github.com/tarkovtracker-org/TarkovTracker/issues/98)

## [1.0.2](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.0.1...v1.0.2) (2026-02-12)


### Bug Fixes

* use setLocale API for locale switching and add test coverage ([2348a0a](https://github.com/tarkovtracker-org/TarkovTracker/commit/2348a0a063b223492fa57b568ca9a80eeb931919))

## [1.0.1](https://github.com/tarkovtracker-org/TarkovTracker/compare/v1.0.0...v1.0.1) (2026-02-12)


### Bug Fixes

* **team-gateway:** validate UUID inputs and stop leaking DB errors to clients ([f573492](https://github.com/tarkovtracker-org/TarkovTracker/commit/f573492faea2a7f23ce7d028e15b3bf7c128caa0))

# 1.0.0 (2026-02-11)


### Bug Fixes

* add context menu focus styles ([4702c97](https://github.com/tarkovtracker-org/TarkovTracker/commit/4702c970f65c3ce89eb5d14d3398fa8fc0519820))
* **i18n:** add explicit useI18n imports and clipboard_copied locale keys ([4cbc468](https://github.com/tarkovtracker-org/TarkovTracker/commit/4cbc4689671461c35168cf2a7525e32212ad0c4e))
* add flex and min-height classes to trader card for improved layout ([791e726](https://github.com/tarkovtracker-org/TarkovTracker/commit/791e726f42760c2cdb685b1e63f2b3f8b34fbbff))
* **store:** add markTaskAsUncompleted and clear stale failed flags during repair ([c11f8a0](https://github.com/tarkovtracker-org/TarkovTracker/commit/c11f8a0aba5a72a97077ca710b8022ffdb16daac))
* **i18n:** add missing map spawn locale keys ([90b7b19](https://github.com/tarkovtracker-org/TarkovTracker/commit/90b7b1995a54821bcbc4979705710940d94ed37d))
* **tasks:** add missing task objective types module ([87116ee](https://github.com/tarkovtracker-org/TarkovTracker/commit/87116eefea6850b452a3ee2f37c59bb2a7a601e8))
* **nuxt.config:** add NUXT_SUPABASE_URL and NUXT_SUPABASE_ANON_KEY for improved configuration ([d85437e](https://github.com/tarkovtracker-org/TarkovTracker/commit/d85437eda9dd6a425faeafa3ea70061a4e6d901b))
* add optional chaining for icon prop and update icon type to optional ([c4b54bf](https://github.com/tarkovtracker-org/TarkovTracker/commit/c4b54bf0eb1be9fac414712981a6c8a6da5aa586))
* **api:** add request timeout to cache-meta and fix import alias ([28b1f52](https://github.com/tarkovtracker-org/TarkovTracker/commit/28b1f528e6aabb7872a6038d222a88092f952071))
* **api:** add retry logic and better error handling for tarkov.dev API ([dfbed88](https://github.com/tarkovtracker-org/TarkovTracker/commit/dfbed8822bee73bca86c7baec7dae8c429c98499))
* **ui:** add Tailwind utilities, fix styling, and use locale keys for ([f29e33f](https://github.com/tarkovtracker-org/TarkovTracker/commit/f29e33f7ddc3e3ab8e94e52f2530dcbba4257fe1))
* **settings:** add usage hint to Skills Management card ([f959ee1](https://github.com/tarkovtracker-org/TarkovTracker/commit/f959ee1d524796ebaeb723833fbb6c6ba29184ed)), closes [#28](https://github.com/tarkovtracker-org/TarkovTracker/issues/28)
* add VITE_ env var fallbacks to server runtime config ([5a84b27](https://github.com/tarkovtracker-org/TarkovTracker/commit/5a84b27df7dd7d955cc703d687130704f37e2389))
* address memory cache type safety and leak concerns ([3fd9fd6](https://github.com/tarkovtracker-org/TarkovTracker/commit/3fd9fd61aa03dcd939c87c506c5fff1caf0400f6))
* **security:** address security lints and tighten privileges in database views and functions ([560f286](https://github.com/tarkovtracker-org/TarkovTracker/commit/560f2864ebc3533c57c66ad6eb4139b007bf45a1))
* **tasks:** align global edge cases, map totals, and ordering ([50f2c03](https://github.com/tarkovtracker-org/TarkovTracker/commit/50f2c0360c973b3e65c0bfe53cada41cbdecb5d5))
* align toast/task fallbacks and map pan speed row typing ([b4b4672](https://github.com/tarkovtracker-org/TarkovTracker/commit/b4b4672b5b73ae4aa587697aa93937e0c327388b))
* allow showing completed objectives on map when filtering by completed/all tasks ([11f8e5c](https://github.com/tarkovtracker-org/TarkovTracker/commit/11f8e5cb12fad684053dfda224c6402ee3a3b508))
* **tasks:** always surface invalid-task status context ([051be2d](https://github.com/tarkovtracker-org/TarkovTracker/commit/051be2dd375335e119b37bd7e447393cf2b77f82))
* **ui:** apply CodeRabbit accessibility and style updates ([3e74a69](https://github.com/tarkovtracker-org/TarkovTracker/commit/3e74a6970df499d2f8338b78a6eb3429c73e315f))
* **needed-items:** apply shared prestige task filtering ([a6499e7](https://github.com/tarkovtracker-org/TarkovTracker/commit/a6499e7905296fd4ce3bc0aef1afe4f16625316f))
* apply task overlay to objectives and rewards ([2f160d3](https://github.com/tarkovtracker-org/TarkovTracker/commit/2f160d34d8f94ca17d4171a1886f2f1fe6130edb))
* avoid resuming stale sync controller ([9f5c3f3](https://github.com/tarkovtracker-org/TarkovTracker/commit/9f5c3f38b325e1741955a90e649a7b92f3aa5f1d))
* carry working changes onto feat/ui-improvements ([3d61a35](https://github.com/tarkovtracker-org/TarkovTracker/commit/3d61a35fa80558942488e3c5ddb9bcfa3695698d))
* change action buttons from soft to outline variant ([fd9dfe9](https://github.com/tarkovtracker-org/TarkovTracker/commit/fd9dfe9e5347e7138dfd44718ce340c1937a2405))
* **store:** change lastApiUpdateIds to a constant for better immutability ([648def5](https://github.com/tarkovtracker-org/TarkovTracker/commit/648def570e6fc4be4ed6435fffbc014fae9a6b1b))
* **settings:** clean up account card and improve test reliability ([c572f3e](https://github.com/tarkovtracker-org/TarkovTracker/commit/c572f3eaee217540e08def7c936fcbb85af5710a))
* **app:** clean up shell components and fix test imports ([651b194](https://github.com/tarkovtracker-org/TarkovTracker/commit/651b1942dcca69941dac116eace076f949182681)), closes [#tests](https://github.com/tarkovtracker-org/TarkovTracker/issues/tests)
* clear search filter when navigating to task via dependency link ([d86d08b](https://github.com/tarkovtracker-org/TarkovTracker/commit/d86d08b02daf9543eefdc29aec237a11b625a826)), closes [#65](https://github.com/tarkovtracker-org/TarkovTracker/issues/65)
* clear stale local state after account deletion ([e86e26d](https://github.com/tarkovtracker-org/TarkovTracker/commit/e86e26dbffb83efe5f62a7d5b8da7b797dcdeda6))
* comprehensive data loss prevention and sync reliability improvements ([d2b5219](https://github.com/tarkovtracker-org/TarkovTracker/commit/d2b5219b5fff13d370e94bb14278dafbde05f0f3)), closes [#71](https://github.com/tarkovtracker-org/TarkovTracker/issues/71)
* correct debounce import path in useSupabaseSync ([c4cb77d](https://github.com/tarkovtracker-org/TarkovTracker/commit/c4cb77dd5c4946d48abfcbe7fdf294d237b712db))
* correct doubled item counts for find+handover task objectives ([55f5917](https://github.com/tarkovtracker-org/TarkovTracker/commit/55f59173d0858d4122216edb0f0234c297d35e47))
* **skills:** correct in-game Endurance sort order ([0e8ed6c](https://github.com/tarkovtracker-org/TarkovTracker/commit/0e8ed6c9ab66f4fcfd27e17161c54806dc69627b))
* correct min-width value in NeededItemsFilterBar component ([1eadcc6](https://github.com/tarkovtracker-org/TarkovTracker/commit/1eadcc6bde197347932aa026077b97c898b5e9ab))
* correct trader level retrieval in isTraderReqMet function ([94973f4](https://github.com/tarkovtracker-org/TarkovTracker/commit/94973f41706a6a39d3cb2dfccaaea60cb4edf672))
* disable trader gating until trader data is ready ([0faab44](https://github.com/tarkovtracker-org/TarkovTracker/commit/0faab4410e0d983825eaeabad602c8f98419445d))
* **tasks:** distinguish fail vs uncomplete when reverting alternative tasks ([061028d](https://github.com/tarkovtracker-org/TarkovTracker/commit/061028d15d1f0b9c2b65fb33fd636541517dce8f))
* **i18n:** Duplicate page.api key at lines 280 and 455 causes translation loss. ([91d669d](https://github.com/tarkovtracker-org/TarkovTracker/commit/91d669d9bf357df6e7a181bbaa3c0cbb197e6183))
* **changelog:** enforce descending date order ([9c2cde7](https://github.com/tarkovtracker-org/TarkovTracker/commit/9c2cde7efca6a4870bcdd82bc31bde27e02e4ca4))
* **oauth:** enhance logging for authorization approval and error handling ([17232ea](https://github.com/tarkovtracker-org/TarkovTracker/commit/17232ea29f5a62781b9921ed71e275dcc44811f7))
* **oauth:** enhance logging for OAuth consent process ([b33ca57](https://github.com/tarkovtracker-org/TarkovTracker/commit/b33ca579fedf5cb18f9745b135bd398744f97c4b))
* **oauth:** enhance redirect handling in callback and login flows ([7622b66](https://github.com/tarkovtracker-org/TarkovTracker/commit/7622b6669ed90eecb6320a1c753f177255c562f1))
* **useInfiniteScroll:** enhance scroll handling and prevent rapid checks during scrolling ([13db6c7](https://github.com/tarkovtracker-org/TarkovTracker/commit/13db6c75639b83884040c8a4bfce668be1d595a7))
* enhance sync error messages with table context ([45992d4](https://github.com/tarkovtracker-org/TarkovTracker/commit/45992d45820d296b1cdca908b31f2d323894bd23))
* **tests:** enhance Vitest configuration for improved isolation and mock restoration ([42e6566](https://github.com/tarkovtracker-org/TarkovTracker/commit/42e6566391f4467a159506e77ef0ed9a31895bd4))
* ensure consistent level display across all UI components ([ba25d2e](https://github.com/tarkovtracker-org/TarkovTracker/commit/ba25d2efe1ab8921a3846fad83ff6120858a7613)), closes [#64](https://github.com/tarkovtracker-org/TarkovTracker/issues/64)
* **tests:** ensure NEW_BEGINNING_TASK_IDS is treated as a constant array ([ff84e4b](https://github.com/tarkovtracker-org/TarkovTracker/commit/ff84e4b2275effc7db74fd1622f8cccf653517cd))
* **i18n:** escape apostrophes in fr locale ([b071706](https://github.com/tarkovtracker-org/TarkovTracker/commit/b071706a3a04bd51c996235fef9b5a4694a8ce5f))
* expose overlay metadata and purge task caches ([ee54208](https://github.com/tarkovtracker-org/TarkovTracker/commit/ee542084f1119585e806b74316071466ca43cee2))
* **neededitems:** filter task objectives by user faction ([3af91dd](https://github.com/tarkovtracker-org/TarkovTracker/commit/3af91ddb03619cc899f535da03f3f915990f3afa))
* **i18n:** fix French locale issues ([1a809ce](https://github.com/tarkovtracker-org/TarkovTracker/commit/1a809ce1e4dd8089bd6fa79f949e9036ab00c7e4))
* **lighthouse:** format assertions for clarity and consistency ([cbb654a](https://github.com/tarkovtracker-org/TarkovTracker/commit/cbb654a7140c9ad4c7a1ef00ea4880b2f971e772))
* **locales:** format notAvailableDescription strings for consistency ([08e99b6](https://github.com/tarkovtracker-org/TarkovTracker/commit/08e99b66b4a3439129e24785124de3dbf5783b33))
* guard initial sync to avoid data loss ([f22be87](https://github.com/tarkovtracker-org/TarkovTracker/commit/f22be876deb9ca00728343ca6c703b5ed2430cfd))
* guard overlay deep merge and apply hideout corrections ([a20d7d6](https://github.com/tarkovtracker-org/TarkovTracker/commit/a20d7d6fc44464cefa309db7f6d6b3bae3f77f5b))
* handle filter changes more robustly by resetting store and managing initial load state ([c31baac](https://github.com/tarkovtracker-org/TarkovTracker/commit/c31baac202d8e18ec1dbe51e1788859fbe06dddd))
* **app:** handle game mode rollback failure and validate changelog dates ([4d11185](https://github.com/tarkovtracker-org/TarkovTracker/commit/4d11185b386d1505db973e2512af23836207c97c))
* handle null rewardItems entries from tarkov.dev API ([83214f5](https://github.com/tarkovtracker-org/TarkovTracker/commit/83214f57faeb553527d1d1adcd0b556761322dd3))
* handle undefined values in GPS coordinates check for map objectives ([5b9718a](https://github.com/tarkovtracker-org/TarkovTracker/commit/5b9718abf2e7a0a844cca59da874067d16ac7dfa))
* harden account deletion and sync flows ([1f7529d](https://github.com/tarkovtracker-org/TarkovTracker/commit/1f7529d78a445b2992ba05061f79047cc16002b7))
* harden cache and server utilities ([25f7161](https://github.com/tarkovtracker-org/TarkovTracker/commit/25f71612d2c02f30fdd37ea1d0b6132c73e051a6))
* harden failed task handling and manual fail flows ([1283b76](https://github.com/tarkovtracker-org/TarkovTracker/commit/1283b7675372814f3de611a38577fc9886de0cd3))
* **tasks:** harden prestige New Beginning task mapping ([734d212](https://github.com/tarkovtracker-org/TarkovTracker/commit/734d212ab2cf32f0398de4d5197809dbb0d368d7))
* **ui:** harden select menu property lookup and add drawer aria labels ([4fc0530](https://github.com/tarkovtracker-org/TarkovTracker/commit/4fc0530aa6db314fe7560e74da0f80f0a0db88f5))
* harden sync and team updates ([ed17fae](https://github.com/tarkovtracker-org/TarkovTracker/commit/ed17fae605936607898ef69727896dd19056b6c1))
* **security:** harden XSS prevention, accessibility, and OAuth lifecycle ([c60ed88](https://github.com/tarkovtracker-org/TarkovTracker/commit/c60ed88b02b34615c8d5068c7a68bbb0f20cdf3a))
* hide completed objectives from map display ([0e7a9b5](https://github.com/tarkovtracker-org/TarkovTracker/commit/0e7a9b5980979b727eb73f3e6c09ac2adf0d85bb))
* **app:** hide dashboard filter notice when progress is collapsed ([f046a4f](https://github.com/tarkovtracker-org/TarkovTracker/commit/f046a4f6275fdf9da45435846a8da64e2e0a6291))
* honor failed prereqs in invalidation ([a13e71f](https://github.com/tarkovtracker-org/TarkovTracker/commit/a13e71f1b9daa60618aab8e533feba05537c6441))
* **ui:** improve accessibility, security, and component consistency ([5323667](https://github.com/tarkovtracker-org/TarkovTracker/commit/532366705c2b00ae6d8804a739d081fe98df06cd))
* **lint-colors:** improve baseline handling and reordering of imports ([188f0c9](https://github.com/tarkovtracker-org/TarkovTracker/commit/188f0c9b182f88bd6d96b069bffe4134163e958d))
* **ui:** improve ContextMenuItem keyboard handling and update icons ([181c1eb](https://github.com/tarkovtracker-org/TarkovTracker/commit/181c1eba28d9ef7134587f2b2f9fcb668bee7e9b))
* **app:** improve error categorization in sync-maps script ([39cdc55](https://github.com/tarkovtracker-org/TarkovTracker/commit/39cdc550f5f3dcf8c51626156c1a1d9151b3a485))
* improve error handling and type safety in cache APIs ([719a75a](https://github.com/tarkovtracker-org/TarkovTracker/commit/719a75a8cf955037405922b6adc87a5c66f8ace9))
* improve error handling for debounced functions ([41ee4b5](https://github.com/tarkovtracker-org/TarkovTracker/commit/41ee4b5873259c57d3fa3af6210f96b5cab3d954))
* **oauth:** improve error handling for expired or processed authorization requests ([61a271b](https://github.com/tarkovtracker-org/TarkovTracker/commit/61a271bd30bb06e7fe2b3bed7556f61794eacfad))
* **app:** improve error handling, logging safety, and remove unused import ([ad28b81](https://github.com/tarkovtracker-org/TarkovTracker/commit/ad28b81b6197b3073d1737020605d1e6cb4b563a))
* **scripts:** improve floor ordering in sync-maps ([3dee175](https://github.com/tarkovtracker-org/TarkovTracker/commit/3dee17512ecdae708b956b9958fd0ab87975ff22))
* **neededitems:** improve infinite scroll reliability for fast scrolling ([f52c372](https://github.com/tarkovtracker-org/TarkovTracker/commit/f52c3721fd1b4642a5de1cfa8ac97b2d2dd99d09))
* **changelog:** improve load more UX, stats coverage, and server caching ([384208a](https://github.com/tarkovtracker-org/TarkovTracker/commit/384208a92de837fa87dc30b4ba74cd19b24df5d2))
* **oauth:** improve logging format for authorization details retrieval ([b7498f7](https://github.com/tarkovtracker-org/TarkovTracker/commit/b7498f7839ded9acea699a5ba1f1bb6522333c49))
* **tasks:** improve null safety and normalize locale keys ([2cccbeb](https://github.com/tarkovtracker-org/TarkovTracker/commit/2cccbeb6f7ff8a807d72a6ae199a15269f5ade73))
* improve popup management in LeafletMap and clean up TaskObjectiveItemGroup comments ([77bb9bc](https://github.com/tarkovtracker-org/TarkovTracker/commit/77bb9bc54b82f04789501b39278285074a6cd5be))
* **config:** improve redirect and robots.txt configuration ([7db92eb](https://github.com/tarkovtracker-org/TarkovTracker/commit/7db92ebbb448b810e6b83a383c9fe55ac620d634))
* improve task completion merge and objective type inference ([7452863](https://github.com/tarkovtracker-org/TarkovTracker/commit/745286391011a564d0d2c08b641e939ca138a7b0))
* improve TaskCard completed state visibility ([c643d46](https://github.com/tarkovtracker-org/TarkovTracker/commit/c643d46cd7a7aa98bf2811c20ce58e67beb94e96))
* improve team feature robustness and add RLS migration ([4f35ce3](https://github.com/tarkovtracker-org/TarkovTracker/commit/4f35ce3e67a9b76062e63dea084afb6feb145e38))
* improve test infrastructure ([2cd6c63](https://github.com/tarkovtracker-org/TarkovTracker/commit/2cd6c634ee9aafd31d9e0d61f55bfebe458a3d70))
* **maps:** improve tile layer cleanup and tooltip translations ([9bd2f20](https://github.com/tarkovtracker-org/TarkovTracker/commit/9bd2f2009c7e336e99193e16703b03a8a9d4424b))
* **supabase:** improve types and migration idempotency ([16e4e03](https://github.com/tarkovtracker-org/TarkovTracker/commit/16e4e036e1ebb8533508b29d717da98c26251bed))
* include Lightkeeper trader tasks in filters ([c566b8b](https://github.com/tarkovtracker-org/TarkovTracker/commit/c566b8bc3843ad77980fd7211baf82dc8461587b))
* **tasks:** isolate map stacking context from overlay drawer ([57db262](https://github.com/tarkovtracker-org/TarkovTracker/commit/57db26201ecdf450a5f7196ab1b51abd34ae0a50))
* **i18n:** keep external tool names in English for zh locale ([000e746](https://github.com/tarkovtracker-org/TarkovTracker/commit/000e74668b665cb3a4182785de8ba9dfa3e564e5))
* **ui:** keep release note order in dashboard changelog ([f32b35f](https://github.com/tarkovtracker-org/TarkovTracker/commit/f32b35fedefa6b977c9dd9041b42f756478ae434))
* **i18n:** localize task requirement and block/fail strings ([016d611](https://github.com/tarkovtracker-org/TarkovTracker/commit/016d611940b2f27399b5d21dc9b405eb6ecae594))
* **store:** log stale failed-flag cleanup context ([6edb6bb](https://github.com/tarkovtracker-org/TarkovTracker/commit/6edb6bbad1eb75139b8d9445f157c6245a379584))
* **tasks:** make Impact optionally respect active filters ([c63d979](https://github.com/tarkovtracker-org/TarkovTracker/commit/c63d979719d19bb635eef6ef5585e32c8d683341)), closes [#92](https://github.com/tarkovtracker-org/TarkovTracker/issues/92)
* **useTaskNotification:** make objectiveAction optional in handleAlternatives function ([eb4fb7f](https://github.com/tarkovtracker-org/TarkovTracker/commit/eb4fb7f4d683c0a8740136fe6a865887f9e7ce63))
* make task settings modal scrollable ([67979eb](https://github.com/tarkovtracker-org/TarkovTracker/commit/67979eb1803f1cb0537a82e97872697f492edb20))
* **oauth:** make user and scope properties optional in authorization details ([851b92c](https://github.com/tarkovtracker-org/TarkovTracker/commit/851b92c95fbb2c303cde6b8d6dc0a7c7c57c0b7f))
* merge overlay patches for id arrays ([67a75f3](https://github.com/tarkovtracker-org/TarkovTracker/commit/67a75f315430b38715c0c263cedffbdb05058862))
* normalize task objectives ([5669f2c](https://github.com/tarkovtracker-org/TarkovTracker/commit/5669f2ca7776ecc89bdc30b5793b67111b361ba4))
* Normalize team gateway paths for robustness and align team creation/join parameters to `join_code`. ([eefb43c](https://github.com/tarkovtracker-org/TarkovTracker/commit/eefb43cd478b27dd4481bcc879a397932e703c98))
* optimize ResizeObserver with debounce and error handling ([2a95ed5](https://github.com/tarkovtracker-org/TarkovTracker/commit/2a95ed57b190ecfd78a4270a17ca9d6a38ac4576))
* **deps:** patch @modelcontextprotocol/sdk cross-client data leak in MCP plugins ([eee9fbc](https://github.com/tarkovtracker-org/TarkovTracker/commit/eee9fbc83d97c865fd1f3a6e23d07e5c25b0453f))
* **deps:** patch axios DoS vulnerability (GHSA-43fc-jf86-j433) ([0f1ddf1](https://github.com/tarkovtracker-org/TarkovTracker/commit/0f1ddf11debfb0c45171c7acbffabadd0596e07e))
* **tasks:** preserve manual failure state during repair ([1305f4a](https://github.com/tarkovtracker-org/TarkovTracker/commit/1305f4ad0afd0534bed519a834b7765ca14c4079))
* **tasks:** preserve status backgrounds for global accent, fix es.json5 consistency ([80f8b4e](https://github.com/tarkovtracker-org/TarkovTracker/commit/80f8b4ee7a0cf1c66781d02e8ded0dd26f8b0125))
* **tasks:** preserve status borders for global accent ([2dae3ce](https://github.com/tarkovtracker-org/TarkovTracker/commit/2dae3ce2aef31e2cc32ab772a69090e212bd8251))
* **tasks:** prevent hidden teammate mutations under hide-all ([a9fb665](https://github.com/tarkovtracker-org/TarkovTracker/commit/a9fb66517fb4bc89781eb9253e8aa9f17eee08d3))
* **useInfiniteScroll:** prevent multiple queued nextTick/rAF chains during rapid scroll ([0145efc](https://github.com/tarkovtracker-org/TarkovTracker/commit/0145efcad7a24705ead02aab469ed649927a55b3))
* prevent nav drawer content from shrinking on short viewports ([87260ef](https://github.com/tarkovtracker-org/TarkovTracker/commit/87260efc37d87859c0b802bfafbd19f3299802a1))
* prevent race condition in debounce function by capturing local resolve/reject handlers ([4ca9a39](https://github.com/tarkovtracker-org/TarkovTracker/commit/4ca9a39f2eb8c9f3719f97c07326d4898fd3d58c))
* prevent task objective markers from rendering behind the map svg ([03a4990](https://github.com/tarkovtracker-org/TarkovTracker/commit/03a4990d2cfd37c7886b47d1bdc5f797a8e7c773))
* purge legacy user storage key ([ed64d15](https://github.com/tarkovtracker-org/TarkovTracker/commit/ed64d150fdd3546600ad1273fa5915740e8b447f))
* **tasks:** reactively update map when global tasks filter is toggled ([f7cd5e5](https://github.com/tarkovtracker-org/TarkovTracker/commit/f7cd5e58776e33ecf34401d8c54515567b2684d1))
* **hideout:** read calculated skill levels for requirement validation ([3b8c8ac](https://github.com/tarkovtracker-org/TarkovTracker/commit/3b8c8acc5699842e6ebde15f77bc382701a07d6e))
* reduce AppBar height from h-16 to h-11 ([45ada46](https://github.com/tarkovtracker-org/TarkovTracker/commit/45ada46d1875c66eba4d5094e65c0634add20fdf))
* **test:** reduce test duplication and improve descriptions ([4a6418c](https://github.com/tarkovtracker-org/TarkovTracker/commit/4a6418c77b577a535ae75ff569eb7448ad108418))
* **test:** refactor createMockUseNeededItems grouped items logic ([f832534](https://github.com/tarkovtracker-org/TarkovTracker/commit/f832534bbfadc84f522f3f3ba20b539938d46491))
* **oauth:** refactor Supabase client usage for improved session handling ([0ce5b30](https://github.com/tarkovtracker-org/TarkovTracker/commit/0ce5b3053ce2e6000a62f5c2c34be87d79dd0336))
* refine task list filtering and scroll behavior ([a47f086](https://github.com/tarkovtracker-org/TarkovTracker/commit/a47f0867e17febb4d4e207e436a7808e7e2f531e))
* **tasks:** refresh visible list immediately after task actions ([5d0e577](https://github.com/tarkovtracker-org/TarkovTracker/commit/5d0e577357f15c841a190f9479d3103825cc6e6e))
* remove delay between "jump to map" and map element being selected ([4fcf6f0](https://github.com/tarkovtracker-org/TarkovTracker/commit/4fcf6f037237b9b692b23e155873e24e742feee2))
* **nuxt:** remove prerendering for index page ([720fd04](https://github.com/tarkovtracker-org/TarkovTracker/commit/720fd0401fb43c5e00846bcd9165ea21124fa355))
* **oauth:** remove unused Supabase client reference in consent.vue ([989f7b6](https://github.com/tarkovtracker-org/TarkovTracker/commit/989f7b6bc9c6a3d610e62b8786f5b06d9a48fe44))
* remove Windows-specific path from .gitignore ([fbacfc3](https://github.com/tarkovtracker-org/TarkovTracker/commit/fbacfc36c6c033185b037a076e30774591d2d887))
* **config:** repair typecheck ([d69ca0b](https://github.com/tarkovtracker-org/TarkovTracker/commit/d69ca0b82c30fd78face69794fa01636b68d7944))
* **tasks:** replace async components with static imports in TaskInfo to fix tooltip ref error ([c9c4f0c](https://github.com/tarkovtracker-org/TarkovTracker/commit/c9c4f0cc69d8cbfd8bba12e532b49d5b1d34c153))
* replace wrangler with serve for Lighthouse CI preview server ([7d2961c](https://github.com/tarkovtracker-org/TarkovTracker/commit/7d2961c14ac00a5f498163fa4e336553c4f29537))
* reset legacy storage keys and drop dev host ([9052d2a](https://github.com/tarkovtracker-org/TarkovTracker/commit/9052d2a28ffb13b7446e713e9308e6b78eeacf76))
* **app:** resolve changelog typecheck errors ([49f7257](https://github.com/tarkovtracker-org/TarkovTracker/commit/49f7257401a0b82591bfb12bc2176987da6aa2ce))
* resolve CI failures in PR [#136](https://github.com/tarkovtracker-org/TarkovTracker/issues/136) ([1ced0ad](https://github.com/tarkovtracker-org/TarkovTracker/commit/1ced0ad1a777ea1d462472fe84069cc59d47ead2)), closes [#imports](https://github.com/tarkovtracker-org/TarkovTracker/issues/imports)
* resolve ESLint errors across codebase ([e96db47](https://github.com/tarkovtracker-org/TarkovTracker/commit/e96db47f702699cf1aacd1cc9d985c80350e17bf))
* **app:** resolve hideout status, objective count, and preferences sync bugs ([611df69](https://github.com/tarkovtracker-org/TarkovTracker/commit/611df695d315e42515d07ba78deb931b48f46311))
* resolve Jump to Map functionality for task objectives ([52d7ea5](https://github.com/tarkovtracker-org/TarkovTracker/commit/52d7ea53a45e602b7d260f5f59c47fcc2d78ab31))
* **app:** resolve preferences sync race condition and simplify metadata initialization ([129df5d](https://github.com/tarkovtracker-org/TarkovTracker/commit/129df5df9abc777e145ac5fabce1bd77c998a394))
* **settings:** resolve privacy mode infinite loading and add cooldown ([a775cc3](https://github.com/tarkovtracker-org/TarkovTracker/commit/a775cc3bcfac2a0d7141250e78622df5461ebb7c))
* resolve Ref unlock gating and migrate legacy task completions ([af3e707](https://github.com/tarkovtracker-org/TarkovTracker/commit/af3e707379081ca35cab00b989a9870e0146cf79))
* Resolve RLS recursion and broaden select policy for team memberships, and improve settings page robustness. ([ce66cfa](https://github.com/tarkovtracker-org/TarkovTracker/commit/ce66cfad32a53f78460e4bd98d663dec8dfa11f2))
* resolve strict type errors in progress completion handling ([9de7088](https://github.com/tarkovtracker-org/TarkovTracker/commit/9de70882d03b4f9b5361a7750e2a2aed0926d4c5))
* **app:** resolve timing, state, and correctness bugs across features ([28a543e](https://github.com/tarkovtracker-org/TarkovTracker/commit/28a543e625893b3447f633e95819951a0dc45c9d))
* **app:** resolve TypeScript errors in api-protection and logger ([456255c](https://github.com/tarkovtracker-org/TarkovTracker/commit/456255c71a699bee783b7c85efddb061005cac25))
* resolve z-index context issue where map overlaps nav drawer ([1ed8b88](https://github.com/tarkovtracker-org/TarkovTracker/commit/1ed8b88f8484720a0b2c65b63dcd0404a963e81d))
* **tasks:** respect manual fail flag in repair and normalization ([c145844](https://github.com/tarkovtracker-org/TarkovTracker/commit/c145844a17ddbf9ac6b4f38b7b2f284f6ed9e88a))
* restore objective item icon fallback ([6d04665](https://github.com/tarkovtracker-org/TarkovTracker/commit/6d04665db395365f62f606a52399a03f326c33fb))
* **app:** retry preference sync for multiple missing columns ([2af4dca](https://github.com/tarkovtracker-org/TarkovTracker/commit/2af4dca0645bd5cd58b8c493433e77cd8fd542a3))
* sanitize sensitive table errors in account deletion logs ([d205ceb](https://github.com/tarkovtracker-org/TarkovTracker/commit/d205cebcd75ff387d7bb3c8cbbe49fdc5480252b))
* simplify manual level editing tooltip and button logic ([66be923](https://github.com/tarkovtracker-org/TarkovTracker/commit/66be92325b055a8972b7c6e5935b314ab5375484))
* **i18n:** standardize task terminology and add Found in Raid translations ([6ffc27a](https://github.com/tarkovtracker-org/TarkovTracker/commit/6ffc27a32f21d9ad1165f41920edd14881e80272)), closes [#109](https://github.com/tarkovtracker-org/TarkovTracker/issues/109)
* streamline needed items visibility ([cfaacb5](https://github.com/tarkovtracker-org/TarkovTracker/commit/cfaacb546b81a3666b18bbbc4c31adee4f02acc0))
* **oauth:** streamline Supabase client usage in consent.vue ([e2ec606](https://github.com/tarkovtracker-org/TarkovTracker/commit/e2ec606b5a72521a530caf740b68a04979d1c2e5))
* **test:** strengthen assertions and reduce test fragility ([b5b7362](https://github.com/tarkovtracker-org/TarkovTracker/commit/b5b73629a487be77d91c2e1ffc7ce5a579dbd5b6))
* **settings:** support decimal skill input precision ([#160](https://github.com/tarkovtracker-org/TarkovTracker/issues/160)) ([17d7107](https://github.com/tarkovtracker-org/TarkovTracker/commit/17d710762a2af438ff3d7586e75cbdec11f7fae5)), closes [#159](https://github.com/tarkovtracker-org/TarkovTracker/issues/159)
* suppress false progress merge toast for self-origin sync ([aa7903d](https://github.com/tarkovtracker-org/TarkovTracker/commit/aa7903da98a8fdc529bde6715e3eeed514ba05aa))
* sync derived level to database when automatic level calculation is enabled ([9317e8b](https://github.com/tarkovtracker-org/TarkovTracker/commit/9317e8b275f07ab19efe9ca459475c0d04739c58))
* **maps:** sync Interchange bounds with tarkov.dev ([a5954e6](https://github.com/tarkovtracker-org/TarkovTracker/commit/a5954e63ccbcaf3c7c36c4fa4050ce5f965fab5f))
* Synchronize user team membership in `user_system` and client store when attempting to create or join a team. ([961877e](https://github.com/tarkovtracker-org/TarkovTracker/commit/961877ee5d5ec3a3374e8affc13d908c87e2b588))
* task badge count does not update according to task preferences. ([#132](https://github.com/tarkovtracker-org/TarkovTracker/issues/132)) ([a68c6a0](https://github.com/tarkovtracker-org/TarkovTracker/commit/a68c6a018894657a820bf9210860c0b247af0490))
* **tasks:** treat failed tasks as incomplete for impact scoring ([c4f374e](https://github.com/tarkovtracker-org/TarkovTracker/commit/c4f374ea4697120c038e4926bdd3f74dbdf26626))
* tune api-gateway rate limiting and CORS ([af83d3b](https://github.com/tarkovtracker-org/TarkovTracker/commit/af83d3bb252038335f6005d2d59c2608c315b9dc))
* **deps:** update @unhead/vue and @cloudflare/workers-types to latest versions ([3237809](https://github.com/tarkovtracker-org/TarkovTracker/commit/323780946ab6db5abab957cb8e58bab8e9931db2))
* update comments, formatting, and loading screen logic ([73fa6d0](https://github.com/tarkovtracker-org/TarkovTracker/commit/73fa6d0c0e3d77f9c5c379f76d52565bd1ee81f1))
* **config:** update migrations and database types for preferences and security ([db2dd3e](https://github.com/tarkovtracker-org/TarkovTracker/commit/db2dd3e354c17e3464c469e2c48e4596cdd4fede))
* **ui:** update nav drawer behavior ([4f4d705](https://github.com/tarkovtracker-org/TarkovTracker/commit/4f4d7056436041b3988b5b9a3defb2c8b2e8cbd2))
* **dependencies:** update package versions for @cloudflare/workers-types, @types/node, happy-dom, and supabase ([f24b017](https://github.com/tarkovtracker-org/TarkovTracker/commit/f24b01773084db30f729e52ab6518878eba5dda5))
* update transform type to allow null return in SupabaseSyncConfig ([31cab8b](https://github.com/tarkovtracker-org/TarkovTracker/commit/31cab8b763483298555d4ac9175bceec2e803b13))
* **tasks:** use direct parents instead of transitive predecessors for locked count ([05dc056](https://github.com/tarkovtracker-org/TarkovTracker/commit/05dc0566687b2970e032411b065d790572f68c06))
* use function-based $patch for reset to fully replace nested state ([ce4f8e2](https://github.com/tarkovtracker-org/TarkovTracker/commit/ce4f8e293289bee3e13516258576b8b3234fa6e3))
* use ResizeObserver to handle container resizing and fix centering during init ([352dfc7](https://github.com/tarkovtracker-org/TarkovTracker/commit/352dfc7410460cac42234130a394393775dcc591))
* use solid (default) variant for action buttons ([53613b9](https://github.com/tarkovtracker-org/TarkovTracker/commit/53613b9d917582d66d8dc512ea9249e925701fa6))
* use useRuntimeConfig for Supabase credentials in team/members API route ([4e52e5a](https://github.com/tarkovtracker-org/TarkovTracker/commit/4e52e5a420587e04d4a8767a0c5c93f374c121d4))
* **test:** verify prototype pollution throws with descriptive message ([d61f704](https://github.com/tarkovtracker-org/TarkovTracker/commit/d61f704092e307fa850dace235f9a164c60ad19b))


### Features

* add admin panel with cache management and audit logging ([30d1b10](https://github.com/tarkovtracker-org/TarkovTracker/commit/30d1b10008396185fe648b4be68bb12645b7948e))
* add api gateway and game-mode token prefixes ([9ec709b](https://github.com/tarkovtracker-org/TarkovTracker/commit/9ec709b1d4e438e30ef26562132e32ade3592cc9))
* add api subdomain routes ([ee2e51c](https://github.com/tarkovtracker-org/TarkovTracker/commit/ee2e51c6b4a80c936b01fec8f040bb1ec3902fc9))
* add BaseProgressBar component and user preferences migration ([dea10a0](https://github.com/tarkovtracker-org/TarkovTracker/commit/dea10a0ed2fceb092d5bf9b798ce4624da7fa903))
* **app:** add changelog feature and dismissable dashboard notice ([2565bd7](https://github.com/tarkovtracker-org/TarkovTracker/commit/2565bd71b0667ab83ce16bd5556025c7b4e23e2a))
* **i18n:** add Chinese translations and translation script ([b8f7c36](https://github.com/tarkovtracker-org/TarkovTracker/commit/b8f7c3678dcd5c0eb9d8e182961ebcb448b7528d))
* **ci:** add CI/CD automation, git hooks, and dev tooling ([#142](https://github.com/tarkovtracker-org/TarkovTracker/issues/142)) ([0fe81d9](https://github.com/tarkovtracker-org/TarkovTracker/commit/0fe81d9fdae9dc3a286bdff4522d2ecb6d43b625))
* add Claude plugin with Tarkov MCP servers ([12e1f94](https://github.com/tarkovtracker-org/TarkovTracker/commit/12e1f94500ba78522234c7c6a2e199be04f69051))
* **traders:** add click-to-filter navigation and fix display issues ([ff6df3a](https://github.com/tarkovtracker-org/TarkovTracker/commit/ff6df3af9b58ba9e4c906d8f6d574d8a572f7390))
* add Cloudflare Worker for team API gateway ([7a9befe](https://github.com/tarkovtracker-org/TarkovTracker/commit/7a9befee6a154ae0a7a8137f677a245d1ac30cac))
* **tests:** add comprehensive unit tests for various components and utilities ([14d92ca](https://github.com/tarkovtracker-org/TarkovTracker/commit/14d92ca6525755da975024016230b5c3a0675d83))
* **hideout:** add configurable prerequisite filters ([138d4d7](https://github.com/tarkovtracker-org/TarkovTracker/commit/138d4d75bea571f5374ca873f43e7e90fe51b918))
* **tasks:** add context menu to task dependency links and improve deep linking ([985676a](https://github.com/tarkovtracker-org/TarkovTracker/commit/985676aca8fa8076f4480d563b9d170a8f9e6ee7))
* **neededitems:** add context menu with wiki and tarkov.dev links ([9cfb42d](https://github.com/tarkovtracker-org/TarkovTracker/commit/9cfb42d0e4d78180ce7c49ecd52e1d477c84584a))
* add Deno stubs and configuration for Supabase functions ([d1075c9](https://github.com/tarkovtracker-org/TarkovTracker/commit/d1075c9f76aa0f8d0779b75f0df346bb7b425ed6))
* add error logging to error page component ([8121a12](https://github.com/tarkovtracker-org/TarkovTracker/commit/8121a12d62177eedb310300f8adf8cc0f5569f9f))
* add experimental payload extraction configuration to nuxt.config.ts ([73670ff](https://github.com/tarkovtracker-org/TarkovTracker/commit/73670ffeedbfe141567bee2ae21626cff61c97c6))
* **team:** add exponential backoff retry for teammate stores ([c4f803d](https://github.com/tarkovtracker-org/TarkovTracker/commit/c4f803d543dd481523b3856de074d326558bd0d9))
* **api-docs:** add favicon link to API documentation ([3ce7bef](https://github.com/tarkovtracker-org/TarkovTracker/commit/3ce7bef1df17a014587357bd3d3796a5090b666f))
* add formatting and linting guideline to repository instructions ([f91f33c](https://github.com/tarkovtracker-org/TarkovTracker/commit/f91f33c9b8d578182534546069532680897df1af))
* add game mode separation for teams (PvP/PvE) ([e1624cd](https://github.com/tarkovtracker-org/TarkovTracker/commit/e1624cd442cf9c9c5c2c8b8fe8894a85d5fd8ab2))
* add gateway fallback support to team API composable ([5054822](https://github.com/tarkovtracker-org/TarkovTracker/commit/50548225b421d25ac1f3e6399134a4351e6f6716))
* **changelog:** add GitHub API rate-limit tracking and localStorage caching ([9b6d2b6](https://github.com/tarkovtracker-org/TarkovTracker/commit/9b6d2b6f619c97fce13e3630a915580307b133c9))
* add GitHub as an OAuth provider and update related components ([99559f3](https://github.com/tarkovtracker-org/TarkovTracker/commit/99559f35b77bab678569bfd9734de43300d096a8))
* **tasks:** add global accent variant to task cards ([2c579f8](https://github.com/tarkovtracker-org/TarkovTracker/commit/2c579f84616b60e24d74b2a2daa55b2fd97e7dd8))
* add Google OAuth as login provider ([3a29bd2](https://github.com/tarkovtracker-org/TarkovTracker/commit/3a29bd2a5b542ad7e9a484ad9fdb47d44240a4cc))
* add graphql configuration files to .gitignore ([44d411f](https://github.com/tarkovtracker-org/TarkovTracker/commit/44d411fbc6479073719bff41dfc63cc37dd89e9f))
* **maps:** add grid-based PMC spawn clustering with zoom-dependent rendering ([91b84e0](https://github.com/tarkovtracker-org/TarkovTracker/commit/91b84e09be38cd265ada3149dcc599a9a3febd81)), closes [#84](https://github.com/tarkovtracker-org/TarkovTracker/issues/84)
* add hideout items dashboard card, gateway resilience, and needed-items route sync ([ef51ab5](https://github.com/tarkovtracker-org/TarkovTracker/commit/ef51ab5f6bf61321c07b0a5800091d2bb5ede38e))
* **i18n:** add hideout prereq confirmation strings ([c79613a](https://github.com/tarkovtracker-org/TarkovTracker/commit/c79613a6ddd906d4f91698d3223b246314232d04))
* **app:** add hideout prereq preferences and preference migration ([84e96b4](https://github.com/tarkovtracker-org/TarkovTracker/commit/84e96b412f434279b425635ca17eda51a732b730))
* Add hideout station anchor links and refactor requirement count management. ([5c183da](https://github.com/tarkovtracker-org/TarkovTracker/commit/5c183dae56fd525225a72baf4548b6bc61873be7))
* add holiday effects with toggle ([84ad13f](https://github.com/tarkovtracker-org/TarkovTracker/commit/84ad13ffba93bca2216b6fbba58184e6ec798498))
* add interactive Leaflet map system with floor switching ([32ff63e](https://github.com/tarkovtracker-org/TarkovTracker/commit/32ff63ee1b031e4ea89d6f5fea9fd12accc5f8b7))
* **neededitems:** add item grouping, FIR filtering, and improved card layouts ([4c5847e](https://github.com/tarkovtracker-org/TarkovTracker/commit/4c5847e12d258f213c7275791d9938acaabc496c))
* **api:** add items-lite endpoint and refactor data fetching ([57bfb1c](https://github.com/tarkovtracker-org/TarkovTracker/commit/57bfb1cbc145f1471e42124f318f708f9d107409))
* **maps:** add map color and pan-speed preferences ([0bacf37](https://github.com/tarkovtracker-org/TarkovTracker/commit/0bacf37d3615b7663802d754349ca2284f2a8cfb))
* add missing user_preferences columns for client sync ([cae0662](https://github.com/tarkovtracker-org/TarkovTracker/commit/cae0662531a193a1196c2dca9c11ad785a443970))
* **app:** add module completion and currency exclusion to dashboard hideout stats ([9a18731](https://github.com/tarkovtracker-org/TarkovTracker/commit/9a18731d23fc1ebe25bfddfc6b075cc1cc154b16))
* **app:** add offline mode support and UI improvements ([8c1bc66](https://github.com/tarkovtracker-org/TarkovTracker/commit/8c1bc66293ba45643f7f9a218247f7670a1f780d))
* **api-gateway:** add OpenAPI documentation and update routing for API endpoints ([99e627f](https://github.com/tarkovtracker-org/TarkovTracker/commit/99e627f8725a889a1ac0ba7b649eb802d09d52c5))
* add OpenAPI validation script and update OpenAPI spec ([3356206](https://github.com/tarkovtracker-org/TarkovTracker/commit/33562065e90ec50b1cda8850f3914998c92ad101))
* add performance instrumentation for debugging and profiling ([531b32f](https://github.com/tarkovtracker-org/TarkovTracker/commit/531b32f2bfc7ac8e6488b8aed1caa4dde241117c))
* **tasks:** add QuestObjectivesSkeleton loading placeholder component ([615eaf9](https://github.com/tarkovtracker-org/TarkovTracker/commit/615eaf9caf54f9412f2d2b5ece06ae788b7b2500))
* add real-time task sync for team members ([a76dfa6](https://github.com/tarkovtracker-org/TarkovTracker/commit/a76dfa651dc2ce39e2cee9b3e3dddaef02320c00))
* add SEO improvements, loading screen, and automatic level calculation ([851ad91](https://github.com/tarkovtracker-org/TarkovTracker/commit/851ad91353c816f1bcf604ffcc31028e6b7600ce))
* **cache:** add server-side cache purge synchronization ([7087f3b](https://github.com/tarkovtracker-org/TarkovTracker/commit/7087f3bf1708a182c5afd4357436297d0b0317b9))
* **ui:** add task pin tooltip and refine discord hover color ([959b572](https://github.com/tarkovtracker-org/TarkovTracker/commit/959b57293f7c5f9542e795f623795309745c3594))
* **tasks:** add task settings modal with filter and appearance options ([f98b47f](https://github.com/tarkovtracker-org/TarkovTracker/commit/f98b47fd1800917eff065b4a2f16e8a2794f267e))
* add task sorting controls ([4ea1519](https://github.com/tarkovtracker-org/TarkovTracker/commit/4ea15190a36e854c071b8a5716450c171ce6c834))
* add team API response type definitions ([775112d](https://github.com/tarkovtracker-org/TarkovTracker/commit/775112dad2ebea43a9eec0298863ebe5e113edae))
* add team progress endpoint and do rate limiter ([3f05817](https://github.com/tarkovtracker-org/TarkovTracker/commit/3f058172c521778bbe8b5951e08123a84c70bedb))
* **i18n:** add teammate retry toast and needed-items SEO locale keys ([f5ab736](https://github.com/tarkovtracker-org/TarkovTracker/commit/f5ab736ed198800f04ee445639743b9fbe2dbd83))
* **maps:** add tile fallback URLs with automatic error recovery ([dc48d6d](https://github.com/tarkovtracker-org/TarkovTracker/commit/dc48d6d44670b6e50f03ef7a9ed7a5d42b8bc092))
* add tooltip to TaskFilterBar settings button and update test stubs ([d155db8](https://github.com/tarkovtracker-org/TarkovTracker/commit/d155db80a0a7488f1328f92af2b797a8eefb7329))
* **tasks:** add tooltips for minimum player level and quest requirements ([af21657](https://github.com/tarkovtracker-org/TarkovTracker/commit/af2165770c5670fdcb67379e6a84227d1e7d8c34))
* Add trader display order and enhance task objective handling ([00c2b57](https://github.com/tarkovtracker-org/TarkovTracker/commit/00c2b5716d45eec481c8294063d4628070747a22))
* **tasks:** add trader quest dependency graph view ([a549c4e](https://github.com/tarkovtracker-org/TarkovTracker/commit/a549c4e3c3e58e752079e8b915a4324c7d567fed))
* Add Traders page, enhance needed item tracking logic, and implement UI/UX improvements with new components and image optimizations. ([72fa574](https://github.com/tarkovtracker-org/TarkovTracker/commit/72fa5749e72a99b83b97bf41dc3425f7d23acae5))
* add type guard for ID-keyed arrays and improve ID handling in merge functions ([8ac0ee7](https://github.com/tarkovtracker-org/TarkovTracker/commit/8ac0ee75f94555ef42f5de4e236ead2b0cc1f391))
* Add UI and logic for managing team display names, including new localization strings. ([4151579](https://github.com/tarkovtracker-org/TarkovTracker/commit/4151579b79afc36aac95b9769cae887b4f5e66ff))
* add user preferences for task filters and UI improvements ([b35096b](https://github.com/tarkovtracker-org/TarkovTracker/commit/b35096bf6c5f82e45bfeb693eebd226f435f660e))
* add utilities, types, and color linting scripts ([20309a5](https://github.com/tarkovtracker-org/TarkovTracker/commit/20309a52a29e733d29dd14756a5ec9ef28063e6b))
* add XP/skill calculation, prestige system, and major UI improvements ([37acbf8](https://github.com/tarkovtracker-org/TarkovTracker/commit/37acbf81113860a31a503b0ff2f99a94d63e4ce1))
* **maps:** add zoom speed control ([358ecf7](https://github.com/tarkovtracker-org/TarkovTracker/commit/358ecf7aba3bbc2d4a1ad2e321f72499e900a12f))
* **i18n:** added Chinese translations with English locale ([4dccca7](https://github.com/tarkovtracker-org/TarkovTracker/commit/4dccca7b5bc5a3f4ad369a071b119d3cde6100a2))
* **tasks:** Added task keys full name and hover copy name button ([#131](https://github.com/tarkovtracker-org/TarkovTracker/issues/131)) ([48780c7](https://github.com/tarkovtracker-org/TarkovTracker/commit/48780c7846e0ffca3882d8066704092ca7ef527f))
* allow 'password' as an alias for 'join_code' in team creation and joining functions. ([9e7cd01](https://github.com/tarkovtracker-org/TarkovTracker/commit/9e7cd01f1d8184013a3c4c4232f32ba967c42b99))
* compact skills settings and polish UI ([6f150ba](https://github.com/tarkovtracker-org/TarkovTracker/commit/6f150ba6baeca854de63e0dba70a136548e40cf2))
* **dashboard:** consolidate update notice and compact filter indicator ([7641893](https://github.com/tarkovtracker-org/TarkovTracker/commit/7641893e4b9873b3157cdefacf8843f223b29ccc))
* disable prestige in PVE mode and enhance overlay task injection ([cbd5cd9](https://github.com/tarkovtracker-org/TarkovTracker/commit/cbd5cd921eed32b0592c0f5f9208bc039bcebc0e))
* disable smooth scroll for window-scrolled pages ([503fd64](https://github.com/tarkovtracker-org/TarkovTracker/commit/503fd64d2d2e2b3ee9ef407efd6595c137f7c5e1))
* **tasks:** dock settings drawer beside map on large screens ([f47bb60](https://github.com/tarkovtracker-org/TarkovTracker/commit/f47bb600875e3fce5bcc61f39d1fb6fae54d43e4))
* enable API tokens feature and configure gateway ([655da56](https://github.com/tarkovtracker-org/TarkovTracker/commit/655da56bdc0c33fac9d007a56fc7520fb55270e5))
* Enable real-time team data synchronization and add a new team creation UI update error message. ([939975d](https://github.com/tarkovtracker-org/TarkovTracker/commit/939975d0acdd9e5a4821ee7a9daed0c3285813f1))
* enable smart placement for api-gateway worker ([07913ed](https://github.com/tarkovtracker-org/TarkovTracker/commit/07913ed04a2dc7768eafa8ce07ab8301b6b666d7))
* **hideout:** enforce prereq cascades with confirmation ([beb41d4](https://github.com/tarkovtracker-org/TarkovTracker/commit/beb41d409982fbcd115b723bbfc4575be27a7869))
* **utils:** enhance async, objectPath, and mapCoordinates utilities ([1b4e633](https://github.com/tarkovtracker-org/TarkovTracker/commit/1b4e633a7b053c00d72591e21ad696236b71d331))
* **ui:** enhance dashboard cards ([51aac13](https://github.com/tarkovtracker-org/TarkovTracker/commit/51aac138f1b52e5828d8d4398777d788160dd7ac))
* enhance data migration functionality with improved state management and API token handling ([336a2f8](https://github.com/tarkovtracker-org/TarkovTracker/commit/336a2f81db6cd886538284af05c1ee31cb19302e))
* Enhance hideout item requirements with Found in Raid status and attributes ([649e729](https://github.com/tarkovtracker-org/TarkovTracker/commit/649e72909a996f75eaf14d1835e5099cda8bdc92))
* enhance localization and user preferences ([940784e](https://github.com/tarkovtracker-org/TarkovTracker/commit/940784ea1eee2924882a93d66c22822a500c81ca))
* **maps:** enhance map composables and add sync script ([ed7b8b0](https://github.com/tarkovtracker-org/TarkovTracker/commit/ed7b8b0cc33a0093affd405c86444c70aea5b8d1))
* enhance modal layout with improved scrolling and responsive design ([7604791](https://github.com/tarkovtracker-org/TarkovTracker/commit/760479101c6e897d1a299480256d5b8f8f3c63ab))
* **ui:** enhance needed items filtering and display ([f324319](https://github.com/tarkovtracker-org/TarkovTracker/commit/f324319dc2e5359761e05d639f119b414da1fc22))
* enhance needed items kappa filtering and indicators ([9ee5d6f](https://github.com/tarkovtracker-org/TarkovTracker/commit/9ee5d6f1004a58d5487214a57d452c9e08cd9131))
* **ui:** enhance needed items view ([38a187e](https://github.com/tarkovtracker-org/TarkovTracker/commit/38a187e632f4fed54f85f532d4c1a69168a17e64))
* enhance NeededItemsFilterBar with search focus handling and filter bar interactions ([a16ebbf](https://github.com/tarkovtracker-org/TarkovTracker/commit/a16ebbfecc9d05a1e95f01d3354bf8fbf19543ff))
* enhance objective type inference in overlay utility ([ae8fcbf](https://github.com/tarkovtracker-org/TarkovTracker/commit/ae8fcbf166703bf1265f16edc2ca1d6c13bc9776))
* **sync:** enhance Supabase sync with error handling and fallback logic ([e7f080d](https://github.com/tarkovtracker-org/TarkovTracker/commit/e7f080d8ff66c87fea2d6183ffa8c213ddbb8a95))
* enhance task and tooltip interactions with pinned tasks ([92a43f7](https://github.com/tarkovtracker-org/TarkovTracker/commit/92a43f787736ec4a11d7bf01e8c75802d581ea0d))
* **progress:** enhance task completion handling and update OpenAPI spec ([602fbdc](https://github.com/tarkovtracker-org/TarkovTracker/commit/602fbdced7b1c49a78dae26f45322f60ca77b3fb))
* **tasks:** enhance task completion logic and add tests for alternative task handling ([b930e58](https://github.com/tarkovtracker-org/TarkovTracker/commit/b930e5889211847b2ab05b77f1de114f812fca9b))
* enhance task filtering and UI components with improved imports and localization ([20c8c30](https://github.com/tarkovtracker-org/TarkovTracker/commit/20c8c301b9464aa8eb50ac425b1a079f0fd5f7ba))
* enhance TaskCardHeader with dynamic linking and improved tooltips ([381d52e](https://github.com/tarkovtracker-org/TarkovTracker/commit/381d52eba524ea92be2145fd4e0109040155dfa2))
* Enhance team collaboration features and improve code quality ([19f1c0e](https://github.com/tarkovtracker-org/TarkovTracker/commit/19f1c0e5367a6aa98f96b6e28b11e9cf5cc142fe))
* Enhance team management with join code and owner_id support, and synchronize user's team status in `user_system`. ([43949f0](https://github.com/tarkovtracker-org/TarkovTracker/commit/43949f06c9477d88b896c075c4af90846875231e))
* Enhance team member card with owner badge and improve team invite link management with show/hide and copy functionality. ([2e0ddfc](https://github.com/tarkovtracker-org/TarkovTracker/commit/2e0ddfc6f25288865c1bd56be74be44fa7a02061))
* **team:** enhance team store and options ([5779143](https://github.com/tarkovtracker-org/TarkovTracker/commit/57791431dd0f85572aac8bafcb53efb6489d044e))
* enhance tooltip functionality and internationalization support ([9cb587d](https://github.com/tarkovtracker-org/TarkovTracker/commit/9cb587dae30f072d15a436776f5a9649b33f65bb))
* enhance UI components and improve localization ([4a97e24](https://github.com/tarkovtracker-org/TarkovTracker/commit/4a97e24d2ee8a364dc32ef1d3985a2d17691f31f))
* enhance UI components with extract badge styles and improve item interaction text ([1e55312](https://github.com/tarkovtracker-org/TarkovTracker/commit/1e553120f7538c3a7196e1f464ad4a76aae6260d))
* enhance UI components with improved styling and highlight features for better user experience ([a1592d9](https://github.com/tarkovtracker-org/TarkovTracker/commit/a1592d9e55da8257de21383f55dd0d82fb2b889d))
* enhance UI configuration and improve TaskCard visibility; add sorting options in needed items ([ce4af90](https://github.com/tarkovtracker-org/TarkovTracker/commit/ce4af90f59259335964f9101281a7555d9ea1b22))
* enhance useInfiniteScroll with improved stickToBottom functionality and auto-load cycle management ([f38bda4](https://github.com/tarkovtracker-org/TarkovTracker/commit/f38bda46f030160fe3a2951da4ad3794cf5ff925))
* enhance user display name handling and update API routes to v2 ([992b27e](https://github.com/tarkovtracker-org/TarkovTracker/commit/992b27e754536ccb06a695ec2b6b30c581caf555))
* **i18n:** expand localizations for new features and improve consistency ([a334364](https://github.com/tarkovtracker-org/TarkovTracker/commit/a3343640c736e01d3eb0437c0e20534fd37ccd38))
* expand needed items filters and craft indicators ([86155ac](https://github.com/tarkovtracker-org/TarkovTracker/commit/86155ac6f0e828dcfd48801df80063cd565f66c9))
* expand task metadata pipeline and progress repair ([0262f87](https://github.com/tarkovtracker-org/TarkovTracker/commit/0262f870e004217e5a404252fe321006748ad4c1))
* filter tasks by edition ([e7e9c6a](https://github.com/tarkovtracker-org/TarkovTracker/commit/e7e9c6a1c143a9f40a3d0b9e53b5e155b570b34d))
* fix various minor layout issues, improve task/ objective highlight when jumping to task from map, link find objective on map to find and hand over objective in the task card ([df7e296](https://github.com/tarkovtracker-org/TarkovTracker/commit/df7e29659270115f42326aa8a430527fa744068e))
* **tasks:** group global tasks in map view section ([076951a](https://github.com/tarkovtracker-org/TarkovTracker/commit/076951a811065d1377c745a482d17830dd54f813))
* **api:** harden cache and protection config ([411d6ff](https://github.com/tarkovtracker-org/TarkovTracker/commit/411d6ff67994390731f784fc944ff21c1a26e13a))
* harden map layer reload cancellation and sync pending updates ([4e9ee53](https://github.com/tarkovtracker-org/TarkovTracker/commit/4e9ee53b025ef26009a5831fffabe60fe6a01c01))
* **tasks:** hide map-complete tasks and add visibility toggle ([#116](https://github.com/tarkovtracker-org/TarkovTracker/issues/116)) ([c40b1ee](https://github.com/tarkovtracker-org/TarkovTracker/commit/c40b1ee2d2548c1984ff306bfdb22f9929f8d468))
* Implement a centralized logging utility and add a codebase review document. ([f042ccb](https://github.com/tarkovtracker-org/TarkovTracker/commit/f042ccb307526ec04e6acf81792f644adbffd014))
* **api:** implement API task update handling and metadata tracking ([311f25a](https://github.com/tarkovtracker-org/TarkovTracker/commit/311f25ad9f2d9e99d0453e12bd2e61742184bdbd))
* Implement API token management and refine team RLS policies ([619c42c](https://github.com/tarkovtracker-org/TarkovTracker/commit/619c42c66c8bac524f873650802e3f0db0b1cb0e))
* implement comprehensive GitHub workflow system ([61ed8b1](https://github.com/tarkovtracker-org/TarkovTracker/commit/61ed8b10904dca0c2898db82d8737dce2689e7d0))
* implement critical cache check to skip loading screen ([79161da](https://github.com/tarkovtracker-org/TarkovTracker/commit/79161da25392c66533293675908e1549cc05720d))
* implement item distribution logic and enhance UI components for better user experience ([0a9df8c](https://github.com/tarkovtracker-org/TarkovTracker/commit/0a9df8c7db7e79b70b0dd630163dcb1a7f27583b))
* Implement multi-layer caching for Tarkov API data using IndexedDB ([f0e3ca7](https://github.com/tarkovtracker-org/TarkovTracker/commit/f0e3ca7af6e22cc1b4b585126c7dcb294e068162))
* **tasks:** implement notification auto-close and close button functionality ([a3840b4](https://github.com/tarkovtracker-org/TarkovTracker/commit/a3840b4c68541850995227ad7c58f498309cffe9))
* implement prototype pollution prevention in objectPath utility ([af647ab](https://github.com/tarkovtracker-org/TarkovTracker/commit/af647ab68f9550af1109113044d2632b21a08da1))
* implement skill level input and validation in useSkillCalculation ([239736f](https://github.com/tarkovtracker-org/TarkovTracker/commit/239736f811aec119e3c01f7651a0c6edff66f29e))
* Implement Supabase Edge Functions, new UI components, and refactor data fetching and page structure. ([e400b2c](https://github.com/tarkovtracker-org/TarkovTracker/commit/e400b2ce10b038cceb26b01d9a23e90f54879962))
* Implement Supabase-backed user preferences and enhance state synchronization logic ([84e8864](https://github.com/tarkovtracker-org/TarkovTracker/commit/84e88644d0a677ad2602603f952c02a11b27ee91))
* Implement team invite acceptance and member kicking, add skill tracking, and optimize Supabase RLS policies and indexing. ([2425fb9](https://github.com/tarkovtracker-org/TarkovTracker/commit/2425fb9b82560d769d71ec55b3fbdde7845781a6))
* improve account deletion and update edge functions ([ededf67](https://github.com/tarkovtracker-org/TarkovTracker/commit/ededf672d3745a389dae4edef61753aff53f02da))
* **app:** improve changelog feed ([af68632](https://github.com/tarkovtracker-org/TarkovTracker/commit/af68632282b58cd7fd6ab089f71a7c73e4d5c4a1))
* **ui:** improve component accessibility, type safety, and UX ([0e7d205](https://github.com/tarkovtracker-org/TarkovTracker/commit/0e7d20506a44c99b664990a3525d9d1eaddf41f1))
* **ui:** improve dashboard components ([6f092de](https://github.com/tarkovtracker-org/TarkovTracker/commit/6f092ded16b8524933e5832ddc67fcf7e5cd6054))
* **hideout:** improve filtering and add prereq modal composable ([c4bda84](https://github.com/tarkovtracker-org/TarkovTracker/commit/c4bda84a95860e8adf177ceed36bc9df2c5bc168))
* improve HideoutCard UI by removing unnecessary elements and enhancing styles ([5543cd9](https://github.com/tarkovtracker-org/TarkovTracker/commit/5543cd97eee03d777855c826914408ad60e70a5b))
* **app:** improve map floor logic, fix race conditions, and localize settings ([9cb0ff3](https://github.com/tarkovtracker-org/TarkovTracker/commit/9cb0ff35c0ea9a11353b8d2a2a1d179b0d4cf8aa))
* improve mobile responsiveness for app bar and navigation drawer ([e35de59](https://github.com/tarkovtracker-org/TarkovTracker/commit/e35de592d0496c723525133cad0d803ad8fea9c1))
* **api:** improve server caching and API protection ([eb6cb1f](https://github.com/tarkovtracker-org/TarkovTracker/commit/eb6cb1f777d3aebb26cdc8d0b28d9be1c286bbb5))
* improve task card UI and objective grouping logic ([4288d70](https://github.com/tarkovtracker-org/TarkovTracker/commit/4288d70d32e4e15c022941ba035197da7a6a57f0))
* improve task objective counts and accessibility ([3db964f](https://github.com/tarkovtracker-org/TarkovTracker/commit/3db964f35e7f8447476e473e5bacf4eb9f3590b7))
* **neededitems:** improve type safety and add team item filtering ([5da019b](https://github.com/tarkovtracker-org/TarkovTracker/commit/5da019b029501d3c329c5d164e6eed6e61da7fe7))
* improve UI components and task display ([bfe5a68](https://github.com/tarkovtracker-org/TarkovTracker/commit/bfe5a6858b1b65f0d2da1d8eb6c9fca478ac5f38))
* initialize Nuxt project with essential files and configurations ([5f33e78](https://github.com/tarkovtracker-org/TarkovTracker/commit/5f33e78f0853cb244d0abf526624da456d39c2fd))
* **oauth:** integrate Supabase for OAuth handling and remove legacy API endpoints ([ec42bfc](https://github.com/tarkovtracker-org/TarkovTracker/commit/ec42bfc5d30ead678172c67bce7f30fbbcfb6b7f))
* introduce ObjectiveRequiredEquipment component and enhance UI with updated color themes ([ca446bd](https://github.com/tarkovtracker-org/TarkovTracker/commit/ca446bd51d2b63e6d930a85df4471cd19be4dfee))
* **app:** localize loading screen, add global tasks section, and clean up stale locale keys ([6bc1975](https://github.com/tarkovtracker-org/TarkovTracker/commit/6bc197561158a94a186a5ade070d63570a1c62cf))
* localize reset confirmations ([fb4f62b](https://github.com/tarkovtracker-org/TarkovTracker/commit/fb4f62b6900e15b3cb03ddf73b354fe8830e6d40))
* make game mode switching asynchronous and refresh all data ([87cde9d](https://github.com/tarkovtracker-org/TarkovTracker/commit/87cde9dbbd8151c546f03d73d80bd8eb42a47e22))
* map view tooltip enhancements ([4e08977](https://github.com/tarkovtracker-org/TarkovTracker/commit/4e089773fef68832c13253183391c4d7e14e36a6))
* mask sensitive account data by default in settings ([566f3f8](https://github.com/tarkovtracker-org/TarkovTracker/commit/566f3f8e48839d0c7a7dbe8f425d0bff45352430))
* **team:** modernize team page UI and fix team data bugs ([6f2c557](https://github.com/tarkovtracker-org/TarkovTracker/commit/6f2c557bacec0031c6220cfaacc168e9a9071694))
* **maps:** move reset view button into native Leaflet zoom control ([7d2e1e0](https://github.com/tarkovtracker-org/TarkovTracker/commit/7d2e1e00fed414d34bf9f9ec37d83c722315103c))
* Normalize team gateway paths to accept trailing slashes and update documentation. ([612f24d](https://github.com/tarkovtracker-org/TarkovTracker/commit/612f24d46ab5051dfb4f511fb604e05472325b6d))
* **ui:** polish components and improve accessibility ([ed7e0c6](https://github.com/tarkovtracker-org/TarkovTracker/commit/ed7e0c688c5af605c68c20e57e34037fb7372f81))
* **settings:** polish settings cards ([b692dba](https://github.com/tarkovtracker-org/TarkovTracker/commit/b692dba498f6c1912e729a44da94e37a02c0c3ec))
* **ui:** polish shell components and drawer layouts ([6568e9d](https://github.com/tarkovtracker-org/TarkovTracker/commit/6568e9d185e5f3f501d8385feabce9784564a013))
* reduce Supabase egress usage ([06ef088](https://github.com/tarkovtracker-org/TarkovTracker/commit/06ef0887afa04d032863d3c07624fe2dfa3176c3))
* Refactor API caching with `useEdgeCache`, introduce `GameItem` component, and enhance team management. ([2e9e804](https://github.com/tarkovtracker-org/TarkovTracker/commit/2e9e8040e50919ffcc1ab138c9ae2aaf2cffd17b))
* refactor NeededItemsFilterBar layout for improved filter and view controls ([eb1d66f](https://github.com/tarkovtracker-org/TarkovTracker/commit/eb1d66f7b3b29d491850bcce03e5202901e4d453))
* **tasks:** refactor task page and extract composables ([e9368a8](https://github.com/tarkovtracker-org/TarkovTracker/commit/e9368a88adc178fc2e6d6f05ca2bd9ef7dde63ee))
* **shell:** refine app shell interactions ([3af8069](https://github.com/tarkovtracker-org/TarkovTracker/commit/3af8069342a2a319f9f2eae548a95bd2cf39ff9a))
* **app:** refine auth flow ([961004e](https://github.com/tarkovtracker-org/TarkovTracker/commit/961004e3ff00afc49f2d026e844ef76be96829f0))
* refine credits page ([88d9660](https://github.com/tarkovtracker-org/TarkovTracker/commit/88d9660dbaf288b4c95d34238f6cf5f2ac724e7c))
* **tasks:** refine filters and cards ([1392b16](https://github.com/tarkovtracker-org/TarkovTracker/commit/1392b160cb6d8b654d59c53085a707a55d017645))
* **ui:** refresh tracker feature surfaces ([b997ca0](https://github.com/tarkovtracker-org/TarkovTracker/commit/b997ca0754c77c14e5164c9eebf41a5ef5b2a017))
* remove api gateway kv usage ([a9838dd](https://github.com/tarkovtracker-org/TarkovTracker/commit/a9838dd6d34e52ba1f8b81031d88fd3b767d619b))
* **map:** shift+scroll zoom, ctrl+scroll floor cycling ([#49](https://github.com/tarkovtracker-org/TarkovTracker/issues/49)) ([49f94dc](https://github.com/tarkovtracker-org/TarkovTracker/commit/49f94dc2cd6581999a8377a4b2067c1d2124a5c4))
* **map:** show extract names on map markers ([#110](https://github.com/tarkovtracker-org/TarkovTracker/issues/110)) ([719672d](https://github.com/tarkovtracker-org/TarkovTracker/commit/719672d89a52f7c29e02fd1a2ff14f7e9de16dd4))
* show global tasks in map view ([#113](https://github.com/tarkovtracker-org/TarkovTracker/issues/113)) ([b72c039](https://github.com/tarkovtracker-org/TarkovTracker/commit/b72c03942c0dcd0dc2b1399837df4f5201645586))
* **tasks:** show requirement statuses and blocked reasons on task cards ([3656c94](https://github.com/tarkovtracker-org/TarkovTracker/commit/3656c94bf49545aabe7223ea395ac27a9326f2b9))
* simplify hover effects and improve cursor styles for single-item cards ([4f8c586](https://github.com/tarkovtracker-org/TarkovTracker/commit/4f8c58684b47138a81fc924e57a3b0dd72576754))
* surface needed-by and optimize task lookups ([3a3a8ba](https://github.com/tarkovtracker-org/TarkovTracker/commit/3a3a8ba5339e2db38d9017b47bcc0eaa7bdddfe1))
* **i18n:** sync German translations with English locale ([a27b6e5](https://github.com/tarkovtracker-org/TarkovTracker/commit/a27b6e56d998b7344f2c96f3f692334ca4cf976c))
* **ui:** tighten task traders and needed-items scrolling ([1b6988f](https://github.com/tarkovtracker-org/TarkovTracker/commit/1b6988f4b280a0474cd49dc2d7fdc3c1803725dd))
* **tasks:** track manual vs automatic task failures ([076c797](https://github.com/tarkovtracker-org/TarkovTracker/commit/076c797f39e766ce177e7515e1729a1b68d470a8))
* UI improvements and component refactoring ([0d47d3e](https://github.com/tarkovtracker-org/TarkovTracker/commit/0d47d3ec322b4528f960a65cbdb703d57570bf30))
* update AppFooter and NavDrawer styles for improved UI ([406968b](https://github.com/tarkovtracker-org/TarkovTracker/commit/406968b2170f9aad606b7e1cd7a703c3b60471bc))
* update background color styles for improved UI aesthetics ([4fd14f9](https://github.com/tarkovtracker-org/TarkovTracker/commit/4fd14f93e47a55376afba3d82fdcd2601244a896))
* **i18n:** update chinese translation ([92eb862](https://github.com/tarkovtracker-org/TarkovTracker/commit/92eb8623e6d88a20b482c0a727208e486a9c178e))
* Update comprehensive analysis document with architecture overview, technology stack, and identified issues ([efb990a](https://github.com/tarkovtracker-org/TarkovTracker/commit/efb990a0378b395d1d7250455c2ff2ae4af3431d))
* update localization strings ([1a1f650](https://github.com/tarkovtracker-org/TarkovTracker/commit/1a1f650dd4008073c897ee2738e6c8b34210ea26))
* **api-gateway:** update OpenAPI validation and configuration, add API_HOST variable ([2b064dc](https://github.com/tarkovtracker-org/TarkovTracker/commit/2b064dc5341f838518e4112b212f3f4e2ce55c8a))
* **ui:** update page layouts and error states ([2324ba4](https://github.com/tarkovtracker-org/TarkovTracker/commit/2324ba41b1a3bcfe1acb1f6efbc1de9ec121c912))
* **settings:** update settings UI and skills card ([8721a7e](https://github.com/tarkovtracker-org/TarkovTracker/commit/8721a7eff2834e8c75929b899128afb6e2feca47))
* Update Supabase client imports and enhance token management functions ([3344590](https://github.com/tarkovtracker-org/TarkovTracker/commit/33445908a671bc4e191595fc84d827464fec125b))
* **i18n:** update translations for all locales ([55e37bb](https://github.com/tarkovtracker-org/TarkovTracker/commit/55e37bbf05d85a00ba1b0f6e8d54017f9b8fb2a6))
* **i18n:** update welcome message to include user display name across multiple languages ([214e9fe](https://github.com/tarkovtracker-org/TarkovTracker/commit/214e9fe96956d226c8cb1f3ebe72107a02bf8d11))


### Performance Improvements

* **api:** implement LRU eviction for changelog stats cache ([9310be9](https://github.com/tarkovtracker-org/TarkovTracker/commit/9310be966708abb8132811de8c2a429370c3a481))
* memoize levels and harden dashboard fallback ([da900c9](https://github.com/tarkovtracker-org/TarkovTracker/commit/da900c9ed6d41050448c136fcd99a9b68706a6c6))
* remove graphology from initial client bundle ([9e1975f](https://github.com/tarkovtracker-org/TarkovTracker/commit/9e1975fc2a528615d95bd49484487bd64b1a9289))


### Reverts

* Revert "feat(ci): add CI/CD automation, git hooks, and dev tooling ([#142](https://github.com/tarkovtracker-org/TarkovTracker/issues/142))" ([#154](https://github.com/tarkovtracker-org/TarkovTracker/issues/154)) ([f664655](https://github.com/tarkovtracker-org/TarkovTracker/commit/f66465556ab95617491bb9715ff319154514a117))
* Revert "Revert "feat(ci): add CI/CD automation, git hooks, and dev tooling (#…" ([#155](https://github.com/tarkovtracker-org/TarkovTracker/issues/155)) ([bfa0dbd](https://github.com/tarkovtracker-org/TarkovTracker/commit/bfa0dbdf17680bb496e614654c35af0a4bc4d2b8))
