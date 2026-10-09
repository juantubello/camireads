'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  GripVertical,
  ListOrdered,
  Loader2,
  ArrowDown01,
  Merge,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StarRating } from '@/components/star-rating'
import { SagaCover } from '@/components/saga-cover'
import { SagaFormSheet } from '@/components/saga-form-sheet'
import { SagaAddBooksSheet } from '@/components/saga-add-books-sheet'
import { SagaMergeSheet } from '@/components/saga-merge-sheet'
import { goBackOr, replaceTo } from '@/lib/navigation'
import { isRated } from '@/lib/rating'
import {
  bookCountLabel,
  bookCoverSrc,
  deleteSaga,
  fetchSaga,
  mergeSagas,
  removeBookFromSaga,
  reorderSaga,
  type SagaBook,
  type SagaDetail as Saga,
  type SagaSummary,
  sortByVolume,
} from '@/lib/sagas'
import { cn } from '@/lib/utils'

/** Posiciones 1..n según el orden del array (lo que muestra el número de fila). */
function renumber(books: SagaBook[]): SagaBook[] {
  return books.map((b, index) => ({ ...b, position: index + 1 }))
}

/** Solo arrastre vertical: en una lista, que la fila se vaya de costado es ruido. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function SagaDetailScreen({ sagaId }: { sagaId: string }) {
  const router = useRouter()
  const [saga, setSaga] = useState<Saga | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Unir: la hoja elige la otra saga; la confirmación es un AlertDialog acá
  // (cerrando la hoja antes) para no apilar dos modales.
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeFrom, setMergeFrom] = useState<SagaSummary | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  /** Aviso visible tras unir (además del anuncio para lector de pantalla). */
  const [notice, setNotice] = useState<string | null>(null)

  const [sorting, setSorting] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  /** Lo que se le cuenta al lector de pantalla (mover con ▲▼, quitar). */
  const [liveMessage, setLiveMessage] = useState('')
  /** Último orden que el server confirmó: a esto se vuelve si un PUT falla. */
  const confirmedRef = useRef<SagaBook[]>([])

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoadError(null)
        const data = await fetchSaga(sagaId, signal)
        if (signal?.aborted) return
        setSaga(data)
        confirmedRef.current = data.books
      } catch (error) {
        if (signal?.aborted) return
        setLoadError(error instanceof Error ? error.message : 'No pude traer la saga.')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [sagaId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  /* ---------------------------------------------------------------- */
  /* Guardar el orden                                                  */
  /* ---------------------------------------------------------------- */
  //
  // Optimista: la lista se mueve al toque y el PUT va detrás. Si falla, vuelve
  // al último orden que el server CONFIRMÓ y se explica por qué.
  //
  // Con ▲▼ se puede tocar rápido varias veces seguidas. En vez de disparar un
  // PUT por toque (y que lleguen desordenados), hay un solo "trabajador": manda
  // el último orden pedido y, si mientras tanto se pidió otro, lo manda
  // después. El server siempre termina con el último orden que se vio.
  const pendingOrderRef = useRef<SagaBook[] | null>(null)
  const inFlightRef = useRef(false)

  const flushOrder = useCallback(async () => {
    if (inFlightRef.current || !saga) return
    inFlightRef.current = true
    setSavingOrder(true)
    try {
      while (pendingOrderRef.current) {
        const target = pendingOrderRef.current
        pendingOrderRef.current = null
        try {
          const saved = await reorderSaga(
            saga.id,
            target.map((b) => b.bookId),
          )
          confirmedRef.current = saved.books
          // Si no hay otro movimiento esperando, nos quedamos con lo que dice
          // el server (fuente de verdad). Si lo hay, no pisamos lo optimista.
          if (!pendingOrderRef.current) setSaga(saved)
        } catch (error) {
          pendingOrderRef.current = null
          const previous = confirmedRef.current
          setSaga((prev) => (prev ? { ...prev, books: previous } : prev))
          const message =
            error instanceof Error ? error.message : 'No pude guardar el orden.'
          setOrderError(`${message} Volví al orden anterior.`)
          setLiveMessage('No se pudo guardar el orden. Volví al orden anterior.')
        }
      }
    } finally {
      inFlightRef.current = false
      setSavingOrder(false)
    }
  }, [saga])

  function commitOrder(next: SagaBook[]) {
    const numbered = renumber(next)
    setOrderError(null)
    setSaga((prev) => (prev ? { ...prev, books: numbered } : prev))
    pendingOrderRef.current = numbered
    void flushOrder()
  }

  function move(index: number, delta: -1 | 1) {
    if (!saga) return
    const target = index + delta
    if (target < 0 || target >= saga.books.length) return
    const book = saga.books[index]
    commitOrder(arrayMove(saga.books, index, target))
    setLiveMessage(`${book.title}: posición ${target + 1} de ${saga.books.length}.`)
  }

  /**
   * "Ordenar por número de tomo": después de unir dos sagas (los de la otra
   * quedan al final) o de agregar libros sueltos, deja todo por "#N" en un
   * toque. Los que no tienen "#N" en el título van al final sin moverse entre
   * ellos. Se guarda igual que un arrastre (optimista + PUT /order).
   */
  const byVolume = saga ? sortByVolume(saga.books) : []
  const volumeOrderDiffers =
    !!saga && byVolume.some((book, i) => book.bookId !== saga.books[i].bookId)

  function orderByVolume() {
    if (!saga || !volumeOrderDiffers) return
    commitOrder(byVolume)
    setLiveMessage('Ordené los libros por número de tomo.')
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!saga) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = saga.books.findIndex((b) => b.bookId === active.id)
    const to = saga.books.findIndex((b) => b.bookId === over.id)
    if (from < 0 || to < 0) return
    commitOrder(arrayMove(saga.books, from, to))
  }

  async function remove(book: SagaBook) {
    if (!saga || removing !== null) return
    setRemoving(book.bookId)
    setOrderError(null)
    try {
      const updated = await removeBookFromSaga(saga.id, book.bookId)
      setSaga(updated)
      confirmedRef.current = updated.books
      setLiveMessage(`Saqué ${book.title} de la saga. El libro no se borró.`)
    } catch (error) {
      setOrderError(
        error instanceof Error ? error.message : 'No pude sacar el libro de la saga.',
      )
    } finally {
      setRemoving(null)
    }
  }

  async function handleDelete() {
    if (!saga) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSaga(saga.id)
      // `replace`: la saga ya no existe, "atrás" no tiene que volver a ella.
      replaceTo(router, '/profile')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No pude borrar la saga.')
      setDeleting(false)
    }
  }

  async function handleMerge() {
    if (!saga || !mergeFrom) return
    setMerging(true)
    setMergeError(null)
    try {
      const updated = await mergeSagas(saga.id, mergeFrom.id)
      setSaga(updated)
      confirmedRef.current = updated.books
      const message = `Uní «${mergeFrom.name}» a esta saga: ahora tiene ${bookCountLabel(updated.books.length).toLowerCase()}.`
      setNotice(message)
      setLiveMessage(message)
      setMergeFrom(null)
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'No pude unir las sagas.')
    } finally {
      setMerging(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /* dnd-kit                                                           */
  /* ---------------------------------------------------------------- */
  //
  // Sensores:
  // - Touch con retardo de 200 ms (tolerancia 8 px): en el iPhone, arrastrar
  //   el dedo sobre la lista tiene que seguir siendo SCROLL. Solo mantener
  //   apretada la manija agarra la fila.
  // - Mouse con 4 px de distancia: en desktop no hay scroll por arrastre, así
  //   que no hace falta esperar; la distancia evita que un click sea un drag.
  //   (Mouse + Touch por separado y no PointerSensor: PointerSensor también
  //   recibe los toques y competiría con el TouchSensor por el mismo gesto.)
  // - Teclado: Espacio agarra, flechas mueven, Espacio suelta, Escape cancela.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const books = saga?.books ?? []
  const titleOf = (id: UniqueIdentifier) =>
    books.find((b) => b.bookId === id)?.title ?? 'El libro'
  const positionOf = (id: UniqueIdentifier) =>
    books.findIndex((b) => b.bookId === id) + 1

  // dnd-kit trae los anuncios en inglés: los decimos en castellano y con el
  // título del libro y la posición, que es lo que importa al ordenar.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Agarraste ${titleOf(active.id)}, en la posición ${positionOf(active.id)} de ${books.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} pasa a la posición ${positionOf(over.id)} de ${books.length}.`
        : `${titleOf(active.id)} está fuera de la lista.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste ${titleOf(active.id)} en la posición ${positionOf(over.id)} de ${books.length}.`
        : `Soltaste ${titleOf(active.id)}. El orden no cambió.`,
    onDragCancel: ({ active }) =>
      `Cancelado. ${titleOf(active.id)} volvió a la posición ${positionOf(active.id)}.`,
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 aria-label="Cargando la saga" className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!saga) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="font-medium text-foreground">No encontré esta saga</p>
        {loadError && <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>}
        <Button className="mt-6 h-11" onClick={() => replaceTo(router, '/profile')}>
          Volver al perfil
        </Button>
      </div>
    )
  }

  const empty = saga.books.length === 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          // Vuelve si hay historial propio; si se entró directo por URL, al Perfil.
          onClick={() => goBackOr(router, '/profile')}
          aria-label="Volver"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-6 w-6" />
        </button>
        <p className="text-sm font-medium text-muted-foreground">Saga</p>
      </header>

      {/* -------- Cabecera -------- */}
      <section className="flex gap-4 md:gap-6">
        <SagaCover
          saga={saga}
          alt={`Imagen de la saga ${saga.name}`}
          className="w-28 shrink-0 shadow-md md:w-36"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-2xl font-bold leading-tight text-balance md:text-3xl">
            {saga.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bookCountLabel(saga.books.length)}
            {saga.autoDetected && ' · Armada automáticamente'}
          </p>

          <div className="mt-auto flex flex-wrap gap-1 pt-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              onClick={() => setEditOpen(true)}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Editar
            </Button>
            {/* Unir y Borrar en un menú: con la tapa al lado, a 375px quedan
                ~210px y tres botones no entran en un renglón. Editar queda
                afuera porque es lo que más se usa. `modal={false}` para que
                abrir la hoja o el diálogo desde el menú no deje el body con
                pointer-events bloqueado (pelea conocida de Radix). */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 p-0 text-muted-foreground"
                  aria-label="Más acciones de la saga"
                >
                  <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() => {
                    setMergeError(null)
                    setNotice(null)
                    setMergeOpen(true)
                  }}
                >
                  <Merge aria-hidden="true" />
                  Unir con otra saga
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  className="min-h-11"
                  onSelect={() => {
                    setDeleteError(null)
                    setDeleteOpen(true)
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Borrar saga
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      {/* -------- Barra de acciones de la lista -------- */}
      <div className="mt-6 flex items-center gap-2">
        {!sorting ? (
          <>
            <Button
              type="button"
              className="min-h-11 flex-1 gap-2"
              onClick={() => setAddOpen(true)}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Agregar libros
            </Button>
            {saga.books.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 gap-2"
                onClick={() => {
                  setOrderError(null)
                  setSorting(true)
                }}
              >
                <ListOrdered aria-hidden="true" className="h-4 w-4" />
                Ordenar
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Mantené apretada la manija <GripVertical aria-hidden="true" className="inline h-4 w-4 align-text-bottom" /> y
                arrastrá, o usá las flechas.
              </p>
              {/* Solo si hay algo que acomodar: si ya está por tomo (o ningún
                  título trae "#N"), el botón no aporta nada. */}
              {volumeOrderDiffers && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 self-start gap-2"
                  onClick={orderByVolume}
                >
                  <ArrowDown01 aria-hidden="true" className="h-4 w-4" />
                  Ordenar por número de tomo
                </Button>
              )}
            </div>
            <Button
              type="button"
              className="min-h-11 shrink-0 gap-2"
              onClick={() => setSorting(false)}
            >
              {savingOrder ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="h-4 w-4" />
              )}
              Listo
            </Button>
          </>
        )}
      </div>

      {orderError && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{orderError}</span>
        </p>
      )}

      {notice && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm text-foreground">
          <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar el aviso"
            className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {/* -------- Lista -------- */}
      {empty ? (
        <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <BookOpen aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">Esta saga todavía está vacía</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Sumale libros buscándolos por título. Después los ordenás como quieras.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5 min-h-11 gap-2"
            onClick={() => setAddOpen(true)}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Agregar el primero
          </Button>
        </div>
      ) : sorting ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Para mover un libro, apretá Espacio o Enter. Movelo con las flechas ' +
                'de arriba y abajo, y apretá Espacio o Enter otra vez para soltarlo. ' +
                'Escape cancela. También podés usar los botones Subir y Bajar de cada fila.',
            },
          }}
        >
          <SortableContext
            items={saga.books.map((b) => b.bookId)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              aria-label={`Libros de ${saga.name}, en modo ordenar`}
              className="mt-4 divide-y divide-border rounded-xl border border-border bg-card"
            >
              {saga.books.map((book, index) => (
                <SortableRow
                  key={book.bookId}
                  book={book}
                  index={index}
                  total={saga.books.length}
                  onMove={move}
                  onRemove={() => void remove(book)}
                  removing={removing === book.bookId}
                  disabled={removing !== null}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol
          aria-label={`Libros de ${saga.name}`}
          className="mt-4 divide-y divide-border rounded-xl border border-border bg-card"
        >
          {saga.books.map((book) => (
            <li key={book.bookId}>
              <Link
                href={`/book/${book.bookId}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <BookRowContent book={book} />
              </Link>
            </li>
          ))}
        </ol>
      )}

      {/* -------- Hojas y diálogos -------- */}
      <SagaFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        saga={saga}
        onSaved={(updated) => {
          setSaga(updated)
          confirmedRef.current = updated.books
        }}
      />

      <SagaAddBooksSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        saga={saga}
        onSagaChange={(updated) => {
          setSaga(updated)
          confirmedRef.current = updated.books
        }}
      />

      <SagaMergeSheet
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        current={saga}
        onPick={(other) => {
          setMergeOpen(false)
          setMergeError(null)
          // Un respiro para que la hoja termine de cerrarse y devuelva el foco
          // antes de que el diálogo lo tome (si no, vaul y Radix se lo pelean).
          window.setTimeout(() => setMergeFrom(other), 250)
        }}
      />

      <AlertDialog
        open={mergeFrom !== null}
        onOpenChange={(open) => {
          if (!open && !merging) setMergeFrom(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Unir «{mergeFrom?.name}» a «{saga.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  {mergeFrom && mergeFrom.bookCount === 1
                    ? `El libro de «${mergeFrom.name}» pasa`
                    : `Los ${mergeFrom?.bookCount ?? 0} libros de «${mergeFrom?.name}» pasan`}{' '}
                  al final de «{saga.name}» y «{mergeFrom?.name}» se borra.
                </p>
                <p className="font-medium text-foreground">
                  «{saga.name}» se queda con su nombre, foto y orden. Si un libro ya
                  estaba, no se repite. Los libros y reseñas no se tocan.
                </p>
                {mergeError && (
                  <p role="alert" className="text-destructive">
                    {mergeError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging} className="h-11">
              Mejor no
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleMerge()
              }}
              disabled={merging}
              className="h-11"
            >
              {merging && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              Sí, unir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar la saga «{saga.name}»?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  Se borra el agrupador
                  {saga.books.length > 0 ? ' y el orden que armaste' : ''}.
                </p>
                <p className="font-medium text-foreground">
                  {saga.books.length > 0
                    ? `Los ${saga.books.length === 1 ? 'libro no se borra' : `${saga.books.length} libros no se borran`}: siguen con sus reseñas, tags y en otras sagas.`
                    : 'No tiene libros, así que no se pierde nada más.'}
                </p>
                {deleteError && (
                  <p role="alert" className="text-destructive">
                    {deleteError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="h-11">
              Mejor no
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              Sí, borrar la saga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Filas                                                               */
/* ------------------------------------------------------------------ */

function BookRowContent({ book }: { book: SagaBook }) {
  const cover = bookCoverSrc(book.urlCover)
  return (
    <>
      <span
        aria-hidden="true"
        className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground"
      >
        {book.position}
      </span>
      {cover ? (
        <img src={cover} alt="" className="h-[60px] w-10 shrink-0 rounded object-cover shadow-sm" />
      ) : (
        <div className="flex h-[60px] w-10 shrink-0 items-center justify-center rounded bg-secondary">
          <BookOpen aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {/* El número va en texto oculto para que el lector lo lea junto al
            título ("3. Corona de medianoche"), no suelto. */}
        <p className="line-clamp-2 font-medium leading-snug text-foreground">
          <span className="sr-only">{book.position}. </span>
          {book.title}
        </p>
        <p className="truncate text-sm text-muted-foreground">{book.author}</p>
        {isRated(book.rating) && (
          <StarRating rating={book.rating} size="sm" readonly className="mt-1" />
        )}
      </div>
    </>
  )
}

function SortableRow({
  book,
  index,
  total,
  onMove,
  onRemove,
  removing,
  disabled,
}: {
  book: SagaBook
  index: number
  total: number
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: () => void
  removing: boolean
  disabled: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book.bookId, disabled })

  const first = index === 0
  const last = index === total - 1

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative bg-card p-2 first:rounded-t-xl last:rounded-b-xl',
        isDragging && 'z-10 rounded-xl shadow-lg ring-2 ring-primary',
      )}
    >
      <div className="flex items-center gap-2">
        {/* La manija es lo ÚNICO que arrastra (los listeners van acá y no en la
            fila): así ▲▼ y "Quitar" no compiten con el drag, y el Enter/Espacio
            del teclado sobre esos botones no agarra la fila por accidente. */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Mover ${book.title}, posición ${index + 1} de ${total}`}
          aria-roledescription="elemento ordenable"
          className={cn(
            'flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground',
            'select-none hover:bg-accent hover:text-foreground active:cursor-grabbing',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            // `touch-manipulation` y no `none`: con el retardo del TouchSensor
            // el navegador tiene que poder scrollear si el dedo se mueve antes.
            'touch-manipulation',
          )}
          // Sin el menú de "mantener presionado" de iOS (copiar, compartir…),
          // que si no aparece justo a los 200 ms del agarre.
          style={{ WebkitTouchCallout: 'none' }}
        >
          <GripVertical aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BookRowContent book={book} />
        </div>
      </div>

      {/* Alternativa accesible al arrastre: siempre funciona, también con
          VoiceOver, donde arrastrar es incómodo. `aria-disabled` y no
          `disabled` en los extremos: si el botón se deshabilitara mientras
          tiene el foco, el foco se perdería al llegar arriba de todo. */}
      <div className="mt-1 flex items-center justify-end gap-1 pl-[52px]">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-11 p-0"
          aria-label={`Subir ${book.title}`}
          aria-disabled={first}
          onClick={() => !first && onMove(index, -1)}
        >
          <ArrowUp aria-hidden="true" className={cn('h-4 w-4', first && 'opacity-30')} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-11 p-0"
          aria-label={`Bajar ${book.title}`}
          aria-disabled={last}
          onClick={() => !last && onMove(index, 1)}
        >
          <ArrowDown aria-hidden="true" className={cn('h-4 w-4', last && 'opacity-30')} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto min-h-11 gap-1.5 text-muted-foreground hover:text-destructive"
          aria-label={`Quitar ${book.title} de la saga`}
          aria-disabled={disabled}
          onClick={() => !disabled && onRemove()}
        >
          {removing ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <X aria-hidden="true" className="h-4 w-4" />
          )}
          Quitar
        </Button>
      </div>
    </li>
  )
}
