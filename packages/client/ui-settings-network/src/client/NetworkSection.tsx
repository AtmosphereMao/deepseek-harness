/**
 * Network settings section: one HTTP(S) proxy field written through the `http`
 * settings namespace. The field is an explicit draft — editing marks it dirty
 * and a change is committed only on Save (Enter submits too), matching the
 * Models and Plugins editors. A committed change reaches the very next
 * outbound request (LLM API, web fetch, web search) without a restart. The
 * section owns only its own surface; the transport behavior is owned by
 * `@deepseek-ai/dsh-http` on the Host plane.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { en } from './locales.ts'
import styles from './NetworkSection.module.css'

/** The `http` settings section the proxy lives in. */
export interface NetworkSettings {
  /** HTTP(S) proxy URL; absent or empty means direct transport. */
  proxy?: string
}

/** Injected dependencies of {@link NetworkSection} (slot `inject`). */
export interface NetworkSectionInjected {
  /** uSES subscription hook bound to the `http` settings scope. */
  useSnapshot: SnapshotSelectorHook<SettingsScopeSnapshot<NetworkSettings>>
  /** Commit a proxy URL; an empty value clears the field to inherit. */
  setProxy: (value: string) => void
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the inject face spread flat (the
 * renderer erases the share boundary at the render call).
 */
export type NetworkSectionProps = Partial<NetworkSectionInjected>

/** Accept a proxy the Host transport can act on (http/https, parseable). */
function isUsableProxy(value: string): boolean {
  if (!URL.canParse(value)) return false
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}

/**
 * Render the Network section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function NetworkSection(props: NetworkSectionProps): ReactNode {
  const { useSnapshot, setProxy, t } = props
  if (useSnapshot === undefined || setProxy === undefined || t === undefined) return null
  return <Loaded injected={{ useSnapshot, setProxy, t }} />
}

function Loaded({ injected }: { injected: NetworkSectionInjected }): ReactNode {
  const { useSnapshot, setProxy, t } = injected
  const snapshot = useSnapshot(s => s)
  const committed = snapshot.value?.proxy ?? ''
  const writable = snapshot.writable && snapshot.status === 'ready'
  // The input edits a local draft; the committed value only re-enters it when
  // the user has no pending edit (an external invalidation must not clobber typing).
  const [draft, setDraft] = useState(committed)
  const [dirty, setDirty] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(committed)
  }, [committed, dirty])

  const save = (): void => {
    const value = draft.trim()
    if (value !== '' && !isUsableProxy(value)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDirty(false)
    setProxy(value)
  }

  const discard = (): void => {
    setDraft(committed)
    setDirty(false)
    setInvalid(false)
  }

  if (snapshot.status === 'unavailable') {
    return (
      <div className={styles.section}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.notice}>{t('unavailable')}</p>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('intro')}</p>
      {!writable && snapshot.status === 'ready' ? <p className={styles.notice}>{t('readOnly')}</p> : null}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('proxyLabel')}</span>
        <input
          className={styles.input}
          type="url"
          value={draft}
          placeholder={t('proxyPlaceholder')}
          disabled={!writable}
          spellCheck={false}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(event.target.value)
            setDirty(true)
            setInvalid(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              save()
            }
          }}
        />
      </label>
      {invalid ? <p className={styles.error}>{t('invalidUrl')}</p> : null}
      <p className={styles.hint}>{t('proxyHint')}</p>
      <div className={styles.footer}>
        {dirty ? <span className={styles.pending}>{t('unsaved')}</span> : null}
        <button
          type="button"
          className={styles.discard}
          disabled={!dirty}
          onClick={discard}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          className={styles.save}
          disabled={!dirty || !writable}
          onClick={save}
        >
          {t('save')}
        </button>
      </div>
    </div>
  )
}
