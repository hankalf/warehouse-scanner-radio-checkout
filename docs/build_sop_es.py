"""Genera el POE de Scanner & Radio Checkout en PDF — versión en español.

Ejecutar:  python3 docs/build_sop_es.py
Salida: docs/Scanner-Radio-Checkout-SOP-ES.pdf

Los nombres de botones y menús en pantalla se citan en inglés (tal como
aparecen en la aplicación), con su explicación en español.
"""

from pathlib import Path

from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Spacer, KeepTogether

from sop_common import (
    BLUE, P, bullets, callout, figure, figure_row, make_doc, section, steps, table,
)

OUT = Path(__file__).resolve().parent / "Scanner-Radio-Checkout-SOP-ES.pdf"


def build():
    doc = make_doc(
        OUT,
        title="Scanner & Radio Checkout — POE (Español)",
        subject="Procedimiento Operativo Estándar y referencia de configuración de administración",
        header="Scanner & Radio Checkout — Procedimiento Operativo Estándar",
        footer="Control de dispositivos del almacén — cada acción queda registrada para auditoría",
        page_word="Página",
    )

    s = []  # contenido
    W = doc.width

    # ---------------- Portada ----------------
    s.append(Spacer(1, 0.25 * inch))
    s.append(P("Scanner &amp; Radio Checkout", "title"))
    s.append(P("Procedimiento Operativo Estándar<br/>Standard Operating Procedure", "subtitle"))
    s.append(Spacer(1, 0.15 * inch))
    s.append(table(
        [["Alcance", "Retiro, devolución, inspección y carga de los escáneres de código de "
                     "barras y radios portátiles numerados del almacén."],
         ["Aplica a", "Operadores, Técnicos de equipo, Líderes de equipo, Supervisores y Administradores."],
         ["Uso diario", "El <b>quiosco</b> en la tableta compartida junto al rack de carga (horizontal). No requiere iniciar sesión."],
         ["Gestión", "Tablero de la flota, Reportes y panel de Administración — <b>administradores, supervisores y líderes</b>."],
         ["Registros", "Cada acción escribe una entrada de auditoría inalterable (quién, qué, cuándo y las respuestas de la inspección)."]],
        [1.25 * inch, W - 1.25 * inch], header=False, zebra=False))
    s.append(Spacer(1, 0.3 * inch))
    s.append(callout(
        "Por qué es importante",
        "Los escáneres y radios perdidos o rotos cuestan dinero y retrasan el turno. El sistema "
        "registra quién tiene cada dispositivo y cuándo debe devolverlo, y ningún dispositivo "
        "devuelto vuelve al servicio hasta que un técnico lo haya puesto en el cargador y lo "
        "haya inspeccionado — así la siguiente persona siempre recibe una unidad cargada y "
        "funcional.", BLUE))
    s.append(Spacer(1, 0.22 * inch))
    s.append(figure("kiosk-board",
                    "El quiosco en la tableta compartida — lo que el piso ve todo el día.",
                    max_w=6.6 * inch, max_h=2.7 * inch))

    s.append(PageBreak())

    # ---------------- Contenido ----------------
    s.append(P("Contenido", "h1"))
    s.append(table(
        [["1", "El ciclo de vida del dispositivo de un vistazo"],
         ["2", "Roles y PIN"],
         ["3", "Política de retiro — cuándo debe devolverse un dispositivo"],
         ["4", "Uso del quiosco (uso diario en el piso)"],
         ["5", "Cómo leer el tablero del quiosco"],
         ["6", "Técnico de equipo: lista de inspección y carga"],
         ["7", "Dispositivos dañados — revisión del supervisor"],
         ["8", "Tareas del supervisor en el tablero de la flota"],
         ["9", "Reportes"],
         ["10", "Avanzado: cada ajuste de administración y qué hace (y qué ve un líder)"],
         ["11", "Solución de problemas"]],
        [0.4 * inch, W - 0.4 * inch], header=False, zebra=False))

    # ---------------- 1. Ciclo de vida ----------------
    s.append(section("1. El ciclo de vida del dispositivo de un vistazo", P(
        "Cada escáner y radio pasa por una secuencia fija. El sistema bloquea cualquier paso "
        "fuera de orden.")))
    s.append(table(
        [["Etapa", "Quién", "Qué ocurre"],
         ["<b>Available</b> (Disponible)", "—", "Cargado, inspeccionado y listo para usar."],
         ["<b>Checked out</b> (Retirado)", "Operador", "En uso en el piso. La ficha muestra quién lo tiene y cuándo debe devolverlo."],
         ["<b>Awaiting inspection</b> (Pendiente de inspección)", "El operador lo devuelve", "De vuelta en el rack, esperando a un técnico. <b>No</b> se puede retirar de nuevo en este estado."],
         ["<b>Available</b> (otra vez)", "Técnico de equipo", "En el cargador, inspeccionado, condición Buena → vuelve al servicio."],
         ["<b>Damaged</b> (Dañado)", "El técnico lo marca", "Retenido fuera de servicio con un motivo (y foto opcional) hasta que un <b>supervisor</b> lo revise."],
         ["<b>Out of service</b> (Fuera de servicio)", "Admin/supervisor lo retira", "Fuera de rotación (perdido, roto, reemplazado). Al restaurarlo pasa primero a <i>Awaiting inspection</i>."]],
        [1.5 * inch, 1.2 * inch, W - 2.7 * inch]))
    s.append(Spacer(1, 8))
    s.append(P(
        "<b>Overdue</b> (vencido) no es una etapa aparte — cualquier dispositivo retirado que "
        "pase su hora de devolución se marca vencido automáticamente, se pone en rojo y "
        "aparece en el aviso en la parte superior del quiosco."))

    # ---------------- 2. Roles ----------------
    s.append(section("2. Roles y PIN", P(
        "Cada empleado tiene un PIN corto (4–8 dígitos) que lo identifica. El PIN determina "
        "qué puede hacer. Una persona puede tener más de un rol.")))
    s.append(table(
        [["Rol", "Puede hacer"],
         ["Operator (Operador)", "Retirar un dispositivo disponible; devolver el dispositivo que <b>él mismo</b> retiró."],
         ["Tech (Técnico de equipo)", "Inspeccionar los dispositivos devueltos y colocarlos en el cargador, devolviendo al servicio los que están bien o marcando daños."],
         ["Supervisor", "El tablero de la flota, los reportes y el panel de administración — gestiona los <b>dispositivos</b>, la <b>política de retiro</b> y el logotipo del quiosco, y revisa los dispositivos <b>dañados</b> — pero no gestiona empleados ni la configuración de Teams."],
         ["<b>Lead (Líder de equipo)</b>", "Líder de piso. Hace <b>todas</b> las tareas de operador y técnico, revisa los dispositivos <b>dañados</b> y puede <b>ver</b> la flota y el registro de auditoría — pero <b>no puede cambiar nada</b> en el panel de administración (ver sección 10)."],
         ["Admin (Administrador)", "Todo, incluida la gestión de <b>empleados</b> y la configuración de <b>notificaciones de Teams</b>."]],
        [1.45 * inch, W - 1.45 * inch]))
    s.append(Spacer(1, 10))
    s.append(callout(
        "Cambie los PIN predeterminados antes de empezar",
        "Una instalación nueva incluye cuentas de ejemplo — Admin <b>0000</b>, Operador "
        "<b>1111</b>, Técnico <b>2222</b>, Supervisor <b>3333</b>. Configure PIN reales en "
        "Admin → Workers el primer día y elimine los ejemplos que no necesite. "
        "Los PIN se guardan cifrados y no se pueden consultar — si alguien olvida el suyo, "
        "un administrador le asigna uno nuevo."))

    # ---------------- 3. Política de retiro ----------------
    s.append(section("3. Política de retiro — cuándo debe devolverse un dispositivo", P(
        "Un dispositivo debe devolverse un número fijo de <b>horas después del retiro</b> — un "
        "turno más un margen. Como el reloj empieza en el momento del retiro, un turno nocturno "
        "que cruza la medianoche se maneja igual que uno de día.")))
    s.append(table(
        [["Tipo de dispositivo", "Color en el quiosco", "Debe devolverse"],
         ["<b>Scanner</b> (Escáner)", "Ficha plateada", "Dentro de la ventana de escáneres — <b>12 horas</b> por defecto."],
         ["<b>Radio</b>", "Ficha azul", "Dentro de la ventana de radios — <b>12 horas</b> por defecto."]],
        [1.6 * inch, 1.3 * inch, W - 2.9 * inch]))
    s.append(Spacer(1, 8))
    s.append(P(
        "Ambas ventanas se configuran en <b>Admin → Advanced → Checkout policy</b> (sección 10). "
        "La política vigente se muestra en la parte superior del quiosco en inglés y español. "
        "Cuando un empleado retira un dispositivo, la pantalla de confirmación muestra la fecha "
        "y hora exactas de devolución, y esa hora aparece después en la ficha del dispositivo."))

    # ---------------- 4. Uso del quiosco ----------------
    s.append(section("4. Uso del quiosco (uso diario en el piso)", P(
        "El quiosco es la tableta compartida junto al rack de carga. No requiere iniciar sesión — "
        "cada acción se confirma con el PIN del propio empleado, que es lo que registra quién la "
        "hizo. Los escáneres están en el bloque superior y los radios en el inferior.")))

    s.append(KeepTogether([P("Retirar un dispositivo — Operador", "h2"), steps([
        "Toque el dispositivo que quiere. Debe tener un <b>anillo verde</b> (Available).",
        "Ingrese su PIN y toque <b>Next / Siguiente</b>.",
        "Aparece su nombre. Confirme que es usted — toque <b>Yes, that's me / Sí</b>. "
        "(Si no es su nombre, toque <b>Not me / No soy yo</b> e inténtelo de nuevo.)",
        "La pantalla muestra cuándo debe <b>devolverlo</b>. La ficha ahora muestra su nombre "
        "arriba y un anillo amarillo. Saque el dispositivo del cargador y listo.",
    ])]))
    s.append(figure_row([
        ("kiosk-pin", "Paso 2 — ingrese su PIN."),
        ("kiosk-confirm", "Paso 3 — confirme su nombre y vea la hora de devolución."),
    ]))

    s.append(KeepTogether([P("Devolver un dispositivo — Operador", "h2"), steps([
        "Coloque el dispositivo en su lugar en el rack y luego toque su ficha (anillo amarillo, con su nombre).",
        "Ingrese su PIN, toque <b>Next</b> y confirme su nombre.",
        "El dispositivo pasa a <b>Awaiting inspection</b> (anillo naranja). Ha terminado — "
        "no lo marque disponible usted mismo; un técnico lo inspeccionará y lo pondrá a cargar.",
    ])]))
    s.append(Spacer(1, 4))
    s.append(P(
        "<i>Solo la persona que retiró un dispositivo (o un administrador) puede devolverlo.</i> "
        "Así las devoluciones quedan atribuidas a la persona correcta.", "small"))

    s.append(KeepTogether([P("Inspeccionar y poner a cargar — Técnico de equipo", "h2"), steps([
        "Toque un dispositivo con <b>anillo naranja</b> (Awaiting inspection).",
        "Ingrese su PIN, toque <b>Next</b>, confirme su nombre y toque "
        "<b>Yes — continue / Sí</b>.",
        "Responda las cuatro preguntas de inspección (siguiente sección).",
        "Toque <b>Submit / Enviar</b>.",
    ])]))

    # ---------------- 5. Leer el tablero ----------------
    s.append(section("5. Cómo leer el tablero del quiosco", P(
        "Cada dispositivo es una ficha. El <b>color de relleno</b> indica el tipo de "
        "dispositivo; el <b>anillo alrededor de la ficha</b> indica su estado.")))
    s.append(table(
        [["Color del anillo", "Estado", "Qué hacer"],
         ["Verde", "Available (Disponible)", "Listo para retirar."],
         ["Amarillo", "Checked out (Retirado)", "En uso — el nombre de quien lo tiene aparece arriba en la ficha, con la hora de devolución."],
         ["Naranja", "Awaiting inspection (Pendiente de inspección)", "Un técnico debe inspeccionarlo y ponerlo en el cargador."],
         ["Rojo + “OVERDUE”", "Overdue (Vencido)", "Pasó su hora de devolución. Localícelo y devuélvalo ya."],
         ["Rojo (rosa)", "Damaged (Dañado — requiere revisión)", "Fuera de uso hasta que un supervisor lo revise."],
         ["Gris", "Out of service (Fuera de servicio)", "Retirado de la flota."]],
        [1.3 * inch, 1.9 * inch, W - 3.2 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("kiosk-board",
                    "Los escáneres #2 y #6 y el radio #3 están retirados (anillo amarillo, con "
                    "hora de devolución), el escáner #9 está vencido, los escáneres #4 y #11 y "
                    "el radio #7 esperan inspección (naranja), el escáner #13 está dañado y el "
                    "radio #20 está fuera de servicio.",
                    max_w=6.4 * inch, max_h=3.2 * inch))
    s.append(Spacer(1, 8))
    s.append(P(
        "Los contadores de arriba muestran cuántos dispositivos hay en cada estado. Si algo "
        "está vencido, un aviso rojo los enumera. Cada ficha muestra también el número del "
        "dispositivo y el tipo (Scanner o Radio) en la parte inferior."))

    # ---------------- 6. Lista de inspección ----------------
    s.append(section("6. Técnico de equipo: lista de inspección y carga", P(
        "Antes de que cualquier dispositivo devuelto vuelva al servicio, el técnico debe "
        "responder las cuatro preguntas. Cada pregunta se muestra en inglés y español.")))
    s.append(table(
        [["#", "Pregunta", "Notas"],
         ["1", "<b>¿En el cargador?</b> / On the charger?", "Sí o No. Encájelo en la base y verifique que la luz de carga se encienda."],
         ["2", "<b>¿Inspeccionado?</b> / Inspected?", "Sí o No. Escáneres: pantalla, gatillo/teclas, batería, correa. Radios: antena, botón PTT, batería, clip."],
         ["3", "<b>Condición</b> / Condition", "Bueno / Good — o — Dañado / Damaged."],
         ["4", "<b>Si está dañado, ¿por qué?</b> / Why is it damaged?", "Obligatorio cuando está Dañado. Se puede adjuntar una <b>foto</b> con la cámara de la tableta (opcional pero recomendado)."]],
        [0.3 * inch, 2.1 * inch, W - 2.4 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure_row([
        ("kiosk-checklist", "La lista tal como la responde el técnico."),
        ("kiosk-checklist-damaged", "Dañado muestra el cuadro del motivo y el botón de foto."),
    ], max_h=3.7 * inch))
    s.append(Spacer(1, 10))
    s.append(callout(
        "La regla que el sistema hace cumplir",
        "Un dispositivo vuelve al servicio <b>solo</b> si está en el cargador <b>y</b> "
        "inspeccionado <b>y</b> su condición es Buena. Si alguna respuesta es No, el "
        "sistema se niega a devolverlo al servicio."))

    # ---------------- 7. Dañados ----------------
    s.append(section("7. Dispositivos dañados — revisión del supervisor", P(
        "Cuando un técnico marca un dispositivo como <b>Damaged</b>, el dispositivo queda "
        "retenido fuera de servicio de inmediato. El técnico no puede devolverlo y no se "
        "puede retirar.")))
    s.append(bullets([
        "El motivo reportado (y la foto, si se tomó) se guarda en el dispositivo.",
        "Si las alertas de Teams están activadas, se publica un mensaje en el canal de "
        "inmediato para que un supervisor lo sepa.",
        "Un <b>supervisor, líder o administrador</b> lo revisa en el tablero de la flota: toca "
        "el dispositivo, lee <b>Reported damage</b>, ve la foto y luego elige "
        "<b>Return to service (reviewed)</b> o <b>Retire (out of service)</b>.",
    ]))
    s.append(figure("board-damaged",
                    "Lo que ve el supervisor: el motivo reportado, la foto y las decisiones "
                    "disponibles.", max_w=3.4 * inch, max_h=4.2 * inch))

    # ---------------- 8. Tareas del supervisor ----------------
    s.append(section("8. Tareas del supervisor en el tablero de la flota", P(
        "El tablero de la flota en <b>/</b> es para administradores, supervisores y líderes. "
        "Inicie sesión con su PIN. Toque cualquier dispositivo para abrir su panel de acciones.")))
    s.append(table(
        [["Acción", "Quién", "Cuándo aparece"],
         ["Check out / Check in (return)", "Operador (incluidos admins y líderes)", "Las mismas acciones del ciclo de vida que en el quiosco."],
         ["Inspect &amp; dock (checklist)", "Técnico (incluidos admins y líderes)", "El dispositivo está pendiente de inspección. Hace las mismas cuatro preguntas que el quiosco."],
         ["<b>Return to service (reviewed)</b>", "Supervisor, Líder o Admin", "El dispositivo está Dañado — borra la nota de daño y la foto."],
         ["Retire (out of service)", "Admin / Supervisor / Líder", "Cualquier dispositivo que no esté ya retirado. Para unidades perdidas o rotas."],
         ["Restore to fleet", "Admin / Supervisor / Líder", "El dispositivo está fuera de servicio. Pasa a Awaiting inspection."],
         ["Cambiar tipo (Scanner / Radio)", "Admin / Supervisor", "Siempre — el número debe estar libre en el nuevo tipo. Queda registrado. <i>No disponible para líderes.</i>"],
         ["View full history", "Todos en el tablero", "Abre el historial completo de ese dispositivo."]],
        [2.0 * inch, 1.6 * inch, W - 3.6 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("board-fleet",
                    "El tablero de la flota. Filtros en la parte superior; toque cualquier dispositivo para actuar.",
                    max_w=6.4 * inch, max_h=3.3 * inch))
    s.append(Spacer(1, 8))
    s.append(P(
        "Use los filtros sobre la cuadrícula para ver un solo estado. Al ver "
        "<b>Awaiting inspection</b>, los técnicos, líderes y administradores tienen un botón "
        "<b>Select multiple</b> para despachar un rack completo de dispositivos en buen estado "
        "de una vez (omite las preguntas y registra cada uno como en el cargador, inspeccionado "
        "y bueno)."))

    # ---------------- 9. Reportes ----------------
    s.append(section("9. Reportes", P(
        "<b>/reports</b> responde las preguntas de fin de turno.")))
    s.append(table(
        [["Panel", "Qué le indica"],
         ["Still checked out", "Cuántos dispositivos están fuera ahora mismo y cuántos están vencidos."],
         ["Total checkouts", "Conteo de uso acumulado."],
         ["Avg turnaround", "Tiempo promedio desde que un dispositivo se devuelve hasta que se inspecciona y vuelve al servicio."],
         ["Inspections", "Número total de inspecciones registradas."],
         ["Damage reports", "Cuántas veces se ha marcado un dispositivo como dañado."],
         ["End-of-shift sweep", "Una tabla de cada dispositivo que sigue fuera — quién lo tiene, desde cuándo, cuándo vence y si está vencido. <b>Resuelva esta lista antes de que termine el turno.</b>"],
         ["Most-used devices", "Las unidades más usadas — útil para rotar el desgaste y detectar baterías agotadas."]],
        [1.5 * inch, W - 1.5 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("reports", "La página de Reportes, incluido el barrido de fin de turno.",
                    max_w=6.0 * inch, max_h=4.0 * inch))

    # ---------------- 10. Avanzado ----------------
    s.append(section("10. Avanzado: cada ajuste de administración y qué hace", P(
        "El panel de administración está en <b>/admin</b>, abierto a administradores, "
        "supervisores y líderes. Si ya inició sesión en el tablero de la flota, no se necesita "
        "un segundo PIN. El encabezado tiene un interruptor de <b>modo claro/oscuro</b> y un "
        "enlace de regreso a la flota.")))
    s.append(callout(
        "Qué ve un líder aquí",
        "Un líder abre la misma página pero en modo de <b>solo lectura</b>: la lista "
        "<b>Device fleet</b> y el <b>registro de auditoría</b> (con su exportación CSV). "
        "Add a device, Workers y Advanced están ocultos, y los dispositivos no tienen botones "
        "Edit ni Remove. Por lo tanto, todo lo que sigue en esta sección es <b>solo para "
        "admin/supervisor</b>. Los líderes siguen realizando todas las acciones de piso desde "
        "el tablero de la flota y el quiosco.", BLUE))
    s.append(Spacer(1, 8))
    s.append(callout(
        "Qué ve un supervisor aquí",
        "Un supervisor gestiona los <b>dispositivos</b> (agregar, editar, eliminar, cambiar "
        "tipo), la <b>política de retiro</b>, el <b>logotipo del quiosco</b> y el <b>registro de "
        "auditoría</b>, y puede devolver al servicio los dispositivos dañados. <b>Workers</b> y "
        "la configuración de <b>Teams</b> están ocultos — son solo para administradores.", BLUE))
    s.append(Spacer(1, 10))
    s.append(figure("admin-lead",
                    "La página de administración como la ve un líder: la flota (solo lectura) y "
                    "el registro de auditoría — sin Add a device, Workers ni Advanced.",
                    max_w=6.2 * inch, max_h=3.6 * inch))

    s.append(P("Devices (Dispositivos)", "h2"))
    s.append(table(
        [["Ajuste", "Qué hace"],
         ["<b>Add a device</b>", "Agrega un escáner o radio nuevo por número. Entra como Available. Los números son únicos <i>por tipo</i>, así que Scanner #5 y Radio #5 pueden existir a la vez."],
         ["<b>Add a numbered range</b>", "Agrega de una vez todos los dispositivos desde el primer número hasta el último (p. ej. radios 21–40), omitiendo los que ya existen."],
         ["Lista <b>Device fleet</b>", "Cada dispositivo con su tipo y estado actual."],
         ["Buscar (dispositivos)", "Filtra la lista por número, tipo o estado (p. ej. “awaiting inspection”)."],
         ["<b>Edit</b> (por dispositivo)", "Cambia el número o el tipo de un dispositivo. Queda en el registro de auditoría."],
         ["<b>Remove</b> (por dispositivo)", "<b>Elimina permanentemente</b> el dispositivo y su historial. Pensado para un dispositivo agregado por error. Bloqueado mientras el dispositivo esté retirado. Para sacar de rotación un dispositivo real y <b>conservar</b> su historial, use <b>Retire</b> en el tablero."]],
        [1.55 * inch, W - 1.55 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("admin-devices", "Admin - Devices.", max_w=4.2 * inch, max_h=3.8 * inch))

    s.append(P("Workers (Empleados) &mdash; solo administradores", "h2"))
    s.append(table(
        [["Ajuste", "Qué hace"],
         ["<b>Add a worker</b>", "Crea un empleado: nombre, PIN (4–8 dígitos, debe ser único) y uno o más roles (OPERATOR, TECH, LEAD, SUPERVISOR, ADMIN)."],
         ["<b>Bulk upload (CSV)</b>", "Agrega muchos empleados a la vez desde un CSV con columnas <b>name,pin,roles</b> (roles separados por <b>;</b> — p. ej. OPERATOR;TECH). Las filas con PIN duplicado o inválido se omiten y se informan."],
         ["<b>Download sample CSV</b>", "Un archivo de ejemplo con el formato correcto para completar."],
         ["Lista <b>Employees</b>", "Todos los empleados, ordenados por rol: Admin, Supervisor, Lead, Operator, Tech."],
         ["Buscar (empleados)", "Filtra la lista por nombre o rol."],
         ["<b>Export employees (CSV)</b>", "Descarga nombre, roles y estado activo. Los PIN están cifrados y no se pueden exportar."],
         ["<b>Edit</b> (por empleado)", "Cambia su nombre, roles o asigna un PIN nuevo (deje el PIN en blanco para conservar el actual)."],
         ["<b>Deactivate</b> / Reactivate", "Revoca o restaura el acceso <b>conservando</b> el historial de la persona. Úselo cuando alguien se va."],
         ["<b>Remove</b> (por empleado)", "Elimina el registro del empleado por completo. Prefiera Deactivate para conservar la auditoría."]],
        [1.55 * inch, W - 1.55 * inch]))
    s.append(Spacer(1, 10))
    s.append(figure("admin-workers", "Admin - Workers.", max_w=4.2 * inch, max_h=3.8 * inch))

    s.append(P("Sección Advanced (contraída por defecto)", "h2"))
    s.append(P(
        "Haga clic en <b>Advanced</b> para expandirla. Son ajustes de configuración inicial — "
        "rara vez necesitará cambiarlos en el día a día."))
    s.append(P("<b>Microsoft Teams notifications</b> &mdash; solo administradores", "body"))
    s.append(table(
        [["Ajuste", "Qué hace"],
         ["<b>Webhook URL</b>", "Dónde se publican las alertas. Créelo en Teams: canal &gt; menú <b>“...”</b> &gt; <b>Workflows</b> → “Post to a channel when a webhook request is received”, y pegue la URL que genera (contiene <i>logic.azure.com</i>). Las URL del conector antiguo “Incoming Webhook” también funcionan."],
         ["<b>Enable Teams notifications</b>", "Interruptor general. No se envía nada mientras esté apagado."],
         ["Notificar: <b>dispositivo marcado dañado</b>", "Publica en el momento en que un técnico reporta un daño, para que un supervisor lo revise. <i>Activado por defecto.</i>"],
         ["Notificar: <b>dispositivo vencido</b>", "Pensado para el barrido de vencidos de fin de turno. Requiere una tarea programada que ejecute el barrido; la preferencia queda guardada y lista."],
         ["Notificar: <b>dispositivo retirado</b>", "Publica cada retiro, con la hora de devolución. <i>Desactivado por defecto.</i>"],
         ["Notificar: <b>dispositivo devuelto</b>", "Publica cada devolución. <i>Desactivado por defecto.</i>"],
         ["Notificar: <b>inspeccionado y devuelto al servicio</b>", "Publica cada inspección completada. <i>Desactivado por defecto.</i>"],
         ["<b>Save</b>", "Guarda los ajustes. Si las notificaciones están activadas, se requiere una URL https válida y al menos un tipo de alerta."],
         ["<b>Send test message</b>", "Publica una línea de prueba en el canal para confirmar la conexión antes de depender de ella. Los errores muestran exactamente lo que devolvió Teams."]],
        [1.8 * inch, W - 1.8 * inch]))
    s.append(Spacer(1, 8))
    s.append(figure("admin-advanced",
                    "Admin - Advanced, expandido: notificaciones de Teams, política de retiro, "
                    "logotipo del quiosco y zona horaria del sistema.", max_w=6.0 * inch, max_h=4.6 * inch))
    s.append(Spacer(1, 6))
    s.append(P(
        "<i>Las alertas por acción (retiro / devolución / inspección) resultan ruidosas en un "
        "piso ocupado — por eso empiezan desactivadas.</i>", "small"))

    s.append(Spacer(1, 10))
    s.append(P("<b>Checkout policy</b> (Política de retiro)", "body"))
    s.append(table(
        [["Ajuste", "Qué hace"],
         ["<b>Scanners — hours</b>", "Cuántas horas después del retiro debe devolverse un escáner. Por defecto 12. Entre 1 y 336 (dos semanas)."],
         ["<b>Radios — hours</b>", "Lo mismo para los radios. Por defecto 12. Auméntelo si, por ejemplo, los líderes conservan un radio durante varios turnos."],
         ["<b>Save</b>", "Aplica a cada retiro a partir de ahora. Los dispositivos que ya están fuera conservan la hora de devolución que se les asignó."]],
        [1.8 * inch, W - 1.8 * inch]))

    s.append(Spacer(1, 10))
    s.append(P("<b>Kiosk logo</b> (Logotipo del quiosco)", "body"))
    s.append(table(
        [["Ajuste", "Qué hace"],
         ["<b>Choose File</b>", "Sube el logotipo de su empresa, que se muestra en la esquina superior izquierda del quiosco. PNG, JPG o SVG de menos de 500 KB."],
         ["<b>Remove logo</b>", "Lo quita; el quiosco vuelve al ícono del dispositivo."]],
        [1.8 * inch, W - 1.8 * inch]))

    s.append(Spacer(1, 10))
    s.append(P("<b>System</b> (solo lectura)", "body"))
    s.append(table(
        [["Lectura", "Qué significa"],
         ["<b>Timezone</b>", "La zona horaria en que se muestran las horas registradas y los mensajes de Teams. Se define con la variable de entorno <b>TZ</b> en el servidor (p. ej. America/Chicago). Las horas de devolución son “N horas después del retiro”, así que no dependen de ella."],
         ["<b>Server time now</b>", "La hora actual del sistema en esa zona. Compárela con un reloj de pared para confirmar que el ajuste es correcto."]],
        [1.8 * inch, W - 1.8 * inch]))
    s.append(Spacer(1, 6))
    s.append(P(
        "<i>Las horas de devolución se muestran en la zona horaria del dispositivo que está "
        "mirando. Mantenga la tableta del quiosco en la zona horaria del almacén para que lo que "
        "ve el piso coincida con lo que registró el servidor.</i>", "small"))

    s.append(Spacer(1, 10))
    s.append(P("<b>Recent activity</b> (registro de auditoría)", "body"))
    s.append(table(
        [["Ajuste", "Qué hace"],
         ["Tabla de actividad", "Las acciones más recientes: cuándo, qué dispositivo, qué ocurrió, quién lo hizo y cualquier nota (incluidas las respuestas de la inspección)."],
         ["<b>Export full log (CSV)</b>", "Descarga el historial de auditoría <b>completo</b> — para una investigación de pérdida, una disputa por daños o una auditoría periódica de activos. Los registros nunca se editan ni se eliminan."]],
        [1.8 * inch, W - 1.8 * inch]))

    # ---------------- 11. Solución de problemas ----------------
    s.append(P("11. Solución de problemas", "h1"))
    s.append(table(
        [["Síntoma", "Causa y solución"],
         ["“PIN not recognized.”", "PIN incorrecto, o el empleado está desactivado. Un administrador puede asignar un PIN nuevo en Admin → Workers."],
         ["“This action requires the TECH role.”", "El PIN ingresado no tiene el rol que necesita esa acción — p. ej. un operador intentando inspeccionar. Use el PIN de la persona correcta, o pida a un administrador que agregue el rol."],
         ["El dispositivo lo retiró otra persona", "Solo quien tiene el dispositivo (o un administrador) puede devolverlo. Un administrador puede devolverlo en el tablero de la flota."],
         ["No se puede retirar un dispositivo", "No está Available — está pendiente de inspección, dañado o retirado. Guíese por el color del anillo."],
         ["Un dispositivo aparece vencido demasiado pronto / tarde", "La ventana de retiro no coincide con sus turnos. Ajústela en Admin → Advanced → Checkout policy."],
         ["Las horas registradas están desfasadas por horas", "La zona horaria del servidor está mal. Revise Admin → Advanced → System y defina la variable de entorno <b>TZ</b>."],
         ["“Scanner #5 already exists” al agregar o cambiar tipo", "Los números son únicos por tipo. Elija un número libre o renumere primero el dispositivo existente."],
         ["La prueba de Teams dice HTTP 405", "La URL pegada no es un webhook (normalmente es un enlace al canal). Cree un webhook de Workflows como se describe en la sección 10."],
         ["Teams dice que no se publicó nada", "Verifique que <b>Enable Teams notifications</b> esté activado y que al menos un tipo de alerta esté marcado; luego use <b>Send test message</b>."],
         ["El quiosco muestra información vieja", "El tablero se actualiza solo cada pocos segundos; si parece atascado, recargue la página en la tableta."]],
        [1.9 * inch, W - 1.9 * inch]))

    s.append(Spacer(1, 16))
    s.append(callout(
        "Ritmo del turno — la versión corta",
        "Los operadores retiran los dispositivos en el quiosco al inicio del turno y los "
        "devuelven en el rack al final. El técnico de equipo inspecciona y pone a cargar todo "
        "lo naranja. Antes de que termine el turno, un supervisor abre <b>Reports → End-of-shift "
        "sweep</b> y localiza lo que siga fuera. Los dispositivos dañados esperan a un supervisor.", BLUE))

    doc.build(s)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
