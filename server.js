const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// DATA_DIR apunta al disco persistente en producción (Render Disk, por ejemplo).
// En local, si no se define, usa la carpeta del proyecto como siempre.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const uploadsDir = path.join(DATA_DIR, 'uploads');

app.use(cors());
app.use(express.json());
// ---------------------------------------------------------------
// Registro de visitas propio (sin servicios externos)
// Guarda una linea por visita en visitas.jsonl dentro de DATA_DIR.
// No guarda IP ni nada que identifique a la persona: solo fecha,
// que pagina vio, de donde vino y si entro desde celular.
// ---------------------------------------------------------------
const VISITAS_FILE = path.join(DATA_DIR, 'visitas.jsonl');
const ES_BOT = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|headless/i;

function registrar(datos) {
    fs.appendFile(VISITAS_FILE, JSON.stringify(datos) + '\n', () => {});
}

app.use((req, res, next) => {
    try {
        if (req.method === 'GET') {
            const ruta = req.path || '/';
            const esPagina = ruta === '/' || /\.html?$/i.test(ruta);
            const ua = req.headers['user-agent'] || '';
            if (esPagina && !ES_BOT.test(ua) && ruta !== '/visitas.html') {
                registrar({
                    t: Date.now(),
                    tipo: 'visita',
                    ruta: ruta.slice(0, 120),
                    origen: (req.headers.referer || 'directo').slice(0, 200),
                    movil: /Mobi|Android|iPhone|iPad/i.test(ua)
                });
            }
        }
    } catch (e) { /* nunca romper el sitio por la analitica */ }
    next();
});

// Eventos desde el navegador (por ejemplo, clic en un boton de WhatsApp)
app.post('/api/evento', (req, res) => {
    try {
        const ua = req.headers['user-agent'] || '';
        if (!ES_BOT.test(ua)) {
            registrar({
                t: Date.now(),
                tipo: String(req.body && req.body.tipo || 'evento').slice(0, 40),
                ruta: String(req.body && req.body.ruta || '').slice(0, 120),
                detalle: String(req.body && req.body.detalle || '').slice(0, 80),
                movil: /Mobi|Android|iPhone|iPad/i.test(ua)
            });
        }
    } catch (e) {}
    res.json({ ok: true });
});

// Datos ya resumidos para el panel
app.get('/api/visitas', (req, res) => {
    fs.readFile(VISITAS_FILE, 'utf8', (err, txt) => {
        if (err) return res.json({ total: 0, hoy: 0, whatsapp: 0, dias: [], origenes: [], paginas: [], movil: 0 });

        const filas = txt.trim().split('\n').slice(-20000).map(l => {
            try { return JSON.parse(l); } catch (e) { return null; }
        }).filter(Boolean);

        const visitas = filas.filter(f => f.tipo === 'visita');
        const clics = filas.filter(f => f.tipo === 'whatsapp');

        const dia = ms => new Date(ms).toISOString().slice(0, 10);
        const hoy = dia(Date.now());

        const cuenta = (arr, fn) => {
            const m = {};
            arr.forEach(x => { const k = fn(x); if (k) m[k] = (m[k] || 0) + 1; });
            return Object.entries(m).sort((a, b) => b[1] - a[1]);
        };

        const limpiarOrigen = o => {
            if (!o || o === 'directo') return 'Directo';
            try {
                const h = new URL(o).hostname.replace(/^www\./, '');
                if (h.includes('lunaro404')) return 'Interno';
                if (h.includes('facebook') || h.includes('fb')) return 'Facebook';
                if (h.includes('instagram')) return 'Instagram';
                if (h.includes('google')) return 'Google';
                if (h.includes('tiktok')) return 'TikTok';
                if (h.includes('whatsapp')) return 'WhatsApp';
                return h;
            } catch (e) { return 'Directo'; }
        };

        res.json({
            total: visitas.length,
            hoy: visitas.filter(v => dia(v.t) === hoy).length,
            whatsapp: clics.length,
            movil: visitas.filter(v => v.movil).length,
            dias: cuenta(visitas, v => dia(v.t)).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30),
            origenes: cuenta(visitas, v => limpiarOrigen(v.origen)).slice(0, 10),
            paginas: cuenta(visitas, v => v.ruta === '/' ? '/ (inicio)' : v.ruta).slice(0, 10)
        });
    });
});

