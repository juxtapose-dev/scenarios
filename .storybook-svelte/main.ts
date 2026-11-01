import type { StorybookConfig } from "@storybook/svelte-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const config: StorybookConfig = {
  framework: { name: "@storybook/svelte-vite", options: { docgen: false } },
  stories: ["../example-svelte/**/*.stories.ts"],
  addons: ["@storybook/addon-docs"],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    config.plugins ??= [];
    config.plugins.push(svelte());
    return config;
  },
};
export default config;
