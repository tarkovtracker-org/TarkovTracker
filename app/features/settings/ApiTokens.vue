<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <a
        href="https://api.tarkovtracker.org"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary-400 hover:text-primary-300 text-sm underline"
      >
        {{ t('page.settings.card.apitokens.open_api_documentation') }}
      </a>
      <UButton
        color="primary"
        variant="soft"
        icon="i-mdi-key-plus"
        :disabled="!userLoggedIn || creating"
        @click="showCreateDialog = true"
      >
        {{ t('page.settings.card.apitokens.new_token_expand') }}
      </UButton>
    </div>
    <div class="space-y-3">
      <UAlert
        v-if="!supportsRawTokens"
        color="warning"
        variant="soft"
        :title="t('page.settings.card.apitokens.token_value_unavailable')"
        :description="t('page.settings.card.apitokens.token_value_unavailable_desc')"
      />
      <div v-if="loading" class="space-y-2">
        <div class="h-12 animate-pulse rounded-lg bg-white/5"></div>
        <div class="h-12 animate-pulse rounded-lg bg-white/5"></div>
      </div>
      <div v-else-if="!tokens.length" class="bg-surface-900 rounded-lg border border-white/5 p-4">
        <UAlert
          color="primary"
          variant="soft"
          :title="t('page.settings.card.apitokens.no_tokens')"
        />
      </div>
      <div v-else class="space-y-2">
        <UCard
          v-for="token in tokens"
          :key="token.id"
          class="bg-surface-900 border border-white/10"
          :ui="{ body: 'space-y-3' }"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="w-full space-y-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-mdi-key-variant" class="text-primary-400 h-5 w-5" />
                <span class="text-surface-50 font-medium">
                  {{ token.note || t('page.settings.card.apitokens.default_note') }}
                </span>
              </div>
              <div class="flex flex-wrap gap-1.5 text-xs">
                <UBadge
                  :color="token.gameMode === 'pve' ? 'info' : 'warning'"
                  variant="solid"
                  size="xs"
                >
                  {{ formatGameMode(token.gameMode) }}
                </UBadge>
                <UBadge
                  v-for="perm in token.permissions"
                  :key="perm"
                  color="info"
                  variant="soft"
                  size="xs"
                >
                  {{ permissionLabel(perm) }}
                </UBadge>
              </div>
              <div
                class="bg-surface-950/50 flex items-center gap-2 rounded border border-white/5 p-2"
                :class="{ 'opacity-70': !token.tokenValue }"
              >
                <code class="text-surface-300 flex-1 font-mono text-xs">
                  <template v-if="token.tokenValue">
                    {{
                      visibleTokens.has(token.id) ? token.tokenValue : maskToken(token.tokenValue)
                    }}
                  </template>
                  <template v-else>
                    {{
                      supportsRawTokens
                        ? t('page.settings.card.apitokens.token_value_missing')
                        : t('page.settings.card.apitokens.token_value_hidden')
                    }}
                  </template>
                </code>
                <div class="flex items-center gap-1">
                  <UButton
                    :icon="visibleTokens.has(token.id) ? 'i-mdi-eye-off' : 'i-mdi-eye'"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :padded="false"
                    :disabled="!token.tokenValue"
                    :aria-label="
                      visibleTokens.has(token.id)
                        ? t('page.settings.card.apitokens.hide_token')
                        : t('page.settings.card.apitokens.show_token')
                    "
                    @click="toggleTokenVisibility(token.id)"
                  />
                  <UButton
                    icon="i-mdi-content-copy"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :padded="false"
                    :disabled="!token.tokenValue"
                    :aria-label="t('page.settings.card.apitokens.copy_token')"
                    @click="copyTokenValue(token.tokenValue)"
                  />
                </div>
              </div>
              <div class="text-surface-400 flex items-center gap-2 text-xs">
                <span>
                  {{ t('page.settings.card.apitokens.list.created') }}:
                  {{ formatDate(token.createdAt) }}
                </span>
                <span>
                  {{
                    t('page.settings.card.apitokens.list.usage_count', {
                      count: token.usageCount ?? 0,
                    })
                  }}
                </span>
                <UTooltip :text="lastUsedTooltip(token.lastUsedAt)">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center"
                    :aria-label="lastUsedTooltip(token.lastUsedAt)"
                  >
                    <UIcon name="i-mdi-clock-outline" class="text-surface-500 h-3.5 w-3.5" />
                  </button>
                </UTooltip>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UBadge v-if="!token.isActive" color="warning" variant="subtle" size="xs">
                {{ t('page.settings.card.apitokens.list.revoked') }}
              </UBadge>
              <UButton
                color="error"
                variant="ghost"
                icon="i-mdi-close-circle"
                size="xs"
                :loading="revokingId === token.id"
                @click="revokeToken(token.id)"
              >
                {{ t('page.settings.card.apitokens.revoke_button') }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </div>
    <UModal v-model:open="showCreateDialog">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-mdi-key-plus" class="text-primary-400 h-5 w-5" />
          <h3 class="text-lg font-semibold">
            {{ t('page.settings.card.apitokens.new_token_expand') }}
          </h3>
        </div>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField
            name="gameMode"
            :label="t('page.settings.card.apitokens.form.gamemode_title')"
            required
          >
            <URadioGroup
              v-model="selectedGameMode"
              :items="gameModes"
              value-key="value"
              class="w-full"
              :ui="{
                fieldset: 'w-full',
                item: 'rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-3 data-[state=checked]:border-primary-500 data-[state=checked]:bg-primary-500/10',
                label: 'text-sm font-medium text-white',
              }"
            />
          </UFormField>
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ t('page.settings.card.apitokens.form.permissions_title') }}
            </p>
            <div class="grid gap-2 md:grid-cols-2">
              <UCheckbox
                v-for="permission in permissionOptions"
                :key="permission.value"
                :model-value="selectedPermissions.includes(permission.value)"
                :label="permission.label"
                name="permissions"
                @update:model-value="
                  (checked) => togglePermission(permission.value, checked as boolean)
                "
              />
            </div>
          </div>
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ t('page.settings.card.apitokens.form.note_label') }}
            </p>
            <UInput
              v-model="note"
              :placeholder="t('page.settings.card.apitokens.form.note_placeholder')"
            />
          </div>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="close">
            {{ t('page.settings.card.apitokens.form.cancel') }}
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            :disabled="!canSubmit"
            :loading="creating"
            @click="createToken"
          >
            {{ t('page.settings.card.apitokens.submit_new_token') }}
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="showTokenCreatedDialog">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-mdi-check-circle" class="text-success-400 h-5 w-5" />
          <h3 class="text-lg font-semibold">
            {{ t('page.settings.card.apitokens.token_created') }}
          </h3>
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <p class="text-surface-300 text-sm">
            {{ t('page.settings.card.apitokens.token_created_description') }}
          </p>
          <UInput v-model="generatedToken" readonly>
            <template #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-mdi-clipboard-multiple-outline"
                :padded="false"
                :aria-label="t('page.settings.card.apitokens.copy_token')"
                @click="copyToken"
              />
            </template>
          </UInput>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton color="primary" variant="solid" @click="close">
            {{ t('page.settings.card.apitokens.token_created_close') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
<script setup lang="ts">
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { useDiagnosticToast } from '@/composables/useDiagnosticToast';
  import { API_PERMISSIONS, GAME_MODE_OPTIONS, GAME_MODES, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import { shouldFallbackForUnavailableTokenFunction } from '@/utils/tokenFunctionFallback';
  import type { RawTokenRow, TokenPermission, TokenRow } from '@/types/api';
  type ApiTokenInsertPayload = {
    game_mode: GameMode;
    note: string | null;
    permissions: TokenPermission[];
    token_hash: string;
    token_value?: string;
    user_id: string;
  };
  type SupabaseTokenError = {
    code?: string;
    message?: string;
  } | null;
  interface SupabaseTable {
    select: (query: string) => SupabaseTable;
    insert: (data: ApiTokenInsertPayload) => SupabaseTable;
    eq: (column: string, value: string) => SupabaseTable;
    order: (column: string, options?: { ascending: boolean }) => SupabaseTable;
    single: () => Promise<{ data: { token_id: string } | null; error: SupabaseTokenError }>;
    then: (
      onfulfilled?:
        ((value: { data: RawTokenRow[] | null; error: SupabaseTokenError }) => unknown) | null
    ) => Promise<unknown>;
  }
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const runtimeConfig = useRuntimeConfig();
  const { showErrorToast } = useDiagnosticToast();
  const edgeFunctions = useEdgeFunctions();
  const showCreateDialog = ref(false);
  const showTokenCreatedDialog = ref(false);
  const loading = ref(false);
  const creating = ref(false);
  const revokingId = ref<string | null>(null);
  const tokens = ref<TokenRow[]>([]);
  const selectedGameMode = ref<GameMode>(GAME_MODES.PVP);
  const selectedPermissions = ref<TokenPermission[]>(['GP']);
  const note = ref('');
  const generatedToken = ref('');
  const visibleTokens = ref<Set<string>>(new Set());
  const supportsRawTokens = ref(true);
  let createTokenRequestId = 0;
  let loadTokensRequestId = 0;
  const userLoggedIn = computed(() => $supabase.user.loggedIn);
  const permissionOptions = computed(() =>
    Object.entries(API_PERMISSIONS).map(([key, value]) => ({
      value: key as TokenPermission,
      label: value.title,
    }))
  );
  const gameModes = computed(() =>
    GAME_MODE_OPTIONS.map((mode) => ({
      label: mode.label,
      value: mode.value as GameMode,
    }))
  );
  const canSubmit = computed(
    () => userLoggedIn.value && selectedPermissions.value.length > 0 && !!selectedGameMode.value
  );
  const allowDirectTokenCreateFallback = computed(
    () => runtimeConfig.public.allowDirectTokenCreateFallback === true
  );
  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleString();
  };
  const lastUsedTooltip = (lastUsedAt: string | null) => {
    const value = lastUsedAt
      ? formatDate(lastUsedAt)
      : t('page.settings.card.apitokens.list.never');
    return t('page.settings.card.apitokens.list.last_used_tooltip', { value });
  };
  const formatGameMode = (mode: GameMode) => {
    return mode === GAME_MODES.PVE ? 'PvE' : 'PvP';
  };
  const permissionLabel = (value: TokenPermission) => {
    return permissionOptions.value.find((perm) => perm.value === value)?.label || value;
  };
  const tableClient = (): SupabaseTable | null => {
    return (
      ($supabase.client as unknown as { from?: (name: string) => SupabaseTable })?.from?.(
        'api_tokens'
      ) || null
    );
  };
  const buildSelectQuery = () => {
    const baseColumns =
      'token_id, note, permissions, game_mode, created_at, last_used_at, usage_count, is_active';
    return supportsRawTokens.value ? `${baseColumns}, token_value` : baseColumns;
  };
  const resetForm = () => {
    selectedGameMode.value = GAME_MODES.PVP;
    selectedPermissions.value = ['GP'];
    note.value = '';
  };
  const getActiveUserId = () => {
    return userLoggedIn.value && $supabase.user.id ? $supabase.user.id : null;
  };
  const invalidateTokenLoads = () => {
    loadTokensRequestId += 1;
  };
  const invalidateTokenCreates = () => {
    createTokenRequestId += 1;
  };
  const resetUserScopedState = () => {
    invalidateTokenCreates();
    invalidateTokenLoads();
    loading.value = false;
    creating.value = false;
    revokingId.value = null;
    tokens.value = [];
    visibleTokens.value = new Set();
    showCreateDialog.value = false;
    showTokenCreatedDialog.value = false;
    generatedToken.value = '';
    resetForm();
  };
  const isCurrentTokenLoad = (requestId: number, userId: string) => {
    return requestId === loadTokensRequestId && getActiveUserId() === userId;
  };
  const isCurrentTokenCreate = (requestId: number, userId: string) => {
    return requestId === createTokenRequestId && getActiveUserId() === userId;
  };
  const loadTokens = async () => {
    const table = tableClient();
    const userId = getActiveUserId();
    if (!userId || !table) {
      invalidateTokenLoads();
      loading.value = false;
      tokens.value = [];
      visibleTokens.value = new Set();
      return;
    }
    const requestId = ++loadTokensRequestId;
    loading.value = true;
    try {
      const { data, error } = await table
        .select(buildSelectQuery())
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (!isCurrentTokenLoad(requestId, userId)) {
        return;
      }
      if (error) {
        if ((error as { code?: string })?.code === '42703' && supportsRawTokens.value) {
          supportsRawTokens.value = false;
          await loadTokens();
          return;
        }
        throw error;
      }
      tokens.value =
        (data as RawTokenRow[])?.map((row: RawTokenRow) => ({
          id: row.token_id,
          note: row.note,
          permissions: row.permissions || [],
          gameMode: row.game_mode,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
          usageCount: row.usage_count ?? 0,
          isActive: row.is_active ?? true,
          tokenValue: supportsRawTokens.value ? (row.token_value ?? null) : null,
        })) || [];
    } catch (error) {
      if (!isCurrentTokenLoad(requestId, userId)) {
        return;
      }
      logger.error('[ApiTokens] Failed to load tokens:', error);
      showErrorToast({
        title: t('page.settings.card.apitokens.load_tokens_error'),
        error,
        context: {
          action: 'load',
          area: 'api_tokens',
          userId,
        },
        reportTitle: t('page.settings.card.apitokens.report.load_failed'),
      });
    } finally {
      if (requestId === loadTokensRequestId) {
        loading.value = false;
      }
    }
  };
  const generateToken = (gameMode: GameMode) => {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const prefix = gameMode === GAME_MODES.PVE ? 'PVE' : 'PVP';
    return `${prefix}_${hex}`;
  };
  const hashToken = async (token: string) => {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };
  const togglePermission = (value: TokenPermission, checked: boolean) => {
    if (checked) {
      if (!selectedPermissions.value.includes(value)) {
        selectedPermissions.value.push(value);
      }
    } else {
      selectedPermissions.value = selectedPermissions.value.filter((p) => p !== value);
    }
  };
  const createToken = async () => {
    const table = tableClient();
    const userId = getActiveUserId();
    if (creating.value || !canSubmit.value || !userId || !table) return;
    const requestId = ++createTokenRequestId;
    creating.value = true;
    const createTokenDirect = async (rawToken: string) => {
      if (!isCurrentTokenCreate(requestId, userId)) return null;
      const hashedToken = await hashToken(rawToken);
      if (!isCurrentTokenCreate(requestId, userId)) return null;
      const insertPayload: ApiTokenInsertPayload = {
        user_id: userId,
        token_hash: hashedToken,
        permissions: selectedPermissions.value,
        game_mode: selectedGameMode.value,
        note: note.value || null,
      };
      if (supportsRawTokens.value) {
        insertPayload.token_value = rawToken;
      }
      const attemptInsert = async () =>
        table.insert(insertPayload).select('token_id').single() as Promise<{
          data: { token_id: string } | null;
          error: { code?: string } | null;
        }>;
      let insertResult = await attemptInsert();
      if (!isCurrentTokenCreate(requestId, userId)) return null;
      if (insertResult.error?.code === '42703' && supportsRawTokens.value) {
        supportsRawTokens.value = false;
        delete insertPayload.token_value;
        insertResult = await attemptInsert();
        if (!isCurrentTokenCreate(requestId, userId)) return null;
      }
      if (insertResult.error) throw insertResult.error;
      return insertResult.data?.token_id || null;
    };
    try {
      const rawToken = generateToken(selectedGameMode.value);
      let response: { tokenId?: string; tokenValue?: string } | null = null;
      try {
        response = await edgeFunctions.createToken({
          permissions: selectedPermissions.value,
          gameMode: selectedGameMode.value,
          note: note.value || null,
          tokenValue: supportsRawTokens.value ? rawToken : undefined,
        });
      } catch (error) {
        if (
          !allowDirectTokenCreateFallback.value ||
          !shouldFallbackForUnavailableTokenFunction(error)
        ) {
          throw error;
        }
        logger.warn(
          '[ApiTokens] token-create unavailable, falling back to direct insert via opt-in flag:',
          error
        );
        const tokenId = await createTokenDirect(rawToken);
        response = { tokenId: tokenId || undefined, tokenValue: rawToken };
      }
      if (!isCurrentTokenCreate(requestId, userId)) {
        return;
      }
      const tokenId = (response as { tokenId?: string })?.tokenId || null;
      const tokenValue = (response as { tokenValue?: string })?.tokenValue || rawToken;
      generatedToken.value = tokenValue;
      toast.add({
        title: t('page.settings.card.apitokens.create_token_success'),
        color: 'success',
      });
      showCreateDialog.value = false;
      showTokenCreatedDialog.value = true;
      await loadTokens();
      if (!isCurrentTokenCreate(requestId, userId)) {
        return;
      }
      if (tokenId && !supportsRawTokens.value) {
        const created = tokens.value.find((token) => token.id === tokenId);
        if (created) created.tokenValue = tokenValue;
      }
      resetForm();
    } catch (error) {
      if (!isCurrentTokenCreate(requestId, userId)) {
        return;
      }
      logger.error('[ApiTokens] Failed to create token:', error);
      showErrorToast({
        title: t('page.settings.card.apitokens.create_token_error'),
        error,
        context: {
          action: 'create',
          area: 'api_tokens',
          gameMode: selectedGameMode.value,
          permissionCount: selectedPermissions.value.length,
          userId,
        },
        reportTitle: t('page.settings.card.apitokens.report.create_failed'),
      });
    } finally {
      if (requestId === createTokenRequestId) {
        creating.value = false;
      }
    }
  };
  const copyToken = async () => {
    if (!generatedToken.value) return;
    try {
      await navigator.clipboard.writeText(generatedToken.value);
      toast.add({
        title: t('page.settings.card.apitokens.token_copied'),
        color: 'success',
      });
    } catch (error) {
      logger.error('[ApiTokens] Failed to copy token:', error);
    }
  };
  const toggleTokenVisibility = (tokenId: string) => {
    if (visibleTokens.value.has(tokenId)) {
      visibleTokens.value.delete(tokenId);
    } else {
      visibleTokens.value.add(tokenId);
    }
  };
  const copyTokenValue = async (tokenValue?: string | null) => {
    if (!tokenValue) return;
    try {
      await navigator.clipboard.writeText(tokenValue);
      toast.add({
        title: t('page.settings.card.apitokens.token_copied'),
        color: 'success',
      });
    } catch (error) {
      logger.error('[ApiTokens] Failed to copy token:', error);
      toast.add({
        title: t('page.settings.card.apitokens.copy_failed'),
        color: 'error',
      });
    }
  };
  const maskToken = (token?: string | null) => {
    if (!token) return '';
    if (token.length <= 12) return token;
    return `${token.substring(0, 8)}...${token.substring(token.length - 4)}`;
  };
  const revokeToken = async (tokenId: string) => {
    if (!tokenId) return;
    revokingId.value = tokenId;
    try {
      await edgeFunctions.revokeToken(tokenId);
      toast.add({
        title: t('page.settings.card.apitokens.token_revoked'),
        color: 'success',
      });
      await loadTokens();
    } catch (error) {
      logger.error('[ApiTokens] Failed to revoke token:', error);
      showErrorToast({
        title: t('page.settings.card.apitokens.token_revoke_error'),
        error,
        context: {
          action: 'revoke',
          area: 'api_tokens',
          tokenId,
          userId: getActiveUserId(),
        },
        reportTitle: t('page.settings.card.apitokens.report.revoke_failed'),
      });
    } finally {
      revokingId.value = null;
    }
  };
  watch(
    () => [$supabase.user.loggedIn, $supabase.user.id] as const,
    ([loggedIn, userId], previousState) => {
      if (!loggedIn) {
        resetUserScopedState();
        return;
      }
      if (userId !== previousState?.[1]) {
        resetUserScopedState();
      }
      loadTokens();
    },
    { immediate: true }
  );
  watch(showTokenCreatedDialog, (isOpen) => {
    if (!isOpen) {
      generatedToken.value = '';
    }
  });
</script>