// Serve static files from the root directory (html, css, js)
app.use(express.static(__dirname));

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
// Los videos/imágenes subidos localmente (modo sin Cloudinary) se sirven desde aquí
app.use('/uploads', express.static(uploadsDir));

// Primer arranque sobre un disco persistente vacío: sembrar data.json desde el
// que viene en el repo, para no partir con el portafolio vacío.
if (!fs.existsSync(DATA_FILE)) {
    const seedFile = path.join(__dirname, 'data.json');
    fs.writeFileSync(DATA_FILE, fs.existsSync(seedFile) ? fs.readFileSync(seedFile) : '[]');
}

// Si hay credenciales de Cloudinary configuradas, los videos/imágenes se suben
// ahí (permanente, sobrevive a cualquier reinicio o redeploy). Si no, se guardan
// en el disco local (uploadsDir), útil para desarrollo local sin cuenta configurada.
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

let storage;
if (useCloudinary) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder: 'lunaro404',
            resource_type: 'auto' // detecta automáticamente si es video o imagen
        }
    });
    console.log('Almacenamiento de medios: Cloudinary');
} else {
    storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadsDir)
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });
    console.log('Almacenamiento de medios: disco local (sin credenciales de Cloudinary)');
}
const upload = multer({ storage: storage });

// A partir del archivo subido (por multer/Cloudinary o local), arma la URL
// pública a guardar y, si aplica, el public_id de Cloudinary para poder borrarlo después
function buildMediaFromFile(file) {
    const isVideo = file.mimetype.startsWith('video/');
    if (useCloudinary) {
        return {
            url: file.path, // Cloudinary ya da la URL segura completa (https://res.cloudinary.com/...)
            publicId: file.filename, // public_id asignado por Cloudinary, necesario para borrar
            isVideo
        };
    }
    return {
        url: 'uploads/' + file.filename,
        publicId: null,
        isVideo
    };
}

// Borra un archivo anterior, ya sea de Cloudinary o del disco local, según corresponda
function deleteOldMedia(face) {
    if (face.mediaPublicId) {
        const resourceType = face.videoUrl ? 'video' : 'image';
        cloudinary.uploader.destroy(face.mediaPublicId, { resource_type: resourceType }, () => {});
        return;
    }
    if (face.image && face.image.startsWith('uploads/')) {
        fs.unlink(path.join(DATA_DIR, face.image), () => {});
    }
    if (face.videoUrl && face.videoUrl.startsWith('uploads/')) {
        fs.unlink(path.join(DATA_DIR, face.videoUrl), () => {});
    }
}

// API to get all faces
app.get('/api/faces', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading data file:", err);
            return res.status(500).json({ error: 'Failed to read data' });
        }
        res.json(JSON.parse(data));
    });
});

// API to save a new order for the projects (drag & drop reorder)
// Debe ir ANTES de "/api/faces/:id" para que "reorder" no sea interpretado como un id
app.put('/api/faces/reorder', (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'order must be an array of ids' });
    }

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        const faces = JSON.parse(data);
        const facesById = new Map(faces.map(f => [f.id, f]));

        const reordered = order
            .map(id => facesById.get(id))
            .filter(Boolean);

        // Agrega al final cualquier proyecto que no vino en "order" (por seguridad)
        faces.forEach(f => {
            if (!order.includes(f.id)) reordered.push(f);
        });

        fs.writeFile(DATA_FILE, JSON.stringify(reordered, null, 4), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save data' });
            res.json(reordered);
        });
    });
});

