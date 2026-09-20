// ---------------------------------------------------------------
// El astronauta que vive en la pagina.
//
// No son animaciones sueltas de CSS: aqui hay un bucle que corre a la
// velocidad de la pantalla y calcula su posicion cuadro a cuadro, con
// gravedad, impulso y rebote. Por eso los saltos tienen peso, la
// caminata desacelera al llegar y el cuerpo se aplasta al aterrizar.
//
// Arriba de esa fisica hay una cabeza: decide sola que hacer (pasear,
// saltar, esconderse detras del borde, espiar, senalar la seccion que
// la persona esta leyendo) y reacciona al scroll y a los clics.
//
// Se apaga sola cuando la pestana no se ve, para no gastar bateria.
// ---------------------------------------------------------------

(function () {
    var mascota = document.getElementById('mascota');
    if (!mascota) return;

    var figura = mascota.querySelector('.mascota-figura');
    var brazo  = mascota.querySelector('.astro-brazo');
    var globo  = mascota.querySelector('.mascota-globo');
    var sombra = mascota.querySelector('.mascota-sombra');
    var cerrar = mascota.querySelector('.mascota-cerrar');
    var APAGADA = 'lunaro-mascota-off';

    try {
        if (localStorage.getItem(APAGADA) === '1') { mascota.remove(); return; }
    } catch (e) {}

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mascota.remove();
        return;
    }

    // ----------------------------------------------------------------
    // Estado fisico
    // ----------------------------------------------------------------
    var GRAVEDAD   = 2600;   // px por segundo al cuadrado
    var PASEO      = 95;     // caminando
    var CARRERA    = 330;    // corriendo
    var SUELO      = 20;     // cuanto lo separa del borde de abajo

    var an = mascota.offsetWidth || 112;
    var al = an * 404 / 289;

    var x  = window.innerWidth * 0.08;   // posicion horizontal
    var y  = 0;                          // altura sobre el suelo
    var vx = 0, vy = 0;
    var mira = 1;                        // 1 mira a la derecha, -1 a la izquierda
    var enSuelo = true;

    var aplaste = 0;      // 0 = normal; sube al aterrizar y se va solo
    var inclina = 0;      // el cuerpo se inclina hacia donde va
    var pasoReloj = 0;    // para el vaiven de la caminata
    var brazoAng = 0;     // angulo del brazo, se interpola suave
    var brazoMeta = 0;

    var destino = null;   // a donde quiere llegar
    var alLlegar = null;
    var accion = 'quieto';
    var hastaCuando = 0;
    var escondido = false;

    // ----------------------------------------------------------------
    // Lo que dice
    // ----------------------------------------------------------------
    var GUION = [
        { id: 'portafolio', texto: '¡Hola! 👋 Soy el guía de LUNARO' },
        { id: 'servicios',  texto: 'Esto es lo que hago por tu negocio' },
        { id: 'planes',     texto: '👇 Acá están los precios: desde S/300' },
        { id: 'beneficios', texto: 'Todo esto va incluido, sin letra chica' },
        { id: 'sobre-mi',   texto: 'Él es Gian, el que diseña tu web' },
        { id: 'faq',        texto: '¿Dudas? Acá resuelvo las más comunes' },
        { id: 'contacto',   texto: 'Escríbele y te dice qué plan te conviene 💬' }
    ];

    var COSQUILLAS = [
        '¡Ey! 😄',
        'Acá no hay gravedad 🚀',
        '¿Bajamos a ver los precios?',
        '¡Wiiii!',
        'Sigue mirando, hay más 👀'
    ];

    var dichas = {};
    var tCallar = null;

    function alAzar(l) { return l[Math.floor(Math.random() * l.length)]; }

    function decir(texto, cuanto) {
        globo.textContent = texto;
        mascota.classList.add('habla');
        clearTimeout(tCallar);
        tCallar = setTimeout(function () { mascota.classList.remove('habla'); }, cuanto || 4200);
    }

    // ----------------------------------------------------------------
    // Ordenes basicas
    // ----------------------------------------------------------------
    function irA(destinoX, corriendo, despues) {
        destino = Math.max(-an * 0.6, Math.min(window.innerWidth - an * 0.4, destinoX));
        alLlegar = despues || null;
        accion = corriendo ? 'corre' : 'camina';
    }

    function saltar(fuerza) {
        if (!enSuelo) return;
        vy = -(fuerza || 1000);
        enSuelo = false;
    }

    function esperar(segundos, despues) {
        accion = 'quieto';
        destino = null;
        hastaCuando = performance.now() + segundos * 1000;
        alLlegar = despues || null;
    }

    // ----------------------------------------------------------------
    // La cabeza: que hacer cuando termina lo anterior
    // ----------------------------------------------------------------
    function decidir() {
        if (escondido) return;

        var dado = Math.random();

        if (dado < 0.3) {
            // Pasear a otro punto de la pantalla.
            irA(Math.random() * (window.innerWidth - an), false, function () { esperar(1 + Math.random() * 2, decidir); });

        } else if (dado < 0.48) {
            // Un par de saltos en el sitio.
            saltar(1000);
            setTimeout(function () { saltar(880); }, 620);
            esperar(1.9, decidir);

        } else if (dado < 0.63) {
            // Correr de un lado a otro, como jugando.
            var lejos = (x < window.innerWidth / 2) ? window.innerWidth - an * 1.4 : an * 0.4;
            irA(lejos, true, function () { saltar(1050); esperar(1.4, decidir); });

        } else if (dado < 0.78) {
            // Esconderse detras del borde y espiar antes de volver.
            esconderse();

        } else {
            // Quedarse quieto flotando un rato.
            esperar(2 + Math.random() * 2.5, decidir);
        }
    }

    function esconderse() {
        var borde = (x < window.innerWidth / 2) ? -an * 1.1 : window.innerWidth + an * 0.1;
        escondido = true;
        irA(borde, true, function () {
            accion = 'quieto';
            destino = null;
            setTimeout(espiar, 900 + Math.random() * 1200);
        });
    }

    // Asoma solo un pedacito, mira, y se vuelve a meter o sale de golpe.
    function espiar() {
        var haciaAdentro = (x < 0) ? an * 0.45 : window.innerWidth - an * 1.45;
        irA(haciaAdentro, false, function () {
            esperar(0.9, function () {
                if (Math.random() < 0.5) {
                    // Sale disparado y salta: "aqui estoy".
                    escondido = false;
                    irA(window.innerWidth * (0.2 + Math.random() * 0.5), true, function () {
                        saltar(1150);
                        decir(alAzar(COSQUILLAS), 2000);
                        esperar(1.6, decidir);
                    });
                } else {
                    // Se vuelve a meter: sigue el juego.
                    var borde = (x < window.innerWidth / 2) ? -an * 1.1 : window.innerWidth + an * 0.1;
                    irA(borde, true, function () { setTimeout(espiar, 800 + Math.random() * 1200); });
                }
            });
        });
    }

    // ----------------------------------------------------------------
    // Reaccionar al scroll: se agacha y despues va a senalar
    // ----------------------------------------------------------------
    var tQuieto = null;
    var agachado = false;

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

    window.addEventListener('scroll', function () {
        agachado = true;
        escondido = false;
        accion = 'agacha';
        destino = null;
        alLlegar = null;
        mascota.classList.remove('habla');

        clearTimeout(tQuieto);
        tQuieto = setTimeout(function () {
            agachado = false;
            var paso = seccionActual();

            if (paso && !dichas[paso.id]) {
                dichas[paso.id] = true;
                // Corre hasta ponerse debajo de lo que va a senalar.
                var el = document.getElementById(paso.id);
                var r = el.getBoundingClientRect();
                var meta = Math.max(20, Math.min(window.innerWidth - an - 20, r.left + r.width * 0.25));
                irA(meta, true, function () {
                    accion = 'senala';
                    decir(paso.texto, 4600);
                    saltar(820);
                    esperar(4.6, decidir);
                });
            } else {
                decidir();
            }
        }, 420);
    }, { passive: true });

    // Un clic y salta hacia donde le dieron.
    figura.addEventListener('click', function (e) {
        saltar(1150);
        decir(alAzar(COSQUILLAS), 1900);
        mira = (e.clientX > x + an / 2) ? 1 : -1;
        esperar(1.5, decidir);
    });

    if (cerrar) cerrar.addEventListener('click', function () {
        mascota.remove();
        corriendo = false;
        try { localStorage.setItem(APAGADA, '1'); } catch (e) {}
    });

    window.addEventListener('resize', function () {
        an = mascota.offsetWidth || an;
        al = an * 404 / 289;
        x = Math.min(x, window.innerWidth - an);
    });

    // ----------------------------------------------------------------
    // El bucle: aqui pasa todo el movimiento
    // ----------------------------------------------------------------
    var anterior = performance.now();
    var corriendo = true;

    function cuadro(ahora) {
        if (!corriendo) return;

        var dt = Math.min((ahora - anterior) / 1000, 0.05);  // nunca mas de 50ms
        anterior = ahora;

        // --- que velocidad quiere llevar ---
        var objetivo = 0;

        if (accion === 'camina' || accion === 'corre') {
            var falta = destino - x;
            var tope = (accion === 'corre' ? CARRERA : PASEO);
            // Frena de a poco en los ultimos 90px: asi no llega de golpe.
            var freno = Math.min(1, Math.abs(falta) / 90);
            objetivo = Math.sign(falta) * tope * Math.max(0.25, freno);

            if (Math.abs(falta) < 4) {
                x = destino;
                objetivo = 0;
                accion = 'quieto';
                destino = null;
                var f = alLlegar; alLlegar = null;
                if (f) f();
            }
        } else if (accion === 'quieto' || accion === 'senala' || accion === 'agacha') {
            objetivo = 0;
            if (hastaCuando && ahora > hastaCuando) {
                hastaCuando = 0;
                var g = alLlegar; alLlegar = null;
                if (g) g();
            }
        }

        // La velocidad se acerca a la deseada, no salta de golpe: eso es
        // lo que da la sensacion de peso.
        vx += (objetivo - vx) * Math.min(1, dt * 9);
        x += vx * dt;

        if (Math.abs(vx) > 6) mira = vx > 0 ? 1 : -1;

        // --- gravedad ---
        vy += GRAVEDAD * dt;
        y -= vy * dt;                      // y es altura sobre el suelo

        if (y <= 0) {
            if (!enSuelo && vy > 400) {
                aplaste = Math.min(1, vy / 1400);   // cuanto mas fuerte cae, mas se aplasta
            }
            y = 0; vy = 0; enSuelo = true;
        }

        aplaste += (0 - aplaste) * Math.min(1, dt * 7);

        // --- el vaiven de la caminata ---
        var rapidez = Math.abs(vx);
        if (enSuelo && rapidez > 10) {
            pasoReloj += dt * (4 + rapidez / 45);
        }
        var boteo = (enSuelo && rapidez > 10) ? Math.abs(Math.sin(pasoReloj)) * (2 + rapidez / 45) : 0;

        // Flota apenas cuando esta parado: nunca esta del todo quieto.
        var flote = (enSuelo && rapidez < 10) ? Math.sin(ahora / 620) * 4 : 0;

        // Se inclina hacia donde corre, y hacia atras al caer.
        var inclinaMeta = (-vx / CARRERA) * 11 + (enSuelo ? 0 : Math.max(-6, Math.min(6, vy / 260)));
        inclina += (inclinaMeta - inclina) * Math.min(1, dt * 8);

        // --- el brazo ---
        if (accion === 'senala') {
            brazoMeta = -30 + Math.sin(ahora / 220) * 5;     // senalando, con golpecito
        } else if (!enSuelo) {
            brazoMeta = -52;                                  // brazo arriba al saltar
        } else if (rapidez > 10) {
            brazoMeta = Math.sin(pasoReloj) * 22;             // braceo al caminar
        } else {
            brazoMeta = Math.sin(ahora / 260) * 13 - 6;       // saluda flojito
        }
        brazoAng += (brazoMeta - brazoAng) * Math.min(1, dt * 12);

        // --- pintar ---
        var arriba = window.innerHeight - al - SUELO - y - boteo - flote;
        var agachaY = agachado ? al * 1.25 : 0;

        mascota.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + (arriba + agachaY).toFixed(1) + 'px,0)';
        mascota.style.opacity = agachado ? '0' : '1';

        var escX = (1 + aplaste * 0.22) * mira;
        var escY = 1 - aplaste * 0.24;
        figura.style.transform = 'scale(' + escX.toFixed(3) + ',' + escY.toFixed(3) + ') rotate(' + inclina.toFixed(2) + 'deg)';
        brazo.style.transform  = 'rotate(' + brazoAng.toFixed(2) + 'deg)';

        // La sombra se queda en el piso: se le devuelve el alto que la
        // caja acaba de subir, y se achica segun lo lejos que esta.
        var altura = Math.min(1, y / 130);
        sombra.style.transform = 'translate(-50%,' + (y + boteo + flote).toFixed(1) + 'px) scale(' +
            (1 - altura * 0.5).toFixed(3) + ',' + (1 - altura * 0.35).toFixed(3) + ')';
        sombra.style.opacity = (0.5 - altura * 0.34).toFixed(3);

        requestAnimationFrame(cuadro);
    }

    // Si la pestana se va al fondo, el bucle se detiene: no tiene sentido
    // gastar bateria animando algo que nadie esta viendo.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            corriendo = false;
        } else if (!corriendo) {
            corriendo = true;
            anterior = performance.now();
            requestAnimationFrame(cuadro);
        }
    });

    requestAnimationFrame(cuadro);

    // Entra en escena y se presenta.
    setTimeout(function () {
        var paso = GUION[0];
        dichas[paso.id] = true;
        irA(window.innerWidth * 0.18, false, function () {
            saltar(950);
            decir(paso.texto, 4200);
            esperar(3.4, decidir);
        });
    }, 1400);
})();
