The `latest` image lags app-ethereum master, and the error points at the app, not at the toolchain

**What happens.** Two occurrences, two months apart:

- 19 September 2026: `make BOLOS_SDK=$FLEX_SDK` on app-ethereum 1.22.4 failed with
  `src/nbgl/ui_nbgl.h:4:10: fatal error: 'nbgl_icons.h' file not found`. The include arrived in app-ethereum on
  13 August (`b9ea1ed8`); the `latest` image pulled a few days earlier carried a Flex SDK from 3 June. After
  `docker pull`, the SDK was from 18 September and it built.
- 10 October 2026: with today's `latest`, app-ethereum `master` fails on
  `src/features/generic_tx_parser/calldata.h:12: error: redefinition of enumerator 'CHUNK_STRIP_LEFT'`
  (20 errors in `ui_logic.o` and `logic_sign_tx.o`). The tagged release `stax_1.10.1_1.22.4_sdk_v26.6.2` builds
  with the same image.

Neither looks like a toolchain problem from the error alone: we spent an hour looking for a missing generated
header in a repository that was fine.

**Suggestion.** Two lines in the README: *"pull the image before every build; `latest` tracks the SDK, not your
checkout — build a tagged release of the app unless you also track the SDK."* Better still, have the build print the
SDK's API level and commit date in its banner (`git -C $BOLOS_SDK log -1 --format='%h %cd'`), so the mismatch is
the first line one reads.
