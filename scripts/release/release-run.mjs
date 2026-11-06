import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import semanticRelease from 'semantic-release';
import { ReleasePrepared, preparedContext } from './release-commit.mjs';
import { captureGitHubNotes } from './release-promotion-notes.mjs';
/** Only our successful staging signal is swallowed; tool/plugin failures remain failures. */
function stageRelease() {
  const config = JSON.parse(
    readFileSync(new URL('../../.releaserc.json', import.meta.url), 'utf8')
  );
  // Publication/recovery belongs to the separately revalidated main phase. Do not run the GitHub
  // plugin's failure hooks for the intentional staging stop or grant staging tag authority.
  config.plugins = config.plugins.filter((plugin) => plugin !== '@semantic-release/github');
  return semanticRelease(config);
}
export async function runRelease(release = stageRelease, captureNotes = captureGitHubNotes) {
  try {
    return await release();
  } catch (error) {
    if (!(error instanceof ReleasePrepared)) throw error;
    await captureNotes(preparedContext(error));
    console.info(error.message);
    return false;
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runRelease();
