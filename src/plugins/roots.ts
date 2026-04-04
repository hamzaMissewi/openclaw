import fs from "node:fs";
import path from "node:path";
import { resolveConfigDir, resolveUserPath } from "../utils.js";
import { resolveBundledPluginsDir } from "./bundled-dir.js";

export type PluginSourceRoots = {
  stock?: string;
  global: string;
  workspace?: string;
};

export type PluginCacheInputs = {
  roots: PluginSourceRoots;
  loadPaths: string[];
};

function selectPluginDir(baseDir: string): string {
  const pluginsPath = path.join(baseDir, "plugins");
  const extensionsPath = path.join(baseDir, "extensions");
  if (fs.existsSync(pluginsPath)) {
    return pluginsPath;
  }
  if (fs.existsSync(extensionsPath)) {
    return extensionsPath;
  }
  return pluginsPath; // Default to 'plugins'
}

export function resolvePluginSourceRoots(params: {
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): PluginSourceRoots {
  const env = params.env ?? process.env;
  const workspaceRoot = params.workspaceDir ? resolveUserPath(params.workspaceDir, env) : undefined;
  const stock = resolveBundledPluginsDir(env);
  const configDir = resolveConfigDir(env);
  const global = selectPluginDir(configDir);
  const workspace = workspaceRoot ? selectPluginDir(path.join(workspaceRoot, ".openclaw")) : undefined;
  return { stock, global, workspace };
}


// Shared env-aware cache inputs for discovery, manifest, and loader caches.
export function resolvePluginCacheInputs(params: {
  workspaceDir?: string;
  loadPaths?: string[];
  env?: NodeJS.ProcessEnv;
}): PluginCacheInputs {
  const env = params.env ?? process.env;
  const roots = resolvePluginSourceRoots({
    workspaceDir: params.workspaceDir,
    env,
  });
  // Preserve caller order because load-path precedence follows input order.
  const loadPaths = (params.loadPaths ?? [])
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolveUserPath(entry, env));
  return { roots, loadPaths };
}
