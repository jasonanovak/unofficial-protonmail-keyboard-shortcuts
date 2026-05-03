import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const restrictChromeGlobal = {
  rules: {
    "no-restricted-globals": [
      "error",
      {
        name: "chrome",
        message:
          "Use `import browser from 'webextension-polyfill'` instead of the chrome.* namespace. See DESIGN.md §3.2.",
      },
    ],
  },
};

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    ...restrictChromeGlobal,
  },
  {
    files: ["scripts/**/*.{js,mjs,ts}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
