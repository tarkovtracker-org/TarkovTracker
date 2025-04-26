<template>
  <TrackerTip tip="login" />
  <v-container>
    <v-row>
      <v-col cols="12">
        <div v-if="fireuser?.uid" class="text-center">
          You are already signed in!
        </div>
        <div v-else>
          <v-text-field v-model="customToken" solo></v-text-field>
          <v-btn @click="signIn">Sign in</v-btn>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup>
import { defineAsyncComponent, ref } from "vue";
import { app as fireapp, fireuser } from "@/plugins/firebase.ts";
import { getAuth, signInWithCustomToken } from "firebase/auth";

const TrackerTip = defineAsyncComponent(
  () => import("@/components/TrackerTip.vue"),
);
const customToken = ref("");
const auth = getAuth(fireapp);
const signIn = async () => {
  try {
    const userCredential = await signInWithCustomToken(auth, customToken.value);
    console.debug(userCredential.user);
  } catch (error) {
    console.error(error);
  }
};
</script>
<style lang="scss" scoped></style>
