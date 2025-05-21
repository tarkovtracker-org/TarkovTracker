<template>
  <v-sheet class="pa-2" color="primary" :rounded="true">
    <div>
      <b>{{ $t('page.settings.card.apitokens.note_column') }}:</b>
      {{ tokenDataRef?.note }}
    </div>
    <div>
      <b>{{ $t('page.settings.card.apitokens.token_column') }}:</b>
      {{ tokenHidden }}
    </div>
    <div>
      <b>{{ $t('page.settings.card.apitokens.permissions_column') }}: </b>
      <span v-for="(permission, index) in tokenPermissions" :key="index">
        {{ $t('page.settings.card.apitokens.permission.' + permission)
        }}<span v-if="index < tokenPermissions.length - 1">, </span>
      </span>
    </div>
    <div>{{ $t('page.settings.card.apitokens.created_column') }} {{ relativeDays }}</div>
    <div v-show="showQR">
      <template v-if="userStore.getStreamerMode">
        {{ $t('page.settings.card.apitokens.streamer_mode_qr') }}
      </template>
      <template v-else>
        <canvas :id="props.token + '-tc'"></canvas>
      </template>
    </div>
    <div class="mt-1">
      <v-btn
        variant="outlined"
        icon="mdi-content-copy"
        class="mx-1"
        color="secondary"
        size="x-small"
        @click="copyToken"
      ></v-btn>
      <v-btn
        variant="outlined"
        icon="mdi-qrcode"
        class="mx-1"
        color="secondary"
        size="x-small"
        @click="showQR = !showQR"
      ></v-btn>
      <v-btn
        variant="outlined"
        icon="mdi-delete"
        class="mx-1"
        color="secondary"
        :disabled="deleting"
        :loading="deleting"
        size="x-small"
        @click="deleteToken"
      ></v-btn>
    </div>
  </v-sheet>
</template>
<script setup>
  import { firestore, functions } from '@/plugins/firebase';
  import { doc, getDoc } from 'firebase/firestore';
  import { httpsCallable } from 'firebase/functions';
  import { computed, onMounted, ref } from 'vue';
  import QRCode from 'qrcode';
  import { useUserStore } from '@/stores/user';
  import { useI18n } from 'vue-i18n';
  // Get locale for use in calculating relative time
  const { locale } = useI18n({ useScope: 'global' });
  // Define the props for the component
  const props = defineProps({
    token: {
      type: String,
      required: true,
    },
  });
  console.log(`TokenCard instance created for token ID: ${props.token}`);
  const userStore = useUserStore();
  // Ref to store tokenData when retrieved from Firestore
  const tokenDataRef = ref(null);
  const tokenDoc = doc(firestore, 'token', props.token);
  // Retrieve the data from the document then store it in tokenDataRef
  getDoc(tokenDoc)
    .then((docSnap) => {
      if (docSnap.exists()) {
        console.log(
          `TokenCard (${props.token}): Document data:`,
          JSON.parse(JSON.stringify(docSnap.data()))
        );
        tokenDataRef.value = docSnap.data();
        console.log(
          `TokenCard (${props.token}): tokenDataRef set:`,
          JSON.parse(JSON.stringify(tokenDataRef.value))
        );
      } else {
        console.error(`TokenCard (${props.token}): No such document!`);
      }
    })
    .catch((error) => {
      console.error(`TokenCard (${props.token}): Error getting document:`, error);
    });
  // Computed property to retrieve the timestamp of the token creation
  const tokenCreated = computed(() => {
    if (!tokenDataRef.value?.created) return Date.now();
    return tokenDataRef.value.created.toDate() || Date.now();
  });
  // Computed property to display the permissions of the token
  const tokenPermissions = computed(() => {
    if (!tokenDataRef.value?.permissions) {
      console.log(
        `TokenCard (${props.token}): tokenPermissions computed - no permissions data yet.`
      );
      return [];
    }
    console.log(
      `TokenCard (${props.token}): tokenPermissions computed:`,
      tokenDataRef.value.permissions
    );
    return tokenDataRef.value.permissions;
  });
  // Calculate the relative days since the token was created using Intl.RelativeTimeFormat
  const relativeDays = computed(() => {
    if (!tokenDataRef.value?.created) {
      console.log(`TokenCard (${props.token}): relativeDays computed - no creation data yet.`);
      return 'N/A';
    }
    const relativeTimeFormat = new Intl.RelativeTimeFormat(locale.value, {
      numeric: 'auto',
    });
    const days = Math.floor((Date.now() - tokenCreated.value) / 86400000);
    const formattedDays = relativeTimeFormat.format(days, 'day');
    console.log(`TokenCard (${props.token}): relativeDays computed: ${formattedDays}`);
    return formattedDays;
  });
  const tokenHidden = computed(() => {
    if (userStore.getStreamerMode) {
      return props.token.replace(/.(?=.{0})/g, '*');
    } else {
      return props.token.replace(/.(?=.{5})/g, '*');
    }
  });
  const copyToken = () => {
    navigator.clipboard.writeText(props.token);
  };
  const deleting = ref(false);
  const deleteToken = async () => {
    const revokeTokenFn = httpsCallable(functions, 'revokeToken');
    deleting.value = true;
    try {
      const result = await revokeTokenFn({ token: props.token });
      if (result.data.error) {
        console.error(result.data.error);
      }
    } catch (error) {
      console.error('Error revoking token:', error);
    } finally {
      deleting.value = false;
    }
  };
  const showQR = ref(false);
  onMounted(() => {
    console.log(`TokenCard (${props.token}): Component mounted.`);
    if (document.getElementById(props.token + '-tc')) {
      QRCode.toCanvas(
        document.getElementById(props.token + '-tc'),
        props.token,
        {},
        function (error) {
          if (error) console.error(`TokenCard (${props.token}): QR Code error:`, error);
          else console.log(`TokenCard (${props.token}): QR Code generated.`);
        }
      );
    } else {
      console.warn(`TokenCard (${props.token}): Canvas element for QR code not found on mount.`);
    }
  });
</script>
<style lang="scss" scoped></style>
