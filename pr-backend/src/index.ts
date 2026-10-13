import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { verifyInternalSecret } from './middleware/verifyInternalSecret';
import { prIntakeRouter } from './routes/prIntake';
import { prGenerateRouter } from './routes/personalRecommendation';
import { programsRouter } from './routes/programs';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Reject all browser origins (this service is only ever called server-to-server).
// When an origin header is present, reject the request.
app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (origin) {
        callback(new Error('Not allowed by CORS: Server-to-server calls only'));
      } else {
        callback(null, true);
      }
    },
  })
);

app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ ok: true });
});

// Mount recommendation and internal routers under /api behind verifyInternalSecret
app.use('/api', verifyInternalSecret, prIntakeRouter, prGenerateRouter, programsRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app;
