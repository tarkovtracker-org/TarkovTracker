<template>
  <v-card>
    <v-card-title>
      <div>ID: {{ props.task?.id }}</div>
      <div>Name: {{ props.task?.name }}</div>
    </v-card-title>
    <v-card-text>
      <div>
        <a :href="props.task?.wikiLink" target="_blank" class="wiki-link">Wiki link</a>
      </div>
      <div>
        <editor-alternative-section :task="props.task" />
      </div>
      <div>
        <div
          v-for="(objective, objIndex) in props.task?.objectives"
          :key="objective.id"
          class="pa-1"
          :style="objIndex % 2 == 1 ? 'background-color: #2f2f2f' : 'background-color: #1b1b1b'"
        >
          <editor-objective-section :objective="objective" />
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
<script setup>
  import { defineAsyncComponent, defineProps } from 'vue';

  const EditorObjectiveSection = defineAsyncComponent(
    () => import('@/components/editor/EditorObjectiveSection')
  );
  const EditorAlternativeSection = defineAsyncComponent(
    () => import('@/components/editor/EditorAlternativeSection')
  );
  const props = defineProps({
    task: {
      type: Object,
      required: true,
    },
  });
</script>
<style lang="scss" scoped></style>
