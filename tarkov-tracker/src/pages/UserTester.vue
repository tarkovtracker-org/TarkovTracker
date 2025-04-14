<template>
  <tracker-tip tip="login"></tracker-tip>
  <v-container>
    <v-row>
      <v-col cols="12">
        <div v-if="fireuser?.uid" class="text-center">
          You are already signed in!
        </div>
        <div v-show="fireuser?.uid == null">
          <v-text-field v-model="customToken" solo></v-text-field>
          <v-btn @click="signIn()"> Sign in </v-btn>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup>
import { defineAsyncComponent, ref } from "vue";
import { app as fireapp, fireuser } from "@/plugins/firebase.ts";
const TrackerTip = defineAsyncComponent(() =>
  import("@/components/TrackerTip.vue")
);
const customToken = ref("");
const signIn = () => {
  fireapp
    .auth()
    .signInWithCustomToken(customToken.value)
    .then((userCredential) => {
      // Signed in
      var user = userCredential.user;
      console.debug(user);
    })
    .catch((error) => {
      console.error(error);
    });
};
</script>
<style lang="scss" scoped></style>
