import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/core/lib/utils";
import { Plus, ChevronDown, Trash2, Check, Search, X, Globe, Lock, Eye, EyeOff, Copy, Clock, RefreshCw, Settings2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useYamlEnvironments, useEnvironments } from "@/core/environment/hooks";
import { useSaveYamlEnvironments } from "@/core/environment/hooks";
import { useProfiles } from "../hooks/useProfiles.ts";
import { useCreateProfile } from "@/core/environment/hooks";
import { useDeleteProfile } from "@/core/environment/hooks";
import type { EditableEnvNode, EditableVariable } from "./EnvironmentNode";
import {
  type EditableEnvTree,
  mergeToEditable,
  splitFromEditable,
  generateUniqueName,
  genVarId,
  renameKey,
} from "./envTreeUtils";
import { useEditorStore } from "@/core/editors/voiden/VoidenEditor";

const DEBOUNCE_MS = 800;
const PROFILE_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

let rememberedProfile: string | null = null;

export interface EnvJumpTarget {
  envPath: string;
  varKey: string;
  profile?: string;
}
let pendingJumpTarget: EnvJumpTarget | null = null;
export function setEnvJumpTarget(target: EnvJumpTarget | null) {
  pendingJumpTarget = target;
  if (target?.profile) rememberedProfile = target.profile;
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

interface FlatEnvEntry {
  path: string;
  name: string;
  displayName?: string;
  depth: number;
  varCount: number;
  privateCount: number;
  intermediate?: boolean;
}

function flattenTree(tree: EditableEnvTree, parentPath = "", depth = 0): FlatEnvEntry[] {
  const entries: FlatEnvEntry[] = [];
  for (const [name, node] of Object.entries(tree)) {
    const path = parentPath ? `${parentPath}.${name}` : name;
    entries.push({
      path,
      name,
      displayName: node.displayName,
      depth,
      varCount: node.variables.length,
      privateCount: node.variables.filter((v) => v.isPrivate).length,
      intermediate: node.intermediate,
    });
    if (Object.keys(node.children).length > 0) {
      entries.push(...flattenTree(node.children, path, depth + 1));
    }
  }
  return entries;
}

function getNodeAtPath(tree: EditableEnvTree, path: string): EditableEnvNode | null {
  const segments = path.split(".");
  let node: EditableEnvNode | undefined = tree[segments[0]];
  for (let i = 1; i < segments.length && node; i++) {
    node = node.children[segments[i]];
  }
  return node ?? null;
}

function updateNodeAtPath(tree: EditableEnvTree, path: string, updated: EditableEnvNode): EditableEnvTree {
  const segments = path.split(".");
  if (segments.length === 1) return { ...tree, [segments[0]]: updated };
  const newTree = { ...tree };
  const root = structuredClone(newTree[segments[0]]);
  let current: EditableEnvNode = root;
  for (let i = 1; i < segments.length - 1; i++) current = current.children[segments[i]];
  current.children[segments[segments.length - 1]] = updated;
  newTree[segments[0]] = root;
  return newTree;
}

function deleteNodeAtPath(tree: EditableEnvTree, path: string): EditableEnvTree {
  const segments = path.split(".");
  if (segments.length === 1) {
    const { [segments[0]]: _, ...rest } = tree;
    return rest;
  }
  const newTree = { ...tree };
  const root = structuredClone(newTree[segments[0]]);
  let parent: EditableEnvNode = root;
  for (let i = 1; i < segments.length - 1; i++) parent = parent.children[segments[i]];
  const { [segments[segments.length - 1]]: _, ...rest } = parent.children;
  parent.children = rest;
  newTree[segments[0]] = root;
  return newTree;
}

function renameNodeAtPath(tree: EditableEnvTree, path: string, newSegmentName: string): EditableEnvTree {
  const segments = path.split(".");
  const oldName = segments[segments.length - 1];
  if (oldName === newSegmentName) return tree;
  if (segments.length === 1) {
    if (tree[newSegmentName]) return tree;
    return renameKey(tree, oldName, newSegmentName);
  }
  const parentPath = segments.slice(0, -1).join(".");
  const parentNode = getNodeAtPath(tree, parentPath);
  if (!parentNode || parentNode.children[newSegmentName]) return tree;
  const updatedParent = { ...parentNode, children: renameKey(parentNode.children, oldName, newSegmentName) };
  return updateNodeAtPath(tree, parentPath, updatedParent);
}

function findVarInLineage(tree: EditableEnvTree, envPath: string, varKey: string): string | null {
  const segments = envPath.split(".");
  let node: EditableEnvNode | undefined = tree[segments[0]];
  if (!node) return null;
  let deepestMatch: string | null = node.variables.some((v) => v.key === varKey) ? segments[0] : null;
  let currentPath = segments[0];
  for (let i = 1; i < segments.length; i++) {
    node = node.children[segments[i]];
    if (!node) break;
    currentPath = `${currentPath}.${segments[i]}`;
    if (node.variables.some((v) => v.key === varKey)) deepestMatch = currentPath;
  }
  return deepestMatch;
}

// ─── Profile Selector ────────────────────────────────────────────────────────

const ProfileSelector = ({
  selectedProfile,
  onSelectProfile,
}: {
  selectedProfile: string;
  onSelectProfile: (p: string) => void;
}) => {
  const { data: profiles } = useProfiles();
  const { mutate: createProfile } = useCreateProfile();
  const { mutate: deleteProfile } = useDeleteProfile();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false); setNewName(""); setNameError(null);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCreate = () => {
    const t = newName.trim();
    if (!t) return;
    if (!PROFILE_NAME_REGEX.test(t)) { setNameError("Lowercase letters, numbers, hyphens only"); return; }
    if (t === "default" || profiles?.includes(t)) { setNameError("Profile already exists"); return; }
    createProfile(t); onSelectProfile(t);
    setCreating(false); setNewName(""); setNameError(null); setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-active transition-colors text-comment hover:text-text"
      >
        <span className="max-w-20 truncate">{selectedProfile}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-panel border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-1.5 text-xs text-comment font-semibold uppercase tracking-wider border-b border-border">Profile</div>
          <div className="max-h-40 overflow-y-auto py-1">
            {profiles?.map((p) => (
              <div
                key={p}
                className="flex items-center px-3 py-1.5 text-sm hover:bg-active cursor-pointer group"
                onClick={() => { onSelectProfile(p); setOpen(false); }}
              >
                <span className="flex-1 truncate">{p}</span>
                {p === selectedProfile && <Check size={13} style={{ color: "var(--icon-success)" }} />}
                {p !== "default" && (
                  <button
                    className="p-0.5 rounded hover:bg-border opacity-0 group-hover:opacity-100 ml-1"
                    onClick={(e) => { e.stopPropagation(); deleteProfile(p); if (selectedProfile === p) onSelectProfile("default"); setOpen(false); }}
                  >
                    <Trash2 size={11} className="text-comment" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2">
            {creating ? (
              <div>
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setNameError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                  placeholder="profile-name"
                  className="w-full text-sm px-2 py-1 bg-editor border border-border rounded outline-none text-text placeholder:text-comment"
                />
                {nameError && <p className="text-xs mt-1" style={{ color: "var(--icon-danger)" }}>{nameError}</p>}
              </div>
            ) : (
              <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-sm text-comment hover:text-text w-full">
                <Plus size={13} /> New profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Variable table row ───────────────────────────────────────────────────────

const VariableTableRow = ({
  variable,
  highlighted,
  onChange,
  onDelete,
  onAddNext,
}: {
  index: number;
  variable: EditableVariable;
  highlighted: boolean;
  onChange: (updates: Partial<EditableVariable>) => void;
  onDelete: () => void;
  onAddNext: () => void;
}) => {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (highlighted && rowRef.current) rowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(variable.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const displayValue = variable.isPrivate && !revealed
    ? "••••••••••••"
    : variable.value;

  return (
    <tr
      ref={rowRef}
      className={`group border-b border-border hover:bg-active/30 transition-colors${highlighted ? " ring-1 ring-inset" : ""}`}
      style={highlighted ? { "--tw-ring-color": "var(--icon-primary)" } as React.CSSProperties : undefined}
    >
      <td className="px-2 py-1.5 w-[200px]">
        <input
          type="text"
          value={variable.key}
          onChange={(e) => onChange({ key: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddNext(); } }}
          placeholder="KEY"
          className="w-full font-mono text-sm bg-transparent text-text placeholder:text-comment/50 focus:outline-none px-1 py-0.5 rounded focus:bg-editor focus:ring-1"
          style={{ "--tw-ring-color": "var(--icon-primary)" } as React.CSSProperties}
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={variable.isPrivate && !revealed ? displayValue : variable.value}
            onChange={(e) => { if (!(variable.isPrivate && !revealed)) onChange({ value: e.target.value }); }}
            readOnly={variable.isPrivate && !revealed}
            placeholder="value"
            className="flex-1 font-mono text-sm bg-transparent text-text placeholder:text-comment/50 focus:outline-none px-1 py-0.5 rounded focus:bg-editor focus:ring-1"
            style={{ "--tw-ring-color": "var(--icon-primary)" } as React.CSSProperties}
          />
          {variable.isPrivate && (
            <button
              onClick={() => setRevealed(!revealed)}
              className="p-0.5 rounded hover:bg-active opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              {revealed ? <EyeOff size={13} className="text-comment" /> : <Eye size={13} className="text-comment" />}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-0.5 rounded hover:bg-active opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            {copied ? <Check size={13} style={{ color: "var(--icon-success)" }} /> : <Copy size={13} className="text-comment" />}
          </button>
        </div>
      </td>
      <td className="px-2 py-1.5 w-[110px]">
        <button
          onClick={() => onChange({ isPrivate: !variable.isPrivate })}
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border text-comment bg-active/40 hover:bg-active transition-colors"
        >
          {variable.isPrivate ? <Lock size={11} /> : <Globe size={11} />}
          {variable.isPrivate ? "Private" : "Public"}
        </button>
      </td>
      <td className="pr-3 py-1.5 w-8">
        <button
          onClick={onDelete}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-active transition-opacity"
        >
          <Trash2 size={13} style={{ color: "var(--icon-error)" }} />
        </button>
      </td>
    </tr>
  );
};

// ─── Add variable row ─────────────────────────────────────────────────────────

const AddVariableRow = ({ onAdd }: { onAdd: (key: string, value: string, isPrivate: boolean) => void }) => {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!key.trim()) { keyRef.current?.focus(); return; }
    onAdd(key.trim(), value, isPrivate);
    setKey(""); setValue(""); setIsPrivate(false);
    keyRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel/30">
      <input
        ref={keyRef}
        type="text"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        placeholder="NEW_VARIABLE"
        className="flex-1 font-mono text-sm px-3 py-1.5 bg-editor border border-border rounded-md text-text placeholder:text-comment/50 focus:outline-none focus:ring-1"
        style={{ "--tw-ring-color": "var(--icon-primary)" } as React.CSSProperties}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        placeholder="value"
        className="flex-[1.5] font-mono text-sm px-3 py-1.5 bg-editor border border-border rounded-md text-text placeholder:text-comment/50 focus:outline-none focus:ring-1"
        style={{ "--tw-ring-color": "var(--icon-primary)" } as React.CSSProperties}
      />
      <button
        onClick={() => setIsPrivate(!isPrivate)}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border text-comment bg-active/40 hover:bg-active font-medium transition-colors flex-shrink-0"
      >
        {isPrivate ? <Lock size={11} /> : <Globe size={11} />}
        {isPrivate ? "Private" : "Public"}
      </button>
      <button
        onClick={handleAdd}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors flex-shrink-0 hover:opacity-90"
        style={{ backgroundColor: "var(--icon-primary)", color: "var(--ui-bg)" }}
      >
        <Plus size={13} /> Add
      </button>
    </div>
  );
};

// ─── Variables panel ──────────────────────────────────────────────────────────

const VariablesPanel = ({
  node,
  envPath,
  highlightTarget,
  onUpdateNode,
}: {
  node: EditableEnvNode;
  envPath: string;
  highlightTarget: { varKey: string; envPath: string } | null;
  onUpdateNode: (updated: EditableEnvNode) => void;
}) => {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const privateCount = node.variables.filter((v) => v.isPrivate).length;

  const filteredVars = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return node.variables;
    return node.variables.filter(
      (v) => v.key.toLowerCase().includes(t) || String(v.value ?? "").toLowerCase().includes(t)
    );
  }, [node.variables, search]);

  const handleUpdateVariable = (index: number, updates: Partial<EditableVariable>) => {
    const realIndex = node.variables.indexOf(filteredVars[index]);
    if (realIndex === -1) return;
    const newVars = [...node.variables];
    newVars[realIndex] = { ...newVars[realIndex], ...updates };
    onUpdateNode({ ...node, variables: newVars });
  };

  const handleDeleteVariable = (index: number) => {
    const realIndex = node.variables.indexOf(filteredVars[index]);
    if (realIndex === -1) return;
    onUpdateNode({ ...node, variables: node.variables.filter((_, i) => i !== realIndex) });
  };

  const handleAddVariable = (key: string, value: string, isPrivate: boolean) => {
    onUpdateNode({
      ...node,
      variables: [...node.variables, { id: genVarId(), key, value, isPrivate }],
    });
  };

  const handleAddNext = () => {
    onUpdateNode({
      ...node,
      variables: [...node.variables, { id: genVarId(), key: "", value: "", isPrivate: false }],
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-comment pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
            placeholder="Search variables..."
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-panel border border-border rounded-md text-text placeholder:text-comment focus:outline-none focus:ring-1"
            style={{ "--tw-ring-color": "var(--icon-primary)" } as React.CSSProperties}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X size={13} className="text-comment hover:text-text" />
            </button>
          )}
        </div>
      </div>

      {/* Add row */}
      <AddVariableRow onAdd={handleAddVariable} />

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {filteredVars.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left text-xs font-semibold text-comment uppercase tracking-wider">Key</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-comment uppercase tracking-wider">Value</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-comment uppercase tracking-wider">Visibility</th>
                <th className="pr-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredVars.map((v, i) => (
                <VariableTableRow
                  key={v.id}
                  index={i}
                  variable={v}
                  highlighted={!!highlightTarget && v.key === highlightTarget.varKey && (highlightTarget.envPath === "" || highlightTarget.envPath === envPath)}
                  onChange={(updates) => handleUpdateVariable(i, updates)}
                  onDelete={() => handleDeleteVariable(i)}
                  onAddNext={handleAddNext}
                />
              ))}
            </tbody>
          </table>
        ) : search ? (
          <div className="flex flex-col items-center justify-center h-24 text-comment">
            <Search size={20} className="mb-2 opacity-40" />
            <p className="text-sm">No matches for &ldquo;{search.trim()}&rdquo;</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-24 text-comment">
            <p className="text-sm">No variables yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Runtime panel ────────────────────────────────────────────────────────────

const RuntimePanel = ({
  vars,
  onRefresh,
  onDelete,
}: {
  vars: Record<string, any>;
  onRefresh: () => void;
  onDelete: (key: string) => void;
}) => {
  const entries = Object.entries(vars);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
        <p className="text-xs text-comment">
          Set by variable capture during request execution · use <code className="font-mono">{"{{process.KEY}}"}</code>
        </p>
        <button onClick={onRefresh} className="p-1 rounded hover:bg-active transition-colors">
          <RefreshCw size={13} className="text-comment hover:text-text" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left text-xs font-semibold text-comment uppercase tracking-wider">Key</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-comment uppercase tracking-wider">Value</th>
                <th className="pr-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([k, v], i) => (
                <RuntimeRow key={k} index={i} varKey={k} value={v} onDelete={() => onDelete(k)} />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-comment gap-2">
            <Clock size={28} className="opacity-30" />
            <p className="text-sm">No runtime variables yet.</p>
            <p className="text-xs opacity-60 max-w-64 text-center">Variables set during request execution via variable capture will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const RuntimeRow = ({
  varKey,
  value,
  onDelete,
}: {
  index: number;
  varKey: string;
  value: any;
  onDelete: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(displayValue); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <tr className="group border-b border-border hover:bg-active/30 transition-colors">
      <td className="px-2 py-2 w-[200px] font-mono text-sm text-text">{varKey}</td>
      <td className="px-2 py-2">
          <span className="font-mono text-sm text-comment flex-1 truncate max-w-xs">{displayValue}</span>
      </td>
      <td className="pr-3 py-1.5 w-8">
         <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="p-0.5 rounded hover:bg-active opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {copied ? <Check size={13} style={{ color: "var(--icon-success)" }} /> : <Copy size={13} className="text-comment" />}
          </button>
          <button onClick={onDelete} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-active transition-opacity">
          <Trash2 size={13} style={{ color: "var(--icon-error)" }} />
        </button>
        </div>
        
      </td>
    </tr>
  );
};

// ─── Env sidebar item ─────────────────────────────────────────────────────────

const EnvSidebarItem = ({
  entry,
  isSelected,
  onClick,
  onDelete,
  onRename,
}: {
  entry: FlatEnvEntry;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: () => void;
}) => (
  <div
    role="button"
    onClick={onClick}
    onDoubleClick={onRename}
    className={`w-full flex items-center border-b border-border gap-1 py-1.5 text-sm text-left transition-colors rounded-md cursor-pointer group/item ${
      isSelected ? "bg-active text-text" : "text-comment hover:bg-active/50 hover:text-text"
    }`}
    style={{ paddingLeft: `${10 + entry.depth * 14}px`, paddingRight: "6px" }}
  >
    <span className="flex-1 truncate font-mono text-xs">{entry.displayName || entry.name}</span>
    {/* count + delete — always reserve space, show on hover */}
    <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
      <span className="text-xs text-comment/60 tabular-nums">{entry.varCount}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-0.5 rounded hover:bg-border transition-colors"
      >
        <Trash2 size={11} className="text-comment/60 hover:text-comment" />
      </button>
    </span>
  </div>
);

// ─── Main EnvironmentEditor ───────────────────────────────────────────────────

export const EnvironmentEditor = ({ tabId }: { tabId: string }) => {
  const queryClient = useQueryClient();
  const { data: envData } = useEnvironments();
  const [selectedProfile, setSelectedProfile] = useState<string>(
    rememberedProfile ?? envData?.activeProfile ?? "default"
  );
  const profileParam = selectedProfile === "default" ? undefined : selectedProfile;
  const { data, isLoading } = useYamlEnvironments(profileParam);
  const { mutate: save } = useSaveYamlEnvironments(profileParam);

  const [tree, setTree] = useState<EditableEnvTree>({});
  const [selectedEnvPath, setSelectedEnvPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"variables" | "runtime">("variables");
  const [runtimeVars, setRuntimeVars] = useState<Record<string, any>>({});
  const [highlightTarget, setHighlightTarget] = useState<{ varKey: string; envPath: string } | null>(null);

  // Env renaming in sidebar
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(208);
  const [isResizing, setIsResizing] = useState(false);
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(320, Math.max(140, startWidth + ev.clientX - startX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedProfileRef = useRef(selectedProfile);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeDataRef = useRef<EditableEnvTree>({});
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const setScrollPosition = useEditorStore((s) => s.setScrollPosition);
  const getScrollPosition = useEditorStore((s) => s.getScrollPosition);

  // Scroll position persistence
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    let currentTarget = getScrollPosition(tabId);
    let isUserScrolling = false;
    let userScrollTimeout: number | null = null;
    const setUserScrolling = () => {
      isUserScrolling = true;
      if (userScrollTimeout !== null) clearTimeout(userScrollTimeout);
      userScrollTimeout = window.setTimeout(() => { isUserScrolling = false; userScrollTimeout = null; }, 1000);
    };
    const applySavedScroll = () => {
      if (isUserScrolling) return;
      scrollEl.scrollTop = Math.min(currentTarget, Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight));
    };
    const handleScroll = () => {
      if (isUserScrolling) { currentTarget = scrollEl.scrollTop; setScrollPosition(tabId, scrollEl.scrollTop); }
      else applySavedScroll();
    };
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    ["wheel", "touchmove", "keydown", "mousedown"].forEach((ev) =>
      scrollEl.addEventListener(ev, setUserScrolling, { passive: true, capture: true })
    );
    scrollEl.style.scrollBehavior = "auto";
    applySavedScroll();
    let rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        applySavedScroll();
        [0, 60, 140].forEach((d) => window.setTimeout(applySavedScroll, d));
      });
    });
    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
      ["wheel", "touchmove", "keydown", "mousedown"].forEach((ev) =>
        scrollEl.removeEventListener(ev, setUserScrolling, { capture: true } as EventListenerOptions)
      );
      if (userScrollTimeout !== null) clearTimeout(userScrollTimeout);
      cancelAnimationFrame(rafId);
      setScrollPosition(tabId, currentTarget);
    };
  }, [tabId, isLoading, getScrollPosition, setScrollPosition]);

  // Remember profile
  useEffect(() => { rememberedProfile = selectedProfile; selectedProfileRef.current = selectedProfile; }, [selectedProfile]);
  // Invalidate on mount
  useEffect(() => { queryClient.invalidateQueries({ queryKey: ["yaml-environments"] }); }, [queryClient]);
  // Reset dirty on profile switch
  useEffect(() => { dirtyRef.current = false; }, [selectedProfile]);

  // Initialize tree from fetched data
  useEffect(() => {
    if (data && !dirtyRef.current) {
      const merged = mergeToEditable(data.public, data.private);
      setTree(merged);
      treeDataRef.current = merged;
    }
  }, [data]);

  // Auto-select first env when tree loads
  useEffect(() => {
    if (!selectedEnvPath && Object.keys(tree).length > 0) {
      setSelectedEnvPath(Object.keys(tree)[0]);
    }
  }, [tree, selectedEnvPath]);

  // Load runtime vars for the currently selected env (bucket-only, not merged).
  // Falls back to "__global__" when no env is selected so users can still view/manage global vars.
  const loadRuntimeVars = useCallback(async () => {
    const envKey = selectedEnvPath || "__global__";
    const vars = await (window as any).electron?.variables?.read?.(envKey);
    setRuntimeVars(vars ?? {});
  }, [selectedEnvPath]);

  useEffect(() => { loadRuntimeVars(); }, [loadRuntimeVars]);
  useEffect(() => { if (activeTab === "runtime") loadRuntimeVars(); }, [activeTab, loadRuntimeVars]);

  // Save ref
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const { publicTree, privateTree } = splitFromEditable(treeDataRef.current);
        saveRef.current({ publicTree, privateTree });
      }
    };
  }, []);

  const scheduleSave = useCallback((newTree: EditableEnvTree) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const { publicTree, privateTree } = splitFromEditable(newTree);
      save({ publicTree, privateTree });
    }, DEBOUNCE_MS);
  }, [save]);

  const handleUpdateTree = useCallback((newTree: EditableEnvTree) => {
    dirtyRef.current = true;
    setTree(newTree);
    treeDataRef.current = newTree;
    scheduleSave(newTree);
  }, [scheduleSave]);

  // Jump target handling
  const consumeJumpTarget = useCallback((currentTree: EditableEnvTree) => {
    if (!pendingJumpTarget || Object.keys(currentTree).length === 0) return;
    const { varKey, envPath, profile } = pendingJumpTarget;
    if (profile && profile !== selectedProfileRef.current) {
      setSelectedProfile(profile === "default" ? "default" : profile);
      return;
    }
    pendingJumpTarget = null;
    if (!envPath) {
      setHighlightTarget({ varKey, envPath: "" });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightTarget(null), 2500);
      return;
    }
    const foundPath = findVarInLineage(currentTree, envPath, varKey);
    if (foundPath) {
      setSelectedEnvPath(foundPath);
      setHighlightTarget({ varKey, envPath: foundPath });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightTarget(null), 2500);
    } else {
      const segments = envPath.split(".");
      const newTree = structuredClone(currentTree);
      let node: EditableEnvNode | undefined = newTree[segments[0]];
      for (let i = 1; i < segments.length && node; i++) node = node.children[segments[i]];
      if (node) {
        node.variables.push({ id: genVarId(), key: varKey, value: "", isPrivate: false });
        handleUpdateTree(newTree);
        setSelectedEnvPath(envPath);
        setHighlightTarget({ varKey, envPath });
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightTarget(null), 2500);
      }
    }
  }, [handleUpdateTree]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { consumeJumpTarget(tree); }, [tree]);
  useEffect(() => {
    consumeJumpTarget(treeDataRef.current);
    const tryConsume = () => consumeJumpTarget(treeDataRef.current);
    window.addEventListener("voiden:env-editor-focus", tryConsume);
    return () => window.removeEventListener("voiden:env-editor-focus", tryConsume);
  }, [consumeJumpTarget]);

  // Add root environment
  const handleAddRoot = () => {
    const envName = generateUniqueName(tree);
    const newTree = { ...tree, [envName]: { variables: [], children: {} } };
    handleUpdateTree(newTree);
    setSelectedEnvPath(envName);
    setRenamingPath(envName);
    setRenameValue("");
  };

  // Update selected node
  const handleUpdateSelectedNode = useCallback((updated: EditableEnvNode) => {
    if (!selectedEnvPath) return;
    handleUpdateTree(updateNodeAtPath(tree, selectedEnvPath, updated));
  }, [selectedEnvPath, tree, handleUpdateTree]);

  // Delete a single runtime variable from the selected env bucket
  const handleDeleteRuntimeVar = async (key: string) => {
    const updated = { ...runtimeVars };
    delete updated[key];
    setRuntimeVars(updated);
    const envKey = selectedEnvPath || "__global__";
    await (window as any).electron?.variables?.deleteKey?.(key, envKey);
  };

  // Clear all runtime variables for the currently viewed bucket
  const handleClearRuntimeBucket = async () => {
    const envKey = selectedEnvPath || "__global__";
    setRuntimeVars({});
    await (window as any).electron?.variables?.writeVariables?.({}, envKey);
  };

  // Rename commit
  const handleCommitRename = (path: string) => {
    const trimmed = renameValue.trim();
    const lastSegment = path.split(".").pop()!;
    if (!trimmed) {
      const node = getNodeAtPath(tree, path);
      if (node && node.variables.length === 0 && Object.keys(node.children).length === 0) {
        handleUpdateTree(deleteNodeAtPath(tree, path));
        if (selectedEnvPath === path) setSelectedEnvPath(null);
      }
    } else if (trimmed !== lastSegment) {
      const newTree = renameNodeAtPath(tree, path, trimmed);
      handleUpdateTree(newTree);
      const newPath = path.includes(".")
        ? path.split(".").slice(0, -1).join(".") + "." + trimmed
        : trimmed;
      if (selectedEnvPath === path) setSelectedEnvPath(newPath);
    }
    setRenamingPath(null);
    setRenameValue("");
  };

  const flatEnvs = useMemo(() => flattenTree(tree), [tree]);
  const selectedNode = selectedEnvPath ? getNodeAtPath(tree, selectedEnvPath) : null;
  const runtimeCount = Object.keys(runtimeVars).length;

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-comment bg-editor">
        <div className="text-sm">Loading environments…</div>
      </div>
    );
  }

  return (
    <div ref={editorRef} className="h-full w-full bg-editor text-text flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 size={15} style={{ color: "var(--icon-primary)" }} />
          <h2 className="text-sm font-semibold">Environments</h2>
        </div>
        <div className="flex items-center gap-2">
          <ProfileSelector selectedProfile={selectedProfile} onSelectProfile={(p) => { setSelectedProfile(p); setSelectedEnvPath(null); }} />
        </div>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — resizable */}
        <div
          className="border-r border-border flex flex-col flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          <div className="px-3 py-2 text-xs font-semibold text-comment/70 uppercase tracking-wider border-b border-border flex-shrink-0">
            Environments
          </div>

          {/* Pinned Global entry */}
          <button
            onClick={() => setSelectedEnvPath("__global__")}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-xs border-b border-border transition-colors flex-shrink-0",
              selectedEnvPath === "__global__"
                ? "bg-active text-text"
                : "text-comment hover:bg-active/50 hover:text-text"
            )}
          >
            <Globe size={12} className="flex-shrink-0" />
            <span className="flex-1 text-left font-medium">Global Runtime</span>
            {runtimeCount > 0 && selectedEnvPath !== "__global__" && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-active text-comment">{runtimeCount}</span>
            )}
          </button>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {flatEnvs.length === 0 ? (
              <div className="text-xs text-comment/50 text-center py-4">No environments</div>
            ) : (
              flatEnvs.map((entry) => (
                <div key={entry.path}>
                  {renamingPath === entry.path ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleCommitRename(entry.path)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitRename(entry.path);
                        if (e.key === "Escape") { setRenamingPath(null); setRenameValue(""); }
                      }}
                      style={{ paddingLeft: `${10 + entry.depth * 14}px` }}
                      className="w-full text-xs font-mono py-1.5 pr-2 bg-editor border border-border rounded-md text-text focus:outline-none focus:ring-1"
                      autoFocus
                    />
                  ) : (
                    <EnvSidebarItem
                      entry={entry}
                      isSelected={selectedEnvPath === entry.path}
                      onClick={() => { setSelectedEnvPath(entry.path); }}
                      onDelete={() => {
                        handleUpdateTree(deleteNodeAtPath(tree, entry.path));
                        if (selectedEnvPath === entry.path) setSelectedEnvPath(null);
                      }}
                      onRename={() => { setRenamingPath(entry.path); setRenameValue(entry.name); }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
          {/* New env button */}
          <button
            onClick={handleAddRoot}
            className="group flex items-center justify-center gap-1.5 mx-2 mb-2 px-3 py-2 text-xs rounded-md font-medium transition-all hover:opacity-90 flex-shrink-0 border border-transparent hover:border-white/10 shadow-sm"
            style={{ backgroundColor: "var(--icon-primary)", color: "var(--ui-bg)" }}
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
              <Plus size={10} strokeWidth={2.5} />
            </span>
            New Environment
          </button>
        </div>

        {/* Drag-to-resize handle */}
        <div
          onMouseDown={startResize}
          className={cn(
            "relative w-2 flex-shrink-0 cursor-col-resize z-10",
            "before:absolute before:left-1/2 before:-translate-x-1/2 before:h-full before:transition-all",
            isResizing
              ? "before:w-1 before:bg-accent"
              : "before:w-[1px] before:bg-line before:hover:w-1 before:hover:bg-line",
          )}
        />

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedNode && selectedEnvPath ? (
            <>
              {/* Env header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
                <h2 className="text-base font-semibold font-mono">
                  {selectedEnvPath.split(".").pop()}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-md bg-active text-comment font-medium">
                  {selectedNode.variables.length} vars
                </span>
                {selectedNode.variables.filter((v) => v.isPrivate).length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-md font-medium border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--icon-warning) 10%, transparent)",
                      borderColor: "color-mix(in srgb, var(--icon-warning) 30%, transparent)",
                      color: "var(--icon-warning)",
                    }}
                  >
                    {selectedNode.variables.filter((v) => v.isPrivate).length} private
                  </span>
                )}
              </div>

              {/* Tab bar */}
              <div className="flex border-b border-border px-5 flex-shrink-0">
                {(["variables", "runtime"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-1 pb-2 pt-2.5 mr-5 text-sm font-medium border-b-2 transition-colors capitalize ${
                      activeTab === tab
                        ? "border-[var(--icon-primary)] text-text"
                        : "border-transparent text-comment hover:text-text"
                    }`}
                  >
                    {tab === "variables" ? "Variables" : (
                      <span className="flex items-center gap-1.5">
                        Runtime
                        {runtimeCount > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-active text-comment">
                            {runtimeCount}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "variables" ? (
                <VariablesPanel
                  node={selectedNode}
                  envPath={selectedEnvPath}
                  highlightTarget={highlightTarget}
                  onUpdateNode={handleUpdateSelectedNode}
                />
              ) : (
                <RuntimePanel
                  vars={runtimeVars}
                  onRefresh={loadRuntimeVars}
                  onDelete={handleDeleteRuntimeVar}
                />
              )}
            </>
          ) : selectedEnvPath === "__global__" ? (
            <>
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-shrink-0">
                <Globe size={15} className="text-comment" />
                <span className="text-sm font-semibold">Global Runtime</span>
                <span className="text-xs text-comment ml-1">· captured with no active environment</span>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={loadRuntimeVars} className="p-1 rounded hover:bg-active transition-colors">
                    <RefreshCw size={13} className="text-comment" />
                  </button>
                  {Object.keys(runtimeVars).length > 0 && (
                    <button
                      onClick={handleClearRuntimeBucket}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-comment hover:text-text hover:bg-active transition-colors"
                    >
                      <Trash2 size={11} /> Clear All
                    </button>
                  )}
                </div>
              </div>
              <RuntimePanel
                vars={runtimeVars}
                onRefresh={loadRuntimeVars}
                onDelete={handleDeleteRuntimeVar}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-comment gap-3">
              <Settings2 size={32} className="opacity-25" />
              <p className="text-sm">Select an environment to view its variables.</p>
              <button
                onClick={handleAddRoot}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "var(--icon-primary)", color: "var(--ui-bg)" }}
              >
                <Plus size={14} /> Add Environment
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
