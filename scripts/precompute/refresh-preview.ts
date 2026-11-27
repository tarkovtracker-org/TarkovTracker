import { createKvRestWriter } from './kv';
import { mirrorPreviewCatalog } from './mirror-preview-catalog';
// The trusted writer must target the same isolated binding as the Pages preview.
const PREVIEW_NAMESPACE_ID = '8b1f5caca19c4d379b601e4bd0f815e6';
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
const account = {
  accountId: required('CLOUDFLARE_ACCOUNT_ID'),
  apiToken: required('CLOUDFLARE_API_TOKEN'),
};
const sourceNamespace = required('TARKOV_DATA_KV_NAMESPACE_ID');
if (sourceNamespace === PREVIEW_NAMESPACE_ID) {
  throw new Error('Production and preview catalog namespaces must differ');
}
const source = createKvRestWriter({ ...account, namespaceId: sourceNamespace });
const preview = createKvRestWriter({ ...account, namespaceId: PREVIEW_NAMESPACE_ID });
const result = await mirrorPreviewCatalog(source, preview, process.env.EXPECTED_OVERLAY_SHA);
console.log(JSON.stringify(result));
