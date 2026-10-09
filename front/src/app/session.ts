/** Logging in and out. An account is an address proven by the Ledger — in this browser, or read on the bench's device. */
import { useCallback, useState } from 'react'
import { useBench } from './useBench'
import { disconnect, errText, explain, signIn } from './ledger'

export function useLogin() {
  const { state, act, refresh, say } = useBench()
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)

  const login = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (state?.signer === 'browser') {
        const r = await signIn(setStep)
        if (!r.ok) say(r.msg || 'Connexion refusée.')
      } else {
        setStep('Lecture de l’adresse sur l’appareil du banc…')
        await act('/login_device')
      }
    } catch (e) {
      say(explain(errText(e)))
    } finally {
      setBusy(false)
      setStep(null)
      await refresh()
    }
  }, [busy, state?.signer, act, refresh, say])

  const logout = useCallback(async () => {
    await act('/logout')
    await disconnect()
    await refresh()
  }, [act, refresh])

  return { login, logout, busy, step }
}
