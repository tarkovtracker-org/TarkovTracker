<template>
  <div
    class="bg-surface-850 overflow-hidden rounded-lg border border-white/10 shadow-md"
    :class="{ 'h-full': props.fillHeight, [props.cardClass]: true }"
  >
    <div class="m-0 h-full p-0">
      <div class="flex h-full flex-col">
        <!-- Header Section -->
        <header v-if="hasHeader" class="relative w-full">
          <!-- Slot for custom header content -->
          <slot name="header">
            <!-- Default header with icon and title -->
            <div
              v-if="props.title || props.icon"
              class="flex items-center justify-between pb-2 text-xl"
              :class="headerClasses"
            >
              <!-- Left side content (icon and title) -->
              <div class="flex items-center gap-3">
                <!-- Icon or Image -->
                <span
                  v-if="props.icon || props.avatar"
                  :class="highlightClasses"
                  class="inline-block rounded-br-lg px-3 py-1 shadow-lg"
                >
                  <img
                    v-if="props.avatar"
                    :src="props.avatar"
                    :height="avatarHeight"
                    :style="{ height: `${avatarHeight}px` }"
                    class="block pt-0"
                    :class="avatarClass"
                  />
                  <UIcon
                    v-else
                    :name="props.icon?.startsWith('mdi-') ? `i-${props.icon}` : props.icon"
                    :class="`text-${props.iconColor}`"
                    class="h-6 w-6"
                  />
                </span>
                <!-- Title -->
                <span
                  v-if="props.title"
                  class="inline-block px-2 text-left leading-6"
                  :class="titleClasses"
                >
                  {{ props.title }}
                </span>
              </div>
              <!-- Right side content -->
              <div
                v-if="$slots['title-right'] || props.subtitle"
                class="flex items-center gap-2 pr-4 text-right"
              >
                <slot name="title-right">
                  <span v-if="props.subtitle" class="text-surface-400 text-xs">
                    {{ props.subtitle }}
                  </span>
                </slot>
              </div>
            </div>
          </slot>
          <!-- Divider (only if there's content below) -->
          <div
            v-if="showDivider && (hasContent || hasFooter)"
            class="border-surface-700 mx-4 border-b"
          ></div>
        </header>
        <!-- Content Section -->
        <main v-if="hasContent" class="mt-2 w-full grow" :class="contentClasses">
          <slot name="content"></slot>
        </main>
        <!-- Footer Section -->
        <footer v-if="hasFooter" class="mt-auto w-full pb-1" :class="footerClasses">
          <slot name="footer"></slot>
        </footer>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { SemanticColor } from '@/types/theme';
  interface Props {
    // Header props
    title?: string;
    subtitle?: string;
    icon?: string;
    avatar?: string;
    iconColor?: SemanticColor | 'white';
    titleClasses?: string;
    headerClasses?: string;
    // Styling props
    highlightColor?: SemanticColor;
    fillHeight?: boolean;
    showDivider?: boolean;
    // Layout props
    contentClasses?: string;
    footerClasses?: string;
    cardClass?: string;
    // Avatar props
    avatarHeight?: number;
    avatarClass?: string;
  }
  const props = withDefaults(defineProps<Props>(), {
    title: '',
    subtitle: '',
    icon: '',
    avatar: '',
    iconColor: 'white',
    titleClasses: '',
    headerClasses: '',
    highlightColor: 'accent',
    fillHeight: true,
    showDivider: true,
    contentClasses: '',
    footerClasses: '',
    cardClass: '',
    avatarHeight: 50,
    avatarClass: '',
  });
  // Compute slot existence
  const slots = useSlots();
  const hasHeader = computed(() => !!(slots.header || props.title || props.icon || props.avatar));
  const hasContent = computed(() => !!slots.content);
  const hasFooter = computed(() => !!slots.footer);
  const highlightClassLookup = {
    accent: 'bg-gradient-to-br from-accent-800 via-accent-700 to-accent-600',
    error: 'bg-gradient-to-br from-error-800 via-error-700 to-error-600',
    info: 'bg-gradient-to-br from-info-800 via-info-700 to-info-600',
    kappa: 'bg-gradient-to-br from-kappa-800 via-kappa-700 to-kappa-600',
    lightkeeper: 'bg-gradient-to-br from-lightkeeper-800 via-lightkeeper-700 to-lightkeeper-600',
    primary: 'bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600',
    pve: 'bg-gradient-to-br from-pve-800 via-pve-700 to-pve-600',
    pvp: 'bg-gradient-to-br from-pvp-800 via-pvp-700 to-pvp-600',
    secondary: 'bg-gradient-to-br from-secondary-800 via-secondary-700 to-secondary-600',
    success: 'bg-gradient-to-br from-success-800 via-success-700 to-success-600',
    surface: 'bg-gradient-to-br from-surface-800 via-surface-700 to-surface-600',
    warning: 'bg-gradient-to-br from-warning-800 via-warning-700 to-warning-600',
  } as const satisfies Record<SemanticColor, string>;
  const highlightClasses = computed(() => {
    const colorKey = props.highlightColor;
    const selectedClass = highlightClassLookup[colorKey] || highlightClassLookup.accent;
    return { [selectedClass]: true };
  });
</script>
