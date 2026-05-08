<script setup lang="ts">
  definePageMeta({
    middleware: [
      () => {
        return navigateTo('/settings#streamer-tools', { redirectCode: 301, replace: true });
      },
    ],
  });
</script>
