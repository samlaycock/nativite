import { android, defineConfig, ios } from "nativite";

export default defineConfig({
  app: {
    name: "BackgroundTasksExample",
    bundleId: "com.example.backgroundtasks",
    version: "1.0.0",
    buildNumber: 1,
  },
  platforms: [ios(), android()],
  backgroundTasks: [
    "./src/background/periodic-sync.task.ts",
    "./src/background/refresh-session.task.ts",
  ],
});
