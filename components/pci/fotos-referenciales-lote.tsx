'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, TriangleAlert, CircleCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn, truncate, uuid } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

type Item = { id: string; item_number: number | null; description: string | null; foto_referencia_path: string | null }
type Fila = { clave: string; archivo: File; vista: string; numero: string }

/**
 * El número de ítem que trae el nombre del archivo: «ITEM_7.jpg»,
 * «Item 7 (1).png», «item-07.jpeg» o solo «7.jpg». Si el nombre trae varios
 * números sin la palabra «ítem» (IMG_20261021_084051), no se adivina.
 */
export function numeroDelArchivo(nombre: string): string {
  const base = nombre.replace(/\.[a-z0-9]+$/i, '')
  const conPalabra = base.match(/[íi]tem[\s_\-.#]*0*(\d+)/i)
  if (conPalabra) return conPalabra[1]
  const numeros = base.match(/\d+/g) ?? []
  return numeros.length === 1 ? String(Number(numeros[0])) : ''
}

/**
 * Cargar de una vez las fotos referenciales de un PCI (video de Elvis del
 * 21/10): COVINCA entrega su panel fotográfico de las observaciones y cada
 * foto va a su ítem, para que el encargado sepa dónde queda en la vía. El
 * ítem sale del nombre del archivo; si no, se escribe a mano.
 */
export function FotosReferencialesLote({
  open,
  onOpenChange,
  items,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: Item[]
}) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [filas, setFilas] = React.useState<Fila[]>([])
  const [subiendo, setSubiendo] = React.useState(false)
  const [hechos, setHechos] = React.useState(0)
  const input = React.useRef<HTMLInputElement>(null)

  const porNumero = React.useMemo(() => {
    const m = new Map<string, Item>()
    for (const i of items) if (i.item_number != null) m.set(String(i.item_number), i)
    return m
  }, [items])

  // Las vistas previas se liberan al cerrar
  React.useEffect(() => {
    if (open) return
    setFilas((fs) => { fs.forEach((f) => URL.revokeObjectURL(f.vista)); return [] })
    setHechos(0)
  }, [open])

  const agregar = (lista: FileList | null) => {
    if (!lista) return
    const nuevas: Fila[] = []
    for (const archivo of Array.from(lista)) {
      if (!archivo.type.startsWith('image/')) { toast.error(`${archivo.name}: no es una imagen`); continue }
      if (archivo.size > 15 * 1024 * 1024) { toast.error(`${archivo.name}: pesa más de 15 MB`); continue }
      nuevas.push({ clave: uuid(), archivo, vista: URL.createObjectURL(archivo), numero: numeroDelArchivo(archivo.name) })
    }
    setFilas((fs) => [...fs, ...nuevas])
    if (input.current) input.current.value = ''
  }

  const quitar = (clave: string) =>
    setFilas((fs) => fs.filter((f) => { if (f.clave === clave) URL.revokeObjectURL(f.vista); return f.clave !== clave }))

  // Dos archivos para el mismo ítem: vale el último de la lista
  const repetidos = React.useMemo(() => {
    const vistos = new Map<string, string>()
    for (const f of filas) if (f.numero) vistos.set(f.numero, f.clave)
    return new Set(filas.filter((f) => f.numero && vistos.get(f.numero) !== f.clave).map((f) => f.clave))
  }, [filas])

  const listas = filas.filter((f) => porNumero.has(f.numero) && !repetidos.has(f.clave))

  /** Borra el archivo anterior si ya nadie lo usa. */
  const soltar = async (vieja: string) => {
    const [a, b] = await Promise.all([
      sb.from('plan_items').select('id', { count: 'exact', head: true }).eq('foto_referencia_path', vieja),
      sb.from('pci_items').select('id', { count: 'exact', head: true }).eq('foto_referencia_path', vieja),
    ])
    if (a.error || b.error || (a.count ?? 0) + (b.count ?? 0) > 0) return
    await sb.storage.from('documentos').remove([vieja])
  }

  const cargar = async () => {
    setSubiendo(true)
    setHechos(0)
    const fallas: string[] = []
    let ok = 0
    for (const f of listas) {
      const item = porNumero.get(f.numero)!
      const ext = (f.archivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const ruta = `${service.id}/referencias/${uuid()}.${ext}`
      try {
        const sube = await sb.storage.from('documentos').upload(ruta, f.archivo, { contentType: f.archivo.type })
        if (sube.error) throw sube.error
        const fija = await sb.rpc('fijar_foto_referencial' as any, { p_tabla: 'pci_items', p_id: item.id, p_path: ruta } as any)
        if (fija.error) {
          void sb.storage.from('documentos').remove([ruta])
          throw fija.error
        }
        if (item.foto_referencia_path) void soltar(item.foto_referencia_path)
        ok++
      } catch (e) {
        fallas.push(`Ítem ${f.numero}: ${mensajeAmigable(e)}`)
      }
      setHechos((n) => n + 1)
    }
    setSubiendo(false)
    qc.invalidateQueries()
    if (ok) toast.success(`${ok} foto${ok === 1 ? '' : 's'} referencial${ok === 1 ? '' : 'es'} cargada${ok === 1 ? '' : 's'}`, { description: 'La cuadrilla las ve en la ficha de cada ítem.' })
    if (fallas.length) toast.error(`${fallas.length} no se cargaron`, { description: fallas.slice(0, 4).join(' · '), duration: 9000 })
    if (!fallas.length) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !subiendo && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Fotos referenciales del PCI</DialogTitle>
          <DialogDescription>
            Las fotos del panel fotográfico de COVINCA, una por ítem. El ítem se toma del nombre del archivo
            («ITEM_7.jpg», «Item 7.png» o «7.jpg»); si no, escríbelo. Si el ítem ya tenía una, se reemplaza.
          </DialogDescription>
        </DialogHeader>

        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => agregar(e.target.files)} />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={subiendo}>
          <ImagePlus className="size-4" />
          {filas.length ? 'Agregar más fotos' : 'Elegir fotos'}
        </Button>

        {filas.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {filas.map((f) => {
              const item = porNumero.get(f.numero)
              const repetido = repetidos.has(f.clave)
              return (
                <li key={f.clave} className="flex items-center gap-3 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.vista} alt="" className="bg-muted size-14 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{f.archivo.name}</p>
                    <p className={cn('text-[11.5px]', item && !repetido ? 'text-muted-foreground' : 'text-destructive')}>
                      {!f.numero ? 'Escribe el número de ítem'
                        : !item ? `Este PCI no tiene el ítem ${f.numero}`
                        : repetido ? `Otra foto de la lista va al ítem ${f.numero}; vale la última`
                        : <>
                            {truncate(item.description ?? '', 70)}
                            {item.foto_referencia_path && <span className="text-warning"> · reemplaza la actual</span>}
                          </>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-[11.5px]">Ítem</span>
                    <Input
                      value={f.numero}
                      inputMode="numeric"
                      aria-label={'Ítem de ' + f.archivo.name}
                      disabled={subiendo}
                      onChange={(e) => {
                        const numero = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
                        setFilas((fs) => fs.map((x) => (x.clave === f.clave ? { ...x, numero } : x)))
                      }}
                      className="h-8 w-16 text-center tabular-nums"
                    />
                    {item && !repetido
                      ? <CircleCheck className="text-success size-4" />
                      : <TriangleAlert className="text-destructive size-4" />}
                    <button
                      type="button"
                      onClick={() => quitar(f.clave)}
                      disabled={subiendo}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={'Quitar ' + f.archivo.name}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter>
          <span className="text-muted-foreground mr-auto self-center text-[12px]">
            {subiendo ? `Cargando ${hechos} de ${listas.length}…` : filas.length ? `${listas.length} de ${filas.length} listas para cargar` : ''}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={subiendo}>Cancelar</Button>
          <Button onClick={cargar} loading={subiendo} disabled={!listas.length}>
            Cargar {listas.length || ''} foto{listas.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
