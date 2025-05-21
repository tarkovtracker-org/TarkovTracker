<template>
  <v-footer
    class="px-0 py-1 d-flex"
    color="transparent"
    style="min-height: auto !important; height: auto !important; flex: 0 0 auto !important"
  >
    <v-container class="text-center footer-background mx-0">
      <v-row justify="center" style="font-size: 12px">
        <v-col cols="12" md="4" align-self="center">
          <div>
            <i18n-t keypath="footer.call_to_action.discord_phrase">
              <template #discord>
                <a href="https://discord.gg/zeAP4Ng" target="_blank" class="info-link">
                  <div
                    class="d-inline-flex align-center"
                    style="
                      color: #7289da;
                      vertical-align: middle;
                      position: relative;
                      top: -1px;
                      margin-right: 0;
                    "
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      style="margin-right: 1px"
                    >
                      <path
                        d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03
                        c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09
                        c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02
                        c-2.72 4.07-3.47 8.03-3.1 11.95
                        c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02
                        c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78
                        c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01
                        c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26
                        c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09
                        c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65
                        c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02
                        zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12
                        c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0
                        c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12
                        c0 1.17-.83 2.12-1.89 2.12z
                        c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z"
                      />
                    </svg>
                  </div>
                  {{ t('footer.call_to_action.discord') }}
                </a>
              </template>
            </i18n-t>
          </div>
          <div class="mt-1">
            <i18n-t keypath="footer.call_to_action.github_phrase" scope="global">
              <template #github>
                <a
                  href="https://github.com/tarkovtracker-org/TarkovTracker"
                  target="_blank"
                  class="info-link"
                >
                  <v-icon class="mr-1 icon-link">mdi-github</v-icon
                  >{{ t('footer.call_to_action.github') }}
                </a>
              </template>
            </i18n-t>
          </div>
        </v-col>
      </v-row>
      <v-container class="text-center mb-0 pb-0" style="font-size: 12px">
        <div>
          Game content and materials are trademarks and copyrights of Battlestate Games and its
          licensors. All rights reserved.
        </div>
        <div class="mt-2">TarkovTracker &copy; 2020 - {{ new Date().getFullYear() }}</div>
        <div class="mt-0">
          <router-link to="/terms" target="_blank" class="info-link">Terms</router-link>
          |
          <router-link to="/privacy" target="_blank" class="info-link">Privacy</router-link>
        </div>
      </v-container>
    </v-container>
  </v-footer>
</template>
<script setup>
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n({ useScope: 'global' });
</script>
<style lang="scss" scoped>
  .footer-background {
    background-color: rgba(0, 0, 0, 0.3);
    max-width: 100% !important;
  }
  a:link,
  a:active,
  a:visited {
    color: rgba(var(--v-theme-link), 1);
  }
  .info-link {
    text-decoration: none;
  }
  .icon-link {
    color: #7289da !important;
  }
  :deep(.mdi-discord) {
    color: #7289da !important;
  }
  .custom-svg {
    height: 4em;
  }
</style>
