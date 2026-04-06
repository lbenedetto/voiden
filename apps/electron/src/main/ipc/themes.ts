import { ipcMain, app } from "electron";
import * as fs from "fs";
import * as path from "path";

interface ThemeMetadata {
  id: string;
  name: string;
  type: string;
}

interface Theme {
  id: string;
  name: string;
  type: string;
  colors: Record<string, string>;
}

function getBundledThemesDirectory(): string {
  // In development, use the local themes directory
  if (!app.isPackaged) {
    return path.join(__dirname, "../../themes");
  }

  // In production, themes are in the resources directory
  return path.join(process.resourcesPath, "themes");
}

function getUserThemesDirectory(): string {
  // User themes directory in app data (writable)
  return path.join(app.getPath("userData"), "themes");
}

/**
 * Copy bundled themes to user data directory on app startup.
 * This allows themes to be updated with app updates while keeping them writable.
 */
function syncBundledThemes(): void {
  const bundledDir = getBundledThemesDirectory();
  const userDir = getUserThemesDirectory();

  try {
    // Ensure user themes directory exists
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // Check if bundled themes directory exists
    if (!fs.existsSync(bundledDir)) {
      return;
    }

    const files = fs.readdirSync(bundledDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const sourcePath = path.join(bundledDir, file);
        const destPath = path.join(userDir, file);

        try {
          const themeData = fs.readFileSync(sourcePath, "utf-8");
          fs.writeFileSync(destPath, themeData, "utf-8");
        } catch (error) {
        }
      }
    }
  } catch (error) {
  }
}

export function registerThemeIpcHandlers() {
  syncBundledThemes();

  ipcMain.handle("themes:sync", async (): Promise<{ success: boolean; error?: string }> => {
    try {
      syncBundledThemes();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync themes"
      };
    }
  });

  ipcMain.handle("themes:list", async (): Promise<ThemeMetadata[]> => {
    const themesDir = getUserThemesDirectory();

    try {
      if (!fs.existsSync(themesDir)) {
        return [];
      }

      const files = fs.readdirSync(themesDir);
      const themes: ThemeMetadata[] = [];

      for (const file of files) {
        if (file.endsWith(".json")) {
          const themeId = file.replace(".json", "");
          const themePath = path.join(themesDir, file);

          try {
            const themeData = JSON.parse(fs.readFileSync(themePath, "utf-8")) as Theme;
            themes.push({
              id: themeData.id || themeId,
              name: themeData.name || themeId,
              type: themeData.type || "dark",
            });
          } catch (error) {
          }
        }
      }

      return themes;
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle("themes:load", async (_event, themeId: string): Promise<Theme | null> => {
    const themesDir = getUserThemesDirectory();
    const themePath = path.join(themesDir, `${themeId}.json`);

    try {
      if (!fs.existsSync(themePath)) {
        return null;
      }

      const themeData = fs.readFileSync(themePath, "utf-8");
      return JSON.parse(themeData) as Theme;
    } catch (error) {
      return null;
    }
  });
}
