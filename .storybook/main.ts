import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../example/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  staticDirs: ["../example/public"],
  core: { disableTelemetry: true },
};

export default config;
