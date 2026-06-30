const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

// 1. CONFIGURACIÓN OFICIAL Y DEPURADA DE CORS (Resuelve preflight OPTIONS de forma automática)
app.use(cors({
    origin: '*', // Da acceso libre a cualquier origen, incluyendo tu GitHub Pages
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json()); // Único middleware necesario para procesar el req.body estándar en JSON
// Forzar la respuesta a OPTIONS para el preflight
app.options('*', cors()); 

// Asegurar que el middleware de cors se aplique a todo
app.use(cors());
app.options('*', cors());

// 2. CONEXIÓN A LA BASE DE DATOS
// En lugar de escribir la contraseña, usa process.env
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
});

db.connect((err) => {
    if (err) console.error("❌ Error de conexión a MySQL en la nube:", err);
    else console.log("¡Conectado exitosamente a la base de datos en Clever Cloud!");
});

// --- AUTENTICACIÓN INDIVIDUALIZADA ---

// 1. Registro (Flujo estándar JSON limpio y mapeo doble de variables de respuesta)
app.post('/api/register', (req, res) => {
    const { nombre, email } = req.body;

    if (!nombre || !email) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Generar campos automáticos según tu lógica de negocio
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const primerNombre = nombre.split(' ')[0].toUpperCase();
    const codigoMiembro = `IFG-${randomNum}-${primerNombre}`;
    const hoy = new Date().toISOString().split('T')[0];

    // Usamos NOW() directamente para evitar fallos estrictos de formato de fecha en producción
    const query = 'INSERT INTO usuarios (nombre, email, miembro_desde, codigo_miembro) VALUES (?, ?, NOW(), ?)';
    db.query(query, [nombre, email, codigoMiembro], (err, result) => {
        if (err) {
            console.error("❌ Error al insertar usuario en MySQL:", err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'El correo electrónico ya existe.' });
            }
            return res.status(500).json({ error: 'Error interno de base de datos' });
        }

        // Estructura de respuesta compatible al 100% con los mapeos de tu frontend
        res.json({
            success: true,
            id: result.insertId,
            usuario_id: result.insertId,
            nombre: nombre,
            email: email,
            codigo_miembro: codigoMiembro,
            miembro_desde: hoy,
            user: { 
                id: result.insertId, 
                usuario_id: result.insertId,
                name: nombre, 
                nombre: nombre,
                email: email, 
                memberSince: hoy, 
                miembro_desde: hoy,
                memberId: codigoMiembro,
                codigo_miembro: codigoMiembro
            }
        });
    });
});

// 2. Login (Corregido con LOWER para insensibilidad a mayúsculas)
app.post('/api/login', (req, res) => {
    const { email } = req.body;

    const query = 'SELECT id, nombre, email, miembro_desde, codigo_miembro FROM usuarios WHERE LOWER(email) = LOWER(?)';
    db.query(query, [email], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ error: "Usuario no encontrado" });

        const usuario = results[0];
        res.json({
            success: true,
            user: { id: usuario.id, name: usuario.nombre, email: usuario.email, memberSince: usuario.miembro_desde, memberId: usuario.codigo_miembro }
        });
    });
});

// --- HISTORIAL INDIVIDUALIZADO ---

// 3. Registrar Pago individual
app.post('/api/historial', (req, res) => {
    const { id, usuario_id, concept, amount, method, methodType } = req.body;
    
    const query = `
        INSERT INTO historial_pagos (id, usuario_id, fecha, concepto, monto, metodo_utilizado, tipo_metodo, estado) 
        VALUES (?, ?, NOW(), ?, ?, ?, ?, 'Completado')
    `;
    db.query(query, [id, usuario_id, concept, amount, method, methodType], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 4. Listar Historial individual (?usuario_id=...)
app.get('/api/historial', (req, res) => {
    const usuario_id = req.query.usuario_id;
    if (!usuario_id) return res.status(400).json({ error: "usuario_id requerido" });

    const query = 'SELECT id, fecha, concepto, monto, metodo_utilizado, tipo_metodo, estado FROM historial_pagos WHERE usuario_id = ? ORDER BY fecha DESC';
    db.query(query, [usuario_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(p => ({
            id: p.id, date: p.fecha, concept: p.concepto, amount: parseFloat(p.monto), 
            method: p.metodo_utilizado, methodType: p.tipo_metodo, status: p.estado
        })));
    });
});

// --- BILLETERA INDIVIDUALIZADA ---

// 5. Obtener tarjetas del usuario activo
app.get('/api/metodos', (req, res) => {
    const usuario_id = req.query.usuario_id;
    if (!usuario_id) return res.status(400).json({ error: "usuario_id requerido" });

    const query = 'SELECT id, tipo, tarjeta_marca, tarjeta_ultimos4, tarjeta_expiracion, yape_telefono, titular_nombre FROM metodos_pago WHERE usuario_id = ?';
    db.query(query, [usuario_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results.map(pm => ({
            id: pm.id, type: pm.tipo, brand: pm.tarjeta_marca, last4: pm.tarjeta_ultimos4, 
            expiry: pm.tarjeta_expiracion, phone: pm.yape_telefono, holder: pm.titular_nombre
        })));
    });
});

// 6. Guardar tarjeta del usuario activo (Evita duplicados)
app.post('/api/metodos', (req, res) => {
    const { id, usuario_id, type, brand, last4, expiry, phone, holder } = req.body;
    if (!usuario_id || !type) return res.status(400).json({ error: 'usuario_id y type son requeridos' });

    console.log('POST /api/metodos recibido:', { usuario_id, type, last4, phone });

    let selectQuery, selectParams;
    if (type === 'card') {
        if (!last4) return res.status(400).json({ error: 'last4 requerido para tarjetas' });
        selectQuery = 'SELECT id FROM metodos_pago WHERE usuario_id = ? AND tipo = ? AND tarjeta_ultimos4 = ?';
        selectParams = [usuario_id, type, last4];
    } else if (type === 'yape') {
        if (!phone) return res.status(400).json({ error: 'phone requerido para yape' });
        selectQuery = 'SELECT id FROM metodos_pago WHERE usuario_id = ? AND tipo = ? AND yape_telefono = ?';
        selectParams = [usuario_id, type, phone];
    } else {
        selectQuery = 'SELECT id FROM metodos_pago WHERE usuario_id = ? AND tipo = ? AND titular_nombre = ?';
        selectParams = [usuario_id, type, holder || null];
    }

    db.query(selectQuery, selectParams, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) {
            return res.json({ success: true, existing: true, id: results[0].id });
        }

        const finalId = id || null;

        const insertQuery = `
            INSERT INTO metodos_pago (id, usuario_id, tipo, tarjeta_marca, tarjeta_ultimos4, tarjeta_expiracion, yape_telefono, titular_nombre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
            finalId,
            usuario_id,
            type,
            type === 'card' ? brand : null,
            type === 'card' ? last4 : null,
            type === 'card' ? expiry : null,
            type === 'yape' ? phone : null,
            holder || null
        ];

        db.query(insertQuery, insertParams, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            return res.json({ success: true, existing: false, id: finalId || result.insertId });
        });
    });
});

// Clever Cloud inyecta el puerto correcto en process.env.PORT
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));


//holaa