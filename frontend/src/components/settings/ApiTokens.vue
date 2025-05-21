<template>
  <v-container>
    <template v-if="userTokenCount == 0">
      <div style="text-align: left" class="pt-2 px-4">
        {{ $t('page.settings.card.apitokens.no_tokens') }}
      </div>
    </template>
    <v-row no-gutters>
      <v-col
        v-for="(token, index) in userTokens"
        :key="token"
        cols="12"
        sm="12"
        md="6"
        lg="6"
        xl="6"
      >
        <token-card :token="token" class="ma-2" />
      </v-col>
    </v-row>
  </v-container>
  <v-container v-if="showNewTokenForm">
    <!-- Form to create a user API token -->
    <v-sheet color="secondary_dark" rounded class="pa-2">
      <v-form ref="newTokenForm" v-model="validNewToken">
        <v-text-field
          v-model="tokenName"
          :rules="tokenNameRules"
          label="Token Description (Required)"
          required
          density="compact"
        >
        </v-text-field>
        <!-- For each available permission flag, display it as a checkbox -->
        <v-checkbox
          v-for="(permission, permissionKey) in availablePermissions"
          :key="permission"
          v-model="selectedPermissions"
          :label="permission.title"
          :value="permissionKey"
          :error="selectOneError"
          density="compact"
          hide-details
        >
        </v-checkbox>
        <v-btn
          :disabled="creatingToken"
          color="success"
          class="mr-4"
          :loading="creatingToken"
          append-icon="mdi-key-plus"
          @click="createToken"
        >
          {{ $t('page.settings.card.apitokens.submit_new_token') }}
        </v-btn>
      </v-form>
    </v-sheet>
  </v-container>
  <v-container class="align-left" fluid>
    <v-row align="start">
      <!-- Button to show the new token form -->
      <v-btn
        v-if="!showNewTokenForm"
        variant="outlined"
        class="mx-1"
        prepend-icon="mdi-unfold-more-horizontal"
        @click="showNewTokenForm = true"
      >
        {{ $t('page.settings.card.apitokens.new_token_expand') }}
      </v-btn>
    </v-row>
  </v-container>
  <v-snackbar v-model="newTokenSnackbar" :timeout="4000" color="accent">
    {{ tokenResult }}
    <template #actions>
      <v-btn color="white" variant="text" @click="newTokenSnackbar = false"> Close </v-btn>
    </template>
  </v-snackbar>
</template>
<script setup>
  import { ref, defineAsyncComponent, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { functions } from '@/plugins/firebase';
  import { httpsCallable } from 'firebase/functions';
  import { useLiveData } from '@/composables/livedata';
  import availablePermissions from '@/utils/api_permissions';
  const TokenCard = defineAsyncComponent(() => import('@/components/settings/TokenCard'));
  const { t } = useI18n({ useScope: 'global' });
  const { useSystemStore } = useLiveData();
  const systemStore = useSystemStore();

  // Use computed properties directly from the store's $state
  const userTokens = computed(() => systemStore.$state.tokens || []);
  const userTokenCount = computed(() => systemStore.$state.tokens?.length || 0);

  // New token form
  const selectOneError = ref(false);
  const newTokenForm = ref(null);
  const validNewToken = ref(false);
  const tokenName = ref('');
  const selectedPermissions = ref([]);
  const selectedPermissionsCount = computed(() => selectedPermissions.value.length);
  const tokenNameRules = ref([
    (v) => !!v || 'You must enter a token description',
    (v) => v.length <= 20 || 'Token description must be less than 20 characters',
  ]);
  const creatingToken = ref(false);
  const tokenResult = ref(null);
  const newTokenSnackbar = ref(false);
  const showNewTokenForm = ref(false);
  const createToken = async () => {
    let { valid } = await newTokenForm.value.validate();
    if (!valid) {
      if (selectedPermissionsCount.value == 0) {
        selectOneError.value = true;
        return;
      } else {
        selectOneError.value = false;
      }
      return;
    }
    if (selectedPermissionsCount.value == 0) {
      selectOneError.value = true;
      return;
    } else {
      selectOneError.value = false;
    }
    creatingToken.value = true;
    try {
      const createTokenFn = httpsCallable(functions, 'createToken');
      tokenResult.value = await createTokenFn({
        note: tokenName.value,
        permissions: selectedPermissions.value,
      });
      // Add the new token to the systemStore
      if (tokenResult.value.data && tokenResult.value.data.token) {
        systemStore.userTokens = [...systemStore.userTokens, tokenResult.value.data.token];
        console.log(
          'Updated systemStore.userTokens in ApiTokens.vue (reassigned):',
          JSON.parse(JSON.stringify(systemStore.userTokens))
        );
      }
      newTokenForm.value.reset();
      selectedPermissions.value = [];
      tokenResult.value = t('page.settings.card.apitokens.create_token_success');
      newTokenSnackbar.value = true;
    } catch (error) {
      console.error('Error creating token:', error);
      tokenResult.value = t('page.settings.card.apitokens.create_token_error');
      newTokenSnackbar.value = true;
    }
    creatingToken.value = false;
  };
</script>
<style lang="scss" scoped></style>
