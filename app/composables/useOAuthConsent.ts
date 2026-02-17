import { logger } from '@/utils/logger';
import {
  sanitizeForDebugLog,
  toSafeRedirectUri,
  validateOAuthRedirectUri,
} from '@/utils/oauthConsent';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
export interface OAuthAuthorizationDetails {
  user?: { id: string; email: string };
  scope?: string;
  authorization_id: string;
  redirect_url?: string;
  redirect_uri?: string;
  client?: { id: string; name: string; uri?: string; logo_uri?: string };
}
interface OAuthConsentDependencies {
  navigateToFn?: typeof navigateTo;
  oauthLogger?: typeof logger;
  route?: Pick<RouteLocationNormalizedLoaded, 'fullPath' | 'query'>;
}
export interface UseOAuthConsentResult {
  authorizationId: Ref<string>;
  details: Ref<OAuthAuthorizationDetails | null>;
  error: Ref<string>;
  fetchAuthorization: () => Promise<void>;
  init: () => Promise<void>;
  loading: Ref<boolean>;
  logger: typeof logger;
}
const resolveAuthorizationId = (
  routeQuery: Pick<RouteLocationNormalizedLoaded, 'query'>['query']
): string => {
  const value = routeQuery.authorization_id;
  return typeof value === 'string' ? value : '';
};
const resolveQueryStringParam = (
  routeQuery: Pick<RouteLocationNormalizedLoaded, 'query'>['query'],
  key: string
): string | undefined => {
  const value = routeQuery[key];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === 'string' ? firstValue : undefined;
  }
  return undefined;
};
export function useOAuthConsent(
  dependencies: OAuthConsentDependencies = {}
): UseOAuthConsentResult {
  const route = dependencies.route ?? useRoute();
  const navigateToFn = dependencies.navigateToFn ?? navigateTo;
  const oauthLogger = dependencies.oauthLogger ?? logger;
  const { client: supabase } = useNuxtApp().$supabase;
  const authorizationId = ref('');
  const loading = ref(true);
  const error = ref('');
  const details = ref<OAuthAuthorizationDetails | null>(null);
  const fetchAuthorization = async () => {
    loading.value = true;
    error.value = '';
    details.value = null;
    authorizationId.value = resolveAuthorizationId(route.query);
    if (!authorizationId.value) {
      error.value = 'Missing authorization_id parameter';
      loading.value = false;
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await navigateToFn({ path: '/login', query: { redirect: route.fullPath } });
        return;
      }
      const { data, error: fetchError } = await supabase.auth.oauth.getAuthorizationDetails(
        authorizationId.value
      );
      const sanitizedData = sanitizeForDebugLog(data);
      oauthLogger.debug('[OAuth] Authorization details:', JSON.stringify(sanitizedData, null, 2));
      if (fetchError) {
        if (fetchError.message?.includes('cannot be processed')) {
          error.value = 'This authorization request has expired or was already processed.';
        } else {
          throw fetchError;
        }
        return;
      }
      if (data && 'redirect_url' in data) {
        const redirectData = data as { redirect_url: string };
        const isSafeRedirect = validateOAuthRedirectUri(redirectData.redirect_url, {
          expectedRedirectUri: resolveQueryStringParam(route.query, 'redirect_uri'),
          preservedQuerySource: resolveQueryStringParam(route.query, 'redirect_url'),
        });
        if (!isSafeRedirect) {
          oauthLogger.warn('[OAuth] Blocked invalid redirect URL:', {
            authorizationId: authorizationId.value,
            redirectUri: toSafeRedirectUri(redirectData.redirect_url),
          });
          error.value = 'Invalid redirect URL returned by authorization service';
          return;
        }
        oauthLogger.debug(
          '[OAuth] Auto-redirecting to:',
          toSafeRedirectUri(redirectData.redirect_url)
        );
        window.location.href = redirectData.redirect_url;
        return;
      }
      if (data && 'authorization_id' in data) {
        details.value = data as OAuthAuthorizationDetails;
      }
    } catch (e) {
      oauthLogger.error('Failed to fetch authorization details', e);
      error.value = e instanceof Error ? e.message : 'Failed to fetch authorization details';
    } finally {
      loading.value = false;
    }
  };
  return {
    authorizationId,
    details,
    error,
    fetchAuthorization,
    init: fetchAuthorization,
    loading,
    logger: oauthLogger,
  };
}
