<template>
  <v-container v-if="userStore.showTip(tipKey)" class="mb-0 pb-0">
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8" xl="6">
        <v-alert :color="props.color" theme="dark" :icon="props.icon" border prominent>
          {{ t('tips.' + tipKey + '.description') }}
          <v-container class="align-right pa-0 pt-2" fluid>
            <v-btn
              variant="tonal"
              prepend-icon="mdi-eye-off"
              style="opacity: 0.75"
              @click="hideTip"
            >
              {{ t('tips.hide_tip') }}
            </v-btn>
          </v-container>
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup lang="ts">
  import { useUserStore } from '@/stores/user';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps({
    icon: {
      type: String,
      default: 'mdi-comment-question',
      required: false,
    },
    iconColor: {
      type: String,
      default: 'white',
      required: false,
    },
    color: {
      type: String,
      default: 'accent',
      required: false,
    },
    tip: {
      type: [String, Object],
      required: false,
      default: '',
    },
    closeable: {
      type: Boolean,
      default: true,
      required: false,
    },
  });
  const userStore = useUserStore();
  function getTipKey(tip: unknown): string {
    if (typeof tip === 'string') return tip;
    if (tip && typeof tip === 'object' && 'id' in tip && typeof (tip as any).id === 'string')
      return (tip as any).id;
    return '';
  }
  const tipKey = getTipKey(props.tip);
  const hideTip = () => {
    userStore.hideTip(tipKey);
  };
</script>
<style lang="scss" scoped></style>
