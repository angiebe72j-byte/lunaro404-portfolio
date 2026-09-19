let facesData = [];

async function loadDataAndInit() {
    try {
        const response = await fetch('/api/faces');
        if (response.ok) {
            facesData = await response.json();
        } else {
            throw new Error("API no disponible");
        }
    } catch (error) {
        console.warn("Backend no disponible, cargando data.json local...");
        try {
            const localResponse = await fetch('./data.json');
            if (localResponse.ok) {
                facesData = await localResponse.json();
            }
        } catch (e) {
            console.error("Tampoco se pudo cargar data.json local");
        }
    }
    
    if (facesData && facesData.length > 0) {
        initRoulette();
    } else {
        document.getElementById('carousel-3d').innerHTML = '<div style="color:white; text-align:center; padding-top: 50px;">No hay proyectos. Agrega uno desde el panel de administración.</div>';
    }
}


// Version ligera para el carrusel: Cloudinary entrega el video ya comprimido
// y al ancho en que realmente se ve (~500px), en vez del archivo original de
// 80 MB. Se ve igual en pantalla, pero pesa una fraccion.
// Las tarjetas del carrusel son un avance, no el video completo: el carrusel
// gira solo cada 4 segundos, asi que nadie llega a ver mas de unos segundos de
// cada una. Se piden a Cloudinary recortadas a 8 segundos y a 480px de ancho
// (du_8): pasan de 2,6 MB a unos 220 KB cada una. El video entero, en calidad
// buena, se sirve al abrir el modal.
function versionLigera(url) {
    if (!url || url.indexOf('/video/upload/') === -1) return url;
    if (/\/upload\/(f_auto|f_mp4|q_auto|w_)/.test(url)) return url;
    return url.replace('/video/upload/', '/video/upload/f_auto,q_auto:eco,w_480,c_limit,du_8/');
}

// Imagen fija del segundo 2 del video. Las tarjetas la muestran mientras el
// video no se reproduce: pesa unos 30 KB en vez de 2 MB. Sin esto, el carrusel
// gira solo cada 4 segundos y en medio minuto habia descargado los 8 videos
// enteros (11 MB) aunque el visitante solo estuviera leyendo la portada.
function versionPoster(url) {
    if (!url || url.indexOf('/video/upload/') === -1) return '';
    return url
        .replace('/video/upload/', '/video/upload/so_2,w_600,c_limit,q_auto/')
        .replace(/\.(mp4|webm|mov|m4v)(\?.*)?$/i, '.jpg');
}

// Version para el modal (pantalla completa). Se fuerza MP4 a 1280px por tres
// motivos:
//   1. Peso: los originales pesan hasta 80 MB y tardaban una eternidad.
//   2. Adelantar: los .webm grabados en el navegador no traen indice de
//      busqueda, asi que la barra de progreso no dejaba saltar a otro momento.
//   3. iPhone: Safari no reproduce webm/VP9, por eso esos videos se veian en
//      negro (parecia que habian "desaparecido").
// Cloudinary convierte una sola vez y luego lo sirve desde su cache.
function versionModal(url) {
    if (!url || url.indexOf('/video/upload/') === -1) return url;
    if (/\/upload\/(f_mp4|f_auto)/.test(url)) return url;
    return url.replace('/video/upload/', '/video/upload/f_mp4,vc_auto,q_auto,w_1280,c_limit/');
}

