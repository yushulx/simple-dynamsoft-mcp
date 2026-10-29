#!/usr/bin/env node
// Fails (exit 1) when the given embedding provider has no credentials in the
// environment. Used by the release workflow before an index prebuild.
//
//   node scripts/check-embedding-credentials.mjs <gemini|openai|azure-openai>
import { hasProviderCredentials, VECTOR_PROVIDERS } from "../src/rag/embedding-providers.js";

const REQUIRED = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  "azure-openai": "AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_EMBED_DEPLOYMENT"
};

const provider = String(process.argv[2] || "").trim();
if (!VECTOR_PROVIDERS.includes(provider)) {
  console.error(`Unknown embedding provider "${provider}". Expected one of: ${VECTOR_PROVIDERS.join(", ")}.`);
  process.exit(1);
}
if (!hasProviderCredentials(provider, process.env)) {
  console.error(`${provider} prebuild needs: ${REQUIRED[provider]} (GitHub secret for keys, repository variables for the rest).`);
  process.exit(1);
}
console.log(`[release] ${provider} credentials present`);
