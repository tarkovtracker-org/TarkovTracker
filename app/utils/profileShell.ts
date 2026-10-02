// Match the raw pathname: encoded separators and extra segments must not become routes.
const PUBLIC_PROFILE_PATH =
  /^\/profile\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\/(?:pvp|pve|seasonal)$(?![\s\S])/;
export const isPublicProfileShellPath = (pathname: string): boolean => {
  return PUBLIC_PROFILE_PATH.test(pathname);
};
