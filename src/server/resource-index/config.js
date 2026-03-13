const SAMPLE_DIRS = {
  dbrWeb: "dynamsoft-barcode-reader",
  dbrMobile: "dynamsoft-barcode-reader-mobile",
  dbrPython: "dynamsoft-barcode-reader-python",
  dbrDotnet: "dynamsoft-barcode-reader-dotnet",
  dbrJava: "dynamsoft-barcode-reader-java",
  dbrCpp: "dynamsoft-barcode-reader-c-cpp",
  dbrMaui: "dynamsoft-barcode-reader-maui",
  dbrReactNative: "dynamsoft-barcode-reader-react-native",
  dbrFlutter: "dynamsoft-barcode-reader-flutter",
  dbrNodejs: "dynamsoft-capture-vision-nodejs",
  dcvWeb: "dynamsoft-capture-vision-javascript",
  dcvMobile: "dynamsoft-capture-vision-mobile",
  dcvPython: "dynamsoft-capture-vision-python",
  dcvDotnet: "dynamsoft-capture-vision-dotnet",
  dcvJava: "dynamsoft-capture-vision-java",
  dcvCpp: "dynamsoft-capture-vision-c-cpp",
  dcvMaui: "dynamsoft-capture-vision-maui",
  dcvReactNative: "dynamsoft-capture-vision-react-native",
  dcvFlutter: "dynamsoft-capture-vision-flutter",
  dcvNodejs: "dynamsoft-capture-vision-nodejs",
  dcvSpm: "dynamsoft-capture-vision-spm",
  dwt: "dynamic-web-twain",
  mds: "mobile-document-scanner-javascript",
  ddv: "dynamsoft-document-viewer"
};

const DOC_DIRS = {
  dbrWeb: "barcode-reader-docs-js",
  dbrMobile: "barcode-reader-docs-mobile",
  dbrServer: "barcode-reader-docs-server",
  dcvWeb: "capture-vision-docs-js",
  dcvMobile: "capture-vision-docs-mobile",
  dcvServer: "capture-vision-docs-server",
  dcvCore: "capture-vision-docs",
  dwt: "web-twain-docs",
  mds: "mobile-document-scanner-docs-js",
  ddv: "document-viewer-docs"
};