function initRoulette() {
    const carousel = document.getElementById('carousel-3d');
    const positioner = document.getElementById('carousel-pos');
    const dotsContainer = document.getElementById('carousel-dots');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    const numberOfFaces = facesData.length;
    const theta = 360 / numberOfFaces; 
    
    // Calculate radius based on new landscape width (540px)
    const radius = Math.round( (540 / 2) / Math.tan(Math.PI / numberOfFaces) ) + 60; 
    positioner.style.transform = `translateZ(-${radius}px)`;

    let currentRotation = 0;
    let activeIndex = 0;

    // Build faces and dots
    facesData.forEach((data, index) => {
        // Face
        const cell = document.createElement('div');
        cell.className = 'carousel__cell';
        const rotateY = index * theta;
        cell.style.transform = `rotateY(${rotateY}deg) translateZ(${radius}px)`;
        cell.style.backgroundColor = data.bgColor; // Set background color on the card itself
        
        let mediaHtml = '';
        if (data.iframeUrl) {
            // Renderizar la página exactamente como en un monitor Full HD (1920x1080)
            // Escala para entrar en 500px: 500 / 1920 = 0.2604
            mediaHtml = `
                <div style="width: 100%; aspect-ratio: 16/9; overflow: hidden; border-radius: 16px; position: relative; background: #000;">
                    <iframe src="${data.iframeUrl}" style="width: 1920px; height: 1080px; transform: scale(0.2604); transform-origin: top left; border: none; pointer-events: none; position: absolute; top: 0; left: 0;" tabindex="-1"></iframe>
                </div>
            `;
        } else if (data.videoUrl) {
            mediaHtml = `
                <div style="width: 100%; aspect-ratio: 16/9; overflow: hidden; border-radius: 16px; position: relative; background: ${data.bgColor}; cursor: pointer;" onclick="openVideoModal('${data.videoUrl}')">
                    <video class="cell-video" preload="none" poster="${versionPoster(data.videoUrl)}" src="${versionLigera(data.videoUrl)}" data-original="${data.videoUrl}" onerror="if(this.src!==this.dataset.original){this.src=this.dataset.original;}" style="width: 100%; height: 100%; object-fit: cover;" loop muted playsinline></video>
                    <div style="position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; background: rgba(0,0,0,0.1); transition: background 0.3s;" onmouseover="this.style.background='rgba(0,0,0,0.4)'" onmouseout="this.style.background='rgba(0,0,0,0.1)'">
                        <svg viewBox="0 0 24 24" fill="white" style="width: 50px; height: 50px; opacity: 0.8; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            `;
        } else {
            mediaHtml = `<img src="${data.image}" class="cell-img" style="aspect-ratio: 16/9;" alt="${data.title}">`;
        }
        
        cell.innerHTML = `
            ${mediaHtml}
            <div class="cell-info">
                <div class="cell-title">${data.title}</div>
                <div class="cell-artist">${data.artist}</div>
                <div class="cell-footer">
                    <div class="cell-stats">
                        ${String(data.tech || data.shazams || '')
                            .split(/\s*[·,|]\s*/)
                            .filter(Boolean)
                            .map(t => `<span class="tech-chip">${t}</span>`)
                            .join('')}
                    </div>
                    <button class="share-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                    </button>
                </div>
            </div>
        `;
        carousel.appendChild(cell);

        // Si el video no es panorámico (cuadrado, vertical, etc.), mostrarlo
        // completo en vez de recortarlo para llenar el marco 16:9
        const cellVideo = cell.querySelector('.cell-video');
        if (cellVideo) {
            cellVideo.addEventListener('loadedmetadata', () => {
                const aspect = cellVideo.videoWidth / cellVideo.videoHeight;
                if (aspect < 1.55) { // 16/9 ≈ 1.78; por debajo de eso ya no es panorámico
                    cellVideo.style.objectFit = 'contain';
                }
            });
        }

        // Dot
        const dot = document.createElement('div');
        dot.className = 'dot';
        if (index === 0) dot.classList.add('active');
        dot.addEventListener('click', () => {
            let diff = index - activeIndex;
            // Go the shortest path (optional, simple logic here)
            if (diff > numberOfFaces/2) diff -= numberOfFaces;
            if (diff < -numberOfFaces/2) diff += numberOfFaces;
            
            rotateCarousel(diff);
        });
        dotsContainer.appendChild(dot);
    });

    function updateDots() {
        const dots = document.querySelectorAll('.dot');
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === activeIndex);
        });
    }

    function updateBackground() {
        const activeColor = facesData[activeIndex].bgColor;
        document.body.style.setProperty('--dynamic-bg', activeColor);
    }

    function updateCardsVisuals() {
        const cells = document.querySelectorAll('.carousel__cell');
        cells.forEach((cell, idx) => {
            // Find distance from the active index
            let diff = idx - activeIndex;
            if (diff > numberOfFaces/2) diff -= numberOfFaces;
            if (diff < -numberOfFaces/2) diff += numberOfFaces;
            
            const distance = Math.abs(diff);
            const video = cell.querySelector('video');
            
            cell.classList.toggle('is-active', distance === 0);

            if (distance === 0) {
                // Center, active card (Perfectly clear, full color)
                cell.style.filter = 'blur(0px) brightness(1) saturate(1)';
                // Restart video when active. Con preload="none" el archivo aun
                // no existe en memoria: mover currentTime antes de tiempo falla,
                // asi que solo se reinicia si ya hay algo cargado.
                if (video) {
                    if (video.readyState > 0) video.currentTime = 0;
                    const p = video.play();
                    if (p && p.catch) p.catch(() => {});
                }
            } else if (distance === 1) {
                // Immediate left/right cards (Distorted, dark, desaturated)
                cell.style.filter = 'blur(4px) brightness(0.5) saturate(0.2)';
                if (video) video.pause();
            } else {
                // Back cards (Heavy distortion)
                cell.style.filter = 'blur(8px) brightness(0.2) saturate(0)';
                if (video) video.pause();
            }
        });
    }

    function rotateCarousel(steps) {
        currentRotation -= steps * theta;
        activeIndex = (activeIndex + steps) % numberOfFaces;
        if (activeIndex < 0) activeIndex += numberOfFaces;
        
        carousel.style.transform = `rotateY(${currentRotation}deg)`;
        updateDots();
        updateBackground();
        updateCardsVisuals();
    }

    // Initialize initial state
    updateBackground();
    updateCardsVisuals();

    // Arrow events
    prevBtn.addEventListener('click', () => rotateCarousel(-1));
    nextBtn.addEventListener('click', () => rotateCarousel(1));

    // Optional: Infinite auto-spin with intervals if the user still wants it spinning by itself
    let autoSpin = setInterval(() => rotateCarousel(1), 4000);

    // Pause auto-spin on hover
    document.querySelector('.hero-carousel-container').addEventListener('mouseenter', () => clearInterval(autoSpin));
    document.querySelector('.hero-carousel-container').addEventListener('mouseleave', () => {
        autoSpin = setInterval(() => rotateCarousel(1), 4000);
    });

    // Swipe táctil (móvil): mover el carrusel arrastrando con el dedo
    let touchStartX = 0;
    let touchMoved = false;
    const scene = document.querySelector('.scene');

    scene.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchMoved = false;
        clearInterval(autoSpin);
    }, { passive: true });

    scene.addEventListener('touchmove', () => {
        touchMoved = true;
    }, { passive: true });

    scene.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const diffX = touchEndX - touchStartX;
        const SWIPE_THRESHOLD = 40;

        if (touchMoved && Math.abs(diffX) > SWIPE_THRESHOLD) {
            if (diffX < 0) {
                rotateCarousel(1); // deslizó a la izquierda -> siguiente
            } else {
                rotateCarousel(-1); // deslizó a la derecha -> anterior
            }
        }

        autoSpin = setInterval(() => rotateCarousel(1), 4000);
    });
}

