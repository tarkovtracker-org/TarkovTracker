// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - Nuxt UI v4 config uses dynamic slot/variant types not yet in TS definitions
export default defineAppConfig({
  ui: {
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
        content: 'z-[9999]',
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
        item: 'px-3 py-2 text-sm cursor-pointer transition-colors rounded text-surface-300 data-[highlighted]:bg-surface-800 data-[highlighted]:text-white',
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
          'bg-surface-900 border border-surface-700 rounded-lg shadow-xl z-[9999] !w-[var(--reka-combobox-trigger-width)]',
        viewport: 'p-1 max-h-60 overflow-y-auto',
        group: '',
        empty: 'px-3 py-2 text-sm text-surface-500 text-center',
        label: 'px-2 py-1.5 text-xs font-semibold text-surface-400',
        separator: '-mx-1 my-1 h-px bg-surface-700',
        item: 'px-3 py-2 text-sm cursor-pointer transition-colors rounded text-surface-300 data-[highlighted]:bg-surface-800 data-[highlighted]:text-white data-[state=checked]:bg-surface-700 data-[state=checked]:text-white data-[state=checked]:font-medium',
        itemLeadingIcon: 'text-surface-400 shrink-0',
        itemLeadingAvatar: 'shrink-0',
        itemLeadingChip: 'shrink-0',
        itemLabel: 'whitespace-nowrap',
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
    // Badge configuration for custom colors
    badge: {
      variants: {
        color: {
          kappa: {
            solid: 'bg-kappa-500 text-white',
            outline: 'ring ring-inset ring-kappa-500 text-kappa-400',
            soft: 'bg-kappa-500/15 text-kappa-400',
          },
          lightkeeper: {
            solid: 'bg-lightkeeper-500 text-white',
            outline: 'ring ring-inset ring-lightkeeper-500 text-lightkeeper-400',
            soft: 'bg-lightkeeper-500/15 text-lightkeeper-400',
          },
        },
      },
    },
    // Button configuration - neutral default, tan only for CTAs
    button: {
      defaultVariants: {
        color: 'neutral',
        variant: 'soft',
      },
      variants: {
        color: {
          primary: {
            solid:
              'bg-primary-500 hover:bg-primary-400 active:bg-primary-600 text-surface-950 font-medium',
            soft: 'bg-primary-500/15 hover:bg-primary-500/25 text-primary-300',
            ghost: 'text-primary-400 hover:bg-primary-500/10',
            outline: 'ring ring-inset ring-primary-500/50 text-primary-400 hover:bg-primary-500/10',
            link: 'text-primary-400 hover:text-primary-300 underline-offset-4 hover:underline',
          },
          neutral: {
            solid: 'bg-surface-700 hover:bg-surface-600 text-surface-100',
            soft: 'bg-surface-800 hover:bg-surface-700 text-surface-200',
            ghost: 'text-surface-300 hover:bg-surface-800 hover:text-surface-100',
            outline: 'ring ring-inset ring-surface-600 text-surface-300 hover:bg-surface-800',
            link: 'text-surface-300 hover:text-surface-100 underline-offset-4 hover:underline',
          },
          pvp: {
            solid: 'bg-pvp-500 hover:bg-pvp-600 text-white',
            outline: 'ring ring-inset ring-pvp-500 text-pvp-400 hover:bg-pvp-950',
            soft: 'bg-pvp-900 hover:bg-pvp-800 text-pvp-200',
            ghost: 'text-pvp-400 hover:bg-pvp-900',
            link: 'text-pvp-400 hover:text-pvp-300 underline-offset-4 hover:underline',
          },
          pve: {
            solid: 'bg-pve-500 hover:bg-pve-600 text-white',
            outline: 'ring ring-inset ring-pve-500 text-pve-400 hover:bg-pve-950',
            soft: 'bg-pve-900 hover:bg-pve-800 text-pve-200',
            ghost: 'text-pve-400 hover:bg-pve-900',
            link: 'text-pve-400 hover:text-pve-300 underline-offset-4 hover:underline',
          },
          success: {
            solid: 'bg-success-500 hover:bg-success-600 active:bg-success-700 text-white',
            outline:
              'ring ring-inset ring-success-500 text-success-500 hover:bg-success-950 hover:text-white',
            soft: 'bg-success-950 hover:bg-success-900 text-success-200',
            ghost: 'text-success-500 hover:bg-success-950',
            link: 'text-success-500 hover:text-success-400 underline-offset-4 hover:underline',
          },
        },
      },
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
        base: 'h-4 w-4 shrink-0 rounded border transition-all border-surface-500 data-[state=unchecked]:bg-surface-800',
        icon: 'h-4 w-4 text-surface-900',
      },
      defaultVariants: {
        color: 'success',
      },
    },
  },
});
