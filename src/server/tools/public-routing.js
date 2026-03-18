const SERVER_SAMPLE_REPOS = {
  python: "https://github.com/Dynamsoft/capture-vision-python-samples",
  cpp: "https://github.com/Dynamsoft/capture-vision-cpp-samples",
  java: "https://github.com/Dynamsoft/capture-vision-java-samples",
  dotnet: "https://github.com/Dynamsoft/capture-vision-dotnet-samples",
  nodejs: "https://github.com/Dynamsoft/capture-vision-nodejs-samples"
};

function getPublicServerSamplesUrl(platform) {
  return SERVER_SAMPLE_REPOS[platform] || SERVER_SAMPLE_REPOS.python;
}

function getUnsupportedPublicScopeRedirect(product, edition, platform) {
  if (product === "mrz" && edition === "server") {
    return {
      label: "MRZ",
      docsUrl: "https://www.dynamsoft.com/capture-vision/docs/server/",
      samplesUrl: getPublicServerSamplesUrl(platform)
    };
  }

  if (product === "mds" && edition === "mobile") {
    const mobilePath = platform === "ios" ? "iOS" : "Android";
    return {
      label: "MDS",
      docsUrl: "https://www.dynamsoft.com/capture-vision/docs/mobile/",
      samplesUrl: `https://github.com/Dynamsoft/capture-vision-mobile-samples/tree/main/${mobilePath}`
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
        `${redirect.label} ${scope} is served as reference links in the public MCP contract.`,
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
