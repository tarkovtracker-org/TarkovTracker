<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <a
        href="https://api.tarkovtracker.org"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary-400 hover:text-primary-300 text-sm underline"
      >
        {{ t('page.settings.card.apitokens.open_api_documentation') }}
      </a>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-mdi-chart-timeline-variant"
          aria-controls="api-token-activity"
          :aria-expanded="activityScope === 'account'"
          @click="toggleActivity('account')"
        >
          {{ t('page.settings.card.apitokens.activity.account') }}
        </UButton>
        <UButton
          color="primary"
          variant="soft"
          icon="i-mdi-key-plus"
          :disabled="!userLoggedIn || creating || tokenCapReached"
          @click="showCreateDialog = true"
        >
          {{ t('page.settings.card.apitokens.new_token_expand') }}
        </UButton>
      </div>
    </div>
    <ApiTokenActivityDisclosure
      id="api-token-activity"
      :open="activityScope === 'account'"
      :title="t('page.settings.card.apitokens.activity.account')"
    />
    <div class="space-y-3">
      <UAlert
        v-if="!supportsRawTokens"
        color="warning"
        variant="soft"
        :title="t('page.settings.card.apitokens.token_value_unavailable')"
        :description="t('page.settings.card.apitokens.token_value_unavailable_desc')"
      />
      <UAlert
        v-if="tokenCapReached"
        color="warning"
        variant="soft"
        :title="t('page.settings.card.apitokens.token_cap_reached', 'Token limit reached')"
        :description="
          t(
            'page.settings.card.apitokens.token_cap_reached_desc',
            'You can have at most 3 active API tokens. Revoke an existing token to create a new one.'
          )
        "
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
        <article
          v-for="token in tokens"
          :key="token.id"
          class="bg-surface-900 @container rounded-lg border border-white/10 p-3 sm:p-4"
        >
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div
              class="min-w-0 space-y-1 @min-[32rem]:flex @min-[32rem]:items-center @min-[32rem]:gap-3 @min-[32rem]:space-y-0"
            >
              <ApiTokenNameEditor
                :name="token.note"
                :editing="editingTokenId === token.id"
                :loading="renamingId === token.id"
                :disabled="renamingId !== null"
                @edit="startTokenNameEdit(token.id)"
                @cancel="cancelTokenNameEdit"
                @save="renameToken(token, $event)"
              />
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="text-surface-300">{{ formatGameMode(token.gameMode) }}</span>
                <UBadge v-if="!token.isActive" color="warning" variant="subtle" size="sm">
                  {{ t('page.settings.card.apitokens.list.revoked') }}
                </UBadge>
              </div>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-mdi-chart-timeline-variant"
              size="sm"
              :aria-controls="`api-activity-${token.id}`"
              :aria-label="activityAction(token, true)"
              :aria-expanded="activityScope === token.id"
              @click="toggleActivity(token.id)"
            >
              {{ activityAction(token) }}
            </UButton>
          </header>
          <div class="my-3 border-y border-white/10 py-3">
            <ApiTokenDetails v-bind="{ token, permissionLabels }" />
          </div>
          <footer class="flex flex-wrap items-end justify-between gap-3">
            <div
              class="min-w-full flex-1 @min-[24rem]:min-w-0 @min-[32rem]:flex @min-[32rem]:items-center @min-[32rem]:gap-3"
            >
              <p class="text-surface-300 mb-1 text-xs @min-[32rem]:mb-0 @min-[32rem]:shrink-0">
                {{ t('page.settings.card.apitokens.list.token_value') }}
              </p>
              <div
                class="bg-surface-950/60 flex min-w-0 flex-1 items-start gap-2 rounded-md border border-white/10"
              >
                <code class="text-surface-100 min-w-0 flex-1 px-2.5 py-2 text-sm wrap-anywhere">
                  {{ displayedToken(token) }}
                </code>
                <div class="flex shrink-0 items-center">
                  <UButton
                    :icon="visibleTokens.has(token.id) ? 'i-mdi-eye-off' : 'i-mdi-eye'"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="!token.tokenValue"
                    :aria-label="tokenVisibilityLabel(token.id)"
                    @click="toggleTokenVisibility(token.id)"
                  />
                  <UButton
                    icon="i-mdi-content-copy"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="!token.tokenValue"
                    :aria-label="t('page.settings.card.apitokens.copy_token')"
                    @click="copyTokenValue(token.tokenValue)"
                  />
                </div>
              </div>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              class="ms-auto"
              :loading="revokingId === token.id"
              :disabled="renamingId === token.id"
              :aria-label="
                t('page.settings.card.apitokens.revoke_named', { name: activityTitle(token) })
              "
              @click="revokeToken(token.id)"
            >
              {{ t('page.settings.card.apitokens.revoke_button') }}
            </UButton>
          </footer>
          <ApiTokenActivityDisclosure
            :id="`api-activity-${token.id}`"
            class="mt-3"
            :open="activityScope === token.id"
            :token-id="token.id"
            :title="activityTitle(token)"
          />
        </article>
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
                label: 'text-sm font-medium text-white light:text-surface-50',
              }"
            >
              <template #label="{ item }">
                <span class="inline-flex items-center gap-1">
                  <GameModeBadge :mode="item.value" class="-my-2" />
                  {{ item.label }}
                </span>
              </template>
            </URadioGroup>
          </UFormField>
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ t('page.settings.card.apitokens.form.permissions_title') }}
            </p>
            <p class="text-surface-400 text-xs">
              {{ t('page.settings.card.apitokens.form.permissions_help') }}
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
            {{ t('common.cancel') }}
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
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { useDiagnosticToast } from '@/composables/useDiagnosticToast';
  import ApiTokenActivityDisclosure from '@/features/settings/ApiTokenActivityDisclosure.vue';
  import ApiTokenDetails from '@/features/settings/ApiTokenDetails.vue';
  import ApiTokenNameEditor from '@/features/settings/ApiTokenNameEditor.vue';
  import {
    API_PERMISSIONS,
    API_TOKEN_PREFIXES,
    GAME_MODE_OPTIONS,
    GAME_MODES,
    type GameMode,
  } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import type { RawTokenRow, TokenPermission, TokenRow } from '@/types/api';
  type ApiTokenUpdatePayload = {
    note: string | null;
  };
  type SupabaseTokenError = {
    code?: string;
    message?: string;
  } | null;
  interface SupabaseTable {
    select: (query: string) => SupabaseTable;
    delete: () => SupabaseTable;
    update: (data: ApiTokenUpdatePayload) => SupabaseTable;
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
  const { showErrorToast } = useDiagnosticToast();
  const edgeFunctions = useEdgeFunctions();
  const showCreateDialog = ref(false);
  const showTokenCreatedDialog = ref(false);
  const loading = ref(false);
  const creating = ref(false);
  const revokingId = ref<string | null>(null);
  const renamingId = ref<string | null>(null);
  const editingTokenId = ref<string | null>(null);
  const activityScope = ref<string | null>(null);
  const tokens = ref<TokenRow[]>([]);
  const selectedGameMode = ref<GameMode>(GAME_MODES.PVP);
  const selectedPermissions = ref<TokenPermission[]>(['GP']);
  const note = ref('');
  const generatedToken = ref('');
  const visibleTokens = ref<Set<string>>(new Set());
  const supportsRawTokens = ref(true);
  let createTokenRequestId = 0;
  let loadTokensRequestId = 0;
  let renameTokenRequestId = 0;
  const userLoggedIn = computed(() => $supabase.user.loggedIn);
  const permissionLabels = computed<Record<string, string>>(() => ({
    GP: t('page.settings.card.apitokens.list.permission_personal_read'),
    TP: t('page.settings.card.apitokens.list.permission_team_read'),
    WP: t('page.settings.card.apitokens.list.permission_write'),
  }));
  const permissionOptions = computed(() =>
    Object.entries(API_PERMISSIONS).map(([key, value]) => ({
      value: key as TokenPermission,
      label: permissionLabels.value[key] ?? value.title,
    }))
  );
  const gameModes = computed(() =>
    GAME_MODE_OPTIONS.map((mode) => ({
      label: t(
        mode.labelKey,
        mode.value === GAME_MODES.SEASONAL
          ? 'Seasonal PvP'
          : mode.value === GAME_MODES.PVE
            ? 'PvE'
            : 'PvP'
      ),
      value: mode.value as GameMode,
    }))
  );
  const MAX_ACTIVE_TOKENS = 3;
  const activeTokenCount = computed(() => tokens.value.filter((token) => token.isActive).length);
  const tokenCapReached = computed(() => activeTokenCount.value >= MAX_ACTIVE_TOKENS);
  const canSubmit = computed(
    () =>
      userLoggedIn.value &&
      selectedPermissions.value.length > 0 &&
      !!selectedGameMode.value &&
      !tokenCapReached.value
  );
  const toggleActivity = (scope: string) => {
    activityScope.value = activityScope.value === scope ? null : scope;
  };
  const activityTitle = (token: TokenRow) =>
    token.note || t('page.settings.card.apitokens.default_note');
  const activityAction = (token: TokenRow, named = false) => {
    const action = activityScope.value === token.id ? 'hide' : 'view';
    const key = named ? `${action}_named` : action;
    return t(`page.settings.card.apitokens.activity.${key}`, { name: activityTitle(token) });
  };
  const displayedToken = (token: TokenRow) => {
    if (token.tokenValue) {
      return visibleTokens.value.has(token.id) ? token.tokenValue : maskToken(token.tokenValue);
    }
    const unavailable = supportsRawTokens.value ? 'token_value_missing' : 'token_value_hidden';
    return t(`page.settings.card.apitokens.${unavailable}`);
  };
  const tokenVisibilityLabel = (id: string) =>
    t(`page.settings.card.apitokens.${visibleTokens.value.has(id) ? 'hide_token' : 'show_token'}`);
  const formatGameMode = (mode: GameMode) => {
    const option = GAME_MODE_OPTIONS.find((entry) => entry.value === mode);
    return option
      ? t(
          option.labelKey,
          mode === GAME_MODES.SEASONAL ? 'Seasonal PvP' : mode === GAME_MODES.PVE ? 'PvE' : 'PvP'
        )
      : t('common.pvp', 'PvP');
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
  const invalidateTokenRenames = () => {
    renameTokenRequestId += 1;
  };
  const resetUserScopedState = () => {
    activityScope.value = null;
    invalidateTokenCreates();
    invalidateTokenLoads();
    invalidateTokenRenames();
    loading.value = false;
    creating.value = false;
    revokingId.value = null;
    renamingId.value = null;
    editingTokenId.value = null;
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
  const isCurrentTokenRename = (requestId: number, userId: string, tokenId: string) => {
    return (
      requestId === renameTokenRequestId &&
      getActiveUserId() === userId &&
      editingTokenId.value === tokenId
    );
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
    return `${API_TOKEN_PREFIXES[gameMode]}${hex}`;
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
    const userId = getActiveUserId();
    if (creating.value || !canSubmit.value || !userId) return;
    const requestId = ++createTokenRequestId;
    creating.value = true;
    try {
      const rawToken = generateToken(selectedGameMode.value);
      const response = await edgeFunctions.createToken({
        permissions: selectedPermissions.value,
        gameMode: selectedGameMode.value,
        note: note.value || null,
        tokenValue: supportsRawTokens.value ? rawToken : undefined,
      });
      if (!isCurrentTokenCreate(requestId, userId)) {
        return;
      }
      const tokenId = response?.tokenId || null;
      const tokenValue = response?.tokenValue || rawToken;
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
      const isTokenCapError =
        (error as { status?: number; statusCode?: number; message?: string })?.status === 409 ||
        (error as { status?: number; statusCode?: number; message?: string })?.statusCode === 409 ||
        (error as { message?: string })?.message?.includes('Token limit reached');
      if (isTokenCapError) {
        toast.add({
          title: t('page.settings.card.apitokens.token_cap_reached', 'Token limit reached'),
          description: t(
            'page.settings.card.apitokens.token_cap_reached_desc',
            'You can have at most 3 active API tokens. Revoke an existing token to create a new one.'
          ),
          color: 'warning',
        });
        await loadTokens();
      } else {
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
      }
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
  const startTokenNameEdit = (tokenId: string) => {
    if (renamingId.value !== null) return;
    editingTokenId.value = tokenId;
  };
  const cancelTokenNameEdit = () => {
    if (renamingId.value !== null) return;
    editingTokenId.value = null;
  };
  const getTokenRenameContext = (tokenId: string) => {
    const table = tableClient();
    const userId = getActiveUserId();
    const blocked = [!table, !userId, editingTokenId.value !== tokenId, renamingId.value !== null];
    if (blocked.includes(true)) {
      return null;
    }
    return { table: table as SupabaseTable, userId: userId as string };
  };
  const persistTokenName = async (
    table: SupabaseTable,
    tokenId: string,
    userId: string,
    name: string | null
  ) => {
    const { data, error } = await table
      .update({ note: name })
      .eq('token_id', tokenId)
      .eq('user_id', userId)
      .select('token_id')
      .single();
    if (error) {
      throw error;
    }
    if (data?.token_id !== tokenId) {
      throw new Error('Token rename returned no matching token');
    }
  };
  const showTokenRenameError = (error: unknown, tokenId: string, userId: string) => {
    logger.error('[ApiTokens] Failed to rename token:', error);
    showErrorToast({
      title: t('page.settings.card.apitokens.name_update_error'),
      error,
      context: {
        action: 'rename',
        area: 'api_tokens',
        tokenId,
        userId,
      },
      reportTitle: t('page.settings.card.apitokens.report.rename_failed'),
    });
  };
  const finishTokenRename = (requestId: number) => {
    if (requestId === renameTokenRequestId) {
      renamingId.value = null;
    }
  };
  const applyTokenRename = (
    requestId: number,
    tokenId: string,
    userId: string,
    nextName: string | null
  ) => {
    if (!isCurrentTokenRename(requestId, userId, tokenId)) return;
    const currentToken = tokens.value.find((token) => token.id === tokenId);
    if (currentToken) currentToken.note = nextName;
    editingTokenId.value = null;
    toast.add({
      title: t('page.settings.card.apitokens.name_updated'),
      color: 'success',
    });
  };
  const handleTokenRenameFailure = (
    requestId: number,
    error: unknown,
    tokenId: string,
    userId: string
  ) => {
    if (!isCurrentTokenRename(requestId, userId, tokenId)) return;
    showTokenRenameError(error, tokenId, userId);
  };
  const renameToken = async (token: TokenRow, nextName: string | null) => {
    const context = getTokenRenameContext(token.id);
    if (!context) return;
    const requestId = ++renameTokenRequestId;
    renamingId.value = token.id;
    try {
      await persistTokenName(context.table, token.id, context.userId, nextName);
      applyTokenRename(requestId, token.id, context.userId, nextName);
    } catch (error) {
      handleTokenRenameFailure(requestId, error, token.id, context.userId);
    } finally {
      finishTokenRename(requestId);
    }
  };
  const deleteToken = async (tokenId: string) => {
    const table = tableClient();
    const userId = getActiveUserId();
    if (!table || !userId) throw new Error('Not signed in');
    const { error } = (await table.delete().eq('token_id', tokenId).eq('user_id', userId)) as {
      error: SupabaseTokenError;
    };
    if (error) throw error;
  };
  const revokeToken = async (tokenId: string) => {
    if (!tokenId) return;
    revokingId.value = tokenId;
    try {
      await deleteToken(tokenId);
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
