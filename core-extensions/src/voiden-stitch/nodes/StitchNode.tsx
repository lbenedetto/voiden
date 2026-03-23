/**
 * Stitch Block Node
 *
 * TipTap atom node for defining a stitch (batch run) configuration.
 * Renders include/exclude pattern lists, config toggles, file count preview,
 * and a "Run Stitch" button.
 */

import { mergeAttributes, Node, NodeViewProps } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { StitchConfig } from '../lib/types';
import { stitchStore } from '../lib/stitchStore';
import { runStitch, discoverFiles } from '../lib/stitchEngine';

// Lazy-loaded accessor for the current file path
let getFilePath: (() => string | null) | null = null;
async function getCurrentFilePath(): Promise<string> {
  if (!getFilePath) {
    try {
      // @ts-ignore - Vite dynamic import
      const mod = await import(/* @vite-ignore */ '@/core/editors/voiden/VoidenEditor') as any;
      getFilePath = () => mod.useVoidenEditorStore?.getState?.()?.filePath ?? null;
    } catch {
      getFilePath = () => null;
    }
  }
  return getFilePath() || '';
}

export function createStitchNode(
  NodeViewWrapper: any,
  RequestBlockHeader: any,
  useActiveEnv: () => Record<string, string> | undefined,
  openResultsTab: () => void,
) {
  const StitchNodeView = (props: NodeViewProps) => {
    const { node, updateAttributes, editor } = props;
    const isEditable = editor.isEditable;
    const activeEnv = useActiveEnv();

    // Parse attributes
    const include: string[] = useMemo(() => {
      try { return JSON.parse(node.attrs.include || '[]'); }
      catch { return []; }
    }, [node.attrs.include]);

    const exclude: string[] = useMemo(() => {
      try { return JSON.parse(node.attrs.exclude || '[]'); }
      catch { return []; }
    }, [node.attrs.exclude]);

    const stopOnFailure = node.attrs.stopOnFailure === true || node.attrs.stopOnFailure === 'true';
    const isolateFiles = node.attrs.isolateFiles === true || node.attrs.isolateFiles === 'true';
    const delayBetweenFiles = parseInt(node.attrs.delayBetweenFiles || '0', 10) || 0;

    // Local state
    const [matchedCount, setMatchedCount] = useState<number | null>(null);
    const [matchedFiles, setMatchedFiles] = useState<string[]>([]);
    const [showFiles, setShowFiles] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    // Subscribe to store for running state
    useEffect(() => {
      return stitchStore.subscribe(() => {
        const run = stitchStore.getRun();
        setIsRunning(run.status === 'running');
      });
    }, []);

    // Discover matched files when patterns change
    useEffect(() => {
      let cancelled = false;
      const config: StitchConfig = { include, exclude, stopOnFailure, delayBetweenFiles, isolateFiles };

      getCurrentFilePath().then((currentFilePath) => {
        return discoverFiles(config, currentFilePath);
      }).then((result) => {
        if (!cancelled) {
          setMatchedCount(result.count);
          setMatchedFiles(result.files);
        }
      });

      return () => { cancelled = true; };
    }, [include, exclude, editor]);

    // Pattern management
    const addPattern = useCallback((type: 'include' | 'exclude') => {
      const current = type === 'include' ? include : exclude;
      const updated = [...current, ''];
      updateAttributes({ [type]: JSON.stringify(updated) });
    }, [include, exclude, updateAttributes]);

    const updatePattern = useCallback((type: 'include' | 'exclude', index: number, value: string) => {
      const current = type === 'include' ? [...include] : [...exclude];
      current[index] = value;
      updateAttributes({ [type]: JSON.stringify(current) });
    }, [include, exclude, updateAttributes]);

    const removePattern = useCallback((type: 'include' | 'exclude', index: number) => {
      const current = type === 'include' ? [...include] : [...exclude];
      current.splice(index, 1);
      updateAttributes({ [type]: JSON.stringify(current) });
    }, [include, exclude, updateAttributes]);

    // Run stitch
    const handleRun = useCallback(async () => {
      if (isRunning) return;

      const config: StitchConfig = { include, exclude, stopOnFailure, delayBetweenFiles, isolateFiles };
      const currentFilePath = await getCurrentFilePath();

      abortRef.current = new AbortController();
      setIsRunning(true);

      try {
        await runStitch(config, currentFilePath, {
          activeEnv,
          openResultsTab,
        }, abortRef.current.signal);
      } catch (err) {
        console.error('[voiden-stitch] Run failed:', err);
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    }, [include, exclude, stopOnFailure, delayBetweenFiles, isolateFiles, isRunning, editor, activeEnv]);

    const handleCancel = useCallback(() => {
      abortRef.current?.abort();
    }, []);

    return (
      <NodeViewWrapper>
        <div className="my-2 border border-border" contentEditable={false}>
          <RequestBlockHeader title="STITCH RUNNER" withBorder={false} editor={editor} />
          <div className="p-3 space-y-3">
            {/* Include patterns */}
            <PatternList
              label="Include"
              patterns={include}
              placeholder="e.g. api/**/*.void"
              isEditable={isEditable}
              onAdd={() => addPattern('include')}
              onUpdate={(i, v) => updatePattern('include', i, v)}
              onRemove={(i) => removePattern('include', i)}
            />

            {/* Exclude patterns */}
            <PatternList
              label="Exclude"
              patterns={exclude}
              placeholder="e.g. **/draft-*.void"
              isEditable={isEditable}
              onAdd={() => addPattern('exclude')}
              onUpdate={(i, v) => updatePattern('exclude', i, v)}
              onRemove={(i) => removePattern('exclude', i)}
            />

            {/* Options toggle */}
            <div>
              <button
                onClick={() => setOptionsOpen(!optionsOpen)}
                className="flex items-center gap-1 text-[11px] text-comment hover:text-text transition-colors"
                style={{ cursor: 'pointer' }}
              >
                {optionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Options
              </button>
              {optionsOpen && (
                <div className="mt-2 space-y-2 pl-4">
                  <label className="flex items-center gap-2 text-[11px] text-text">
                    <input
                      type="checkbox"
                      checked={stopOnFailure}
                      onChange={(e) => updateAttributes({ stopOnFailure: e.target.checked })}
                      disabled={!isEditable}
                      className="accent-accent"
                    />
                    Stop on failure
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-text">
                    <input
                      type="checkbox"
                      checked={isolateFiles}
                      onChange={(e) => updateAttributes({ isolateFiles: e.target.checked })}
                      disabled={!isEditable}
                      className="accent-accent"
                    />
                    Isolate variables between files
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-text">
                    Delay between files:
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={delayBetweenFiles}
                      onChange={(e) => updateAttributes({ delayBetweenFiles: parseInt(e.target.value) || 0 })}
                      disabled={!isEditable}
                      className="w-20 px-1.5 py-0.5 bg-bg border border-stone-700/50 rounded text-text text-[11px] font-mono focus:outline-none focus:border-accent"
                    />
                    ms
                  </label>
                </div>
              )}
            </div>

            {/* File count + Run button */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <button
                onClick={() => setShowFiles(!showFiles)}
                className="text-[11px] text-comment hover:text-text transition-colors"
                style={{ cursor: 'pointer' }}
              >
                {matchedCount !== null
                  ? `${matchedCount} file${matchedCount !== 1 ? 's' : ''} matched`
                  : 'Scanning...'
                }
                {matchedCount !== null && matchedCount > 0 && (
                  showFiles ? <ChevronDown size={10} className="inline ml-1" /> : <ChevronRight size={10} className="inline ml-1" />
                )}
              </button>

              {isRunning ? (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  style={{ cursor: 'pointer' }}
                >
                  <Square size={10} />
                  Cancel
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!matchedCount || matchedCount === 0}
                  className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ cursor: 'pointer' }}
                >
                  <Play size={10} />
                  Run Stitch
                </button>
              )}
            </div>

            {/* Matched files preview */}
            {showFiles && matchedFiles.length > 0 && (
              <div className="text-[10px] text-comment font-mono space-y-0.5 max-h-32 overflow-y-auto">
                {matchedFiles.map((f, i) => (
                  <div key={i} className="truncate">{f}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </NodeViewWrapper>
    );
  };

  // Pattern list sub-component
  const PatternList = ({
    label,
    patterns,
    placeholder,
    isEditable,
    onAdd,
    onUpdate,
    onRemove,
  }: {
    label: string;
    patterns: string[];
    placeholder: string;
    isEditable: boolean;
    onAdd: () => void;
    onUpdate: (index: number, value: string) => void;
    onRemove: (index: number) => void;
  }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-comment font-semibold uppercase tracking-wide">{label}</span>
        {isEditable && (
          <button
            onClick={onAdd}
            className="text-comment hover:text-text transition-colors p-0.5 rounded"
            title={`Add ${label.toLowerCase()} pattern`}
            style={{ cursor: 'pointer' }}
          >
            <Plus size={12} />
          </button>
        )}
      </div>
      {patterns.length === 0 && (
        <div className="text-[10px] text-comment italic">
          {label === 'Include' ? 'No patterns — all .void files will be included' : 'No exclusions'}
        </div>
      )}
      {patterns.map((pattern, i) => (
        <div key={i} className="flex items-center gap-1 mb-1">
          <input
            type="text"
            value={pattern}
            onChange={(e) => onUpdate(i, e.target.value)}
            placeholder={placeholder}
            disabled={!isEditable}
            className="flex-1 px-1.5 py-0.5 bg-bg border border-stone-700/50 rounded text-text text-[11px] font-mono focus:outline-none focus:border-accent placeholder:text-comment/50"
          />
          {isEditable && (
            <button
              onClick={() => onRemove(i)}
              className="text-comment hover:text-red-400 transition-colors p-0.5 rounded"
              style={{ cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  // TipTap Node definition
  return Node.create({
    name: 'stitch',
    group: 'block',
    content: '',
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        include: {
          default: JSON.stringify(['**/*.void']),
          parseHTML: (el: HTMLElement) => el.getAttribute('data-include') || JSON.stringify(['**/*.void']),
          renderHTML: (attrs: any) => ({ 'data-include': attrs.include }),
        },
        exclude: {
          default: JSON.stringify([]),
          parseHTML: (el: HTMLElement) => el.getAttribute('data-exclude') || JSON.stringify([]),
          renderHTML: (attrs: any) => ({ 'data-exclude': attrs.exclude }),
        },
        stopOnFailure: {
          default: false,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-stop-on-failure') === 'true',
          renderHTML: (attrs: any) => ({ 'data-stop-on-failure': String(attrs.stopOnFailure) }),
        },
        delayBetweenFiles: {
          default: 0,
          parseHTML: (el: HTMLElement) => parseInt(el.getAttribute('data-delay') || '0', 10),
          renderHTML: (attrs: any) => ({ 'data-delay': String(attrs.delayBetweenFiles) }),
        },
        isolateFiles: {
          default: false,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-isolate-files') === 'true',
          renderHTML: (attrs: any) => ({ 'data-isolate-files': String(attrs.isolateFiles) }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'stitch' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['stitch', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return ReactNodeViewRenderer(StitchNodeView);
    },
  });
}
