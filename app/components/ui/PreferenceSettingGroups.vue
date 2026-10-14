<template>
  <div class="space-y-5">
    <section
      v-for="group in groups"
      :key="group.key"
      :data-testid="`${testIdPrefix}-group-${group.key}`"
      :aria-labelledby="`${idPrefix}-${group.key}`"
    >
      <h3
        :id="`${idPrefix}-${group.key}`"
        class="text-surface-400 mb-1 px-2 text-xs font-semibold tracking-wide uppercase"
      >
        {{ group.title }}
      </h3>
      <p v-if="group.hint" class="text-surface-400 mb-1 px-2 text-xs">{{ group.hint }}</p>
      <div class="space-y-0.5">
        <PreferenceSwitch
          v-for="setting in group.settings"
          :key="setting.key"
          :test-id="`${testIdPrefix}-${setting.key}`"
          :label="setting.label"
          :description="setting.description"
          :disabled="setting.disabled"
          :model-value="setting.get()"
          @update:model-value="setting.set"
        />
      </div>
      <slot name="after-group" :group="group" />
    </section>
  </div>
</template>
<script setup lang="ts">
  import PreferenceSwitch from '@/components/ui/PreferenceSwitch.vue';
  import type { PreferenceSettingGroup } from '@/types/filters';
  defineProps<{
    groups: PreferenceSettingGroup[];
    /** Prefix for group (`<prefix>-group-<key>`) and switch (`<prefix>-<key>`) test ids. */
    testIdPrefix: string;
  }>();
  const idPrefix = useId();
</script>
