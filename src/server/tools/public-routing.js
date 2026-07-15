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

export {
  getUnsupportedPublicScopeRedirect,
  buildUnsupportedPublicScopeResponse
};
