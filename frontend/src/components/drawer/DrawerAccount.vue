<template>
  <v-list nav bg-color="transparent" class="mx-auto">
    <template v-if="fireuser.loggedIn">
      <v-list-group>
        <template #activator="{ props }">
          <template v-if="isCollapsed">
            <v-avatar
              v-bind="props"
              class="mx-auto"
              size="32"
              :class="'d-flex fake-link'"
            >
              <v-img
                :src="
                  userStore.getStreamerMode || !fireuser.photoURL
                    ? '/img/default-avatar.svg'
                    : fireuser.photoURL
                "
              />
            </v-avatar>
          </template>
          <template v-else>
            <v-list-item
              v-bind="props"
              :title="userStore.getStreamerMode ? 'User' : fireuser.displayName"
              :prepend-avatar="
                userStore.getStreamerMode || !fireuser.photoURL
                  ? '/img/default-avatar.svg'
                  : fireuser.photoURL
              "
            ></v-list-item>
          </template>
        </template>
        <drawer-item
          icon="mdi-lock"
          locale-key="logout"
          :is-collapsed="isCollapsed"
          @click.stop="logout"
        />
      </v-list-group>
    </template>
    <template v-else>
      <drawer-item
        icon="mdi-fingerprint"
        locale-key="login"
        to="/login"
        :is-collapsed="isCollapsed"
      />
    </template>
  </v-list>
</template>
<script setup>
  import { fireuser, auth } from '@/plugins/firebase';
  import { defineAsyncComponent } from 'vue';
  import { useUserStore } from '@/stores/user';
  import { signOut } from 'firebase/auth';

  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const userStore = useUserStore();
  const DrawerItem = defineAsyncComponent(
    () => import('@/components/drawer/DrawerItem.vue')
  );
  function logout() {
    signOut(auth);
  }
</script>
<style lang="scss" scoped>
  :global(
    body
      > div.v-overlay-container
      > div.allow-overflow
      > div.v-overlay__content
      > div.v-sheet
  ) {
    overflow-y: visible;
  }
  .fake-link {
    cursor: pointer;
  }
</style>
