/**
 * Reactive store for stitch run state.
 * Same pub/sub pattern as voiden-scripting's logStore.
 */

import {
  StitchRunState,
  StitchFileResult,
  StitchSummary,
  createEmptyRun,
  computeSummary,
} from './types';

type Listener = () => void;

let currentRun: StitchRunState = createEmptyRun();
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const stitchStore = {
  /** Start a new stitch run with the given file list. */
  startRun(filePaths: { filePath: string; fileName: string }[]) {
    currentRun = {
      ...createEmptyRun(),
      id: `stitch-${Date.now()}`,
      status: 'running',
      startedAt: Date.now(),
      files: filePaths.map((f) => ({
        filePath: f.filePath,
        fileName: f.fileName,
        status: 'pending' as const,
        duration: 0,
        sections: [],
        assertions: { total: 0, passed: 0, failed: 0 },
      })),
      summary: {
        totalFiles: filePaths.length,
        passedFiles: 0,
        failedFiles: 0,
        skippedFiles: 0,
        errorFiles: 0,
        totalAssertions: 0,
        passedAssertions: 0,
        failedAssertions: 0,
      },
    };
    notify();
  },

  /** Mark a file as currently running. */
  setFileRunning(index: number) {
    if (index < 0 || index >= currentRun.files.length) return;
    currentRun = {
      ...currentRun,
      currentFileIndex: index,
      files: currentRun.files.map((f, i) =>
        i === index ? { ...f, status: 'running' as const } : f
      ),
    };
    notify();
  },

  /** Update a file's result after execution. */
  updateFileResult(index: number, result: Partial<StitchFileResult>) {
    if (index < 0 || index >= currentRun.files.length) return;
    const updatedFiles = currentRun.files.map((f, i) =>
      i === index ? { ...f, ...result } : f
    );
    currentRun = {
      ...currentRun,
      files: updatedFiles,
      summary: computeSummary(updatedFiles),
    };
    notify();
  },

  /** Complete the run. */
  completeRun() {
    const now = Date.now();
    currentRun = {
      ...currentRun,
      status: 'completed',
      completedAt: now,
      duration: currentRun.startedAt ? now - currentRun.startedAt : 0,
      summary: computeSummary(currentRun.files),
    };
    notify();
  },

  /** Cancel the run and mark remaining files as skipped. */
  cancelRun() {
    const now = Date.now();
    const updatedFiles = currentRun.files.map((f) =>
      f.status === 'pending' || f.status === 'running'
        ? { ...f, status: 'skipped' as const }
        : f
    );
    currentRun = {
      ...currentRun,
      status: 'cancelled',
      completedAt: now,
      duration: currentRun.startedAt ? now - currentRun.startedAt : 0,
      files: updatedFiles,
      summary: computeSummary(updatedFiles),
    };
    notify();
  },

  /** Mark run as errored. */
  errorRun(error: string) {
    const now = Date.now();
    currentRun = {
      ...currentRun,
      status: 'error',
      completedAt: now,
      duration: currentRun.startedAt ? now - currentRun.startedAt : 0,
      summary: computeSummary(currentRun.files),
    };
    notify();
  },

  /** Get current run state (snapshot). */
  getRun(): StitchRunState {
    return currentRun;
  },

  /** Clear results back to idle. */
  clear() {
    currentRun = createEmptyRun();
    notify();
  },

  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
