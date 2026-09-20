// ---------------------------------------------------------------
// El astronauta que vive dentro de la pagina.
//
// Tres capas, de abajo hacia arriba:
//
// 1. FISICA. Un bucle a la velocidad de la pantalla con gravedad,
//    impulso y rozamiento. Los saltos pesan y las carreras arrancan y
//    frenan solas.
//
// 2. ESQUELETO. El dibujo esta partido en piezas con bisagras (dos por
//    brazo, dos por pierna, mas cabeza y tronco). Cada pose es una
//    tabla de angulos, y los angulos actuales persiguen a los de la
//    pose: por eso pasar de caminar a saltar no da un tiron, se
//    encadena. Caminar y correr son ciclos de seno, no dibujos fijos,
//    asi que nunca se repiten identicos.
//
// 3. MUNDO. Cada tanto lee donde estan de verdad las tarjetas de
//    planes, las de servicios y la foto de Gian, y las usa como
//    plataformas (se sube encima) y como escondites (se mete detras y
//    asoma el casco). Para taparse usa un recorte, no un z-index: si
//    se pusiera por debajo, el fondo opaco de la seccion lo taparia
//    entero en vez de dejarlo asomar.
// ---------------------------------------------------------------

(function () {
    var mascota = document.getElementById('mascota');
    if (!mascota) return;

    var svg    = mascota.querySelector('.mascota-svg');
    var globo  = mascota.querySelector('.mascota-globo');
    var sombra = mascota.querySelector('.mascota-sombra');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mascota.remove();
        return;
    }

    var pieza = {};
    ['astroEscala', 'astroCuerpo', 'bT', 'bTi', 'bD', 'bDi', 'pT', 'pTi', 'pD', 'pDi', 'tronco', 'cab', 'cartelGiro']
        .forEach(function (id) { pieza[id] = document.getElementById(id); });

    // Donde esta cada bisagra dentro del dibujo (el suelo es y = 0).
    var BISAGRA = {
        bT: [-27, -118], bTi: [0, 25],
        bD: [ 27, -118], bDi: [0, 25],
        pT: [-15, -74],  pTi: [0, 27],
        pD: [ 15, -74],  pDi: [0, 27],
        tronco: [0, 0],  cab: [0, -130]
    };

    // ----------------------------------------------------------------
    // 1. FISICA
    // ----------------------------------------------------------------
    var GRAVEDAD = 2700;
    var PASEO    = 105;
    var CARRERA  = 340;
    var MARGEN   = 14;       // lo que lo separa del borde de abajo

    var an = mascota.offsetWidth || 104;
    var al = an * 218 / 160;

    var x = window.innerWidth * 0.1, y = 0;      // y = altura sobre su suelo
    var vx = 0, vy = 0;
    var mira = 1, enSuelo = true;
    var sueloY = 0;                              // 0 = piso de la pantalla
    var plataforma = null;

    var aplaste = 0, pasoReloj = 0;
    var giro = 0, giroVel = 0, rodando = 0;   // volteretas y rodada de ninja

    // ----------------------------------------------------------------
    // 2. ESQUELETO
    // ----------------------------------------------------------------
    // Angulos en grados. 0 = miembro colgando hacia abajo.
    // Negativo = hacia adelante (hacia donde mira).
    var ang  = { bT: 0, bTi: 0, bD: 0, bDi: 0, pT: 0, pTi: 0, pD: 0, pDi: 0, tronco: 0, cab: 0 };
    var meta = {};
    for (var k in ang) meta[k] = 0;

    var alturaCuerpo = 0;     // para agacharse
    var alturaMeta = 0;

    function poner(o) { for (var p in o) meta[p] = o[p]; }

    // --- las poses ---
    var POSE = {
        // Parado: respira, se balancea apenas, mira alrededor.
        quieto: function (t) {
            var r = Math.sin(t * 1.6);
            poner({
                bT: 6 + r * 4, bTi: 8 + r * 3,
                bD: -6 - r * 4, bDi: 10 + r * 3,
                pT: 2, pTi: 2, pD: -2, pDi: 2,
                tronco: r * 1.5, cab: -r * 3
            });
            alturaMeta = 0;
        },

        // Caminar: un ciclo de seno, con la rodilla que solo dobla hacia atras.
        camina: function (t) {
            var c = Math.cos(pasoReloj), s = Math.sin(pasoReloj);
            poner({
                pD: -22 * s, pDi: Math.max(0, 34 * Math.sin(pasoReloj + 1.1)),
                pT:  22 * s, pTi: Math.max(0, 34 * Math.sin(pasoReloj + 1.1 + Math.PI)),
                bD:  20 * s, bDi: 12 + Math.max(0, 14 * s),
                bT: -20 * s, bTi: 12 + Math.max(0, -14 * s),
                tronco: -2 + c * 1.5, cab: -c * 2
            });
            alturaMeta = 0;
        },

        // Correr: zancada larga, cuerpo volcado adelante, brazos cerrados.
        corre: function (t) {
            var s = Math.sin(pasoReloj), c = Math.cos(pasoReloj);
            poner({
                pD: -46 * s, pDi: 20 + Math.max(0, 72 * Math.sin(pasoReloj + 1.3)),
                pT:  46 * s, pTi: 20 + Math.max(0, 72 * Math.sin(pasoReloj + 1.3 + Math.PI)),
                bD:  48 * s - 12, bDi: 78,
                bT: -48 * s - 12, bTi: 78,
                tronco: -11 + c, cab: 6 - c * 2
            });
            alturaMeta = -3;
        },

        // Subiendo: se encoge, como quien acaba de impulsarse.
        sube: function () {
            poner({
                pD: -34, pDi: 62, pT: -12, pTi: 38,
                bD: -128, bDi: -22, bT: -140, bTi: -18,
                tronco: -4, cab: -6
            });
            alturaMeta = 0;
        },

        // Cayendo: abre las piernas y sube los brazos, buscando el piso.
        cae: function () {
            poner({
                pD: -26, pDi: 26, pT: 22, pTi: 30,
                bD: -150, bDi: 14, bT: -158, bTi: 10,
                tronco: 5, cab: 8
            });
            alturaMeta = 0;
        },

        // Agachado detras de algo, espiando por encima del borde.
        espia: function (t) {
            var r = Math.sin(t * 3);
            poner({
                pD: -62, pDi: 96, pT: -58, pTi: 96,
                bD: 26, bDi: 30, bT: 22, bTi: 30,
                tronco: 9, cab: -4 + r * 5
            });
            alturaMeta = 30;
        },

        // Senalando: brazo estirado hacia adelante con su golpecito.
        senala: function (t) {
            var r = Math.sin(t * 5);
            poner({
                pD: -4, pDi: 3, pT: 4, pTi: 3,
                bD: -104 + r * 7, bDi: -4, bT: 12, bTi: 14,
                tronco: -3, cab: -8 + r * 2
            });
            alturaMeta = 0;
        },

        // Saludando con el brazo en alto.
        saluda: function (t) {
            var r = Math.sin(t * 7);
            poner({
                pD: -4, pDi: 3, pT: 4, pTi: 3,
                bD: -152, bDi: -28 + r * 26, bT: 14, bTi: 14,
                tronco: -2, cab: -4
            });
            alturaMeta = 0;
        },

        // Hecho un ovillo: para la voltereta y la rodada.
        rueda: function () {
            poner({
                pD: -78, pDi: 118, pT: -70, pTi: 118,
                bD: 44, bDi: 96, bT: 40, bTi: 96,
                tronco: 0, cab: 14
            });
            alturaMeta = 26;
        },

        // Sosteniendo el cartel en alto con el brazo del frente.
        cartel: function (t) {
            var r = Math.sin(t * 3);
            poner({
                pD: -5, pDi: 4, pT: 5, pTi: 4,
                bD: -168 + r * 3, bDi: -6, bT: 26, bTi: 22,
                tronco: -2 + r, cab: -6
            });
            alturaMeta = 0;
        },

        // Festejo: los dos brazos arriba y un mecido de caderas.
        festeja: function (t) {
            var r = Math.sin(t * 6);
            poner({
                pD: -8 + r * 6, pDi: 6, pT: 8 - r * 6, pTi: 6,
                bD: -158 + r * 10, bDi: -20, bT: -158 - r * 10, bTi: -20,
                tronco: r * 5, cab: -r * 6
            });
            alturaMeta = 0;
        }
    };

    var pose = 'quieto';

    // ----------------------------------------------------------------
    // 3. EL MUNDO: plataformas y escondites de verdad
    // ----------------------------------------------------------------
    // Todo lo que sirve de escalon: titulares, tarjetas, botones, la foto.
    var SITIOS = 'h2, .plan-card, .service-card, .faq-item, .about-avatar-circle, ' +
                 '.cta-btn, .plan-btn, .section-header p, .hero-lead';
    var mundo = [];
    var mundoViejo = 0;

    function leerMundo(ahora, yaMismo) {
        if (!yaMismo && ahora - mundoViejo < 120) return;
        mundoViejo = ahora;
        mundo = [];
        var alto = window.innerHeight;
        var lista = document.querySelectorAll(SITIOS);
        for (var i = 0; i < lista.length; i++) {
            var el = lista[i];
            var r = el.getBoundingClientRect();
            if (r.width < 90 || r.bottom < 0 || r.top > alto) continue;
            mundo.push({ el: el, x1: r.left, x2: r.right, arriba: r.top, abajo: r.bottom });
        }
    }

    // Donde esta ahora el escalon en el que esta parado (al hacer scroll
    // se mueve, y el astronauta se mueve con el: eso es bajar en escalon).
    function techoDe(p) {
        var r = p.el.getBoundingClientRect();
        p.x1 = r.left; p.x2 = r.right; p.arriba = r.top; p.abajo = r.bottom;
        return r.top;
    }

    // Se recorta la parte que quedaria tapada por el mueble: asi parece
    // que esta detras, sin pelearse con el orden de capas de la pagina.
    var recorteMeta = 0, recorte = 0;

    function pintarRecorte(cajaArriba) {
        if (recorte < 0.5) { svg.style.clipPath = ''; return; }
        // recorte = cuantos px de abajo hacia arriba quedan tapados
        svg.style.clipPath = 'inset(0 -40% ' + recorte.toFixed(0) + 'px -40%)';
    }

    // ----------------------------------------------------------------
    // Guion y frases
    // ----------------------------------------------------------------
    var GUION = [
        { id: 'portafolio', texto: '¡Hola! 👋 Soy el guía de LUNARO' },
        { id: 'servicios',  texto: 'Esto es lo que hago por tu negocio' },
        { id: 'planes',     texto: '👉 Acá están los precios: desde S/300' },
        { id: 'beneficios', texto: 'Todo esto va incluido, sin letra chica' },
        { id: 'sobre-mi',   texto: 'Él es Gian, el que diseña tu web' },
        { id: 'faq',        texto: '¿Dudas? Acá resuelvo las más comunes' },
        { id: 'contacto',   texto: 'Escríbele y te dice qué plan te conviene 💬' }
    ];

    var COSQUILLAS = ['¡Ey! 😄', 'Acá no hay gravedad 🚀',
                      '¿Bajamos a ver los precios?', '¡Wiiii!', 'Sigue mirando, hay más 👀'];

    var dichas = {}, tCallar = null;

    function alAzar(l) { return l[Math.floor(Math.random() * l.length)]; }

    function decir(texto, cuanto) {
        globo.textContent = texto;
        mascota.classList.add('habla');
        clearTimeout(tCallar);
        tCallar = setTimeout(function () { mascota.classList.remove('habla'); }, cuanto || 4200);
    }

    // ----------------------------------------------------------------
    // Ordenes
    // ----------------------------------------------------------------
    var destino = null, alLlegar = null, hastaCuando = 0, accion = 'quieto';
    var gesto = null;   // lo que esta haciendo con el cuerpo, aparte de moverse

    function irA(hacia, corriendo, despues) {
        gesto = null;
        destino = Math.max(-an * 0.5, Math.min(window.innerWidth - an * 0.5, hacia));
        alLlegar = despues || null;
        accion = corriendo ? 'corre' : 'camina';
    }

    function saltar(fuerza) {
        if (!enSuelo) return;
        vy = -(fuerza || 1020);
        enSuelo = false;
        plataforma = null;
    }

    function esperar(seg, despues) {
        accion = 'quieto';
        destino = null;
        hastaCuando = performance.now() + seg * 1000;
        alLlegar = despues || null;
    }

    // ----------------------------------------------------------------
    // La cabeza: que hace cuando esta libre
    // ----------------------------------------------------------------
    // Saca el cartel, lo sostiene en alto y lo vuelve a guardar. Mira
    // siempre a la derecha mientras lo tiene: si se volteara, el texto
    // del cartel saldria al reves.
    function sacarCartel() {
        gesto = 'cartel';
        mira = 1;
        mascota.classList.add('cartel');
        esperar(3.2, function () {
            mascota.classList.remove('cartel');
            gesto = null;
            esperar(0.3, decidir);
        });
    }

    // Voltereta: salta y gira entero en el aire.
    function voltereta() {
        if (!enSuelo) { decidir(); return; }
        saltar(1180);
        giroVel = 760 * (mira > 0 ? 1 : -1);
        esperar(1.1, function () { giroVel = 0; esperar(0.25, decidir); });
    }

    function decidir() {
        var dado = Math.random();
        var sitio = mundo.length ? alAzar(mundo) : null;

        if (dado < 0.1) {
            // Sacar el cartel y mandar a escribirle a Gian.
            sacarCartel();

        } else if (dado < 0.24) {
            // Voltereta, a veces con carrerita antes.
            if (Math.random() < 0.5) {
                irA(Math.random() * (window.innerWidth - an), true, voltereta);
            } else voltereta();

        } else if (sitio && dado < 0.36) {
            // Treparse encima de una tarjeta y caminar por el borde.
            var entrada = (x < sitio.x1) ? sitio.x1 + 20 : sitio.x2 - an - 20;
            irA(entrada, true, function () {
                saltar(Math.min(1500, 700 + (window.innerHeight - sitio.arriba - MARGEN) * 2.2));
                esperar(0.7, function () {
                    if (plataforma) {
                        irA(sitio.x1 + Math.random() * Math.max(30, sitio.x2 - sitio.x1 - an), false, function () {
                            esperar(0.4, function () { saltar(720); esperar(0.6, decidir); });
                        });
                    } else decidir();
                });
            });

        } else if (sitio && dado < 0.74) {
            // Meterse detras de una tarjeta y asomar el casco.
            esconderseTras(sitio);

        } else if (dado < 0.92) {
            // Cruzar corriendo de lado a lado.
            var lejos = (x < window.innerWidth / 2) ? window.innerWidth - an * 1.3 : an * 0.3;
            irA(lejos, true, function () {
                if (Math.random() < 0.5) voltereta();
                else { saltar(1050); esperar(0.6, decidir); }
            });

        } else {
            // Pasear tranquilo, pero sin quedarse plantado.
            irA(Math.random() * (window.innerWidth - an), false, function () {
                esperar(0.4 + Math.random() * 0.5, decidir);
            });
        }
    }

    var escondite = null;

    function esconderseTras(sitio) {
        var centro = sitio.x1 + (sitio.x2 - sitio.x1) / 2 - an / 2;
        irA(centro, true, function () {
            escondite = sitio;
            gesto = 'espia';
            esperar(1.4, function () {
                decir(alAzar(['👀', '¡Acá estoy!', '¿Me ves?']), 1600);
                esperar(1.1, function () {
                    escondite = null;
                    gesto = null;
                    saltar(1100);
                    esperar(0.5, decidir);
                });
            });
        });
    }

    // ----------------------------------------------------------------
    // Reaccionar al scroll
    // ----------------------------------------------------------------
    var tQuieto = null;

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
        // Mientras la pagina baja, el no se esconde: sigue ahi, saltando
        // de escalon en escalon. Solo suelta lo que estaba haciendo.
        escondite = null;
        if (gesto === 'espia' || gesto === 'cartel') gesto = null;
        mascota.classList.remove('cartel');
        destino = null;
        alLlegar = null;

        clearTimeout(tQuieto);
        tQuieto = setTimeout(function () {
            var paso = seccionActual();
            if (paso && !dichas[paso.id]) {
                dichas[paso.id] = true;
                var el = document.getElementById(paso.id);
                var r = el.getBoundingClientRect();
                var meta2 = Math.max(16, Math.min(window.innerWidth - an - 16, r.left + r.width * 0.3));
                irA(meta2, true, function () {
                    gesto = 'senala';
                    decir(paso.texto, 4400);
                    esperar(3.4, decidir);
                });
            } else decidir();
        }, 260);
    }, { passive: true });

    var tabla = document.getElementById('cartel');
    if (tabla) tabla.addEventListener('click', function (e) {
        if (!mascota.classList.contains('cartel')) return;
        e.stopPropagation();
        window.open('https://wa.me/51935611505', '_blank', 'noopener');
    });

    svg.addEventListener('click', function (e) {
        escondite = null;
        mascota.classList.remove('cartel');
        saltar(1180);
        if (Math.random() < 0.45) giroVel = 760 * (mira > 0 ? 1 : -1);
        gesto = 'festeja';
        decir(alAzar(COSQUILLAS), 1900);
        mira = (e.clientX > x + an / 2) ? 1 : -1;
        esperar(1.5, function () { giroVel = 0; decidir(); });
    });


    window.addEventListener('resize', function () {
        an = mascota.offsetWidth || an;
        al = an * 218 / 160;
        x = Math.min(x, window.innerWidth - an);
        mundoViejo = 0;
    });

    // ----------------------------------------------------------------
    // El bucle
    // ----------------------------------------------------------------
    var anterior = performance.now(), corriendo = true;

    function cuadro(ahora) {
        if (!corriendo) return;
        var dt = Math.min((ahora - anterior) / 1000, 0.05);
        anterior = ahora;
        var t = ahora / 1000;

        leerMundo(ahora);

        // --- a donde quiere ir ---
        var objetivo = 0;
        if (accion === 'camina' || accion === 'corre') {
            var falta = destino - x;
            var tope = accion === 'corre' ? CARRERA : PASEO;
            objetivo = Math.sign(falta) * tope * Math.max(0.22, Math.min(1, Math.abs(falta) / 90));
            if (Math.abs(falta) < 4) {
                x = destino; objetivo = 0; accion = 'quieto'; destino = null;
                var f = alLlegar; alLlegar = null; if (f) f();
            }
        } else if (hastaCuando && ahora > hastaCuando) {
            hastaCuando = 0;
            var g = alLlegar; alLlegar = null; if (g) g();
        }

        vx += (objetivo - vx) * Math.min(1, dt * 9);
        x += vx * dt;
        if (Math.abs(vx) > 6) mira = vx > 0 ? 1 : -1;

        // --- gravedad ---
        var yAntes = y;
        vy += GRAVEDAD * dt;
        y -= vy * dt;

        // --- en que escalon esta parado ---
        // Mientras la pagina baja, el escalon sube y el se va con el.
        // Cuando el escalon se le escapa por arriba, cae al siguiente:
        // eso es bajar la pagina a saltos, sin desaparecer nunca.
        var pies = window.innerHeight - MARGEN;
        var centro = x + an / 2;

        if (plataforma) {
            var techo = techoDe(plataforma);
            if (techo < 24 || techo > pies - 6 ||
                centro < plataforma.x1 - 6 || centro > plataforma.x2 + 6) {
                plataforma = null;
            } else {
                sueloY = pies - techo;
            }
        }

        if (!plataforma && !escondite && vy > 0) {
            for (var i = 0; i < mundo.length; i++) {
                var m = mundo[i];
                if (m.arriba < 24 || m.arriba > pies - 40) continue;
                if (centro < m.x1 + 8 || centro > m.x2 - 8) continue;
                var altoP = pies - m.arriba;
                if (yAntes >= altoP - 2 && y <= altoP + 2) {   // cruzo el techo en este cuadro
                    plataforma = m;
                    sueloY = altoP;
                    break;
                }
            }
        }
        if (!plataforma) sueloY = 0;

        if (y <= sueloY) {
            if (!enSuelo) {
                if (vy > 420) aplaste = Math.min(1, vy / 1500);
                // Si viene cayendo fuerte y con carrera, rueda al tocar
                // el piso en vez de frenar en seco.
                if (vy > 1150 && Math.abs(vx) > 60) rodando = 0.42;
                giroVel = 0;
                giro = 0;
            }
            y = sueloY; vy = 0; enSuelo = true;
        } else if (y > sueloY + 2) {
            enSuelo = false;
        }
        aplaste += (0 - aplaste) * Math.min(1, dt * 7);

        // Volteretas y rodada: el giro se integra igual que la fisica.
        if (rodando > 0) {
            rodando -= dt;
            giro += 900 * (mira > 0 ? 1 : -1) * dt;
            if (rodando <= 0) { giro = 0; }
        } else if (!enSuelo) {
            giro += giroVel * dt;
        }

        // --- que pose toca ---
        var rapidez = Math.abs(vx);
        if (rodando > 0 || Math.abs(giroVel) > 1) pose = 'rueda';
        else if (gesto === 'espia') pose = 'espia';
        else if (gesto === 'cartel' && enSuelo) pose = 'cartel';
        else if (!enSuelo) pose = (gesto === 'festeja') ? 'festeja' : (vy < 0 ? 'sube' : 'cae');
        else if (rapidez > 170) pose = 'corre';
        else if (rapidez > 12) pose = 'camina';
        else if (gesto) pose = gesto;
        else pose = 'quieto';

        if (enSuelo && rapidez > 12) pasoReloj += dt * (3.2 + rapidez / 32);
        POSE[pose](t);

        // Los angulos persiguen a los de la pose: eso encadena los
        // movimientos en vez de cortarlos de golpe.
        var prisa = (pose === 'corre' || pose === 'camina') ? 26 : 12;
        for (var p in ang) ang[p] += (meta[p] - ang[p]) * Math.min(1, dt * prisa);
        alturaCuerpo += (alturaMeta - alturaCuerpo) * Math.min(1, dt * 10);

        // --- pintar el esqueleto ---
        for (var q in BISAGRA) {
            if (!pieza[q]) continue;
            var b = BISAGRA[q];
            pieza[q].setAttribute('transform',
                'translate(' + b[0] + ',' + b[1] + ') rotate(' + ang[q].toFixed(2) + ')');
        }

        // El cartel cuelga del antebrazo, asi que giraria con el y el
        // texto quedaria de cabeza. Se le devuelve el giro del brazo para
        // que la tabla quede siempre derecha, como quien la sostiene.
        if (pieza.cartelGiro) {
            pieza.cartelGiro.setAttribute('transform',
                'rotate(' + (-(ang.bD + ang.bDi)).toFixed(1) + ' 0 26)');
        }

        var flote = (enSuelo && rapidez < 12) ? Math.sin(t * 1.7) * 3 : 0;
        var boteo = (enSuelo && rapidez > 12) ? Math.abs(Math.sin(pasoReloj)) * (1.5 + rapidez / 60) : 0;

        pieza.astroCuerpo.setAttribute('transform',
            'translate(0,' + (alturaCuerpo - flote + boteo).toFixed(1) + ') ' +
            'rotate(' + giro.toFixed(1) + ' 0 -100)');
        pieza.astroEscala.setAttribute('transform',
            'scale(' + (mira * (1 + aplaste * 0.2)).toFixed(3) + ',' + (1 - aplaste * 0.22).toFixed(3) + ')');

        // --- pintar la caja ---
        var arriba = pies - al - y;

        // Escondido: baja hasta quedar detras del mueble y se recorta.
        if (escondite) {
            arriba = escondite.arriba - al * 0.42;
            recorteMeta = Math.max(0, (arriba + al) - escondite.arriba);
        } else {
            recorteMeta = 0;
        }
        recorte += (recorteMeta - recorte) * Math.min(1, dt * 9);
        pintarRecorte();

        mascota.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + arriba.toFixed(1) + 'px,0)';

        // --- la sombra se queda en el piso ---
        var altura = Math.min(1, (y - sueloY) / 130);
        sombra.style.opacity = (escondite ? 0 : 0.5 - altura * 0.34).toFixed(3);
        sombra.style.transform = 'translate(-50%,' + (y - sueloY).toFixed(1) + 'px) scale(' +
            (1 - altura * 0.5).toFixed(3) + ',' + (1 - altura * 0.35).toFixed(3) + ')';

        requestAnimationFrame(cuadro);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) corriendo = false;
        else if (!corriendo) { corriendo = true; anterior = performance.now(); requestAnimationFrame(cuadro); }
    });

    requestAnimationFrame(cuadro);

    setTimeout(function () {
        dichas.portafolio = true;
        irA(window.innerWidth * 0.16, false, function () {
            gesto = 'saluda';
            decir(GUION[0].texto, 4200);
            esperar(1.6, decidir);
        });
    }, 1300);
})();
