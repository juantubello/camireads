'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, ChevronDown, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  applyAutoSagas,
  bookCountLabel,
  fetchAutoSagaPreview,
  formatCount,
  type AutoSagaApplyResult,
  type AutoSagaPreview,
} from '@/lib/sagas'

type Phase = 'loading' | 'error' | 'ready' | 'applying' | 'done' | 'applyError'

const plural = (n: number, one: string, many: string) =>
  `${formatCount(n)} ${n === 1 ? one : many}`

/**
 * Hoja "Armar sagas automáticamente".
 *
 * Primero MUESTRA lo que va a hacer (preview) y recién con "Armar" lo hace: con
 * ~300 sagas de golpe, Camila tiene que poder ver antes qué se va a crear. El
 * detalle va colapsado: el resumen en una línea alcanza para decidir, y la
 * lista completa (cientos de filas) está a un toque para quien quiera revisar.
 *
 * El apply es una sola transacción y en el server de 2 núcleos puede tardar
 * unos segundos: mientras corre, la hoja no se puede cerrar (si se cerrara,
 * parecería que no pasó nada y daría ganas de apretar de nuevo).
 */
export function SagaAutoSheet({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se llama apenas el server confirma, para refrescar la grilla de fondo. */
  onApplied: (result: AutoSagaApplyResult) => void
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [preview, setPreview] = useState<AutoSagaPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AutoSagaApplyResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Cada vez que se abre, preview fresco: entre una vez y otra pudo haber
  // reseñas nuevas o sagas editadas.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setPhase('loading')
    setPreview(null)
    setError(null)
    setResult(null)
    fetchAutoSagaPreview(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setPreview(data)
        setPhase('ready')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'No pude calcular qué sagas armar.')
        setPhase('error')
      })
    return () => controller.abort()
  }, [open, reloadKey])

  const applying = phase === 'applying'
  const createBooks = preview?.create.reduce((n, c) => n + c.bookCount, 0) ?? 0
  const extendBooks = preview?.extend.reduce((n, e) => n + e.addCount, 0) ?? 0
  const nothingToDo =
    preview !== null && preview.create.length === 0 && preview.extend.length === 0

  async function apply() {
    if (applying) return
    setPhase('applying')
    setError(null)
    try {
      const done = await applyAutoSagas()
      setResult(done)
      setPhase('done')
      onApplied(done)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude armar las sagas.')
      setPhase('applyError')
    }
  }

  // Lo que se le cuenta al lector de pantalla en cada etapa.
  const status =
    phase === 'loading'
      ? 'Revisando tus libros…'
      : phase === 'applying'
        ? 'Armando las sagas. Puede tardar unos segundos.'
        : phase === 'done' && result
          ? resultText(result)
          : ''

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (applying) return
        onOpenChange(next)
      }}
      dismissible={!applying}
    >
      <DrawerContent className="h-[85dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle className="text-xl">Armar sagas automáticamente</DrawerTitle>
            <DrawerDescription>
              Junto los libros que en el título dicen de qué saga son, como «Libro
              (Saga, #2)», y los ordeno por número de tomo.
            </DrawerDescription>
          </DrawerHeader>

          <p role="status" aria-live="polite" className="sr-only">
            {status}
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto px-4" data-vaul-no-drag="">
            {phase === 'loading' && (
              // aria-hidden: el lector ya lo escucha por la región de estado.
              <p aria-hidden="true" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Revisando tus libros…
              </p>
            )}

            {phase === 'error' && (
              <div role="alert" className="py-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 min-h-11"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  Reintentar
                </Button>
              </div>
            )}

            {phase === 'done' && result && (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                  <Check aria-hidden="true" className="h-6 w-6 text-primary" />
                </span>
                <p className="mt-3 text-lg font-semibold text-foreground">¡Listo!</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">{resultText(result)}</p>
                <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                  Las vas a ver marcadas como «Automática» hasta que las edites.
                </p>
              </div>
            )}

            {preview && phase !== 'done' && phase !== 'loading' && phase !== 'error' && (
              nothingToDo ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                    <Check aria-hidden="true" className="h-6 w-6 text-primary" />
                  </span>
                  <p className="mt-3 text-lg font-semibold text-foreground">Ya está todo armado</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    No encontré sagas nuevas ni libros para sumar. Cuando cargues
                    un libro de una saga, se suma solo.
                  </p>
                  {preview.skippedDismissed > 0 && (
                    <p className="mt-3 max-w-xs text-xs text-muted-foreground">
                      {skippedText(preview.skippedDismissed)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  <div className="rounded-xl bg-secondary p-4">
                    {preview.create.length > 0 && (
                      <p className="text-base font-medium leading-snug text-foreground">
                        Voy a crear {plural(preview.create.length, 'saga', 'sagas')} con{' '}
                        {plural(createBooks, 'libro', 'libros')}
                        {preview.extend.length > 0 ? ',' : '.'}
                      </p>
                    )}
                    {preview.extend.length > 0 && (
                      <p className="text-base font-medium leading-snug text-foreground">
                        {preview.create.length > 0 ? 'y sumar ' : 'Voy a sumar '}
                        {plural(extendBooks, 'libro', 'libros')} a{' '}
                        {plural(preview.extend.length, 'saga que ya tenés', 'sagas que ya tenés')}.
                      </p>
                    )}
                    <p className="mt-2 text-sm text-muted-foreground">
                      Solo armo sagas de 2 libros o más.
                      {preview.skippedDismissed > 0 && ` ${skippedText(preview.skippedDismissed)}`}
                    </p>
                  </div>

                  <p className="flex items-start gap-2 text-sm text-foreground">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      No toca tus libros ni reseñas. Si algo sale mal lo podés deshacer.
                    </span>
                  </p>

                  {preview.create.length > 0 && (
                    <PreviewGroup
                      title={`Ver las ${plural(preview.create.length, 'saga nueva', 'sagas nuevas')}`}
                      items={preview.create.map((c) => ({
                        key: `c-${c.name}`,
                        name: c.name,
                        meta: bookCountLabel(c.bookCount),
                        books: c.books,
                      }))}
                    />
                  )}
                  {preview.extend.length > 0 && (
                    <PreviewGroup
                      title={`Ver las ${plural(preview.extend.length, 'saga que crece', 'sagas que crecen')}`}
                      items={preview.extend.map((e) => ({
                        key: `e-${e.sagaId}`,
                        name: e.name,
                        meta: `+${bookCountLabel(e.addCount)}`,
                        books: e.books,
                      }))}
                    />
                  )}

                  {phase === 'applyError' && error && (
                    <p role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive">
                      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error} No se armó nada: podés probar de nuevo.</span>
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          <DrawerFooter>
            {phase === 'done' || phase === 'error' || nothingToDo ? (
              <Button type="button" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
                {phase === 'done' ? 'Ver mis sagas' : 'Cerrar'}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  className="h-12 w-full gap-2 text-base"
                  onClick={() => void apply()}
                  aria-disabled={phase !== 'ready' && phase !== 'applyError'}
                  disabled={phase === 'loading'}
                >
                  {applying ? (
                    <>
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      Armando… puede tardar unos segundos
                    </>
                  ) : (
                    <>
                      <Sparkles aria-hidden="true" className="h-4 w-4" />
                      Armar
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full"
                  onClick={() => onOpenChange(false)}
                  disabled={applying}
                >
                  Cancelar
                </Button>
              </>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function resultText(result: AutoSagaApplyResult): string {
  const parts: string[] = []
  if (result.created > 0) parts.push(`Creé ${plural(result.created, 'saga', 'sagas')}`)
  if (result.extended > 0)
    parts.push(`${parts.length ? 'sumé libros a' : 'Sumé libros a'} ${plural(result.extended, 'saga', 'sagas')}`)
  if (parts.length === 0) return 'No hubo nada para armar.'
  return `${parts.join(' y ')}: ${plural(result.booksAdded, 'libro', 'libros')} en total.`
}

function skippedText(n: number): string {
  return n === 1
    ? 'No vuelvo a crear 1 saga que borraste.'
    : `No vuelvo a crear ${formatCount(n)} sagas que borraste.`
}

/**
 * Lista colapsable del preview. Con ~300 sagas y ~1200 títulos, los títulos
 * de cada saga NO se montan hasta que se abre esa saga: si no, abrir la lista
 * metería miles de nodos de una y la hoja tardaría en responder.
 */
function PreviewGroup({
  title,
  items,
}: {
  title: string
  items: Array<{ key: string; name: string; meta: string; books: Array<{ bookId: number; title: string }> }>
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((item) => {
            const isOpen = expanded.has(item.key)
            return (
              <li key={item.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(item.key)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 text-sm leading-snug text-foreground">{item.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.meta}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <ol className="list-decimal space-y-1 pb-3 pl-9 pr-3 text-sm text-muted-foreground">
                    {item.books.map((b) => (
                      <li key={b.bookId}>{b.title}</li>
                    ))}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