document.querySelector('.close-tooltip').addEventListener('click', (e) => {
    e.target.parentElement.style.display = 'none';
});

// Sticky Navbar effect on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Detecta celular real aunque el navegador tenga activado "Sitio de escritorio"
// (que engaña el ancho de pantalla, pero no puede fingir que hay un mouse)
function isMobileDevice() {
    return window.matchMedia('(max-width: 768px)').matches ||
        window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 1024px)').matches;
}

// Botón flotante de WhatsApp: en móvil, recién aparece cuando el usuario empieza a deslizar
const fabContainer = document.querySelector('.fab-container');
window.addEventListener('scroll', () => {
    if (!isMobileDevice()) return;
    fabContainer.classList.toggle('is-visible', window.scrollY > 50);
});

// Agregar modal de video global
const modalHtml = `
<div id="videoModal" class="video-modal">
    <p class="video-modal-rotate-hint">📱 Gira tu celular para ver el video en pantalla completa</p>
    <button onclick="closeVideoModal()" class="video-modal-close">&times;</button>
    <video id="modalVideo" class="video-modal-video" controls autoplay playsinline></video>
</div>
`;
document.body.insertAdjacentHTML('beforeend', modalHtml);

window.openVideoModal = function(url) {
    const modal = document.getElementById('videoModal');
    const video = document.getElementById('modalVideo');
    const ligera = versionModal(url);
    // Si la version convertida fallara, se cae al archivo original. Solo una
    // vez: al cerrar el modal se vacia el src, y eso tambien dispara 'error'.
    // Sin esta guarda, el video se volvia a cargar solo y seguia sonando.
    let yaReintento = false;
    video.onerror = function() {
        if (!video.getAttribute('src')) return; // cierre del modal, no es fallo
        if (yaReintento) return;
        yaReintento = true;
        video.src = url;
        video.play();
    };
    video.src = ligera;
    modal.style.display = 'flex';
    video.play();
}

