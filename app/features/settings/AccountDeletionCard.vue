<script setup lang="ts">
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useSystemStore } from '@/stores/useSystemStore';
  import { resetTarkovSync, useTarkovStore } from '@/stores/useTarkov';
  import { useTeamStore } from '@/stores/useTeamStore';
  import { logger } from '@/utils/logger';
  defineOptions({
    inheritAttrs: false,
  });
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const preferencesStore = usePreferencesStore();
  const systemStore = useSystemStore();
  const teamStore = useTeamStore();
  const tarkovStore = useTarkovStore();
  const showConfirmationDialog = ref(false);
  const showSuccessDialog = ref(false);
  const confirmationText = ref('');
  const confirmationError = ref(false);
  const deleteError = ref('');
  const isDeleting = ref(false);
  const accountIdCopied = ref(false);
  const cleanupScheduled = ref(false);
  const showUsername = ref(false);
  const showEmail = ref(false);
  const showAccountId = ref(false);
  const maskedUsername = computed(() => {
    const username = $supabase?.user?.username;
    if (!username) return 'N/A';
    if (showUsername.value) return username;
    if (username.length <= 3) return '***';
    return username.slice(0, 2) + '***';
  });
  const maskedEmail = computed(() => {
    const email = $supabase?.user?.email;
    if (!email) return 'N/A';
    if (showEmail.value) return email;
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return '***';
    const localPart = email.slice(0, atIndex);
    const domain = email.slice(atIndex);
    const visibleChars = Math.min(2, localPart.length);
    return localPart.slice(0, visibleChars) + '***' + domain;
  });
  const maskedAccountId = computed(() => {
    const id = $supabase?.user?.id;
    if (!id) return 'N/A';
    if (showAccountId.value) return id;
    if (id.length <= 4) return '***';
    return '***' + id.slice(-4);
  });
  const isLoggedIn = computed(() => {
    return Boolean($supabase?.user?.loggedIn);
  });
  type AuthProvider = 'discord' | 'twitch' | 'google' | 'github';
  interface UserWithProviders {
    providers?: string[] | null;
    provider?: string | null;
  }
  const providers = computed<AuthProvider[]>(() => {
    if (!$supabase?.user) return [];
    const user = $supabase.user as UserWithProviders;
    const providersList = user.providers || [];
    if (providersList.length > 0) {
      return providersList.filter(
        (p: string): p is AuthProvider =>
          p === 'discord' || p === 'twitch' || p === 'google' || p === 'github'
      );
    }
    const providerValue = user.provider;
    if (
      providerValue === 'discord' ||
      providerValue === 'twitch' ||
      providerValue === 'google' ||
      providerValue === 'github'
    ) {
      return [providerValue];
    }
    return [];
  });
  const getProviderIcon = (provider: AuthProvider) => {
    if (provider === 'discord') return 'i-mdi-discord';
    if (provider === 'twitch') return 'i-mdi-twitch';
    if (provider === 'google') return 'i-mdi-google';
    if (provider === 'github') return 'i-mdi-github';
    return 'i-mdi-account';
  };
  const getProviderBadgeClass = (provider: AuthProvider) => {
    if (provider === 'google') return 'ring-surface-600 text-surface-900 ring-1';
    if (provider === 'github') return 'ring-surface-600 text-white ring-1';
    return 'text-white ring-1 ring-white/10';
  };
  const getProviderBadgeStyle = (provider: AuthProvider) => {
    if (provider === 'discord') return { backgroundColor: 'var(--color-discord)' };
    if (provider === 'twitch') return { backgroundColor: 'var(--color-twitch)' };
    if (provider === 'google') return { backgroundColor: 'white' };
    if (provider === 'github') return { backgroundColor: 'var(--color-github)' };
    return {};
  };
  const getProviderLabel = (provider: AuthProvider) => {
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };
  const authMethodLabel = computed(() =>
    providers.value.length > 1
      ? t('settings.account_data.auth_methods_label')
      : t('settings.account_data.auth_method_label')
  );
  const confirmationPhrase = computed(() => t('settings.account_data.confirm_phrase_value'));
  const canDelete = computed(() => {
    return (
      confirmationText.value.trim().toUpperCase() === confirmationPhrase.value.trim().toUpperCase()
    );
  });
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };
  const copyAccountId = async () => {
    try {
      await navigator.clipboard.writeText($supabase.user.id || '');
      accountIdCopied.value = true;
      setTimeout(() => {
        accountIdCopied.value = false;
      }, 2000);
    } catch (error) {
      toast.add({
        title: t('settings.account_data.copy_failed'),
        color: 'error',
      });
      logger.error('Failed to copy account ID:', error);
    }
  };
  const deleteAccount = async () => {
    if (!canDelete.value) {
      confirmationError.value = true;
      return;
    }
    isDeleting.value = true;
    deleteError.value = '';
    try {
      const { data: sessionData, error: sessionError } = await $supabase.client.auth.getSession();
      if (sessionError) {
        logger.error('Session error:', sessionError);
        throw new Error(`Session error: ${sessionError.message}`);
      }
      if (!sessionData.session) {
        throw new Error('You must be logged in to delete your account.');
      }
      const { data: refreshData, error: refreshError } =
        await $supabase.client.auth.refreshSession();
      if (refreshError) {
        logger.error('Session refresh failed:', refreshError);
        throw new Error('Your session has expired. Please refresh the page and try again.');
      }
      if (!refreshData.session) {
        throw new Error('Unable to verify your session. Please refresh the page and try again.');
      }
      const { data, error } = await $supabase.client.functions.invoke('account-delete');
      if (error) {
        logger.error('Edge function error:', error);
        let errorMessage = 'Failed to delete account. Please try again.';
        const applyBodyError = (body: unknown) => {
          if (!body) return false;
          if (typeof body === 'string' && body.trim()) {
            errorMessage = body;
            return true;
          }
          if (typeof body === 'object' && 'error' in body) {
            const bodyError = (body as { error?: unknown }).error;
            if (bodyError) {
              errorMessage = String(bodyError);
              return true;
            }
          }
          return false;
        };
        const getErrorContext = (err: unknown): unknown => {
          if (err && typeof err === 'object' && 'context' in err) {
            return (err as { context?: unknown }).context;
          }
          return undefined;
        };
        const getErrorMessage = (err: unknown): string | undefined => {
          if (err && typeof err === 'object' && 'message' in err) {
            const message = (err as { message?: unknown }).message;
            return typeof message === 'string' ? message : undefined;
          }
          return undefined;
        };
        const context = getErrorContext(error);
        if (context instanceof Response) {
          try {
            const body = await context.clone().json();
            applyBodyError(body);
          } catch (parseError) {
            try {
              const text = await context.clone().text();
              applyBodyError(text);
            } catch (textError) {
              logger.warn('Failed to parse account deletion error response', {
                parseError,
                textError,
              });
            }
          }
        } else if ((context as { body?: { error?: string } }).body?.error) {
          errorMessage = (context as { body?: { error?: string } }).body?.error || errorMessage;
        }
        if (
          errorMessage === 'Failed to delete account. Please try again.' &&
          getErrorMessage(error)
        ) {
          errorMessage = getErrorMessage(error) || errorMessage;
        } else if (
          typeof error === 'string' &&
          errorMessage === 'Failed to delete account. Please try again.'
        ) {
          errorMessage = error;
        }
        if (errorMessage.includes('Too many deletion requests')) {
          const match = errorMessage.match(/wait (\d+) seconds/);
          if (match) {
            errorMessage = `Rate limit exceeded. Please wait ${match[1]} seconds before trying again.`;
          }
        }
        throw new Error(errorMessage);
      }
      if (data?.success) {
        showConfirmationDialog.value = false;
        if (data.cleanupScheduled) {
          logger.info('Account deleted, cleanup scheduled:', data.message);
          cleanupScheduled.value = true;
        } else {
          cleanupScheduled.value = false;
        }
        showSuccessDialog.value = true;
      } else {
        throw new Error('Failed to delete account.');
      }
    } catch (error) {
      logger.error('Account deletion error:', error);
      deleteError.value = (error as Error).message || 'Failed to delete account. Please try again.';
    } finally {
      isDeleting.value = false;
    }
  };
  const resetClientState = () => {
    localStorage.clear();
    resetTarkovSync('account deleted');
    preferencesStore.$reset();
    systemStore.$reset();
    teamStore.$reset();
    tarkovStore.$reset();
  };
  const redirectToHome = async () => {
    try {
      showSuccessDialog.value = false;
      logger.info('Signing out user and redirecting to dashboard...');
      resetClientState();
      await $supabase.signOut();
      logger.info('Successfully signed out, performing hard reload...');
      window.location.href = '/';
    } catch (error) {
      logger.error('Failed to sign out and redirect:', error);
      window.location.href = '/';
    }
  };
