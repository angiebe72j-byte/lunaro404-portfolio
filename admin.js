
// ---------------------------------------------------------------
// Comprime el video en el propio navegador antes de subirlo.
// Reproduce el archivo en un canvas reducido y lo vuelve a grabar con
// MediaRecorder. Asi un video de 118 MB llega a Cloudinary pesando 3 o 4 MB,
// sin que haya que preparar nada a mano y sin herramientas externas.
// ---------------------------------------------------------------
function comprimirVideo(archivo, alAvanzar) {
    return new Promise((resolve, reject) => {
        if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
            return reject(new Error('Tu navegador no puede comprimir videos. Usa Chrome.'));
        }

        const video = document.createElement('video');
        video.muted = true;      // no suena mientras comprime
        video.volume = 0;
        video.playsInline = true;
        video.src = URL.createObjectURL(archivo);

        video.onerror = () => reject(new Error('No se pudo leer el video.'));

        video.onloadedmetadata = () => {
            const ANCHO_MAX = 1280;
            const escala = Math.min(1, ANCHO_MAX / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(video.videoWidth * escala / 2) * 2;
            canvas.height = Math.round(video.videoHeight * escala / 2) * 2;
            const ctx = canvas.getContext('2d');

            // Imagen desde el canvas reducido, sonido desde el video original.
            // Se juntan en un solo stream para que el archivo salga con audio.
            const stream = canvas.captureStream(30);
            let pistasAudio = [];
            try {
                const delVideo = video.captureStream ? video.captureStream()
                               : (video.mozCaptureStream ? video.mozCaptureStream() : null);
                if (delVideo) pistasAudio = delVideo.getAudioTracks();
            } catch (e) { /* si no se puede, sigue sin audio */ }

            const mezcla = new MediaStream([
                ...stream.getVideoTracks(),
                ...pistasAudio
            ]);

            const conAudio = pistasAudio.length > 0;
            const tipos = conAudio
                ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
                : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
            const tipo = tipos.find(t => MediaRecorder.isTypeSupported(t));
            if (!tipo) return reject(new Error('Tu navegador no soporta la grabación.'));

            const opciones = { mimeType: tipo, videoBitsPerSecond: 1400000 };
            if (conAudio) opciones.audioBitsPerSecond = 96000;
            const rec = new MediaRecorder(mezcla, opciones);
            const trozos = [];
            rec.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
            rec.onerror = () => reject(new Error('Falló la compresión.'));
            rec.onstop = () => {
                URL.revokeObjectURL(video.src);
                const blob = new Blob(trozos, { type: 'video/webm' });
                const nombre = archivo.name.replace(/\.[^.]+$/, '') + '-web.webm';
                resolve(new File([blob], nombre, { type: 'video/webm' }));
            };

            let corriendo = true;
            function dibujar() {
                if (!corriendo) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                if (video.duration) alAvanzar(Math.min(99, video.currentTime / video.duration * 100));
                requestAnimationFrame(dibujar);
            }

            video.onended = () => { corriendo = false; alAvanzar(100); setTimeout(() => rec.stop(), 250); };

            rec.start(1000);
            video.play().then(dibujar).catch(reject);
        };
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const addProjectForm = document.getElementById('addProjectForm');
    const projectsTableBody = document.getElementById('projectsTableBody');
    const submitBtn = document.getElementById('submitBtn');
    const formTitle = document.getElementById('formTitle');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const editIdInput = document.getElementById('editId');
    const mediaFileInput = document.getElementById('mediaFile');
    const fileHelperText = document.getElementById('fileHelperText');
    const fileUploadText = document.getElementById('fileUploadText');
    const fileUploadFilename = document.getElementById('fileUploadFilename');

    // --- Modal de confirmación reutilizable ---
    const confirmOverlay = document.getElementById('confirmOverlay');
    const confirmIcon = document.getElementById('confirmIcon');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const confirmAcceptBtn = document.getElementById('confirmAcceptBtn');

    const ICONS = {
        save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
    };

    function askConfirm({ title, message, tone = 'save', acceptText = 'Confirmar' }) {
        return new Promise((resolve) => {
            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmAcceptBtn.textContent = acceptText;
            confirmIcon.innerHTML = ICONS[tone];

            if (tone === 'danger') {
                confirmIcon.style.background = 'rgba(255, 60, 60, 0.12)';
                confirmIcon.style.color = '#ff4d4d';
                confirmAcceptBtn.style.background = '#ff4d4d';
            } else {
                confirmIcon.style.background = 'rgba(77, 166, 255, 0.12)';
                confirmIcon.style.color = '#4da6ff';
                confirmAcceptBtn.style.background = '#4da6ff';
            }

            confirmOverlay.classList.add('is-open');

            function cleanup(result) {
                confirmOverlay.classList.remove('is-open');
                confirmAcceptBtn.removeEventListener('click', onAccept);
                confirmCancelBtn.removeEventListener('click', onCancel);
                confirmOverlay.removeEventListener('click', onOverlayClick);
                resolve(result);
            }
            function onAccept() { cleanup(true); }
            function onCancel() { cleanup(false); }
            function onOverlayClick(e) { if (e.target === confirmOverlay) cleanup(false); }

            confirmAcceptBtn.addEventListener('click', onAccept);
            confirmCancelBtn.addEventListener('click', onCancel);
            confirmOverlay.addEventListener('click', onOverlayClick);
        });
    }

    // --- Vista previa en vivo de la tarjeta ---
    const previewCell = document.getElementById('previewCell');
    const previewVideo = document.getElementById('previewVideo');
    const previewNoVideo = document.getElementById('previewNoVideo');
    const previewTitle = document.getElementById('previewTitle');
    const previewArtist = document.getElementById('previewArtist');
    const previewCategory = document.getElementById('previewCategory');
    const titleInput = document.getElementById('title');
    const artistInput = document.getElementById('artist');
    const shazamsInput = document.getElementById('shazams');
    const bgColorInput = document.getElementById('bgColor');

    function updatePreviewText() {
        previewTitle.textContent = titleInput.value || 'Nombre del Proyecto';
        previewArtist.textContent = artistInput.value || 'Cliente';
        previewCategory.textContent = shazamsInput.value || 'Categoría';
        previewCell.style.backgroundColor = bgColorInput.value;
    }
    [titleInput, artistInput, shazamsInput, bgColorInput].forEach(input => {
        input.addEventListener('input', updatePreviewText);
    });

    mediaFileInput.addEventListener('change', () => {
        if (mediaFileInput.files.length > 0) {
            const file = mediaFileInput.files[0];
            previewVideo.src = URL.createObjectURL(file);
            previewVideo.style.display = 'block';
            previewNoVideo.style.display = 'none';

            fileUploadText.textContent = 'Video seleccionado';
            fileUploadFilename.textContent = file.name;
        } else {
            fileUploadText.textContent = 'Seleccionar video';
            fileUploadFilename.textContent = 'MP4 o WEBM';
        }
    });

    function setPreviewVideoUrl(url) {
        if (url) {
            previewVideo.src = url;
            previewVideo.style.display = 'block';
            previewNoVideo.style.display = 'none';
        } else {
            previewVideo.removeAttribute('src');
            previewVideo.style.display = 'none';
            previewNoVideo.style.display = 'block';
        }
    }

    function resetFileUploadButton() {
        fileUploadText.textContent = 'Seleccionar video';
        fileUploadFilename.textContent = 'MP4 o WEBM';
    }

    updatePreviewText();

    // Variable global para guardar los datos actuales
    let currentFaces = [];

    // Cargar proyectos existentes
    async function loadProjects() {
        try {
            const response = await fetch('/api/faces');
            if (!response.ok) throw new Error('Network response was not ok');
            currentFaces = await response.json();

            projectsTableBody.innerHTML = '';
            currentFaces.forEach(face => {
                const tr = document.createElement('tr');
                tr.draggable = true;
                tr.dataset.id = face.id;
                const videoCell = face.videoUrl
                    ? `<video class="table-video-thumb" src="${face.videoUrl}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause(); this.currentTime = 0;"></video>`
                    : `<div class="table-video-empty">Sin video</div>`;

                tr.innerHTML = `
                    <td class="drag-handle" title="Arrastra para reordenar">⠿</td>
                    <td>${videoCell}</td>
                    <td><strong>${face.title}</strong></td>
                    <td>${face.artist}</td>
                    <td>
                        <div style="width: 20px; height: 20px; background-color: ${face.bgColor}; border-radius: 4px; display: inline-block; vertical-align: middle;"></div>
                        ${face.bgColor}
                    </td>
                    <td>
                        <button class="edit-btn" onclick="startEdit('${face.id}')">Editar</button>
                        <button class="action-btn" onclick="deleteProject('${face.id}')">Eliminar</button>
                    </td>
                `;
                projectsTableBody.appendChild(tr);
            });
            initDragToReorder();
        } catch (error) {
            console.error("Error cargando proyectos:", error);
            projectsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #ff4d4d;">Error al conectar con el servidor. Asegúrate de ejecutar 'node server.js'</td></tr>`;
        }
    }

    // --- Arrastrar y soltar filas para reordenar los proyectos ---
    let draggedRow = null;

    function initDragToReorder() {
        const rows = projectsTableBody.querySelectorAll('tr[draggable="true"]');

        rows.forEach(row => {
            row.addEventListener('dragstart', () => {
                draggedRow = row;
                row.classList.add('is-dragging');
            });

            row.addEventListener('dragend', async () => {
                row.classList.remove('is-dragging');
                projectsTableBody.querySelectorAll('tr').forEach(r => {
                    r.classList.remove('drag-over-top', 'drag-over-bottom');
                });
                draggedRow = null;
                await saveNewOrder();
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!draggedRow || draggedRow === row) return;

                const rect = row.getBoundingClientRect();
                const isAfter = (e.clientY - rect.top) > rect.height / 2;

                row.classList.toggle('drag-over-bottom', isAfter);
                row.classList.toggle('drag-over-top', !isAfter);
            });

            row.addEventListener('dragleave', () => {
                row.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!draggedRow || draggedRow === row) return;

                const rect = row.getBoundingClientRect();
                const isAfter = (e.clientY - rect.top) > rect.height / 2;

                row.classList.remove('drag-over-top', 'drag-over-bottom');
                row.insertAdjacentElement(isAfter ? 'afterend' : 'beforebegin', draggedRow);
            });
        });
    }

    async function saveNewOrder() {
        const order = Array.from(projectsTableBody.querySelectorAll('tr[draggable="true"]'))
            .map(row => row.dataset.id);

        try {
            await fetch('/api/faces/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order })
            });
        } catch (error) {
            console.error('Error guardando el nuevo orden:', error);
        }
    }

    // Agregar o Actualizar proyecto
    addProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editingId = editIdInput.value;

        const confirmed = await askConfirm({
            title: editingId ? '¿Actualizar proyecto?' : '¿Guardar proyecto?',
            message: editingId
                ? 'Se sobrescribirán los datos de este proyecto en tu portafolio.'
                : 'Este proyecto se agregará a tu portafolio y quedará visible para tus clientes.',
            tone: 'save',
            acceptText: editingId ? 'Actualizar' : 'Guardar'
        });
        if (!confirmed) return;

        submitBtn.textContent = 'Guardando...';
        submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('title', document.getElementById('title').value);
        formData.append('artist', document.getElementById('artist').value);
        formData.append('bgColor', document.getElementById('bgColor').value);
        formData.append('shazams', document.getElementById('shazams').value);
        formData.append('mediaType', 'file');

        if (mediaFileInput.files.length > 0) {
            formData.append('mediaFile', mediaFileInput.files[0]);
        } else if (editingId) {
            formData.append('keepExistingFile', 'true');
        }

        // Los videos pesados se comprimen aqui mismo, en el navegador, antes de
        // enviarlos. Cloudinary rechaza todo lo que pase de 100 MB, y ademas un
        // archivo liviano se sube mucho mas rapido.
        const UMBRAL = 12 * 1024 * 1024;
        const original = mediaFileInput.files[0];
        if (original && original.size > UMBRAL) {
            const barra = document.getElementById('barraCompresion');
            const relleno = document.getElementById('rellenoCompresion');
            const textoBarra = document.getElementById('textoCompresion');
            barra.hidden = false;
            const mbAntes = (original.size / 1048576).toFixed(0);
            try {
                const comprimido = await comprimirVideo(original, pct => {
                    relleno.style.width = pct + '%';
                    textoBarra.textContent = 'Comprimiendo video… ' + Math.round(pct) + '%';
                });
                const mbDespues = (comprimido.size / 1048576).toFixed(1);
                textoBarra.textContent = 'Listo: de ' + mbAntes + ' MB a ' + mbDespues + ' MB · subiendo…';
                formData.set('mediaFile', comprimido);
            } catch (e) {
                barra.hidden = true;
                alert('No se pudo comprimir el video.\n\n' + e.message +
                      '\n\nSube uno mas liviano o comprimelo con CapCut.');
                submitBtn.textContent = editingId ? 'Actualizar Proyecto' : 'Guardar Proyecto';
                submitBtn.disabled = false;
                return;
            }
        }

        try {
            let url = '/api/faces';
            let method = 'POST';

            if (editingId) {
                url = `/api/faces/${editingId}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method: method,
                body: formData
            });

            if (response.ok) {
                resetForm();
                loadProjects();
            } else {
                let detalle = '';
                try { const j = await response.json(); detalle = j.error || j.message || ''; } catch (e) {}
                alert(
                    'No se pudo guardar el proyecto.\n\n' +
                    (detalle ? 'Motivo: ' + detalle + '\n\n' : '') +
                    'Lo mas comun es que el video pese demasiado. Si supera los 100 MB, ' +
                    'comprimelo y vuelve a intentar.'
                );
            }
        } catch (error) {
            console.error("Error guardando proyecto:", error);
            alert('Error de conexión con el servidor.');
        } finally {
            const b = document.getElementById('barraCompresion');
            if (b) b.hidden = true;
            submitBtn.textContent = editingId ? 'Actualizar Proyecto' : 'Guardar Proyecto';
            submitBtn.disabled = false;
        }
    });

    function resetForm() {
        addProjectForm.reset();
        editIdInput.value = '';
        formTitle.textContent = 'Agregar Proyecto';
        submitBtn.textContent = 'Guardar Proyecto';
        cancelEditBtn.style.display = 'none';
        fileHelperText.textContent = 'Sube una grabación corta mostrando el sitio (formato .mp4 o .webm)';
        resetFileUploadButton();
        updatePreviewText();
        setPreviewVideoUrl(null);
    }

    cancelEditBtn.addEventListener('click', resetForm);

    window.startEdit = (id) => {
        const face = currentFaces.find(f => f.id === id);
        if (!face) return;

        editIdInput.value = face.id;
        document.getElementById('title').value = face.title;
        document.getElementById('artist').value = face.artist;
        document.getElementById('bgColor').value = face.bgColor;
        document.getElementById('shazams').value = face.shazams || '';

        fileHelperText.textContent = face.videoUrl
            ? 'Ya tiene un video cargado. Sube uno nuevo solo si quieres reemplazarlo.'
            : 'Sube una grabación corta mostrando el sitio (formato .mp4 o .webm)';
        resetFileUploadButton();

        updatePreviewText();
        setPreviewVideoUrl(face.videoUrl || null);

        formTitle.textContent = 'Editar Proyecto';
        submitBtn.textContent = 'Actualizar Proyecto';
        cancelEditBtn.style.display = 'block';

        document.getElementById('previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Función global para eliminar
    window.deleteProject = async (id) => {
        const face = currentFaces.find(f => f.id === id);
        const confirmed = await askConfirm({
            title: '¿Eliminar proyecto?',
            message: `"${face ? face.title : 'Este proyecto'}" se borrará de tu portafolio junto con su video. Esta acción no se puede deshacer.`,
            tone: 'danger',
            acceptText: 'Eliminar'
        });
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/faces/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                loadProjects();
            } else {
                alert('Error al eliminar');
            }
        } catch (error) {
            console.error("Error eliminando proyecto:", error);
        }
    };

    // Inicializar
    loadProjects();
});