window.closeVideoModal = function() {
    const modal = document.getElementById('videoModal');
    const video = document.getElementById('modalVideo');
    modal.style.display = 'none';
    video.onerror = null;          // que cerrar no se confunda con un fallo
    video.pause();
    video.removeAttribute('src');
    video.load();                  // corta la descarga y suelta el sonido
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// En móvil: al girar el celular a horizontal con el modal de video abierto,
// poner el video en pantalla completa automáticamente
function requestVideoFullscreen(video) {
    if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen(); // iOS Safari (solo funciona sobre el <video>)
    } else if (video.requestFullscreen) {
        video.requestFullscreen().catch(() => {});
    } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
    }
}

// Igual que isMobileDevice(), pero usando la dimensión más chica porque al
// rotar el celular el ancho y alto se intercambian
function isMobileScreen() {
    return Math.min(window.innerWidth, window.innerHeight) <= 768 ||
        window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

const landscapeQuery = window.matchMedia('(orientation: landscape)');
landscapeQuery.addEventListener('change', (e) => {
    const modal = document.getElementById('videoModal');
    const video = document.getElementById('modalVideo');
    if (!isMobileScreen() || modal.style.display !== 'flex') return;

    if (e.matches) {
        requestVideoFullscreen(video); // Funciona directo en algunos navegadores
    } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
});

// Algunos navegadores exigen que el fullscreen lo dispare un toque directo del
// usuario (no basta con el evento de rotación). Si eso pasa, tocar el video
// estando en horizontal lo manda a pantalla completa como respaldo.
document.getElementById('modalVideo').addEventListener('click', () => {
    const modal = document.getElementById('videoModal');
    const video = document.getElementById('modalVideo');
    if (isMobileScreen() && landscapeQuery.matches && modal.style.display === 'flex' && !document.fullscreenElement) {
        requestVideoFullscreen(video);
    }
});

// Reveal on scroll: fade + slide-in moderno para las secciones
function initScrollReveal() {
    document.querySelectorAll('.section-header, .services-grid, .benefits-grid, .cta-section')
        .forEach(el => el.classList.add('reveal'));
    document.querySelectorAll('.services-grid, .benefits-grid')
        .forEach(el => el.classList.add('reveal-stagger'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}
initScrollReveal();

loadDataAndInit();