</script>
<template>
  <div :class="$attrs.class">
    <GenericCard
      icon="mdi-database-cog"
      icon-color="warning"
      highlight-color="warning"
      :title="$t('settings.account_data.title')"
      title-classes="text-lg font-semibold"
    >
      <template #content>
        <div class="p-4">
          <template v-if="isLoggedIn">
            <div class="border-surface-700 bg-surface-800/50 mb-6 rounded-lg border p-4">
              <div class="mb-3 text-base font-bold">
                {{ $t('settings.account_data.account_info_title') }}
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div class="mb-2 flex items-center">
                    <UIcon name="i-mdi-account" class="text-surface-400 mr-2 h-4.5 w-4.5" />
                    <span class="text-sm">
                      <span class="text-surface-400">
                        {{ $t('settings.account_data.username_label') }}:
                      </span>
                      <span class="ml-1 font-mono font-medium">{{ maskedUsername }}</span>
                    </span>
                    <AppTooltip
                      :text="
                        showUsername
                          ? $t('settings.account_data.action_hide')
                          : $t('settings.account_data.action_show')
                      "
                    >
                      <UButton
                        size="xs"
                        variant="ghost"
                        :icon="showUsername ? 'i-mdi-eye-off' : 'i-mdi-eye'"
                        color="neutral"
                        class="ml-1"
                        :aria-label="
                          showUsername
                            ? $t('settings.account_data.hide_username')
                            : $t('settings.account_data.show_username')
                        "
                        @click="showUsername = !showUsername"
                      />
                    </AppTooltip>
                  </div>
                  <div class="mb-2 flex items-center">
                    <UIcon name="i-mdi-email" class="text-surface-400 mr-2 h-4.5 w-4.5" />
                    <span class="text-sm">
                      <span class="text-surface-400">
                        {{ $t('settings.account_data.email_label') }}:
                      </span>
                      <span class="ml-1 font-mono font-medium">{{ maskedEmail }}</span>
                    </span>
                    <AppTooltip
                      :text="
                        showEmail
                          ? $t('settings.account_data.action_hide')
                          : $t('settings.account_data.action_show')
                      "
                    >
                      <UButton
                        size="xs"
                        variant="ghost"
                        :icon="showEmail ? 'i-mdi-eye-off' : 'i-mdi-eye'"
                        color="neutral"
                        class="ml-1"
                        :aria-label="
                          showEmail
                            ? $t('settings.account_data.hide_email')
                            : $t('settings.account_data.show_email')
                        "
                        @click="showEmail = !showEmail"
                      />
                    </AppTooltip>
                  </div>
                </div>
                <div>
                  <div class="mb-2 flex items-center">
                    <UIcon name="i-mdi-login" class="text-surface-400 mr-2 h-4.5 w-4.5" />
                    <span class="flex flex-wrap items-center gap-1 text-sm">
                      <span class="text-surface-400 mr-1">{{ authMethodLabel }}:</span>
                      <template v-if="providers.length > 0">
                        <UBadge
                          v-for="p in providers"
                          :key="p"
                          size="xs"
                          variant="solid"
                          :style="getProviderBadgeStyle(p)"
                          :class="getProviderBadgeClass(p)"
                        >
                          <UIcon :name="getProviderIcon(p)" class="mr-1 h-4 w-4" />
                          {{ getProviderLabel(p) }}
                        </UBadge>
                      </template>
                      <span v-else class="text-surface-500">
                        {{ $t('settings.account_data.unknown_label') }}
                      </span>
                    </span>
                  </div>
                  <div class="flex items-center">
                    <UIcon name="i-mdi-calendar" class="text-surface-400 mr-2 h-4.5 w-4.5" />
                    <span class="text-sm">
                      <span class="text-surface-400">
                        {{ $t('settings.account_data.member_since_label') }}:
                      </span>
                      <span class="ml-1 font-medium">
                        {{ formatDate($supabase.user.createdAt) }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <div class="border-surface-700 my-3 border-t"></div>
              <div class="flex items-center">
                <UIcon name="i-mdi-identifier" class="text-surface-400 mr-2 h-4.5 w-4.5" />
                <span class="text-surface-400 mr-2 text-sm">
                  {{ $t('settings.account_data.account_id_label') }}:
                </span>
                <code class="bg-surface-700 rounded px-2 py-1 text-xs">{{ maskedAccountId }}</code>
                <AppTooltip
                  :text="
                    showAccountId
                      ? $t('settings.account_data.action_hide')
                      : $t('settings.account_data.action_show')
                  "
                >
                  <UButton
                    size="xs"
                    variant="ghost"
                    :icon="showAccountId ? 'i-mdi-eye-off' : 'i-mdi-eye'"
                    color="neutral"
                    class="ml-1"
                    :aria-label="
                      showAccountId
                        ? $t('settings.account_data.hide_account_id')
                        : $t('settings.account_data.show_account_id')
                    "
                    @click="showAccountId = !showAccountId"
                  />
                </AppTooltip>
                <AppTooltip
                  :text="
                    accountIdCopied
                      ? $t('settings.account_data.account_id_copied')
                      : $t('settings.account_data.copy_account_id')
                  "
                >
                  <UButton
                    size="xs"
                    variant="ghost"
                    :icon="accountIdCopied ? 'i-mdi-check' : 'i-mdi-content-copy'"
                    :color="accountIdCopied ? 'success' : 'primary'"
                    class="ml-1"
                    :aria-label="
                      accountIdCopied
                        ? $t('settings.account_data.account_id_copied')
                        : $t('settings.account_data.copy_account_id')
                    "
                    @click="copyAccountId"
                  />
                </AppTooltip>
              </div>
            </div>
          </template>
          <div
            :class="{
              'border-surface-700 border-t pt-6': isLoggedIn,
              'pt-0': !isLoggedIn,
            }"
          >
            <div class="text-surface-300 mb-3 text-sm font-semibold">
              {{ $t('settings.account_data.account_deletion_title') }}
            </div>
            <div class="flex justify-center">
              <AppTooltip
                v-if="!isLoggedIn"
                :text="$t('settings.account_data.login_required_delete')"
              >
                <UButton
                  color="error"
                  variant="solid"
                  size="lg"
                  icon="i-mdi-delete-forever"
                  disabled
                  class="px-6 py-3 font-semibold"
                >
                  {{ $t('settings.account.begin_deletion') }}
                </UButton>
              </AppTooltip>
              <UButton
                v-else
                color="error"
                variant="solid"
                size="lg"
                icon="i-mdi-delete-forever"
                :loading="isDeleting"
                :disabled="isDeleting"
                class="px-6 py-3 font-semibold shadow-lg transition-all hover:scale-105 hover:shadow-xl"
                @click="showConfirmationDialog = true"
              >
                {{ $t('settings.account.begin_deletion') }}
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </GenericCard>
  </div>
  <UModal v-model:open="showConfirmationDialog" prevent-close>
    <template #title>
      <div class="text-error-500 flex items-center text-xl font-medium">
        <UIcon name="i-mdi-alert-circle" class="text-error-500 mr-2 h-6 w-6" />
        {{ $t('settings.account_data.confirm_delete_title') }}
      </div>
    </template>
    <template #description>
      <span class="sr-only">
        {{ $t('settings.account_data.confirm_delete_sr_only') }}
      </span>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="error"
          variant="solid"
          :title="$t('settings.account_data.irreversible_title')"
          :description="$t('settings.account_data.irreversible_description')"
        />
        <UAlert
          icon="i-mdi-alert-circle"
          color="error"
          variant="soft"
          :title="$t('settings.account_data.what_deleted_title')"
        >
          <template #description>
            <ul class="ml-4 list-disc text-sm">
              <li>
                {{ $t('settings.account_data.delete_item_progress') }}
              </li>
              <li>
                {{ $t('settings.account_data.delete_item_teams') }}
              </li>
              <li>
                {{ $t('settings.account_data.delete_item_tokens') }}
              </li>
              <li>
                {{ $t('settings.account_data.delete_item_personal') }}
              </li>
            </ul>
            <div class="mt-2 text-sm font-bold">
              {{ $t('settings.account_data.not_affect_tarkov') }}
            </div>
          </template>
        </UAlert>
        <UAlert
          icon="i-mdi-account-group"
          color="warning"
          variant="soft"
          :title="$t('settings.account_data.team_transfer_title')"
        >
          <template #description>
            <div class="text-sm">
              {{ $t('settings.account_data.team_transfer_description') }}
            </div>
          </template>
        </UAlert>
        <div>
          <div class="mb-2 text-base font-medium">
            {{ $t('settings.account_data.security_confirmation_title') }}
          </div>
          <div class="text-surface-400 mb-3 text-sm">
            {{ $t('settings.account_data.security_confirmation_description') }}
          </div>
        </div>
        <div>
          <div class="mb-2 text-base font-medium">
            {{
              $t('settings.account_data.confirm_phrase_label', {
                phrase: $t('settings.account_data.confirm_phrase_value'),
              })
            }}
          </div>
          <UInput
            v-model="confirmationText"
            :placeholder="$t('settings.account_data.confirm_phrase_value')"
            :color="confirmationError ? 'error' : 'neutral'"
            @input="confirmationError = false"
          />
          <div v-if="confirmationError" class="text-error-500 mt-1 text-xs">
            {{
              $t('settings.account_data.confirm_phrase_error', {
                phrase: $t('settings.account_data.confirm_phrase_value'),
              })
            }}
          </div>
        </div>
        <UAlert v-if="deleteError" color="error" variant="soft" :title="deleteError" />
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex justify-end">
        <UButton variant="ghost" color="neutral" :disabled="isDeleting" @click="close">
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          :loading="isDeleting"
          :disabled="!canDelete || isDeleting"
          class="ml-3"
          @click="deleteAccount"
        >
          {{ $t('settings.account_data.delete_forever') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="showSuccessDialog" prevent-close>
    <template #title>
      <div class="text-success-500 flex items-center text-xl font-medium">
        <UIcon name="i-mdi-check-circle" class="text-success-500 mr-2 h-6 w-6" />
        {{ $t('settings.account_data.delete_success_title') }}
      </div>
    </template>
    <template #description>
      <span class="sr-only">
        {{ $t('settings.account_data.delete_success_sr_only') }}
      </span>
    </template>
    <template #body>
      <div class="space-y-3">
        <div class="text-base">
          {{ $t('settings.account_data.delete_success_description') }}
        </div>
        <div v-if="cleanupScheduled" class="text-surface-400 text-sm">
          <UIcon name="i-mdi-information" class="mr-1 inline h-4 w-4" />
          {{ $t('settings.account_data.cleanup_pending') }}
        </div>
        <div class="text-surface-400 text-sm">
          {{ $t('settings.account_data.redirect_message') }}
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end">
        <UButton color="primary" variant="solid" @click="redirectToHome">
          {{ $t('settings.account_data.go_to_dashboard') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
