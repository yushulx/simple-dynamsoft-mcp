<script setup lang="ts">
import Viewer from './Component/Viewer.vue'
</script>

<template>
  <h1>Hello World for Vue</h1>
  <Viewer></Viewer>
</template>

<style>
html,
body {
  width: 100%;
  height: 100%;
}

body {
  margin: 0px;
  padding: 0px 8px 8px 8px;
  box-sizing: border-box;
}

#app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
