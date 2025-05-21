<template>
  <v-container
    fluid
    class="pa-0 float-container"
    @mouseenter="linkHover = true"
    @mouseleave="linkHover = false"
  >
    <v-row no-gutters class="align-center justify-center" :class="linkHover ? 'blur-item' : ''">
      <v-col cols="auto" class="d-flex align-center justify-center">
        <img width="32" :src="itemIconUrl" class="mr-2 rounded" @error="handleImgError" />
      </v-col>
      <v-col v-if="props.count" cols="auto" class="mr-2">{{ props.count.toLocaleString() }}</v-col>
      <v-col cols="auto" class="align-center justify-center tarkov-item-name">
        <b>{{ props.itemName }}</b>
      </v-col>
    </v-row>
    <v-row v-show="linkHover" no-gutters class="float-link align-center justify-center">
      <v-col cols="auto" class="mx-1">
        <v-avatar
          color="primary"
          title="Show item on EFT Wiki"
          size="1.5em"
          class="external-link"
          @click="openWikiLink()"
        >
          <v-img src="/img/logos/wikilogo.png"></v-img>
        </v-avatar>
      </v-col>
      <v-col cols="auto" class="mx-1">
        <v-avatar
          color="primary"
          title="Show item on Tarkov.dev"
          size="1.5em"
          class="external-link"
          @click="openTarkovDevLink()"
        >
          <v-img src="/img/logos/tarkovdevlogo.png"></v-img>
        </v-avatar>
      </v-col>
      <v-col cols="auto" class="mx-1">
        <v-avatar
          color="primary"
          title="Copy Item Name"
          size="1.5em"
          class="external-link"
          @click="copyItemName()"
        >
          <v-icon size="x-small">mdi-content-copy</v-icon>
        </v-avatar>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue';

  const props = defineProps<{
    itemId: string;
    itemName: string | null;
    devLink: string | null;
    wikiLink: string | null;
    count: number | null;
  }>();
  const linkHover = ref(false);
  const itemIconUrl = ref(`https://assets.tarkov.dev/${props.itemId}-icon.jpg`);

  function handleImgError() {
    // If .jpg fails, try .webp
    if (itemIconUrl.value.endsWith('.jpg')) {
      itemIconUrl.value = `https://assets.tarkov.dev/${props.itemId}-icon.webp`;
    }
  }

  watch(
    () => props.itemId,
    () => {
      itemIconUrl.value = `https://assets.tarkov.dev/${props.itemId}-icon.jpg`;
    }
  );

  const openTarkovDevLink = () => {
    if (props.devLink) {
      window.open(props.devLink, '_blank');
    }
  };
  const openWikiLink = () => {
    if (props.wikiLink) {
      window.open(props.wikiLink, '_blank');
    }
  };

  const copyItemName = () => {
    if (props.itemName) {
      navigator.clipboard.writeText(props.itemName);
    }
  };
</script>
<style lang="scss" scoped>
  .blur-item {
    filter: blur(1px);
  }
  .external-link {
    cursor: pointer;
  }
  .float-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .float-link {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }
</style>
