<script setup lang="ts">
  definePageMeta({
    middleware: [
      () => {
        return navigateTo('/settings#streamer-tools', { replace: true });
      },
    ],
  });
</script>
