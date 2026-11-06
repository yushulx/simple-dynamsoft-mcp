const SERVER_SAMPLE_REPOS = {
  python: "https://github.com/Dynamsoft/capture-vision-python-samples",
  cpp: "https://github.com/Dynamsoft/capture-vision-cpp-samples",
  java: "https://github.com/Dynamsoft/capture-vision-java-samples",
  dotnet: "https://github.com/Dynamsoft/capture-vision-dotnet-samples",
  nodejs: "https://github.com/Dynamsoft/capture-vision-nodejs-samples"
};

const MOBILE_SAMPLE_REPOS = {
  android: "https://github.com/Dynamsoft/capture-vision-mobile-samples/tree/main/Android",
  ios: "https://github.com/Dynamsoft/capture-vision-mobile-samples/tree/main/iOS",
  spm: "https://github.com/Dynamsoft/capture-vision-mobile-samples/tree/main/iOS",
  "react-native": "https://github.com/Dynamsoft/capture-vision-react-native-samples",
  flutter: "https://github.com/Dynamsoft/capture-vision-flutter-samples",
  maui: "https://github.com/Dynamsoft/capture-vision-maui-samples"
};

const BBS_DOCS_URL = "https://www.dynamsoft.com/batch-barcode-scanner/docs/introduction.html";
const BBS_INTEGRATION_SAMPLES_URL = "https://github.com/Dynamsoft/batch-barcode-scanner-samples/";

function getPublicServerSamplesUrl(platform) {
  return SERVER_SAMPLE_REPOS[platform] || SERVER_SAMPLE_REPOS.python;
}

function getPublicMobileSamplesUrl(platform) {
  return MOBILE_SAMPLE_REPOS[platform] || MOBILE_SAMPLE_REPOS.android;
}

function getUnsupportedPublicScopeRedirect(product, edition, platform) {
  if (product === "mrz" && edition === "mobile") {
    return {
      label: "MRZ",
      docsUrl: "https://www.dynamsoft.com/capture-vision/docs/mobile/",
      samplesUrl: getPublicMobileSamplesUrl(platform)
    };
  }

  if (product === "mrz" && edition === "server") {
    return {
      label: "MRZ",
      docsUrl: "https://www.dynamsoft.com/capture-vision/docs/server/",
      samplesUrl: getPublicServerSamplesUrl(platform)
    };
  }

  if (product === "mds" && edition === "mobile") {
    return {
      label: "MDS",
      docsUrl: "https://www.dynamsoft.com/capture-vision/docs/mobile/",
      samplesUrl: getPublicMobileSamplesUrl(platform)
    };
  }

  if (product === "mds" && edition === "server") {
    return {
      label: "MDS",
      docsUrl: "https://www.dynamsoft.com/capture-vision/docs/server/",
      samplesUrl: getPublicServerSamplesUrl(platform)
    };
  }

  return null;
}

function buildUnsupportedPublicScopeResponse(product, edition, platform) {
  const redirect = getUnsupportedPublicScopeRedirect(product, edition, platform);
  if (!redirect) return null;

  const scope = [edition, platform].filter(Boolean).join(" / ") || "general";
  return {
    content: [{
      type: "text",
      text: [
        `${redirect.label} ${scope} is not indexed in this MCP yet. Use these official links instead.`,
        "Reference links:",
        `- Docs: ${redirect.docsUrl}`,
        `- Samples: ${redirect.samplesUrl}`
      ].join("\n")
    }]
  };
}

// BBS is a ready-to-use Android/iOS app, not an SDK, so there is no quickstart
// code or sample project to serve. Point at the docs and at the integration
// helpers (Android Share-Receiver, Web Viewer) that consume its exported results.
function buildBbsAppReferenceResponse() {
  return {
    content: [{
      type: "text",
      text: [
        "Dynamsoft Batch Barcode Scanner (BBS) is a ready-to-use Android/iOS app, not an SDK, so it has no quickstart code or code samples to return.",
        "To use its results in your own workflow, export them (CSV/images, system sharing, cloud, or custom JavaScript output). To embed multi-barcode scanning in your own app, use DBR.",
        "Reference links:",
        `- Docs: ${BBS_DOCS_URL}`,
        `- Integration samples (Android Share-Receiver, Web Viewer): ${BBS_INTEGRATION_SAMPLES_URL}`
      ].join("\n")
    }]
  };
}

export {
  getUnsupportedPublicScopeRedirect,
  buildUnsupportedPublicScopeResponse,
  buildBbsAppReferenceResponse
};
