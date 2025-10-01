// program/backend/src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import permitsRouter from './routes/permits'; // 👈 asegúrate que la ruta sea correcta y tenga extensión .js si usas ESM
const app = express();

// Middlewares globales
app.use(cors());
app.use(helmet());
app.use(express.json()); // 👈 IMPORTANTE: esto va DESPUÉS de crear app

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    mongo: 'connected',
    redis: 'connected',
  });
});

// Monta el router en /api/permits
app.use('/api/permits', permitsRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend listening on port ${PORT}`);
});
