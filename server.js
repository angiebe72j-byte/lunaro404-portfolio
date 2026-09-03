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

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
