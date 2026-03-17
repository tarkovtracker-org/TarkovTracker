const uiConfig = {
  // ✅ Nuxt UI v4: Map semantic color names to palette names defined in @theme (tailwind.css)
  colors: {
    primary: 'primary', // brand tan
    secondary: 'secondary', // brand dark
    neutral: 'surface', // dark grays for neutral UI elements
    // Game mode colors - map to in-game color palettes
    pvp: 'pvp', // in-game PvP tan (#DBD5C1)
    pve: 'pve', // in-game PvE blue (#73ADC3)
    // Semantic colors - map to Tailwind's default palettes or custom ones
    info: 'accent',
    success: 'success',
    warning: 'warning',
    error: 'error',
    kappa: 'kappa',
    lightkeeper: 'lightkeeper',
  },
  header: {
    slots: {
      root: 'fixed top-0 inset-x-0 z-50 h-[var(--ui-header-height)] border-b border-border backdrop-blur-sm bg-shell',
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
        'z-[9999] rounded-md border border-border bg-raised px-2.5 py-1.5 text-foreground shadow-card',
      text: 'font-normal',
      arrow: 'fill-raised',
    },
  },
  // Popover configuration to ensure proper display above other content
  popover: {
    popper: {
      strategy: 'fixed',
    },
    slots: {
      content: 'z-[9999]',
    },
  },
  // DropdownMenu configuration for account menu and other dropdowns
  dropdownMenu: {
    slots: {
      trigger: 'ring-0 outline-none',
      content:
        'z-[9999] min-w-[140px] rounded-lg border border-border bg-panel shadow-elevated ring-0',
      group: 'p-1',
      label: 'px-2 py-1.5 text-xs font-semibold text-foreground-subtle',
      separator: '-mx-1 my-1 h-px bg-border',
      item: 'px-3 py-2 text-sm cursor-pointer rounded text-foreground-muted transition-colors data-[highlighted]:bg-interactive data-[highlighted]:text-foreground',
      itemLeadingIcon: 'text-foreground-subtle shrink-0 size-4',
      itemTrailingIcon: 'text-foreground-subtle shrink-0 size-4',
    },
  },
  input: {
    slots: {
      base: 'placeholder:text-foreground-subtle',
    },
    variants: {
      variant: {
        outline:
          'border border-border bg-field text-foreground ring-0 outline-none focus:border-border-strong',
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
        'h-11 rounded-md border border-border-muted bg-field py-2 pl-10 pr-3 text-foreground placeholder:text-foreground-subtle ring-0 outline-none focus:border-border-strong',
      leading:
        'absolute inset-y-0 left-3 flex items-center pointer-events-none text-foreground-muted',
      options: 'z-[9999] max-h-60 overflow-auto !w-max',
    },
  },
  // SelectMenu configuration (Nuxt UI v4 slots)
  selectMenu: {
    slots: {
      base: 'cursor-pointer rounded-md border border-border bg-field px-3 py-2 ring-0 outline-none',
      leading: 'shrink-0 text-foreground-muted',
      trailing: 'shrink-0 text-foreground-subtle',
      value: 'text-foreground',
      placeholder: 'text-foreground-subtle',
      content:
        'z-[9999] !w-[var(--reka-combobox-trigger-width)] rounded-lg border border-border bg-panel shadow-elevated',
      viewport: 'p-1 max-h-60 overflow-y-auto',
      group: '',
      empty: 'px-3 py-2 text-center text-sm text-foreground-subtle',
      label: 'px-2 py-1.5 text-xs font-semibold text-foreground-subtle',
      separator: '-mx-1 my-1 h-px bg-border',
      item: 'px-3 py-2 text-sm cursor-pointer rounded text-foreground-muted transition-colors data-[highlighted]:bg-interactive data-[highlighted]:text-foreground data-[state=checked]:bg-selected-surface data-[state=checked]:text-foreground data-[state=checked]:font-medium',
      itemLeadingIcon: 'text-foreground-subtle shrink-0',
      itemLeadingAvatar: 'shrink-0',
      itemLeadingChip: 'shrink-0',
      itemLabel: 'whitespace-nowrap',
      itemTrailing: 'ms-auto',
      itemTrailingIcon: 'text-foreground-subtle shrink-0',
    },
  },
  // Modal configuration with proper z-index stacking
  modal: {
    slots: {
      // Overlay must be above all content
      overlay: 'fixed inset-0 z-[60] bg-[var(--theme-overlay)]',
      // Content panel - must be above overlay with proper centering
      content:
        'fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-y-auto pointer-events-none',
      // Actual modal content wrapper
      wrapper:
        'relative w-full max-w-md pointer-events-auto rounded-lg border border-border bg-panel shadow-elevated',
    },
  },
  // Badge configuration for custom colors
  badge: {
    compoundVariants: [
      {
        color: 'kappa',
        variant: 'solid',
        class: 'bg-kappa-500 text-white',
      },
      {
        color: 'kappa',
        variant: 'outline',
        class: 'ring ring-inset ring-kappa-500 text-kappa-400',
      },
      {
        color: 'kappa',
        variant: 'soft',
        class: 'bg-kappa-500/15 text-kappa-400',
      },
      {
        color: 'lightkeeper',
        variant: 'solid',
        class: 'bg-lightkeeper-500 text-white',
      },
      {
        color: 'lightkeeper',
        variant: 'outline',
        class: 'ring ring-inset ring-lightkeeper-500 text-lightkeeper-400',
      },
      {
        color: 'lightkeeper',
        variant: 'soft',
        class: 'bg-lightkeeper-500/15 text-lightkeeper-400',
      },
    ],
  },
  // Button configuration - neutral default, tan only for CTAs
  button: {
    slots: {
      base: 'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus:outline-none',
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
          'bg-primary-500 hover:bg-primary-400 active:bg-primary-600 text-[color:var(--color-secondary-950)] font-medium',
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
        class: 'bg-interactive hover:bg-interactive-hover text-foreground',
      },
      {
        color: 'neutral',
        variant: 'soft',
        class: 'bg-raised hover:bg-interactive text-foreground-muted',
      },
      {
        color: 'neutral',
        variant: 'ghost',
        class: 'text-foreground-muted hover:bg-interactive hover:text-foreground',
      },
      {
        color: 'neutral',
        variant: 'outline',
        class: 'ring ring-inset ring-border text-foreground-muted hover:bg-interactive',
      },
      {
        color: 'neutral',
        variant: 'link',
        class: 'text-foreground-muted hover:text-foreground underline-offset-4 hover:underline',
      },
      {
        color: 'pvp',
        variant: 'solid',
        class: 'bg-pvp-500 hover:bg-pvp-600 text-white',
      },
      {
        color: 'pvp',
        variant: 'soft',
        class:
          'bg-[color-mix(in_srgb,var(--color-pvp-500)_14%,var(--color-panel))] hover:bg-[color-mix(in_srgb,var(--color-pvp-500)_22%,var(--color-panel))] text-[color-mix(in_srgb,var(--color-pvp-500)_70%,var(--color-foreground))]',
      },
      {
        color: 'pvp',
        variant: 'ghost',
        class:
          'text-[color-mix(in_srgb,var(--color-pvp-500)_70%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-pvp-500)_14%,transparent)]',
      },
      {
        color: 'pvp',
        variant: 'outline',
        class:
          'ring ring-inset ring-pvp-500/45 text-[color-mix(in_srgb,var(--color-pvp-500)_70%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-pvp-500)_12%,transparent)]',
      },
      {
        color: 'pvp',
        variant: 'link',
        class:
          'text-[color-mix(in_srgb,var(--color-pvp-500)_70%,var(--color-foreground))] hover:text-[color-mix(in_srgb,var(--color-pvp-500)_82%,var(--color-foreground))] underline-offset-4 hover:underline',
      },
      {
        color: 'pve',
        variant: 'solid',
        class: 'bg-pve-500 hover:bg-pve-600 text-white',
      },
      {
        color: 'pve',
        variant: 'soft',
        class:
          'bg-[color-mix(in_srgb,var(--color-pve-500)_14%,var(--color-panel))] hover:bg-[color-mix(in_srgb,var(--color-pve-500)_22%,var(--color-panel))] text-[color-mix(in_srgb,var(--color-pve-500)_74%,var(--color-foreground))]',
      },
      {
        color: 'pve',
        variant: 'ghost',
        class:
          'text-[color-mix(in_srgb,var(--color-pve-500)_74%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-pve-500)_14%,transparent)]',
      },
      {
        color: 'pve',
        variant: 'outline',
        class:
          'ring ring-inset ring-pve-500/45 text-[color-mix(in_srgb,var(--color-pve-500)_74%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-pve-500)_12%,transparent)]',
      },
      {
        color: 'pve',
        variant: 'link',
        class:
          'text-[color-mix(in_srgb,var(--color-pve-500)_74%,var(--color-foreground))] hover:text-[color-mix(in_srgb,var(--color-pve-500)_82%,var(--color-foreground))] underline-offset-4 hover:underline',
      },
      {
        color: 'success',
        variant: 'solid',
        class: 'bg-success-500 hover:bg-success-600 active:bg-success-700 text-white',
      },
      {
        color: 'success',
        variant: 'soft',
        class:
          'bg-[color-mix(in_srgb,var(--color-success-500)_14%,var(--color-panel))] hover:bg-[color-mix(in_srgb,var(--color-success-500)_22%,var(--color-panel))] text-[color-mix(in_srgb,var(--color-success-500)_78%,var(--color-foreground))]',
      },
      {
        color: 'success',
        variant: 'ghost',
        class:
          'text-[color-mix(in_srgb,var(--color-success-500)_78%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-success-500)_14%,transparent)]',
      },
      {
        color: 'success',
        variant: 'outline',
        class:
          'ring ring-inset ring-success-500/45 text-[color-mix(in_srgb,var(--color-success-500)_78%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-success-500)_12%,transparent)]',
      },
      {
        color: 'success',
        variant: 'link',
        class:
          'text-[color-mix(in_srgb,var(--color-success-500)_78%,var(--color-foreground))] hover:text-[color-mix(in_srgb,var(--color-success-500)_86%,var(--color-foreground))] underline-offset-4 hover:underline',
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
  // Checkbox configuration - neutral styling, primary accent when checked
  checkbox: {
    slots: {
      root: 'relative flex items-start',
      base: 'h-4 w-4 shrink-0 rounded border border-border-strong transition-all data-[state=unchecked]:bg-field',
      icon: 'h-4 w-4 text-[color:var(--color-secondary-950)]',
    },
    defaultVariants: {
      color: 'success',
    },
  },
};
export default defineAppConfig({
  ui: uiConfig,
});
