import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../example/**/*.stories.tsx"],
  staticDirs: ["../example/public"],
  core: { disableTelemetry: true },
};

export default config;
