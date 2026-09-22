package pe.servicon.sigov.datos

/**
 * De dónde nace el trabajo que se está anotando.
 *
 * En la obra todo metrado sale de uno de tres sitios: de la programación que
 * publicó el supervisor, de un PCI que mandó el cliente, o de algo que pasó
 * ese día y hubo que atender. La diferencia no es burocrática:
 *
 *  · si sale de la **programación**, el metrado avanza esa partida y el
 *    supervisor ve el cumplimiento de la semana;
 *  · si sale de un **PCI**, el registro sustenta el levantamiento y queda
 *    amarrado al plazo que corre contra la empresa;
 *  · si es una **emergencia**, no descuenta de nada y hay que decir por qué
 *    se hizo.
 *
 * Registrar sin decirlo es lo que dejaba el avance en cero aunque la
 * cuadrilla hubiera terminado la partida.
 */
sealed class OrigenDelTrabajo(val clave: String) {

    object Emergencia : OrigenDelTrabajo("emergencia")

    data class Programado(val item: ItemProgramado) : OrigenDelTrabajo("programacion")

    data class Pci(val item: ItemPci) : OrigenDelTrabajo("pci")

    val planItemId: String? get() = (this as? Programado)?.item?.id
    val pciItemId: String? get() = (this as? Pci)?.item?.id
    val pciCodigo: String? get() = (this as? Pci)?.item?.pciCodigo

    /** Cómo se llama en pantalla. */
    val etiqueta: String
        get() = when (this) {
            is Emergencia -> "Emergencia"
            is Programado -> "Programación"
            is Pci -> "PCI"
        }
}
