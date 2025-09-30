// src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// ===== Opcional: intentos de conexión (no detienen el server si fallan)
let mongoStatus: 'connected'|'disabled'|'error' = 'disabled';
let redisStatus: 'connected'|'disabled'|'error' = 'disabled';

(async () => {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      const { default: mongoose } = await import('mongoose');
      await mongoose.connect(uri, { dbName: process.env.MONGO_DB || 'gasless' });
      mongoStatus = 'connected';
      console.log('[MongoDB] conectado');
    } catch (e) {
      mongoStatus = 'error';
      console.warn('[MongoDB] error de conexión (el backend sigue funcionando):', (e as Error).message);
    }
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(redisUrl);
      redis.on('error', () => { /* evitamos tumbar el proceso */ });
      await redis.ping();
      redisStatus = 'connected';
      console.log('[Redis] conectado');
    } catch (e) {
      redisStatus = 'error';
      console.warn('[Redis] error de conexión (el backend sigue funcionando):', (e as Error).message);
    }
  }
})().catch(() => { /* no romper arranque */ });

// ===== Rutas mínimas
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    mongo: mongoStatus,
    redis: redisStatus,
  });
});

// Ejemplo de router (si luego agregas más)
 import permitsRouter from './routes/permits';
 app.use('/api/permits', permitsRouter);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
