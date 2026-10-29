import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Settings } from "@anthropic-ai/claude-agent-sdk";
import { claudeConfigDir } from "./paths.js";

/** Read a JSON file, or `undefined` when it is missing or not valid JSON. */
async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

function objectKeys(value: unknown): string[] {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

/** Every `plugin@marketplace` id Claude Code could load for `cwd`: the ids in
 *  `~/.claude/plugins/installed_plugins.json` (any scope) plus the keys of
 *  `enabledPlugins` in user, project and local settings, and in the settings
 *  the ACP client passed. */
async function pluginIds(cwd: string, clientSettings: Settings | undefined): Promise<string[]> {
  const configDir = claudeConfigDir();
  const [installed, ...settingsFiles] = await Promise.all([
    readJson(path.join(configDir, "plugins", "installed_plugins.json")),
    readJson(path.join(configDir, "settings.json")),
    readJson(path.join(cwd, ".claude", "settings.json")),
    readJson(path.join(cwd, ".claude", "settings.local.json")),
  ]);
  const ids = new Set(objectKeys((installed as { plugins?: unknown } | undefined)?.plugins));
  for (const settings of [...settingsFiles, clientSettings]) {
    for (const id of objectKeys((settings as Settings | undefined)?.enabledPlugins)) ids.add(id);
  }
  return [...ids].sort();
}

/** Settings that keep plugins out of an ACP session. They go in the flag
 *  settings tier (`Options.settings`), which overrides user, project and local
 *  settings, so `{"delta@zed-industries": true}` in `~/.claude/settings.json`
 *  loses to the `false` here. Managed (policy) settings still win, so plugins
 *  an organization enforces keep loading. `syncClaudeAiPlugins: false` hides
 *  plugins synced from claude.ai for this session only. */
export async function pluginsDisabledSettings(
  cwd: string,
  clientSettings: Settings | undefined,
): Promise<Pick<Settings, "enabledPlugins" | "syncClaudeAiPlugins">> {
  const ids = await pluginIds(cwd, clientSettings);
  return {
    enabledPlugins: Object.fromEntries(ids.map((id) => [id, false])),
    syncClaudeAiPlugins: false,
  };
}

/** A client's `extraArgs` without `--plugin-dir`, which would load a plugin
 *  directory despite the disabled `enabledPlugins`. */
export function withoutPluginDirArg(
  extraArgs: Record<string, string | null> | undefined,
): Record<string, string | null> | undefined {
  if (!extraArgs || !("plugin-dir" in extraArgs)) return extraArgs;
  return Object.fromEntries(Object.entries(extraArgs).filter(([arg]) => arg !== "plugin-dir"));
}
