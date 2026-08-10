<template>
  <div class="flex min-w-0 items-center gap-2">
    <UIcon name="i-mdi-key-variant" class="text-primary-400 h-5 w-5" />
    <form
      v-if="editing"
      class="flex min-w-0 flex-1 items-center gap-1.5"
      @submit.prevent="submitName"
    >
      <UInput
        v-model="draft"
        autofocus
        size="sm"
        class="min-w-0 flex-1 sm:max-w-xs"
        :aria-label="t('page.settings.card.apitokens.edit_name')"
        :placeholder="t('page.settings.card.apitokens.form.note_placeholder')"
        @keydown.esc.prevent="$emit('cancel')"
      />
      <UTooltip :text="t('page.settings.card.apitokens.save_name')">
        <UButton
          type="submit"
          icon="i-mdi-check"
          color="success"
          variant="ghost"
          size="xs"
          :padded="false"
          :loading="loading"
          :disabled="!hasChanges"
          :aria-label="t('page.settings.card.apitokens.save_name')"
        />
      </UTooltip>
      <UTooltip :text="t('page.settings.card.apitokens.cancel_name_edit')">
        <UButton
          type="button"
          icon="i-mdi-close"
          color="neutral"
          variant="ghost"
          size="xs"
          :padded="false"
          :disabled="loading"
          :aria-label="t('page.settings.card.apitokens.cancel_name_edit')"
          @click="$emit('cancel')"
        />
      </UTooltip>
    </form>
    <template v-else>
      <span class="text-surface-50 truncate font-medium">
        {{ displayName }}
      </span>
      <UTooltip :text="t('page.settings.card.apitokens.edit_name')">
        <UButton
          type="button"
          icon="i-mdi-pencil-outline"
          color="neutral"
          variant="ghost"
          size="xs"
          :padded="false"
          :disabled="disabled"
          :aria-label="t('page.settings.card.apitokens.edit_name_aria', { name: displayName })"
          @click="$emit('edit')"
        />
      </UTooltip>
    </template>
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{
    disabled: boolean;
    editing: boolean;
    loading: boolean;
    name: string | null;
  }>();
  const emit = defineEmits<{
    cancel: [];
    edit: [];
    save: [name: string | null];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const draft = ref('');
  const normalizeName = (value: string | null) => value?.trim() || null;
  const displayName = computed(() => props.name || t('page.settings.card.apitokens.default_note'));
  const hasChanges = computed(
    () => !props.loading && normalizeName(draft.value) !== normalizeName(props.name)
  );
  const submitName = () => {
    if (!hasChanges.value) return;
    emit('save', normalizeName(draft.value));
  };
  watch(
    () => props.editing,
    (editing) => {
      if (editing) {
        draft.value = props.name || '';
      }
    },
    { immediate: true }
  );
</script>
