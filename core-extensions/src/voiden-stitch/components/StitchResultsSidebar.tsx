/**
 * Stitch Results Sidebar
 *
 * Right sidebar tab showing aggregated results from stitch runs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trash2,
  Check,
  X,
  AlertCircle,
  Loader2,
  SkipForward,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
} from 'lucide-react';
import { stitchStore } from '../lib/stitchStore';
import type { StitchRunState, StitchFileResult, StitchSectionResult } from '../lib/types';

function useStitchRun(): StitchRunState {
  const [run, setRun] = useState<StitchRunState>(stitchStore.getRun());
  useEffect(() => {
    return stitchStore.subscribe(() => setRun(stitchStore.getRun()));
  }, []);
  return run;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

const StatusIcon = ({ status }: { status: StitchFileResult['status'] }) => {
  switch (status) {
    case 'passed':
      return <Check size={12} className="text-green-400" />;
    case 'failed':
      return <X size={12} className="text-red-400" />;
    case 'error':
      return <AlertCircle size={12} className="text-red-400" />;
    case 'running':
      return <Loader2 size={12} className="text-accent animate-spin" />;
    case 'skipped':
      return <SkipForward size={12} className="text-comment" />;
    case 'pending':
      return <Clock size={12} className="text-comment" />;
    default:
      return null;
  }
};

const FileRow = ({ file, index }: { file: StitchFileResult; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = file.sections.length > 0 || file.error;

  return (
    <div className="border-b border-border">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-border/30 transition-colors text-left"
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        {hasDetails && (
          expanded
            ? <ChevronDown size={10} className="text-comment flex-none" />
            : <ChevronRight size={10} className="text-comment flex-none" />
        )}
        {!hasDetails && <div className="w-[10px] flex-none" />}

        <StatusIcon status={file.status} />

        <span className="flex-1 text-[11px] text-text truncate font-mono">
          {file.fileName}
        </span>

        {file.assertions.total > 0 && (
          <span className={`text-[10px] font-mono flex-none ${
            file.assertions.failed > 0 ? 'text-red-400' : 'text-green-400'
          }`}>
            {file.assertions.passed}/{file.assertions.total}
          </span>
        )}

        {file.duration > 0 && (
          <span className="text-[10px] text-comment flex-none">
            {formatDuration(file.duration)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pl-8 pr-2 pb-2 space-y-1">
          {file.error && (
            <div className="text-[10px] text-red-400 break-all">{file.error}</div>
          )}
          {file.sections.map((section, i) => (
            <SectionRow key={i} section={section} />
          ))}
        </div>
      )}
    </div>
  );
};

const SectionRow = ({ section }: { section: StitchSectionResult }) => {
  const [expanded, setExpanded] = useState(false);
  const hasAssertions = section.assertions.results.length > 0;

  return (
    <div>
      <button
        onClick={() => hasAssertions && setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-left hover:bg-border/20 rounded px-1 py-0.5"
        style={{ cursor: hasAssertions ? 'pointer' : 'default' }}
      >
        {section.error ? (
          <AlertCircle size={10} className="text-red-400 flex-none" />
        ) : section.assertions.failed > 0 ? (
          <X size={10} className="text-red-400 flex-none" />
        ) : (
          <Check size={10} className="text-green-400 flex-none" />
        )}

        <span className="text-[10px] text-text truncate">
          {section.sectionLabel || `Section ${section.sectionIndex + 1}`}
        </span>

        {section.status && (
          <span className="text-[10px] text-comment flex-none">{section.status}</span>
        )}

        <span className="text-[10px] text-comment flex-none ml-auto">
          {formatDuration(section.duration)}
        </span>
      </button>

      {section.error && (
        <div className="text-[10px] text-red-400 pl-4 break-all">{section.error}</div>
      )}

      {expanded && section.assertions.results.map((assertion, i) => (
        <div key={i} className="flex items-start gap-1.5 pl-4 py-0.5 text-[10px]">
          {assertion.passed ? (
            <Check size={9} className="text-green-400 mt-0.5 flex-none" />
          ) : (
            <X size={9} className="text-red-400 mt-0.5 flex-none" />
          )}
          <span className={assertion.passed ? 'text-text' : 'text-red-400'}>
            {assertion.description}
            {!assertion.passed && assertion.error && (
              <span className="text-comment ml-1">— {assertion.error}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

export const StitchResultsSidebar = () => {
  const run = useStitchRun();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [run.currentFileIndex]);

  const statusLabel = run.status === 'idle'
    ? null
    : run.status === 'running'
      ? 'Running...'
      : run.status === 'completed'
        ? run.summary.failedFiles + run.summary.errorFiles > 0 ? 'Failed' : 'Passed'
        : run.status === 'cancelled'
          ? 'Cancelled'
          : 'Error';

  const statusColor = run.status === 'completed' && run.summary.failedFiles + run.summary.errorFiles === 0
    ? 'text-green-400 bg-green-400/10'
    : run.status === 'running'
      ? 'text-accent bg-accent/10'
      : run.status === 'idle'
        ? ''
        : 'text-red-400 bg-red-400/10';

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-2 py-1.5 border-b border-border bg-bg">
        <div className="flex items-center gap-2">
          <span className="text-comment text-[11px] font-semibold uppercase tracking-wide">Stitch Results</span>
          {statusLabel && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColor}`}>
              {statusLabel}
            </span>
          )}
        </div>
        {run.status !== 'idle' && (
          <button
            onClick={() => stitchStore.clear()}
            className="text-comment hover:text-text transition-colors p-1 rounded"
            title="Clear results"
            style={{ cursor: 'pointer' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Summary */}
      {run.status !== 'idle' && (
        <div className="flex-none flex items-center gap-3 px-2 py-1.5 border-b border-border bg-bg text-[10px]">
          <span className="text-comment">
            <FileText size={10} className="inline mr-0.5" />
            {run.summary.totalFiles} files
          </span>
          {run.summary.passedFiles > 0 && (
            <span className="text-green-400">{run.summary.passedFiles} passed</span>
          )}
          {run.summary.failedFiles + run.summary.errorFiles > 0 && (
            <span className="text-red-400">{run.summary.failedFiles + run.summary.errorFiles} failed</span>
          )}
          {run.summary.skippedFiles > 0 && (
            <span className="text-comment">{run.summary.skippedFiles} skipped</span>
          )}
          {run.duration > 0 && (
            <span className="text-comment ml-auto">{formatDuration(run.duration)}</span>
          )}
          {run.status === 'running' && run.startedAt && (
            <RunTimer startedAt={run.startedAt} />
          )}
        </div>
      )}

      {/* Assertion summary */}
      {run.summary.totalAssertions > 0 && (
        <div className="flex-none flex items-center gap-3 px-2 py-1 border-b border-border bg-bg text-[10px]">
          <span className="text-comment">Assertions:</span>
          <span className="text-green-400">{run.summary.passedAssertions} passed</span>
          {run.summary.failedAssertions > 0 && (
            <span className="text-red-400">{run.summary.failedAssertions} failed</span>
          )}
          <span className="text-comment">/ {run.summary.totalAssertions} total</span>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {run.status === 'idle' && (
          <div className="p-3 text-comment text-center text-[11px]">
            No stitch results yet. Insert a <code className="text-text">/stitch</code> block and click Run.
          </div>
        )}
        {run.files.map((file, i) => (
          <FileRow key={`${file.filePath}-${i}`} file={file} index={i} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

/** Live timer while a run is in progress. */
const RunTimer = ({ startedAt }: { startedAt: number }) => {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => clearInterval(interval);
  }, [startedAt]);
  return <span className="text-comment ml-auto">{formatDuration(elapsed)}</span>;
};
