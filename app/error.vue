<template>
  <div
    class="bg-surface-950 flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center"
  >
    <div
      class="bg-surface-900 border-surface-700/60 w-full max-w-2xl rounded-2xl border px-6 py-8 shadow-2xl"
    >
      <UIcon name="i-mdi-alert-circle-outline" class="text-warning-400 mx-auto h-16 w-16" />
      <h1 class="text-surface-50 mt-4 text-3xl font-semibold sm:text-4xl">
        {{ errorTitle }}
      </h1>
      <p class="text-surface-300 mt-3 text-sm sm:text-base">
        {{ errorDescription }}
      </p>
      <div
        v-if="troubleshootingHint"
        class="bg-warning-500/10 border-warning-500/30 text-warning-100 mt-5 rounded-xl border px-4 py-3 text-left text-sm"
      >
        {{ troubleshootingHint }}
      </div>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <UButton
          size="lg"
          color="primary"
          variant="solid"
          icon="i-mdi-home"
          class="px-6"
          @click="handleError"
        >
          {{ t('error.return_home', 'Return Home') }}
        </UButton>
        <UButton
          v-if="hasTechnicalDetails"
          size="lg"
          color="primary"
          variant="outline"
          icon="i-mdi-bug-outline"
          class="px-6"
          @click="showTechnicalDetails = !showTechnicalDetails"
        >
          {{
            showTechnicalDetails
              ? t('error.hide_details', 'Hide details')
              : t('error.show_details', 'Show details')
          }}
        </UButton>
      </div>
      <div
        v-if="showTechnicalDetails && technicalDetailsText"
        class="bg-surface-950 border-surface-700/60 mt-5 rounded-xl border p-4 text-left"
      >
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p class="text-surface-100 text-sm font-medium">
            {{ t('error.technical_details', 'Technical details') }}
          </p>
          <UButton
            size="sm"
            color="primary"
            variant="ghost"
            icon="i-mdi-content-copy"
            @click="copyTechnicalDetails"
          >
            {{
              copyState === 'done'
                ? t('error.copy_success', 'Copied')
                : t('error.copy_details', 'Copy details')
            }}
          </UButton>
        </div>
        <pre
          class="text-surface-300 max-h-80 overflow-auto text-xs break-all whitespace-pre-wrap"
        ><code>{{ technicalDetailsText }}</code></pre>
      </div>
      <p class="text-surface-500 mt-6 text-xs">
        {{ t('error.status_prefix', 'Error') }} {{ statusCode }}
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  import { sanitizeForDebugLog, toSafeRedirectUri } from '@/utils/oauthConsent';
  import type { NuxtError } from '#app';
  type ErrorRecord = Record<string, unknown>;
  const props = defineProps({
    error: {
      type: Object as () => NuxtError,
      required: true,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const showTechnicalDetails = ref(false);
  const copyState = ref<'idle' | 'done'>('idle');
  const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const readRecord = (value: unknown): ErrorRecord | null =>
    value && typeof value === 'object' ? (value as ErrorRecord) : null;
  const serializeValue = (value: unknown): string => {
    if (value == null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value instanceof Error) {
      return JSON.stringify(
        {
          message: value.message,
          name: value.name,
          stack: value.stack,
        },
        null,
        2
      );
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };
  const errorRecord = computed(() => readRecord(props.error));
  const errorData = computed(() => readRecord(errorRecord.value?.data));
  const errorCause = computed(() => readRecord(errorRecord.value?.cause));
  const sanitizedErrorData = computed(() => sanitizeForDebugLog(errorData.value));
  const sanitizedErrorCause = computed(() => sanitizeForDebugLog(errorCause.value));
  const statusCode = computed(() => props.error.statusCode ?? 500);
  const statusMessage = computed(
    () => readString(props.error.statusMessage) || readString(errorData.value?.statusMessage)
  );
  const errorMessage = computed(
    () =>
      readString(props.error.message) ||
      readString(errorData.value?.message) ||
      readString(errorCause.value?.message)
  );
  const requestUrl = computed(
    () =>
      toSafeRedirectUri(
        readString(errorData.value?.url) ||
          readString(errorRecord.value?.url) ||
          (import.meta.client ? window.location.href : route.fullPath)
      ) || route.path
  );
  const rawDataText = computed(() => serializeValue(sanitizedErrorData.value));
  const troubleshootingHint = computed(() => {
    const combinedText = [statusMessage.value, errorMessage.value, rawDataText.value]
      .join(' ')
      .toLowerCase();
    if (combinedText.includes('invalid host')) {
      return t(
        'error.invalid_host_hint',
        'This preview host is blocked by API host validation. Add the preview hostname to API_ALLOWED_HOSTS or derive it from CF_PAGES_URL.'
      );
    }
    if (combinedText.includes('supabase')) {
      return t(
        'error.supabase_config_hint',
        'This deployment is missing public Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY for previews, or allow preview builds to run in offline mode.'
      );
    }
    if (combinedText.includes('403')) {
      return t(
        'error.request_blocked_hint',
        'A request required to render this page was blocked. Open the technical details and include the failing request URL when reporting the issue.'
      );
    }
    return '';
  });
  const technicalDetails = computed(() => {
    const details = {
      cause: sanitizedErrorCause.value,
      data: sanitizedErrorData.value,
      message: errorMessage.value,
      route: toSafeRedirectUri(route.fullPath) || route.path,
      statusCode: statusCode.value,
      statusMessage: statusMessage.value,
      url: requestUrl.value,
    };
    return Object.fromEntries(
      Object.entries(details).filter(([, value]) => {
        if (typeof value === 'number') {
          return true;
        }
        if (typeof value === 'string') {
          return value.trim().length > 0;
        }
        return value != null;
      })
    );
  });
  const technicalDetailsText = computed(() => serializeValue(technicalDetails.value));
  const hasTechnicalDetails = computed(() => technicalDetailsText.value.trim().length > 2);
  onMounted(() => {
    logger.error(props.error, { context: 'ErrorComponent' });
  });
  const handleError = () => clearError({ redirect: '/' });
  const copyTechnicalDetails = async () => {
    if (!import.meta.client || !technicalDetailsText.value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(technicalDetailsText.value);
      copyState.value = 'done';
      window.setTimeout(() => {
        copyState.value = 'idle';
      }, 2000);
    } catch (error) {
      logger.warn('[ErrorPage] Failed to copy technical details', error);
    }
  };
  const errorTitle = computed(() => {
    if (statusCode.value === 404) {
      return t('error.page_not_found', 'Page Not Found');
    }
    if (statusCode.value === 403) {
      return t('error.access_blocked', 'Access Blocked');
    }
    if (statusCode.value === 503) {
      return t('error.service_unavailable', 'Service Unavailable');
    }
    return t('error.something_went_wrong', 'Something Went Wrong');
  });
  const errorDescription = computed(() => {
    if (statusCode.value === 404) {
      return t('error.page_not_found_description', 'The page you are looking for does not exist.');
    }
    if (errorMessage.value) {
      return errorMessage.value;
    }
    if (statusMessage.value) {
      return statusMessage.value;
    }
    return t(
      'error.unexpected_description',
      'An unexpected error occurred while processing your request.'
    );
  });
</script>
