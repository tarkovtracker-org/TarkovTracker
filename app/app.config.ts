const uiConfig = {
  // ✅ Nuxt UI v4: Map semantic color names to palette names defined in @theme (tailwind.css)
  colors: {
    primary: 'primary', // brand tan
    secondary: 'secondary', // brand dark
    neutral: 'surface', // dark grays for neutral UI elements
    // Game mode colors - map to in-game color palettes
    pvp: 'pvp', // in-game PvP tan (#DBD5C1)
    pve: 'pve', // in-game PvE blue (#73ADC3)
    // Semantic colors - keep Nuxt UI aligned with Tailwind tokens in tailwind.css
    info: 'info',
    accent: 'accent',
    success: 'success',
    warning: 'warning',
    error: 'error',
    kappa: 'kappa',
    lightkeeper: 'lightkeeper',
  },
  header: {
    slots: {
      root: 'fixed top-0 inset-x-0 z-50 backdrop-blur-sm bg-gradient-to-tr from-surface-800/95 to-surface-950/95 border-b border-surface-700/70 h-[var(--ui-header-height)]',
      container: 'h-full px-3 flex items-center gap-3',
      left: 'flex items-center gap-2',
      default: 'flex-1 min-w-0',
      right: 'ml-auto flex items-center gap-2',
    },
  },
  // Tooltip configuration - neutral colors for readability
  // IMPORTANT: content must set text color explicitly to prevent inheritance from trigger
  tooltip: {
    slots: {
      content:
        'z-[9999] bg-surface-800 text-surface-100 px-2.5 py-1.5 rounded-md shadow-lg border border-surface-700',
      text: 'font-normal',
      arrow: 'fill-surface-800',
    },
  },
  // Popover configuration to ensure proper display above other content
  popover: {
    popper: {
      strategy: 'fixed',
    },
    slots: {
      content:
        'z-[9999] bg-surface-900 border border-surface-700 rounded-lg shadow-xl ring-0 overflow-hidden',
    },
  },
  // DropdownMenu configuration for account menu and other dropdowns
  dropdownMenu: {
    slots: {
      trigger: 'ring-0 outline-none',
      content:
        'bg-surface-900 border border-surface-700 rounded-lg shadow-xl z-[9999] min-w-[140px] ring-0',
      group: 'p-1',
      label: 'px-2 py-1.5 text-xs font-semibold text-surface-400',
      separator: '-mx-1 my-1 h-px bg-surface-700',
      item: 'px-3 py-2 text-sm cursor-pointer transition-colors rounded text-surface-300 data-[highlighted]:bg-surface-800 data-[highlighted]:text-white light:data-[highlighted]:text-surface-50',
      itemLeadingIcon: 'text-surface-400 shrink-0 size-4',
      itemTrailingIcon: 'text-surface-400 shrink-0 size-4',
    },
  },
  input: {
    slots: {
      base: 'placeholder:text-surface-500',
    },
    variants: {
      variant: {
        outline:
          'text-surface-100 bg-surface-800 border border-surface-700 focus:border-surface-500 ring-0 outline-none',
      },
    },
  },
  // USelect specific configuration
  select: {
    popper: {
      strategy: 'fixed',
      placement: 'bottom-start',
    },
    slots: {
      base: 'relative w-full',
      input:
        'h-11 bg-surface-900 border border-white/15 text-surface-50 placeholder:text-surface-500 rounded-md pl-10 pr-3 py-2 focus:border-surface-500 ring-0 outline-none',
      leading: 'absolute inset-y-0 left-3 flex items-center pointer-events-none text-surface-300',
      options: 'z-[9999] max-h-60 overflow-auto !w-max',
    },
  },
  // SelectMenu configuration (Nuxt UI v4 slots)
  selectMenu: {
    slots: {
      base: 'bg-surface-900 border border-surface-700 rounded-md px-3 py-2 cursor-pointer ring-0 outline-none',
      leading: 'shrink-0 text-surface-300',
      trailing: 'shrink-0 text-surface-400',
      value: 'text-surface-100',
      placeholder: 'text-surface-500',
      content:
        'bg-surface-900 border border-surface-700 rounded-lg shadow-xl z-[9999] max-w-[90vw] min-w-fit overflow-auto',
      viewport: 'p-1 max-h-60 overflow-y-auto',
      group: '',
      empty: 'px-3 py-2 text-sm text-surface-500 text-center',
      label: 'px-2 py-1.5 text-xs font-semibold text-surface-400',
      separator: '-mx-1 my-1 h-px bg-surface-700',
      item: 'px-3 py-2 text-sm cursor-pointer transition-colors rounded text-surface-300 data-[highlighted]:bg-surface-800 data-[highlighted]:text-white light:data-[highlighted]:text-surface-50 data-[state=checked]:bg-surface-700 data-[state=checked]:text-white light:data-[state=checked]:text-surface-50 data-[state=checked]:font-medium',
      itemLeadingIcon: 'text-surface-400 shrink-0',
      itemLeadingAvatar: 'shrink-0',
      itemLeadingChip: 'shrink-0',
      itemLabel: 'break-words whitespace-normal',
      itemTrailing: 'ms-auto',
      itemTrailingIcon: 'text-surface-400 shrink-0',
    },
  },
  // Modal configuration with proper z-index stacking
  modal: {
    slots: {
      // Overlay must be above all content
      overlay: 'fixed inset-0 z-[60] bg-surface-900/75',
      // Content panel - must be above overlay with proper centering
      content:
        'fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-y-auto pointer-events-none',
      // Actual modal content wrapper
      wrapper:
        'relative w-full max-w-md bg-surface-800 border border-surface-700 rounded-lg shadow-xl pointer-events-auto',
    },
  },
  // Badge configuration: readable minimum typography and AA contrast in dark & light themes
  badge: {
    variants: {
      size: {
        xs: {
          base: 'text-xs/4 px-1.5 py-0.5 gap-1 rounded-sm',
          leadingIcon: 'size-3',
          leadingAvatarSize: '3xs',
          trailingIcon: 'size-3',
        },
        sm: {
          base: 'text-xs px-2 py-0.5 gap-1 rounded-sm',
          leadingIcon: 'size-3.5',
          leadingAvatarSize: '3xs',
          trailingIcon: 'size-3.5',
        },
        md: {
          base: 'text-xs px-2.5 py-1 gap-1.5 rounded-md',
          leadingIcon: 'size-4',
          leadingAvatarSize: '3xs',
          trailingIcon: 'size-4',
        },
        lg: {
          base: 'text-sm px-2.5 py-1 gap-1.5 rounded-md',
          leadingIcon: 'size-5',
          leadingAvatarSize: '2xs',
          trailingIcon: 'size-5',
        },
        xl: {
          base: 'text-base px-3 py-1.5 gap-1.5 rounded-md',
          leadingIcon: 'size-6',
          leadingAvatarSize: '2xs',
          trailingIcon: 'size-6',
        },
      },
    },
    compoundVariants: [
      {
        color: 'primary',
        variant: 'solid',
        class: 'bg-primary-500 light:bg-primary-800 text-surface-950 light:text-white',
      },
      {
        color: 'primary',
        variant: 'soft',
        class: 'bg-primary-500/15 text-primary-300',
      },
      {
        color: 'primary',
        variant: 'subtle',
        class: 'bg-primary-500/15 text-primary-300 ring ring-inset ring-primary-400/35',
      },
      {
        color: 'primary',
        variant: 'outline',
        class: 'ring ring-inset ring-primary-400/50 text-primary-300',
      },
      {
        color: 'info',
        variant: 'solid',
        class: 'bg-info-600 text-white',
      },
      {
        color: 'info',
        variant: 'soft',
        class: 'bg-info-500/15 text-info-300',
      },
      {
        color: 'info',
        variant: 'subtle',
        class: 'bg-info-500/15 text-info-300 ring ring-inset ring-info-400/35',
      },
      {
        color: 'info',
        variant: 'outline',
        class: 'ring ring-inset ring-info-400/50 text-info-300',
      },
      {
        color: 'secondary',
        variant: 'solid',
        class: 'bg-secondary-600 text-white',
      },
      {
        color: 'secondary',
        variant: 'soft',
        class: 'bg-secondary-500/15 text-secondary-300',
      },
      {
        color: 'secondary',
        variant: 'subtle',
        class: 'bg-secondary-500/15 text-secondary-300 ring ring-inset ring-secondary-400/35',
      },
      {
        color: 'secondary',
        variant: 'outline',
        class: 'ring ring-inset ring-secondary-400/50 text-secondary-300',
      },
      {
        color: 'accent',
        variant: 'solid',
        class: 'bg-accent-600 text-white',
      },
      {
        color: 'accent',
        variant: 'soft',
        class: 'bg-accent-500/15 text-accent-300',
      },
      {
        color: 'accent',
        variant: 'subtle',
        class: 'bg-accent-500/15 text-accent-300 ring ring-inset ring-accent-400/35',
      },
      {
        color: 'accent',
        variant: 'outline',
        class: 'ring ring-inset ring-accent-400/50 text-accent-300',
      },
      {
        color: 'success',
        variant: 'solid',
        class: 'bg-success-600 text-white',
      },
      {
        color: 'success',
        variant: 'soft',
        class: 'bg-success-500/15 text-success-300',
      },
      {
        color: 'success',
        variant: 'subtle',
        class: 'bg-success-500/15 text-success-300 ring ring-inset ring-success-400/35',
      },
      {
        color: 'success',
        variant: 'outline',
        class: 'ring ring-inset ring-success-400/50 text-success-300',
      },
      {
        color: 'warning',
        variant: 'solid',
        class: 'bg-warning-500 light:bg-warning-700 text-surface-950 light:text-white',
      },
      {
        color: 'warning',
        variant: 'soft',
        class: 'bg-warning-500/15 text-warning-300',
      },
      {
        color: 'warning',
        variant: 'subtle',
        class: 'bg-warning-500/15 text-warning-300 ring ring-inset ring-warning-400/35',
      },
      {
        color: 'warning',
        variant: 'outline',
        class: 'ring ring-inset ring-warning-400/50 text-warning-300',
      },
      {
        color: 'error',
        variant: 'solid',
        class: 'bg-error-600 text-white',
      },
      {
        color: 'error',
        variant: 'soft',
        class: 'bg-error-500/15 text-error-300',
      },
      {
        color: 'error',
        variant: 'subtle',
        class: 'bg-error-500/15 text-error-300 ring ring-inset ring-error-400/35',
      },
      {
        color: 'error',
        variant: 'outline',
        class: 'ring ring-inset ring-error-400/50 text-error-300',
      },
      {
        color: 'kappa',
        variant: 'solid',
        class: 'bg-kappa-600 text-white',
      },
      {
        color: 'kappa',
        variant: 'outline',
        class: 'ring ring-inset ring-kappa-400/50 text-kappa-300',
      },
      {
        color: 'kappa',
        variant: 'soft',
        class: 'bg-kappa-500/15 text-kappa-300',
      },
      {
        color: 'kappa',
        variant: 'subtle',
        class: 'bg-kappa-500/15 text-kappa-300 ring ring-inset ring-kappa-400/35',
      },
      {
        color: 'lightkeeper',
        variant: 'solid',
        class: 'bg-lightkeeper-500 light:bg-lightkeeper-700 text-surface-950 light:text-white',
      },
      {
        color: 'lightkeeper',
        variant: 'outline',
        class: 'ring ring-inset ring-lightkeeper-400/50 text-lightkeeper-300',
      },
      {
        color: 'lightkeeper',
        variant: 'soft',
        class: 'bg-lightkeeper-500/15 text-lightkeeper-300',
      },
      {
        color: 'lightkeeper',
        variant: 'subtle',
        class: 'bg-lightkeeper-500/15 text-lightkeeper-300 ring ring-inset ring-lightkeeper-400/35',
      },
    ],
  },
  // Alert configuration: AA-verified foregrounds on soft/subtle tints in dark & light themes
  alert: {
    compoundVariants: [
      {
        color: 'info',
        variant: 'soft',
        class: {
          root: 'bg-info-500/12 text-info-200',
          icon: 'text-info-300',
        },
      },
      {
        color: 'info',
        variant: 'subtle',
        class: {
          root: 'bg-info-500/12 text-info-200 ring ring-inset ring-info-400/30',
          icon: 'text-info-300',
        },
      },
      {
        color: 'warning',
        variant: 'soft',
        class: {
          root: 'bg-warning-500/12 text-warning-200',
          icon: 'text-warning-300',
        },
      },
      {
        color: 'error',
        variant: 'soft',
        class: {
          root: 'bg-error-500/12 text-error-200',
          icon: 'text-error-300',
        },
      },
      {
        color: 'success',
        variant: 'soft',
        class: {
          root: 'bg-success-500/12 text-success-200',
          icon: 'text-success-300',
        },
      },
    ],
  },
  // Button configuration - neutral default, tan only for CTAs
  button: {
    slots: {
      base: 'focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus:outline-none',
    },
    defaultVariants: {
      color: 'neutral',
      variant: 'soft',
    },
    compoundVariants: [
      {
        color: 'primary',
        variant: 'solid',
        class:
          'bg-primary-500 light:bg-primary-800 hover:bg-primary-400 light:hover:bg-primary-900 active:bg-primary-600 light:active:bg-primary-950 text-surface-950 font-medium',
      },
      {
        color: 'primary',
        variant: 'soft',
        class: 'bg-primary-500/15 hover:bg-primary-500/25 text-primary-300',
      },
      {
        color: 'primary',
        variant: 'ghost',
        class: 'text-primary-400 hover:bg-primary-500/10',
      },
      {
        color: 'primary',
        variant: 'outline',
        class: 'ring ring-inset ring-primary-500/50 text-primary-400 hover:bg-primary-500/10',
      },
      {
        color: 'primary',
        variant: 'link',
        class: 'text-primary-400 hover:text-primary-300 underline-offset-4 hover:underline',
      },
      {
        color: 'neutral',
        variant: 'solid',
        class: 'bg-surface-700 hover:bg-surface-600 text-surface-100',
      },
      {
        color: 'neutral',
        variant: 'soft',
        class: 'bg-surface-800 hover:bg-surface-700 text-surface-200',
      },
      {
        color: 'neutral',
        variant: 'ghost',
        class: 'text-surface-300 hover:bg-surface-800 hover:text-surface-100',
      },
      {
        color: 'neutral',
        variant: 'outline',
        class: 'ring ring-inset ring-surface-600 text-surface-300 hover:bg-surface-800',
      },
      {
        color: 'neutral',
        variant: 'link',
        class: 'text-surface-300 hover:text-surface-100 underline-offset-4 hover:underline',
      },
      {
        color: 'pvp',
        variant: 'solid',
        class:
          'bg-pvp-500 hover:bg-pvp-400 active:bg-pvp-600 text-surface-950 light:bg-pvp-800 light:hover:bg-pvp-900 light:text-white font-medium',
      },
      {
        color: 'pvp',
        variant: 'soft',
        class: 'bg-pvp-900 light:bg-pvp-50 hover:bg-pvp-800 light:hover:bg-pvp-100 text-pvp-200',
      },
      {
        color: 'pvp',
        variant: 'ghost',
        class: 'text-pvp-400 hover:bg-pvp-900 light:hover:bg-pvp-100',
      },
      {
        color: 'pvp',
        variant: 'outline',
        class:
          'ring ring-inset ring-pvp-500 light:ring-pvp-700 text-pvp-400 hover:bg-pvp-950 light:hover:bg-pvp-100',
      },
      {
        color: 'pvp',
        variant: 'link',
        class: 'text-pvp-400 hover:text-pvp-300 underline-offset-4 hover:underline',
      },
      {
        color: 'pve',
        variant: 'solid',
        class:
          'bg-pve-500 hover:bg-pve-400 active:bg-pve-600 text-surface-950 light:bg-pve-700 light:hover:bg-pve-800 light:text-white font-medium',
      },
      {
        color: 'pve',
        variant: 'soft',
        class: 'bg-pve-900 light:bg-pve-50 hover:bg-pve-800 light:hover:bg-pve-100 text-pve-200',
      },
      {
        color: 'pve',
        variant: 'ghost',
        class: 'text-pve-400 hover:bg-pve-900 light:hover:bg-pve-100',
      },
      {
        color: 'pve',
        variant: 'outline',
        class:
          'ring ring-inset ring-pve-500 light:ring-pve-700 text-pve-400 hover:bg-pve-950 light:hover:bg-pve-100',
      },
      {
        color: 'pve',
        variant: 'link',
        class: 'text-pve-400 hover:text-pve-300 underline-offset-4 hover:underline',
      },
      {
        color: 'info',
        variant: 'solid',
        class: 'bg-info-600 hover:bg-info-500 active:bg-info-700 text-white font-medium',
      },
      {
        color: 'info',
        variant: 'soft',
        class: 'bg-info-500/15 hover:bg-info-500/25 text-info-300',
      },
      {
        color: 'info',
        variant: 'subtle',
        class: 'bg-info-500/15 hover:bg-info-500/25 text-info-300 ring ring-inset ring-info-400/35',
      },
      {
        color: 'info',
        variant: 'ghost',
        class: 'text-info-300 hover:bg-info-500/15',
      },
      {
        color: 'info',
        variant: 'outline',
        class: 'ring ring-inset ring-info-400/50 text-info-300 hover:bg-info-500/15',
      },
      {
        color: 'info',
        variant: 'link',
        class: 'text-info-300 hover:text-info-200 underline-offset-4 hover:underline',
      },
      {
        color: 'secondary',
        variant: 'solid',
        class:
          'bg-secondary-600 hover:bg-secondary-500 active:bg-secondary-700 text-white font-medium',
      },
      {
        color: 'secondary',
        variant: 'soft',
        class: 'bg-secondary-500/15 hover:bg-secondary-500/25 text-secondary-300',
      },
      {
        color: 'secondary',
        variant: 'subtle',
        class:
          'bg-secondary-500/15 hover:bg-secondary-500/25 text-secondary-300 ring ring-inset ring-secondary-400/35',
      },
      {
        color: 'secondary',
        variant: 'ghost',
        class: 'text-secondary-300 hover:bg-secondary-500/15',
      },
      {
        color: 'secondary',
        variant: 'outline',
        class: 'ring ring-inset ring-secondary-400/50 text-secondary-300 hover:bg-secondary-500/15',
      },
      {
        color: 'secondary',
        variant: 'link',
        class: 'text-secondary-300 hover:text-secondary-200 underline-offset-4 hover:underline',
      },
      {
        color: 'accent',
        variant: 'solid',
        class: 'bg-accent-600 hover:bg-accent-500 active:bg-accent-700 text-white font-medium',
      },
      {
        color: 'accent',
        variant: 'soft',
        class: 'bg-accent-500/15 hover:bg-accent-500/25 text-accent-300',
      },
      {
        color: 'accent',
        variant: 'subtle',
        class:
          'bg-accent-500/15 hover:bg-accent-500/25 text-accent-300 ring ring-inset ring-accent-400/35',
      },
      {
        color: 'accent',
        variant: 'ghost',
        class: 'text-accent-300 hover:bg-accent-500/15',
      },
      {
        color: 'accent',
        variant: 'outline',
        class: 'ring ring-inset ring-accent-400/50 text-accent-300 hover:bg-accent-500/15',
      },
      {
        color: 'accent',
        variant: 'link',
        class: 'text-accent-300 hover:text-accent-200 underline-offset-4 hover:underline',
      },
      {
        color: 'warning',
        variant: 'solid',
        class:
          'bg-warning-500 hover:bg-warning-400 active:bg-warning-600 text-surface-950 light:bg-warning-700 light:hover:bg-warning-800 light:text-white font-medium',
      },
      {
        color: 'warning',
        variant: 'soft',
        class: 'bg-warning-500/15 hover:bg-warning-500/25 text-warning-300',
      },
      {
        color: 'warning',
        variant: 'subtle',
        class:
          'bg-warning-500/15 hover:bg-warning-500/25 text-warning-300 ring ring-inset ring-warning-400/35',
      },
      {
        color: 'warning',
        variant: 'ghost',
        class: 'text-warning-300 hover:bg-warning-500/15',
      },
      {
        color: 'warning',
        variant: 'outline',
        class: 'ring ring-inset ring-warning-400/50 text-warning-300 hover:bg-warning-500/15',
      },
      {
        color: 'warning',
        variant: 'link',
        class: 'text-warning-300 hover:text-warning-200 underline-offset-4 hover:underline',
      },
      {
        color: 'error',
        variant: 'solid',
        class: 'bg-error-600 hover:bg-error-500 active:bg-error-700 text-white font-medium',
      },
      {
        color: 'error',
        variant: 'soft',
        class: 'bg-error-500/15 hover:bg-error-500/25 text-error-300',
      },
      {
        color: 'error',
        variant: 'subtle',
        class:
          'bg-error-500/15 hover:bg-error-500/25 text-error-300 ring ring-inset ring-error-400/35',
      },
      {
        color: 'error',
        variant: 'ghost',
        class: 'text-error-300 hover:bg-error-500/15',
      },
      {
        color: 'error',
        variant: 'outline',
        class: 'ring ring-inset ring-error-400/50 text-error-300 hover:bg-error-500/15',
      },
      {
        color: 'error',
        variant: 'link',
        class: 'text-error-300 hover:text-error-200 underline-offset-4 hover:underline',
      },
      {
        color: 'success',
        variant: 'solid',
        class: 'bg-success-600 hover:bg-success-500 active:bg-success-700 text-white font-medium',
      },
      {
        color: 'success',
        variant: 'soft',
        class:
          'bg-success-950 light:bg-success-50 hover:bg-success-900 light:hover:bg-success-100 text-success-200',
      },
      {
        color: 'success',
        variant: 'ghost',
        class:
          'text-success-400 light:text-success-800 hover:bg-success-950 light:hover:bg-success-100',
      },
      {
        color: 'success',
        variant: 'outline',
        class:
          'ring ring-inset ring-success-500 text-success-400 light:text-success-800 hover:bg-success-950 light:hover:bg-success-100 hover:text-white light:hover:text-success-800',
      },
      {
        color: 'success',
        variant: 'link',
        class:
          'text-success-400 light:text-success-800 hover:text-success-300 light:hover:text-success-900 underline-offset-4 hover:underline',
      },
    ],
  },
  // Switch/Toggle configuration - red when off, green when on
  switch: {
    slots: {
      base: 'data-[state=unchecked]:bg-error-500',
    },
    variants: {
      color: {
        primary: {
          base: 'data-[state=checked]:bg-success-500 focus-visible:outline-success-500',
        },
        success: {
          base: 'data-[state=checked]:bg-success-500 focus-visible:outline-success-500',
        },
        neutral: {
          base: 'data-[state=checked]:bg-success-500 focus-visible:outline-success-500',
        },
      },
    },
    defaultVariants: {
      color: 'success',
    },
  },
  // Checkbox configuration - neutral styling, success accent when checked.
  // Pair the pale light-mode success plate with a dark tick. Scope both overrides to
  // success: other colors retain dark plates and need Nuxt UI's inherited `text-inverted`
  // foreground, which resolves to pale surface-950 in light mode.
  checkbox: {
    slots: {
      root: 'relative flex items-start',
      base: 'h-4 w-4 shrink-0 rounded border transition-all border-surface-500 data-[state=unchecked]:bg-surface-800',
      icon: 'h-4 w-4',
    },
    compoundVariants: [
      {
        color: 'success',
        class: { indicator: 'light:bg-success-100', icon: 'light:text-surface-50' },
      },
    ],
    defaultVariants: {
      color: 'success',
    },
  },
};
export default defineAppConfig({
  ui: uiConfig,
});
