import { bindCrashGuard, type CrashReport, type ErrorHost } from '../../electron/crashLog'
import { showToast } from '../achievements/toast'

export function installCrashGuard(): void {
  if (typeof window === 'undefined') return
  bindCrashGuard(
    window as unknown as ErrorHost,
    (entry: CrashReport) => {
      const report = window.nestwright?.reportCrash
      if (!report) return
      void report(entry).catch(() => {})
    },
    showToast,
  )
}
