const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

// 1. Configuración de CORS más permisiva
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 2. Middleware de "Fuerza Bruta" para CORS
// Esto asegura que cada respuesta tenga las cabeceras necesarias, sin importar el middleware anterior
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    
    // Si es OPTIONS, responder 200 inmediatamente
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(express.json());

// 3. Conexión a Base de Datos
// 3. Conexión a Base de Datos usando las variables de Clever Cloud
const db = mysql.createConnection({
    host: process.env.MYSQL_ADDON_HOST,
    user: process.env.MYSQL_ADDON_USER,
    password: process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.MYSQL_ADDON_DB,
    port: process.env.MYSQL_ADDON_PORT || 3306
});

// --- RUTAS ---
app.post('/api/register', (req, res) => {
    // Tu lógica de registro...
});

app.post('/api/login', (req, res) => {
    // Tu lógica de login...
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));