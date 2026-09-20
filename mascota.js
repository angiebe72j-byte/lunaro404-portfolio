// ---------------------------------------------------------------
// El astronauta que acompana al visitante mientras baja la pagina.
//
// Se esconde mientras la persona hace scroll (para no taparle nada) y
// asoma cuando se detiene, senalando la seccion en la que esta y
// diciendo una frase corta. Cada frase sale UNA sola vez por visita:
// una mascota que repite lo mismo cada dos segundos cansa y termina
// espantando al cliente, que es justo lo contrario de lo que se busca.
// ---------------------------------------------------------------

(function () {
    var mascota = document.getElementById('mascota');
    if (!mascota) return;

    var globo  = mascota.querySelector('.mascota-globo');
    var cerrar = mascota.querySelector('.mascota-cerrar');
    var APAGADA = 'lunaro-mascota-off';

    // Si el visitante ya la cerro antes, no vuelve a aparecer.
    try {
        if (localStorage.getItem(APAGADA) === '1') { mascota.remove(); return; }
    } catch (e) {}

    // Quien pidio menos animaciones en su sistema no deberia tener un
    // muneco saltando en pantalla.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mascota.remove();
        return;
    }

    // Lo que dice en cada parte de la pagina. El orden importa: gana la
    // seccion que este ocupando el centro de la pantalla.
    var GUION = [
        { id: 'portafolio', texto: '¡Hola! 👋 Soy el guía de LUNARO', pose: 'saluda' },
        { id: 'servicios',  texto: 'Esto es lo que hago por tu negocio', pose: 'senala' },
        { id: 'planes',     texto: '👉 Acá están los precios: desde S/300', pose: 'senala' },
        { id: 'beneficios', texto: 'Todo esto va incluido, sin letra chica', pose: 'senala' },
        { id: 'sobre-mi',   texto: 'Él es Gian, el que diseña tu web', pose: 'senala' },
        { id: 'faq',        texto: '¿Dudas? Acá están las más comunes', pose: 'senala' },
        { id: 'contacto',   texto: 'Escríbele y te dice qué plan te conviene 💬', pose: 'saluda' }
    ];

    var dichas = {};
    var temporizadorQuieto = null;
    var temporizadorEsconder = null;

    function esconder() {
        mascota.classList.remove('visible');
    }

    function asomar(paso) {
        globo.textContent = paso.texto;
        mascota.classList.remove('saluda', 'senala');
        mascota.classList.add(paso.pose, 'visible');

        clearTimeout(temporizadorEsconder);
        temporizadorEsconder = setTimeout(esconder, 5200);
    }

    // Devuelve la seccion que esta ocupando el centro de la pantalla.
    function seccionActual() {
        var medio = window.innerHeight / 2;
        for (var i = 0; i < GUION.length; i++) {
            var el = document.getElementById(GUION[i].id);
            if (!el) continue;
            var r = el.getBoundingClientRect();
            if (r.top <= medio && r.bottom >= medio) return GUION[i];
        }
        return null;
    }

    function alDetenerse() {
        var paso = seccionActual();
        if (!paso || dichas[paso.id]) return;
        dichas[paso.id] = true;
        asomar(paso);
    }

    window.addEventListener('scroll', function () {
        // Mientras se mueve la pagina, se aparta del camino.
        esconder();
        clearTimeout(temporizadorQuieto);
        temporizadorQuieto = setTimeout(alDetenerse, 420);
    }, { passive: true });

    // El boton de cerrar la apaga para siempre en ese navegador.
    if (cerrar) cerrar.addEventListener('click', function () {
        mascota.remove();
        try { localStorage.setItem(APAGADA, '1'); } catch (e) {}
    });

    // Al entrar, saluda solo cuando la persona ya vio un poco la pagina.
    setTimeout(alDetenerse, 2200);
})();
