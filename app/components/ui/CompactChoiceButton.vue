<template>
  <button
    type="button"
    class="border-default bg-default text-muted enabled:hover:bg-elevated aria-pressed:border-primary/70 aria-pressed:bg-primary/10 aria-pressed:text-highlighted focus-visible:outline-primary min-w-0 cursor-pointer rounded-md border text-center text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
  >
    <slot />
  </button>
</template>
