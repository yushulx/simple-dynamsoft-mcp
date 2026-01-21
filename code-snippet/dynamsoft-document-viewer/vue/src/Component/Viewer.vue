<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { DDV } from 'dynamsoft-document-viewer'
import 'dynamsoft-document-viewer/dist/ddv.css'

onMounted(async () => {
  DDV.on('error', (e) => {
    alert(e.message)
  })

  // Public trial license which is valid for 24 hours
  // You can request a 30-day trial key from https://www.dynamsoft.com/customer/license/trialLicense?product=ddv&deploymenttype=browser
  DDV.Core.license = "DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9";
  DDV.Core.engineResourcePath = "/dynamsoft-document-viewer/dist/engine";
  // Preload DDV Resource
  DDV.Core.loadWasm();
  await DDV.Core.init();
  
  const viewer = new DDV.EditViewer({
      container: 'container'
   });
})
</script>

<template>
  <div id="container"></div>
</template>

<style scoped>
#container {
  width: 100%;
  height: 100%;
}
</style>