// API to update an existing face
app.put('/api/faces/:id', upload.single('mediaFile'), (req, res) => {
    const idToUpdate = req.params.id;
    const { title, artist, bgColor, shazams, mediaType, externalUrl, keepExistingFile } = req.body;

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        let faces = JSON.parse(data);
        const faceIndex = faces.findIndex(f => f.id === idToUpdate);

        if (faceIndex === -1) {
            return res.status(404).json({ error: 'Face not found' });
        }

        const existingFace = faces[faceIndex];
        const updatedFace = {
            id: existingFace.id,
            title: title || existingFace.title,
            artist: artist || existingFace.artist,
            bgColor: bgColor || existingFace.bgColor,
            shazams: shazams || existingFace.shazams
        };

        if (mediaType === 'file') {
            if (req.file) {
                deleteOldMedia(existingFace);

                const media = buildMediaFromFile(req.file);
                if (media.isVideo) {
                    updatedFace.videoUrl = media.url;
                } else {
                    updatedFace.image = media.url;
                }
                if (media.publicId) updatedFace.mediaPublicId = media.publicId;
            } else if (keepExistingFile === 'true') {
                // Keep the existing file properties
                if (existingFace.videoUrl) updatedFace.videoUrl = existingFace.videoUrl;
                if (existingFace.image) updatedFace.image = existingFace.image;
                if (existingFace.mediaPublicId) updatedFace.mediaPublicId = existingFace.mediaPublicId;
            }
        } else if (mediaType === 'iframe') {
            updatedFace.iframeUrl = externalUrl;
        } else if (mediaType === 'video_url') {
            updatedFace.videoUrl = externalUrl;
        } else if (mediaType === 'image_url') {
            updatedFace.image = externalUrl;
        }

        // Clean up old files if media type was changed away from "file"
        if (mediaType !== 'file') {
            deleteOldMedia(existingFace);
        }

        faces[faceIndex] = updatedFace;

        fs.writeFile(DATA_FILE, JSON.stringify(faces, null, 4), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save data' });
            res.json(updatedFace);
        });
    });
});

// API to add a new face
app.post('/api/faces', upload.single('mediaFile'), (req, res) => {
    const { title, artist, bgColor, shazams, mediaType, externalUrl } = req.body;

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        const faces = JSON.parse(data);
        const newFace = {
            id: Date.now().toString(),
            title: title || 'Nuevo Proyecto',
            artist: artist || 'Desconocido',
            bgColor: bgColor || '#0e1e2d',
            shazams: shazams || '0'
        };

        if (mediaType === 'file' && req.file) {
            const media = buildMediaFromFile(req.file);
            if (media.isVideo) {
                newFace.videoUrl = media.url;
            } else {
                newFace.image = media.url;
            }
            if (media.publicId) newFace.mediaPublicId = media.publicId;
        } else if (mediaType === 'iframe') {
            newFace.iframeUrl = externalUrl;
        } else if (mediaType === 'video_url') {
            newFace.videoUrl = externalUrl;
        } else if (mediaType === 'image_url') {
            newFace.image = externalUrl;
        }

        faces.push(newFace);

        fs.writeFile(DATA_FILE, JSON.stringify(faces, null, 4), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save data' });
            res.status(201).json(newFace);
        });
    });
});

// API to delete a face
app.delete('/api/faces/:id', (req, res) => {
    const idToDelete = req.params.id;
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        let faces = JSON.parse(data);
        const faceIndex = faces.findIndex(f => f.id === idToDelete);

        if (faceIndex === -1) {
            return res.status(404).json({ error: 'Face not found' });
        }

        deleteOldMedia(faces[faceIndex]);

        faces.splice(faceIndex, 1);

        fs.writeFile(DATA_FILE, JSON.stringify(faces, null, 4), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save data' });
            res.json({ success: true });
        });
    });
});

// Ruta ligera para el auto-ping: responde sin leer archivos ni tocar disco.
app.get('/salud', (req, res) => {
    res.json({ ok: true, hora: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// --- Auto-ping para que Render no apague la instancia ---
// El plan gratuito de Render duerme el servicio tras 15 minutos sin trafico,
// y despertarlo puede tardar 50 segundos o mas. Eso quema el presupuesto de
// publicidad: el visitante que llega desde un anuncio ve una pantalla en
// blanco y se va. Visitandonos cada 10 minutos, nunca se cumple ese plazo.
//
// Solo corre en produccion, cuando Render expone la URL publica en
// RENDER_EXTERNAL_URL. En local no hace nada.
const URL_PUBLICA = process.env.RENDER_EXTERNAL_URL;
const INTERVALO_PING = 10 * 60 * 1000; // 10 minutos

if (URL_PUBLICA) {
    setInterval(async () => {
        try {
            const r = await fetch(`${URL_PUBLICA}/salud`);
            console.log(`[auto-ping] ${r.status} ${new Date().toISOString()}`);
        } catch (err) {
            // Un ping fallido no debe tumbar el servidor: se reintenta solo
            // en el siguiente ciclo.
            console.warn('[auto-ping] fallo:', err.message);
        }
    }, INTERVALO_PING);

    console.log(`[auto-ping] activo cada 10 min sobre ${URL_PUBLICA}`);
} else {
    console.log('[auto-ping] inactivo (sin RENDER_EXTERNAL_URL, entorno local)');
}
