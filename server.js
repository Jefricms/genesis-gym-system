const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // Indispensable para leer req.body

const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'genesis_gym',
    port: 3306
});

db.connect((err) => {
    if (err) console.error("❌ Error de conexión a MySQL:", err);
    else console.log("¡Conectado exitosamente a MySQL en XAMPP!");
});

// --- AUTENTICACIÓN INDIVIDUALIZADA ---

// 1. Registro (Sincronizado con /api/register del HTML y campos reales de tu BD)
app.post('/api/register', (req, res) => {
    const { nombre, email } = req.body;

    if (!nombre || !email) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Generar campos automáticos según tu phpMyAdmin
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const primerNombre = nombre.split(' ')[0].toUpperCase();
    const codigoMiembro = `IFG-${randomNum}-${primerNombre}`;
    const hoy = new Date().toISOString().split('T')[0];

    const query = 'INSERT INTO usuarios (nombre, email, miembro_desde, codigo_miembro) VALUES (?, ?, ?, ?)';
    db.query(query, [nombre, email, hoy, codigoMiembro], (err, result) => {
        if (err) {
            console.error(err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'El correo electrónico ya existe.' });
            }
            return res.status(500).json({ error: 'Error interno de base de datos' });
        }
        res.json({
            success: true,
            user: { id: result.insertId, name: nombre, email: email, memberSince: hoy, memberId: codigoMiembro }
        });
    });
});

// 2. Login (Corregido con LOWER y campos correctos)
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

// 6. Guardar tarjeta del usuario activo
app.post('/api/metodos', (req, res) => {
    const { usuario_id, type, brand, last4, expiry, phone, holder } = req.body;
    if (!usuario_id || !type) return res.status(400).json({ error: 'usuario_id y type son requeridos' });

    console.log('POST /api/metodos recibido:', { usuario_id, type, last4, phone });

    // Determinar criterio de duplicado según tipo
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
        // criterio genérico: evitar duplicados exactos por campo holder + tipo
        selectQuery = 'SELECT id FROM metodos_pago WHERE usuario_id = ? AND tipo = ? AND titular_nombre = ?';
        selectParams = [usuario_id, type, holder || null];
    }

    db.query(selectQuery, selectParams, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) {
            // Ya existe: devolver éxito indicando que es existente
            return res.json({ success: true, existing: true, id: results[0].id });
        }

        // No existe: insertar sin campo id (dejar que la BD cree el id)
        const insertQuery = `
            INSERT INTO metodos_pago (usuario_id, tipo, tarjeta_marca, tarjeta_ultimos4, tarjeta_expiracion, yape_telefono, titular_nombre)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
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
            return res.json({ success: true, existing: false, id: result.insertId });
        });
    });
});

app.listen(5000, () => console.log('Servidor corriendo de forma asíncrona en el puerto 5000'));