const DOCS_CONFIG = {
  dbrWeb: {
    urlBase: "https://www.dynamsoft.com/barcode-reader/docs/web/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dbrMobile: {
    urlBase: "https://www.dynamsoft.com/barcode-reader/docs/mobile/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dbrServer: {
    urlBase: "https://www.dynamsoft.com/barcode-reader/docs/server/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dcvWeb: {
    urlBase: "https://www.dynamsoft.com/capture-vision/docs/web/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dcvMobile: {
    urlBase: "https://www.dynamsoft.com/capture-vision/docs/mobile/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dcvServer: {
    urlBase: "https://www.dynamsoft.com/capture-vision/docs/server/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dcvCore: {
    urlBase: "https://www.dynamsoft.com/capture-vision/docs/core/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  dwt: {
    urlBase: "https://www.dynamsoft.com/web-twain/docs/",
    includeDirNames: ["_articles"]
  },
  mds: {
    urlBase: "https://www.dynamsoft.com/mobile-document-scanner/docs/web/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  },
  ddv: {
    urlBase: "https://www.dynamsoft.com/document-viewer/docs/",
    excludeDirs: [
      ".git",
      ".github",
      ".vscode",
      ".vs",
      "_data",
      "_includes",
      "_layouts",
      "_plugins",
      "_old",
      "_v1.1",
      "_v2.1",
      "assets"
    ],
    excludeFiles: ["README.md", "search.md"]
  }
};

const DBR_MOBILE_PLATFORM_CANDIDATES = ["android", "ios", "maui", "react-native", "flutter"];
const DBR_SERVER_PLATFORM_CANDIDATES = ["python", "cpp", "java", "dotnet", "nodejs"];
const DCV_MOBILE_PLATFORM_CANDIDATES = ["android", "ios", "maui", "react-native", "flutter", "spm"];
const DCV_SERVER_PLATFORM_CANDIDATES = ["python", "cpp", "java", "dotnet", "nodejs"];

const CODE_FILE_EXTENSIONS = [
  ".java",
  ".kt",
  ".swift",
  ".m",
  ".h",
  ".hpp",
  ".hxx",
  ".cc",
  ".cpp",
  ".cxx",
  ".cs",
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".dart",
  ".vue",
  ".html"
];

const DDV_PREFERRED_ENTRY_FILES = [
  "main.tsx",
  "main.jsx",
  "main.ts",
  "main.js",
  "App.tsx",
  "App.jsx",
  "App.vue",
  "Viewer.tsx",
  "Viewer.jsx",
  "Viewer.vue"
];

const DBR_SERVER_PREFERRED_FILES = {
  dotnet: ["Program.cs", "MainPage.xaml.cs", "MainPage.cs"],
  java: ["Main.java", "App.java"],
  cpp: ["main.cpp", "Main.cpp"],
  nodejs: ["index.js", "index.mjs", "app.js", "app.mjs", "server.js", "server.mjs"]
};

const DBR_SERVER_PREFERRED_EXTS = {
  dotnet: [".cs"],
  java: [".java"],
  cpp: [".cpp", ".cc", ".cxx", ".h", ".hpp"],
  nodejs: [".js", ".mjs", ".cjs", ".ts"]
};

const DCV_SERVER_PREFERRED_FILES = {
  dotnet: ["Program.cs", "MainPage.xaml.cs", "MainPage.cs"],
  java: ["Main.java", "App.java"],
  cpp: ["main.cpp", "Main.cpp"],
  nodejs: ["index.js", "index.mjs", "app.js", "app.mjs", "server.js", "server.mjs"],
  python: ["document_scanner.py", "mrz_scanner.py", "vin_scanner.py", "driver_license_scanner.py", "gs1_ai_scanner.py"]
};

const DCV_SERVER_PREFERRED_EXTS = {
  dotnet: [".cs"],
  java: [".java"],
  cpp: [".cpp", ".cc", ".cxx", ".h", ".hpp"],
  nodejs: [".js", ".mjs", ".cjs", ".ts"],
  python: [".py"]
};

const LEGACY_DBR_LINKS = {
  "10": {
    web: { web: "https://www.dynamsoft.com/barcode-reader/docs/v10/web/programming/javascript/" },
    cpp: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v10/server/programming/cplusplus/" },
    java: { desktop: null },
    dotnet: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v10/server/programming/dotnet/" },
    python: { desktop: "http://dynamsoft.com/barcode-reader/docs/v10/server/programming/python/" },
    mobile: {
      android: "https://www.dynamsoft.com/barcode-reader/docs/v10/mobile/programming/android/",
      ios: "https://www.dynamsoft.com/barcode-reader/docs/v10/mobile/programming/objectivec-swift/"
    }
  },
  "9": {
    web: { web: "https://www.dynamsoft.com/barcode-reader/docs/v9/web/programming/javascript/" },
    cpp: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/cplusplus/" },
    java: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/java/" },
    dotnet: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/dotnet/" },
    python: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/python/" },
    mobile: {
      android: "https://www.dynamsoft.com/barcode-reader/docs/v9/mobile/programming/android/",
      ios: "https://www.dynamsoft.com/barcode-reader/docs/v9/mobile/programming/objectivec-swift/"
    }
  }
};

const LEGACY_DWT_LINKS = {
  "18.5.1": "https://www.dynamsoft.com/web-twain/docs-archive/v18.5.1/info/api/",
  "18.4": "https://www.dynamsoft.com/web-twain/docs-archive/v18.4/info/api/",
  "18.3": "https://www.dynamsoft.com/web-twain/docs-archive/v18.3/info/api/",
  "18.1": "https://www.dynamsoft.com/web-twain/docs-archive/v18.1/info/api/",
  "18.0": "https://www.dynamsoft.com/web-twain/docs-archive/v18.0/info/api/",
  "17.3": "https://www.dynamsoft.com/web-twain/docs-archive/v17.3/info/api/",
  "17.2.1": "https://www.dynamsoft.com/web-twain/docs-archive/v17.2.1/info/api/",
  "17.1.1": "https://www.dynamsoft.com/web-twain/docs-archive/v17.1.1/info/api/",
  "17.0": "https://www.dynamsoft.com/web-twain/docs-archive/v17.0/info/api/",
  "16.2": "https://www.dynamsoft.com/web-twain/docs-archive/v16.2/info/api/",
  "16.1.1": "https://www.dynamsoft.com/web-twain/docs-archive/v16.1.1/info/api/"
};

export {
  SAMPLE_DIRS,
  DOC_DIRS,
  DOCS_CONFIG,
  DBR_MOBILE_PLATFORM_CANDIDATES,
  DBR_SERVER_PLATFORM_CANDIDATES,
  DCV_MOBILE_PLATFORM_CANDIDATES,
  DCV_SERVER_PLATFORM_CANDIDATES,
  CODE_FILE_EXTENSIONS,
  DDV_PREFERRED_ENTRY_FILES,
  DBR_SERVER_PREFERRED_FILES,
  DBR_SERVER_PREFERRED_EXTS,
  DCV_SERVER_PREFERRED_FILES,
  DCV_SERVER_PREFERRED_EXTS,
  LEGACY_DBR_LINKS,
  LEGACY_DWT_LINKS
};
