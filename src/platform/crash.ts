import { bindCrashGuard, type CrashReport, type ErrorHost } from '../../electron/crashLog'
import { showToast } from '../achievements/toast'
import { translate } from '../i18n'
import { useSettings } from '../settings'

export function installCrashGuard(): void {
  if (typeof window === 'undefined') return
  bindCrashGuard(
    window as unknown as ErrorHost,
    (entry: CrashReport) => {
      const report = window.nestwright?.reportCrash
      if (!report) return
      void report(entry).catch(() => {})
    },
    (text: string) => showToast(translate(useSettings.getState().language, text)),
  )
}
