import { createTransport } from 'nodemailer'
import type { RunResult, CliReportEntry } from '../types.js'

export interface MailReportOptions {
  to: string
  from?: string
  subject?: string
  smtpHost: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  smtpPass?: string
  csvPath?: string
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHtml(
  results: Array<{ file: string; result: RunResult }>,
  totalMs: number,
): string {
  const passed = results.filter(r => r.result.success).length
  const failed = results.length - passed

  const fileRows = results.map(({ file, result }, i) => {
    const statusColor = result.success ? '#4ade80' : '#f87171'
    const icon = result.success ? '✓' : '✗'
    return `
      <div style="background:#1e293b;padding:12px 16px;margin-bottom:8px;border-radius:6px;display:flex;align-items:center;gap:12px;border:1px solid #334155">
        <span style="color:${statusColor};font-weight:700">${icon}</span>
        <span style="color:#94a3b8;font-size:12px;width:40px">[${i + 1}/${results.length}]</span>
        <span style="color:#e2e8f0;font-size:14px;flex:1">${esc(file)}</span>
        <span style="color:#64748b;font-size:12px">${result.durationMs}ms</span>
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>voiden-runner report</title>
</head>
<body style="margin:0;padding:40px;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:700px;margin:0 auto">
    <h1 style="color:#7dd3fc;font-size:24px;margin:0 0 8px">voiden-runner report</h1>
    <p style="color:#64748b;font-size:14px;margin:0 0 32px">${new Date().toUTCString()} · ${totalMs}ms total</p>

    <div style="background:#1e293b;border-radius:12px;padding:32px;margin-bottom:32px;display:flex;gap:48px;border:1px solid #334155">
      <div>
        <span style="color:#64748b;font-size:12px;display:block;margin-bottom:8px;letter-spacing:1px">PASSED</span>
        <span style="font-size:36px;font-weight:700;color:#4ade80">${passed}</span>
      </div>
      <div>
        <span style="color:#64748b;font-size:12px;display:block;margin-bottom:8px;letter-spacing:1px">FAILED</span>
        <span style="font-size:36px;font-weight:700;color:${failed > 0 ? '#f87171' : '#64748b'}">${failed}</span>
      </div>
      <div>
        <span style="color:#64748b;font-size:12px;display:block;margin-bottom:8px;letter-spacing:1px">TOTAL</span>
        <span style="font-size:36px;font-weight:700;color:#94a3b8">${results.length}</span>
      </div>
    </div>

    <h2 style="font-size:16px;color:#94a3b8;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px">Files Executed</h2>
    <div style="margin-bottom:32px">
      ${fileRows}
    </div>

    <div style="background:#0f172a;border:1px dashed #334155;border-radius:8px;padding:20px;text-align:center;color:#94a3b8;font-size:14px">
      Detailed request and response logs are available in the <strong>attached CSV report</strong>.
    </div>
  </div>
</body>
</html>`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendMailReport(
  results: Array<{ file: string; result: RunResult }>,
  totalMs: number,
  opts: MailReportOptions,
): Promise<void> {
  const passed = results.filter(r => r.result.success).length
  const failed = results.length - passed

  const transport = createTransport({
    host:   opts.smtpHost,
    port:   opts.smtpPort ?? (opts.smtpSecure ? 465 : 587),
    secure: opts.smtpSecure ?? false,
    auth:   opts.smtpUser ? { user: opts.smtpUser, pass: opts.smtpPass ?? '' } : undefined,
  })

  const subject = opts.subject
    ?? `voiden-runner: ${passed}/${results.length} passed${failed > 0 ? ` · ${failed} failed` : ' · all passed'}`

  const attachments = []
  if (opts.csvPath) {
    attachments.push({
      filename: opts.csvPath.split('/').pop() || 'report.csv',
      path: opts.csvPath,
    })
  }

  await transport.sendMail({
    from: opts.from ?? opts.smtpUser ?? 'voiden-runner',
    to:   opts.to,
    subject,
    html: buildHtml(results, totalMs),
    attachments,
  })
}
